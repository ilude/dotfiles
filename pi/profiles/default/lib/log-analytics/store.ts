import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DuckDBInstance, StatementType, type DuckDBConnection } from "@duckdb/node-api";
import { canonicalWithin, checkCancelled } from "./profiles.js";
import { selectSources, type SelectedSource, type SourceColumn, type SourceSelection } from "./registry.js";

export type AnalyticsParameter = string | number | boolean | null;
export type AnalyticsExecution = "standard" | "large";
export type AnalyticsQuery = { sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number; maxBytes?: number };
export type AnalyticsQueryCost = {
	execution?: AnalyticsExecution; filesScanned: number; bytesScanned: number; discoveryMs: number; stagingMs: number; queryMs: number;
	memoryLimit?: string; threads?: number; deadlineMs?: number; recordsStaged?: number; malformedRecords?: number;
	peakOwnedDiskBytes?: number; diskBudgetBytes?: number;
};
export type AnalyticsQueryResult = { columns: readonly string[]; rows: Record<string, unknown>[]; truncated: boolean; cost: AnalyticsQueryCost };
export type AnalyticsSession = { query(request: AnalyticsQuery): Promise<AnalyticsQueryResult> };
export type AnalyticsSessionOptions = SourceSelection & {
	execution?: AnalyticsExecution; maxInputBytes?: number; timeoutMs?: number; threads?: number; memoryLimit?: string; diskBudgetBytes?: number;
};

type ResourceTracker = { ownedPath: string; diskBudgetBytes: number; peakOwnedDiskBytes: number; resourceError?: Error };
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
let stagingTail = Promise.resolve();
let stagingObserver: ((options: AnalyticsSessionOptions) => void | Promise<void>) | undefined;
let temporaryStorageObserver: ((ownedPath: string) => void | Promise<void>) | undefined;
export function setStagingObserver(observer: typeof stagingObserver): void { stagingObserver = observer; }
/** Test/runtime observability only; callers never choose the owned path. */
export function setTemporaryStorageObserver(observer: typeof temporaryStorageObserver): void { temporaryStorageObserver = observer; }

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
	try { await waitFor(previous, signal); checkCancelled(signal); return await work(); }
	finally { release(); }
}
function typedExpression(column: SourceColumn): string {
	const values = column.paths.map(value => `json_extract_string(json, ${quote(value)})`);
	return `try_cast(${values.length === 1 ? values[0] : `coalesce(${values.join(", ")})`} AS ${column.type}) AS ${identifier(column.name)}`;
}
function preparedFields(source: SelectedSource, profile = "meta.profile", filename = "filename::VARCHAR", sessionId = "meta.session_id"): string[] {
	const { definition } = source;
	const timestamp = `coalesce(try_cast(json_extract_string(json, '$.timestamp') AS TIMESTAMPTZ),
		try(make_timestamp_ms(try_cast(json_extract_string(json, '$.timestamp') AS BIGINT)))::TIMESTAMPTZ,
		try(make_timestamp_ms(try_cast(json_extract_string(json, '$.message.timestamp') AS BIGINT)))::TIMESTAMPTZ)`;
	return [
		`${profile} AS _profile`, `${filename} AS _source_file`,
		"coalesce(nullif(json_extract_string(json, '$.id'), ''), md5(json::VARCHAR)) AS _record_key", `${timestamp} AS _timestamp`,
		`${definition.name === "session_entries" ? sessionId : definition.name === "bedrock_usage" ? "json_extract_string(json, '$.session')" : "NULL::VARCHAR"} AS session_id`,
		"json AS record", ...definition.columns.map(typedExpression),
	];
}
async function createStandardView(connection: DuckDBConnection, source: SelectedSource): Promise<void> {
	const { definition, files } = source;
	const base = files.length
		? `read_json_objects([${files.map(item => quote(item.file)).join(", ")}], format='newline_delimited', filename=true, ignore_errors=true)`
		: "(SELECT NULL::JSON AS json, NULL::VARCHAR AS filename WHERE false)";
	const metadata = files.length
		? `(VALUES ${files.map(item => `(${quote(item.file)}, ${quote(item.profile)}, ${item.sessionId === null ? "NULL" : quote(item.sessionId)})`).join(", ")})`
		: "(SELECT NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR WHERE false)";
	await connection.run(`CREATE TABLE ${identifier(`_prepared_${definition.name}`)} AS SELECT ${preparedFields(source).join(", ")}
		FROM ${base} AS data JOIN ${metadata} AS meta(file, profile, session_id) ON filename = meta.file WHERE json IS NOT NULL`);
	await connection.run(`CREATE VIEW ${identifier(definition.name)} AS SELECT * FROM ${identifier(`_prepared_${definition.name}`)}`);
}

