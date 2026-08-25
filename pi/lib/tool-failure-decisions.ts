import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_INVESTIGATION_CANDIDATES, type ClassifiedFailure, type FailureScan } from "./tool-failure-classifier.ts";
import { parseLedgerDate, safeLedgerText } from "./tool-failure-classifier.ts";
import { isInspectionProof, type InspectionProof } from "./tool-failure-inspection.ts";

export const LEDGER_SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 5_000;

export type Decision = {
	schemaVersion: 1;
	recordId: string;
	candidateId: string;
	fingerprintVersion: number;
	decidedAt: string;
	disposition: "expected" | "safety-rejection" | "caller-contract" | "cancelled" | "external" | "addressed";
	reason: string;
	evidence: string[];
	effectiveAfter?: string;
	revisitAfter?: string;
};

export type LedgerRead = { records: Decision[]; diagnostics: { line: number; error: string }[] };

export async function loadDecisionLedger(filePath: string): Promise<LedgerRead> {
	let text: string;
	try { text = await fs.readFile(filePath, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [], diagnostics: [] }; throw error; }
	const lines = text.split(/\n/); const records: Decision[] = []; const diagnostics: LedgerRead["diagnostics"] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]; if (!line.trim()) continue;
		try {
			const value: unknown = JSON.parse(line); if (!value || typeof value !== "object" || (value as Record<string, unknown>).schemaVersion !== LEDGER_SCHEMA_VERSION) throw new Error("unsupported-schema");
			records.push(value as Decision);
		} catch { if (i === lines.length - 1 && !text.endsWith("\n")) diagnostics.push({ line: i + 1, error: "incomplete-trailing-record" }); else diagnostics.push({ line: i + 1, error: "malformed" }); }
	}
	return { records, diagnostics };
}

