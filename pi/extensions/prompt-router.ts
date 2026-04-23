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
 * Logs every routing decision to prompt-routing/logs/routing_log.jsonl via
 * the Python router's built-in logging.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getCurrentModelHint, resolveDynamicModelFromRegistry, resolveModelTierLabel } from "../lib/model-routing.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLASSIFY_SCRIPT = path.join(
  os.homedir(),
  ".dotfiles/pi/prompt-routing/classify.py"
);

const SETTINGS_PATH = path.join(os.homedir(), ".dotfiles/pi/settings.json");

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

// Known accepted schema versions for the v3 classifier output.
const KNOWN_SCHEMA_VERSIONS = new Set(["3.0.0"]);

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
const MODEL_TIER_TO_SIZE: Record<string, "small" | "medium" | "large"> = {
  Haiku: "small",
  Sonnet: "medium",
  Opus: "large",
};

// Map router size bucket -> legacy Tier (for hysteresis state machine).
const SIZE_TO_TIER: Record<string, Tier> = {
  small: "low",
  medium: "mid",
  large: "high",
};

// Default effort cap -- prevent xhigh unless explicitly configured.
const DEFAULT_MAX_EFFORT = "high";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Tier = "low" | "mid" | "high";

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

// ---------------------------------------------------------------------------
// V3 classifier types
// ---------------------------------------------------------------------------

interface ClassifierRecommendation {
  schema_version: string;
  primary: { model_tier: string; effort: string };
  candidates: Array<{ model_tier: string; effort: string; confidence: number }>;
  confidence: number;
  reason?: string;
  ensemble_rule?: string;
}

interface AppliedRoute {
  tier: Tier;
  effort: string;
  ruleFired: RuleFired;
}

// ---------------------------------------------------------------------------
// Settings loader
// ---------------------------------------------------------------------------

interface RouterPolicy {
  N_HOLD: number;
  DOWNGRADE_THRESHOLD: number;
  K_CONSEC: number;
  COOLDOWN_TURNS: number;
  UNCERTAIN_THRESHOLD: number;
  UNCERTAIN_FALLBACK_ENABLED: boolean;
  maxEffortLevel: string;
}

const POLICY_DEFAULTS: RouterPolicy = {
  N_HOLD: 3,
  DOWNGRADE_THRESHOLD: 0.85,
  K_CONSEC: 2,
  COOLDOWN_TURNS: 2,
  UNCERTAIN_THRESHOLD: 0.55,
  UNCERTAIN_FALLBACK_ENABLED: false,
  maxEffortLevel: "high",
};

function loadRouterPolicy(): RouterPolicy {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const s = JSON.parse(raw);
    const p = s?.router?.policy ?? {};
    const e = s?.router?.effort ?? {};
    const maxLevel =
      typeof e.maxLevel === "string" && EFFORT_ORDER[e.maxLevel] !== undefined
        ? e.maxLevel
        : POLICY_DEFAULTS.maxEffortLevel;
    return {
      N_HOLD:              typeof p.N_HOLD === "number"              ? p.N_HOLD              : POLICY_DEFAULTS.N_HOLD,
      DOWNGRADE_THRESHOLD: typeof p.DOWNGRADE_THRESHOLD === "number" ? p.DOWNGRADE_THRESHOLD : POLICY_DEFAULTS.DOWNGRADE_THRESHOLD,
      K_CONSEC:            typeof p.K_CONSEC === "number"            ? p.K_CONSEC            : POLICY_DEFAULTS.K_CONSEC,
      COOLDOWN_TURNS:      typeof p.COOLDOWN_TURNS === "number"      ? p.COOLDOWN_TURNS      : POLICY_DEFAULTS.COOLDOWN_TURNS,
      UNCERTAIN_THRESHOLD: typeof p.UNCERTAIN_THRESHOLD === "number" ? p.UNCERTAIN_THRESHOLD : POLICY_DEFAULTS.UNCERTAIN_THRESHOLD,
      UNCERTAIN_FALLBACK_ENABLED: typeof p.UNCERTAIN_FALLBACK_ENABLED === "boolean" ? p.UNCERTAIN_FALLBACK_ENABLED : POLICY_DEFAULTS.UNCERTAIN_FALLBACK_ENABLED,
      maxEffortLevel: maxLevel,
    };
  } catch {
    return { ...POLICY_DEFAULTS };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResolvedTierMap(ctx: any) {
  return {
    low: resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, "small", "same-family"),
    mid: resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, "medium", "same-family"),
    high: resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, "large", "same-family"),
  };
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
export function applyHysteresis(raw: Tier, state: RouterState, policy: RouterPolicy = POLICY_DEFAULTS): Tier {
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
 * Safely parse and schema-validate classifier stdout.
 *
 * Accepts v3 JSON with a known schema_version only. Returns null on parse
 * failure, version mismatch, missing required fields, or out-of-range values.
 * Callers treat null as "keep current applied route" (null-fallback path).
 */
export function safeParseClassifierOutput(raw: string): ClassifierRecommendation | null {
  const trimmed = raw.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj["schema_version"] !== "string") return null;
  if (!KNOWN_SCHEMA_VERSIONS.has(obj["schema_version"])) return null;

  if (typeof obj["primary"] !== "object" || obj["primary"] === null) return null;
  const primary = obj["primary"] as Record<string, unknown>;
  if (typeof primary["model_tier"] !== "string") return null;
  if (typeof primary["effort"] !== "string") return null;

  if (!Array.isArray(obj["candidates"]) || obj["candidates"].length === 0) return null;

  if (typeof obj["confidence"] !== "number") return null;
  if (obj["confidence"] < 0 || obj["confidence"] > 1) return null;

  return {
    schema_version: obj["schema_version"],
    primary: {
      model_tier: primary["model_tier"] as string,
      effort: primary["effort"] as string,
    },
    candidates: (obj["candidates"] as any[]).map((c) => ({
      model_tier: String(c.model_tier ?? ""),
      effort: String(c.effort ?? ""),
      confidence: Number(c.confidence ?? 0),
    })),
    confidence: obj["confidence"],
    reason: typeof obj["reason"] === "string" ? obj["reason"] : undefined,
    ensemble_rule: typeof obj["ensemble_rule"] === "string" ? obj["ensemble_rule"] : undefined,
  };
}

