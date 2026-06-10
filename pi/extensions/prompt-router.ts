// Convention exception: the router emits structured multi-line status output
//   (router-status, router-explain) and per-turn `setStatus("router", ...)`
//   indicators alongside warning notifications when classifier exec or JSON
//   parsing fails. Several existing test assertions match exact substrings
//   like "classifier output invalid" and "router: ready" without an
//   extension prefix.
// Risk: rerouting every notify through uiNotify with a `[prompt-router]`
//   prefix would force test churn in prompt-router.test.ts and add noise to
//   the multi-line `/router-status` and `/router-explain` outputs that are
//   the user's primary debugging surface.
// Why shared helper is inappropriate: setStatus has no helper analogue, and
//   the multi-line `router-status`/`router-explain` text is a structured
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
 * Runtime policy (T3, settings-driven thresholds):
 *   - Ship default: N_HOLD=0, UNCERTAIN_FALLBACK_ENABLED=false. Hysteresis
 *     and uncertainty fallback are dormant -- the classifier drives every
 *     turn, with effort cap and cooldown as the only active safety nets.
 *     Shadow-eval showed both policies hurt cost without meaningfully
 *     reducing catastrophic under-routing on this corpus.
 *   - When N_HOLD > 0: after an upgrade, stay at the higher tier for at
 *     least N_HOLD turns. Downgrade only after K_CONSEC consecutive turns
 *     where classifier confidence for the lower tier exceeds
 *     DOWNGRADE_THRESHOLD. One tier step per eligible turn (no free-fall).
 *   - When UNCERTAIN_FALLBACK_ENABLED=true: confidence < UNCERTAIN_THRESHOLD
 *     clamps to max(classifier_primary, current_applied).
 *   - Temporary escalation (e.g. after tool failure) lasts COOLDOWN_TURNS
 *     turns then decays toward the classifier recommendation.
 *
 * Effort cap: router.effort.maxLevel in settings (default "high") prevents
 * xhigh from being applied even if the classifier recommends it.
 * Router default effort: router.effort.defaultLevel in settings (default
 * "medium") controls reset/startup and GPT-5.5 routine-effort bias.
 *
 * All thresholds read from pi/settings.json under router.policy.*.
 *
 * Commands:
 *   /router-status   -- show current tier, hysteresis state, and last classification
 *   /router-reset    -- reset hysteresis state (start fresh)
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
	loadRouterPolicy,
	POLICY_DEFAULTS,
	type RouterPolicy,
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
import { makeExcerpt, sha256Hex } from "../lib/transcript.js";
import { emit, getSessionId, getWriter } from "./transcript-runtime.js";

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
		classifier_mode: POLICY_DEFAULTS.classifierMode,
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
	const policy = loadRouterPolicy(EFFORT_ORDER);
	const classified = await withTimeout(
		classifyWithV3(pi, text, ctx, policy.classifierMode),
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
		policy.defaultEffortLevel;
	const thinking = applyModelEffortBias(
		rawThinking,
		classified,
		model,
		policy.defaultEffortLevel,
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
		classifier_mode: policy.classifierMode,
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

const TIER_ORDER: Record<string, number> = { low: 0, mid: 1, high: 2 };
const TIER_KEYS: Tier[] = ["low", "mid", "high"];

// Static tier->effort mapping -- fallback when classifier returns null.
const TIER_EFFORT: Record<Tier, string> = {
	low: "minimal",
	mid: "medium",
	high: "high",
};

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

// Map router size bucket -> legacy Tier (for hysteresis state machine).
const SIZE_TO_TIER: Record<string, Tier> = {
	small: "low",
	medium: "mid",
	large: "high",
};

const TIER_TO_ROUTE: Record<Tier, RouterSize> = {
	low: "mini",
	mid: "core",
	high: "large",
};

// GPT-5.5 on openai-codex is strong enough that routine prompts should stay
// at the configured default effort. Medium classifier effort is biased to that
// default, and high is reserved for high-confidence complex prompts. xhigh is
// never selected by the router because the global default cap remains "high".
const CODEX_GPT55_PROVIDER = "openai-codex";
const CODEX_GPT55_MODEL = "gpt-5.5";
const CODEX_GPT55_HIGH_CONFIDENCE_FLOOR = 0.8;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Tier = "low" | "mid" | "high";
type RuntimeModelSize = "small" | "medium" | "large";

// Which policy rule fired on the last turn (for /router-explain).
type RuleFired =
	| "classifier"
	| "hysteresis-hold"
	| "cooldown"
	| "uncertainty-fallback"
	| "effort-cap"
	| "null-fallback";

interface RouterState {
	currentTier: Tier;
	turnsAtCurrentTier: number;
	downgradeCandidateTier: Tier | null;
	consecutiveDowngradeTurns: number;
	lastRaw: Tier | null;
	lastEffective: Tier | null;
	lastPromptSnippet: string;
	enabled: boolean;
	lastClassifierRec: ClassifierRecommendation | null;
	lastAppliedEffort: string | null;
	lastRuleFired: RuleFired | null;
	cooldownTurnsRemaining: number;
	lastRouteDecision: RouteDecision | null;
}

interface AppliedRoute {
	tier: Tier;
	effort: string;
	ruleFired: RuleFired;
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

function modelNameMatchesCodexGpt55(model: Record<string, unknown>): boolean {
	const names = new Set([model.id, model.model, model.name]);
	return names.has(CODEX_GPT55_MODEL);
}

function isCodexGpt55(model: unknown): boolean {
	if (!model || typeof model !== "object") return false;
	const m = model as Record<string, unknown>;
	return m.provider === CODEX_GPT55_PROVIDER && modelNameMatchesCodexGpt55(m);
}

function isConfiguredDefaultCodexGpt55(): boolean {
	const settings = readPromptRouterSettings();
	return (
		settings?.defaultProvider === CODEX_GPT55_PROVIDER &&
		settings.defaultModel === CODEX_GPT55_MODEL
	);
}

function shouldForceLowThinkingOnSessionStart(ctx: unknown): boolean {
	const currentModel = (ctx as { model?: unknown } | null)?.model;
	return (
		isCodexGpt55(currentModel) ||
		currentModel === CODEX_GPT55_MODEL ||
		isConfiguredDefaultCodexGpt55()
	);
}

export function applyModelEffortBias(
	effort: string,
	rec: ClassifierRecommendation,
	model: unknown,
	defaultEffort = "low",
): string {
	if (!isCodexGpt55(model)) return effort;
	if (effort === "medium") return defaultEffort;
	if (effort === "high" && rec.confidence < CODEX_GPT55_HIGH_CONFIDENCE_FLOOR) {
		return defaultEffort;
	}
	return effort;
}

export function isValidTier(raw: string): raw is Tier {
	return raw === "low" || raw === "mid" || raw === "high";
}

/**
 * Applies hysteresis to the raw classifier tier output.
 *
 * Thresholds N_HOLD and K_CONSEC come from the supplied policy (settings.json).
 * The DOWNGRADE_THRESHOLD check is enforced in applyPolicy before this is called.
 */
export function applyHysteresis(
	raw: Tier,
	state: RouterState,
	policy: RouterPolicy = POLICY_DEFAULTS,
): Tier {
	const rawOrder = TIER_ORDER[raw];
	const curOrder = TIER_ORDER[state.currentTier];

	if (rawOrder > curOrder) {
		// Upgrade: apply immediately, reset hold counter.
		state.currentTier = raw;
		state.turnsAtCurrentTier = 1;
		state.downgradeCandidateTier = null;
		state.consecutiveDowngradeTurns = 0;
		state.lastEffective = raw;
		return raw;
	}

	if (rawOrder < curOrder) {
		if (state.turnsAtCurrentTier < policy.N_HOLD) {
			// Still within hold window -- keep current.
			state.turnsAtCurrentTier += 1;
			state.downgradeCandidateTier = null;
			state.consecutiveDowngradeTurns = 0;
			state.lastEffective = state.currentTier;
			return state.currentTier;
		}

		// Past hold window: accumulate consecutive downgrade signal.
		if (state.downgradeCandidateTier === raw) {
			state.consecutiveDowngradeTurns += 1;
		} else {
			state.downgradeCandidateTier = raw;
			state.consecutiveDowngradeTurns = 1;
		}

		if (state.consecutiveDowngradeTurns >= policy.K_CONSEC) {
			// Step down exactly one tier (no free-fall).
			const nextTier = TIER_KEYS[curOrder - 1];
			state.currentTier = nextTier;
			state.turnsAtCurrentTier = 1;
			state.downgradeCandidateTier = null;
			state.consecutiveDowngradeTurns = 0;
			state.lastEffective = nextTier;
			return nextTier;
		}

		// Not enough consecutive turns yet -- hold.
		state.turnsAtCurrentTier += 1;
		state.lastEffective = state.currentTier;
		return state.currentTier;
	}

	// Same tier.
	state.turnsAtCurrentTier += 1;
	state.downgradeCandidateTier = null;
	state.consecutiveDowngradeTurns = 0;
	state.lastEffective = state.currentTier;
	return state.currentTier;
}

/**
 * Applies the full T3 runtime policy: uncertainty fallback, cooldown,
 * hysteresis (settings-driven thresholds), and effort cap.
 */
export function applyPolicy(
	rec: ClassifierRecommendation,
	state: RouterState,
	policy: RouterPolicy,
): AppliedRoute {
	const route = normalizeRouteCandidate(rec.primary.model_tier) ?? "core";
	const size = ROUTE_TO_RUNTIME_SIZE[route] ?? "medium";
	const rawTier = SIZE_TO_TIER[size] ?? "mid";

	let effectiveTier: Tier;
	let ruleFired: RuleFired;

	// Step 1: uncertainty fallback -- only when explicitly enabled.
	if (
		policy.UNCERTAIN_FALLBACK_ENABLED &&
		rec.confidence < policy.UNCERTAIN_THRESHOLD
	) {
		const recOrder = TIER_ORDER[rawTier];
		const curOrder = TIER_ORDER[state.currentTier];
		effectiveTier = recOrder >= curOrder ? rawTier : state.currentTier;
		ruleFired = "uncertainty-fallback";
		state.turnsAtCurrentTier += 1;
		state.lastEffective = effectiveTier;

		// Step 2: cooldown in force -- hold escalated route for remaining turns.
	} else if (state.cooldownTurnsRemaining > 0) {
		state.cooldownTurnsRemaining -= 1;
		effectiveTier = state.currentTier;
		ruleFired = "cooldown";
		state.turnsAtCurrentTier += 1;
		state.lastEffective = effectiveTier;

		// Step 3: normal hysteresis path.
	} else {
		effectiveTier = applyHysteresis(rawTier, state, policy);
		ruleFired = effectiveTier === rawTier ? "classifier" : "hysteresis-hold";
	}

	const schemaEffort = rec.primary.effort;
	let thinkingEffort = SCHEMA_EFFORT_TO_THINKING[schemaEffort] ?? "medium";

	// Apply effort cap.
	if (EFFORT_ORDER[thinkingEffort] > EFFORT_ORDER[policy.maxEffortLevel]) {
		thinkingEffort = policy.maxEffortLevel;
		ruleFired = "effort-cap";
	}

	return { tier: effectiveTier, effort: thinkingEffort, ruleFired };
}

function modelSizeForTier(tier: Tier): RuntimeModelSize {
	return tier === "low" ? "small" : tier === "mid" ? "medium" : "large";
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

export function buildStatusLabel(
	effective: Tier,
	_raw: Tier,
	_currentModel?: string,
	_currentEffort?: string,
	_cap?: string,
	_ruleFired?: RuleFired,
): string {
	const size = modelSizeForTier(effective);
	return `route: ${size}`;
}

/**
 * Emit a `routing_decision` event into the sidecar transcript.
 *
 * The `prompt_hash` is a stable sha256(prompt_text) so this event can be
 * post-hoc joined to the existing Python-side log at
 * `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`. Both logs are
 * intentionally kept (the Python log captures classifier internals; this
 * sidecar log captures the runtime envelope and policy decision) -- they
 * are not duplicated.
 *
 * Safe no-op when transcript tracing is disabled.
 */
export async function emitRoutingDecision(
	promptText: string,
	rec: ClassifierRecommendation | null,
	applied: { tier: Tier; effort: string; ruleFired: RuleFired } | null,
	policy: RouterPolicy,
	runtime: {
		selectedModelSize?: RuntimeModelSize | null;
		actualModel?: unknown;
		modelSwitchApplied?: boolean | null;
		userSelectedRoute?: {
			route: RouterSize | null;
			effort: string | null;
		} | null;
		overrideType?: string | null;
	} = {},
): Promise<void> {
	const writerAvailable = Boolean(getWriter());
	await appendTranscriptDebug("emitRoutingDecision_called", {
		writerAvailable,
		applied_route: applied ? TIER_TO_ROUTE[applied.tier] : null,
		legacy_applied_tier: applied ? applied.tier : null,
		selected_model_size:
			runtime.selectedModelSize ??
			(applied ? modelSizeForTier(applied.tier) : null),
	});
	if (!writerAvailable) return;
	try {
		await emit(
			{ event_type: "prompt_router_emit_attempt" },
			{
				source: "prompt-router",
				has_recommendation: rec !== null,
				applied_route: applied ? TIER_TO_ROUTE[applied.tier] : null,
				legacy_applied_tier: applied ? applied.tier : null,
				selected_model_size:
					runtime.selectedModelSize ??
					(applied ? modelSizeForTier(applied.tier) : null),
			},
		);
		const capsule = buildRoutingContextCapsule({ prompt: promptText }, {});
		const payload: Record<string, unknown> = {
			...buildRouterTelemetryPayload({
				promptHash: sha256Hex(promptText),
				classifierMode: policy.classifierMode,
				rawRoute: normalizeRouteCandidate(rec?.primary.model_tier) ?? null,
				appliedRoute: applied ? TIER_TO_ROUTE[applied.tier] : null,
				rec,
				previousRoute: null,
				ruleFired: applied?.ruleFired ?? "null-fallback",
				contextCapsule: toTelemetryContextCapsule(capsule),
				providerFamily: null,
				modelLabel: null,
				profile: null,
				latencyMs: null,
				fallbackReason: null,
				selectedModelSize:
					runtime.selectedModelSize ??
					(applied ? modelSizeForTier(applied.tier) : null),
				actualModel: runtime.actualModel,
				modelSwitchApplied: runtime.modelSwitchApplied ?? null,
				userSelectedRoute: runtime.userSelectedRoute ?? null,
				finalAppliedEffort: applied?.effort ?? null,
				overrideType: runtime.overrideType ?? "none",
			}),
			legacy_applied_tier: applied ? applied.tier : null,
			confidence: rec?.confidence ?? null,
			fallback_metadata: {
				cap: applied?.ruleFired === "effort-cap" ? policy.maxEffortLevel : null,
				hysteresis: applied?.ruleFired === "hysteresis-hold" ? "active" : null,
				cooldown: applied?.ruleFired === "cooldown" ? "active" : null,
				uncertainty:
					applied?.ruleFired === "uncertainty-fallback" ? "active" : null,
			},
		};
		if (process.env.PI_ROUTER_EXCERPTS_OPT_IN === "1") {
			payload.prompt_excerpt = makeExcerpt(promptText, 120).replace(
				/[A-Za-z0-9]/g,
				"#",
			);
		}
		await emit({ event_type: "routing_decision" }, payload);
		await emit(
			{ event_type: "prompt_router_emit_success" },
			{
				source: "prompt-router",
				applied_route: payload.applied_route,
				selected_model_size: payload.selected_model_size,
			},
		);
	} catch (err: unknown) {
		await appendTranscriptDebug("emitRoutingDecision_failed", {
			error: err instanceof Error ? err.message : String(err),
		});
		// Tracing must never break the routing path.
	}
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	const policy = loadRouterPolicy(EFFORT_ORDER);

	const state: RouterState = {
		currentTier: "low",
		turnsAtCurrentTier: 0,
		downgradeCandidateTier: null,
		consecutiveDowngradeTurns: 0,
		lastRaw: null,
		lastEffective: null,
		lastPromptSnippet: "",
		enabled: true,
		lastClassifierRec: null,
		lastAppliedEffort: null,
		lastRuleFired: null,
		cooldownTurnsRemaining: 0,
		lastRouteDecision: null,
	};

	pi.registerShortcut(Key.ctrl(Key.backtick), {
		description: "Reset thinking level to router default",
		handler: async (ctx) => {
			try {
				(pi as any).setThinkingLevel(policy.defaultEffortLevel);
				state.lastAppliedEffort = policy.defaultEffortLevel;
				ctx.ui?.setStatus?.("router", `thinking: ${policy.defaultEffortLevel}`);
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
		state.currentTier = "low";
		state.turnsAtCurrentTier = 0;
		state.downgradeCandidateTier = null;
		state.consecutiveDowngradeTurns = 0;
		state.lastRaw = null;
		state.lastEffective = null;
		state.lastClassifierRec = null;
		state.lastAppliedEffort = null;
		state.lastRuleFired = null;
		state.cooldownTurnsRemaining = 0;
		state.lastRouteDecision = null;
		if (
			shouldForceLowThinkingOnSessionStart(ctx) &&
			typeof (pi as any).setThinkingLevel === "function"
		) {
			(pi as any).setThinkingLevel(policy.defaultEffortLevel);
			state.lastAppliedEffort = policy.defaultEffortLevel;
		}
		ctx.ui.setStatus("router", "router: ready");
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
		state.lastRuleFired = decision.decisionTrace.rule as RuleFired;
		state.lastClassifierRec =
			"classifierRecommendation" in decision
				? ((decision as { classifierRecommendation?: ClassifierRecommendation })
						.classifierRecommendation ?? null)
				: null;
		const rawSize = ROUTE_TO_RUNTIME_SIZE[decision.raw_route] ?? "medium";
		const appliedSize =
			ROUTE_TO_RUNTIME_SIZE[decision.applied_route] ?? "medium";
		state.lastRaw = SIZE_TO_TIER[rawSize] ?? "mid";
		state.lastEffective = SIZE_TO_TIER[appliedSize] ?? "mid";
		state.currentTier = state.lastEffective;
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
		ctx.ui?.setStatus?.(
			"router",
			`same_turn_applied: true route_decision_id=${decision.route_decision_id} route=${decision.applied_route}`,
		);
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
			const eff = state.lastEffective;
			const raw = state.lastRaw;
			const tier = state.currentTier;
			const effort = state.lastAppliedEffort ?? TIER_EFFORT[tier];

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
				`  Classifier mode:  ${decision?.classifier_mode ?? policy.classifierMode}`,
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
				`  Tier state:       ${tier}`,
				`  Turns at tier:    ${state.turnsAtCurrentTier} (hold window: ${policy.N_HOLD})`,
				`  Last tier:        ${raw ?? "--"} -> applied: ${eff ?? "--"}`,
				`  Last rule:        ${state.lastRuleFired ?? "--"}`,
				`  Last prompt:      "${state.lastPromptSnippet}"`,
				`  Cooldown turns:   ${state.cooldownTurnsRemaining}`,
				``,
				`  Runtime tier map (diagnostic):`,
				`    low  -> ${resolveModelTierLabel(resolved.low, "small")}  [route: mini, effort: minimal]`,
				`    mid  -> ${resolveModelTierLabel(resolved.mid, "medium")}  [route: core, effort: medium]`,
				`    high -> ${resolveModelTierLabel(resolved.high, "large")}  [route: large, effort: high]`,
				``,
				`  Hysteresis: N_HOLD=${policy.N_HOLD} DOWNGRADE_THRESHOLD=${policy.DOWNGRADE_THRESHOLD} K_CONSEC=${policy.K_CONSEC}`,
				`  Effort cap: maxLevel=${policy.maxEffortLevel} UNCERTAIN_THRESHOLD=${policy.UNCERTAIN_THRESHOLD} UNCERTAIN_FALLBACK_ENABLED=${policy.UNCERTAIN_FALLBACK_ENABLED}`,
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
			const appliedTier =
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

			const appliedRouteDisplay =
				appliedTier === "low" || appliedTier === "mid" || appliedTier === "high"
					? TIER_TO_ROUTE[appliedTier]
					: appliedTier;
			const appliedRouteStr = `${appliedRouteDisplay}/${appliedEffort}`;

			const lines = [
				`Last turn decision:`,
				`  Prompt: "${promptSnippet}"`,
				`  Route decision: ${decision?.route_decision_id ?? "--"}`,
				`  Same-turn applied: ${decision?.same_turn_applied ?? false}`,
				`  Classifier: ${decision?.classifier_mode ?? policy.classifierMode}`,
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
				`  Current state: model=${currentLabel}, effort=${appliedEffort}, cap=${policy.maxEffortLevel}`,
			);

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// -- /router-reset command --
	pi.registerCommand("router-reset", {
		description:
			"Reset prompt router session state (re-enables and clears hysteresis)",
		handler: async (_args, ctx) => {
			state.currentTier = "low";
			state.turnsAtCurrentTier = 0;
			state.downgradeCandidateTier = null;
			state.consecutiveDowngradeTurns = 0;
			state.lastRaw = null;
			state.lastEffective = null;
			state.lastClassifierRec = null;
			state.lastAppliedEffort = null;
			state.lastRuleFired = null;
			state.cooldownTurnsRemaining = 0;
			state.lastRouteDecision = null;
			state.enabled = true;
			ctx.ui.setStatus("router", "router: reset");
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
			ctx.ui.setStatus("router", "router: off");
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
			ctx.ui.setStatus("router", "router: on");
			ctx.ui.notify("Prompt routing enabled.", "info");
		},
	});
}
