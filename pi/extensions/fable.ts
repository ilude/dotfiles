import { onSessionStart } from "../lib/session-start-metrics.js";
import { registerSlashCommand } from "../lib/slash-command-echo.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type ModelLike,
	preferredModelId,
	resolveDynamicModel,
	resolveExplicitModelPolicy,
} from "../lib/model-routing.js";
import { removeToolVisibilityRestriction } from "../lib/tool-activation.js";
import { type AgentScope, discoverAgents } from "./subagent/agents.js";

const FABLE_THINKING_LEVEL = "high";
const FOREMAN_THINKING_LEVEL = "xhigh";
const UNKNOWN_PROVIDER_ERROR = "An unknown error occurred";
const FABLE_BEDROCK_UNKNOWN_ERROR =
	"Bedrock Fable request failed without provider details. The Bedrock stream adapter did not preserve the underlying ValidationException or stop reason.";
const FOREMAN_INSTRUCTION = [
	"Act as the foreman for a team of lower-cost Codex subagents.",
	"Use your stronger judgment and understanding of user intent to keep the work aligned with the requested outcome.",
	"Minimize your own token usage by delegating investigation, implementation, and validation instead of doing that work yourself.",
	"Stay focused on the big picture: divide the work, coordinate execution, resolve ambiguity, review evidence, correct course, and synthesize the final result.",
	"Keep solutions simple and proportionate: follow YAGNI and KISS, prefer the Pareto 80/20 solution, and avoid over-complication or gold-plating.",
	"Require tests that protect distinct user-visible contracts, regressions, edge cases, or safety properties; do not create tests that merely restate implementation details or add no decision-relevant confidence.",
].join(" ");
const RETIRED_SUBSCRIPTION_VISIBILITY_KEY = "bedrock-claude-orchestrator";
const BEDROCK_CLAUDE_DELEGATION_INSTRUCTION =
	"Act as the root agent and minimize total cost. Delegate substantial investigation, implementation, validation, and parallel work to the smallest capable Codex subagents. Work directly when the task is small or delegation would cost more than completing it. Own decomposition, high-level decisions, integration, and the final response. Use a Team Lead only when the work genuinely benefits from multiple independent specialists.";

type SubagentInput = {
	agent?: unknown;
	items?: unknown;
	tasks?: unknown;
	chain?: unknown;
	agentScope?: unknown;
	model?: unknown;
	modelSize?: unknown;
	modelPolicy?: unknown;
};

type AgentRequest = { agent?: unknown };

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

	const modernAgents = agentNamesFrom(input.items);
	if (modernAgents.length > 0) return modernAgents;

	const taskAgents = agentNamesFrom(input.tasks);
	if (taskAgents.length > 0) return taskAgents;

	return typeof input.agent === "string" ? [input.agent] : [];
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
		return typeof model === "string" && model.trim().length > 0;
	});
}

export function isFableBedrockModel(model?: {
	provider?: unknown;
	id?: unknown;
}): boolean {
	if (typeof model?.id !== "string") return false;
	if (model.provider === "amazon-bedrock")
		return /^us\.anthropic\.claude-fable-5(?:-1)?$/.test(model.id);
	if (model.provider === "bedrock-mantle")
		return /^anthropic\.claude-fable-5(?:-1)?$/.test(model.id);
	return false;
}

function useShortFableCache(value: unknown): unknown {
	if (Array.isArray(value)) {
		let changed = false;
		const items = value.map((item) => {
			const next = useShortFableCache(item);
			if (next !== item) changed = true;
			return next;
		});
		return changed ? items : value;
	}
	if (!value || typeof value !== "object") return value;

	let changed = false;
	const entries = Object.entries(value as Record<string, unknown>).map(
		([key, item]) => {
			if (
				key === "cachePoint" &&
				item &&
				typeof item === "object" &&
				!Array.isArray(item) &&
				"ttl" in item
			) {
				const { ttl: _ttl, ...shortCachePoint } = item as Record<
					string,
					unknown
				>;
				changed = true;
				return [key, shortCachePoint] as const;
			}
			const next = useShortFableCache(item);
			if (next !== item) changed = true;
			return [key, next] as const;
		},
	);
	return changed ? Object.fromEntries(entries) : value;
}

export function isBedrockClaudeRootModel(model?: {
	provider?: unknown;
	id?: unknown;
}): boolean {
	if (typeof model?.id !== "string") return false;
	if (model.provider === "amazon-bedrock")
		return /^us\.anthropic\.claude-(?:fable|opus)-/.test(model.id);
	if (model.provider === "bedrock-mantle")
		return /^anthropic\.claude-(?:fable|opus)-/.test(model.id);
	return false;
}

export function sanitizeFableBedrockPayload(
	payload: unknown,
	model?: { provider?: unknown; id?: unknown },
): unknown | undefined {
	if (!isFableBedrockModel(model)) return undefined;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return undefined;
	}

	const request = payload as Record<string, unknown>;
	const inferenceConfig = request.inferenceConfig;
	let compatiblePayload = useShortFableCache(request);
	if (
		inferenceConfig &&
		typeof inferenceConfig === "object" &&
		!Array.isArray(inferenceConfig) &&
		"temperature" in inferenceConfig
	) {
		const { temperature: _temperature, ...supportedInferenceConfig } =
			inferenceConfig as Record<string, unknown>;
		compatiblePayload = {
			...(compatiblePayload as Record<string, unknown>),
			inferenceConfig: supportedInferenceConfig,
		};
	}
	return compatiblePayload === request ? undefined : compatiblePayload;
}

