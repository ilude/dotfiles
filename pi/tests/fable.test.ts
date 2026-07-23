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

const codexModels = [
	{ provider: "openai-codex", id: "gpt-5.6-luna" },
	{ provider: "openai-codex", id: "gpt-5.6-terra" },
	{ provider: "openai-codex", id: "gpt-5.6-sol" },
];

function orchestratorCtx(overrides: Record<string, unknown> = {}) {
	return createMockCtx({
		mode: "tui",
		model: codexModels[2],
		modelRegistry: { getAvailable: vi.fn(() => codexModels) },
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
	it("does not append orchestration guidance for ordinary parents", () => {
		const { beforeAgentStart } = hooks();
		const event = { systemPrompt: "base" };

		expect(beforeAgentStart(event, orchestratorCtx())).toBeUndefined();
		expect(
			beforeAgentStart(event, orchestratorCtx({ mode: "json" })),
		).toBeUndefined();
		expect(
			beforeAgentStart(
				event,
				createMockCtx({ mode: "tui", model: { id: "claude-opus-test" } }),
			),
		).toBeUndefined();
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

	it("resolves subagent sizes from available models and preserves explicit models", async () => {
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

		for (const model of ["openai-codex/gpt-5.6-sol:max", "other/model"]) {
			const event = { toolName: "subagent", input: { model } };
			expect(tool(event, orchestratorCtx())).toBeUndefined();
			expect(event.input.model).toBe(model);
		}

		const defaulted = { toolName: "subagent", input: {} as { model?: string } };
		expect(tool(defaulted, orchestratorCtx())).toBeUndefined();
		expect(defaulted.input.model).toBe("openai-codex/gpt-5.6-terra");
	});

	it("uses current-provider metadata rather than the former fixed ladder", () => {
		const { tool } = hooks();
		const models = [
			{
				provider: "anthropic",
				id: "claude-haiku-4-6",
				contextWindow: 200_000,
				cost: { input: 1, output: 5 },
			},
			{
				provider: "anthropic",
				id: "claude-opus-4-6",
				reasoning: true,
				contextWindow: 200_000,
				maxTokens: 32_000,
				cost: { input: 15, output: 75 },
			},
		];
		const event = {
			toolName: "subagent",
			input: { modelSize: "large" },
		};
		const ctx = orchestratorCtx({
			model: models[1],
			modelRegistry: { getAvailable: vi.fn(() => models) },
		});

		expect(tool(event, ctx)).toBeUndefined();
		expect(event.input).toHaveProperty("model", "anthropic/claude-opus-4-6");
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

	it("preserves a requested agent model without a size", () => {
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
		expect(event.input).not.toHaveProperty("model");
	});

	it("adds foreman guidance only for Fable or explicit foreman mode", () => {
		const { beforeAgentStart } = hooks("medium");
		expect(
			beforeAgentStart({ systemPrompt: "base" }, orchestratorCtx()),
		).toBeUndefined();

		const fable = beforeAgentStart(
			{ systemPrompt: "base" },
			createMockCtx({
				mode: "tui",
				model: {
					provider: "amazon-bedrock",
					id: "us.anthropic.claude-fable-5",
				},
			}),
		)?.systemPrompt;
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
	it("reports the shared policy diagnostic when Fable is unavailable", async () => {
		const pi = Object.assign(createMockPi(), {
			setModel: vi.fn(async () => true),
			setThinkingLevel: vi.fn(),
		});
		fableCommand(pi as Parameters<typeof fableCommand>[0]);
		const command = pi._commands.find(
			(candidate) => candidate.name === "fable",
		);
		if (!command) throw new Error("fable command not registered");
		const ctx = createMockCtx({
			modelRegistry: { getAvailable: vi.fn(() => []) },
		});

		await command.handler("Ship the feature", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining(
				"requires amazon-bedrock/us.anthropic.claude-fable-5",
			),
			"error",
		);
		expect(pi.setModel).not.toHaveBeenCalled();
	});

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
