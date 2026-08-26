import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { DuckDBInstance } from "@duckdb/node-api";

export type SourceColumn = {
	name: string;
	type: "VARCHAR" | "BIGINT" | "DOUBLE" | "BOOLEAN";
};

export type SourceDefinition<
	T extends Record<string, unknown> = Record<string, unknown>,
> = {
	name: string;
	columns: readonly SourceColumn[];
	parse: (value: unknown, line: number, source: string) => T | undefined;
	canonicalRoots?: readonly string[];
};

export type SourceState = {
	source: string;
	size: number;
	mtime_ms: number;
	newline_offset: number;
	fingerprint: string;
};

export type RefreshOptions = {
	maxBytes?: number;
	maxRecords?: number;
	maxLineBytes?: number;
	maxNesting?: number;
	maxElapsedMs?: number;
	signal?: AbortSignal;
};

type Connection = Awaited<ReturnType<DuckDBInstance["connect"]>>;
type OpenStore = {
	instance: DuckDBInstance;
	connection: Connection;
	path: string;
};

type Metadata = {
	byte_size: number;
	modified_ms: number;
	newline_offset: number;
	line_count: number;
	fingerprint: string;
};

type ParsedLine<T> = { line: number; value: T };

const STORE_SCHEMA_VERSION = 3;
const DEFAULTS: Required<Omit<RefreshOptions, "signal">> = {
	maxBytes: 128 * 1024 * 1024,
	maxRecords: 100_000,
	maxLineBytes: 1024 * 1024,
	maxNesting: 32,
	maxElapsedMs: 5_000,
};
const instances = new Map<string, Promise<DuckDBInstance>>();
const stores = new Map<string, Promise<LogAnalyticsStore>>();

