import { describe, expect, it } from "vitest";
import { validateCommitMessage } from "../lib/commit/message.ts";

describe("commit message validation", () => {
	// Constraint: valid conventional type prefix
	it("accepts conventional subjects", () => {
		expect(validateCommitMessage("docs(workflow): harden pi workflow validation").valid).toBe(true);
	});
	it("accepts wip subjects", () => {
		expect(validateCommitMessage("wip: save tui latency instrumentation").valid).toBe(true);
	});
	it("rejects unknown type", () => {
		expect(validateCommitMessage("Ignore generated menos status").valid).toBe(false);
	});

	// Constraint: non-empty scope
	it("accepts type with non-empty scope", () => {
		expect(validateCommitMessage("fix(auth): correct token expiry").valid).toBe(true);
	});
	it("rejects empty scope fix():", () => {
		expect(validateCommitMessage("fix(): correct token expiry").valid).toBe(false);
	});

	// Constraint: lowercase or digit description start
	it("accepts description starting with digit", () => {
		expect(validateCommitMessage("chore: 2fa cleanup").valid).toBe(true);
	});
	it("rejects uppercase description start", () => {
		expect(validateCommitMessage("fix(auth): Correct token expiry").valid).toBe(false);
	});

	// Constraint: subject <= 72 chars description length (description portion up to 72 chars total)
	it("accepts description exactly at limit", () => {
		// "feat: " = 6 chars; description = 72 chars => subject = 78 chars total
		const desc = "a".repeat(72);
		expect(validateCommitMessage(`feat: ${desc}`).valid).toBe(true);
	});
	it("rejects subject with description exceeding 72 chars", () => {
		const desc = "a".repeat(73);
		expect(validateCommitMessage(`feat: ${desc}`).valid).toBe(false);
	});

	// Constraint: non-empty subject
	it("rejects empty input", () => {
		expect(validateCommitMessage("").valid).toBe(false);
	});
	it("rejects whitespace-only subject", () => {
		expect(validateCommitMessage("   ").valid).toBe(false);
	});

	// Constraint: colon+space separator
	it("accepts type without scope", () => {
		expect(validateCommitMessage("chore: update dependencies").valid).toBe(true);
	});
	it("rejects missing space after colon", () => {
		expect(validateCommitMessage("fix:correct token expiry").valid).toBe(false);
	});
});