const READ_BUFFER_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
async function* jsonLines(file: string, signal: AbortSignal): AsyncGenerator<{ json: string; bytes: number } | null> {
	const handle = await fs.open(file, "r");
	let position = 0, length = 0, oversized = false, parts: Buffer[] = [];
	try {
		for (;;) {
			checkCancelled(signal);
			const chunk = Buffer.alloc(READ_BUFFER_BYTES); const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
			if (!bytesRead) break;
			const data = chunk.subarray(0, bytesRead); let begin = 0;
			for (let i = 0; i < data.length; i++) if (data[i] === 10) {
				const part = data.subarray(begin, i); length += part.length;
				if (length > MAX_RECORD_BYTES) oversized = true; else if (part.length) parts.push(part);
				if (length) {
					if (oversized) yield null;
					else { const raw = Buffer.concat(parts).toString("utf8"); try { JSON.parse(raw); yield { json: raw, bytes: length }; } catch { yield null; } }
				}
				length = 0; oversized = false; parts = []; begin = i + 1;
			}
			const tail = data.subarray(begin); length += tail.length;
			if (length > MAX_RECORD_BYTES) { oversized = true; parts = []; } else if (tail.length) parts.push(tail);
			position += bytesRead;
		}
		if (length) {
			if (oversized) yield null;
			else { const raw = Buffer.concat(parts).toString("utf8"); try { JSON.parse(raw); yield { json: raw, bytes: length }; } catch { yield null; } }
		}
	} finally { await handle.close(); }
}
async function treeBytes(root: string): Promise<number> {
	let total = 0; let entries: import("node:fs").Dirent[];
	try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return 0; }
	for (const entry of entries) {
		const item = path.join(root, entry.name);
		try { if (entry.isDirectory()) total += await treeBytes(item); else total += (await fs.stat(item)).size; }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
	}
	return total;
}
async function checkDisk(tracker: ResourceTracker): Promise<void> {
	if (tracker.resourceError) throw tracker.resourceError;
	const bytes = await treeBytes(tracker.ownedPath); tracker.peakOwnedDiskBytes = Math.max(tracker.peakOwnedDiskBytes, bytes);
	if (bytes > tracker.diskBudgetBytes) throw new Error(`analytics large execution owned disk ${bytes} bytes exceeds bound ${tracker.diskBudgetBytes}`);
}
function resourceFailure(error: unknown, tracker: ResourceTracker | undefined): unknown {
	if (!tracker || !(error instanceof Error) || error.message.startsWith("analytics large execution owned disk")) return error;
	return /out of memory|temp(?:orary)? directory|no space|disk full/i.test(error.message)
		? new Error(`analytics large execution resource limit (memory and owned disk ${tracker.diskBudgetBytes} bytes): ${error.message}`)
		: error;
}
async function createLargeView(connection: DuckDBConnection, source: SelectedSource, signal: AbortSignal, tracker: ResourceTracker, counters: { records: number; malformed: number }): Promise<void> {
	const raw = `_raw_${source.definition.name}`;
	await connection.run(`CREATE TABLE ${identifier(raw)}(profile VARCHAR, source_file VARCHAR, selected_session_id VARCHAR, json JSON)`);
	const appender = await connection.createAppender(raw); let batchRecords = 0, batchBytes = 0;
	try {
		for (const file of source.files) for await (const line of jsonLines(file.file, signal)) {
			checkCancelled(signal);
			if (!line) { counters.malformed++; continue; }
			appender.appendVarchar(file.profile); appender.appendVarchar(file.file);
			if (file.sessionId === null) appender.appendNull(); else appender.appendVarchar(file.sessionId);
			appender.appendVarchar(line.json); appender.endRow(); counters.records++; batchRecords++; batchBytes += line.bytes;
			if (batchRecords >= 1000 || batchBytes >= 8 * 1024 * 1024) { appender.flushSync(); batchRecords = 0; batchBytes = 0; await checkDisk(tracker); }
		}
		appender.flushSync();
	} finally { appender.closeSync(); }
	await checkDisk(tracker);
	// Keep the invocation-owned raw table on disk and project typed fields lazily. A
	// second full JSON table briefly doubles large-input memory and defeats bounded staging.
	await connection.run(`CREATE VIEW ${identifier(source.definition.name)} AS SELECT ${preparedFields(source, "profile", "source_file", "selected_session_id").join(", ")} FROM ${identifier(raw)}`);
	await connection.run("CHECKPOINT"); await checkDisk(tracker);
}

