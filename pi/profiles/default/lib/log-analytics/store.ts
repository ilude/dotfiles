import fs from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance, StatementType, type DuckDBConnection } from "@duckdb/node-api";
import { canonicalWithin, checkCancelled, createAnalyticsInvocationDirectory } from "./profiles.js";
import { selectSources, type SelectedSource, type SourceColumn, type SourceSelection } from "./registry.js";

export type AnalyticsParameter = string | number | boolean | null;
export type AnalyticsExecution = "standard" | "large";
export type AnalyticsRequestedExecution = AnalyticsExecution | "automatic";
export type AnalyticsSelectionReason = "explicit_standard" | "explicit_large" | "selected_bytes_at_or_above_256_mib" | "exact_session_below_256_mib" | "non_exact_scope_below_256_mib";
export const AUTO_LARGE_THRESHOLD_BYTES = 256 * 1024 ** 2;
export type AnalyticsQuery = { sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number; maxBytes?: number };
export type AnalyticsExecutionDecision = {
	requestedExecution: AnalyticsRequestedExecution; execution: AnalyticsExecution; selectionReason: AnalyticsSelectionReason;
};
export function chooseAnalyticsExecution(requestedExecution: AnalyticsRequestedExecution, selectedBytes: number, exactSessionScope: boolean): AnalyticsExecutionDecision {
	if (requestedExecution === "standard") return { requestedExecution, execution: "standard", selectionReason: "explicit_standard" };
	if (requestedExecution === "large") return { requestedExecution, execution: "large", selectionReason: "explicit_large" };
	if (selectedBytes >= AUTO_LARGE_THRESHOLD_BYTES) return { requestedExecution, execution: "large", selectionReason: "selected_bytes_at_or_above_256_mib" };
	return exactSessionScope
		? { requestedExecution, execution: "standard", selectionReason: "exact_session_below_256_mib" }
		: { requestedExecution, execution: "large", selectionReason: "non_exact_scope_below_256_mib" };
}
export type AnalyticsQueryCost = {
	requestedExecution: AnalyticsRequestedExecution; execution: AnalyticsExecution; selectedBytes: number; selectionReason: AnalyticsSelectionReason;
	filesScanned: number; bytesScanned: number; discoveryMs: number; stagingMs: number; queryMs: number;
	memoryLimit?: string; threads?: number; recordsStaged?: number; malformedRecords?: number;
	peakOwnedDiskBytes?: number; diskBudgetBytes?: number;
};
export type AnalyticsQueryResult = { columns: readonly string[]; rows: Record<string, unknown>[]; truncated: boolean; cost: AnalyticsQueryCost };
export type AnalyticsSession = { query(request: AnalyticsQuery): Promise<AnalyticsQueryResult> };
export type AnalyticsSessionOptions = SourceSelection & {
	execution?: AnalyticsExecution; threads?: number; memoryLimit?: string; diskBudgetBytes?: number;
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
	if (bytes > tracker.diskBudgetBytes) throw new Error(`analytics execution owned disk ${bytes} bytes exceeds bound ${tracker.diskBudgetBytes}`);
}
function resourceFailure(error: unknown, tracker: ResourceTracker | undefined): unknown {
	if (!tracker || !(error instanceof Error) || error.message.startsWith("analytics execution owned disk")) return error;
	return /out of memory|temp(?:orary)? directory|no space|disk full/i.test(error.message)
		? new Error(`analytics execution resource limit (memory and owned disk ${tracker.diskBudgetBytes} bytes): ${error.message}`)
		: error;
}
function isResourceFailure(error: unknown): error is Error {
	return error instanceof Error && (/^analytics execution (?:owned disk|resource limit)/.test(error.message) || /out of memory|temp(?:orary)? directory|no space|disk full/i.test(error.message));
}
function explainResourceFailure(error: Error, decision: AnalyticsExecutionDecision, selectedBytes: number): Error {
	const retry = decision.execution === "standard" ? ' Retry explicitly with execution: "large"; no automatic retry was performed.' : "";
	return new Error(`Analytics resource failure (requested execution: ${decision.requestedExecution}; effective execution: ${decision.execution}; selected bytes: ${selectedBytes}; selection reason: ${decision.selectionReason}).${retry} Cause: ${error.message}`);
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
	checkCancelled(options.signal); const requestedExecution = options.execution ?? "automatic";
	if (requestedExecution !== "automatic" && requestedExecution !== "standard" && requestedExecution !== "large") throw new Error("invalid analytics execution mode");
	const threads = integer(options.threads ?? environmentInteger("PI_ANALYTICS_THREADS", 2), "threads");
	const memoryLimit = options.memoryLimit ?? process.env.PI_ANALYTICS_MEMORY_LIMIT ?? "2GB"; if (!memoryLimit.trim()) throw new Error("invalid analytics memoryLimit");
	const diskBudgetBytes = integer(options.diskBudgetBytes ?? environmentInteger("PI_ANALYTICS_LARGE_DISK_BUDGET_BYTES", 8 * 1024 ** 3), "diskBudgetBytes");
	const signal = options.signal ?? new AbortController().signal;
	let instance: DuckDBInstance | undefined, setup: DuckDBConnection | undefined, ownedPath: string | undefined, tracker: ResourceTracker | undefined;
	const cancelSetup = () => setup?.interrupt(); signal.addEventListener("abort", cancelSetup);
	let decision: AnalyticsExecutionDecision | undefined; let selectedBytes = 0;
	try {
		const discoveryStarted = performance.now(); const sources = await selectSources({ ...options, signal });
		const files = [...new Map(sources.flatMap(source => source.files).map(item => [item.file, item])).values()];
		for (const item of files) { checkCancelled(signal); if (await canonicalWithin(item.root, item.file) !== item.file) throw new Error("analytics input changed during discovery"); selectedBytes += (await fs.stat(item.file)).size; }
		const exactSessionScope = [...new Set(options.sources)].length === 1 && options.sources.includes("session_entries") && Boolean(options.sessionRefs?.length);
		decision = chooseAnalyticsExecution(requestedExecution, selectedBytes, exactSessionScope);
		const { execution } = decision;
		const started = performance.now(); const counters = { records: 0, malformed: 0 };
		await withStagingLock(signal, async () => {
			await stagingObserver?.(options); checkCancelled(signal);
			ownedPath = await createAnalyticsInvocationDirectory(options.registry.roots.default);
			await temporaryStorageObserver?.(ownedPath);
			const spill = path.join(ownedPath, "spill"); await fs.mkdir(spill);
			tracker = { ownedPath, diskBudgetBytes, peakOwnedDiskBytes: 0 };
			instance = execution === "large"
				? await DuckDBInstance.create(path.join(ownedPath, "analytics.duckdb"), { enable_external_access: "true", threads: String(threads), memory_limit: memoryLimit,
					temp_directory: spill, max_temp_directory_size: `${diskBudgetBytes}B`, autoinstall_known_extensions: "false", autoload_known_extensions: "false" })
				: await DuckDBInstance.create(":memory:", { enable_external_access: "true", threads: String(threads), memory_limit: memoryLimit,
					temp_directory: spill, max_temp_directory_size: `${diskBudgetBytes}B`, autoinstall_known_extensions: "false", autoload_known_extensions: "false" });
			setup = await instance.connect(); await setup.run("SET TimeZone = 'UTC'");
			await setup.run("SET preserve_insertion_order = false");
			let setupMonitor: NodeJS.Timeout | undefined;
			if (tracker) setupMonitor = setInterval(() => { void checkDisk(tracker!).catch(error => { tracker!.resourceError = error as Error; setup?.interrupt(); }); }, 25);
			setupMonitor?.unref();
			try {
				for (const source of sources) { checkCancelled(signal); if (execution === "large") await createLargeView(setup, source, signal, tracker!, counters); else await createStandardView(setup, source); }
				await checkDisk(tracker!);
				if (tracker?.resourceError) throw tracker.resourceError;
				checkCancelled(signal); await setup.run("SET enable_external_access = false");
			} finally { if (setupMonitor) clearInterval(setupMonitor); }
			setup.closeSync(); setup = undefined;
		});
		const cost: Omit<AnalyticsQueryCost, "queryMs"> = { ...decision, selectedBytes, filesScanned: files.length, bytesScanned: selectedBytes, discoveryMs: started - discoveryStarted,
			stagingMs: performance.now() - started, memoryLimit, threads,
			...(tracker ? { ...(execution === "large" ? { recordsStaged: counters.records, malformedRecords: counters.malformed } : {}), peakOwnedDiskBytes: tracker.peakOwnedDiskBytes, diskBudgetBytes: tracker.diskBudgetBytes } : {}) };
		checkCancelled(signal); return await callback({ query: request => query(instance!, request, signal, cost, tracker) });
	} catch (error) {
		checkCancelled(options.signal);
		const normalized = resourceFailure(error, tracker);
		if (decision && isResourceFailure(normalized)) throw explainResourceFailure(normalized, decision, selectedBytes);
		throw normalized;
	} finally {
		signal?.removeEventListener("abort", cancelSetup);
		try { setup?.closeSync(); }
		finally {
			try { instance?.closeSync(); }
			finally {
				if (ownedPath) {
					try { await fs.rm(ownedPath, { recursive: true, force: true }); await fs.stat(ownedPath); throw new Error("path still exists"); }
					catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`analytics cleanup failed for owned path ${ownedPath}: ${error instanceof Error ? error.message : String(error)}`); }
				}
			}
		}
	}
}
