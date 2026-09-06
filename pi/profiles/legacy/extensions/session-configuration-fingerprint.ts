import { onSessionStart } from "../lib/session-start-metrics.js";
import { createHash } from "node:crypto";
import {
	VERSION,
	type BeforeAgentStartEvent,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { recordEvent } from "../lib/metrics.js";
import { loadCascadedSettings } from "../lib/settings-loader.js";
import { orderedToolsetFingerprint } from "../lib/tool-activation.js";

const UNAVAILABLE = "unavailable";

type AvailableString = string | typeof UNAVAILABLE;
type ContextFileFingerprint = {
	path: AvailableString;
	contentSha256: AvailableString;
};
type ConfigurationIdentity = {
	provider: AvailableString;
	modelId: AvailableString;
	thinkingLevel: AvailableString;
};
type InitialSnapshot = ConfigurationIdentity;

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

type PromptCacheRequest = {
	provider: string;
	model: string;
	runId?: string;
	taskId?: string;
	continuationStatus?: "fresh" | "continued";
	providerRequestOrdinal: number;
	instructionsSha256: string;
	immediateToolNamesSha256: string;
	dynamicContextSha256: string;
	contextChangedSincePreviousRequest: boolean;
	immediateToolsChangedSincePreviousRequest: boolean;
};

function boundedHash(value: unknown): string {
	if (typeof value !== "string") return UNAVAILABLE;
	return sha256(value).slice(0, 16);
}

function immediateToolNames(payload: unknown): string[] | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const tools = (payload as Record<string, unknown>).tools;
	if (!Array.isArray(tools)) return undefined;
	const names: string[] = [];
	for (const tool of tools) {
		const name =
			typeof tool === "string"
				? tool
				: tool && typeof tool === "object" && typeof (tool as Record<string, unknown>).name === "string"
					? (tool as Record<string, unknown>).name
					: undefined;
		if (typeof name === "string" && !names.includes(name)) names.push(name);
	}
	return names;
}

function dynamicRuntimeContextHash(payload: Record<string, unknown>): string {
	const contexts: string[] = [];
	const seen = new Set<object>();
	const visit = (value: unknown): void => {
		if (typeof value === "string") {
			if (value.includes("<!-- pi-runtime-context:")) contexts.push(value);
			return;
		}
		if (!value || typeof value !== "object" || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		for (const item of Object.values(value as Record<string, unknown>)) visit(item);
	};
	visit(payload.input);
	return orderedToolsetFingerprint(contexts);
}

function promptCacheRequest(
	payload: unknown,
	ctx: ExtensionContext,
	previous: PromptCacheRequest | undefined,
): PromptCacheRequest | undefined {
	if (ctx.model?.provider !== "openai-codex") return undefined;
	if (!payload || typeof payload !== "object") return undefined;
	const request = payload as Record<string, unknown>;
	const tools = immediateToolNames(payload);
	const instructionsSha256 = boundedHash(request.instructions);
	const immediateToolNamesSha256 =
		tools === undefined ? UNAVAILABLE : orderedToolsetFingerprint(tools);
	const dynamicContextSha256 = dynamicRuntimeContextHash(request);
	return {
		provider: "openai-codex",
		model: requiredString(ctx.model.id),
		...(process.env.PI_SUBAGENT_RUN_ID
			? { runId: process.env.PI_SUBAGENT_RUN_ID }
			: {}),
		...(process.env.PI_SUBAGENT_TASK_ID
			? { taskId: process.env.PI_SUBAGENT_TASK_ID }
			: {}),
		...(process.env.PI_SUBAGENT_CONTINUATION_STATUS === "fresh" ||
		process.env.PI_SUBAGENT_CONTINUATION_STATUS === "continued"
			? { continuationStatus: process.env.PI_SUBAGENT_CONTINUATION_STATUS }
			: {}),
		providerRequestOrdinal: 0,
		instructionsSha256,
		immediateToolNamesSha256,
		dynamicContextSha256,
		contextChangedSincePreviousRequest:
			previous !== undefined &&
			(previous.instructionsSha256 !== instructionsSha256 ||
				previous.dynamicContextSha256 !== dynamicContextSha256),
		immediateToolsChangedSincePreviousRequest:
			previous !== undefined && previous.immediateToolNamesSha256 !== immediateToolNamesSha256,
	};
}

function normalizedUsage(usage: unknown): Record<string, number | typeof UNAVAILABLE> {
	const value = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
	const number = (key: string): number | typeof UNAVAILABLE =>
		typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0
			? value[key] as number
			: UNAVAILABLE;
	const cacheWrite = number("cacheWrite");
	return {
		input: number("input"),
		cacheRead: number("cacheRead"),
		// The installed Codex adapter collapses an omitted raw field and an explicit
		// zero to the same normalized value. Preserve only positive reported writes.
		cacheWrite: cacheWrite === 0 ? UNAVAILABLE : cacheWrite,
	};
}

function requiredString(value: unknown): AvailableString {
	return typeof value === "string" && value.length > 0 ? value : UNAVAILABLE;
}

function canonicalJson(value: unknown): string | undefined {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean")
		return JSON.stringify(value);
	if (typeof value === "number")
		return Number.isFinite(value) ? JSON.stringify(value) : undefined;
	if (Array.isArray(value)) {
		const items = value.map(canonicalJson);
		return items.every((item): item is string => item !== undefined)
			? `[${items.join(",")}]`
			: undefined;
	}
	if (typeof value !== "object" || value === undefined) return undefined;
	const entries = Object.entries(value)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, item]) => {
			const serialized = canonicalJson(item);
			return serialized === undefined
				? undefined
				: `${JSON.stringify(key)}:${serialized}`;
		});
	return entries.every((entry): entry is string => entry !== undefined)
		? `{${entries.join(",")}}`
		: undefined;
}