async function query(instance: DuckDBInstance, request: AnalyticsQuery, signal: AbortSignal, baseCost: Omit<AnalyticsQueryCost, "queryMs">, tracker?: ResourceTracker): Promise<AnalyticsQueryResult> {
	checkCancelled(signal); if (!request.sql.trim()) throw new Error("analytics SQL must not be empty");
	const maxRows = integer(request.maxRows ?? 1000, "maxRows"), maxBytes = integer(request.maxBytes ?? 256 * 1024, "maxBytes");
	if (maxRows > 1000 || maxBytes > 256 * 1024) throw new Error("invalid analytics output bound");
	const connection = await instance.connect(); const cancel = () => connection.interrupt(); signal.addEventListener("abort", cancel, { once: true });
	let monitor: NodeJS.Timeout | undefined;
	if (tracker) monitor = setInterval(() => { void checkDisk(tracker).catch(error => { tracker.resourceError = error as Error; connection.interrupt(); }); }, 25);
	monitor?.unref(); const started = performance.now();
	try {
		await connection.run("SET TimeZone = 'UTC'"); const statements = await connection.extractStatements(request.sql);
		if (statements.count !== 1) throw new Error("analytics SQL requires exactly one SELECT query");
		const prepared = await statements.prepare(0);
		try {
			if (prepared.statementType !== StatementType.SELECT) throw new Error("analytics SQL must be a SELECT query");
			if (request.parameters) prepared.bind(request.parameters); checkCancelled(signal);
			const result = await prepared.stream(); const columns = result.columnNames(); const rows: Record<string, unknown>[] = [];
			let truncated = false, bytes = 2;
			for await (const chunk of result.yieldRowObjectJson()) {
				for (const row of chunk) {
					checkCancelled(signal); if (tracker?.resourceError) throw tracker.resourceError;
					const next = bytes + Buffer.byteLength(JSON.stringify(row)) + (rows.length ? 1 : 0);
					if (rows.length >= maxRows || next > maxBytes) { truncated = true; break; }
					rows.push(row); bytes = next;
				}
				if (truncated) break;
			}
			if (tracker) await checkDisk(tracker); checkCancelled(signal); if (tracker?.resourceError) throw tracker.resourceError;
			const cost: AnalyticsQueryCost = { ...baseCost, ...(tracker ? { peakOwnedDiskBytes: tracker.peakOwnedDiskBytes } : {}), queryMs: performance.now() - started };
			return { columns, rows, truncated, cost };
		} finally { prepared.destroySync(); }
	} catch (error) { if (tracker?.resourceError) throw tracker.resourceError; throw resourceFailure(error, tracker); }
	finally { if (monitor) clearInterval(monitor); signal.removeEventListener("abort", cancel); connection.closeSync(); }
}

