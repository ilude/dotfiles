import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FailureScan } from "./tool-failure-classifier.ts";

export type InspectionLimits = { maxItemsPerCall: number; maxBytesPerCall: number; maxItemsPerTurn: number; maxBytesPerTurn: number };
export type TranscriptCoordinate = { filePath: string; line: number; token?: string };
export type InspectionProof = { readonly candidateIds: readonly string[]; readonly fingerprints: Readonly<Record<string, number>>; readonly scanDigest: string; readonly evidenceDigest: string };
const PROOF_OBJECTS = new WeakSet<object>();
const DEFAULT_LIMITS: InspectionLimits = { maxItemsPerCall: 4, maxBytesPerCall: 8_192, maxItemsPerTurn: 12, maxBytesPerTurn: 24_576 };
function within(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".."); }
function redact(value: string): string { return value.replace(/(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").replace(/\b[A-Za-z0-9_./+=-]{32,}\b/g, "[REDACTED]"); }

export class BoundedInspection {
	private items = 0; private bytes = 0; private readonly limits: InspectionLimits; private readonly protectedRoots: string[]; private readonly transcriptRoots: string[]; private readonly selected = new Map<string, TranscriptCoordinate>(); private readonly readTokens = new Set<string>(); private contradictory = false;
	constructor(private readonly workspaceRoot: string, options: { protectedPaths?: readonly string[]; transcriptRoots?: readonly string[]; selectedCoordinates?: readonly TranscriptCoordinate[]; limits?: Partial<InspectionLimits> } = {}) {
		this.limits = { ...DEFAULT_LIMITS, ...options.limits }; this.protectedRoots = (options.protectedPaths ?? []).map((item) => path.resolve(workspaceRoot, item)); this.transcriptRoots = (options.transcriptRoots ?? []).map((item) => path.resolve(item));
		for (const coordinate of options.selectedCoordinates ?? []) this.selected.set(coordinate.token ?? `${path.resolve(coordinate.filePath)}:${coordinate.line}`, { ...coordinate, filePath: path.resolve(coordinate.filePath) });
	}
	async readRepository(filePath: string): Promise<string> { return this.read(this.authorizePath(filePath)); }
	async readTranscript(coordinate: TranscriptCoordinate): Promise<string> { const target = this.authorizeTranscriptPath(coordinate.filePath); const token = coordinate.token ?? `${target}:${coordinate.line}`; if (!this.selected.has(token)) throw new Error("transcript coordinate is not selected"); return this.readLine(token, this.selected.get(token) ?? { filePath: target, line: coordinate.line }); }
	async readSelectedTranscript(token: string): Promise<string> { const coordinate = this.selected.get(token); if (!coordinate) throw new Error("transcript coordinate is not selected"); return this.readLine(token, coordinate); }
	markContradiction(): void { this.contradictory = true; }
	issueProof(scan: FailureScan, candidateIds: readonly string[]): InspectionProof {
		if (this.contradictory) throw new Error("contradictory inspection cannot issue proof");
		const expected = new Set(candidateIds.flatMap((id) => (scan.candidates.find((candidate) => candidate.candidateId === id)?.coordinates ?? [])));
		if (expected.size === 0 || [...expected].some((token) => !this.readTokens.has(token))) throw new Error("inspection proof requires all selected evidence");
		const fingerprints: Record<string, number> = {};
		for (const id of candidateIds) { const version = scan.candidates.find((candidate) => candidate.candidateId === id)?.fingerprintVersion; if (typeof version !== "number") throw new Error("inspection proof contains an unknown candidate"); fingerprints[id] = version; }
		const evidenceDigest = createHash("sha256").update([...this.readTokens].sort().join("\0")).digest("hex"); const proof = Object.freeze({ candidateIds: [...candidateIds].sort(), fingerprints, scanDigest: scan.manifestDigest, evidenceDigest }); PROOF_OBJECTS.add(proof); return proof;
	}
	resetTurn(): void { this.items = 0; this.bytes = 0; this.readTokens.clear(); this.contradictory = false; }
	isContradictory(): boolean { return this.contradictory; }
	private authorizePath(filePath: string): string { const target = path.resolve(filePath); if (!within(this.workspaceRoot, target)) throw new Error("inspection path is outside the active workspace"); if (this.protectedRoots.some((root) => within(root, target))) throw new Error("inspection path is protected"); return target; }
	private authorizeTranscriptPath(filePath: string): string { const target = path.resolve(filePath); if (this.transcriptRoots.length === 0 ? !within(this.workspaceRoot, target) : !this.transcriptRoots.some((root) => within(root, target))) throw new Error("transcript path is outside the canonical corpus"); if (this.protectedRoots.some((root) => within(root, target))) throw new Error("inspection path is protected"); return target; }
	private async readLine(token: string, coordinate: TranscriptCoordinate): Promise<string> { this.checkItem(); const content = (await fs.readFile(coordinate.filePath, "utf8")).split(/\r?\n/)[coordinate.line - 1]; if (content === undefined) throw new Error("transcript coordinate does not exist"); const result = redact(content); this.checkBytes(result); this.items++; this.bytes += Buffer.byteLength(result, "utf8"); this.readTokens.add(token); return result; }
	private async read(target: string): Promise<string> { this.checkItem(); const result = redact(await fs.readFile(target, "utf8")); this.checkBytes(result); this.items++; this.bytes += Buffer.byteLength(result, "utf8"); return result; }
	private checkItem(): void { if (this.limits.maxItemsPerCall < 1 || this.items >= this.limits.maxItemsPerTurn) throw new Error("inspection item limit exceeded"); }
	private checkBytes(value: string): void { const bytes = Buffer.byteLength(value, "utf8"); if (bytes > this.limits.maxBytesPerCall || this.bytes + bytes > this.limits.maxBytesPerTurn) throw new Error("inspection byte limit exceeded"); }
}
export function createBoundedInspection(workspaceRoot: string, options?: ConstructorParameters<typeof BoundedInspection>[1]): BoundedInspection { return new BoundedInspection(path.resolve(workspaceRoot), options); }
export function isInspectionProof(value: unknown): value is InspectionProof { return !!value && typeof value === "object" && PROOF_OBJECTS.has(value); }
