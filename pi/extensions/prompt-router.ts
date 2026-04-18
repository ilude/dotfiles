/**
 * prompt-router.ts — Automatic prompt complexity routing for Pi.
 *
 * Classifies every user prompt with the local TF-IDF + LinearSVC classifier
 * (prompt-routing/model.pkl) and switches the active model accordingly.
 *
 * Routing is dynamic: low/mid/high are mapped onto the currently selected
 * provider/model ladder using same-family resolution when possible.
 *
 *   low  → small model   (simple factual, syntax, single-step)
 *   mid  → medium model  (multi-step, code tasks, moderate analysis)
 *   high → large model   (architecture, security, distributed systems)
 *
 * Never-downgrade rule: once a session escalates to a higher tier, it stays
 * there. A follow-up "now make it production-ready" won't drop back to a
 * smaller model just because the phrase is short.
 *
 * Commands:
 *   /router-status   — show current tier, session max, and last classification
 *   /router-reset    — reset session max tier (start fresh)
 *
 * Logs every routing decision to prompt-routing/logs/routing_log.jsonl via
 * the Python router's built-in logging.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveDynamicModelFromRegistry, resolveModelTierLabel } from "../lib/model-routing.js";

function getResolvedTierMap(ctx: any) {
  return {
    low: resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, "small", "same-family"),
    mid: resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, "medium", "same-family"),
    high: resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, "large", "same-family"),
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLASSIFY_SCRIPT = path.join(
  os.homedir(),
  ".dotfiles/pi/prompt-routing/classify.py"
);

const TIER_ORDER: Record<string, number> = { low: 0, mid: 1, high: 2 };

const TIER_ICON: Record<string, string> = {
  low: "▸",
  mid: "▸▸",
  high: "▸▸▸",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Tier = "low" | "mid" | "high";

interface RouterState {
  sessionMax: Tier;      // highest tier reached this session (never goes down)
  lastRaw: Tier | null;  // what the classifier said before applying the floor
  lastEffective: Tier | null;  // what was actually applied
  lastPromptSnippet: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isValidTier(raw: string): raw is Tier {
  return raw === "low" || raw === "mid" || raw === "high";
}

export function applyNeverDowngrade(raw: Tier, state: RouterState): Tier {
  if (TIER_ORDER[raw] > TIER_ORDER[state.sessionMax]) {
    state.sessionMax = raw;
  }
  return TIER_ORDER[raw] >= TIER_ORDER[state.sessionMax] ? raw : state.sessionMax;
}

export function buildStatusLabel(effective: Tier, raw: Tier, sessionMax: Tier, targetLabel?: string): string {
  const fallbackLabel = effective === "low" ? "Small model" : effective === "mid" ? "Medium model" : "Large model";
  const icon = TIER_ICON[effective];
  const upgraded = effective !== raw ? ` (kept ${effective} from ${sessionMax})` : "";
  return `${icon} ${targetLabel || fallbackLabel}${upgraded}`;
}

async function classifyAndRoute(
  pi: ExtensionAPI,
  text: string,
  state: RouterState,
  ctx: any
): Promise<void> {
  const result = await pi.exec("python", [CLASSIFY_SCRIPT, text], { timeout: 5000 });
  const raw = result.stdout.trim();

  if (!isValidTier(raw)) return;

  state.lastRaw = raw;
  state.lastPromptSnippet = text.slice(0, 60) + (text.length > 60 ? "…" : "");

  const effective = applyNeverDowngrade(raw, state);
  state.lastEffective = effective;

  const size = effective === "low" ? "small" : effective === "mid" ? "medium" : "large";
  const model = resolveDynamicModelFromRegistry(ctx.modelRegistry, ctx, size, "same-family");

  if (!model) {
    ctx.ui.setStatus("router", `router: no ${size} model available`);
    return;
  }

  await pi.setModel(model);
  ctx.ui.setStatus("router", buildStatusLabel(effective, raw, state.sessionMax, resolveModelTierLabel(model, size)));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  const state: RouterState = {
    sessionMax: "low",
    lastRaw: null,
    lastEffective: null,
    lastPromptSnippet: "",
    enabled: true,
  };

  // ── Reset state on new session ──────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    state.sessionMax = "low";
    state.lastRaw = null;
    state.lastEffective = null;
    ctx.ui.setStatus("router", "router: ready");
  });

  // ── Classify and route every user prompt ───────────────────────────────
  pi.on("input", async (event, ctx) => {
    const text = event.text?.trim() ?? "";
    if (!text || text.startsWith("/") || event.source === "extension" || !state.enabled) {
      return { action: "continue" };
    }

    // Fire-and-forget: classify in background so the input hook returns
    // immediately (~160ms latency savings). The model switch may race with
    // the first LLM call, but subsequent turns benefit from the updated
    // tier, and the never-downgrade rule keeps the session safe.
    classifyAndRoute(pi, text, state, ctx).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.setStatus("router", "router: err");
      ctx.ui.notify(`Prompt router error (non-fatal): ${msg}`, "warning");
    });

    return { action: "continue" };
  });

  // ── /router-status command ──────────────────────────────────────────────
  pi.registerCommand("router-status", {
    description: "Show current prompt routing state",
    handler: async (_args, ctx) => {
      const eff = state.lastEffective;
      const raw = state.lastRaw;
      const max = state.sessionMax;

      const resolved = getResolvedTierMap(ctx);
      const lines = [
        `Prompt Router`,
        `  Enabled:          ${state.enabled}`,
        `  Session max tier: ${max}`,
        `  Last classified:  ${raw ?? "—"} → applied: ${eff ?? "—"}`,
        `  Last prompt:      "${state.lastPromptSnippet}"`,
        ``,
        `  Tier map:`,
        `    low  → ${resolveModelTierLabel(resolved.low, "small")}`,
        `    mid  → ${resolveModelTierLabel(resolved.mid, "medium")}`,
        `    high → ${resolveModelTierLabel(resolved.high, "large")}`,
        ``,
        `  Classifier: ${CLASSIFY_SCRIPT}`,
        `  Audit log:  ~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── /router-reset command ───────────────────────────────────────────────
  pi.registerCommand("router-reset", {
    description: "Reset prompt router session state (re-enables and clears session max tier)",
    handler: async (_args, ctx) => {
      state.sessionMax = "low";
      state.lastRaw = null;
      state.lastEffective = null;
      state.enabled = true;
      ctx.ui.setStatus("router", "router: reset");
      ctx.ui.notify("Prompt router reset. Next message will re-classify.", "info");
    },
  });

  // ── /router-off / /router-on commands ──────────────────────────────────
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
