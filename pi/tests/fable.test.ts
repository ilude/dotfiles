import { describe, expect, it, vi } from "vitest";

const { discoverAgentsMock, loadTeamsConfigMock, resolveTeamMock } = vi.hoisted(
	() => ({
		discoverAgentsMock: vi.fn(() => ({ agents: [], projectAgentsDir: null })),
		loadTeamsConfigMock: vi.fn(),
		resolveTeamMock: vi.fn(),
	}),
);

vi.mock("../extensions/subagent/agents.js", () => ({
	discoverAgents: discoverAgentsMock,
}));
vi.mock("../extensions/agent-team.js", () => ({
	loadTeamsConfig: loadTeamsConfigMock,
	resolveTeam: resolveTeamMock,
}));

import fableCommand from "../extensions/fable.ts";
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
				{ name: "coding-light", model: "openai-codex/gpt-5.6-luna" },
				{ name: "coding-medium", model: "openai-codex/gpt-5.6-terra" },
				{ name: "coding-heavy", model: "openai-codex/gpt-5.6-sol" },
			],
			projectAgentsDir: null,
		});
		const { tool } = hooks();

		for (const agent of ["coding-light", "coding-medium", "coding-heavy"]) {
			const event = { toolName: "subagent", input: { agent, task: "work" } };
			expect(tool(event, orchestratorCtx())).toBeUndefined();
			expect(event.input).not.toHaveProperty("model");
		}
	});

	it("leaves mixed allowed parallel agents unoverridden without a size", () => {
		discoverAgentsMock.mockReturnValue({
			agents: [
				{ name: "coding-light", model: "openai-codex/gpt-5.6-luna" },
				{ name: "coding-heavy", model: "openai-codex/gpt-5.6-sol" },
			],
			projectAgentsDir: null,
		});
		const { tool } = hooks();
		const event = {
			toolName: "subagent",
			input: {
				tasks: [
					{ agent: "coding-light", task: "light work" },
					{ agent: "coding-heavy", task: "heavy work" },
				],
			},
		};

		expect(tool(event, orchestratorCtx())).toBeUndefined();
		expect(event.input).not.toHaveProperty("model");
	});

	it("leaves a resolved team lead with an allowed effort pin unoverridden", () => {
		loadTeamsConfigMock.mockReturnValue({
			engineering: {
				name: "engineering-lead",
				file: "agents/engineering-lead.md",
			},
		});
		resolveTeamMock.mockReturnValue([
			"engineering",
			{ name: "engineering-lead", file: "agents/engineering-lead.md" },
		]);
		discoverAgentsMock.mockReturnValue({
			agents: [
				{ name: "engineering-lead", model: "openai-codex/gpt-5.6-sol:xhigh" },
			],
			projectAgentsDir: null,
		});
		const { tool } = hooks();
		const event = {
			toolName: "subagent",
			input: { team: "engineering", task: "work" },
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

	it("adds the delegation bias for Fable, Opus, and Sol xhigh only", () => {
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
		for (const id of ["claude-fable-test", "claude-opus-test"]) {
			const { beforeAgentStart } = hooks("medium");
			expect(
				beforeAgentStart(
					{ systemPrompt: "base" },
					createMockCtx({ mode: "tui", model: { id } }),
				).systemPrompt,
			).toContain("Before complex repository work");
		}
	});

	it("allows direct tools while enforcing GPT-5.6 routing after delegation", () => {
		const { tool } = hooks();
		for (const toolName of ["bash", "pwsh", "edit", "write", "commit_stage"]) {
			expect(tool({ toolName, input: {} }, orchestratorCtx())).toBeUndefined();
		}
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
