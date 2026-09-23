import { describe, expect, it, vi } from "vitest";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import codexDaybreakRetry, { markDaybreakAccessErrorRetryable } from "../extensions/codex-daybreak-retry.ts";

function message(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "openai-codex-responses",
		provider: "openai-codex",
		model: "gpt-6-sol",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		errorMessage: "Codex error: Unable to verify Daybreak Blue access. Please try again.",
		timestamp: Date.now(),
		...overrides,
	};
}

describe("Daybreak access retry classification", () => {
	it.each(["gpt-5.6-sol", "gpt-6-sol"])("marks the transient Sol verification failure across family versions without repinning %s", model => {
		const original = message({ model });
		const replacement = markDaybreakAccessErrorRetryable(original);

		expect(replacement?.model).toBe(model);
		expect(replacement?.errorMessage).toBe("Codex error: Unable to verify Daybreak Blue access. Please retry your request.");
		expect(original.errorMessage).toContain("Please try again.");
	});

	it.each([
		{ provider: "amazon-bedrock" },
		{ model: "gpt-5.6-luna" },
		{ stopReason: "stop", errorMessage: undefined },
		{ errorMessage: "Codex error: account is not eligible for Daybreak Blue." },
	] satisfies Array<Partial<AssistantMessage>>)("does not broaden retries for unrelated failures: %o", overrides => {
		expect(markDaybreakAccessErrorRetryable(message(overrides))).toBeUndefined();
	});

	it("registers the rewrite at the message_end boundary before native retry classification", async () => {
		let handler: ((event: { message: AssistantMessage }) => { message?: AssistantMessage } | undefined) | undefined;
		const pi = { on: vi.fn((_event, registered) => { handler = registered; }) } as unknown as ExtensionAPI;
		codexDaybreakRetry(pi);

		expect(pi.on).toHaveBeenCalledWith("message_end", expect.any(Function));
		expect(handler?.({ message: message() })?.message?.errorMessage).toContain("retry your request");
	});
});
