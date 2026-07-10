import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadTeamsConfig, resolveTeam } from "./agent-team.js";
import { type AgentScope, discoverAgents } from "./subagent/agents.js";

const FABLE_MODEL_ID = "amazon-bedrock/us.anthropic.claude-fable-5";
const FABLE_THINKING_LEVEL = "high";
const DEFAULT_SUBAGENT_MODEL_ID = "openai-codex/gpt-5.6-terra";
const SUBAGENT_MODELS = {
	small: "openai-codex/gpt-5.6-luna",
	medium: DEFAULT_SUBAGENT_MODEL_ID,
	large: "openai-codex/gpt-5.6-sol",
} as const;
const DIRECT_FIRST_INSTRUCTION = [
	"Work directly by default on one coherent task.",
	"Delegate only when two or more independent work items improve latency, expertise coverage, independent verification, or parent-context use.",
	"Track actual dependencies and do not delegate work that is merely serial stages.",
	"Assignments state deliverable, scope, allowed changes, evidence, and stop condition.",
	"For broad outputs, use file-only artifacts and a synthesis child.",
].join(" ");
const DELEGATION_BIASED_INSTRUCTION = [
	"Before complex repository work, assess whether it has two or more independent work items.",
	"Delegate them in parallel when that split is material; otherwise work directly.",
].join(" ");

type SubagentInput = {
	agent?: unknown;
	team?: unknown;
	tasks?: unknown;
	chain?: unknown;
	agentScope?: unknown;
	model?: unknown;
	modelSize?: unknown;
};

type AgentRequest = { agent?: unknown };

const ALLOWED_PINNED_SUBAGENT_MODEL_RE =
	/^openai-codex\/gpt-5\.6-(?:luna|terra|sol)(?::(?:off|minimal|low|medium|high|xhigh))?$/;

function isAllowedPinnedSubagentModel(model: unknown): model is string {
	return (
		typeof model === "string" && ALLOWED_PINNED_SUBAGENT_MODEL_RE.test(model)
	);
}

function agentScopeFor(input: SubagentInput): AgentScope {
	if (
		input.agentScope === "user" ||
		input.agentScope === "project" ||
		input.agentScope === "both"
	) {
		return input.agentScope;
	}
	return "user";
}

function agentNamesFrom(items: unknown): string[] {
	if (!Array.isArray(items)) return [];
	return items.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const agent = (item as AgentRequest).agent;
		return typeof agent === "string" ? [agent] : [];
	});
}

function requestedAgentNames(input: SubagentInput): string[] {
	const chainAgents = agentNamesFrom(input.chain);
	if (chainAgents.length > 0) return chainAgents;

	const taskAgents = agentNamesFrom(input.tasks);
	if (taskAgents.length > 0) return taskAgents;

	if (typeof input.agent === "string") return [input.agent];
	if (typeof input.team !== "string") return [];

	const teams = loadTeamsConfig();
	const resolvedTeam = teams && resolveTeam(teams, input.team);
	return resolvedTeam ? [resolvedTeam[1].name] : [];
}

function preservesRequestedAgentModels(
	input: SubagentInput,
	cwd: string,
): boolean {
	const names = requestedAgentNames(input);
	if (names.length === 0) return false;

	const agents = discoverAgents(cwd, agentScopeFor(input)).agents;
	return names.every((name) => {
		const model = agents.find((agent) => agent.name === name)?.model;
		return isAllowedPinnedSubagentModel(model);
	});
}

function parseModelId(
	modelId: string,
): { provider: string; id: string } | null {
	const slash = modelId.indexOf("/");
	if (slash <= 0 || slash === modelId.length - 1) return null;
	return { provider: modelId.slice(0, slash), id: modelId.slice(slash + 1) };
}

function findModel(
	models: readonly Model<Api>[],
	modelId: string,
): Model<Api> | undefined {
	const parsed = parseModelId(modelId);
	if (!parsed) return undefined;
	return models.find(
		(model) => model.provider === parsed.provider && model.id === parsed.id,
	);
}

export function isInteractiveOrchestratorParent(ctx: {
	mode?: unknown;
	model?: { provider?: unknown; id?: unknown };
}): boolean {
	if (ctx.mode !== "tui") return false;
	const provider = ctx.model?.provider;
	const id = ctx.model?.id;
	if (typeof id !== "string") return false;
	return (
		(provider === "openai-codex" &&
			/^gpt-5\.6-sol(?::(?:off|minimal|low|medium|high|xhigh))?$/.test(id)) ||
		id.includes("claude-fable-") ||
		id.includes("claude-opus-")
	);
}

export function subagentModelFor(input: SubagentInput): string {
	if (isAllowedPinnedSubagentModel(input.model)) return input.model;
	if (typeof input.model === "string" && input.model.trim()) {
		return DEFAULT_SUBAGENT_MODEL_ID;
	}
	if (input.modelSize === "small") return SUBAGENT_MODELS.small;
	if (input.modelSize === "large") return SUBAGENT_MODELS.large;
	return DEFAULT_SUBAGENT_MODEL_ID;
}

export function isDelegationBiasedParent(
	ctx: Parameters<typeof isInteractiveOrchestratorParent>[0],
	thinkingLevel: unknown,
): boolean {
	if (!isInteractiveOrchestratorParent(ctx)) return false;
	const id = ctx.model?.id;
	if (typeof id !== "string") return false;
	if (id.includes("claude-fable-") || id.includes("claude-opus-")) return true;
	return (
		ctx.model?.provider === "openai-codex" &&
		/^gpt-5\.6-sol(?::xhigh)?$/.test(id) &&
		(thinkingLevel === "xhigh" || id.endsWith(":xhigh"))
	);
}

export default function fableCommand(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event, ctx) => {
		if (!isInteractiveOrchestratorParent(ctx)) return undefined;
		const instruction = isDelegationBiasedParent(ctx, pi.getThinkingLevel())
			? `${DIRECT_FIRST_INSTRUCTION} ${DELEGATION_BIASED_INSTRUCTION}`
			: DIRECT_FIRST_INSTRUCTION;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${instruction}`,
		};
	});

	pi.on("tool_call", (event, ctx) => {
		if (!isInteractiveOrchestratorParent(ctx)) return undefined;
		if (event.toolName === "subagent") {
			const input = event.input as SubagentInput;
			if (
				input.model === undefined &&
				input.modelSize === undefined &&
				preservesRequestedAgentModels(input, ctx.cwd)
			) {
				return undefined;
			}
			input.model = subagentModelFor(input);
			return undefined;
		}
		return undefined;
	});

	pi.registerCommand("fable", {
		description: "Switch to Fable high and send the task.",
		handler: async (args, ctx) => {
			const task = args.trim();
			if (!task) {
				ctx.ui.notify("Usage: /fable <task>", "warning");
				return;
			}

			const fableModel = findModel(
				ctx.modelRegistry.getAvailable(),
				FABLE_MODEL_ID,
			);
			if (!fableModel) {
				ctx.ui.notify(`Fable model not available: ${FABLE_MODEL_ID}`, "error");
				return;
			}

			const changed = await pi.setModel(fableModel);
			if (!changed) {
				ctx.ui.notify(
					`Could not switch to ${FABLE_MODEL_ID}. Check provider credentials.`,
					"error",
				);
				return;
			}

			pi.setThinkingLevel(FABLE_THINKING_LEVEL);
			ctx.ui.notify(
				`${FABLE_MODEL_ID}[${FABLE_THINKING_LEVEL}] orchestration started.`,
				"info",
			);
			await pi.sendUserMessage(task);
		},
	});
}
