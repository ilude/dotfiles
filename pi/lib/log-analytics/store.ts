import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { discoverSourcePaths, definitionFor, registeredSources, runtimeRoots, type AnalyticsSourceId, type SourceDefinition } from "./registry.ts";

export type AnalyticsParameter = string | number | boolean | null;
export type AnalyticsQuery = { sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number; maxBytes?: number };
export type AnalyticsQueryResult = { columns: readonly string[]; rows: Record<string, unknown>[]; truncated: boolean };
export type AnalyticsSession = { query(request: AnalyticsQuery): Promise<AnalyticsQueryResult> };
export type AnalyticsSessionOptions = {
	root: string;
	sources: readonly AnalyticsSourceId[];
	signal?: AbortSignal;
	selectedFiles?: Partial<Record<AnalyticsSourceId, readonly string[]>>;
	sourceRoots?: Partial<Record<AnalyticsSourceId, readonly string[]>>;
};

function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function quoteString(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function checkSignal(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error("analytics query was cancelled"); }
function rowBytes(row: Record<string, unknown>): number { return Buffer.byteLength(JSON.stringify(row), "utf8"); }

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

async function openSession(options: AnalyticsSessionOptions): Promise<{ instance: DuckDBInstance; setup: DuckDBConnection; session: AnalyticsSession }> {
	checkSignal(options.signal);
	const requested = [...new Set(options.sources)];
	for (const source of requested) if (!definitionFor(source)) throw new Error(`unknown analytics source: ${source}`);
	const instance = await DuckDBInstance.create(":memory:", { enable_external_access: "true" });
	const setup = await instance.connect();
	try {
		for (const name of requested) {
			checkSignal(options.signal);
			const definition = definitionFor(name);
			if (!definition) throw new Error(`unknown analytics source: ${name}`);
			const roots = options.sourceRoots?.[name] ?? runtimeRoots(options.root, name);
			const discovered = (await Promise.all(roots.map((root) => discoverSourcePaths(root, name, [root])))).flat();
			const selected = options.selectedFiles?.[name];
			const files = selected
				? discovered.filter((file) => selected.some((candidate) => path.resolve(candidate) === path.resolve(file)))
				: discovered;
			await createView(setup, definition, [...new Set(files)].sort());
		}
		await setup.run("SET enable_external_access = false");
		setup.closeSync();
		const session: AnalyticsSession = {
			query: (request) => query(instance, request, options.signal),
		};
		return { instance, setup, session };
	} catch (error) {
		setup.closeSync();
		instance.closeSync();
		throw error;
	}
}

async function query(instance: DuckDBInstance, request: AnalyticsQuery, sessionSignal?: AbortSignal): Promise<AnalyticsQueryResult> {
	checkSignal(sessionSignal);
	if (!request.sql.trim()) throw new Error("analytics SQL must not be empty");
	if (!/^\s*(?:WITH|SELECT|EXPLAIN)\b/i.test(request.sql)) throw new Error("analytics SQL must be a query");
	const maxRows = request.maxRows ?? 1000;
	const maxBytes = request.maxBytes ?? 256 * 1024;
	if (!Number.isInteger(maxRows) || maxRows < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("invalid analytics output bound");
	const connection = await configure(await instance.connect());
	let settled = false;
	const cancel = () => { if (!settled) connection.interrupt(); };
	sessionSignal?.addEventListener("abort", cancel, { once: true });
	try {
		const result = await connection.stream(request.sql, request.parameters ?? undefined);
		const columns = result.columnNames();
		const rows: Record<string, unknown>[] = [];
		let truncated = false;
		let encodedBytes = 2;
		for await (const chunk of result.yieldRowObjectJson()) {
			for (const row of chunk) {
				checkSignal(sessionSignal);
				const bytes = rowBytes(row);
				const nextBytes = encodedBytes + bytes + (rows.length > 0 ? 1 : 0);
				if (rows.length >= maxRows || nextBytes > maxBytes) { truncated = true; break; }
				rows.push(row);
				encodedBytes = nextBytes;
			}
			if (truncated) break;
		}
		return { columns, rows, truncated };
	} finally {
		settled = true;
		sessionSignal?.removeEventListener("abort", cancel);
		connection.closeSync();
	}
}

export async function withAnalyticsSession<T>(options: AnalyticsSessionOptions, callback: (session: AnalyticsSession) => Promise<T>): Promise<T> {
	const opened = await openSession(options);
	try { return await callback(opened.session); }
	finally { opened.instance.closeSync(); }
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
