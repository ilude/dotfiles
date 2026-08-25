import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendDecision, candidateLedgerState, loadDecisionLedger, selectCandidates } from "../lib/tool-failure-decisions.ts";
import { classifyFailure, scanToolFailures, type FailureScan } from "../lib/tool-failure-classifier.ts";
import { createBoundedInspection, type InspectionProof } from "../lib/tool-failure-inspection.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
function scan(overrides: Partial<FailureScan["candidates"][number]> = {}, digest = "x"): FailureScan { return { schemaVersion: 1, asOf: "2026-08-25T00:00:00.000Z", timestampDiagnostics: { missing: 0, malformed: 0, future: 0 }, timestampOmissions: 0, manifestDigest: digest, sourceWindow: { first: null, last: null }, scannedResults: 0, unmatchedResults: 0, duplicateCalls: 0, malformedOmissions: 0, candidates: [{ candidateId: "one", fingerprintVersion: 1, tool: "custom", errorClass: "internal-missing-method", contract: "runtime:missing-method", classification: "candidate", occurrences: 3, sessions: 3, firstObserved: "2026-08-20T00:00:00.000Z", lastObserved: "2026-08-20T00:00:00.000Z", coordinates: ["one"], occurrences7d: 3, sessions7d: 3, occurrences14d: 3, sessions14d: 3, occurrences30d: 3, sessions30d: 3, ...overrides }] }; }
async function proofFor(current: FailureScan, candidateId = "one"): Promise<InspectionProof> { const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-proof-")); roots.push(root); const file = path.join(root, "session.jsonl"); await fs.writeFile(file, "selected evidence\n"); const inspection = createBoundedInspection(root, { selectedCoordinates: [{ token: candidateId, filePath: file, line: 1 }] }); await inspection.readSelectedTranscript(candidateId); return inspection.issueProof(current, [candidateId]); }

const classificationCases: [string, string, string, string, string][] = [
	["edit", "Loaded 2 AGENTS context file(s). Retry this edit call.", "instruction-deferred", "mutation:instruction-discovery", "expected"],
	["edit", "Could not find edits[0]. The oldText must match exactly.", "exact-match-miss", "mutation:exact-match", "expected"],
	["edit", "Found 3 occurrences of edits[0]. Each oldText must be unique.", "nonunique-match", "mutation:unique-match", "expected"],
	["read", "ENOENT: no such file or directory", "path-not-found", "filesystem:path-missing", "expected"],
	["read", "Offset 20 is beyond end of file", "invalid-offset", "read:offset-range", "expected"],
	["pwsh", "pwsh exited with code 2", "command-nonzero", "command:nonzero", "expected"],
	["commit_create", "Secret scan blocked the commit: private-key.", "secret-scan-block", "commit:secret-scan", "expected"],
	["task", "Validation failed for tool task: summary is required", "invalid-caller-contract", "caller:validation", "expected"],
	["task", "scope entries must be worktree-relative", "task-boundary-rejected", "task:boundary-path", "expected"],
	["task", "Validation failed for tool task: instructions: must not have more than 500 characters", "task-instructions-too-long", "task:instructions-length", "expected"],
	["plan_progress", "Plan contract validation failed: Missing Validation", "plan-not-ready", "plan:readiness", "expected"],
	["subagent", "Validation failed for tool subagent: agent: must be equal to one of the allowed values", "requested-agent-unavailable", "subagent:agent-availability", "expected"],
	["subagent", "Subagent was aborted", "operation-aborted", "subagent:aborted", "expected"],
	["subagent", "Agent failed: Error: Failed to load extension x", "extension-load-failure", "subagent:extension-load", "candidate"],
	["subagent_control", "this.broker.reconcile is not a function", "internal-missing-method", "runtime:missing-method", "candidate"],
	["web_search", "fetch failed", "external-service-failure", "web-search:request", "candidate"],
	["subagent", "Cannot launch subagent: Pi CLI entrypoint is unavailable", "required-runtime-unavailable", "runtime:availability", "candidate"],
	["bash", "Command timed out after 30 seconds", "command-timeout", "command:timeout", "expected"],
	["bash", "Blocked unsafe shell edit", "safety-block", "policy:block", "expected"],
	["bash", '{"outcome":"needs_approval","message":"Operator approval is required"}', "approval-required", "policy:approval", "expected"],
	["bash", "partial output\nCommand aborted", "command-aborted", "command:aborted", "expected"],
	["bash", "Working directory does not exist: C:/missing", "path-not-found", "filesystem:path-missing", "expected"],
	["bash", "Tool bash not found", "required-runtime-unavailable", "runtime:availability", "candidate"],
	["bash", "Command exited with code 1", "command-nonzero", "command:nonzero", "expected"],
	["task", "Valid runtime entered an impossible lifecycle state", "unclassified-error", "manual-review", "unclassified"],
];

describe("tool failure classifier and decisions", () => {
	it.each(classificationCases)("preserves classifier parity for %s", (tool, text, errorClass, contract, classification) => { expect(classifyFailure(tool, text)).toEqual([errorClass, contract, classification]); });
	it("keeps distinct task, plan, and subagent fingerprints private", () => {
		const ids = [classifyFailure("task", "scope entries must be worktree-relative"), classifyFailure("task", "instructions: must not have more than 500 characters"), classifyFailure("plan_progress", "Plan contract validation failed: x"), classifyFailure("subagent", "Subagent was aborted"), classifyFailure("subagent", "Failed to load extension x")].map(([errorClass, contract]) => `${errorClass}:${contract}`);
		expect(new Set(ids).size).toBe(5);
	});
	it("joins calls deterministically, filters sensitive paths, and counts timestamp diagnostics", () => {
		const rows = (filename: string, timestamp: string | undefined) => [{ filename, id: "c", timestamp, message: { role: "assistant", content: [{ type: "toolCall", id: "x", name: "custom", arguments: { private: "raw" } }] } }, { filename, id: "r", timestamp, message: { role: "toolResult", toolCallId: "x", isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } }];
		const result = scanToolFailures([...rows("/home/person/session.jsonl", "2026-08-20T00:00:00Z"), ...rows("/other/session.jsonl", undefined), ...rows("/future/session.jsonl", "2030-01-01T00:00:00Z"), { filename: "/other/session.jsonl", id: "duplicate", timestamp: "2026-08-20T00:00:00Z", message: rows("/other/session.jsonl", undefined)[0].message }, { filename: "/other/session.jsonl", id: "missing", timestamp: "2026-08-20T00:00:00Z", message: { role: "toolResult", toolCallId: "missing", isError: true, content: [] } }], new Date("2026-08-25T00:00:00Z"));
		expect(result.duplicateCalls).toBe(1); expect(result.unmatchedResults).toBe(1); expect(result.timestampDiagnostics).toEqual({ missing: 1, malformed: 0, future: 1 }); expect(JSON.stringify(result)).not.toMatch(/\/home|\/other|\/future|private|"raw"/);
	});
	it("requires complete current bounded proof, rejects stale or contradictory proof, and closes the five categories", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-decisions-")); roots.push(root); const file = path.join(root, "decisions.jsonl"); const current = scan();
		await expect(appendDecision(file, current, "one", "addressed", "fixed", ["test:current"])).rejects.toThrow("inspection proof");
		const proof = await proofFor(current); await expect(appendDecision(file, scan({}, "changed"), "one", "addressed", "fixed", ["test:current"], { effectiveAfter: "2026-08-21", proof })).rejects.toThrow("inspection proof");
		await appendDecision(file, current, "one", "addressed", "fixed", ["test:current"], { effectiveAfter: "2026-08-21", proof });
		const proof2 = await proofFor(current); await appendDecision(file, current, "one", "external", "temporary service", [], { revisitAfter: "2026-09-01", proof: proof2 });
		for (const disposition of ["safety-rejection", "caller-contract", "cancelled"] as const) { const next = await proofFor(current); await appendDecision(file, current, "one", disposition, "authorized outcome", [], { proof: next }); }
		expect((await loadDecisionLedger(file)).records).toHaveLength(5);
	});
	it("preserves thresholds, expected suppression, custom-tool filtering, and stable priority", () => {
		const expected = scan({ classification: "expected", errorClass: "safety-block", occurrences14d: 9, sessions14d: 4 });
		expect(selectCandidates(expected, [])).toEqual([]);
		const model = scan({ errorClass: "missing-required-parameter", occurrences14d: 3, sessions14d: 3 });
		expect(selectCandidates(model, [], new Set(["other"]))).toEqual([]);
		expect(selectCandidates(model, [], new Set(["custom"]))).toHaveLength(1);
		const runtime = scan({ errorClass: "required-runtime-unavailable", occurrences14d: 2, sessions14d: 2 });
		const external = scan({ errorClass: "external-service-failure", occurrences7d: 3, sessions7d: 3 });
		const unclassified = scan({ classification: "unclassified", errorClass: "unclassified-error", occurrences30d: 1 });
		expect(selectCandidates(runtime, [])[0]?.reason).toBe("runtime-unavailable"); expect(selectCandidates(external, [])[0]?.reason).toBe("external-failure"); expect(selectCandidates(unclassified, [])[0]?.reason).toBe("unclassified-review");
		const multi: FailureScan = { ...scan(), candidates: [
			{ ...scan().candidates[0]!, candidateId: "ledger", fingerprintVersion: 1 },
			{ ...scan().candidates[0]!, candidateId: "internal", errorClass: "internal-missing-method", occurrences14d: 1, sessions14d: 1 },
			{ ...scan().candidates[0]!, candidateId: "runtime", errorClass: "required-runtime-unavailable", occurrences14d: 2, sessions14d: 2 },
			{ ...scan().candidates[0]!, candidateId: "unknown", classification: "unclassified", errorClass: "unclassified-error", occurrences30d: 1 },
		] };
		const ordered = selectCandidates(multi, [{ candidateId: "ledger", fingerprintVersion: 2 } as never]); expect(ordered).toHaveLength(3); expect(ordered[0]?.candidateId).toBe("ledger"); expect(ordered.map((item) => item.candidateId)).toEqual(expect.arrayContaining(["internal", "runtime"]));
	});
	it("uses latest physical order, expected suppression, revisit, changed fingerprint, and post-effective regression", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-decisions-")); roots.push(root); const file = path.join(root, "decisions.jsonl"); const current = scan();
		const first = await proofFor(current); await appendDecision(file, current, "one", "safety-rejection", "reviewed", [], { revisitAfter: "2026-09-01", proof: first });
		const second = await proofFor(current); await appendDecision(file, current, "one", "safety-rejection", "revisit now", [], { revisitAfter: "2026-08-01", proof: second });
		expect(selectCandidates(current, (await loadDecisionLedger(file)).records, undefined, new Date("2026-08-25"))[0]?.status).toBe("revisit-due");
		const addressedScan = scan({ lastObserved: "2026-08-20T00:00:00.000Z" }); const addressedProof = await proofFor(addressedScan); await appendDecision(file, addressedScan, "one", "addressed", "fixed", ["test:fix"], { effectiveAfter: "2026-08-19", proof: addressedProof });
		const regression = scan({ lastObserved: "2026-08-22T00:00:00.000Z" }); expect(selectCandidates(regression, (await loadDecisionLedger(file)).records)[0]?.status).toBe("regression");
		expect(selectCandidates(scan({ fingerprintVersion: 2 }), (await loadDecisionLedger(file)).records)[0]?.status).toBe("changed");
	});
});
