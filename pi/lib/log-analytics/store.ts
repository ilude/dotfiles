import fs from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { discoverSourcePaths, definitionFor, registeredSources, runtimeRoots, type AnalyticsSourceId, type SourceDefinition } from "./registry.ts";

export type AnalyticsParameter = string | number | boolean | null;
export type AnalyticsQuery = { sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number; maxBytes?: number };
export type AnalyticsQueryCost = { filesScanned: number; bytesScanned: number; stagingMs: number; queryMs: number };
export type AnalyticsQueryResult = { columns: readonly string[]; rows: Record<string, unknown>[]; truncated: boolean; cost: AnalyticsQueryCost };
export type AnalyticsSession = { query(request: AnalyticsQuery): Promise<AnalyticsQueryResult> };
export type AnalyticsSessionOptions = {
	root: string;
	sources: readonly AnalyticsSourceId[];
	signal?: AbortSignal;
	selectedFiles?: Partial<Record<AnalyticsSourceId, readonly string[]>>;
	sourceRoots?: Partial<Record<AnalyticsSourceId, readonly string[]>>;
	maxInputBytes?: number;
	timeoutMs?: number;
	threads?: number;
	memoryLimit?: string;
};

type SessionDeadline = {
	timeoutMs: number;
	expired: boolean;
	connections: Set<DuckDBConnection>;
	timer: ReturnType<typeof setTimeout>;
};
type StagingObserver = (options: Readonly<{ root: string }>) => void | Promise<void>;

let stagingTail = Promise.resolve();
let stagingObserver: StagingObserver | undefined;

export function setStagingObserver(observer: StagingObserver | undefined): void {
	stagingObserver = observer;
}

