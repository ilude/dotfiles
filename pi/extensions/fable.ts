import { onSessionStart } from "../lib/session-start-metrics.js";
import { registerSlashCommand } from "../lib/slash-command-echo.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type ModelLike,
	preferredModelId,
	resolveDynamicModel,
	resolveExplicitModelPolicy,
} from "../lib/model-routing.js";
import {
	removeToolVisibilityRestriction,
	setToolVisibilityRestriction,
} from "../lib/tool-activation.js";
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
const SUBSCRIPTION_ROOT_INSTRUCTION = [
	"You are the root orchestrator and must not delegate orchestration to a Team Lead package.",
	"Use only direct openai-codex subscription subagents or bounded assignments for investigation, implementation, validation, and other work.",
	"Select modelSize small for bounded work (Luna high), medium for ordinary multi-file work (Luna medium), and large for complex cross-cutting work (Sol low).",
	"You author plan, goal, and architecture artifacts directly under .specs; delegated leaves may investigate but must not make authorship decisions or write those artifacts.",
	"Do not call other direct work tools, tool_search, subagent_continue, or supply custom output paths.",
].join(" ");
const SUBSCRIPTION_VISIBILITY_KEY = "bedrock-claude-orchestrator";
export const FABLE_CONTROL_TOOL_NAMES = [
	"subagent_read",
	"subagent_write",
	"subagent_teamlead",
	"subagent_status",
	"subagent_control",
	"write",
	"task",
	"goal_progress",
	"plan_progress",
	"plan_archive",
	"workflow_complete",
] as const;
const FABLE_ALWAYS_VISIBLE_TOOL_NAMES = FABLE_CONTROL_TOOL_NAMES.filter(
	(name) =>
		name !== "goal_progress" &&
		name !== "plan_archive" &&
		name !== "plan_progress" &&
		name !== "workflow_complete",
);
const FABLE_CONTROL_TOOLS = new Set<string>(FABLE_CONTROL_TOOL_NAMES);
const SUBSCRIPTION_BOUNDARY =
	"Bedrock Claude subscription-only orchestration boundary";

type DelegationRequest = {
	agent?: unknown;
	role?: unknown;
	output?: unknown;
	task?: unknown;
	scope?: unknown;
	items?: unknown;
};

type SubagentInput = DelegationRequest & {
	items?: unknown;
	tasks?: unknown;
	chain?: unknown;
	steps?: unknown;
	continue?: unknown;
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

function delegationRequests(input: SubagentInput): DelegationRequest[] {
	const nested = [input.items, input.tasks, input.chain, input.steps].flatMap((value) =>
		Array.isArray(value)
			? value.filter(
					(item): item is DelegationRequest =>
						item !== null && typeof item === "object",
				)
			: [],
	);
	const continuation =
		input.continue !== null && typeof input.continue === "object"
			? [input.continue as DelegationRequest]
			: [];
	return [input, ...nested, ...continuation];
}

function subscriptionDelegationViolation(
	input: SubagentInput,
): string | undefined {
	const requests = delegationRequests(input);
	if (requests.some((request) => request.role === "coordinator"))
		return `${SUBSCRIPTION_BOUNDARY}: the selected Claude model is the root orchestrator and cannot request a Team Lead package.`;
	if (
		requests.some(
			(request) =>
				request.agent === "teamlead" && request.role === undefined,
		)
	)
		return `${SUBSCRIPTION_BOUNDARY}: the primary model owns orchestration. Specify a direct subagent role instead.`;
	if (
		requests.some(
			(request) =>
				typeof request.task === "string" &&
				/(?:author|draft|write|revise).{0,40}(?:plan|goal|architecture)|(?:plan|goal|architecture).{0,40}(?:author|draft|write|revise)/i.test(
					request.task,
				),
		)
	)
		return `${SUBSCRIPTION_BOUNDARY}: plan, goal, and architecture authorship belongs to the selected root; delegated leaves may investigate only.`;
	if (requests.some((request) => typeof request.output === "string"))
		return `${SUBSCRIPTION_BOUNDARY}: caller-supplied output paths are not allowed; Pi generates private artifacts.`;
	if (input.continue !== undefined)
		return `${SUBSCRIPTION_BOUNDARY}: saved-session continuation is not available.`;
	return undefined;
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

export interface ProviderOrchestrationCapability {
	readonly teamleadsAllowed: boolean;
	readonly controlTools: readonly string[];
}

const ROOT_CONTROL_TOOLS = ["subagent_status", "subagent_control"] as const;

export function providerOrchestrationCapability(model?: {
	provider?: unknown;
	id?: unknown;
}): ProviderOrchestrationCapability {
	const subscriptionBoundary =
		model?.provider === "amazon-bedrock" || model?.provider === "bedrock-mantle";
	return {
		teamleadsAllowed: !subscriptionBoundary,
		controlTools: ROOT_CONTROL_TOOLS,
	};
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

export function isSubscriptionOrchestratorModel(model?: {
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

	const updateSubscriptionVisibility = (model?: {
		provider?: unknown;
		id?: unknown;
	}): void => {
		if (isSubscriptionOrchestratorModel(model)) {
			setToolVisibilityRestriction(
				pi,
				SUBSCRIPTION_VISIBILITY_KEY,
				FABLE_CONTROL_TOOL_NAMES,
				FABLE_ALWAYS_VISIBLE_TOOL_NAMES,
			);
		} else
			removeToolVisibilityRestriction(pi, SUBSCRIPTION_VISIBILITY_KEY);
	};

	onSessionStart(pi, import.meta.url, (_event, ctx) =>
		updateSubscriptionVisibility(ctx.model),
	);
	pi.on("model_select", (event) =>
		updateSubscriptionVisibility(event.model),
	);

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
		updateSubscriptionVisibility(ctx.model);
		if (isSubscriptionOrchestratorModel(ctx.model)) {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${FOREMAN_INSTRUCTION}\n\n${SUBSCRIPTION_ROOT_INSTRUCTION}`,
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
		if (isSubscriptionOrchestratorModel(ctx.model)) {
			if (event.toolName === "write") {
				const input = event.input as { path?: unknown };
				const target = typeof input.path === "string" ? input.path.replaceAll("\\", "/") : "";
				if (!/^\.specs\/.+\/(?:plan|goal|architecture)[^/]*\.md$/i.test(target))
					return {
						block: true,
						reason: `${SUBSCRIPTION_BOUNDARY}: root direct writes are limited to plan, goal, and architecture artifacts under .specs.`,
					};
				return undefined;
			}
			if (!FABLE_CONTROL_TOOLS.has(event.toolName)) {
				return {
					block: true,
					reason: `${SUBSCRIPTION_BOUNDARY}: ${event.toolName} is not a permitted root control tool. Delegate the work to an openai-codex leaf.`,
				};
			}
			if (event.toolName === "subagent_teamlead") {
				return {
					block: true,
					reason: `${SUBSCRIPTION_BOUNDARY}: the selected Claude model is the root orchestrator and cannot request a Team Lead package.`,
				};
			}
			if (event.toolName.startsWith("subagent")) {
				const violation = subscriptionDelegationViolation(
					event.input as SubagentInput,
				);
				if (violation) return { block: true, reason: violation };
			}
			return undefined;
		}

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
