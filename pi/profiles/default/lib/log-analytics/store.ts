import fs from "node:fs/promises";
import { DuckDBInstance, StatementType, type DuckDBConnection } from "@duckdb/node-api";
import { canonicalWithin, checkCancelled } from "./profiles.js";
import { selectSources, type SelectedSource, type SourceColumn, type SourceSelection } from "./registry.js";

export type AnalyticsParameter = string | number | boolean | null;
export type AnalyticsQuery = { sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number; maxBytes?: number };
export type AnalyticsQueryCost = { filesScanned: number; bytesScanned: number; discoveryMs: number; stagingMs: number; queryMs: number };
export type AnalyticsQueryResult = { columns: readonly string[]; rows: Record<string, unknown>[]; truncated: boolean; cost: AnalyticsQueryCost };
export type AnalyticsSession = { query(request: AnalyticsQuery): Promise<AnalyticsQueryResult> };
export type AnalyticsSessionOptions = SourceSelection & { maxInputBytes?: number; timeoutMs?: number; threads?: number; memoryLimit?: string };

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
let stagingTail = Promise.resolve();
let stagingObserver: ((options: AnalyticsSessionOptions) => void | Promise<void>) | undefined;
export function setStagingObserver(observer: typeof stagingObserver): void { stagingObserver = observer; }

export function environmentInteger(name: string, fallback: number, allowZero = false): number {
	const raw = process.env[name];
	const value = raw === undefined ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(`invalid analytics ${name}`);
	return value;
}
function integer(value: number, name: string, min = 1): number {
	if (!Number.isSafeInteger(value) || value < min) throw new Error(`invalid analytics ${name}`);
	return value;
}

async function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	checkCancelled(signal);
	let abort!: () => void;
	const cancelled = new Promise<never>((_resolve, reject) => {
		abort = () => reject(new Error("analytics query was cancelled"));
		signal.addEventListener("abort", abort, { once: true });
	});
	try { return await Promise.race([promise, cancelled]); }
	finally { signal.removeEventListener("abort", abort); }
}

async function withStagingLock<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
	const previous = stagingTail;
	let release!: () => void;
	const gate = new Promise<void>(resolve => { release = resolve; });
	stagingTail = previous.catch(() => undefined).then(() => gate);
	try {
		await waitFor(previous, signal);
		checkCancelled(signal);
		return await work();
	} finally { release(); }
}

function typedExpression(column: SourceColumn): string {
	const values = column.paths.map(value => `json_extract_string(json, ${quote(value)})`);
	return `try_cast(${values.length === 1 ? values[0] : `coalesce(${values.join(", ")})`} AS ${column.type}) AS ${identifier(column.name)}`;
}

async function createView(connection: DuckDBConnection, source: SelectedSource): Promise<void> {
	const { definition, files } = source;
	// DuckDB gets the closed, already canonicalized file set, not globs or ambient roots.
	const base = files.length
		? `read_json_objects([${files.map(item => quote(item.file)).join(", ")}], format='newline_delimited', filename=true, ignore_errors=true)`
		: "(SELECT NULL::JSON AS json, NULL::VARCHAR AS filename WHERE false)";
	const metadata = files.length
		? `(VALUES ${files.map(item => `(${quote(item.file)}, ${quote(item.profile)}, ${item.sessionId === null ? "NULL" : quote(item.sessionId)})`).join(", ")})`
		: "(SELECT NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR WHERE false)";
	// Native outer timestamps are ISO strings; nested message timestamps are epoch milliseconds.
	const timestamp = `coalesce(try_cast(json_extract_string(json, '$.timestamp') AS TIMESTAMPTZ),
		try(make_timestamp_ms(try_cast(json_extract_string(json, '$.timestamp') AS BIGINT)))::TIMESTAMPTZ,
		try(make_timestamp_ms(try_cast(json_extract_string(json, '$.message.timestamp') AS BIGINT)))::TIMESTAMPTZ)`;
	const fields = [
		"meta.profile AS _profile", "filename::VARCHAR AS _source_file",
		"coalesce(nullif(json_extract_string(json, '$.id'), ''), md5(json::VARCHAR)) AS _record_key",
		`${timestamp} AS _timestamp`,
		`${definition.name === "session_entries" ? "meta.session_id" : definition.name === "bedrock_usage" ? "json_extract_string(json, '$.session')" : "NULL::VARCHAR"} AS session_id`,
		"json AS record", ...definition.columns.map(typedExpression),
	];
	await connection.run(`CREATE TABLE ${identifier(`_prepared_${definition.name}`)} AS SELECT ${fields.join(", ")}
		FROM ${base} AS data JOIN ${metadata} AS meta(file, profile, session_id) ON filename = meta.file
		WHERE json IS NOT NULL`);
	await connection.run(`CREATE VIEW ${identifier(definition.name)} AS SELECT * FROM ${identifier(`_prepared_${definition.name}`)}`);
}

