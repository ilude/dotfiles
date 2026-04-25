/**
 * Behavioral tests for context.ts buildContextBuckets.
 *
 * Per Phase 2 plan T3 AC#3: an estimate run produces an array where each
 * element has a label (string), tokens (number), and details (string)
 * field. The test asserts the per-bucket shape, not just array length.
 *
 * Fake entry shape mirrors Pi's session-log format: every entry is wrapped
 * as `{ type: "message", message: { role, content | toolName, ... } }`
 * where role is "user" | "assistant" | "toolResult" | "bashExecution".
 */
import { describe, it, expect } from "vitest";
import { buildContextBuckets, type Bucket } from "../extensions/context.ts";

function userMessage(text: string): Record<string, any> {
	return {
		type: "message",
		message: { role: "user", content: [{ type: "text", text }] },
	};
}

function assistantText(text: string): Record<string, any> {
	return {
		type: "message",
		message: { role: "assistant", content: [{ type: "text", text }] },
	};
}

function assistantToolCall(name: string, args: Record<string, any>): Record<string, any> {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", name, arguments: args }],
		},
	};
}

function toolResult(text: string, toolName = "read"): Record<string, any> {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName,
			content: [{ type: "text", text }],
		},
	};
}

function assertValidBucket(b: Bucket): void {
	expect(typeof b.label).toBe("string");
	expect(b.label.length).toBeGreaterThan(0);
	expect(typeof b.tokens).toBe("number");
	expect(b.tokens).toBeGreaterThanOrEqual(0);
	expect(Number.isFinite(b.tokens)).toBe(true);
	expect(typeof b.details).toBe("string");
}

describe("context extension: buildContextBuckets", () => {
	it("returns an array of well-formed Bucket objects", () => {
		const entries = [userMessage("hello"), assistantText("hi there")];
		const buckets = buildContextBuckets(entries, "you are a helpful assistant");
		expect(Array.isArray(buckets)).toBe(true);
		expect(buckets.length).toBeGreaterThan(0);
		for (const b of buckets) assertValidBucket(b);
	});

	it("contains a labeled bucket for the system prompt", () => {
		const buckets = buildContextBuckets([], "system text here");
		const systemBucket = buckets.find((b) => /system/i.test(b.label));
		expect(systemBucket).toBeDefined();
		assertValidBucket(systemBucket!);
		expect(systemBucket!.tokens).toBeGreaterThan(0);
	});

	it("preserves the system prompt bucket even with empty inputs", () => {
		const buckets = buildContextBuckets([], "");
		// System prompt is always retained even at zero tokens; other zero
		// buckets are filtered out by buildContextBuckets.
		expect(buckets.length).toBeGreaterThan(0);
		expect(buckets.find((b) => /system/i.test(b.label))).toBeDefined();
		for (const b of buckets) assertValidBucket(b);
	});

	it("attributes user message text to a user-labeled bucket", () => {
		const userText = "this is a unique user message that approximates many tokens";
		const buckets = buildContextBuckets([userMessage(userText)], "");
		const userBucket = buckets.find((b) => /user/i.test(b.label));
		expect(userBucket).toBeDefined();
		expect(userBucket!.tokens).toBeGreaterThan(0);
	});

	it("attributes tool call arguments to a tool-call-labeled bucket", () => {
		const buckets = buildContextBuckets(
			[assistantToolCall("read", { path: "/some/path/that/has/non/trivial/length.ts" })],
			"",
		);
		const toolCallBucket = buckets.find((b) => /tool calls/i.test(b.label));
		expect(toolCallBucket).toBeDefined();
		expect(toolCallBucket!.tokens).toBeGreaterThan(0);
	});

	it("attributes tool result text to a tool-result-labeled bucket", () => {
		const buckets = buildContextBuckets(
			[toolResult("ten thousand bytes of file content here for tokens", "read")],
			"",
		);
		const toolResultBucket = buckets.find((b) => /tool results/i.test(b.label));
		expect(toolResultBucket).toBeDefined();
		expect(toolResultBucket!.tokens).toBeGreaterThan(0);
	});
});