/**
 * Applies the full T3 runtime policy: uncertainty fallback, cooldown,
 * hysteresis (settings-driven thresholds), and effort cap.
 */
export function applyPolicy(
  rec: ClassifierRecommendation,
  state: RouterState,
  policy: RouterPolicy
): AppliedRoute {
  const size = MODEL_TIER_TO_SIZE[rec.primary.model_tier] ?? "medium";
  const rawTier = SIZE_TO_TIER[size] ?? "mid";

  let effectiveTier: Tier;
  let ruleFired: RuleFired;

  // Step 1: uncertainty fallback -- only when explicitly enabled.
  if (policy.UNCERTAIN_FALLBACK_ENABLED && rec.confidence < policy.UNCERTAIN_THRESHOLD) {
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

export function buildStatusLabel(
  effective: Tier,
  raw: Tier,
  currentModel?: string,
  currentEffort?: string,
  _cap?: string,
  _ruleFired?: RuleFired
): string {
  const fallbackLabel =
    effective === "low" ? "Small model" : effective === "mid" ? "Medium model" : "Large model";
  const icon = TIER_ICON[effective];
  const modelPart = currentModel || fallbackLabel;
  const effortPart = currentEffort ? ` [${currentEffort}]` : "";
  const held = effective !== raw ? ` (held from ${effective})` : "";
  return `${icon} ${modelPart}${effortPart}${held}`;
}

async function classifyWithV3(
  pi: ExtensionAPI,
  text: string,
  ctx: any
): Promise<ClassifierRecommendation | null> {
  let result: { stdout: string; stderr: string; code: number };
  try {
    result = await pi.exec("python", [CLASSIFY_SCRIPT, text], { timeout: 5000 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`router: classifier exec failed (non-fatal): ${msg}`, "warning");
    return null;
  }

  const rec = safeParseClassifierOutput(result.stdout.trim());
  if (rec === null) {
    ctx.ui.notify(
      `router: classifier output invalid, keeping current route. stdout=${result.stdout.trim().slice(0, 120)}`,
      "warning"
    );
    return null;
  }

  return rec;
}

async function classifyAndRoute(
  pi: ExtensionAPI,
  text: string,
  state: RouterState,
  policy: RouterPolicy,
  ctx: any
): Promise<void> {
  const rec = await classifyWithV3(pi, text, ctx);
  state.lastPromptSnippet = text.slice(0, 60) + (text.length > 60 ? "..." : "");

  if (rec === null) {
    // Null fallback: keep current applied route.
    const effort = state.lastAppliedEffort ?? TIER_EFFORT[state.currentTier];
    state.lastClassifierRec = null;
    state.lastRuleFired = "null-fallback";
    const size =
      state.currentTier === "low" ? "small" : state.currentTier === "mid" ? "medium" : "large";
    const model = resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, size, "same-family");
    const label = resolveModelTierLabel(model, size);
    ctx.ui.setStatus("router", buildStatusLabel(state.currentTier, state.currentTier, label, effort));
    return;
  }

  state.lastClassifierRec = rec;

  const size = MODEL_TIER_TO_SIZE[rec.primary.model_tier] ?? "medium";
  const rawTier = SIZE_TO_TIER[size] ?? "mid";
  state.lastRaw = rawTier;

  const prevTier = state.lastEffective;
  const prevEffort = state.lastAppliedEffort;
  const applied = applyPolicy(rec, state, policy);
  const { tier: effectiveTier, effort, ruleFired } = applied;

  state.lastRuleFired = ruleFired;
  state.lastAppliedEffort = effort;

  const modelSize =
    effectiveTier === "low" ? "small" : effectiveTier === "mid" ? "medium" : "large";
  const model = resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, modelSize, "same-family");

  if (!model) {
    ctx.ui.setStatus("router", `router: no ${modelSize} model available`);
    return;
  }

  // Only switch model/effort when route actually changes.
  if (effectiveTier !== prevTier || effort !== prevEffort) {
    if (effectiveTier !== prevTier) {
      await pi.setModel(model);
    }
    try {
      (pi as any).setThinkingLevel(effort);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`router: setThinkingLevel failed (non-fatal): ${msg}`, "warning");
    }
  }

  const modelLabel = resolveModelTierLabel(model, modelSize);
  ctx.ui.setStatus("router", buildStatusLabel(effectiveTier, rawTier, modelLabel, effort));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  const policy = loadRouterPolicy();

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
    const escalatedTier = curOrder < TIER_KEYS.length - 1 ? TIER_KEYS[curOrder + 1] : state.currentTier;
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
    ctx.ui.setStatus("router", "router: ready");
  });

  // -- Classify and route every user prompt --
  pi.on("input", async (event, ctx) => {
    const text = event.text?.trim() ?? "";
    if (!text || text.startsWith("/") || event.source === "extension" || !state.enabled) {
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
      const current = getCurrentModelHint(ctx, ctx.modelRegistry.getAvailable());
      const currentLabel = current ? `${current.provider}/${current.id}` : "(unknown)";
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
        `    low  -> ${resolveModelTierLabel(resolved.low, "small")}  [effort: minimal]`,
        `    mid  -> ${resolveModelTierLabel(resolved.mid, "medium")}  [effort: medium]`,
        `    high -> ${resolveModelTierLabel(resolved.high, "large")}  [effort: high]`,
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
    description: "Show the last-turn routing decision: classifier output, applied route, rule fired, and current state",
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

      const current = getCurrentModelHint(ctx, ctx.modelRegistry?.getAvailable?.() ?? []);
      const currentLabel = current ? `${current.provider}/${current.id}` : "(unknown)";

      const appliedRouteStr =
        rec && appliedTier !== "--"
          ? `${rec.primary.model_tier}/${appliedEffort}`
          : `${appliedTier}/${appliedEffort}`;

      const lines = [
        `Last turn decision:`,
        `  Prompt: "${promptSnippet}"`,
        `  Classifier: confgate`,
      ];

      if (rec) {
        lines.push(`    schema_version: ${rec.schema_version}`);
        lines.push(`    primary: {model: ${rec.primary.model_tier}, effort: ${rec.primary.effort}}`);
        lines.push(`    confidence: ${rec.confidence}`);
        if (rec.ensemble_rule) lines.push(`    ensemble_rule: ${rec.ensemble_rule}`);
        if (rec.reason) lines.push(`    reason: ${rec.reason}`);
        lines.push(`    candidates: [${rec.candidates.map(c => `${c.model_tier}/${c.effort}@${c.confidence}`).join(", ")}]`);
      } else {
        lines.push(`    (no classifier output -- null fallback active)`);
      }

      lines.push(`  Applied route: ${appliedRouteStr}`);
      lines.push(`  Rule fired: ${ruleFired}`);
      lines.push(
        `  Current state: model=${currentLabel}, effort=${appliedEffort}, cap=${policy.maxEffortLevel}`
      );

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // -- /router-reset command --
  pi.registerCommand("router-reset", {
    description: "Reset prompt router session state (re-enables and clears hysteresis)",
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
      ctx.ui.notify("Prompt router reset. Next message will re-classify.", "info");
    },
  });

  // -- /router-off / /router-on commands --
  pi.registerCommand("router-off", {
    description: "Disable automatic prompt routing (keep current model)",
    handler: async (_args, ctx) => {
      state.enabled = false;
      ctx.ui.setStatus("router", "router: off");
      ctx.ui.notify("Prompt routing disabled. Use /router-on to re-enable.", "info");
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