async function lock(filePath: string): Promise<() => Promise<void>> {
	const lockPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.lock`); await fs.mkdir(path.dirname(filePath), { recursive: true }); const deadline = Date.now() + LOCK_TIMEOUT_MS;
	while (true) { try { const handle = await fs.open(lockPath, "wx"); await handle.close(); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw new Error(`timed out waiting for ledger lock: ${lockPath}`); await new Promise((resolve) => setTimeout(resolve, 25)); } }
	return async () => { await fs.rm(lockPath, { force: true }); };
}

export async function appendDecision(filePath: string, scan: FailureScan, candidateId: string, disposition: Decision["disposition"], reason: string, evidence: readonly string[] = [], options: { effectiveAfter?: string; revisitAfter?: string; decidedAt?: string; proof?: InspectionProof } = {}): Promise<Decision> {
	const candidate = scan.candidates.find((item) => item.candidateId === candidateId); if (!candidate) throw new Error(`unknown candidate ID: ${candidateId}`);
	if (!["expected", "safety-rejection", "caller-contract", "cancelled", "external", "addressed"].includes(disposition)) throw new Error("unsupported decision category");
	const proof = options.proof; if (!proof || !isInspectionProof(proof) || proof.scanDigest !== scan.manifestDigest || !proof.candidateIds.includes(candidateId)) throw new Error("decision requires current bounded inspection proof");
	if (proof.candidateIds.some((id) => !scan.candidates.some((item) => item.candidateId === id))) throw new Error("inspection proof contains an unknown candidate");
	if (proof.candidateIds.some((id) => proof.fingerprints[id] !== scan.candidates.find((item) => item.candidateId === id)?.fingerprintVersion)) throw new Error("inspection proof fingerprint is stale");
	const safeReason = safeLedgerText(reason, "reason"); const safeEvidence = evidence.map((item) => { if (!/^(commit|test|issue|note):/.test(item)) throw new Error("evidence must be typed as commit:, test:, issue:, or note:"); return safeLedgerText(item, "evidence"); });
	const effectiveAfter = parseLedgerDate(options.effectiveAfter, "effective-after"); const revisitAfter = parseLedgerDate(options.revisitAfter, "revisit-after");
	if (disposition === "addressed" && (!safeEvidence.length || !effectiveAfter)) throw new Error("addressed decisions require typed evidence and effective-after");
	if (disposition === "external" && !revisitAfter) throw new Error("external decisions require revisit-after");
	if (["expected", "safety-rejection", "caller-contract", "cancelled"].includes(disposition) && effectiveAfter) throw new Error("non-fix decisions cannot set effective-after");
	const record: Decision = { schemaVersion: 1, recordId: randomUUID(), candidateId, fingerprintVersion: candidate.fingerprintVersion, decidedAt: options.decidedAt ?? new Date().toISOString(), disposition, reason: safeReason, evidence: safeEvidence, ...(effectiveAfter ? { effectiveAfter } : {}), ...(revisitAfter ? { revisitAfter } : {}) };
	const release = await lock(filePath);
	try { const handle = await fs.open(filePath, "a"); try { await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); } } finally { await release(); }
	return record;
}

type Status = "changed" | "regression" | "revisit-due" | "undecided";
export type SelectedCandidate = ClassifiedFailure & { status: Status; reason: string; priority: number };

function latest(records: readonly Decision[]): Map<string, Decision> { const map = new Map<string, Decision>(); for (const record of records) map.set(record.candidateId, record); return map; }
function gate(candidate: ClassifiedFailure, status: Status): string | null { if (status === "changed") return "ledger-changed"; if (status === "regression") return "ledger-regression"; if (status === "revisit-due") return "ledger-revisit"; if (!candidate.occurrences30d) return "stale"; if (candidate.errorClass === "internal-missing-method" && candidate.occurrences14d >= 1) return "internal-contract-defect"; if (candidate.errorClass === "required-runtime-unavailable" && candidate.sessions14d >= 2) return "runtime-unavailable"; if (candidate.errorClass === "external-service-failure" && (candidate.sessions7d >= 3 || candidate.sessions30d >= 10)) return "external-failure"; if (candidate.classification === "unclassified") return "unclassified-review"; if (candidate.occurrences14d >= 3 && candidate.sessions14d >= 2) return "classified-recurrence"; return "below-threshold"; }
function eligibleReason(candidate: ClassifiedFailure, status: Status): string | null { const reason = gate(candidate, status); if (reason?.startsWith("ledger-") || ["internal-contract-defect", "runtime-unavailable", "external-failure", "unclassified-review", "classified-recurrence"].includes(reason ?? "")) return reason; const model = ["missing-required-parameter", "governed-path-rejection", "stale-manager-contract"].includes(candidate.errorClass); const retry = ["exact-match-miss", "nonunique-match", "invalid-caller-contract", "plan-not-ready", "requested-agent-unavailable", "task-boundary-rejected", "task-instructions-too-long"].includes(candidate.errorClass); if ((model || retry) && candidate.occurrences14d >= 3 && candidate.sessions14d >= 3) return model ? "model-contract-friction" : "retry-ceremony"; return null; }
export function selectCandidates(scan: FailureScan, records: readonly Decision[], toolNames?: ReadonlySet<string>, today = new Date()): SelectedCandidate[] {
	const map = latest(records); const selected: SelectedCandidate[] = [];
	for (const candidate of scan.candidates) {
		if (toolNames && !toolNames.has(candidate.tool)) continue; const decision = map.get(candidate.candidateId); let status: Status = "undecided";
		if (decision) { if (decision.fingerprintVersion !== candidate.fingerprintVersion) status = "changed"; else if (decision.disposition === "addressed") { if (decision.effectiveAfter && candidate.lastObserved && candidate.lastObserved.slice(0, 10) > decision.effectiveAfter) status = "regression"; else continue; } else if (decision.disposition === "external" || decision.disposition === "expected" || decision.disposition === "safety-rejection" || decision.disposition === "cancelled" || decision.disposition === "caller-contract") { if (decision.revisitAfter && decision.revisitAfter <= today.toISOString().slice(0, 10)) status = "revisit-due"; else continue; } }
		const reason = eligibleReason(candidate, status); if (!reason) continue;
		const expectedStructural = ["model-contract-friction", "retry-ceremony"].includes(reason);
		if (candidate.classification === "expected" && !expectedStructural && !status.startsWith("changed") && !status.startsWith("regression") && !status.startsWith("revisit")) continue;
		const priority = reason.startsWith("ledger-") ? 0 : ["internal-contract-defect", "runtime-unavailable"].includes(reason) ? 1 : ["model-contract-friction", "retry-ceremony"].includes(reason) ? 2 : 3; selected.push({ ...candidate, status, reason, priority });
	}
	const windowCounts = (item: SelectedCandidate): [number, number] => {
		const window = item.reason === "external-failure" && item.sessions7d >= 3 ? "7d" : item.reason.startsWith("ledger-") || item.reason === "unclassified-review" ? "30d" : "14d";
		return [item[`sessions${window}` as "sessions7d" | "sessions14d" | "sessions30d"], item[`occurrences${window}` as "occurrences7d" | "occurrences14d" | "occurrences30d"]];
	};
	return selected.sort((a, b) => { const [as, ao] = windowCounts(a); const [bs, bo] = windowCounts(b); return a.priority - b.priority || bs - as || bo - ao || a.candidateId.localeCompare(b.candidateId); }).slice(0, MAX_INVESTIGATION_CANDIDATES);
}

export function candidateLedgerState(scan: FailureScan, records: readonly Decision[], today = new Date()): { actionable: SelectedCandidate[]; suppressed: { unchanged: number; resolved: number } } { const actionable = selectCandidates(scan, records, undefined, today); const ids = new Set(actionable.map((x) => x.candidateId)); const map = latest(records); let unchanged = 0, resolved = 0; for (const c of scan.candidates) { if (ids.has(c.candidateId)) continue; const d = map.get(c.candidateId); if (!d) continue; if (d.disposition === "addressed") resolved++; else unchanged++; } return { actionable, suppressed: { unchanged, resolved } }; }
