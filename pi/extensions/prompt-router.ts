// Convention exception: the router emits structured multi-line status output
//   (router-status, router-explain) and warning notifications when classifier
//   exec or JSON parsing fails. Several existing test assertions match exact
//   substrings like "classifier output invalid" without an extension prefix.
// Risk: rerouting every notify through uiNotify with a `[prompt-router]`
//   prefix would force test churn in prompt-router.test.ts and add noise to
//   the multi-line `/router-status` and `/router-explain` outputs that are
//   the user's primary debugging surface.
// Why shared helper is inappropriate: the multi-line
//   `router-status`/`router-explain` text is a structured
//   report whose `Prompt Router\n  Enabled: ...` heading already self-
//   identifies the source.
/**
 * prompt-router.ts -- Automatic prompt complexity routing for Pi.
 *
 * Classifies every user prompt with the local TF-IDF + LinearSVC classifier
 * (prompt-routing/router_v3.joblib) and switches the active model + thinking
 * effort accordingly.
 *
 * The v3 classifier returns a structured JSON recommendation with:
 *   primary.model_tier  -- mini | core | large
 *   primary.effort      -- none | low | medium | high
 *   confidence          -- 0.0..1.0 calibrated probability
 *   candidates[]        -- ranked route alternatives
 *
 * Runtime route selection applies explicit overrides, a one-turn hold for
 * dependent continuation prompts, a context-window floor, and provider trust
 * boundaries. Explicit cheap/fast/brief intent bypasses the continuation hold.
 *
 * Router default effort: router.effort.defaultLevel in settings (default
 * "medium") controls reset/startup and premium Codex routine-effort bias.
 *
 * Commands:
 *   /router-status   -- show current route and last classification
 *   /router-reset    -- reset session routing state
 *   /router-explain  -- show last-turn decision: classifier output, applied route, rule fired
 *   /router-off      -- disable automatic routing
 *   /router-on       -- re-enable automatic routing
 *
 * Logs classifier decisions to prompt-routing/logs/routing_log.jsonl via the
 * Python router, and logs runtime/applied routing details to transcript JSONL
 * when transcript tracing is enabled.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import {
	getCurrentModelHint,
	isConfiguredPremiumCodex,
	isPremiumCodexModel,
	resolveDynamicModelFromRegistry,
	resolveModelTierLabel,
} from "../lib/model-routing.js";
import {
	type ClassifierRecommendation,
	classifyWithV3,
	safeParseClassifierOutput,
} from "../lib/prompt-router/classifier.js";
import {
	CLASSIFY_SCRIPT,
	loadRouterConfig,
	ROUTER_DEFAULTS,
	readPromptRouterSettings,
} from "../lib/prompt-router/config.js";
import type {
	RouteDecision,
	RouteDecisionTrace,
	RouteResolutionReason,
	RoutingTelemetryContextCapsule,
} from "../lib/prompt-router/route-decision.js";
import {
	providerFamilyTrust,
	type RouteState,
	resolveDefaultCodexProfile,
} from "../lib/prompt-router/route-profile.js";
import {
	normalizeRouteCandidate,
	ROUTER_SIZE_ORDER,
	type RouterSize,
} from "../lib/prompt-router/route-vocabulary.js";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import { sha256Hex } from "../lib/transcript.js";
import { emit, getSessionId } from "./transcript-runtime.js";

export type { RouteDecision, RouteResolutionReason };
export { safeParseClassifierOutput };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractProviderPrompt(payload: unknown): string | null {
	if (!isPlainRecord(payload)) return null;
	if (typeof payload.prompt === "string") return payload.prompt;
	const messages = payload.messages;
	if (!Array.isArray(messages)) return null;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const msg = messages[i];
		if (!isPlainRecord(msg) || msg.role !== "user") continue;
		if (typeof msg.content === "string") return msg.content;
		if (Array.isArray(msg.content)) {
			const text = msg.content
				.map((part) =>
					isPlainRecord(part) && typeof part.text === "string" ? part.text : "",
				)
				.join(" ")
				.trim();
			if (text) return text;
		}
	}
	return null;
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T | "timeout"> {
	return Promise.race([
		promise,
		new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), timeoutMs),
		),
	]);
}

function makeRouteDecisionId(promptHash: string): string {
	return `route-${promptHash.slice(0, 16)}`;
}

function hasExplicitModelSelection(payload: unknown, ctx?: unknown): boolean {
	const payloadRecord = isPlainRecord(payload) ? payload : {};
	const ctxRecord = isPlainRecord(ctx) ? ctx : {};
	const router = isPlainRecord(ctxRecord.router) ? ctxRecord.router : {};
	return (
		payloadRecord.explicit_model_selection === true ||
		payloadRecord.router_explicit_model_selection === true ||
		router.explicitModelSelection === true
	);
}

export interface RoutingContextCapsule {
	messageCount: number;
	estimatedPromptChars: number;
	contextWindow: number | null;
	contextPercent: number | null;
	flags: string[];
	isContinuation: boolean;
	dependencyOnPriorContext: boolean;
	lastEffectiveSize: RouterSize | null;
	unresolvedTask: boolean;
	downgradeIntentDetected: boolean;
	previousAppliedRoute?: RouterSize;
}

const CONTINUATION_PATTERNS = [
	/\b(do|use|pick|choose)\s+(option\s+)?\d+\b/i,
	/\b(patch|fix|update|change|apply|implement)\s+(it|that|this)\b/i,
	/\bsame\s+but\b/i,
	/\bcontinue\b/i,
	/\bthat approach\b/i,
];

const DOWNGRADE_INTENT_PATTERN =
	/\b(cheap|cheaper|fast|faster|quick|quickly|brief|briefly|simple|minimal|low[- ]cost)\b/i;

function hasContinuationIntent(prompt: string): boolean {
	return CONTINUATION_PATTERNS.some((pattern) => pattern.test(prompt));
}

function hasDowngradeIntent(prompt: string): boolean {
	return DOWNGRADE_INTENT_PATTERN.test(prompt);
}

export type UserEffortOverride = {
	effort: string;
	scope: string;
};

export function readUserEffortOverride(
	ctx: any,
	payload: unknown,
): UserEffortOverride | null {
	const payloadRecord = isPlainRecord(payload) ? payload : {};
	const ctxRecord = isPlainRecord(ctx) ? ctx : {};
	const router = isPlainRecord(ctxRecord.router) ? ctxRecord.router : {};
	const candidates = [
		{ value: payloadRecord.router_effort_override, scope: "request" },
		{ value: payloadRecord.user_selected_effort, scope: "request" },
		{ value: payloadRecord.reasoning_effort, scope: "request" },
		{ value: router.effortOverride, scope: "session" },
		{ value: router.userSelectedEffort, scope: "session" },
	];
	for (const candidate of candidates) {
		if (typeof candidate.value !== "string") continue;
		const effort = candidate.value.trim().toLowerCase();
		if (effort in EFFORT_ORDER) return { effort, scope: candidate.scope };
	}
	return null;
}

export function effortOverrideType(
	recommended: string | null,
	selected: string | null,
): string {
	if (!recommended || !selected || !(recommended in EFFORT_ORDER))
		return "none";
	if (!(selected in EFFORT_ORDER)) return "none";
	const diff = EFFORT_ORDER[selected] - EFFORT_ORDER[recommended];
	if (diff > 0) return "user_effort_up";
	if (diff < 0) return "user_effort_down";
	return "user_effort_same";
}

function readRuntimeEffortOverride(
	pi: ExtensionAPI,
	lastAppliedEffort: string | null,
): UserEffortOverride | null {
	const getThinkingLevel = (pi as { getThinkingLevel?: () => string | null })
		.getThinkingLevel;
	if (typeof getThinkingLevel !== "function") return null;
	const current = getThinkingLevel.call(pi);
	if (typeof current !== "string") return null;
	const effort = current.trim().toLowerCase();
	if (!(effort in EFFORT_ORDER)) return null;
	if (lastAppliedEffort && effort === lastAppliedEffort) return null;
	return { effort, scope: "session" };
}

function readRouteOverride(
	ctx: any,
	payload: unknown,
): { route: RouterSize; scope: string } | null {
	const payloadOverride = isPlainRecord(payload)
		? (payload.router_route_override ?? payload.route_override)
		: undefined;
	const ctxOverride = ctx?.router?.routeOverride ?? ctx?.routerRouteOverride;
	const routePin = ctx?.router?.routePin ?? ctx?.routerRoutePin;
	const ordered = [
		{ value: routePin, scope: "route-pin" },
		{ value: payloadOverride, scope: "request" },
		{ value: ctxOverride, scope: "session" },
	];
	for (const candidate of ordered) {
		const route = normalizeRouteCandidate(candidate.value);
		if (route) return { route, scope: candidate.scope };
	}
	return null;
}

export function buildRoutingContextCapsule(
	payload: unknown,
	ctx: any,
): RoutingContextCapsule {
	const messages =
		isPlainRecord(payload) && Array.isArray(payload.messages)
			? payload.messages
			: [];
	const prompt = extractProviderPrompt(payload) ?? "";
	const contextWindow =
		typeof ctx?.model?.contextWindow === "number"
			? ctx.model.contextWindow
			: null;
	const usedTokens =
		typeof ctx?.usage?.tokens === "number" ? ctx.usage.tokens : null;
	const percent =
		typeof ctx?.usage?.percent === "number"
			? ctx.usage.percent
			: usedTokens !== null && contextWindow
				? (usedTokens / contextWindow) * 100
				: null;
	const flags: string[] = [];
	const lastEffectiveSize = normalizeRouteCandidate(
		ctx?.router?.previousAppliedRoute ?? ctx?.router?.lastEffectiveSize,
	);
	const isContinuation = hasContinuationIntent(prompt);
	const dependencyOnPriorContext = isContinuation && Boolean(lastEffectiveSize);
	const unresolvedTask = Boolean(
		ctx?.router?.unresolvedTask ?? dependencyOnPriorContext,
	);
	const downgradeIntentDetected = hasDowngradeIntent(prompt);
	if (messages.length > 8) flags.push("multi_turn");
	if (percent !== null && percent >= 85) flags.push("context_window_high");
	if (isContinuation) flags.push("continuation_detected");
	if (dependencyOnPriorContext) flags.push("depends_on_prior_context");
	if (unresolvedTask) flags.push("unresolved_task");
	if (downgradeIntentDetected) flags.push("downgrade_intent_detected");
	return {
		messageCount: Math.min(messages.length, 99),
		estimatedPromptChars: Math.min(prompt.length, 20000),
		contextWindow,
		contextPercent:
			percent === null ? null : Math.min(100, Math.max(0, Math.round(percent))),
		flags,
		isContinuation,
		dependencyOnPriorContext,
		lastEffectiveSize: lastEffectiveSize ?? null,
		unresolvedTask,
		downgradeIntentDetected,
		...(lastEffectiveSize ? { previousAppliedRoute: lastEffectiveSize } : {}),
	};
}

function toTelemetryContextCapsule(
	capsule: RoutingContextCapsule,
): RoutingTelemetryContextCapsule {
	return {
		isContinuation: capsule.isContinuation,
		dependencyOnPriorContext: capsule.dependencyOnPriorContext,
		lastEffectiveSize: capsule.lastEffectiveSize,
		unresolvedTask: capsule.unresolvedTask,
		downgradeIntentDetected: capsule.downgradeIntentDetected,
		messageCount: capsule.messageCount,
		estimatedPromptChars: capsule.estimatedPromptChars,
		contextPercent: capsule.contextPercent,
		flags: [...capsule.flags],
	};
}

function classifierCandidatesForTelemetry(
	rec: ClassifierRecommendation | null,
): Array<{ route: RouterSize; effort: string; confidence: number }> {
	return (rec?.candidates ?? []).map((candidate) => ({
		route: normalizeRouteCandidate(candidate.model_tier) ?? "core",
		effort: candidate.effort,
		confidence: candidate.confidence,
	}));
}

function candidateMargin(rec: ClassifierRecommendation | null): number | null {
	const candidates = rec?.candidates ?? [];
	if (candidates.length < 2) return null;
	const first = candidates[0]?.confidence;
	const second = candidates[1]?.confidence;
	if (typeof first !== "number" || typeof second !== "number") return null;
	return Number((first - second).toFixed(6));
}

export function buildRouterTelemetryPayload(options: {
	promptHash: string;
	classifierMode: string;
	rawRoute: RouterSize | null;
	appliedRoute: RouterSize | null;
	rec: ClassifierRecommendation | null;
	previousRoute?: RouterSize | null;
	ruleFired: string | null;
	contextCapsule?: RoutingTelemetryContextCapsule;
	providerFamily?: string | null;
	modelLabel?: string | null;
	profile?: string | null;
	latencyMs?: number | null;
	fallbackReason?: string | null;
	actualModel?: unknown;
	selectedModelSize?: RuntimeModelSize | null;
	modelSwitchApplied?: boolean | null;
	userSelectedRoute?: {
		route: RouterSize | null;
		effort: string | null;
	} | null;
	finalAppliedEffort?: string | null;
	overrideType?: string | null;
}): Record<string, unknown> {
	return {
		schema_version: "router-log-v1",
		prompt_hash: options.promptHash,
		classifier_mode: options.classifierMode,
		raw_route: options.rawRoute,
		applied_route: options.appliedRoute,
		candidate_margin: candidateMargin(options.rec),
		candidates: classifierCandidatesForTelemetry(options.rec),
		previous_route: options.previousRoute ?? null,
		rule_fired: options.ruleFired,
		context_capsule: options.contextCapsule ?? null,
		provider_family: options.providerFamily ?? null,
		model_label: options.modelLabel ?? null,
		profile: options.profile ?? null,
		latency_ms: options.latencyMs ?? null,
		fallback_reason: options.fallbackReason ?? null,
		selected_model_size: options.selectedModelSize ?? null,
		actual_model: serializeModelForLog(options.actualModel),
		model_switch_applied: options.modelSwitchApplied ?? null,
		router_recommended_route: {
			model_tier: options.rawRoute,
			effort: options.rec?.primary.effort ?? null,
		},
		user_selected_route: options.userSelectedRoute ?? {
			route: null,
			effort: null,
		},
		final_applied_route: {
			model_tier: options.appliedRoute,
			effort: options.finalAppliedEffort ?? null,
		},
		override_type: options.overrideType ?? "none",
		prompt_features: {
			estimated_chars: options.contextCapsule?.estimatedPromptChars ?? null,
			message_count: options.contextCapsule?.messageCount ?? null,
			flags: options.contextCapsule?.flags ?? [],
		},
		prompt_excerpt: null,
	};
}

function chooseAppliedRoute(
	rawRoute: RouterSize,
	override: { route: RouterSize; scope: string } | null,
	capsule: RoutingContextCapsule,
): {
	route: RouterSize;
	flags: string[];
	scope: string;
	overrideLifetime: string;
	fallbackReason?: string;
} {
	const flags = [...capsule.flags];
	let route: RouterSize = rawRoute === "nano" ? "mini" : rawRoute;
	let fallbackReason =
		rawRoute === "nano"
			? "nano unavailable by default; applied mini"
			: undefined;
	let scope = "none";
	let overrideLifetime = "none";
	if (override) {
		overrideLifetime =
			override.scope === "request" ? "one-turn" : "until-cleared";
		route = override.route === "nano" ? "mini" : override.route;
		scope = override.scope;
		flags.push("override_applied");
		if (override.route === "nano")
			fallbackReason = "nano unavailable by default; applied mini";
	}
	const previousRoute = capsule.lastEffectiveSize ?? null;
	if (
		!override &&
		previousRoute &&
		capsule.dependencyOnPriorContext &&
		ROUTER_SIZE_ORDER[route] < ROUTER_SIZE_ORDER[previousRoute]
	) {
		if (capsule.downgradeIntentDetected) {
			flags.push("context-continuation-hold-bypassed");
		} else {
			route = previousRoute;
			flags.push("context-continuation-hold");
			fallbackReason = "one-turn context-continuation-hold";
		}
	}
	if (
		capsule.flags.includes("context_window_high") &&
		ROUTER_SIZE_ORDER[route] < ROUTER_SIZE_ORDER.core
	) {
		route = "core";
		flags.push("context_window_floor");
		fallbackReason = "context window safety raised route to core";
	}
	return { route, flags, scope, overrideLifetime, fallbackReason };
}

function resolveRouteState(
	rawRoute: RouterSize,
	appliedRoute: RouterSize,
	reason: RouteResolutionReason,
): RouteState {
	if (reason === "denied_by_policy") return "disabled";
	if (rawRoute !== appliedRoute || reason !== "matched") return "fallback";
	return resolveDefaultCodexProfile(appliedRoute).routeState;
}

function makeDecisionTrace(options: {
	rawRoute: RouterSize;
	appliedRoute: RouterSize;
	provider: string;
	model: string;
	effort: string;
	reason: RouteResolutionReason;
	fallbackReason?: string;
	confidence?: number | null;
	candidates?: RouteDecisionTrace["candidates"];
	rule?: string;
	contextFlags?: string[];
	contextCapsule?: RoutingTelemetryContextCapsule;
	overrideScope?: string;
	providerTrust?: RouteDecisionTrace["providerTrust"];
	overrideLifetime?: string;
	explicitModelPreserved?: boolean;
	fallbackAllowed?: boolean;
	fallbackDeniedReason?: string;
}): RouteDecisionTrace {
	const profile = resolveDefaultCodexProfile(options.appliedRoute);
	return {
		route: options.appliedRoute,
		domain: profile.domain,
		effort: options.effort,
		profile: profile.profile,
		provider: options.provider,
		model: options.model,
		routeState: resolveRouteState(
			options.rawRoute,
			options.appliedRoute,
			options.reason,
		),
		fallbackFrom:
			options.rawRoute !== options.appliedRoute ? options.rawRoute : undefined,
		reason: options.reason,
		providerFamily: options.provider,
		providerTrust: options.providerTrust ?? profile.trustClass,
		confidence: options.confidence ?? null,
		candidates: options.candidates ?? [],
		rule: options.rule ?? options.reason,
		contextFlags: options.contextFlags ?? [],
		contextCapsule: options.contextCapsule,
		overrideScope: options.overrideScope ?? "none",
		overrideLifetime: options.overrideLifetime ?? "none",
		explicitModelPreserved: options.explicitModelPreserved ?? false,
		fallbackAllowed: options.fallbackAllowed ?? true,
		fallbackDeniedReason: options.fallbackDeniedReason,
		fallbackReason: options.fallbackReason,
	};
}

export function resolveRouteProfile(
	decision: RouteDecision,
): RouteDecisionTrace {
	return decision.decisionTrace;
}

function fallbackRouteDecision(
	text: string,
	reason: RouteResolutionReason,
	fallbackReason: string,
	ctx: any,
): RouteDecision {
	const promptHash = sha256Hex(text);
	const current = getCurrentModelHint(
		ctx,
		ctx.modelRegistry?.getAvailable?.() ?? [],
	);
	const provider =
		typeof current?.provider === "string" ? current.provider : "unknown";
	const model = typeof current?.id === "string" ? current.id : "unknown";
	return {
		route_decision_id: makeRouteDecisionId(`${promptHash}-${reason}`),
		prompt_hash: promptHash,
		classifier_mode: ROUTER_DEFAULTS.classifierMode,
		raw_route: "core",
		applied_route: "core",
		provider_family: provider,
		model_label: model,
		model_id: model,
		thinking_level: "medium",
		route_resolution_reason: reason,
		fallback_reason: fallbackReason,
		same_turn_applied: false,
		decisionTrace: makeDecisionTrace({
			rawRoute: "core",
			appliedRoute: "core",
			provider,
			model,
			effort: "medium",
			reason,
			fallbackReason,
			rule: "null-fallback",
		}),
	};
}

export async function resolveProviderRouteDecision(
	pi: ExtensionAPI,
	text: string,
	ctx: any,
	timeoutMs = 1500,
	providerPayload: unknown = { prompt: text },
): Promise<RouteDecision> {
	const startedAt = Date.now();
	const promptHash = sha256Hex(text);
	const config = loadRouterConfig(EFFORT_ORDER);
	const classified = await withTimeout(
		classifyWithV3(pi, text, ctx, config.classifierMode),
		timeoutMs,
	);
	if (classified === "timeout")
		return fallbackRouteDecision(
			text,
			"classifier_timeout",
			"classifier timed out",
			ctx,
		);
	if (!classified)
		return fallbackRouteDecision(
			text,
			"classifier_failure",
			"classifier returned no usable route",
			ctx,
		);

	const rawRoute =
		normalizeRouteCandidate(classified.primary.model_tier) ?? "core";
	const capsule = buildRoutingContextCapsule(providerPayload, ctx);
	const override = readRouteOverride(ctx, providerPayload);
	const routePolicy = chooseAppliedRoute(rawRoute, override, capsule);
	const telemetryCapsule = toTelemetryContextCapsule(capsule);
	const appliedRoute: RouterSize = routePolicy.route;
	const rawSize = ROUTE_TO_RUNTIME_SIZE[appliedRoute] ?? "medium";
	const model = resolveDynamicModelFromRegistry(
		ctx.modelRegistry,
		ctx,
		rawSize,
		"same-family",
	);
	if (!model)
		return fallbackRouteDecision(
			text,
			"fallback_used",
			`no ${rawSize} model available`,
			ctx,
		);

	const current = getCurrentModelHint(
		ctx,
		ctx.modelRegistry?.getAvailable?.() ?? [],
	);
	if (
		current?.provider &&
		model.provider &&
		current.provider !== model.provider
	) {
		const denied = fallbackRouteDecision(
			text,
			"denied_by_policy",
			"cross-provider fallback denied",
			ctx,
		);
		denied.decisionTrace.providerTrust = "cross-provider-denied";
		denied.decisionTrace.fallbackAllowed = false;
		denied.decisionTrace.fallbackDeniedReason =
			"cross-provider fallback denied";
		return denied;
	}

	const rawThinking =
		SCHEMA_EFFORT_TO_THINKING[classified.primary.effort] ??
		config.defaultEffortLevel;
	const thinking = applyModelEffortBias(
		rawThinking,
		classified,
		model,
		config.defaultEffortLevel,
	);
	const provider =
		typeof model.provider === "string" ? model.provider : "unknown";
	const providerTrust = providerFamilyTrust(current, model);
	const modelLabel = resolveModelTierLabel(model, rawSize);
	const modelId = model.id;
	const fallbackReason = routePolicy.fallbackReason;
	return {
		classifierRecommendation: classified,
		route_decision_id: makeRouteDecisionId(promptHash),
		prompt_hash: promptHash,
		classifier_mode: config.classifierMode,
		raw_route: rawRoute,
		applied_route: appliedRoute,
		provider_family: provider,
		model_label: modelLabel,
		model_id: modelId,
		thinking_level: thinking,
		route_resolution_reason:
			rawRoute === appliedRoute && routePolicy.scope === "none"
				? "matched"
				: "fallback_used",
		fallback_reason: fallbackReason,
		same_turn_applied: false,
		decisionTrace: makeDecisionTrace({
			rawRoute,
			appliedRoute,
			provider,
			model: modelLabel,
			effort: thinking,
			reason:
				rawRoute === appliedRoute && routePolicy.scope === "none"
					? "matched"
					: "fallback_used",
			fallbackReason,
			confidence: classified.confidence,
			candidates: classifierCandidatesForTelemetry(classified),
			rule: override
				? `override:${routePolicy.scope}`
				: (classified.ensemble_rule ?? "classifier"),
			contextFlags: routePolicy.flags,
			contextCapsule: telemetryCapsule,
			overrideScope: routePolicy.scope,
			overrideLifetime: routePolicy.overrideLifetime,
			fallbackAllowed: providerTrust !== "cross-provider-denied",
			fallbackDeniedReason:
				providerTrust === "cross-provider-denied"
					? "cross-provider fallback denied"
					: undefined,
			providerTrust,
			explicitModelPreserved: hasExplicitModelSelection(providerPayload, ctx),
		}),
		latency_ms: Date.now() - startedAt,
	} as RouteDecision & { latency_ms: number };
}

export function applyRouteDecisionToProviderPayload(
	payload: unknown,
	decision: RouteDecision,
	ctx?: unknown,
): unknown {
	if (!isPlainRecord(payload)) return payload;
	const explicitModelPreserved = hasExplicitModelSelection(payload, ctx);
	const effortOverride = readUserEffortOverride(ctx, payload);
	return {
		...payload,
		model: explicitModelPreserved
			? payload.model
			: (decision.model_id ?? decision.model_label),
		reasoning_effort: effortOverride?.effort ?? decision.thinking_level,
		route_decision_id: decision.route_decision_id,
		route_resolution_reason: decision.route_resolution_reason,
		explicit_model_preserved: explicitModelPreserved,
		same_turn_applied: true,
	};
}

let debugSessionId: string | null = null;

function sanitizeLogName(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

function getTranscriptDebugLogPath(): string | null {
	const sessionId = debugSessionId ?? getSessionId();
	if (!sessionId) return null;
	return path.join(
		os.homedir(),
		".pi",
		"logs",
		"prompt-router",
		`${sanitizeLogName(sessionId)}.transcript_debug.jsonl`,
	);
}

async function appendTranscriptDebug(
	event: string,
	payload: Record<string, unknown> = {},
): Promise<void> {
	try {
		const debugLogPath = getTranscriptDebugLogPath();
		if (!debugLogPath) return;
		await fs.mkdir(path.dirname(debugLogPath), { recursive: true });
		const sessionId = debugSessionId || getSessionId();
		await fs.appendFile(
			debugLogPath,
			`${JSON.stringify({ ts: Date.now() / 1000, event, pid: process.pid, session_id: sessionId, ...payload })}\n`,
			"utf8",
		);
	} catch {
		// Debug logging must never affect routing.
	}
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Effort ordering for clamping and comparison.
const EFFORT_ORDER: Record<string, number> = {
	off: 0,
	minimal: 1,
	low: 2,
	medium: 3,
	high: 4,
	xhigh: 5,
};

// Map classifier effort values (schema) -> Pi ThinkingLevel values.
const SCHEMA_EFFORT_TO_THINKING: Record<string, string> = {
	none: "off",
	low: "low",
	medium: "medium",
	high: "high",
};

// Map v3 model_tier -> router size bucket.
const ROUTE_TO_RUNTIME_SIZE: Record<string, "small" | "medium" | "large"> = {
	nano: "small",
	mini: "small",
	core: "medium",
	large: "large",
	max: "large",
};

const CODEX_PREMIUM_HIGH_CONFIDENCE_FLOOR = 0.8;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type RuntimeModelSize = "small" | "medium" | "large";

interface RouterState {
	lastRaw: RouterSize | null;
	lastEffective: RouterSize | null;
	lastPromptSnippet: string;
	enabled: boolean;
	lastClassifierRec: ClassifierRecommendation | null;
	lastAppliedEffort: string | null;
	lastRuleFired: string | null;
	lastRouteDecision: RouteDecision | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResolvedTierMap(ctx: any) {
	return {
		low: resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			"small",
			"same-family",
		),
		mid: resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			"medium",
			"same-family",
		),
		high: resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			"large",
			"same-family",
		),
	};
}

function isConfiguredDefaultPremiumCodex(): boolean {
	const settings = readPromptRouterSettings();
	return isConfiguredPremiumCodex(
		settings?.defaultProvider,
		settings?.defaultModel,
	);
}

function shouldSetDefaultThinkingOnSessionStart(ctx: unknown): boolean {
	const currentModel = (ctx as { model?: unknown } | null)?.model;
	return (
		isPremiumCodexModel(currentModel) ||
		(typeof currentModel === "string" &&
			isConfiguredPremiumCodex("openai-codex", currentModel)) ||
		isConfiguredDefaultPremiumCodex()
	);
}

export function applyModelEffortBias(
	effort: string,
	rec: ClassifierRecommendation,
	model: unknown,
	defaultEffort = "low",
): string {
	if (!isPremiumCodexModel(model)) return effort;
	if (effort === "medium") return defaultEffort;
	if (
		effort === "high" &&
		rec.confidence < CODEX_PREMIUM_HIGH_CONFIDENCE_FLOOR
	) {
		return defaultEffort;
	}
	return effort;
}

function serializeModelForLog(model: unknown): Record<string, string> | null {
	if (!model || typeof model !== "object") return null;
	const m = model as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const key of ["provider", "id", "name", "model"] as const) {
		if (typeof m[key] === "string" && m[key]) out[key] = m[key];
	}
	return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	wrapCommandRegistration(pi);
	const config = loadRouterConfig(EFFORT_ORDER);

	const state: RouterState = {
		lastRaw: null,
		lastEffective: null,
		lastPromptSnippet: "",
		enabled: true,
		lastClassifierRec: null,
		lastAppliedEffort: null,
		lastRuleFired: null,
		lastRouteDecision: null,
	};

	pi.registerShortcut(Key.ctrl(Key.backtick), {
		description: "Reset thinking level to router default",
		handler: async (ctx) => {
			try {
				(pi as any).setThinkingLevel(config.defaultEffortLevel);
				state.lastAppliedEffort = config.defaultEffortLevel;
				ctx.ui.setStatus?.("router", `thinking: ${config.defaultEffortLevel}`);
			} catch (err: unknown) {
				ctx.ui?.notify?.(
					err instanceof Error ? err.message : String(err),
					"error",
				);
			}
		},
	});

	// -- Reset state on new session --
	pi.on("session_start", async (_event, ctx) => {
		debugSessionId =
			ctx.sessionManager?.getSessionId?.() ||
			getSessionId() ||
			`pi-${process.pid}`;
		void appendTranscriptDebug("prompt_router_session_start");
		state.lastRaw = null;
		state.lastEffective = null;
		state.lastClassifierRec = null;
		state.lastAppliedEffort = null;
		state.lastRuleFired = null;
		state.lastRouteDecision = null;
		if (
			shouldSetDefaultThinkingOnSessionStart(ctx) &&
			typeof (pi as any).setThinkingLevel === "function"
		) {
			(pi as any).setThinkingLevel(config.defaultEffortLevel);
			state.lastAppliedEffort = config.defaultEffortLevel;
		}
		ctx.ui.setStatus?.("router", "router: ready");
	});

	// -- Same-turn provider seam spike: resolve route before provider dispatch --
	pi.on("before_provider_request", async (event, ctx) => {
		if (!state.enabled) return undefined;
		const text = extractProviderPrompt(event.payload);
		if (!text) return undefined;
		const ctxRecord = ctx as unknown as Record<string, unknown>;
		const runtimeEffortOverride = readRuntimeEffortOverride(
			pi,
			state.lastAppliedEffort,
		);
		const routeCtx = {
			...ctx,
			router: {
				...(isPlainRecord(ctxRecord.router) ? ctxRecord.router : {}),
				...(runtimeEffortOverride
					? { effortOverride: runtimeEffortOverride.effort }
					: {}),
				...(state.lastRouteDecision
					? { previousAppliedRoute: state.lastRouteDecision.applied_route }
					: {}),
			},
		};
		const decision = await resolveProviderRouteDecision(
			pi,
			text,
			routeCtx,
			undefined,
			event.payload,
		);
		const previousAppliedRoute = state.lastRouteDecision?.applied_route ?? null;
		state.lastRuleFired = decision.decisionTrace.rule;
		state.lastClassifierRec =
			"classifierRecommendation" in decision
				? ((decision as { classifierRecommendation?: ClassifierRecommendation })
						.classifierRecommendation ?? null)
				: null;
		const appliedSize =
			ROUTE_TO_RUNTIME_SIZE[decision.applied_route] ?? "medium";
		state.lastRaw = decision.raw_route;
		state.lastEffective = decision.applied_route;
		state.lastAppliedEffort = decision.thinking_level;
		state.lastPromptSnippet = `sha256:${decision.prompt_hash.slice(0, 12)}`;
		state.lastRouteDecision = { ...decision, same_turn_applied: true };
		const payload = applyRouteDecisionToProviderPayload(
			event.payload,
			{
				...decision,
				same_turn_applied: true,
			},
			routeCtx,
		);
		const routedPayload = isPlainRecord(payload) ? payload : {};
		const originalPayload = isPlainRecord(event.payload) ? event.payload : {};
		const explicitModelPreserved =
			routedPayload.explicit_model_preserved === true;
		const selectedModel =
			typeof routedPayload.model === "string"
				? routedPayload.model
				: (decision.model_id ?? decision.model_label);
		const finalAppliedEffort =
			typeof routedPayload.reasoning_effort === "string"
				? routedPayload.reasoning_effort
				: decision.thinking_level;
		const userSelectedRoute =
			decision.decisionTrace.overrideScope !== "none" || runtimeEffortOverride
				? {
						route:
							decision.decisionTrace.overrideScope !== "none"
								? decision.applied_route
								: null,
						effort: runtimeEffortOverride?.effort ?? null,
					}
				: null;
		const overrideType = explicitModelPreserved
			? "explicit_model"
			: runtimeEffortOverride
				? effortOverrideType(
						decision.thinking_level,
						runtimeEffortOverride.effort,
					)
				: decision.decisionTrace.overrideScope !== "none"
					? `route_${decision.decisionTrace.overrideScope}`
					: "none";
		await emit(
			{ event_type: "routing_decision" },
			{
				...buildRouterTelemetryPayload({
					promptHash: decision.prompt_hash,
					classifierMode: decision.classifier_mode,
					rawRoute: decision.raw_route,
					appliedRoute: decision.applied_route,
					rec: state.lastClassifierRec,
					previousRoute: previousAppliedRoute,
					ruleFired: decision.decisionTrace.rule,
					contextCapsule: decision.decisionTrace.contextCapsule,
					providerFamily: decision.provider_family,
					modelLabel: decision.model_label,
					profile: decision.decisionTrace.profile,
					latencyMs:
						"latency_ms" in decision && typeof decision.latency_ms === "number"
							? decision.latency_ms
							: null,
					fallbackReason: decision.fallback_reason ?? null,
					selectedModelSize: appliedSize,
					actualModel: {
						provider: decision.provider_family,
						id: selectedModel,
						name: decision.model_label,
					},
					modelSwitchApplied:
						!explicitModelPreserved && originalPayload.model !== selectedModel,
					userSelectedRoute,
					finalAppliedEffort,
					overrideType,
				}),
				route_decision_id: decision.route_decision_id,
				same_turn_applied: true,
				route_resolution_reason: decision.route_resolution_reason,
				thinking_level: decision.thinking_level,
			},
		);
		return payload;
	});

	// -- Input conveniences only. Provider routing is authoritative. --
	pi.on("input", async (event, ctx) => {
		const text = event.text?.trim() ?? "";

		if (event.source !== "extension" && text.toLowerCase() === "exit") {
			ctx.shutdown();
			return { action: "handled" };
		}

		return { action: "continue" };
	});

	// -- /router-status command --
	pi.registerCommand("router-status", {
		description: "Show current prompt routing state",
		handler: async (_args, ctx) => {
			const appliedRoute = state.lastEffective;
			const rawRoute = state.lastRaw;
			const effort = state.lastAppliedEffort ?? config.defaultEffortLevel;

			const resolved = getResolvedTierMap(ctx);
			const current = getCurrentModelHint(
				ctx,
				ctx.modelRegistry.getAvailable(),
			);
			const currentLabel = current
				? `${current.provider}/${current.id}`
				: "(unknown)";
			const decision = state.lastRouteDecision;
			const trace = decision ? resolveRouteProfile(decision) : null;
			const lines = [
				`Prompt Router`,
				`  Enabled:          ${state.enabled}`,
				`  Route decision:   ${decision?.route_decision_id ?? "--"}`,
				`  Same-turn:        ${decision?.same_turn_applied ?? false}`,
				`  Classifier mode:  ${decision?.classifier_mode ?? config.classifierMode}`,
				`  Raw/applied:      ${decision ? `${decision.raw_route} -> ${decision.applied_route}` : "--"}`,
				`  Provider/model:   ${trace ? `${trace.provider}/${trace.model}` : currentLabel}`,
				`  Route state:      ${trace?.routeState ?? "--"}`,
				`  Fallback reason:  ${trace?.fallbackReason ?? "--"}`,
				`  Override:         ${trace ? `${trace.overrideScope} (${trace.overrideLifetime})` : "--"}`,
				`  Provider trust:   ${trace ? `${trace.providerTrust}; fallback_allowed=${trace.fallbackAllowed}` : "--"}`,
				`  Fallback denied:  ${trace?.fallbackDeniedReason ?? "--"}`,
				`  Operator summary: ${decision ? `${decision.applied_route}/${decision.thinking_level} via ${trace?.rule ?? decision.route_resolution_reason}` : "no dispatch decision yet"}`,
				`  Current model:    ${currentLabel}`,
				`  Current effort:   ${effort}`,
				`  Last route:       ${rawRoute ?? "--"} -> applied: ${appliedRoute ?? "--"}`,
				`  Last rule:        ${state.lastRuleFired ?? "--"}`,
				`  Last prompt:      "${state.lastPromptSnippet}"`,
				``,
				`  Runtime tier map (diagnostic):`,
				`    low  -> ${resolveModelTierLabel(resolved.low, "small")}  [route: mini, effort: low]`,
				`    mid  -> ${resolveModelTierLabel(resolved.mid, "medium")}  [route: core, effort: medium]`,
				`    high -> ${resolveModelTierLabel(resolved.high, "large")}  [route: large, effort: high]`,
				``,
				`  Classifier: ${CLASSIFY_SCRIPT}`,
				`  Audit log:  ~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`,
			];

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// -- /router-explain command: full decision trail for the last turn --
	pi.registerCommand("router-explain", {
		description:
			"Show the last-turn routing decision: classifier output, applied route, rule fired, and current state",
		handler: async (_args, ctx) => {
			const decision = state.lastRouteDecision;
			const trace = decision ? resolveRouteProfile(decision) : null;
			const rec = state.lastClassifierRec;
			const ruleFired = trace?.rule ?? state.lastRuleFired ?? "--";
			const appliedEffort =
				decision?.thinking_level ?? state.lastAppliedEffort ?? "--";
			const appliedRoute =
				decision?.applied_route ?? state.lastEffective ?? "--";

			const promptSnippet = state.lastPromptSnippet
				? state.lastPromptSnippet.length > 80
					? `${state.lastPromptSnippet.slice(0, 80)}...`
					: state.lastPromptSnippet
				: "(none yet)";

			const current = getCurrentModelHint(
				ctx,
				ctx.modelRegistry?.getAvailable?.() ?? [],
			);
			const currentLabel = current
				? `${current.provider}/${current.id}`
				: "(unknown)";

			const appliedRouteStr = `${appliedRoute}/${appliedEffort}`;

			const lines = [
				`Last turn decision:`,
				`  Prompt: "${promptSnippet}"`,
				`  Route decision: ${decision?.route_decision_id ?? "--"}`,
				`  Same-turn applied: ${decision?.same_turn_applied ?? false}`,
				`  Classifier: ${decision?.classifier_mode ?? config.classifierMode}`,
				`  Raw/applied route: ${decision ? `${decision.raw_route} -> ${decision.applied_route}` : "--"}`,
				`  Confidence: ${trace?.confidence ?? "--"}`,
				`  Context flags: ${trace?.contextFlags.join(",") || "--"}`,
				`  Override scope: ${trace?.overrideScope ?? "--"}`,
				`  Override lifetime: ${trace?.overrideLifetime ?? "--"}`,
				`  Explicit model preserved: ${trace?.explicitModelPreserved ?? false}`,
				`  Provider trust: ${trace ? `${trace.providerTrust}; fallback_allowed=${trace.fallbackAllowed}` : "--"}`,
				`  Fallback denied: ${trace?.fallbackDeniedReason ?? "--"}`,
				`  Fallback reason: ${trace?.fallbackReason ?? "--"}`,
			];

			if (rec) {
				lines.push(`    schema_version: ${rec.schema_version}`);
				lines.push(
					`    primary: {model_tier: ${rec.primary.model_tier}, effort: ${rec.primary.effort}}`,
				);
				lines.push(`    confidence: ${rec.confidence}`);
				if (rec.ensemble_rule)
					lines.push(`    ensemble_rule: ${rec.ensemble_rule}`);
				if (rec.reason) lines.push(`    reason: ${rec.reason}`);
				lines.push(
					`    canonical_candidates: [${(trace?.candidates ?? []).map((c) => `${c.route}/${c.effort}@${c.confidence}`).join(", ")}]`,
				);
			} else {
				lines.push(`    (no classifier output -- null fallback active)`);
			}

			lines.push(`  Applied route: ${appliedRouteStr}`);
			lines.push(`  Rule fired: ${ruleFired}`);
			lines.push(
				`  Current state: model=${currentLabel}, effort=${appliedEffort}`,
			);

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// -- /router-reset command --
	pi.registerCommand("router-reset", {
		description: "Reset prompt router session state and re-enable routing",
		handler: async (_args, ctx) => {
			state.lastRaw = null;
			state.lastEffective = null;
			state.lastClassifierRec = null;
			state.lastAppliedEffort = null;
			state.lastRuleFired = null;
			state.lastRouteDecision = null;
			state.enabled = true;
			ctx.ui.setStatus?.("router", "router: reset");
			ctx.ui.notify(
				"Prompt router reset. Next message will re-classify.",
				"info",
			);
		},
	});

	// -- /router-off / /router-on commands --
	pi.registerCommand("router-off", {
		description: "Disable automatic prompt routing (keep current model)",
		handler: async (_args, ctx) => {
			state.enabled = false;
			ctx.ui.notify(
				"Prompt routing disabled. Use /router-on to re-enable.",
				"info",
			);
		},
	});

	pi.registerCommand("router-on", {
		description: "Re-enable automatic prompt routing",
		handler: async (_args, ctx) => {
			state.enabled = true;
			ctx.ui.notify("Prompt routing enabled.", "info");
		},
	});
}
