import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendDecision, candidateLedgerState, loadDecisionLedger, normalizeEvidence, selectCandidates } from "../lib/tool-failure-decisions.ts";
import { aggregateFailureOutcomes, classifyFailure, coordinateId, scanToolFailures, type FailureScan } from "../lib/tool-failure-classifier.ts";
import { createBoundedInspection, fixCheckToken, type InspectionProof } from "../lib/tool-failure-inspection.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
function scan(overrides: Partial<FailureScan["candidates"][number]> = {}, digest = "x"): FailureScan { return { schemaVersion: 1, asOf: "2026-08-25T00:00:00.000Z", timestampDiagnostics: { missing: 0, malformed: 0, future: 0 }, timestampOmissions: 0, manifestDigest: digest, sourceWindow: { first: null, last: null }, scannedResults: 0, unmatchedResults: 0, duplicateCalls: 0, malformedOmissions: 0, candidates: [{ candidateId: "one", fingerprintVersion: 1, tool: "custom", errorClass: "internal-missing-method", contract: "runtime:missing-method", classification: "candidate", occurrences: 3, sessions: 3, firstObserved: "2026-08-20T00:00:00.000Z", lastObserved: "2026-08-20T00:00:00.000Z", coordinates: ["one"], occurrences7d: 3, sessions7d: 3, occurrences14d: 3, sessions14d: 3, occurrences30d: 3, sessions30d: 3, observations: [], ...overrides }] }; }
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
	["plan_progress", "No active /plan-it lifecycle exists in this session.", "plan-not-ready", "plan:readiness", "expected"],
	["plan_progress", "plan_progress requires a canonical .specs/{slug}/plan.md path.", "plan-not-ready", "plan:readiness", "expected"],
	["plan_progress", "plan_progress ready is invalid while the lifecycle is ready.", "plan-not-ready", "plan:readiness", "expected"],
	["plan_progress", "Plan readiness requires one final completed subtractive review.", "plan-not-ready", "plan:readiness", "expected"],
	["plan_progress", "strategy is required.", "plan-not-ready", "plan:readiness", "expected"],
	["subagent_read", "Agent reviewer references unknown skill: missing-skill", "invalid-caller-contract", "caller:validation", "expected"],
	["subagent_read", "Invalid taskId for explorer: task was not found. Current choices: none.", "invalid-caller-contract", "caller:validation", "expected"],
	["subagent_read", "Invalid taskId for developer: task is owned by another root session. Current choices: none.", "invalid-caller-contract", "caller:validation", "expected"],
	["subagent_status", "processId is required; use /subagents to list tracked processes.", "invalid-caller-contract", "caller:validation", "expected"],
	["subagent_status", "sinceActivityVersion requires an exact run ID, not an orchestration ID.", "invalid-caller-contract", "caller:validation", "expected"],
	["subagent", "Validation failed for tool subagent: agent: must be equal to one of the allowed values", "requested-agent-unavailable", "subagent:agent-availability", "expected"],
	["subagent_read", "Unknown agent: reviewer. Available agents: none.", "requested-agent-unavailable", "subagent:agent-availability", "expected"],
	["subagent_read", "The governed path escapes the assigned workspace.", "governed-path-rejection", "subagent:path-boundary", "expected"],
	["subagent_write", "A child cannot widen its assigned workspace root.", "governed-path-rejection", "subagent:path-boundary", "expected"],
	["subagent", "Subagent was aborted", "operation-aborted", "subagent:aborted", "expected"],
	["subagent", "Agent failed: Error: Failed to load extension x", "extension-load-failure", "subagent:extension-load", "candidate"],
	["subagent_control", "this.broker.reconcile is not a function", "internal-missing-method", "runtime:missing-method", "candidate"],
	["web_search", "fetch failed", "external-service-failure", "web-search:request", "candidate"],
	["subagent", "Cannot launch subagent: Pi CLI entrypoint is unavailable", "required-runtime-unavailable", "runtime:availability", "candidate"],
	["bash", "Command timed out after 30 seconds", "command-timeout", "command:timeout", "expected"],
	["bash", "Blocked unsafe shell edit", "safety-block", "policy:block", "expected"],
	["bash", "Blocked delete/truncate of no-delete path (matched .gitignore)", "safety-block", "policy:block", "expected"],
	["bash", '{"outcome":"needs_approval","message":"Operator approval is required"}', "approval-required", "policy:approval", "expected"],
	["bash", "partial output\nCommand aborted", "command-aborted", "command:aborted", "expected"],
	["bash", "Working directory does not exist: C:/missing", "path-not-found", "filesystem:path-missing", "expected"],
	["bash", "Tool bash not found", "required-runtime-unavailable", "runtime:availability", "candidate"],
	["bash", "Command exited with code 1", "command-nonzero", "command:nonzero", "expected"],
	["task", "Valid runtime entered an impossible lifecycle state", "unclassified-error", "manual-review", "unclassified"],
];

