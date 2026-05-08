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
 *   primary.model_tier  -- Haiku | Sonnet | Opus
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
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeExcerpt, sha256Hex } from "../lib/transcript.js";
import { emit, getWriter } from "./transcript-runtime.js";
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
	loadRouterClassifierMode,
	POLICY_DEFAULTS,
	type RouterPolicy,
	loadRouterPolicy,
	readPromptRouterSettings,
} from "../lib/prompt-router/config.js";

export { safeParseClassifierOutput };

export type RouteResolutionReason =
	| "matched"
	| "fallback_used"
	| "classifier_timeout"
	| "classifier_failure"
	| "denied_by_policy";

export interface RouteDecision {
	route_decision_id: string;
	prompt_hash: string;
	classifier_mode: string;
	raw_route: RuntimeModelSize;
	applied_route: RuntimeModelSize;
	provider_family: string;
	model_label: string;
	thinking_level: string;
	route_resolution_reason: RouteResolutionReason;
	fallback_reason?: string;
	same_turn_applied: boolean;
}

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
	return {
		route_decision_id: makeRouteDecisionId(`${promptHash}-${reason}`),
		prompt_hash: promptHash,
		classifier_mode: loadRouterClassifierMode(),
		raw_route: "core",
		applied_route: "core",
		provider_family:
			typeof current?.provider === "string" ? current.provider : "unknown",
		model_label: typeof current?.id === "string" ? current.id : "unknown",
		thinking_level: "medium",
		route_resolution_reason: reason,
		fallback_reason: fallbackReason,
		same_turn_applied: false,
	};
}

export async function resolveProviderRouteDecision(
	pi: ExtensionAPI,
	text: string,
	ctx: any,
	timeoutMs = 1500,
): Promise<RouteDecision> {
	const promptHash = sha256Hex(text);
	const classifierMode = loadRouterClassifierMode();
	const classified = await withTimeout(
		classifyWithV3(pi, text, ctx, classifierMode),
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

	const rawSize = MODEL_TIER_TO_SIZE[classified.primary.model_tier] ?? "core";
	const tier = SIZE_TO_TIER[rawSize] ?? "mid";
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
		return fallbackRouteDecision(
			text,
			"denied_by_policy",
			"cross-provider fallback denied",
			ctx,
		);
	}

	const thinking =
		SCHEMA_EFFORT_TO_THINKING[classified.primary.effort] ?? TIER_EFFORT[tier];
	return {
		route_decision_id: makeRouteDecisionId(promptHash),
		prompt_hash: promptHash,
		classifier_mode: classifierMode,
		raw_route: rawSize,
		applied_route: rawSize,
		provider_family:
			typeof model.provider === "string" ? model.provider : "unknown",
		model_label: resolveModelTierLabel(model, rawSize),
		thinking_level: thinking,
		route_resolution_reason: "matched",
		same_turn_applied: false,
	};
}

export function applyRouteDecisionToProviderPayload(
	payload: unknown,
	decision: RouteDecision,
): unknown {
	if (!isPlainRecord(payload)) return payload;
	return {
		...payload,
		model: decision.model_label,
		reasoning_effort: decision.thinking_level,
		route_decision_id: decision.route_decision_id,
		route_resolution_reason: decision.route_resolution_reason,
		same_turn_applied: true,
	};
}

const DEBUG_LOG_PATH = path.join(
	process.cwd(),
	"pi",
	"prompt-routing",
	"logs",
	"transcript_debug.jsonl",
);