async function query(instance: DuckDBInstance, request: AnalyticsQuery, signal: AbortSignal, cost: Omit<AnalyticsQueryCost, "queryMs">): Promise<AnalyticsQueryResult> {
	checkCancelled(signal);
	if (!request.sql.trim()) throw new Error("analytics SQL must not be empty");
	const maxRows = integer(request.maxRows ?? 1000, "maxRows");
	const maxBytes = integer(request.maxBytes ?? 256 * 1024, "maxBytes");
	if (maxRows > 1000 || maxBytes > 256 * 1024) throw new Error("invalid analytics output bound");
	const connection = await instance.connect();
	const cancel = () => connection.interrupt();
	signal.addEventListener("abort", cancel, { once: true });
	const started = performance.now();
	try {
		checkCancelled(signal);
		await connection.run("SET TimeZone = 'UTC'");
		const statements = await connection.extractStatements(request.sql);
		if (statements.count !== 1) throw new Error("analytics SQL requires exactly one SELECT query");
		const prepared = await statements.prepare(0);
		try {
			// DuckDB's parser/binder, not a prefix regex or a competing SQL grammar.
			// EXPLAIN ANALYZE can execute a mutation, so only SELECT statements are admitted.
			if (prepared.statementType !== StatementType.SELECT) throw new Error("analytics SQL must be a SELECT query");
			if (request.parameters) prepared.bind(request.parameters);
			checkCancelled(signal);
			const result = await prepared.stream();
			const columns = result.columnNames();
			const rows: Record<string, unknown>[] = [];
			let truncated = false;
			let bytes = 2;
			for await (const chunk of result.yieldRowObjectJson()) {
				for (const row of chunk) {
					checkCancelled(signal);
					const next = bytes + Buffer.byteLength(JSON.stringify(row)) + (rows.length ? 1 : 0);
					if (rows.length >= maxRows || next > maxBytes) { truncated = true; break; }
					rows.push(row); bytes = next;
				}
				if (truncated) break;
			}
			checkCancelled(signal);
			return { columns, rows, truncated, cost: { ...cost, queryMs: performance.now() - started } };
		} finally { prepared.destroySync(); }
	} finally {
		signal.removeEventListener("abort", cancel);
		connection.closeSync();
	}
}

export async function withAnalyticsSession<T>(options: AnalyticsSessionOptions, callback: (session: AnalyticsSession) => Promise<T>): Promise<T> {
	checkCancelled(options.signal);
	const timeoutMs = integer(options.timeoutMs ?? environmentInteger("PI_ANALYTICS_TIMEOUT_MS", 5000), "timeoutMs");
	const threads = integer(options.threads ?? environmentInteger("PI_ANALYTICS_THREADS", 2), "threads");
	const maxInputBytes = integer(options.maxInputBytes ?? environmentInteger("PI_ANALYTICS_MAX_INPUT_BYTES", 512 * 1024 * 1024, true), "maxInputBytes", 0);
	const memoryLimit = options.memoryLimit ?? process.env.PI_ANALYTICS_MEMORY_LIMIT ?? "1GB";
	if (!memoryLimit.trim()) throw new Error("invalid analytics memoryLimit");
	const controller = new AbortController();
	const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	timer.unref();
	let instance: DuckDBInstance | undefined;
	let setup: DuckDBConnection | undefined;
	const cancelSetup = () => setup?.interrupt();
	signal.addEventListener("abort", cancelSetup);
	try {
		const discoveryStarted = performance.now();
		const sources = await selectSources({ ...options, signal });
		const files = [...new Map(sources.flatMap(source => source.files).map(item => [item.file, item])).values()];
		let bytesScanned = 0;
		for (const item of files) {
			checkCancelled(signal);
			if (await canonicalWithin(item.root, item.file) !== item.file) throw new Error("analytics input changed during discovery");
			bytesScanned += (await fs.stat(item.file)).size;
		}
		if (bytesScanned > maxInputBytes) throw new Error(`analytics input ${bytesScanned} bytes exceeds bound ${maxInputBytes}`);
		const started = performance.now();
		await withStagingLock(signal, async () => {
			await stagingObserver?.(options);
			checkCancelled(signal);
			instance = await DuckDBInstance.create(":memory:", {
				enable_external_access: "true", threads: String(threads), memory_limit: memoryLimit,
				// Never spill transcript copies to a default .tmp directory or auto-install extensions.
				temp_directory: "", autoinstall_known_extensions: "false", autoload_known_extensions: "false",
			});
			setup = await instance.connect();
			await setup.run("SET TimeZone = 'UTC'");
			for (const source of sources) {
				checkCancelled(signal);
				await createView(setup, source);
			}
			checkCancelled(signal);
			await setup.run("SET enable_external_access = false");
			setup.closeSync(); setup = undefined;
		});
		const cost = { filesScanned: files.length, bytesScanned, discoveryMs: started - discoveryStarted, stagingMs: performance.now() - started };
		checkCancelled(signal);
		return await callback({ query: request => query(instance!, request, signal, cost) });
	} catch (error) {
		if (controller.signal.aborted) throw new Error(`analytics session exceeded ${timeoutMs} ms`);
		checkCancelled(options.signal);
		throw error;
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", cancelSetup);
		setup?.closeSync();
		instance?.closeSync();
	}
}
