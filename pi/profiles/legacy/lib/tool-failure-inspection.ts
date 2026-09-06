import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FailureScan } from "./tool-failure-classifier.ts";

export type InspectionLimits = { maxItemsPerCall: number; maxBytesPerCall: number; maxItemsPerTurn: number; maxBytesPerTurn: number };
export type TranscriptCoordinate = { filePath: string; line: number; callLine?: number; resultEntryId?: string; callEntryId?: string; token?: string; fixCheckFor?: string };
export type ToolFailureEnvelope = {
	tool: string;
	call: { argumentShape: unknown; timestamp: string | null };
	result: { status: "success" | "error"; text: string; timestamp: string | null };
	timestampValid: boolean;
	sessionDigest: string;
	token: string;
};
export type FixCheck = { readonly failureToken: string; readonly successToken: string; readonly failureLine: number; readonly successLine: number; readonly failure: ToolFailureEnvelope; readonly success: ToolFailureEnvelope };
export type InspectionProof = { readonly candidateIds: readonly string[]; readonly fingerprints: Readonly<Record<string, number>>; readonly scanDigest: string; readonly evidenceDigest: string; readonly fixChecks: Readonly<Record<string, FixCheck>> };
const PROOF_OBJECTS = new WeakSet<object>();
const DEFAULT_LIMITS: InspectionLimits = { maxItemsPerCall: 4, maxBytesPerCall: 8_192, maxItemsPerTurn: 12, maxBytesPerTurn: 24_576 };
function within(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".."); }
const SECRET_KEY = /(?:password|passwd|token|secret|api[_-]?key|authorization|credential|private[_-]?key)/i;
const SECRET_VALUE = /(?:bearer\s+|(?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+/i;
const MAX_FIELD_TEXT = 512;
export function fixCheckToken(failureToken: string): string { return `fix-check:${failureToken}`; }
function redact(value: string): string { return value.replace(/(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").replace(/\b[A-Za-z0-9_./+=-]{32,}\b/g, "[REDACTED]"); }
function bounded(value: unknown, key = ""): unknown {
	if (SECRET_KEY.test(key)) return "[REDACTED]";
	if (typeof value === "string") { const clean = SECRET_VALUE.test(value) ? "[REDACTED]" : redact(value); return clean.length > MAX_FIELD_TEXT ? `${clean.slice(0, MAX_FIELD_TEXT)}...[TRUNCATED]` : clean; }
	if (Array.isArray(value)) return value.slice(0, 32).map((item) => bounded(item)).concat(value.length > 32 ? ["[TRUNCATED]"] : []);
	if (value && typeof value === "object") { const result: Record<string, unknown> = {}; for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 64)) result[childKey] = bounded(childValue, childKey); if (Object.keys(value as object).length > 64) result["[TRUNCATED]"] = true; return result; }
	return value;
}
function timestamp(value: unknown): { value: string | null; valid: boolean } { if (typeof value !== "string" || !value) return { value: null, valid: false }; const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? { value, valid: false } : { value: parsed.toISOString(), valid: true }; }

export class BoundedInspection {
	private items = 0; private bytes = 0; private readonly limits: InspectionLimits; private readonly protectedRoots: string[]; private readonly transcriptRoots: string[]; private readonly selected = new Map<string, TranscriptCoordinate>(); private readonly readTokens = new Set<string>(); private readonly envelopes = new Map<string, { envelope: ToolFailureEnvelope; line: number }>(); private readonly fixChecks = new Map<string, FixCheck>(); private contradictory = false;
	constructor(private readonly workspaceRoot: string, options: { protectedPaths?: readonly string[]; transcriptRoots?: readonly string[]; selectedCoordinates?: readonly TranscriptCoordinate[]; limits?: Partial<InspectionLimits> } = {}) {
		this.limits = { ...DEFAULT_LIMITS, ...options.limits }; this.protectedRoots = (options.protectedPaths ?? []).map((item) => path.resolve(workspaceRoot, item)); this.transcriptRoots = (options.transcriptRoots ?? []).map((item) => path.resolve(item));
		for (const coordinate of options.selectedCoordinates ?? []) this.selected.set(coordinate.token ?? `${path.resolve(coordinate.filePath)}:${coordinate.line}`, { ...coordinate, filePath: path.resolve(coordinate.filePath) });
	}
	async readRepository(filePath: string): Promise<string> { return this.read(this.authorizePath(filePath)); }
	async readTranscript(coordinate: TranscriptCoordinate): Promise<string> { const target = this.authorizeTranscriptPath(coordinate.filePath); const token = coordinate.token ?? `${target}:${coordinate.line}`; if (!this.selected.has(token)) throw new Error("transcript coordinate is not selected"); return this.readLine(token, this.selected.get(token) ?? { filePath: target, line: coordinate.line }); }
	async readSelectedTranscript(token: string): Promise<string> {
		if (token.startsWith("fix-check:")) return this.readFixCheck(token);
		const coordinate = this.selected.get(token); if (!coordinate) throw new Error("transcript coordinate is not selected"); return this.readLine(token, coordinate);
	}
	markContradiction(): void { this.contradictory = true; }
	issueProof(scan: FailureScan, candidateIds: readonly string[]): InspectionProof {
		if (this.contradictory) throw new Error("contradictory inspection cannot issue proof");
		const expected = new Set(candidateIds.flatMap((id) => (scan.candidates.find((candidate) => candidate.candidateId === id)?.coordinates ?? [])));
		if (expected.size === 0 || [...expected].some((token) => !this.readTokens.has(token))) throw new Error("inspection proof requires all selected evidence");
		const fingerprints: Record<string, number> = {}; const fixChecks: Record<string, FixCheck> = {};
		for (const id of candidateIds) { const candidate = scan.candidates.find((item) => item.candidateId === id); const version = candidate?.fingerprintVersion; if (typeof version !== "number") throw new Error("inspection proof contains an unknown candidate"); fingerprints[id] = version; const check = (candidate?.coordinates ?? []).map((token) => this.fixChecks.get(token)).find((item) => item); if (candidate?.contract === "required:command" && check) fixChecks[id] = check; }
		const evidenceDigest = createHash("sha256").update([...this.readTokens].sort().join("\0")).digest("hex"); const proof = Object.freeze({ candidateIds: [...candidateIds].sort(), fingerprints, scanDigest: scan.manifestDigest, evidenceDigest, fixChecks }); PROOF_OBJECTS.add(proof); return proof;
	}
	resetTurn(): void { this.items = 0; this.bytes = 0; this.readTokens.clear(); this.envelopes.clear(); this.fixChecks.clear(); this.contradictory = false; }
	isContradictory(): boolean { return this.contradictory; }
	private authorizePath(filePath: string): string { const target = path.resolve(filePath); if (!within(this.workspaceRoot, target)) throw new Error("inspection path is outside the active workspace"); if (this.protectedRoots.some((root) => within(root, target))) throw new Error("inspection path is protected"); return target; }
	private authorizeTranscriptPath(filePath: string): string { const target = path.resolve(filePath); if (this.transcriptRoots.length === 0 ? !within(this.workspaceRoot, target) : !this.transcriptRoots.some((root) => within(root, target))) throw new Error("transcript path is outside the canonical corpus"); if (this.protectedRoots.some((root) => within(root, target))) throw new Error("inspection path is protected"); return target; }
	private async readFixCheck(token: string): Promise<string> {
		const coordinate = this.selected.get(token); const failureToken = coordinate?.fixCheckFor;
		if (!coordinate || !failureToken || coordinate.callLine === undefined) throw new Error("fix-check token is not eligible");
		const failure = this.envelopes.get(failureToken); if (!failure) throw new Error("inspect the selected failure before the fix check");
		const result = await this.readLine(token, coordinate); const success = this.envelopes.get(token);
		if (!success || success.envelope.result.status !== "success") throw new Error("fix-check coordinate is not successful");
		this.fixChecks.set(failureToken, { failureToken, successToken: token, failureLine: failure.line, successLine: success.line, failure: failure.envelope, success: success.envelope });
		return result;
	}
	private async readLine(token: string, coordinate: TranscriptCoordinate): Promise<string> {
		this.checkItem(); const lines = (await fs.readFile(coordinate.filePath, "utf8")).split(/\r?\n/);
		const entryLine = (entryId: string | undefined, fallback: number | undefined): number | undefined => {
			if (!entryId) return fallback;
			for (let index = 0; index < lines.length; index++) {
				try { if ((JSON.parse(lines[index] ?? "") as Record<string, unknown>).id === entryId) return index + 1; } catch {}
			}
			return undefined;
		};
		const resultLine = entryLine(coordinate.resultEntryId, coordinate.line); const callLine = entryLine(coordinate.callEntryId, coordinate.callLine);
		if (resultLine === undefined || (coordinate.callLine !== undefined && callLine === undefined)) throw new Error("transcript coordinate does not exist");
		const content = lines[resultLine - 1]; if (content === undefined) throw new Error("transcript coordinate does not exist");
		let result = redact(content);
		if (callLine !== undefined) {
			let call: Record<string, unknown>; let failure: Record<string, unknown>;
			try { call = JSON.parse(lines[callLine - 1] ?? "") as Record<string, unknown>; failure = JSON.parse(content) as Record<string, unknown>; } catch { throw new Error("transcript coordinate is malformed"); }
			const callMessage = call.message && typeof call.message === "object" ? call.message as Record<string, unknown> : call;
			const resultMessage = failure.message && typeof failure.message === "object" ? failure.message as Record<string, unknown> : failure;
			const callItem = Array.isArray(callMessage.content) ? callMessage.content.find((item) => item && typeof item === "object" && ["toolCall", "tool_call"].includes(String((item as Record<string, unknown>).type))) as Record<string, unknown> | undefined : undefined;
			const callTime = timestamp(call.timestamp ?? callMessage.timestamp); const resultTime = timestamp(failure.timestamp ?? resultMessage.timestamp);
			const text = Array.isArray(resultMessage.content) ? resultMessage.content.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "text").map((item) => String((item as Record<string, unknown>).text ?? "")).join(" ") : "";
			const envelope: ToolFailureEnvelope = { tool: String(callItem?.name ?? callItem?.toolName ?? "unknown"), call: { argumentShape: bounded(callItem?.arguments ?? callItem?.args ?? {}), timestamp: callTime.value }, result: { status: resultMessage.isError === true ? "error" : "success", text: bounded(text) as string, timestamp: resultTime.value }, timestampValid: resultTime.valid, sessionDigest: createHash("sha256").update(path.resolve(coordinate.filePath)).digest("hex").slice(0, 12), token };
			result = JSON.stringify(envelope); this.envelopes.set(token, { envelope, line: resultLine });
		}
		if (Buffer.byteLength(result, "utf8") > this.limits.maxBytesPerCall) {
			try { const envelope = JSON.parse(result) as ToolFailureEnvelope; envelope.call.argumentShape = { "[TRUNCATED]": true }; envelope.result.text = "[TRUNCATED]"; result = JSON.stringify(envelope); } catch { result = `${result.slice(0, Math.max(0, this.limits.maxBytesPerCall - 15))}...[TRUNCATED]`; }
		}
		this.checkBytes(result); this.items++; this.bytes += Buffer.byteLength(result, "utf8"); this.readTokens.add(token); return result;
	}
	private async read(target: string): Promise<string> { this.checkItem(); const result = redact(await fs.readFile(target, "utf8")); this.checkBytes(result); this.items++; this.bytes += Buffer.byteLength(result, "utf8"); return result; }
	private checkItem(): void { if (this.limits.maxItemsPerCall < 1 || this.items >= this.limits.maxItemsPerTurn) throw new Error("inspection item limit exceeded"); }
	private checkBytes(value: string): void { const bytes = Buffer.byteLength(value, "utf8"); if (bytes > this.limits.maxBytesPerCall || this.bytes + bytes > this.limits.maxBytesPerTurn) throw new Error("inspection byte limit exceeded"); }
}
export function createBoundedInspection(workspaceRoot: string, options?: ConstructorParameters<typeof BoundedInspection>[1]): BoundedInspection { return new BoundedInspection(path.resolve(workspaceRoot), options); }
export function isInspectionProof(value: unknown): value is InspectionProof { return !!value && typeof value === "object" && PROOF_OBJECTS.has(value); }
