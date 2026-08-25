import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { coordinateId, scanToolFailures, type FailureScan, type SessionEntry } from "./tool-failure-classifier.ts";
import type { BoundedInspection, TranscriptCoordinate } from "./tool-failure-inspection.ts";

export type ToolFailureObservation = {
	candidateId: string;
	fingerprint: string;
	toolName: string;
	message: string;
	sessionId: string;
	observedAt: string;
	coordinate: string;
};
export type ToolFailureDecision = {
	candidateId: string;
	fingerprint: string;
	outcome: "expected" | "resolved";
	recordedAt: string;
	effectiveAt?: string;
};
export type ToolFailureCandidate = ToolFailureObservation & { reason: "new" | "post-effective-regression" };
export type SessionSource = { path: string; size: number; mtimeMs: number };
type Store = { instance: DuckDBInstance; connection: Awaited<ReturnType<DuckDBInstance["connect"]>> };
const instances = new Map<string, Promise<DuckDBInstance>>();

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`invalid tool-failure fixture field: ${field}`);
	return value;
}
function observation(value: unknown): ToolFailureObservation {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid tool-failure session fixture row");
	const row = value as Record<string, unknown>;
	return { candidateId: requiredString(row.candidateId, "candidateId"), fingerprint: requiredString(row.fingerprint, "fingerprint"), toolName: requiredString(row.toolName, "toolName"), message: requiredString(row.message, "message"), sessionId: requiredString(row.sessionId, "sessionId"), observedAt: requiredString(row.observedAt, "observedAt"), coordinate: requiredString(row.coordinate, "coordinate") };
}
function decision(value: unknown): ToolFailureDecision {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid tool-failure decision fixture row");
	const row = value as Record<string, unknown>; if (row.outcome !== "expected" && row.outcome !== "resolved") throw new Error("invalid tool-failure decision outcome");
	return { candidateId: requiredString(row.candidateId, "candidateId"), fingerprint: requiredString(row.fingerprint, "fingerprint"), outcome: row.outcome, recordedAt: requiredString(row.recordedAt, "recordedAt"), effectiveAt: row.effectiveAt === undefined ? undefined : requiredString(row.effectiveAt, "effectiveAt") };
}
async function readFixture<T>(filePath: string, parse: (value: unknown) => T): Promise<T[]> { return (await fs.readFile(filePath, "utf8")).split(/\r?\n/).filter((line) => line.trim()).map((line) => parse(JSON.parse(line) as unknown)); }
async function instanceFor(databasePath: string): Promise<DuckDBInstance> {
	const key = path.resolve(databasePath); let current = instances.get(key); if (!current) { current = DuckDBInstance.create(key); instances.set(key, current); }
	try { return await current; } catch (error) { instances.delete(key); throw error; }
}
async function discoverJsonl(root: string): Promise<string[]> {
	const result: string[] = [];
	async function visit(directory: string): Promise<void> {
		let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
		try { entries = await fs.readdir(directory, { withFileTypes: true, encoding: "utf8" }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
		for (const entry of entries) { const file = path.join(directory, entry.name); if (entry.isDirectory()) await visit(file); else if (entry.isFile() && entry.name.endsWith(".jsonl")) result.push(path.resolve(file)); }
	}
	await visit(path.resolve(root)); return result.sort();
}
function relevantSessionMessage(message: Record<string, unknown>): boolean {
	if (message.role === "toolResult") return message.isError === true;
	if (message.role !== "assistant" || !Array.isArray(message.content)) return false;
	return message.content.some((item) => item && typeof item === "object" && ((item as Record<string, unknown>).type === "toolCall" || (item as Record<string, unknown>).type === "tool_call"));
}

async function readStable(filePath: string): Promise<{ source: SessionSource; rows: SessionEntry[] }> {
	const before = await fs.stat(filePath);
	const rows: SessionEntry[] = [];
	let index = 0;
	const consumeLine = (rawLine: string): void => {
		index += 1;
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		if (!line.trim()) return;
		try {
			const parsed = JSON.parse(line) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
			const entry = parsed as Record<string, unknown>;
			const wrapped = entry.type === "message" && entry.message && typeof entry.message === "object" && !Array.isArray(entry.message);
			const direct = typeof entry.role === "string";
			if (!wrapped && !direct) return;
			const message = (wrapped ? entry.message : entry) as Record<string, unknown>;
			if (!relevantSessionMessage(message)) return;
			rows.push({ filename: filePath, id: typeof entry.id === "string" ? entry.id : String(index), lineNumber: index, timestamp: typeof entry.timestamp === "string" ? entry.timestamp : null, message, type: "message" });
		} catch (error) { throw new Error(`malformed session JSONL: ${filePath}:${index}: ${error instanceof Error ? error.message : String(error)}`); }
	};
	let pending = "";
	for await (const chunk of createReadStream(filePath, { encoding: "utf8" })) {
		pending += chunk;
		let newline = pending.indexOf("\n");
		while (newline >= 0) {
			consumeLine(pending.slice(0, newline));
			pending = pending.slice(newline + 1);
			newline = pending.indexOf("\n");
		}
	}
	if (pending) consumeLine(pending);
	const after = await fs.stat(filePath);
	if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error(`session source changed while reading: ${filePath}`);
	return { source: { path: filePath, size: before.size, mtimeMs: before.mtimeMs }, rows };
}

export class ToolFailureStore {
	private constructor(private readonly store: Store) {}
	static async open(databasePath: string): Promise<ToolFailureStore> {
		const instance = await instanceFor(databasePath); const connection = await instance.connect(); const store = new ToolFailureStore({ instance, connection });
		await connection.run(`
			CREATE TABLE IF NOT EXISTS tool_failure_observations (append_order BIGINT, candidate_id VARCHAR, fingerprint VARCHAR, tool_name VARCHAR, message VARCHAR, session_id VARCHAR, observed_at VARCHAR, coordinate VARCHAR);
			CREATE TABLE IF NOT EXISTS tool_failure_decisions (append_order BIGINT, candidate_id VARCHAR, fingerprint VARCHAR, outcome VARCHAR, recorded_at VARCHAR, effective_at VARCHAR);
			CREATE TABLE IF NOT EXISTS tool_failure_scans (scan_json JSON);
			CREATE TABLE IF NOT EXISTS tool_failure_sources (source_path VARCHAR PRIMARY KEY, byte_size BIGINT, modified_ms DOUBLE);
			CREATE TABLE IF NOT EXISTS tool_failure_session_entries (source_path VARCHAR, line_number INTEGER, entry_id VARCHAR, timestamp VARCHAR, message JSON, PRIMARY KEY (source_path, line_number));
		`);
		return store;
	}

	async refreshSessionCorpus(sessionRoot: string): Promise<SessionSource[]> {
		const files = await discoverJsonl(sessionRoot);
		const sources = await Promise.all(files.map(async (filePath) => {
			const stat = await fs.stat(filePath);
			return { path: filePath, size: stat.size, mtimeMs: stat.mtimeMs };
		}));
		await this.store.connection.run("BEGIN TRANSACTION");
		try {
			const current = new Set(files);
			for (const row of await this.rows("SELECT source_path FROM tool_failure_sources")) if (!current.has(String(row.source_path))) {
				await this.store.connection.run("DELETE FROM tool_failure_session_entries WHERE source_path = ?", [String(row.source_path)]);
				await this.store.connection.run("DELETE FROM tool_failure_sources WHERE source_path = ?", [String(row.source_path)]);
			}
			for (const source of sources) {
				const prior = (await this.rows("SELECT byte_size, modified_ms FROM tool_failure_sources WHERE source_path = ?", [source.path]))[0];
				if (prior && Number(prior.byte_size) === source.size && Number(prior.modified_ms) === source.mtimeMs) continue;
				const item = await readStable(source.path);
				await this.store.connection.run("DELETE FROM tool_failure_session_entries WHERE source_path = ?", [item.source.path]);
				await this.store.connection.run("DELETE FROM tool_failure_sources WHERE source_path = ?", [item.source.path]);
				await this.store.connection.run("INSERT INTO tool_failure_sources VALUES (?, ?, ?)", [item.source.path, item.source.size, item.source.mtimeMs]);
				const appender = await this.store.connection.createAppender("tool_failure_session_entries");
				try {
					for (const row of item.rows) {
						appender.appendVarchar(item.source.path);
						appender.appendInteger(row.lineNumber ?? 0);
						appender.appendVarchar(row.id);
						if (row.timestamp == null) appender.appendNull(); else appender.appendVarchar(row.timestamp);
						appender.appendVarchar(JSON.stringify(row.message));
						appender.endRow();
					}
				} finally { appender.closeSync(); }
			}
			await this.store.connection.run("COMMIT"); return sources;
		} catch (error) { await this.store.connection.run("ROLLBACK"); throw error; }
	}

	async scan(asOf = new Date(), malformedOmissions = 0): Promise<FailureScan> {
		const rows = await this.rows("SELECT source_path, line_number, entry_id, timestamp, message FROM tool_failure_session_entries ORDER BY source_path, line_number");
		return scanToolFailures(rows.map((row) => ({ filename: String(row.source_path), id: String(row.entry_id), timestamp: row.timestamp == null ? null : String(row.timestamp), message: row.message, type: "message" })), asOf, malformedOmissions);
	}
	async selectedCoordinates(scan: FailureScan, candidateIds: readonly string[]): Promise<Map<string, TranscriptCoordinate[]>> {
		const wanted = new Set(candidateIds); const coordinates = new Map<string, TranscriptCoordinate[]>(); const allowed = new Map(scan.candidates.map((candidate) => [candidate.candidateId, new Set(candidate.coordinates)]));
		const rows = await this.rows("SELECT source_path, line_number, entry_id, message FROM tool_failure_session_entries ORDER BY source_path, line_number"); const calls = new Map<string, string>();
		for (const row of rows) { const message = typeof row.message === "string" ? JSON.parse(row.message) as Record<string, unknown> : row.message as Record<string, unknown>; const content = Array.isArray(message.content) ? message.content : [];
			for (const item of content) if (item && typeof item === "object" && (((item as Record<string, unknown>).type === "toolCall") || ((item as Record<string, unknown>).type === "tool_call"))) { const id = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).toolCallId; if (typeof id === "string") calls.set(`${row.source_path}\0${id}`, String(row.entry_id)); }
			const callId = message.toolCallId; if (message.isError !== true || typeof callId !== "string") continue; const coordinate = coordinateId(calls.get(`${row.source_path}\0${callId}`) ?? "", callId);
			for (const candidate of wanted) if (allowed.get(candidate)?.has(coordinate)) coordinates.set(candidate, [...(coordinates.get(candidate) ?? []), { filePath: String(row.source_path), line: Number(row.line_number), token: coordinate }]);
		}
		return coordinates;
	}
	async saveScan(scan: FailureScan): Promise<void> { const statement = await this.store.connection.prepare("INSERT INTO tool_failure_scans VALUES (?)"); statement.bind([JSON.stringify(scan)]); await statement.run(); statement.destroySync(); }
	async latestScan(): Promise<FailureScan | undefined> { const rows = await this.rows("SELECT scan_json FROM tool_failure_scans ORDER BY rowid DESC LIMIT 1"); return typeof rows[0]?.scan_json === "string" ? JSON.parse(rows[0].scan_json) as FailureScan : undefined; }
	async ingest(sessionPath: string, decisionPath: string): Promise<void> { const observations = await readFixture(sessionPath, observation); const decisions = await readFixture(decisionPath, decision); let order = await this.nextOrder(); for (const item of observations) { await this.store.connection.run("INSERT INTO tool_failure_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [order++, item.candidateId, item.fingerprint, item.toolName, item.message, item.sessionId, item.observedAt, item.coordinate]); } for (const item of decisions) await this.store.connection.run("INSERT INTO tool_failure_decisions VALUES (?, ?, ?, ?, ?, ?)", [order++, item.candidateId, item.fingerprint, item.outcome, item.recordedAt, item.effectiveAt ?? null]); }
	async candidates(): Promise<ToolFailureCandidate[]> { const observations = await this.rows("SELECT * FROM tool_failure_observations ORDER BY append_order"); const decisions = await this.rows("SELECT * FROM tool_failure_decisions ORDER BY append_order"); const latestObservations = new Map<string, ToolFailureObservation>(); for (const row of observations) latestObservations.set(String(row.candidate_id), { candidateId: String(row.candidate_id), fingerprint: String(row.fingerprint), toolName: String(row.tool_name), message: String(row.message), sessionId: String(row.session_id), observedAt: String(row.observed_at), coordinate: String(row.coordinate) }); const latestDecisions = new Map<string, Record<string, unknown>>(); for (const row of decisions) latestDecisions.set(String(row.candidate_id), row); const result: ToolFailureCandidate[] = []; for (const item of latestObservations.values()) { const latest = latestDecisions.get(item.candidateId); if (!latest || String(latest.fingerprint) !== item.fingerprint) result.push({ ...item, reason: "new" }); else if (latest.outcome === "resolved" && latest.effective_at && item.observedAt > String(latest.effective_at)) result.push({ ...item, reason: "post-effective-regression" }); } return result; }
	async close(): Promise<void> { this.store.connection.closeSync(); }
	private async nextOrder(): Promise<number> { const rows = await this.rows("SELECT COALESCE(MAX(append_order), 0) + 1 AS next_order FROM (SELECT append_order FROM tool_failure_observations UNION ALL SELECT append_order FROM tool_failure_decisions)"); return Number(rows[0]?.next_order ?? 1); }
	private async rows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> { const result = params.length ? await this.store.connection.runAndReadAll(sql, params as never) : await this.store.connection.runAndReadAll(sql); return result.getRowObjectsJS() as Record<string, unknown>[]; }
}

export async function closeToolFailureStores(): Promise<void> { for (const current of instances.values()) (await current).closeSync(); instances.clear(); }
export function registerToolFailureStoreLifecycle(pi: { on: (event: string, handler: () => Promise<void>) => unknown }): void { pi.on("session_shutdown", closeToolFailureStores); }
export function resetToolFailureStoreCacheForTests(): Promise<void> { return closeToolFailureStores(); }
