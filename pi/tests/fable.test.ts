import { describe, expect, it, vi } from "vitest";

const { discoverAgentsMock } = vi.hoisted(() => ({
	discoverAgentsMock: vi.fn(() => ({ agents: [], projectAgentsDir: null })),
}));

vi.mock("../extensions/subagent/agents.js", () => ({
	discoverAgents: discoverAgentsMock,
}));

import fableCommand, {
	improveFableBedrockError,
	sanitizeFableBedrockPayload,
} from "../extensions/fable.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

function orchestratorCtx(overrides: Record<string, unknown> = {}) {
	return createMockCtx({
		mode: "tui",
		model: { provider: "openai-codex", id: "gpt-5.6-sol" },
		...overrides,
	});
}

function hooks(thinkingLevel = "medium") {
	const pi = Object.assign(createMockPi(), {
		getThinkingLevel: vi.fn(() => thinkingLevel),
	});
	fableCommand(pi as Parameters<typeof fableCommand>[0]);
	return {
		beforeAgentStart: pi._getHook("before_agent_start")[0].handler,
		tool: pi._getHook("tool_call")[0].handler,
	};
}

describe("Fable Bedrock compatibility", () => {
	const fableModel = {
		provider: "amazon-bedrock",
		id: "us.anthropic.claude-fable-5",
	};

	it("removes deprecated temperature from Fable inference config", () => {
		expect(
			sanitizeFableBedrockPayload(
				{
					modelId: fableModel.id,
					inferenceConfig: { maxTokens: 128, temperature: 0 },
				},
				fableModel,
			),
		).toEqual({
			modelId: fableModel.id,
			inferenceConfig: { maxTokens: 128 },
		});
	});

	it("leaves other models and already-compatible payloads unchanged", () => {
		expect(
			sanitizeFableBedrockPayload(
				{ inferenceConfig: { temperature: 0 } },
				{ provider: "amazon-bedrock", id: "other-model" },
			),
		).toBeUndefined();
		expect(
			sanitizeFableBedrockPayload(
				{ inferenceConfig: { maxTokens: 128 } },
				fableModel,
			),
		).toBeUndefined();
	});

	it("replaces only opaque Fable provider errors", () => {
		expect(
			improveFableBedrockError("An unknown error occurred", fableModel),
		).toContain("did not preserve the underlying ValidationException");
		expect(
			improveFableBedrockError("Throttling error", fableModel),
		).toBeUndefined();
		expect(
			improveFableBedrockError("An unknown error occurred", {
				provider: "amazon-bedrock",
				id: "other-model",
			}),
		).toBeUndefined();
	});
});