export function improveFableBedrockError(
	errorMessage: string | undefined,
	model?: { provider?: unknown; id?: unknown },
): string | undefined {
	if (!isFableBedrockModel(model)) return undefined;
	if (errorMessage !== UNKNOWN_PROVIDER_ERROR) return undefined;
	return FABLE_BEDROCK_UNKNOWN_ERROR;
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

export function subagentModelFor(
	input: SubagentInput,
	availableModels: readonly ModelLike[] = [],
	currentModel?: ModelLike,
): string {
	if (typeof input.model === "string" && input.model.trim()) return input.model;
	const size =
		input.modelSize === "small" || input.modelSize === "large"
			? input.modelSize
			: "medium";
	const resolved = resolveDynamicModel(
		availableModels,
		currentModel,
		size,
		"same-family",
	);
	return resolved
		? `${resolved.provider}/${resolved.id}`
		: preferredModelId(size);
}

export default function fableCommand(pi: ExtensionAPI): void {
	let foremanMode = false;

	onSessionStart(pi, import.meta.url, () => {
		removeToolVisibilityRestriction(pi, RETIRED_SUBSCRIPTION_VISIBILITY_KEY);
	});

	pi.on("before_provider_request", (event, ctx) =>
		sanitizeFableBedrockPayload(event.payload, ctx.model),
	);

	pi.on("message_end", (event, ctx) => {
		const message = event.message;
		if (message.role !== "assistant" || message.stopReason !== "error") {
			return undefined;
		}
		const improvedError = improveFableBedrockError(
			message.errorMessage,
			ctx.model,
		);
		if (!improvedError) return undefined;
		return { message: { ...message, errorMessage: improvedError } };
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (isBedrockClaudeRootModel(ctx.model)) {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${BEDROCK_CLAUDE_DELEGATION_INSTRUCTION}`,
			};
		}
		if (!isInteractiveOrchestratorParent(ctx)) return undefined;
		const foremanRequested =
			foremanMode &&
			ctx.model?.provider === "openai-codex" &&
			ctx.model.id === "gpt-5.6-sol";
		if (!foremanRequested) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${FOREMAN_INSTRUCTION}`,
		};
	});

	pi.on("tool_call", (event, ctx) => {
		if (!isInteractiveOrchestratorParent(ctx)) return undefined;
		if (event.toolName === "subagent") {
			const input = event.input as SubagentInput;
			if (input.model !== undefined) return undefined;
			if (
				input.modelSize === undefined &&
				preservesRequestedAgentModels(input, ctx.cwd)
			) {
				return undefined;
			}
			if (input.modelSize === undefined) input.modelSize = "medium";
			if (input.modelPolicy === undefined) input.modelPolicy = "same-family";
		}
		return undefined;
	});

	registerSlashCommand(pi)("foreman", {
		description: "Switch to GPT-5.6 Sol xhigh as a delegating foreman.",
		handler: async (args, ctx) => {
			const task = args.trim();
			if (!task) {
				ctx.ui.notify("Usage: /foreman <task>", "warning");
				return;
			}

			const resolution = resolveExplicitModelPolicy(
				ctx.modelRegistry.getAvailable(),
				"foreman",
			);
			const foremanModel = resolution.model;
			if (!foremanModel) {
				ctx.ui.notify(resolution.diagnostic ?? "Foreman model unavailable.", "error");
				return;
			}

			const changed = await pi.setModel(foremanModel);
			if (!changed) {
				ctx.ui.notify(
					`Could not switch to ${resolution.modelId}. Check provider credentials.`,
					"error",
				);
				return;
			}

			foremanMode = true;
			pi.setThinkingLevel(FOREMAN_THINKING_LEVEL);
			ctx.ui.notify(
				`${resolution.modelId}[${FOREMAN_THINKING_LEVEL}] orchestration started.`,
				"info",
			);
			await pi.sendUserMessage(task);
		},
	});

	registerSlashCommand(pi)("fable", {
		description: "Switch to Fable high and send the task.",
		handler: async (args, ctx) => {
			const task = args.trim();
			if (!task) {
				ctx.ui.notify("Usage: /fable <task>", "warning");
				return;
			}

			const resolution = resolveExplicitModelPolicy(
				ctx.modelRegistry.getAvailable(),
				"fable",
			);
			const fableModel = resolution.model;
			if (!fableModel) {
				ctx.ui.notify(resolution.diagnostic ?? "Fable model unavailable.", "error");
				return;
			}

			const changed = await pi.setModel(fableModel);
			if (!changed) {
				ctx.ui.notify(
					`Could not switch to ${resolution.modelId}. Check provider credentials.`,
					"error",
				);
				return;
			}

			foremanMode = false;
			pi.setThinkingLevel(FABLE_THINKING_LEVEL);
			ctx.ui.notify(
				`${resolution.modelId}[${FABLE_THINKING_LEVEL}] orchestration started.`,
				"info",
			);
			await pi.sendUserMessage(task);
		},
	});
}
