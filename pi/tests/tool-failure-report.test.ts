import { describe, expect, it } from "vitest";
import { buildDiagnosticPrompt, formatLocalLastSeen, renderDiagnosticReport, verdictForDecision } from "../lib/tool-failure-report.ts";

describe("tool-failure semantic report", () => {
	it("uses one allowed verdict and a local last-seen timestamp per finding", () => {
		const report = renderDiagnosticReport([{ title: "Missing command", verdict: "Failing", lastSeen: "2026-08-25T21:07:27.000Z", explanation: "The workflow rejected a call without its required command." }], "the active provider");
		expect(report).toContain("Failing - Last seen:");
		expect(report).toContain(formatLocalLastSeen("2026-08-25T21:07:27.000Z"));
		expect(report).toContain("The diagnostic run changed no code.");
		expect(report).not.toMatch(/addressed|disposition|ledger|future-scan/i);
	});
	it.each(["Fixed", "Expected", "External"] as const)("requires direct proof for %s", (verdict) => {
		expect(() => renderDiagnosticReport([{ title: "Finding", verdict, lastSeen: "2026-08-25T21:07:27Z", explanation: "A concise explanation." }])).toThrow("direct verification");
	});
	it("does not manufacture action options when none remain", () => {
		const report = renderDiagnosticReport([{ title: "Unresolved", verdict: "Unresolved", lastSeen: "2026-08-25T21:07:27Z", explanation: "The evidence does not establish a safe conclusion." }]);
		expect(report).not.toContain("Recommendation:");
	});
	it("gives the active model opaque coordinate tokens without source paths", () => {
		const prompt = buildDiagnosticPrompt([{ candidateId: "candidate-1", tool: "custom", errorClass: "internal-missing-method", reason: "internal-contract-defect", lastObserved: "2026-08-20T00:00:00Z" } as any], "the active provider", new Map([["candidate-1", ["opaque-token"]]]));
		expect(prompt).toContain("opaque-token");
		expect(prompt).not.toContain("/private/session.jsonl");
		expect(prompt).toContain("Read the selected failure evidence yourself");
		expect(prompt).toContain("Provider boundary");
	});
	it("maps all authorized persisted categories to the human verdict vocabulary", () => {
		expect(verdictForDecision("addressed")).toBe("Fixed");
		expect(verdictForDecision("expected")).toBe("Expected");
		expect(verdictForDecision("caller-contract")).toBe("Expected");
		expect(verdictForDecision("cancelled")).toBe("Expected");
		expect(verdictForDecision("external")).toBe("External");
	});
});