export async function withAnalyticsSession<T>(options: AnalyticsSessionOptions, callback: (session: AnalyticsSession) => Promise<T>): Promise<T> {
	checkCancelled(options.signal); const execution = options.execution ?? "standard";
	if (execution !== "standard" && execution !== "large") throw new Error("invalid analytics execution mode");
	const defaultTimeout = execution === "large" ? environmentInteger("PI_ANALYTICS_LARGE_TIMEOUT_MS", 120_000) : environmentInteger("PI_ANALYTICS_TIMEOUT_MS", 5000);
	const timeoutMs = integer(options.timeoutMs ?? defaultTimeout, "timeoutMs");
	const threads = integer(options.threads ?? environmentInteger("PI_ANALYTICS_THREADS", 2), "threads");
	const maxInputBytes = execution === "standard" ? integer(options.maxInputBytes ?? environmentInteger("PI_ANALYTICS_MAX_INPUT_BYTES", 512 * 1024 * 1024, true), "maxInputBytes", 0) : undefined;
	const memoryLimit = options.memoryLimit ?? process.env.PI_ANALYTICS_MEMORY_LIMIT ?? "1GB"; if (!memoryLimit.trim()) throw new Error("invalid analytics memoryLimit");
	const diskBudgetBytes = execution === "large" ? integer(options.diskBudgetBytes ?? environmentInteger("PI_ANALYTICS_LARGE_DISK_BUDGET_BYTES", 4 * 1024 ** 3), "diskBudgetBytes") : undefined;
	const controller = new AbortController(); const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref();
	let instance: DuckDBInstance | undefined, setup: DuckDBConnection | undefined, ownedPath: string | undefined, tracker: ResourceTracker | undefined;
	const cancelSetup = () => setup?.interrupt(); signal.addEventListener("abort", cancelSetup);
	try {
		const discoveryStarted = performance.now(); const sources = await selectSources({ ...options, signal });
		const files = [...new Map(sources.flatMap(source => source.files).map(item => [item.file, item])).values()]; let bytesScanned = 0;
		for (const item of files) { checkCancelled(signal); if (await canonicalWithin(item.root, item.file) !== item.file) throw new Error("analytics input changed during discovery"); bytesScanned += (await fs.stat(item.file)).size; }
		if (execution === "standard" && bytesScanned > maxInputBytes!) throw new Error(`analytics input ${bytesScanned} bytes exceeds bound ${maxInputBytes}`);
		const started = performance.now(); const counters = { records: 0, malformed: 0 };
		await withStagingLock(signal, async () => {
			await stagingObserver?.(options); checkCancelled(signal);
			if (execution === "large") {
				const base = path.join(os.tmpdir(), "pi-log-analytics"); await fs.mkdir(base, { recursive: true }); ownedPath = await fs.mkdtemp(path.join(base, "invocation-"));
				await temporaryStorageObserver?.(ownedPath); const spill = path.join(ownedPath, "spill"); await fs.mkdir(spill);
				tracker = { ownedPath, diskBudgetBytes: diskBudgetBytes!, peakOwnedDiskBytes: 0 };
				instance = await DuckDBInstance.create(path.join(ownedPath, "analytics.duckdb"), { enable_external_access: "true", threads: String(threads), memory_limit: memoryLimit,
					temp_directory: spill, max_temp_directory_size: `${diskBudgetBytes}B`, autoinstall_known_extensions: "false", autoload_known_extensions: "false" });
			} else instance = await DuckDBInstance.create(":memory:", { enable_external_access: "true", threads: String(threads), memory_limit: memoryLimit,
				temp_directory: "", autoinstall_known_extensions: "false", autoload_known_extensions: "false" });
			setup = await instance.connect(); await setup.run("SET TimeZone = 'UTC'");
			if (execution === "large") await setup.run("SET preserve_insertion_order = false");
			let setupMonitor: NodeJS.Timeout | undefined;
			if (tracker) setupMonitor = setInterval(() => { void checkDisk(tracker!).catch(error => { tracker!.resourceError = error as Error; setup?.interrupt(); }); }, 25);
			setupMonitor?.unref();
			try {
				for (const source of sources) { checkCancelled(signal); if (tracker) await createLargeView(setup, source, signal, tracker, counters); else await createStandardView(setup, source); }
				if (tracker?.resourceError) throw tracker.resourceError;
				checkCancelled(signal); await setup.run("SET enable_external_access = false");
			} finally { if (setupMonitor) clearInterval(setupMonitor); }
			setup.closeSync(); setup = undefined;
		});
		const cost: Omit<AnalyticsQueryCost, "queryMs"> = { execution, filesScanned: files.length, bytesScanned, discoveryMs: started - discoveryStarted,
			stagingMs: performance.now() - started, memoryLimit, threads, deadlineMs: timeoutMs,
			...(tracker ? { recordsStaged: counters.records, malformedRecords: counters.malformed, peakOwnedDiskBytes: tracker.peakOwnedDiskBytes, diskBudgetBytes: tracker.diskBudgetBytes } : {}) };
		checkCancelled(signal); return await callback({ query: request => query(instance!, request, signal, cost, tracker) });
	} catch (error) {
		if (controller.signal.aborted) throw new Error(`analytics session exceeded ${timeoutMs} ms`); checkCancelled(options.signal); throw resourceFailure(error, tracker);
	} finally {
		clearTimeout(timer); signal.removeEventListener("abort", cancelSetup); setup?.closeSync(); instance?.closeSync();
		if (ownedPath) {
			try { await fs.rm(ownedPath, { recursive: true, force: true }); await fs.stat(ownedPath); throw new Error("path still exists"); }
			catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`analytics cleanup failed for owned path ${ownedPath}: ${error instanceof Error ? error.message : String(error)}`); }
		}
	}
}