describe("tool failure classifier and decisions", () => {
	it.each(classificationCases)("preserves classifier parity for %s", (tool, text, errorClass, contract, classification) => { expect(classifyFailure(tool, text)).toEqual([errorClass, contract, classification]); });
	it("adds normalized outcomes without changing the classifier tuple", () => {
		const rows = (tool: string, id: string, text: string) => [
			{ filename: `${id}.jsonl`, id: `call-${id}`, timestamp: "2026-08-25T00:00:00Z", message: { role: "assistant", content: [{ type: "toolCall", id, name: tool }] } },
			{ filename: `${id}.jsonl`, id: `result-${id}`, timestamp: "2026-08-25T00:00:01Z", message: { role: "toolResult", toolCallId: id, isError: true, content: [{ type: "text", text }] } },
		];
		const result = scanToolFailures([
			...rows("bash", "command", "Command exited with code 1"),
			...rows("custom", "internal", "this.broker.reconcile is not a function"),
			...rows("custom", "unknown", "Valid runtime entered an impossible lifecycle state"),
		], new Date("2026-08-25T00:01:00Z"));
		expect(result.schemaVersion).toBe(1);
		expect(result.candidates.map(({ outcome, actionability }) => ({ outcome, actionability }))).toEqual(expect.arrayContaining([
			{ outcome: "command-nonzero", actionability: "expected" },
			{ outcome: "infrastructure-failure", actionability: "actionable" },
			{ outcome: "unclassified", actionability: "unclassified" },
		]));
		expect(aggregateFailureOutcomes(result)).toEqual({ expectedCommand: 1, actionable: 1, expectedOther: 0, unclassified: 1, total: 3 });
	});

	it("keeps distinct task, plan, and subagent fingerprints private", () => {
		const ids = [classifyFailure("task", "scope entries must be worktree-relative"), classifyFailure("task", "instructions: must not have more than 500 characters"), classifyFailure("plan_progress", "Plan contract validation failed: x"), classifyFailure("subagent", "Subagent was aborted"), classifyFailure("subagent", "Failed to load extension x")].map(([errorClass, contract]) => `${errorClass}:${contract}`);
		expect(new Set(ids).size).toBe(5);
	});
	it("keeps inspection coordinates distinct across session files", () => {
		expect(coordinateId("entry", "call", "session-a")).not.toBe(coordinateId("entry", "call", "session-b"));
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
		for (const disposition of ["safety-rejection", "caller-contract", "cancelled"] as const) { const next = await proofFor(current); await appendDecision(file, current, "one", disposition, "authorized outcome", [], { proof: next, ...(disposition === "caller-contract" ? { effectiveAfter: "2026-08-20T00:00:00.000Z" } : {}) }); }
		expect((await loadDecisionLedger(file)).records).toHaveLength(5);
	});
	it("validates structured evidence while retaining the old persisted string encoding", () => {
		expect(normalizeEvidence([{ type: "test", text: "pnpm test focused" }, { type: "note", text: "verified rejection" }])).toEqual(["test:pnpm test focused", "note:verified rejection"]);
		expect(() => normalizeEvidence([{ type: "test", text: "" }])).toThrow("evidence item is invalid");
		expect(() => normalizeEvidence([{ type: "commit", text: "/home/private/path" }])).toThrow("evidence");
	});
	it("requires a validated ISO observation boundary for caller-contract decisions", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-boundary-")); roots.push(root); const file = path.join(root, "decisions.jsonl"); const current = scan();
		await expect(appendDecision(file, current, "one", "caller-contract", "correct rejection", [], { proof: await proofFor(current) })).rejects.toThrow("ISO observation boundary");
		const record = await appendDecision(file, current, "one", "caller-contract", "correct rejection", [], { effectiveAfter: "2026-08-20T00:00:00-04:00", proof: await proofFor(current) });
		expect(record.effectiveAfter).toBe("2026-08-20T04:00:00.000Z");
	});
	it("does not reopen a caller contract from historical aggregate snapshots", async () => {
		const current = scan({ occurrences14d: 9, sessions14d: 4, lastObserved: "2026-08-25T00:00:00.000Z" });
		const record: any = { schemaVersion: 1, candidateId: "one", fingerprintVersion: 1, disposition: "caller-contract", effectiveAfter: "2026-08-24T00:00:00.000Z" };
		expect(selectCandidates(current, [record])).toEqual([]);
	});
	it("counts only production scan observations strictly after the caller boundary", () => {
		const rows = (filename: string, id: string, timestamp: string) => [{ filename, id: `call-${id}`, timestamp, message: { role: "assistant", content: [{ type: "toolCall", id, name: "bash" }] } }, { filename, id: `result-${id}`, timestamp, message: { role: "toolResult", toolCallId: id, isError: true, content: [{ type: "text", text: "Validation failed for tool bash: command must have required properties command" }] } }];
		const current = scanToolFailures([
			...rows("old", "old", "2026-08-24T00:00:00.000Z"),
			...rows("new-a", "a", "2026-08-25T00:00:00.000Z"),
			...rows("new-b", "b", "2026-08-25T00:00:01.000Z"),
			...rows("new-c", "c", "2026-08-25T00:00:02.000Z"),
		], new Date("2026-08-25T00:01:00.000Z"));
		const candidate = current.candidates[0]!;
		const selected = selectCandidates(current, [{ schemaVersion: 1, candidateId: candidate.candidateId, fingerprintVersion: 1, disposition: "caller-contract", effectiveAfter: "2026-08-24T00:00:00.000Z" } as any]);
		expect(candidate.observations).toHaveLength(4);
		expect(selected[0]?.status).toBe("regression");
	});
	it.each(["bash", "functions.bash"])("requires a current inspected post-boundary %s success for required:command fixes", async (tool) => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-required-command-")); roots.push(root); const file = path.join(root, "decisions.jsonl"); const transcript = path.join(root, "session.jsonl");
		await fs.writeFile(transcript, [
			JSON.stringify({ role: "assistant", timestamp: "2026-08-25T00:00:00Z", content: [{ type: "toolCall", id: "failed", name: tool, arguments: {} }] }),
			JSON.stringify({ role: "toolResult", timestamp: "2026-08-25T00:00:01Z", toolCallId: "failed", isError: true, content: [{ type: "text", text: "command is a required property" }] }),
			JSON.stringify({ role: "assistant", timestamp: "2026-08-26T00:00:00Z", content: [{ type: "toolCall", id: "success", name: tool, arguments: { command: "echo fixed" } }] }),
			JSON.stringify({ role: "toolResult", timestamp: "2026-08-26T00:00:01Z", toolCallId: "success", isError: false, content: [{ type: "text", text: "ok" }] }),
		].join("\n") + "\n");
		const current = scan({ tool, errorClass: "missing-required-parameter", contract: "required:command", observations: [{ timestamp: "2026-08-25T00:00:01Z", session: "one" }] });
		const inspection = createBoundedInspection(root, { selectedCoordinates: [{ filePath: transcript, line: 2, callLine: 1, token: "one" }, { filePath: transcript, line: 4, callLine: 3, token: fixCheckToken("one"), fixCheckFor: "one" }] });
		await inspection.readSelectedTranscript("one"); const proofWithoutSuccess = inspection.issueProof(current, ["one"]);
		await expect(appendDecision(file, current, "one", "addressed", "fixed", ["test:direct check"], { effectiveAfter: "2026-08-25", proof: proofWithoutSuccess })).rejects.toThrow("ISO timestamp");
		await expect(appendDecision(file, current, "one", "addressed", "fixed", ["test:direct check"], { effectiveAfter: "2026-08-25T00:00:02Z", proof: proofWithoutSuccess })).rejects.toThrow("post-boundary Bash success");
		await inspection.readSelectedTranscript(fixCheckToken("one")); const proof = inspection.issueProof(current, ["one"]);
		const record = await appendDecision(file, current, "one", "addressed", "fixed", ["test:direct check"], { effectiveAfter: "2026-08-25T00:00:02Z", proof });
		expect(record.disposition).toBe("addressed");
		await expect(appendDecision(file, current, "one", "addressed", "fixed", ["test:direct check"], { effectiveAfter: "2026-08-26T00:00:02Z", proof })).rejects.toThrow("post-boundary Bash success");
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
	it("filters custom tools before applying the investigation limit", () => {
		const base = scan().candidates[0]!;
		const current: FailureScan = { ...scan(), candidates: [
			{ ...base, candidateId: "builtin-one", tool: "read" },
			{ ...base, candidateId: "builtin-two", tool: "subagent_read" },
			{ ...base, candidateId: "builtin-three", tool: "subagent_write" },
			{ ...base, candidateId: "custom-one", tool: "custom" },
		] };
		const state = candidateLedgerState(current, [], new Set(["custom"]));
		expect(state.actionable.map((item) => item.candidateId)).toEqual(["custom-one"]);
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
