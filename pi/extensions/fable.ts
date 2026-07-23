import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type ModelLike,
	preferredModelId,
	resolveDynamicModel,
	resolveExplicitModelPolicy,
} from "../lib/model-routing.js";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
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

type SubagentInput = {
	agent?: unknown;
	tasks?: unknown;
	chain?: unknown;
	agentScope?: unknown;
	model?: unknown;
	modelSize?: unknown;
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

function isFableBedrockModel(model?: {
	provider?: unknown;
	id?: unknown;
}): boolean {
	return (
		model?.provider === "amazon-bedrock" &&
		model.id === "us.anthropic.claude-fable-5"
	);
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
	if (
		!inferenceConfig ||
		typeof inferenceConfig !== "object" ||
		Array.isArray(inferenceConfig) ||
		!("temperature" in inferenceConfig)
	) {
		return undefined;
	}

	const { temperature: _temperature, ...supportedInferenceConfig } =
		inferenceConfig as Record<string, unknown>;
	return {
		...request,
		inferenceConfig: supportedInferenceConfig,
	};
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
	wrapCommandRegistration(pi);
	let foremanMode = false;

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
		if (!isInteractiveOrchestratorParent(ctx)) return undefined;
		const foremanRequested =
			isFableBedrockModel(ctx.model) ||
			(foremanMode &&
				ctx.model?.provider === "openai-codex" &&
				ctx.model.id === "gpt-5.6-sol");
		if (!foremanRequested) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${FOREMAN_INSTRUCTION}`,
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
			input.model = subagentModelFor(
				input,
				ctx.modelRegistry.getAvailable(),
				ctx.model,
			);
			return undefined;
		}
		return undefined;
	});

	pi.registerCommand("foreman", {
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

	pi.registerCommand("fable", {
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