function identifier(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function projectionTable(definition: SourceDefinition): string {
	return identifier(`_projection_${definition.name}`);
}

function projectionView(definition: SourceDefinition): string {
	return identifier(`source_${definition.name}`);
}

function insertSql(definition: SourceDefinition): string {
	const columns = definition.columns.map((column) => identifier(column.name));
	const parameters = [...definition.columns.map(() => "?"), "?", "?"].join(
		", ",
	);
	return `INSERT INTO ${projectionTable(definition)} (${columns.join(", ")}, _source_path, _line_number) VALUES (${parameters})`;
}

function isReparsePoint(stat: {
	isSymbolicLink(): boolean;
	mode: number;
	st_file_attributes?: number;
}): boolean {
	const reparseFlag = 0x400;
	return (
		stat.isSymbolicLink() ||
		(typeof stat.st_file_attributes === "number" &&
			(stat.st_file_attributes & reparseFlag) !== 0)
	);
}

async function assertNoLinks(
	target: string,
	allowMissing = false,
): Promise<void> {
	const resolved = path.resolve(target);
	const parsed = path.parse(resolved);
	let current = parsed.root;
	for (const segment of resolved
		.slice(parsed.root.length)
		.split(path.sep)
		.filter(Boolean)) {
		current = path.join(current, segment);
		try {
			const stat = await fs.lstat(current);
			if (isReparsePoint(stat))
				throw new Error(
					`analytics path cannot contain a link or reparse point: ${current}`,
				);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT" && allowMissing)
				return;
			throw error;
		}
	}
}

async function ensurePrivateDatabase(databasePath: string): Promise<string> {
	const resolved = path.resolve(databasePath);
	await fs.mkdir(path.dirname(resolved), { recursive: true });
	await assertNoLinks(path.dirname(resolved));
	try {
		const stat = await fs.lstat(resolved);
		if (isReparsePoint(stat) || !stat.isFile())
			throw new Error(`analytics database must be a regular file: ${resolved}`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (process.platform !== "win32") {
		await fs.chmod(path.dirname(resolved), 0o700);
		if (await fileExists(resolved)) await fs.chmod(resolved, 0o600);
	}
	return resolved;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function configureConnection(connection: Connection): Promise<Connection> {
	await connection.run("SET enable_external_access = false");
	return connection;
}

async function instanceFor(databasePath: string): Promise<DuckDBInstance> {
	const key = path.resolve(databasePath);
	let current = instances.get(key);
	if (!current) {
		current = DuckDBInstance.create(key);
		instances.set(key, current);
	}
	try {
		return await current;
	} catch (error) {
		instances.delete(key);
		throw error;
	}
}

function checkAbort(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error("analytics refresh was cancelled");
}

async function fingerprintPrefix(source: string, length: number): Promise<string> {
	const hash = createHash("sha256");
	const handle = await fs.open(source, "r");
	const before = await fs.stat(source);
	const beforeHandle = await handle.stat();
	const chunk = Buffer.alloc(64 * 1024);
	let offset = 0;
	try {
		while (offset < length) {
			const result = await handle.read(chunk, 0, Math.min(chunk.length, length - offset), offset);
			if (result.bytesRead === 0) break;
			hash.update(chunk.subarray(0, result.bytesRead));
			offset += result.bytesRead;
		}
		const after = await fs.stat(source);
		const afterHandle = await handle.stat();
		const identityChanged =
			(typeof beforeHandle.ino === "number" && typeof afterHandle.ino === "number" && beforeHandle.ino !== afterHandle.ino) ||
			(typeof beforeHandle.dev === "number" && typeof afterHandle.dev === "number" && beforeHandle.dev !== afterHandle.dev);
		if (identityChanged || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
			throw new Error(`analytics source changed while reading: ${source}`);
		return hash.digest("hex");
	} finally {
		await handle.close();
	}
}

function nestingDepth(value: unknown, depth: number, limit: number): number {
	if (value === null || typeof value !== "object") return depth;
	if (depth > limit) return depth;
	if (Array.isArray(value))
		return Math.max(
			depth,
			...value.map((item) => nestingDepth(item, depth + 1, limit)),
		);
	return Math.max(
		depth,
		...Object.values(value).map((item) => nestingDepth(item, depth + 1, limit)),
	);
}

async function readSource<T extends Record<string, unknown>>(
	source: string,
	startOffset: number,
	startLine: number,
	definition: SourceDefinition<T>,
	options: RefreshOptions,
): Promise<{
	parsed: ParsedLine<T>[];
	newlineOffset: number;
	lineCount: number;
	size: number;
	mtimeMs: number;
}> {
	const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
	const maxRecords = options.maxRecords ?? DEFAULTS.maxRecords;
	const maxLineBytes = options.maxLineBytes ?? DEFAULTS.maxLineBytes;
	const maxNesting = options.maxNesting ?? DEFAULTS.maxNesting;
	const maxElapsedMs = options.maxElapsedMs ?? DEFAULTS.maxElapsedMs;
	const started = Date.now();
	const parsed: ParsedLine<T>[] = [];
	const decoder = new StringDecoder("utf8");
	const handle = await fs.open(source, "r");
	const before = await fs.stat(source);
	const beforeHandle = await handle.stat();
	let offset = startOffset;
	let committedOffset = startOffset;
	let lineNumber = startLine;
	let records = 0;
	let pending = "";
	let pendingStart = startOffset;
	const chunk = Buffer.alloc(64 * 1024);
	try {
		while (true) {
			checkAbort(options.signal);
			if (Date.now() - started > maxElapsedMs)
				throw new Error(`analytics refresh exceeded time limit: ${source}`);
			const result = await handle.read(chunk, 0, chunk.length, offset);
			if (result.bytesRead === 0) break;
			const bytes = chunk.subarray(0, result.bytesRead);
			offset += result.bytesRead;
			if (offset > maxBytes)
				throw new Error(`analytics source exceeds byte limit: ${source}`);
			pending += decoder.write(bytes);
			let newline = pending.indexOf("\n");
			while (newline >= 0) {
				const rawLine = pending.slice(0, newline).replace(/\r$/, "");
				const lineBytes = Buffer.byteLength(rawLine, "utf8");
				if (lineBytes > maxLineBytes)
					throw new Error(
						`analytics line exceeds byte limit: ${source}:${lineNumber + 1}`,
					);
				lineNumber += 1;
				const lineEnd =
					pendingStart +
					Buffer.byteLength(pending.slice(0, newline + 1), "utf8");
				pending = pending.slice(newline + 1);
				pendingStart = lineEnd;
				if (!rawLine.trim()) {
					committedOffset = lineEnd;
				} else {
					records += 1;
					if (records > maxRecords)
						throw new Error(`analytics source exceeds record limit: ${source}`);
					let value: unknown;
					try {
						value = JSON.parse(rawLine);
					} catch (error) {
						throw new Error(
							`malformed analytics JSONL: ${source}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
					if (nestingDepth(value, 0, maxNesting) > maxNesting)
						throw new Error(
							`analytics JSON nesting exceeds limit: ${source}:${lineNumber}`,
						);
					const projection = definition.parse(value, lineNumber, source);
					if (projection)
						parsed.push({ line: lineNumber, value: projection });
					committedOffset = lineEnd;
				}
				newline = pending.indexOf("\n");
			}
		}
		pending += decoder.end();
		const pendingBytes = Buffer.byteLength(pending, "utf8");
		if (pendingBytes > maxLineBytes)
			throw new Error(
				`analytics line exceeds byte limit: ${source}:${lineNumber + 1}`,
			);
		const after = await fs.stat(source);
		const afterHandle = await handle.stat();
		const identityChanged =
			(typeof beforeHandle.ino === "number" && typeof afterHandle.ino === "number" && beforeHandle.ino !== afterHandle.ino) ||
			(typeof beforeHandle.dev === "number" && typeof afterHandle.dev === "number" && beforeHandle.dev !== afterHandle.dev);
		if (identityChanged || after.size !== offset || after.mtimeMs !== before.mtimeMs)
			throw new Error(`analytics source changed while reading: ${source}`);
		return {
			parsed,
			newlineOffset: committedOffset,
			lineCount: lineNumber,
			size: after.size,
			mtimeMs: after.mtimeMs,
		};
	} finally {
		await handle.close();
	}
}

async function metadataRows(
	connection: Connection,
	sourceName: string,
	sourcePath?: string,
): Promise<Record<string, unknown>[]> {
	const sql = sourcePath
		? "SELECT byte_size, modified_ms, newline_offset, line_count, fingerprint FROM _analytics_sources WHERE source_name = ? AND source_path = ?"
		: "SELECT source_path, byte_size, modified_ms, newline_offset, line_count, fingerprint FROM _analytics_sources WHERE source_name = ?";
	const params = sourcePath ? [sourceName, sourcePath] : [sourceName];
	const result = await connection.runAndReadAll(sql, params);
	return result.getRowObjectsJS() as Record<string, unknown>[];
}

export class LogAnalyticsStore {
	private closed = false;

	private constructor(private readonly store: OpenStore) {}

	static async open(databasePath: string): Promise<LogAnalyticsStore> {
		const database = await ensurePrivateDatabase(databasePath);
		const existing = stores.get(database);
		if (existing) return existing;
		const opening = LogAnalyticsStore.create(database);
		stores.set(database, opening);
		try {
			return await opening;
		} catch (error) {
			stores.delete(database);
			throw error;
		}
	}

	private static async create(database: string): Promise<LogAnalyticsStore> {
		const instance = await instanceFor(database);
		if (process.platform !== "win32") {
			await fs.chmod(path.dirname(database), 0o700);
			await fs.chmod(database, 0o600);
		}
		const connection = await configureConnection(await instance.connect());
		const store = new LogAnalyticsStore({
			instance,
			connection,
			path: database,
		});
		await store.ensureSchema();
		return store;
	}

	private async tableColumns(tableName: string): Promise<string[]> {
		const result = await this.store.connection.runAndReadAll(
			"SELECT column_name FROM information_schema.columns WHERE table_schema = 'main' AND table_name = ? ORDER BY ordinal_position",
			[tableName],
		);
		return (result.getRowObjectsJS() as Array<{ column_name: string }>).map(
			(row) => row.column_name,
		);
	}

	private async ensureSchema(): Promise<void> {
		const tables = await this.store.connection.runAndReadAll(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
		);
		const names = new Set(
			(tables.getRowObjectsJS() as Array<{ table_name: string }>).map(
				(row) => row.table_name,
			),
		);
		if (names.has("_analytics_schema")) {
			const version = await this.store.connection.runAndReadAll(
				"SELECT schema_version FROM _analytics_schema LIMIT 1",
			);
			const row = version.getRowObjectsJS()[0] as
				| { schema_version?: number }
				| undefined;
			const metadataColumns = names.has("_analytics_sources")
				? await this.tableColumns("_analytics_sources")
				: [];
			const expectedMetadataColumns = [
				"source_name",
				"source_path",
				"byte_size",
				"modified_ms",
				"newline_offset",
				"line_count",
				"fingerprint",
			];
			if (
				Number(row?.schema_version) !== STORE_SCHEMA_VERSION ||
				metadataColumns.join("|") !== expectedMetadataColumns.join("|")
			)
				await this.recreateSchema();
			else return;
		}
		await this.store.connection.run(
			"CREATE TABLE IF NOT EXISTS _analytics_schema (schema_version BIGINT)",
		);
		await this.store.connection.run("DELETE FROM _analytics_schema");
		await this.store.connection.run(
			"INSERT INTO _analytics_schema VALUES (?)",
			[STORE_SCHEMA_VERSION],
		);
		await this.store.connection.run(
			"CREATE TABLE IF NOT EXISTS _analytics_sources (source_name VARCHAR, source_path VARCHAR, byte_size BIGINT, modified_ms DOUBLE, newline_offset BIGINT, line_count BIGINT, fingerprint VARCHAR, PRIMARY KEY(source_name, source_path))",
		);
	}

	private async recreateSchema(): Promise<void> {
		await this.store.connection.run("BEGIN");
		try {
			const objects = await this.store.connection.runAndReadAll(
				"SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main'",
			);
			const rows = objects.getRowObjectsJS() as Array<{
				table_name: string;
				table_type: string;
			}>;
			for (const row of rows.filter((item) => item.table_type === "VIEW")) {
				if (row.table_name.startsWith("source_"))
					await this.store.connection.run(
						`DROP VIEW IF EXISTS ${identifier(row.table_name)}`,
					);
			}
			for (const row of rows.filter((item) => item.table_type !== "VIEW")) {
				if (
					row.table_name.startsWith("_projection_") ||
					row.table_name.startsWith("_analytics_")
				)
					await this.store.connection.run(
						`DROP TABLE IF EXISTS ${identifier(row.table_name)}`,
					);
			}
			await this.store.connection.run(
				"CREATE TABLE _analytics_schema (schema_version BIGINT)",
			);
			await this.store.connection.run(
				"INSERT INTO _analytics_schema VALUES (?)",
				[STORE_SCHEMA_VERSION],
			);
			await this.store.connection.run(
				"CREATE TABLE _analytics_sources (source_name VARCHAR, source_path VARCHAR, byte_size BIGINT, modified_ms DOUBLE, newline_offset BIGINT, line_count BIGINT, fingerprint VARCHAR, PRIMARY KEY(source_name, source_path))",
			);
			await this.store.connection.run("COMMIT");
		} catch (error) {
			await this.store.connection.run("ROLLBACK");
			throw error;
		}
	}

	/** Domain-owned projections use a private connection and never expose it to readers. */
	async connectionForDomain(): Promise<Connection> {
		return configureConnection(await this.store.instance.connect());
	}

	async register<T extends Record<string, unknown>>(
		definition: SourceDefinition<T>,
	): Promise<void> {
		const table = projectionTable(definition);
		const expectedColumns = [
			...definition.columns.map((column) => column.name),
			"_source_path",
			"_line_number",
		];
		const existingColumns = await this.tableColumns(
			`_projection_${definition.name}`,
		);
		if (
			existingColumns.length > 0 &&
			existingColumns.join("|") !== expectedColumns.join("|")
		) {
			await this.recreateSchema();
		}
		const columns = definition.columns.map(
			(column) => `${identifier(column.name)} ${column.type}`,
		);
		columns.push("_source_path VARCHAR", "_line_number BIGINT");
		await this.store.connection.run(
			`CREATE TABLE IF NOT EXISTS ${table} (${columns.join(", ")}, PRIMARY KEY(_source_path, _line_number))`,
		);
		await this.store.connection.run(
			`CREATE OR REPLACE VIEW ${projectionView(definition)} AS SELECT ${definition.columns.map((column) => identifier(column.name)).join(", ")} FROM ${table}`,
		);
	}

	private async validateSourcePath(
		definition: SourceDefinition,
		source: string,
	): Promise<string> {
		const resolved = path.resolve(source);
		const roots = (definition.canonicalRoots ?? []).map((root) =>
			path.resolve(root),
		);
		if (
			roots.length > 0 &&
			!roots.some(
				(root) =>
					resolved === root || resolved.startsWith(`${root}${path.sep}`),
			)
		)
			throw new Error(
				`analytics source is outside its canonical root: ${source}`,
			);
		await assertNoLinks(resolved);
		const stat = await fs.lstat(resolved);
		if (isReparsePoint(stat) || !stat.isFile())
			throw new Error(`analytics source must be a regular file: ${source}`);
		return resolved;
	}

	async refresh<T extends Record<string, unknown>>(
		definition: SourceDefinition<T>,
		paths: readonly string[],
		options: RefreshOptions = {},
	): Promise<SourceState[]> {
		await this.register(definition);
		const sources = (
			await Promise.all(
				paths.map((source) => this.validateSourcePath(definition, source)),
			)
		).sort();
		const known = await metadataRows(this.store.connection, definition.name);
		await this.store.connection.run("BEGIN");
		try {
			for (const row of known) {
				const source = String(row.source_path);
				if (!sources.includes(source)) {
					await this.store.connection.run(
						`DELETE FROM ${projectionTable(definition)} WHERE _source_path = ?`,
						[source],
					);
					await this.store.connection.run(
						"DELETE FROM _analytics_sources WHERE source_name = ? AND source_path = ?",
						[definition.name, source],
					);
				}
			}
			const states: SourceState[] = [];
			for (const source of sources)
				states.push(await this.refreshOne(definition, source, options));
			await this.store.connection.run("COMMIT");
			return states;
		} catch (error) {
			await this.store.connection.run("ROLLBACK");
			throw error;
		}
	}

	private async refreshOne<T extends Record<string, unknown>>(
		definition: SourceDefinition<T>,
		source: string,
		options: RefreshOptions,
	): Promise<SourceState> {
		const stat = await fs.stat(source);
		const priorRow = (
			await metadataRows(this.store.connection, definition.name, source)
		)[0] as Metadata | undefined;
		const prior = priorRow && {
			byte_size: Number(priorRow.byte_size),
			modified_ms: Number(priorRow.modified_ms),
			newline_offset: Number(priorRow.newline_offset),
			line_count: Number(priorRow.line_count),
			fingerprint: String(priorRow.fingerprint),
		};
		const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
		if (stat.size > maxBytes)
			throw new Error(`analytics source exceeds byte limit: ${source}`);
		if (prior && prior.newline_offset <= stat.size) {
			const committedPrefix = await fingerprintPrefix(source, prior.newline_offset);
			if (
				prior.byte_size === stat.size &&
				prior.modified_ms === stat.mtimeMs &&
				committedPrefix === prior.fingerprint
			) {
				return {
					source,
					size: stat.size,
					mtime_ms: stat.mtimeMs,
					newline_offset: prior.newline_offset,
					fingerprint: prior.fingerprint,
				};
			}
			const start = committedPrefix === prior.fingerprint ? prior.newline_offset : 0;
			const startLine = start === 0 ? 0 : prior.line_count;
			const scanned = await readSource(source, start, startLine, definition, options);
			const fingerprint = await fingerprintPrefix(source, scanned.newlineOffset);
			return await this.commitScanned(definition, source, prior, start, startLine, scanned, fingerprint);
		}
		const scanned = await readSource(source, 0, 0, definition, options);
		const fingerprint = await fingerprintPrefix(source, scanned.newlineOffset);
		return await this.commitScanned(definition, source, prior, 0, 0, scanned, fingerprint);
	}

	private async commitScanned<T extends Record<string, unknown>>(
		definition: SourceDefinition<T>,
		source: string,
		prior: Metadata | undefined,
		start: number,
		startLine: number,
		scanned: { parsed: ParsedLine<T>[]; newlineOffset: number; lineCount: number; size: number; mtimeMs: number },
		fingerprint: string,
	): Promise<SourceState> {
		const replacing = !prior || start === 0;
		if (replacing)
			await this.store.connection.run(`DELETE FROM ${projectionTable(definition)} WHERE _source_path = ?`, [source]);
		else
			await this.store.connection.run(`DELETE FROM ${projectionTable(definition)} WHERE _source_path = ? AND _line_number >= ?`, [source, startLine + 1]);
		const statement = await this.store.connection.prepare(insertSql(definition));
		try {
			for (const item of scanned.parsed) {
				statement.bind([
					...definition.columns.map((column) => (item.value[column.name] ?? null) as string | number | boolean | null),
					source,
					item.line,
				]);
				await statement.run();
			}
		} finally {
			statement.destroySync();
		}
		await this.store.connection.run("DELETE FROM _analytics_sources WHERE source_name = ? AND source_path = ?", [definition.name, source]);
		await this.store.connection.run("INSERT INTO _analytics_sources VALUES (?, ?, ?, ?, ?, ?, ?)", [definition.name, source, scanned.size, scanned.mtimeMs, scanned.newlineOffset, scanned.lineCount, fingerprint]);
		return { source, size: scanned.size, mtime_ms: scanned.mtimeMs, newline_offset: scanned.newlineOffset, fingerprint };
	}

	private async rows(
		sql: string,
		params: unknown[] = [],
	): Promise<Record<string, unknown>[]> {
		const result = params.length
			? await this.store.connection.runAndReadAll(sql, params as never)
			: await this.store.connection.runAndReadAll(sql);
		return result.getRowObjectsJS() as Record<string, unknown>[];
	}

	async query(
		sql: string,
		params: readonly unknown[] = [],
		signal?: AbortSignal,
	): Promise<Record<string, unknown>[]> {
		checkAbort(signal);
		if (!/^\s*SELECT\b/i.test(sql) || /;/.test(sql) ||
			/\b(?:_analytics_|_source_path|_line_number|information_schema|pragma|read_csv|read_json|read_text|read_blob|glob|parquet_scan|read_parquet|query_table|httpfs|install|load)\w*\s*\(?/i.test(sql))
			throw new Error("analytics queries must use exposed structural projections");
		if (/\bsource_[A-Za-z0-9_]+\s*\(/i.test(sql))
			throw new Error("analytics queries must use exposed structural projections");
		const tables = [...sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi)].map((match) => match[1].toLowerCase());
		if (tables.length === 0 || tables.some((table) => !table.startsWith("source_")))
			throw new Error("analytics queries must use exposed structural projections");
		let settled = false;
		const cancel = () => {
			if (!settled) this.store.connection.interrupt();
		};
		signal?.addEventListener("abort", cancel, { once: true });
		try {
			const result = await this.store.connection.runAndReadAll(
				sql,
				params as never,
			);
			checkAbort(signal);
			return result.getRowObjectsJS() as Record<string, unknown>[];
		} finally {
			settled = true;
			signal?.removeEventListener("abort", cancel);
		}
	}

	async schema(): Promise<Record<string, unknown>[]> {
		return this.rows(
			"SELECT table_name FROM information_schema.views WHERE table_schema = 'main' AND table_name LIKE 'source_%' ORDER BY table_name",
		);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.store.connection.closeSync();
		stores.delete(this.store.path);
	}
}

export async function closeLogAnalyticsStores(): Promise<void> {
	const active = [...stores.values()];
	for (const current of active) await (await current).close();
	stores.clear();
	for (const current of instances.values()) (await current).closeSync();
	instances.clear();
}

export function resetLogAnalyticsStoreCacheForTests(): Promise<void> {
	return closeLogAnalyticsStores();
}

export function registerLogAnalyticsLifecycle(pi: {
	on: (event: string, handler: () => Promise<void>) => unknown;
}): void {
	pi.on("session_shutdown", closeLogAnalyticsStores);
}
