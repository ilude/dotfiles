import { describe, expect, it } from "vitest";
import { validateCommitMessage } from "../lib/commit/message.ts";

describe("commit message validation", () => {
	it("rejects non-conventional subjects", () => {
		expect(validateCommitMessage("Ignore generated menos status").valid).toBe(false);
	});

	it("accepts conventional subjects", () => {
		expect(validateCommitMessage("docs(workflow): harden pi workflow validation").valid).toBe(true);
	});
});
