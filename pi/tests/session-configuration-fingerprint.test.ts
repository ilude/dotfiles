import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	recordEvent: vi.fn(),
	recordEvents: vi.fn(),
	settings: {
		enabledModels: ["openai-codex/gpt-5.6-sol"],
		metrics: { enabled: true },
	},
}));

vi.mock("../lib/metrics.ts", () => ({
	recordEvent: runtime.recordEvent,
	recordEvents: runtime.recordEvents,
}));
vi.mock("../lib/settings-loader.ts", () => ({
	loadCascadedSettings: vi.fn(() => ({
		merged: runtime.settings,
		sources: {
			user: { path: "user", loaded: true },
			project: { path: "project", loaded: true },
			local: { path: "local", loaded: false },
		},
	})),
}));

import sessionConfigurationFingerprint from "../extensions/session-configuration-fingerprint.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function registerTool(pi: ReturnType<typeof createMockPi>, name: string): void {
	pi.registerTool({
		name,
		description: name,
		parameters: {},
		execute: async () => ({ content: [] }),
	});
}

function createContext() {
	return createMockCtx({
		model: { provider: "openai-codex", id: "gpt-5.6-sol" },
		thinkingLevel: "high",
		sessionManager: { getSessionId: () => "session-1" },
	});
}

function initialEvent() {
	return {
		type: "before_agent_start",
		prompt: "Implement the request",
		systemPrompt: "System prompt secret content",
		systemPromptOptions: {
			cwd: "/test/dir",
			contextFiles: [
				{
					path: "/test/dir/AGENTS.md",
					content: "Instruction secret content",
				},
			],
		},
	};
}

function hook(pi: ReturnType<typeof createMockPi>, name: string): Function {
	const registered = pi._getHook(name)[0];
	if (!registered) throw new Error(`Missing ${name} hook`);
	return registered.handler;
}

describe("session configuration fingerprint", () => {
	beforeEach(() => {
		runtime.recordEvent.mockClear();
		runtime.settings = {
			enabledModels: ["openai-codex/gpt-5.6-sol"],
			metrics: { enabled: true },
		};
	});

	it("emits one complete initial fingerprint without raw configuration content", async () => {
		const pi = createMockPi();
		registerTool(pi, "read");
		registerTool(pi, "bash");
		sessionConfigurationFingerprint(
			pi as Parameters<typeof sessionConfigurationFingerprint>[0],
		);
		const ctx = createContext();

		await hook(pi, "session_start")({ type: "session_start" }, ctx);
		await hook(pi, "before_agent_start")(initialEvent(), ctx);
		await hook(pi, "before_agent_start")(initialEvent(), ctx);

		expect(runtime.recordEvent).toHaveBeenCalledTimes(1);
		const record = runtime.recordEvent.mock.calls[0][0];
		expect(record).toMatchObject({
			event: "configuration_fingerprint",
			session: "session-1",
			data: {
				schemaVersion: 1,
				recordKind: "initial",
				provider: "openai-codex",
				modelId: "gpt-5.6-sol",
				thinkingLevel: "high",
				systemPromptSha256: sha256("System prompt secret content"),
				contextFiles: [
					{
						path: "/test/dir/AGENTS.md",
						contentSha256: sha256("Instruction secret content"),
					},
				],
				initialToolsetSha256: sha256("bash\nread"),
				settingsSha256: sha256(
					'{"enabledModels":["openai-codex/gpt-5.6-sol"],"metrics":{"enabled":true}}',
				),
				piVersion: expect.any(String),
			},
		});
		const data = record.data as Record<string, unknown>;
		expect(data.piVersion).not.toBe("unavailable");
		expect(data.contextFiles).toHaveLength(1);
		const serialized = JSON.stringify(record);
		expect(serialized).not.toContain("System prompt secret content");
		expect(serialized).not.toContain("Instruction secret content");
		expect(serialized).not.toContain("openai-codex/gpt-5.6-sol");
	});

	it("emits one change record only for changed model or effort identities", async () => {
		const pi = createMockPi();
		sessionConfigurationFingerprint(
			pi as Parameters<typeof sessionConfigurationFingerprint>[0],
		);
		const ctx = createContext();

		await hook(pi, "before_agent_start")(initialEvent(), ctx);
		await hook(pi, "model_select")(
			{
				type: "model_select",
				model: { provider: "openai-codex", id: "gpt-5.6-sol" },
				previousModel: { provider: "openai-codex", id: "gpt-5.6-sol" },
				source: "set",
			},
			ctx,
		);
		await hook(pi, "thinking_level_select")(
			{ type: "thinking_level_select", level: "high", previousLevel: "high" },
			ctx,
		);

		await hook(pi, "model_select")(
			{
				type: "model_select",
				model: { provider: "anthropic", id: "claude-sonnet-5" },
				previousModel: { provider: "openai-codex", id: "gpt-5.6-sol" },
				source: "set",
			},
			ctx,
		);
		ctx.model = { provider: "anthropic", id: "claude-sonnet-5" };
		await hook(pi, "thinking_level_select")(
			{ type: "thinking_level_select", level: "high", previousLevel: "high" },
			ctx,
		);
		ctx.thinkingLevel = "low";
		await hook(pi, "thinking_level_select")(
			{ type: "thinking_level_select", level: "low", previousLevel: "high" },
			ctx,
		);
		await hook(pi, "thinking_level_select")(
			{ type: "thinking_level_select", level: "low", previousLevel: "low" },
			ctx,
		);

		expect(runtime.recordEvent).toHaveBeenCalledTimes(3);
		const changes = runtime.recordEvent.mock.calls
			.map(([record]) => record.data)
			.filter((data) => data.recordKind === "model_or_effort_change");
		expect(changes).toEqual([
			expect.objectContaining({
				provider: "anthropic",
				modelId: "claude-sonnet-5",
				thinkingLevel: "high",
				previousProvider: "openai-codex",
				previousModelId: "gpt-5.6-sol",
				previousThinkingLevel: "high",
			}),
			expect.objectContaining({
				provider: "anthropic",
				modelId: "claude-sonnet-5",
				thinkingLevel: "low",
				previousProvider: "anthropic",
				previousModelId: "claude-sonnet-5",
				previousThinkingLevel: "high",
			}),
		]);
	});
});
