import { describe, expect, it, vi } from "vitest";

const { discoverAgentsMock } = vi.hoisted(() => ({
	discoverAgentsMock: vi.fn(() => ({ agents: [], projectAgentsDir: null })),
}));

vi.mock("../extensions/subagent/agents.js", () => ({
	discoverAgents: discoverAgentsMock,
}));

import fableCommand, {
	improveFableBedrockError,
	isFableBedrockModel,
	isBedrockClaudeRootModel,
	sanitizeFableBedrockPayload,
	subagentModelFor,
} from "../extensions/fable.ts";
import { setToolVisibilityRestriction } from "../lib/tool-activation.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const codexModels = [
	{ provider: "openai-codex", id: "gpt-5.6-luna" },
	{ provider: "openai-codex", id: "gpt-5.6-terra" },
	{ provider: "openai-codex", id: "gpt-5.6-sol" },
];
const fableModel = {
	provider: "amazon-bedrock",
	id: "us.anthropic.claude-fable-5",
};
const subscriptionOrchestratorModels = [
	fableModel,
	{ provider: "amazon-bedrock", id: "us.anthropic.claude-opus-5" },
	{ provider: "bedrock-mantle", id: "anthropic.claude-fable-5" },
	{ provider: "bedrock-mantle", id: "anthropic.claude-opus-5" },
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

	it("uses short cache points for Fable 5 and 5.1 on both Bedrock transports", () => {
		const payload = {
			system: [{ text: "prompt" }, { cachePoint: { type: "default", ttl: "1h" } }],
			messages: [
				{
					role: "user",
					content: [
						{ text: "request" },
						{ cachePoint: { type: "default", ttl: "1h" } },
					],
				},
			],
		};
		for (const model of [
			fableModel,
			{ provider: "amazon-bedrock", id: "us.anthropic.claude-fable-5-1" },
			{ provider: "bedrock-mantle", id: "anthropic.claude-fable-5" },
			{ provider: "bedrock-mantle", id: "anthropic.claude-fable-5-1" },
		]) {
			expect(sanitizeFableBedrockPayload(payload, model)).toEqual({
				system: [{ text: "prompt" }, { cachePoint: { type: "default" } }],
				messages: [
					{
						role: "user",
						content: [
							{ text: "request" },
							{ cachePoint: { type: "default" } },
						],
					},
				],
			});
		}
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
				{
					inferenceConfig: { maxTokens: 128 },
					system: [{ cachePoint: { type: "default" } }],
				},
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

describe("Bedrock Claude orchestration policy", () => {
	it("detects Fable and Opus on both Bedrock transports", () => {
		expect(isFableBedrockModel(fableModel)).toBe(true);
		for (const model of subscriptionOrchestratorModels)
			expect(isBedrockClaudeRootModel(model)).toBe(true);
		for (const model of [
			{ provider: "other", id: "us.anthropic.claude-fable-5" },
			{ provider: "amazon-bedrock", id: "claude-fable-test" },
			{ provider: "bedrock-mantle", id: "anthropic.claude-sonnet-5" },
		])
			expect(isBedrockClaudeRootModel(model)).toBe(false);
	});

	it("adds one concise delegation instruction in every runtime mode", () => {
		const { beforeAgentStart } = hooks();
		for (const model of subscriptionOrchestratorModels) {
			for (const mode of ["tui", "rpc", "json", "print"]) {
				const result = beforeAgentStart(
					{ systemPrompt: "base" },
					createMockCtx({ mode, model }),
				);
				const paragraphs = result.systemPrompt.split("\n\n");
				expect(paragraphs).toHaveLength(2);
				expect(paragraphs[0]).toBe("base");
				expect(paragraphs[1].split(/\s+/).length).toBeLessThanOrEqual(70);
			}
		}
	});

	it("removes the retired tool visibility restriction on reload", async () => {
		const pi = createMockPi();
		for (const name of ["read", "write"]) {
			pi.registerTool({
				name,
				label: name,
				description: name,
				parameters: {},
				execute: vi.fn(),
			});
		}
		setToolVisibilityRestriction(
			pi as Parameters<typeof setToolVisibilityRestriction>[0],
			"bedrock-claude-orchestrator",
			["write"],
		);
		expect(pi.getActiveTools()).toEqual(["write"]);

		fableCommand(pi as Parameters<typeof fableCommand>[0]);
		await pi._getHook("session_start")[0].handler(
			{ reason: "reload" },
			createMockCtx(),
		);

		expect(pi.getActiveTools()).toEqual(["read", "write"]);
	});

	it("allows Bedrock Claude roots to use direct tools and Team Leads", () => {
		const { tool } = hooks();
		for (const model of subscriptionOrchestratorModels) {
			for (const mode of ["tui", "rpc", "json", "print"]) {
				const ctx = createMockCtx({ mode, model });
				for (const toolName of [
					"read",
					"write",
					"bash",
					"tool_search",
					"subagent_teamlead",
				]) {
					expect(tool({ toolName, input: {} }, ctx)).toBeUndefined();
				}
			}
		}

		const coordinator = {
			toolName: "subagent",
			input: { agent: "teamlead", task: "work", role: "coordinator" },
		};
		expect(
			tool(coordinator, createMockCtx({ mode: "tui", model: fableModel })),
		).toBeUndefined();
	});

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

	it("resolves subagent sizes and leaves dynamic routing to the executor", async () => {
		const { tool } = hooks();
		const cases = [
			["small", "openai-codex/gpt-5.6-luna"],
			["medium", "openai-codex/gpt-5.6-luna"],
			["large", "openai-codex/gpt-5.6-sol"],
		] as const;
		for (const [modelSize, model] of cases) {
			expect(
				subagentModelFor({ modelSize }, codexModels, codexModels[2]),
			).toBe(model);
			const event = { toolName: "subagent", input: { modelSize } };
			expect(tool(event, orchestratorCtx())).toBeUndefined();
			expect(event.input).not.toHaveProperty("model");
			expect(event.input).toHaveProperty("modelPolicy", "same-family");
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

		const defaulted = {
			toolName: "subagent",
			input: {} as { modelSize?: string; modelPolicy?: string },
		};
		expect(tool(defaulted, orchestratorCtx())).toBeUndefined();
		expect(defaulted.input).toEqual({
			modelSize: "medium",
			modelPolicy: "same-family",
		});
	});

	it("uses current-provider metadata rather than the former fixed ladder", () => {
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
		expect(subagentModelFor({ modelSize: "large" }, models, models[1])).toBe(
			"anthropic/claude-opus-4-6",
		);
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
					{ agent: "teamlead", task: "coordination" },
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
