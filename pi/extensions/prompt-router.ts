/**
 * prompt-router.ts — Automatic prompt complexity routing for Pi.
 *
 * Classifies every user prompt with the local TF-IDF + LinearSVC classifier
 * (prompt-routing/model.pkl) and switches the active model accordingly:
 *
 *   low  → claude-haiku-4-5    (simple factual, syntax, single-step)
 *   mid  → claude-sonnet-4-6   (multi-step, code tasks, moderate analysis)
 *   high → claude-opus-4-6     (architecture, security, distributed systems)
 *
 * Never-downgrade rule: once a session escalates to a higher tier, it stays
 * there. A follow-up "now make it production-ready" won't drop back to Haiku
 * just because the phrase is short.
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLASSIFY_SCRIPT = path.join(
  os.homedir(),
  ".dotfiles/pi/prompt-routing/classify.py"
);

const TIER_MODELS: Record<string, { provider: string; id: string; label: string }> = {
  low:  { provider: "anthropic", id: "claude-haiku-4-5",   label: "Haiku"  },
  mid:  { provider: "anthropic", id: "claude-sonnet-4-6",  label: "Sonnet" },
  high: { provider: "anthropic", id: "claude-opus-4-6",    label: "Opus"   },
};

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
    // Skip slash commands, empty input, and non-interactive sources
    const text = event.text?.trim() ?? "";
    if (!text || text.startsWith("/") || !state.enabled) {
      return { action: "continue" };
    }

    try {
      // Call the Python classifier (~100–300ms including startup)
      const result = await pi.exec("python", [CLASSIFY_SCRIPT, text], {
        timeout: 5000,
      });

      const raw = result.stdout.trim() as Tier;
      if (!["low", "mid", "high"].includes(raw)) {
        return { action: "continue" };
      }

      state.lastRaw = raw;
      state.lastPromptSnippet = text.slice(0, 60) + (text.length > 60 ? "…" : "");

      // Apply never-downgrade rule
      const effective: Tier =
        TIER_ORDER[raw] >= TIER_ORDER[state.sessionMax] ? raw : state.sessionMax;

      if (TIER_ORDER[raw] > TIER_ORDER[state.sessionMax]) {
        state.sessionMax = raw;
      }

      state.lastEffective = effective;

      // Switch model if needed
      const target = TIER_MODELS[effective];
      const model = ctx.modelRegistry.find(target.provider, target.id);

      if (model) {
        await pi.setModel(model);
      } else {
        ctx.ui.setStatus("router", `router: ${target.id} not found`);
        return { action: "continue" };
      }

      // Update footer status
      const icon = TIER_ICON[effective];
      const upgraded = effective !== raw
        ? ` (kept ${effective} from ${state.sessionMax})`
        : "";
      ctx.ui.setStatus("router", `${icon} ${target.label}${upgraded}`);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Non-fatal — log to status but don't block the prompt
      ctx.ui.setStatus("router", "router: err");
      ctx.ui.notify(`Prompt router error (non-fatal): ${msg}`, "warning");
    }

    return { action: "continue" };
  });

  // ── /router-status command ──────────────────────────────────────────────
  pi.registerCommand("router-status", {
    description: "Show current prompt routing state",
    handler: async (_args, ctx) => {
      const eff = state.lastEffective;
      const raw = state.lastRaw;
      const max = state.sessionMax;

      const lines = [
        `Prompt Router`,
        `  Enabled:          ${state.enabled}`,
        `  Session max tier: ${max} (${TIER_MODELS[max].label})`,
        `  Last classified:  ${raw ?? "—"} → applied: ${eff ?? "—"}`,
        `  Last prompt:      "${state.lastPromptSnippet}"`,
        ``,
        `  Tier map:`,
        `    low  → ${TIER_MODELS.low.id}`,
        `    mid  → ${TIER_MODELS.mid.id}`,
        `    high → ${TIER_MODELS.high.id}`,
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
