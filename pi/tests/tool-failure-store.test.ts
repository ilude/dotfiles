import { describe, expect, it } from "vitest";
import { scanToolFailures, selectedFailureCoordinates } from "../lib/tool-failure-classifier.ts";

describe("tool-failure session reader", () => {
	it("keeps classifier output and selects opaque transcript coordinates without persistence", () => {
		const rows = [
			{ filename: "/sessions/one.jsonl", id: "call-entry", lineNumber: 2, timestamp: "2026-08-20T00:01:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "one", name: "custom" }] } },
			{ filename: "/sessions/one.jsonl", id: "result-entry", lineNumber: 3, timestamp: "2026-08-20T00:02:00Z", message: { role: "toolResult", toolCallId: "one", isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } },
		];
		const scan = scanToolFailures(rows);
		const candidate = scan.candidates[0]!;
		expect(candidate).toMatchObject({ tool: "custom", occurrences: 1, firstObserved: "2026-08-20T00:02:00Z" });
		const selected = selectedFailureCoordinates(scan, rows, [candidate.candidateId]);
		expect(selected.get(candidate.candidateId)).toEqual([{ filePath: rows[1].filename, line: 3, callLine: 2, token: candidate.coordinates[0] }]);
	});

	it("preserves newest ordering, timestamp diagnostics, and coordinate bounds", () => {
		const call = (filename: string, id: string) => ({ filename, id: `call-${id}`, timestamp: null, message: { role: "assistant", content: [{ type: "toolCall", id, name: "custom" }] } });
		const failure = (filename: string, id: string, timestamp: string | null) => ({ filename, id: `result-${id}`, timestamp, message: { role: "toolResult", toolCallId: id, isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } });
		const scan = scanToolFailures([
			call("z-session", "old"), failure("z-session", "old", "2026-08-20T00:00:00Z"),
			call("a-session", "new"), failure("a-session", "new", "2026-08-25T00:00:00Z"),
			call("b-session", "tie"), failure("b-session", "tie", "2026-08-25T00:00:00Z"),
			call("c-session", "invalid"), failure("c-session", "invalid", "not-a-date"),
		], new Date("2026-08-25T00:01:00Z"));
		expect(scan.candidates[0]?.lastObserved).toBe("2026-08-25T00:00:00Z");
		expect(scan.timestampDiagnostics).toMatchObject({ malformed: 1 });
		expect(scan.candidates[0]?.coordinates).toHaveLength(3);
	});
});