describe("fable orchestration policy", () => {
	it("adds the direct-first policy only for interactive orchestrator parents", async () => {
		const { beforeAgentStart } = hooks();
		const event = { systemPrompt: "base" };

		expect(beforeAgentStart(event, orchestratorCtx())).toMatchObject({
			systemPrompt: expect.stringContaining(
				"Work directly by default on one coherent task.",
			),
		});
		expect(
			beforeAgentStart(event, orchestratorCtx({ mode: "json" })),
		).toBeUndefined();
		for (const id of ["claude-fable-test", "claude-opus-test"]) {
			expect(
				beforeAgentStart(event, createMockCtx({ mode: "tui", model: { id } })),
			).toMatchObject({ systemPrompt: expect.any(String) });
		}
		expect(
			beforeAgentStart(
				event,
				createMockCtx({
					mode: "tui",
					model: { provider: "other", id: "gpt-5.6-sol" },
				}),
			),
		).toBeUndefined();
	});

	it("maps subagent sizes to Codex models and preserves valid explicit models", async () => {
		const { tool } = hooks();
		const cases = [
			["small", "openai-codex/gpt-5.6-luna"],
			["medium", "openai-codex/gpt-5.6-terra"],
			["large", "openai-codex/gpt-5.6-sol"],
		] as const;
		for (const [modelSize, model] of cases) {
			const event = { toolName: "subagent", input: { modelSize } };
			expect(tool(event, orchestratorCtx())).toBeUndefined();
			expect(event.input.model).toBe(model);
		}

		const explicit = {
			toolName: "subagent",
			input: { model: "openai-codex/gpt-5.6-luna" },
		};
		await tool(explicit, orchestratorCtx());
		expect(explicit.input.model).toBe("openai-codex/gpt-5.6-luna");

		for (const thinkingLevel of ["off", "minimal"]) {
			const explicitWithThinkingLevel = {
				toolName: "subagent",
				input: { model: `openai-codex/gpt-5.6-sol:${thinkingLevel}` },
			};
			await tool(explicitWithThinkingLevel, orchestratorCtx());
			expect(explicitWithThinkingLevel.input.model).toBe(
				`openai-codex/gpt-5.6-sol:${thinkingLevel}`,
			);
		}

		const explicitWithUnsupportedThinkingLevel = {
			toolName: "subagent",
			input: { model: "openai-codex/gpt-5.6-sol:max" },
		};
		await tool(explicitWithUnsupportedThinkingLevel, orchestratorCtx());
		expect(explicitWithUnsupportedThinkingLevel.input.model).toBe(
			"openai-codex/gpt-5.6-terra",
		);

		for (const input of [{ model: "other/model" }, {}]) {
			const event = { toolName: "subagent", input };
			expect(tool(event, orchestratorCtx())).toBeUndefined();
			expect(event.input.model).toBe("openai-codex/gpt-5.6-terra");
		}
	});

	it("leaves allowed pinned agents unoverridden without a size", () => {
		discoverAgentsMock.mockReturnValue({
			agents: [
				{ name: "builder", model: "openai-codex/gpt-5.6-terra" },
				{ name: "validator", model: "openai-codex/gpt-5.6-terra" },
				{ name: "orchestrator", model: "openai-codex/gpt-5.6-sol" },
			],
			projectAgentsDir: null,
		});
		const { tool } = hooks();

		for (const agent of ["builder", "validator", "orchestrator"]) {
			const event = { toolName: "subagent", input: { agent, task: "work" } };
			expect(tool(event, orchestratorCtx())).toBeUndefined();
			expect(event.input).not.toHaveProperty("model");
		}
	});

	it("leaves mixed allowed parallel agents unoverridden without a size", () => {
		discoverAgentsMock.mockReturnValue({
			agents: [
				{ name: "builder", model: "openai-codex/gpt-5.6-terra" },
				{ name: "orchestrator", model: "openai-codex/gpt-5.6-sol" },
			],
			projectAgentsDir: null,
		});
		const { tool } = hooks();
		const event = {
			toolName: "subagent",
			input: {
				tasks: [
					{ agent: "builder", task: "implementation" },
					{ agent: "orchestrator", task: "coordination" },
				],
			},
		};

		expect(tool(event, orchestratorCtx())).toBeUndefined();
		expect(event.input).not.toHaveProperty("model");
	});

	it("forces Terra for a requested Fable-pinned agent without a size", () => {
		discoverAgentsMock.mockReturnValue({
			agents: [
				{
					name: "fable-worker",
					model: "amazon-bedrock/us.anthropic.claude-fable-5",
				},
			],
			projectAgentsDir: null,
		});
		const { tool } = hooks();
		const event = {
			toolName: "subagent",
			input: { agent: "fable-worker", task: "work" },
		};

		expect(tool(event, orchestratorCtx())).toBeUndefined();
		expect(event.input.model).toBe("openai-codex/gpt-5.6-terra");
	});

	it("makes Fable a foreman and retains delegation bias for Opus and Sol xhigh", () => {
		const { beforeAgentStart: solMedium } = hooks("medium");
		const { beforeAgentStart: solXhigh } = hooks("xhigh");
		const medium = solMedium({ systemPrompt: "base" }, orchestratorCtx());
		const xhigh = solXhigh({ systemPrompt: "base" }, orchestratorCtx());

		expect(medium.systemPrompt).not.toContain("Before complex repository work");
		expect(xhigh.systemPrompt).toContain("Before complex repository work");
		expect(
			solMedium(
				{ systemPrompt: "base" },
				orchestratorCtx({
					model: { provider: "openai-codex", id: "gpt-5.6-sol:xhigh" },
				}),
			).systemPrompt,
		).toContain("Before complex repository work");

		const { beforeAgentStart } = hooks("medium");
		const fable = beforeAgentStart(
			{ systemPrompt: "base" },
			createMockCtx({
				mode: "tui",
				model: {
					provider: "amazon-bedrock",
					id: "us.anthropic.claude-fable-5",
				},
			}),
		).systemPrompt;
		expect(fable).toContain(
			"Act as the foreman for a team of lower-cost Codex subagents.",
		);
		expect(fable).toContain("understanding of user intent");
		expect(fable).toContain("Minimize your own token usage");
		expect(fable).toContain(
			"delegating investigation, implementation, and validation",
		);
		expect(fable).toContain("Stay focused on the big picture");
		expect(fable).not.toContain("otherwise work directly");

		expect(
			beforeAgentStart(
				{ systemPrompt: "base" },
				createMockCtx({ mode: "tui", model: { id: "claude-opus-test" } }),
			).systemPrompt,
		).toContain("Before complex repository work");
	});

	it("allows direct tools while enforcing GPT-5.6 routing after delegation", () => {
		const { tool } = hooks();
		for (const toolName of ["bash", "pwsh", "edit", "write", "commit_stage"]) {
			expect(tool({ toolName, input: {} }, orchestratorCtx())).toBeUndefined();
		}
	});
});