function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function quoteString(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function checkSignal(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error("analytics query was cancelled"); }
function checkDeadline(deadline: SessionDeadline): void { if (deadline.expired) throw new Error(`analytics session exceeded ${deadline.timeoutMs} ms`); }
function rowBytes(row: Record<string, unknown>): number { return Buffer.byteLength(JSON.stringify(row), "utf8"); }

function positiveInteger(value: number, name: string): number {
	if (!Number.isInteger(value) || value < 1) throw new Error(`invalid analytics ${name}`);
	return value;
}

function environmentInteger(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	if (!/^\d+$/.test(raw)) throw new Error(`invalid analytics ${name}`);
	return positiveInteger(Number(raw), name);
}

function resolveSessionConfig(options: AnalyticsSessionOptions): { timeoutMs: number; threads: number; memoryLimit: string } {
	const timeoutMs = positiveInteger(options.timeoutMs ?? environmentInteger("PI_ANALYTICS_TIMEOUT_MS", 5000), "timeoutMs");
	const threads = positiveInteger(options.threads ?? environmentInteger("PI_ANALYTICS_THREADS", 2), "threads");
	const memoryLimit = options.memoryLimit ?? process.env.PI_ANALYTICS_MEMORY_LIMIT ?? "1GB";
	if (!memoryLimit.trim()) throw new Error("invalid analytics memoryLimit");
	if (options.maxInputBytes !== undefined && (!Number.isInteger(options.maxInputBytes) || options.maxInputBytes < 0)) {
		throw new Error("invalid analytics maxInputBytes");
	}
	return { timeoutMs, threads, memoryLimit };
}

function startDeadline(timeoutMs: number): SessionDeadline {
	const deadline = { timeoutMs, expired: false, connections: new Set<DuckDBConnection>() } as SessionDeadline;
	deadline.timer = setTimeout(() => {
		deadline.expired = true;
		for (const connection of deadline.connections) connection.interrupt();
	}, timeoutMs);
	deadline.timer.unref();
	return deadline;
}

async function withStagingLock<T>(work: () => Promise<T>): Promise<T> {
	const previous = stagingTail;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	stagingTail = previous.catch(() => undefined).then(() => gate);
	await previous.catch(() => undefined);
	try {
		return await work();
	} finally {
		release();
	}
}

function typedExpression(column: { name: string; type: string; paths?: readonly string[] }): string {
	const jsonName = column.name === "event_id" ? "id" : column.name;
	const paths = column.paths ?? [`$.${jsonName}`];
	const value = paths.length === 1
		? `json_extract_string(json, ${quoteString(paths[0]!)})`
		: `coalesce(${paths.map((path) => `json_extract_string(json, ${quoteString(path)})`).join(", ")})`;
	return `try_cast(${value} AS ${column.type}) AS ${quoteIdentifier(column.name)}`;
}

function filesExpression(files: readonly string[]): string {
	return `[${files.map(quoteString).join(", ")}]`;
}

async function configure(connection: DuckDBConnection): Promise<DuckDBConnection> {
	return connection;
}

async function createView(connection: DuckDBConnection, definition: SourceDefinition, files: readonly string[]): Promise<void> {
	const source = quoteIdentifier(definition.name);
	const staging = quoteIdentifier(`_prepared_${definition.name}`);
	const base = files.length
		? `read_json_objects(${filesExpression(files)}, format = 'newline_delimited', filename = true, ignore_errors = true)`
		: "(SELECT CAST(NULL AS JSON) AS json, CAST(NULL AS VARCHAR) AS filename WHERE false)";
	const fields = [
		`CAST(filename AS VARCHAR) AS ${quoteIdentifier("_source_file")}`,
		`coalesce(nullif(json_extract_string(json, '$.id'), ''), nullif(json_extract_string(json, '$.event_id'), ''), md5(CAST(json AS VARCHAR))) AS ${quoteIdentifier("_record_key")}`,
		typedExpression({ name: "_timestamp", type: "VARCHAR", paths: ["$.timestamp", "$.ts", "$.created_at", "$.occurred_at", "$.message.timestamp"] }),
		`json AS ${quoteIdentifier("record")}`,
		...definition.columns.map(typedExpression),
	];
	const predicate = definition.predicate ? ` AND (${definition.predicate})` : "";
	await connection.run(`CREATE OR REPLACE TABLE ${staging} AS SELECT ${fields.join(", ")} FROM ${base} WHERE json IS NOT NULL${predicate}`);
	await connection.run(`CREATE OR REPLACE VIEW ${source} AS SELECT * FROM ${staging}`);
}

async function selectedSources(options: AnalyticsSessionOptions): Promise<Array<{ definition: SourceDefinition; files: string[] }>> {
	const requested = [...new Set(options.sources)];
	for (const source of requested) if (!definitionFor(source)) throw new Error(`unknown analytics source: ${source}`);
	return Promise.all(requested.map(async (name) => {
		const definition = definitionFor(name);
		if (!definition) throw new Error(`unknown analytics source: ${name}`);
		const roots = options.sourceRoots?.[name] ?? runtimeRoots(options.root, name);
		const discovered = (await Promise.all(roots.map((root) => discoverSourcePaths(root, name, [root])))).flat();
		const selected = options.selectedFiles?.[name];
		const files = selected
			? discovered.filter((file) => selected.some((candidate) => path.resolve(candidate) === path.resolve(file)))
			: discovered;
		return { definition, files: [...new Set(files)].sort() };
	}));
}

async function openSession(options: AnalyticsSessionOptions): Promise<{ instance: DuckDBInstance; session: AnalyticsSession; deadline: SessionDeadline }> {
	checkSignal(options.signal);
	const config = resolveSessionConfig(options);
	const deadline = startDeadline(config.timeoutMs);
	let instance: DuckDBInstance | undefined;
	let setup: DuckDBConnection | undefined;
	try {
		const sources = await selectedSources(options);
		checkSignal(options.signal);
		checkDeadline(deadline);
		const files = [...new Set(sources.flatMap((source) => source.files))];
		const fileStats = await Promise.all(files.map((file) => fs.stat(file)));
		const bytesScanned = fileStats.reduce((total, stat) => total + stat.size, 0);
		if (options.maxInputBytes !== undefined && bytesScanned > options.maxInputBytes) {
			throw new Error(`analytics input ${bytesScanned} bytes exceeds bound ${options.maxInputBytes}`);
		}
		checkSignal(options.signal);
		checkDeadline(deadline);
		instance = await DuckDBInstance.create(":memory:", {
			enable_external_access: "true",
			threads: String(config.threads),
			memory_limit: config.memoryLimit,
		});
		setup = await instance.connect();
		deadline.connections.add(setup);
		const stagingStarted = performance.now();
		await withStagingLock(async () => {
			checkSignal(options.signal);
			checkDeadline(deadline);
			await stagingObserver?.({ root: options.root });
			for (const source of sources) {
				checkSignal(options.signal);
				checkDeadline(deadline);
				await createView(setup!, source.definition, source.files);
			}
		});
		const stagingMs = performance.now() - stagingStarted;
		checkDeadline(deadline);
		await setup.run("SET enable_external_access = false");
		deadline.connections.delete(setup);
		setup.closeSync();
		setup = undefined;
		const cost = { filesScanned: files.length, bytesScanned, stagingMs };
		const session: AnalyticsSession = {
			query: (request) => query(instance!, request, options.signal, deadline, cost),
		};
		return { instance, session, deadline };
	} catch (error) {
		if (setup) {
			deadline.connections.delete(setup);
			setup.closeSync();
		}
		instance?.closeSync();
		clearTimeout(deadline.timer);
		if (deadline.expired) throw new Error(`analytics session exceeded ${deadline.timeoutMs} ms`);
		throw error;
	}
}

async function query(
	instance: DuckDBInstance,
	request: AnalyticsQuery,
	sessionSignal: AbortSignal | undefined,
	deadline: SessionDeadline,
	cost: Omit<AnalyticsQueryCost, "queryMs">,
): Promise<AnalyticsQueryResult> {
	checkSignal(sessionSignal);
	checkDeadline(deadline);
	if (!request.sql.trim()) throw new Error("analytics SQL must not be empty");
	if (!/^\s*(?:WITH|SELECT|EXPLAIN)\b/i.test(request.sql)) throw new Error("analytics SQL must be a query");
	const maxRows = request.maxRows ?? 1000;
	const maxBytes = request.maxBytes ?? 256 * 1024;
	if (!Number.isInteger(maxRows) || maxRows < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("invalid analytics output bound");
	const connection = await configure(await instance.connect());
	deadline.connections.add(connection);
	let settled = false;
	const cancel = () => { if (!settled) connection.interrupt(); };
	sessionSignal?.addEventListener("abort", cancel, { once: true });
	const queryStarted = performance.now();
	try {
		checkDeadline(deadline);
		const result = await connection.stream(request.sql, request.parameters ?? undefined);
		const columns = result.columnNames();
		const rows: Record<string, unknown>[] = [];
		let truncated = false;
		let encodedBytes = 2;
		for await (const chunk of result.yieldRowObjectJson()) {
			for (const row of chunk) {
				checkSignal(sessionSignal);
				checkDeadline(deadline);
				const bytes = rowBytes(row);
				const nextBytes = encodedBytes + bytes + (rows.length > 0 ? 1 : 0);
				if (rows.length >= maxRows || nextBytes > maxBytes) { truncated = true; break; }
				rows.push(row);
				encodedBytes = nextBytes;
			}
			if (truncated) break;
		}
		checkDeadline(deadline);
		return { columns, rows, truncated, cost: { ...cost, queryMs: performance.now() - queryStarted } };
	} catch (error) {
		if (deadline.expired) throw new Error(`analytics session exceeded ${deadline.timeoutMs} ms`);
		throw error;
	} finally {
		settled = true;
		sessionSignal?.removeEventListener("abort", cancel);
		deadline.connections.delete(connection);
		connection.closeSync();
	}
}

export async function withAnalyticsSession<T>(options: AnalyticsSessionOptions, callback: (session: AnalyticsSession) => Promise<T>): Promise<T> {
	const opened = await openSession(options);
	try { return await callback(opened.session); }
	finally {
		clearTimeout(opened.deadline.timer);
		opened.instance.closeSync();
	}
}

export function analyticsCatalog(): Array<{ source: AnalyticsSourceId; view: string; columns: readonly { name: string; type: string }[]; hint: string }> {
	return registeredSources.map((source) => ({
		source: source.name,
		view: source.name,
		columns: [
			{ name: "_source_file", type: "VARCHAR" },
			{ name: "_record_key", type: "VARCHAR" },
			{ name: "_timestamp", type: "VARCHAR" },
			{ name: "record", type: "JSON" },
			...source.columns,
		],
		hint: `SELECT * FROM ${quoteIdentifier(source.name)} WHERE _timestamp >= ? ORDER BY _timestamp`,
	}));
}

export type { AnalyticsSourceId, SourceDefinition };