function fingerprintContextFiles(
	event: BeforeAgentStartEvent,
): ContextFileFingerprint[] | typeof UNAVAILABLE {
	const contextFiles = event.systemPromptOptions.contextFiles;
	if (!Array.isArray(contextFiles)) return UNAVAILABLE;
	return contextFiles.map((file) => ({
		path: requiredString(file?.path),
		contentSha256:
			typeof file?.content === "string"
				? sha256(file.content)
				: UNAVAILABLE,
	}));
}

function fingerprintSettings(ctx: ExtensionContext): AvailableString {
	const projectTrusted = ctx.isProjectTrusted();
	const settings = loadCascadedSettings({
		projectRoot: ctx.cwd,
		skipProject: !projectTrusted,
		skipLocal: !projectTrusted,
	});
	if (Object.values(settings.sources).some((source) => source.error))
		return UNAVAILABLE;
	const serialized = canonicalJson(settings.merged);
	return serialized === undefined ? UNAVAILABLE : sha256(serialized);
}

function configurationIdentity(ctx: ExtensionContext): ConfigurationIdentity {
	return {
		provider: requiredString(ctx.model?.provider),
		modelId: requiredString(ctx.model?.id),
		thinkingLevel: requiredString(ctx.thinkingLevel),
	};
}

function sessionId(ctx: ExtensionContext): string | undefined {
	return ctx.sessionManager?.getSessionId?.();
}

function sameIdentity(
	left: ConfigurationIdentity,
	right: ConfigurationIdentity,
): boolean {
	return (
		left.provider === right.provider &&
		left.modelId === right.modelId &&
		left.thinkingLevel === right.thinkingLevel
	);
}

export default function sessionConfigurationFingerprint(pi: ExtensionAPI): void {
	let initialSnapshot: InitialSnapshot | undefined;
	let previousPromptCacheRequest: PromptCacheRequest | undefined;
	let pendingPromptCacheRequest: PromptCacheRequest | undefined;
	let currentTurnIndex = 0;
	let providerRequestOrdinal = 0;

	const recordChange = (next: ConfigurationIdentity, ctx: ExtensionContext): void => {
		if (!initialSnapshot || sameIdentity(initialSnapshot, next)) return;
		recordEvent({
			event: "configuration_fingerprint",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				recordKind: "model_or_effort_change",
				...next,
				previousProvider: initialSnapshot.provider,
				previousModelId: initialSnapshot.modelId,
				previousThinkingLevel: initialSnapshot.thinkingLevel,
			},
		});
		initialSnapshot = next;
	};

	onSessionStart(pi, import.meta.url, () => {
		initialSnapshot = undefined;
		previousPromptCacheRequest = undefined;
		pendingPromptCacheRequest = undefined;
		currentTurnIndex = 0;
		providerRequestOrdinal = 0;
	});

	pi.on("turn_start", () => {
		currentTurnIndex += 1;
	});

	pi.on("before_provider_request", (event, ctx) => {
		providerRequestOrdinal += 1;
		pendingPromptCacheRequest = promptCacheRequest(
			event.payload,
			ctx,
			previousPromptCacheRequest,
		);
		if (pendingPromptCacheRequest)
			pendingPromptCacheRequest.providerRequestOrdinal = providerRequestOrdinal;
	});

	pi.on("message_end", (event, ctx) => {
		const request = pendingPromptCacheRequest;
		const message = event.message as unknown as Record<string, unknown> | undefined;
		if (!request || message?.role !== "assistant") return;
		const messageId = typeof message.id === "string" && message.id.length > 0
			? message.id
			: undefined;
		pendingPromptCacheRequest = undefined;
		previousPromptCacheRequest = request;
		recordEvent({
			event: "prompt_cache_request",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				provider: request.provider,
				model: request.model,
				...(request.runId ? { runId: request.runId } : {}),
				...(request.taskId ? { taskId: request.taskId } : {}),
				...(request.continuationStatus
					? { continuationStatus: request.continuationStatus }
					: {}),
				providerRequestOrdinal: request.providerRequestOrdinal,
				turnId: currentTurnIndex > 0 ? `turn-${currentTurnIndex}` : UNAVAILABLE,
				...(messageId ? { messageId } : {}),
				instructionsSha256: request.instructionsSha256,
				immediateToolNamesSha256: request.immediateToolNamesSha256,
				dynamicContextSha256: request.dynamicContextSha256,
				contextChangedSincePreviousRequest: request.contextChangedSincePreviousRequest,
				immediateToolsChangedSincePreviousRequest: request.immediateToolsChangedSincePreviousRequest,
				...normalizedUsage(message.usage),
			},
		});
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (initialSnapshot) return;
		const identity = configurationIdentity(ctx);
		recordEvent({
			event: "configuration_fingerprint",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				recordKind: "initial",
				...identity,
				systemPromptSha256:
					typeof event.systemPrompt === "string"
						? sha256(event.systemPrompt)
						: UNAVAILABLE,
				contextFiles: fingerprintContextFiles(event),
				initialToolsetSha256: sha256(
					[...new Set(pi.getActiveTools())].sort().join("\n"),
				),
				settingsSha256: fingerprintSettings(ctx),
				piVersion: requiredString(VERSION),
			},
		});
		initialSnapshot = identity;
	});

	pi.on("model_select", (event, ctx) => {
		const next = {
			...configurationIdentity(ctx),
			provider: requiredString(event.model.provider),
			modelId: requiredString(event.model.id),
		};
		recordChange(next, ctx);
	});

	pi.on("thinking_level_select", (event, ctx) => {
		recordChange(
			{
				...configurationIdentity(ctx),
				thinkingLevel: requiredString(event.level),
			},
			ctx,
		);
	});
}