describe("foreman command", () => {
	it("switches to Sol xhigh, enables foreman policy, and sends the task", async () => {
		const pi = Object.assign(createMockPi(), {
			getThinkingLevel: vi.fn(() => "xhigh"),
			setModel: vi.fn(async () => true),
			setThinkingLevel: vi.fn(),
		});
		fableCommand(pi as Parameters<typeof fableCommand>[0]);
		const command = pi._commands.find(
			(candidate) => candidate.name === "foreman",
		);
		if (!command) throw new Error("foreman command not registered");
		const foremanModel = {
			provider: "openai-codex",
			id: "gpt-5.6-sol",
		};
		const ctx = createMockCtx({
			modelRegistry: { getAvailable: vi.fn(() => [foremanModel]) },
		});

		await command.handler("Ship the feature", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(foremanModel);
		expect(pi.setThinkingLevel).toHaveBeenCalledWith("xhigh");
		expect(pi.sendUserMessage).toHaveBeenCalledWith("Ship the feature");

		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const result = beforeAgentStart(
			{ systemPrompt: "base" },
			orchestratorCtx({ model: foremanModel }),
		);
		expect(result.systemPrompt).toContain(
			"Act as the foreman for a team of lower-cost Codex subagents.",
		);
		expect(result.systemPrompt).toContain("Minimize your own token usage");
		expect(result.systemPrompt).toContain("follow YAGNI and KISS");
		expect(result.systemPrompt).toContain("prefer the Pareto 80/20 solution");
		expect(result.systemPrompt).toContain(
			"do not create tests that merely restate implementation details",
		);
		expect(result.systemPrompt).not.toContain("otherwise work directly");
	});
});

describe("fable command", () => {
	it("switches to Fable high and sends the original task", async () => {
		const pi = Object.assign(createMockPi(), {
			setModel: vi.fn(async () => true),
			setThinkingLevel: vi.fn(),
		});
		fableCommand(pi as Parameters<typeof fableCommand>[0]);
		const command = pi._commands.find(
			(candidate) => candidate.name === "fable",
		);
		if (!command) throw new Error("fable command not registered");
		const fableModel = {
			provider: "amazon-bedrock",
			id: "us.anthropic.claude-fable-5",
		};
		const ctx = createMockCtx({
			modelRegistry: { getAvailable: vi.fn(() => [fableModel]) },
		});

		await command.handler("Ship the feature", ctx);

		expect(pi.setModel).toHaveBeenCalledWith(fableModel);
		expect(pi.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(pi.sendUserMessage).toHaveBeenCalledWith("Ship the feature");
	});
});