async function appendTranscriptDebug(
	event: string,
	payload: Record<string, unknown> = {},
): Promise<void> {
	try {
		await fs.mkdir(path.dirname(DEBUG_LOG_PATH), { recursive: true });
		await fs.appendFile(
			DEBUG_LOG_PATH,
			`${JSON.stringify({ ts: Date.now() / 1000, event, pid: process.pid, ...payload })}\n`,
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

const TIER_ICON: Record<string, string> = {
	low: ">",
	mid: ">>",
	high: ">>>",
};

// Static tier->effort mapping -- fallback when classifier returns null.
const TIER_EFFORT: Record<Tier, string> = {
	low: "minimal",
	mid: "medium",
	high: "high",
};

// Providers that don't have cost/model size mappings yet -- router skips them.
const SKIP_PROVIDERS = new Set(["opencode", "opencode-go", "openrouter"]);

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

// Map v3 legacy model_tier -> canonical router size bucket.
const MODEL_TIER_TO_SIZE: Record<string, RouterSize> = {
	Haiku: "mini",
	Sonnet: "core",
	Opus: "large",
};

// Map canonical router size bucket -> legacy Tier (for hysteresis state machine).
const SIZE_TO_TIER: Record<string, Tier> = {
	nano: "low",
	mini: "low",
	core: "mid",
	large: "high",
	max: "high",
};

// Default effort cap -- prevent xhigh unless explicitly configured.
const DEFAULT_MAX_EFFORT = "high";

// GPT-5.5 on openai-codex is strong enough that routine prompts should stay
// cheap/fast. Let the classifier request medium/high for genuinely complex
// prompts, but bias medium back down to low unless confidence is high. xhigh is
// never selected by the router because the global default cap remains "high";
// if the user manually sets xhigh, classifyAndRoute preserves it.
const CODEX_GPT55_PROVIDER = "openai-codex";
const CODEX_GPT55_MODEL = "gpt-5.5";
const CODEX_GPT55_MEDIUM_CONFIDENCE_FLOOR = 0.8;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Tier = "low" | "mid" | "high";
type RouterSize = "nano" | "mini" | "core" | "large" | "max";
type RuntimeModelSize = RouterSize;

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
		nano: resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			"nano",
			"same-family",
		),
		mini: resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			"mini",
			"same-family",
		),
		core: resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			"core",
			"same-family",
		),
		large: resolveDynamicModelFromRegistry(
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

function applyModelEffortBias(
	effort: string,
	rec: ClassifierRecommendation,
	model: unknown,
): string {
	if (!isCodexGpt55(model)) return effort;
	if (
		effort === "medium" &&
		rec.confidence < CODEX_GPT55_MEDIUM_CONFIDENCE_FLOOR
	)
		return "low";
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
	const size = MODEL_TIER_TO_SIZE[rec.primary.model_tier] ?? "core";
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
	return tier === "low" ? "mini" : tier === "mid" ? "core" : "large";
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
	return `router: ${size}`;
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
	} = {},
): Promise<void> {
	const writerAvailable = Boolean(getWriter());
	await appendTranscriptDebug("emitRoutingDecision_called", {
		writerAvailable,
		applied_route: applied ? `${applied.tier}:${applied.effort}` : null,
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
				applied_route: applied ? `${applied.tier}:${applied.effort}` : null,
				selected_model_size:
					runtime.selectedModelSize ??
					(applied ? modelSizeForTier(applied.tier) : null),
			},
		);
		const payload = {
			prompt_hash: sha256Hex(promptText),
			prompt_excerpt: makeExcerpt(promptText),
			raw_classifier_output: rec,
			applied_route: applied ? `${applied.tier}:${applied.effort}` : null,
			selected_model_size:
				runtime.selectedModelSize ??
				(applied ? modelSizeForTier(applied.tier) : null),
			actual_model: serializeModelForLog(runtime.actualModel),
			model_switch_applied: runtime.modelSwitchApplied ?? null,
			confidence: rec?.confidence ?? null,
			rule_fired: applied?.ruleFired ?? "null-fallback",
			fallback_metadata: {
				cap: applied?.ruleFired === "effort-cap" ? policy.maxEffortLevel : null,
				hysteresis: applied?.ruleFired === "hysteresis-hold" ? "active" : null,
				cooldown: applied?.ruleFired === "cooldown" ? "active" : null,
				uncertainty:
					applied?.ruleFired === "uncertainty-fallback" ? "active" : null,
			},
		};
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

async function classifyAndRoute(
	pi: ExtensionAPI,
	text: string,
	state: RouterState,
	policy: RouterPolicy,
	ctx: any,
): Promise<void> {
	const classifierMode = loadRouterClassifierMode();
	const rec = await classifyWithV3(pi, text, ctx, classifierMode);
	state.lastPromptSnippet = text.slice(0, 60) + (text.length > 60 ? "..." : "");

	if (rec === null) {
		// Null fallback: keep current applied route.
		const effort = state.lastAppliedEffort ?? TIER_EFFORT[state.currentTier];
		state.lastClassifierRec = null;
		state.lastRuleFired = "null-fallback";
		const size = modelSizeForTier(state.currentTier);
		const model = resolveDynamicModelFromRegistry(
			ctx.modelRegistry,
			ctx,
			size,
			"same-family",
		);
		const label = resolveModelTierLabel(model, size);
		ctx.ui.setStatus(
			"router",
			buildStatusLabel(state.currentTier, state.currentTier, label, effort),
		);
		await emitRoutingDecision(
			text,
			null,
			{ tier: state.currentTier, effort, ruleFired: "null-fallback" },
			policy,
			{
				selectedModelSize: size,
				actualModel: model,
				modelSwitchApplied: false,
			},
		);
		return;
	}

	state.lastClassifierRec = rec;

	const size = MODEL_TIER_TO_SIZE[rec.primary.model_tier] ?? "core";
	const rawTier = SIZE_TO_TIER[size] ?? "mid";
	state.lastRaw = rawTier;

	const prevTier = state.lastEffective;
	const prevEffort = state.lastAppliedEffort;
	const applied = applyPolicy(rec, state, policy);
	const { tier: effectiveTier, ruleFired } = applied;
	let { effort } = applied;

	const modelSize = modelSizeForTier(effectiveTier);
	const model = resolveDynamicModelFromRegistry(
		ctx.modelRegistry,
		ctx,
		modelSize,
		"same-family",
	);

	if (!model) {
		ctx.ui.setStatus("router", `router: no ${modelSize} model available`);
		await emitRoutingDecision(text, rec, applied, policy, {
			selectedModelSize: modelSize,
			actualModel: null,
			modelSwitchApplied: false,
		});
		return;
	}

	// Skip routing for providers without cost/size mappings.
	if (model.provider && SKIP_PROVIDERS.has(model.provider)) {
		const current = getCurrentModelHint(
			ctx,
			ctx.modelRegistry?.getAvailable?.() ?? [],
		);
		ctx.ui.setStatus("router", `router: skipped (${model.provider})`);
		await emitRoutingDecision(text, rec, applied, policy, {
			selectedModelSize: modelSize,
			actualModel: current,
			modelSwitchApplied: false,
		});
		return;
	}

	effort = applyModelEffortBias(effort, rec, model);
	const finalApplied = { ...applied, effort };
	state.lastRuleFired = ruleFired;
	state.lastAppliedEffort = effort;

	const modelSwitchApplied = effectiveTier !== prevTier;
	const effortSwitchApplied = effort !== prevEffort;

	// Only switch model/effort when route actually changes.
	if (modelSwitchApplied || effortSwitchApplied) {
		if (modelSwitchApplied) {
			await pi.setModel(model);
		}
		try {
			(pi as any).setThinkingLevel(effort);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(
				`router: setThinkingLevel failed (non-fatal): ${msg}`,
				"warning",
			);
		}
	}

	const modelLabel = resolveModelTierLabel(model, modelSize);
	ctx.ui.setStatus(
		"router",
		buildStatusLabel(effectiveTier, rawTier, modelLabel, effort),
	);
	await emitRoutingDecision(text, rec, finalApplied, policy, {
		selectedModelSize: modelSize,
		actualModel: model,
		modelSwitchApplied,
	});
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	void appendTranscriptDebug("prompt_router_extension_loaded");
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
	};

	// escalateFor: applies above-classifier route for N turns then auto-decays.
	// Called by external signals (e.g. tool-call failure). Not session-sticky.
	function escalateFor(turns: number = policy.COOLDOWN_TURNS): void {
		// Step current tier up one level for the cooldown period.
		const curOrder = TIER_ORDER[state.currentTier];
		const escalatedTier =
			curOrder < TIER_KEYS.length - 1
				? TIER_KEYS[curOrder + 1]
				: state.currentTier;
		// Temporarily override currentTier so cooldown path holds escalated route.
		state.currentTier = escalatedTier;
		state.cooldownTurnsRemaining = turns;
	}

	// Expose for external callers and tests.
	(pi as any)._escalateFor = escalateFor;

	// -- Reset state on new session --
	pi.on("session_start", async (_event, ctx) => {
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
		if (
			shouldForceLowThinkingOnSessionStart(ctx) &&
			typeof (pi as any).setThinkingLevel === "function"
		) {
			(pi as any).setThinkingLevel("low");
			state.lastAppliedEffort = "low";
		}
		ctx.ui.setStatus("router", "router: ready");
	});

	// -- Same-turn provider seam spike: resolve route before provider dispatch --
	pi.on("before_provider_request", async (event, ctx) => {
		if (!state.enabled) return undefined;
		const text = extractProviderPrompt(event.payload);
		if (!text) return undefined;
		const decision = await resolveProviderRouteDecision(pi, text, ctx);
		state.lastRuleFired =
			decision.route_resolution_reason === "matched"
				? "classifier"
				: "null-fallback";
		state.lastAppliedEffort = decision.thinking_level;
		state.lastPromptSnippet = `sha256:${decision.prompt_hash.slice(0, 12)}`;
		const payload = applyRouteDecisionToProviderPayload(event.payload, {
			...decision,
			same_turn_applied: true,
		});
		ctx.ui?.setStatus?.(
			"router",
			`same_turn_applied: true route_decision_id=${decision.route_decision_id} route=${decision.applied_route}`,
		);
		await emit(
			{ event_type: "routing_decision" },
			{
				route_decision_id: decision.route_decision_id,
				same_turn_applied: true,
				classifier_mode: decision.classifier_mode,
				raw_route: decision.raw_route,
				applied_route: decision.applied_route,
				route_resolution_reason: decision.route_resolution_reason,
				provider_family: decision.provider_family,
				model_label: decision.model_label,
				thinking_level: decision.thinking_level,
				prompt_hash: decision.prompt_hash,
			},
		);
		return payload;
	});

	// -- Classify and route every user prompt --
	pi.on("input", async (event, ctx) => {
		const text = event.text?.trim() ?? "";

		// Convenience: treat plain "exit" as a graceful shutdown.
		if (event.source !== "extension" && text.toLowerCase() === "exit") {
			ctx.shutdown();
			return { action: "handled" };
		}

		if (
			!text ||
			text.startsWith("/") ||
			event.source === "extension" ||
			!state.enabled
		) {
			return { action: "continue" };
		}

		// Fire-and-forget: classify in background so the input hook returns immediately.
		classifyAndRoute(pi, text, state, policy, ctx).catch((err: unknown) => {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.setStatus("router", "router: err");
			ctx.ui.notify(`Prompt router error (non-fatal): ${msg}`, "warning");
		});

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
			const lines = [
				`Prompt Router`,
				`  Enabled:          ${state.enabled}`,
				`  Current model:    ${currentLabel}`,
				`  Current effort:   ${effort}`,
				`  Current tier:     ${tier}`,
				`  Turns at tier:    ${state.turnsAtCurrentTier} (hold window: ${policy.N_HOLD})`,
				`  Last classified:  ${raw ?? "--"} -> applied: ${eff ?? "--"}`,
				`  Last rule:        ${state.lastRuleFired ?? "--"}`,
				`  Last prompt:      "${state.lastPromptSnippet}"`,
				`  Cooldown turns:   ${state.cooldownTurnsRemaining}`,
				``,
				`  Tier map:`,
				`    nano  -> ${resolveModelTierLabel(resolved.nano, "nano")}  [state: fallback-to-mini]`,
				`    mini  -> ${resolveModelTierLabel(resolved.mini, "mini")}  [effort: low]`,
				`    core  -> ${resolveModelTierLabel(resolved.core, "core")}  [effort: medium]`,
				`    large -> ${resolveModelTierLabel(resolved.large, "large")}  [effort: high]`,
				`    max   -> policy-only  [state: policy-only]`,
				``,
				`  Hysteresis: N_HOLD=${policy.N_HOLD} DOWNGRADE_THRESHOLD=${policy.DOWNGRADE_THRESHOLD} K_CONSEC=${policy.K_CONSEC}`,
				`  Effort cap: maxLevel=${policy.maxEffortLevel} UNCERTAIN_THRESHOLD=${policy.UNCERTAIN_THRESHOLD} UNCERTAIN_FALLBACK_ENABLED=${policy.UNCERTAIN_FALLBACK_ENABLED}`,
				`  Classifier mode: ${loadRouterClassifierMode()}`,
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
			const rec = state.lastClassifierRec;
			const ruleFired = state.lastRuleFired ?? "--";
			const appliedEffort = state.lastAppliedEffort ?? "--";
			const appliedTier = state.lastEffective ?? "--";

			const promptSnippet = state.lastPromptSnippet
				? state.lastPromptSnippet.length > 80
					? state.lastPromptSnippet.slice(0, 80) + "..."
					: state.lastPromptSnippet
				: "(none yet)";

			const current = getCurrentModelHint(
				ctx,
				ctx.modelRegistry?.getAvailable?.() ?? [],
			);
			const currentLabel = current
				? `${current.provider}/${current.id}`
				: "(unknown)";

			const appliedRouteStr =
				rec && appliedTier !== "--"
					? `${rec.primary.model_tier}/${appliedEffort}`
					: `${appliedTier}/${appliedEffort}`;

			const lines = [
				`Last turn decision:`,
				`  Prompt: "${promptSnippet}"`,
				`  Classifier: ${loadRouterClassifierMode()}`,
			];

			if (rec) {
				lines.push(`    schema_version: ${rec.schema_version}`);
				lines.push(
					`    primary: {model: ${rec.primary.model_tier}, effort: ${rec.primary.effort}}`,
				);
				lines.push(`    confidence: ${rec.confidence}`);
				if (rec.ensemble_rule)
					lines.push(`    ensemble_rule: ${rec.ensemble_rule}`);
				if (rec.reason) lines.push(`    reason: ${rec.reason}`);
				lines.push(
					`    candidates: [${rec.candidates.map((c) => `${c.model_tier}/${c.effort}@${c.confidence}`).join(", ")}]`,
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
