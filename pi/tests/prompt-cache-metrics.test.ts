import { beforeEach, describe, expect, it, vi } from "vitest";

const recordEvent = vi.hoisted(() => vi.fn());
vi.mock("../lib/metrics.ts", () => ({ recordEvent }));

import sessionConfigurationFingerprint from "../extensions/session-configuration-fingerprint.ts";
import { orderedToolsetFingerprint } from "../lib/tool-activation.ts";
import { splitDeferredTools } from "../node_modules/@earendil-works/pi-ai/dist/utils/deferred-tools.js";
import { wrapRegisteredTool } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/wrapper.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

function context() {
	return createMockCtx({
		model: { provider: "openai-codex", id: "gpt-5.6-sol" },
		sessionManager: { getSessionId: () => "session-1" },
	});
}

function hook(pi: ReturnType<typeof createMockPi>, name: string): Function {
	const registered = pi._getHook(name)[0];
	if (!registered) throw new Error(`Missing ${name} hook`);
	return registered.handler;
}

describe("prompt cache request metrics", () => {
	beforeEach(() => recordEvent.mockClear());

	it("records one bounded event per completed Codex request and preserves unavailable usage", async () => {
		const pi = createMockPi();
		sessionConfigurationFingerprint(pi as Parameters<typeof sessionConfigurationFingerprint>[0]);
		const ctx = context();
		const turnStart = hook(pi, "turn_start");
		const beforeRequest = hook(pi, "before_provider_request");
		const messageEnd = hook(pi, "message_end");
		const request = {
			instructions: "stable instructions",
			tools: [{ name: "read" }, { name: "tool_search" }],
			input: [
				{ role: "user", content: "private prompt" },
				{ role: "user", content: "<!-- pi-runtime-context:goal -->\nGoal A" },
			],
		};

		await turnStart({}, ctx);
		await beforeRequest({ payload: request }, ctx);
		await messageEnd({ message: { role: "assistant", id: "message-1", usage: { input: 10, cacheRead: 8, cacheWrite: 2 } } }, ctx);
		await turnStart({}, ctx);
		await beforeRequest({ payload: request }, ctx);
		await messageEnd({ message: { role: "assistant", id: "message-2", usage: {} } }, ctx);
		await turnStart({}, ctx);
		await beforeRequest({
			payload: {
				...request,
				tools: [{ name: "read" }],
				input: [
					{ role: "user", content: "private prompt" },
					{ role: "user", content: "<!-- pi-runtime-context:goal -->\nGoal B" },
				],
			},
		}, ctx);
		await messageEnd({
			message: {
				role: "assistant",
				usage: { input: 12, cacheRead: 0, cacheWrite: 0 },
			},
		}, ctx);
		await messageEnd({ message: { role: "assistant", id: "duplicate" } }, ctx);

		expect(recordEvent).toHaveBeenCalledTimes(3);
		expect(recordEvent.mock.calls.map(([value]) => value.event)).toEqual([
			"prompt_cache_request",
			"prompt_cache_request",
			"prompt_cache_request",
		]);
		expect(recordEvent.mock.calls[0][0].data).toMatchObject({
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			input: 10,
			cacheRead: 8,
			cacheWrite: 2,
			contextChangedSincePreviousRequest: false,
			immediateToolsChangedSincePreviousRequest: false,
			messageId: "message-1",
			turnId: "turn-1",
		});
		expect(recordEvent.mock.calls[1][0].data).toMatchObject({
			input: "unavailable",
			cacheRead: "unavailable",
			cacheWrite: "unavailable",
			contextChangedSincePreviousRequest: false,
		});
		expect(recordEvent.mock.calls[2][0].data).toMatchObject({
			contextChangedSincePreviousRequest: true,
			immediateToolsChangedSincePreviousRequest: true,
			input: 12,
			cacheRead: 0,
			cacheWrite: "unavailable",
		});
		expect(recordEvent.mock.calls[2][0].data).not.toHaveProperty("messageId");
		expect(JSON.stringify(recordEvent.mock.calls)).not.toContain("private prompt");
	});

	it("uses the installed wrapper's ordered addedToolNames result for activations", async () => {
		let activeTools = ["read", "tool_search"];
		const wrapped = wrapRegisteredTool(
			{
				definition: {
					name: "tool_search",
					label: "Tool search",
					description: "Search",
					parameters: { type: "object", properties: {} },
					execute: async () => {
						activeTools = [...activeTools, "commit_plan", "review_artifact_write"];
						return { content: [] };
					},
				},
				sourceInfo: { source: "extension", origin: "top-level" },
			},
			{
				getActiveTools: () => [...activeTools],
				createContext: () => ({}),
			} as never,
		);
		const result = await wrapped.execute("call-1", {}, undefined, undefined);
		expect(result.addedToolNames).toEqual(["commit_plan", "review_artifact_write"]);
	});

	it("keeps ordered immediate tools distinct while the installed deferred path carries activations in transcript messages", () => {
		const read = { name: "read", description: "Read", parameters: {} };
		const search = { name: "tool_search", description: "Search", parameters: {} };
		const activated = { name: "commit_plan", description: "Commit", parameters: {} };
		const first = splitDeferredTools(
			{
				messages: [
					{ role: "assistant", content: [{ type: "toolCall", name: "tool_search" }] },
					{ role: "toolResult", toolCallId: "call-1", toolName: "tool_search", content: [], addedToolNames: ["commit_plan"] },
				],
				tools: [read, search, activated],
			},
			true,
		);

		expect(first.immediate.map((tool) => tool.name)).toEqual(["read", "tool_search"]);
		expect([...first.deferred.keys()]).toEqual(["commit_plan"]);
		expect(orderedToolsetFingerprint(["read", "search"])).not.toBe(
			orderedToolsetFingerprint(["search", "read"]),
		);
	});
});
