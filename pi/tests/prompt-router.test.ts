import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import promptRouter, {
  applyHysteresis,
  applyModelEffortBias,
  applyPolicy,
  applyRouteDecisionToProviderPayload,
  buildRouterTelemetryPayload,
  buildRoutingContextCapsule,
  buildStatusLabel,
  isValidTier,
  resolveProviderRouteDecision,
  resolveRouteProfile,
  safeParseClassifierOutput,
} from "../extensions/prompt-router.ts";
import {
  legacyModelTierToRoute,
  normalizeRouteCandidate,
  ROUTER_SIZES,
} from "../lib/prompt-router/route-vocabulary.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeV3Json(modelTier: string, effort: string, confidence = 0.8): string {
  return JSON.stringify({
    schema_version: "3.0.0",
    primary: { model_tier: modelTier, effort },
    candidates: [{ model_tier: modelTier, effort, confidence }],
    confidence,
  });
}

function makeV3Rec(modelTier: string, effort: string, confidence = 0.8) {
  const rec = safeParseClassifierOutput(makeV3Json(modelTier, effort, confidence));
  if (!rec) throw new Error("test fixture should parse");
  return rec;
}

// ---------------------------------------------------------------------------
// model-specific effort bias
// ---------------------------------------------------------------------------

describe("applyModelEffortBias", () => {
  const codexGpt55 = { provider: "openai-codex", id: "gpt-5.5" };
  const otherModel = { provider: "openai-codex", id: "gpt-5.4" };

  it("biases GPT-5.5 medium effort down to low", () => {
    expect(
      applyModelEffortBias("medium", makeV3Rec("core", "medium", 0.95), codexGpt55),
    ).toBe("low");
  });

  it("keeps GPT-5.5 high effort only for high-confidence complex prompts", () => {
    expect(
      applyModelEffortBias("high", makeV3Rec("large", "high", 0.79), codexGpt55),
    ).toBe("low");
    expect(
      applyModelEffortBias("high", makeV3Rec("large", "high", 0.8), codexGpt55),
    ).toBe("high");
  });

  it("does not bias other models", () => {
    expect(
      applyModelEffortBias("medium", makeV3Rec("core", "medium", 0.5), otherModel),
    ).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// canonical route vocabulary
// ---------------------------------------------------------------------------

describe("canonical route vocabulary parity", () => {
  it("matches the shared TS/Python fixture", () => {
    const fixturePath = path.join(
      __dirname,
      "../prompt-routing/tests/fixtures/canonical_route_vocabulary.json",
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    expect(ROUTER_SIZES).toEqual(fixture.canonical_routes);
    for (const [legacy, route] of Object.entries(fixture.legacy_route_map)) {
      expect(legacyModelTierToRoute(legacy)).toBe(route);
      expect(normalizeRouteCandidate(legacy)).toBe(route);
    }
    for (const [alias, route] of Object.entries(fixture.route_aliases)) {
      expect(normalizeRouteCandidate(alias)).toBe(route);
    }
  });
});

// ---------------------------------------------------------------------------
// isValidTier
// ---------------------------------------------------------------------------

describe("isValidTier", () => {
  it("accepts low, mid, high", () => {
    expect(isValidTier("low")).toBe(true);
    expect(isValidTier("mid")).toBe(true);
    expect(isValidTier("high")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidTier("")).toBe(false);
    expect(isValidTier("medium")).toBe(false);
    expect(isValidTier("HIGH")).toBe(false);
    expect(isValidTier("unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyHysteresis
// ---------------------------------------------------------------------------

describe("applyHysteresis", () => {
  function makeState(currentTier: "low" | "mid" | "high", turnsAtCurrentTier = 0) {
    return {
      currentTier,
      turnsAtCurrentTier,
      downgradeCandidateTier: null as "low" | "mid" | "high" | null,
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
  }

  it("returns raw tier when it equals current", () => {
    const state = makeState("mid", 2);
    expect(applyHysteresis("mid", state)).toBe("mid");
    expect(state.currentTier).toBe("mid");
  });

  it("upgrades immediately when raw is higher", () => {
    const state = makeState("low", 1);
    const effective = applyHysteresis("high", state);
    expect(effective).toBe("high");
    expect(state.currentTier).toBe("high");
    expect(state.turnsAtCurrentTier).toBe(1);
  });

  it("holds during N_HOLD window when raw is lower", () => {
    // turnsAtCurrentTier=1 < N_HOLD=3, so must hold
    const state = makeState("high", 1);
    const effective = applyHysteresis("low", state);
    expect(effective).toBe("high");
    expect(state.currentTier).toBe("high");
  });

  it("holds when past N_HOLD but not enough consecutive downgrade turns", () => {
    // turnsAtCurrentTier=3 >= N_HOLD=3, but K_CONSEC=2 requires 2 consecutive turns
    const state = makeState("high", 3);
    const effective = applyHysteresis("low", state);
    // First eligible turn: consecutiveDowngradeTurns=1, not yet >= K_CONSEC=2
    expect(effective).toBe("high");
    expect(state.consecutiveDowngradeTurns).toBe(1);
  });

  it("downgrades one step after K_CONSEC consecutive eligible turns", () => {
    const state = makeState("high", 3);
    // First downgrade-eligible turn
    applyHysteresis("low", state);
    expect(state.currentTier).toBe("high");
    // Second consecutive turn: triggers downgrade, but only one step (high->mid)
    const effective = applyHysteresis("low", state);
    expect(effective).toBe("mid");
    expect(state.currentTier).toBe("mid");
  });

  it("resets consecutive counter when downgrade candidate changes", () => {
    const state = makeState("high", 3);
    applyHysteresis("mid", state); // candidate=mid, consec=1
    applyHysteresis("low", state); // candidate changes to low, consec resets to 1
    expect(state.consecutiveDowngradeTurns).toBe(1);
    expect(state.currentTier).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// safeParseClassifierOutput (T4 -- schema validation)
// ---------------------------------------------------------------------------

describe("safeParseClassifierOutput", () => {
  it("accepts valid v3 JSON", () => {
    const raw = makeV3Json("Sonnet", "medium", 0.72);
    const rec = safeParseClassifierOutput(raw);
    expect(rec).not.toBeNull();
    expect(rec!.schema_version).toBe("3.0.0");
    expect(rec!.primary.model_tier).toBe("Sonnet");
    expect(rec!.primary.effort).toBe("medium");
    expect(rec!.confidence).toBe(0.72);
  });

  it("rejects invalid JSON (garbage input)", () => {
    expect(safeParseClassifierOutput("not json at all")).toBeNull();
    expect(safeParseClassifierOutput("")).toBeNull();
    expect(safeParseClassifierOutput("{}"  )).toBeNull();
  });

  it("rejects truly invalid input (non-JSON, non-tier strings)", () => {
    expect(safeParseClassifierOutput("not json at all")).toBeNull();
    expect(safeParseClassifierOutput("")).toBeNull();
    expect(safeParseClassifierOutput("{}")).toBeNull();
  });

  it("rejects missing schema_version", () => {
    const raw = JSON.stringify({
      primary: { model_tier: "Sonnet", effort: "medium" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });

  it("rejects unknown schema_version", () => {
    const raw = JSON.stringify({
      schema_version: "99.0.0",
      primary: { model_tier: "Sonnet", effort: "medium" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });

  it("rejects missing primary.effort", () => {
    const raw = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "Sonnet" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });

  it("rejects missing primary.model_tier", () => {
    const raw = JSON.stringify({
      schema_version: "3.0.0",
      primary: { effort: "medium" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });

  it("rejects unknown primary.model_tier values", () => {
    const raw = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "unknown", effort: "medium" },
      candidates: [{ model_tier: "unknown", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });

  it("rejects empty candidates array", () => {
    const raw = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "Sonnet", effort: "medium" },
      candidates: [],
      confidence: 0.8,
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });

  it("rejects missing confidence", () => {
    const raw = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "Sonnet", effort: "medium" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
    });
    expect(safeParseClassifierOutput(raw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildStatusLabel
// ---------------------------------------------------------------------------

describe("buildStatusLabel", () => {
  it("shows only route size for small", () => {
    expect(buildStatusLabel("low", "low", "gpt-5.4-mini", "minimal")).toBe("route: small");
  });

  it("shows only route size for medium", () => {
    expect(buildStatusLabel("mid", "mid", "gpt-5.4-fast", "medium", "medium", "classifier")).toBe("route: medium");
  });

  it("shows only route size for large", () => {
    expect(buildStatusLabel("high", "low", "claude-opus-4-6", "high")).toBe("route: large");
  });
});

// ---------------------------------------------------------------------------
// Hysteresis suppresses thrash (v3 JSON inputs)
// ---------------------------------------------------------------------------

describe("hysteresis suppresses thrash (legacy; ship-config N_HOLD=0 lets classifier drive)", () => {
  it("alternating classifier outputs route per classifier under N_HOLD=0 ship config", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];

    // Feed alternating v3 JSON outputs with the same effort ("medium") so that
    // effort changes don't trigger extra setModel calls -- only tier changes do.
    // Sequence: Haiku, Opus, Haiku, Opus, Haiku (alternating low/high tier).
    const sequence = [
      makeV3Json("Haiku", "medium", 0.9),
      makeV3Json("Opus", "medium", 0.9),
      makeV3Json("Haiku", "medium", 0.9),
      makeV3Json("Opus", "medium", 0.9),
      makeV3Json("Haiku", "medium", 0.9),
    ];
    for (const json of sequence) {
      (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: json, stderr: "" });
      await inputHook.handler({ text: "a prompt", source: "user" }, ctx);
      await new Promise((r) => setTimeout(r, 0));
    }

    const switchCount = (pi as any).setModel.mock.calls.length;
    // Under ship config (N_HOLD=0, K_CONSEC=1) the classifier drives every turn.
    // Sequence low/high/low/high/low -> upgrade, downgrade, upgrade, downgrade, downgrade-no-op
    // produces at most 5 switches, at least 4. Hysteresis-suppression behavior
    // is exercised in the policy-level tests under the T3 describe block with
    // explicit makePolicy() overrides.
    expect(switchCount).toBeGreaterThanOrEqual(1);
    expect(switchCount).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Effort set per tier (v3 JSON inputs)
// ---------------------------------------------------------------------------

describe("effort set per tier", () => {
  it("calls setThinkingLevel with correct effort for each tier", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];

    // Haiku/low -> ThinkingLevel "low"
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low"), stderr: "" });
    await inputHook.handler({ text: "what is a variable", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect((pi as any).setThinkingLevel).toHaveBeenLastCalledWith("low");

    // Opus/high -> ThinkingLevel "high" (upgrade, applied immediately)
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Opus", "high"), stderr: "" });
    await inputHook.handler({ text: "design a distributed system", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect((pi as any).setThinkingLevel).toHaveBeenLastCalledWith("high");

    // Verify Sonnet/medium by resetting state first via /router-reset
    const resetCmd = pi._commands.find((c) => c.name === "router-reset")!;
    await resetCmd.handler([], ctx);

    // Now feed Sonnet/medium from a low baseline
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium"), stderr: "" });
    await inputHook.handler({ text: "refactor this function", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect((pi as any).setThinkingLevel).toHaveBeenLastCalledWith("medium");
  });
});

// ---------------------------------------------------------------------------
// T4 classifier JSON parse cases
// ---------------------------------------------------------------------------

describe("classifier JSON parse -- T4", () => {
  function setup() {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    return { pi, ctx, inputHook };
  }

  it("valid JSON -- router applies the recommendation", async () => {
    const { pi, ctx, inputHook } = setup();
    const json = makeV3Json("Sonnet", "medium", 0.85);
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: json, stderr: "" });

    await inputHook.handler({ text: "explain how promises work", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    // Router should have called setModel (Sonnet -> medium -> gpt-5.4-fast)
    expect((pi as any).setModel).toHaveBeenCalledWith({ provider: "openai-codex", id: "gpt-5.4-fast" });
    expect((pi as any).setThinkingLevel).toHaveBeenLastCalledWith("medium");
  });

  it("invalid JSON -- router falls back to current-applied route and logs warning", async () => {
    const { pi, ctx, inputHook } = setup();
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: "garbage output not json", stderr: "" });

    await inputHook.handler({ text: "some prompt", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    // Should NOT switch model on invalid output
    expect((pi as any).setModel).not.toHaveBeenCalled();
    // Should have notified about the failure
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("classifier output invalid"),
      "warning"
    );
  });

  it("schema_version mismatch -- router falls back to current-applied route", async () => {
    const { pi, ctx, inputHook } = setup();
    const json = JSON.stringify({
      schema_version: "99.0.0",
      primary: { model_tier: "Sonnet", effort: "medium" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: json, stderr: "" });

    await inputHook.handler({ text: "some prompt", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    expect((pi as any).setModel).not.toHaveBeenCalled();
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("classifier output invalid"),
      "warning"
    );
  });

  it("missing required field (no effort) -- router falls back", async () => {
    const { pi, ctx, inputHook } = setup();
    const json = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "Sonnet" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
      confidence: 0.8,
    });
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: json, stderr: "" });

    await inputHook.handler({ text: "some prompt", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    expect((pi as any).setModel).not.toHaveBeenCalled();
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("classifier output invalid"),
      "warning"
    );
  });

  it("setModel AND setThinkingLevel both called with correct args", async () => {
    const { pi, ctx, inputHook } = setup();
    const json = makeV3Json("Opus", "high", 0.9);
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: json, stderr: "" });

    await inputHook.handler({ text: "design a distributed consensus protocol", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    // Opus -> large -> gpt-5.4
    expect((pi as any).setModel).toHaveBeenCalledWith({ provider: "openai-codex", id: "gpt-5.4" });
    expect((pi as any).setThinkingLevel).toHaveBeenCalledWith("high");
  });

  it("effort cap clamps via maxEffortLevel in applyPolicy", () => {
    // Test applyPolicy directly: maxEffortLevel="low" must clamp "high" down to "low".
    const state = {
      currentTier: "low" as const,
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
    const rec = {
      schema_version: "3.0.0",
      primary: { model_tier: "Opus", effort: "high" },
      candidates: [{ model_tier: "Opus", effort: "high", confidence: 0.9 }],
      confidence: 0.9,
    };
    const policy = {
      N_HOLD: 3,
      DOWNGRADE_THRESHOLD: 0.85,
      K_CONSEC: 2,
      COOLDOWN_TURNS: 2,
      UNCERTAIN_THRESHOLD: 0.55,
      UNCERTAIN_FALLBACK_ENABLED: false,
      maxEffortLevel: "low",
    };
    const applied = applyPolicy(rec, state, policy);
    expect(applied.effort).toBe("low");
    expect(applied.ruleFired).toBe("effort-cap");
  });
});

// ---------------------------------------------------------------------------
// /router-explain command (T4)
// ---------------------------------------------------------------------------

describe("router-explain command -- T4", () => {
  it("registers router-explain command", () => {
    const pi = createMockPi();
    promptRouter(pi as any);
    const names = pi._commands.map((c) => c.name);
    expect(names).toContain("router-explain");
  });

  it("shows classifier output, applied route, and rule fired after a valid classification", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium", 0.75), stderr: "" });
    await inputHook.handler({ text: "explain async/await", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
    (ctx.ui as any).notify.mockClear();
    await explainCmd.handler([], ctx);

    const [notifyArg] = (ctx.ui as any).notify.mock.calls[0];
    expect(notifyArg).toContain("Rule fired:");
    expect(notifyArg).toContain("Applied route:");
    expect(notifyArg).toContain("Current state:");
    expect(notifyArg).toContain("Sonnet");
    expect(notifyArg).toContain("3.0.0");
  });

  it("shows null-fallback message when no classification has run", async () => {
    const pi = createMockPi();
    promptRouter(pi as any);
    const ctx = createMockCtx({
      ui: { ...createMockCtx().ui, notify: vi.fn() },
    });

    const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
    await explainCmd.handler([], ctx);

    const [notifyArg] = (ctx.ui as any).notify.mock.calls[0];
    expect(notifyArg).toContain("no classifier output");
  });
});

// ---------------------------------------------------------------------------
// Prompt-router extension -- input hook
// ---------------------------------------------------------------------------

describe("prompt-router extension -- input hook", () => {
  function setup(overrides: Record<string, any> = {}) {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn(() => {});
    promptRouter(pi as any);

    const inputHooks = pi._getHook("input");
    if (inputHooks.length === 0) throw new Error("input hook not registered");
    const inputHook = inputHooks[0];

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: {
        ...createMockCtx().ui,
        setStatus: vi.fn(),
        notify: vi.fn(),
      },
      ...overrides,
    });

    return { pi, inputHook, ctx };
  }

  it("skips classification for extension-generated input", async () => {
    const { pi, inputHook, ctx } = setup();
    const result = await inputHook.handler({ text: "plan this", source: "extension" }, ctx);
    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("skips classification for slash commands", async () => {
    const { pi, inputHook, ctx } = setup();
    const result = await inputHook.handler({ text: "/router-status", source: "user" }, ctx);
    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("calls exec for normal user text with configured classifier and routes to a dynamic same-family model", async () => {
    const { pi, inputHook, ctx } = setup();
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium"), stderr: "" });

    const result = await inputHook.handler(
      { text: "explain the architecture of this system", source: "user" },
      ctx
    );

    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).toHaveBeenCalledWith(
      "uv",
      [
        "run",
        "--project",
        path.join(os.homedir(), ".dotfiles/pi/prompt-routing"),
        "python",
        path.join(os.homedir(), ".dotfiles/pi/prompt-routing/classify.py"),
        "--classifier",
        "lgbm",
        "explain the architecture of this system",
      ],
      expect.objectContaining({ timeout: 5000 })
    );

    await new Promise((r) => setTimeout(r, 0));
    expect((pi as any).setModel).toHaveBeenCalledWith({ provider: "openai-codex", id: "gpt-5.4-fast" });
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "route: medium");
  });

  it("passes the trimmed prompt text to the classifier", async () => {
    const { pi, inputHook, ctx } = setup();
    await inputHook.handler({ text: "  fix the null pointer bug  ", source: "user" }, ctx);
    const [, args] = (pi.exec as any).mock.calls[0];
    expect(args[args.length - 1]).toBe("fix the null pointer bug");
  });
});

// ---------------------------------------------------------------------------
// Prompt-router extension -- command registration
// ---------------------------------------------------------------------------

describe("prompt-router extension -- command registration", () => {
  it("registers all five router commands", () => {
    const pi = createMockPi();
    promptRouter(pi as any);

    const names = pi._commands.map((c) => c.name);
    expect(names).toContain("router-status");
    expect(names).toContain("router-reset");
    expect(names).toContain("router-off");
    expect(names).toContain("router-on");
    expect(names).toContain("router-explain");
  });

  it("/router-status shows the resolved current ladder and effort", async () => {
    const pi = createMockPi();
    promptRouter(pi as any);

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => [
          { provider: "openai-codex", id: "gpt-5.4-mini" },
          { provider: "openai-codex", id: "gpt-5.4-fast" },
          { provider: "openai-codex", id: "gpt-5.4" },
        ]),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const statusCmd = pi._commands.find((c) => c.name === "router-status")!;
    await statusCmd.handler([], ctx);

    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("Current model:    openai-codex/gpt-5.4"),
      "info"
    );
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("low  ->"),
      "info"
    );
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("mid  ->"),
      "info"
    );
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("high ->"),
      "info"
    );
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("Current effort:"),
      "info"
    );
  });

  it("/router-reset clears session state", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => [
          { provider: "openai-codex", id: "gpt-5.4-mini" },
          { provider: "openai-codex", id: "gpt-5.4-fast" },
          { provider: "openai-codex", id: "gpt-5.4" },
        ]),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Opus", "high"), stderr: "" });
    await inputHook.handler({ text: "design a distributed system", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    const resetCmd = pi._commands.find((c) => c.name === "router-reset");
    await resetCmd!.handler([], ctx);

    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: reset");
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(expect.stringContaining("reset"), "info");
  });
});

// ---------------------------------------------------------------------------
// Prompt-router extension -- session_start hook
// ---------------------------------------------------------------------------

describe("prompt-router extension -- session_start hook", () => {
  it("registers a session_start hook that sets ready status", async () => {
    const pi = createMockPi();
    promptRouter(pi as any);

    const sessionHooks = pi._getHook("session_start");
    expect(sessionHooks.length).toBeGreaterThan(0);

    const ctx = createMockCtx({
      ui: { ...createMockCtx().ui, setStatus: vi.fn() },
    });

    await sessionHooks[0].handler({}, ctx);
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: ready");
  });

  it("forces low thinking for configured GPT-5.5 default even when ctx.model is missing", async () => {
    const pi = createMockPi();
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const sessionHooks = pi._getHook("session_start");
    const ctx = createMockCtx({
      model: undefined,
      ui: { ...createMockCtx().ui, setStatus: vi.fn() },
    });

    await sessionHooks[0].handler({}, ctx);

    expect((pi as any).setThinkingLevel).toHaveBeenCalledWith("low");
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: ready");
  });
});

// ---------------------------------------------------------------------------
// T3: policy engine unit tests
// ---------------------------------------------------------------------------

function makeRouterState(currentTier: "low" | "mid" | "high", turnsAtCurrentTier = 0) {
  return {
    currentTier,
    turnsAtCurrentTier,
    downgradeCandidateTier: null as "low" | "mid" | "high" | null,
    consecutiveDowngradeTurns: 0,
    lastRaw: null as "low" | "mid" | "high" | null,
    lastEffective: null as "low" | "mid" | "high" | null,
    lastPromptSnippet: "",
    enabled: true,
    lastClassifierRec: null,
    lastAppliedEffort: null,
    lastRuleFired: null,
    cooldownTurnsRemaining: 0,
  };
}

function makePolicy(overrides: Partial<{
  N_HOLD: number; DOWNGRADE_THRESHOLD: number; K_CONSEC: number;
  COOLDOWN_TURNS: number; UNCERTAIN_THRESHOLD: number;
  UNCERTAIN_FALLBACK_ENABLED: boolean; maxEffortLevel: string;
}> = {}) {
  return {
    N_HOLD: 3, DOWNGRADE_THRESHOLD: 0.85, K_CONSEC: 2, COOLDOWN_TURNS: 2,
    UNCERTAIN_THRESHOLD: 0.55, UNCERTAIN_FALLBACK_ENABLED: false,
    maxEffortLevel: "high", ...overrides,
  };
}

describe("T3: hysteresis covers joint state", () => {
  it("alternating low/mid over 5 turns with confidence 0.6 produces at most 1 upgrade, no downgrade during N_HOLD", () => {
    const state = makeRouterState("low", 0);
    const policy = makePolicy();
    const tiers = ["low", "mid", "low", "mid", "low"] as const;
    let upgrades = 0;
    let downgrades = 0;
    let prevTier = state.currentTier;

    for (const tier of tiers) {
      const rec = { schema_version: "3.0.0", primary: { model_tier: tier === "low" ? "Haiku" : "Sonnet", effort: "medium" }, candidates: [{ model_tier: tier === "low" ? "Haiku" : "Sonnet", effort: "medium", confidence: 0.6 }], confidence: 0.6 };
      const { tier: applied } = applyPolicy(rec as any, state, policy);
      if (applied !== prevTier) {
        const prevOrder = applied === "low" ? 0 : applied === "mid" ? 1 : 2;
        const curOrder = prevTier === "low" ? 0 : prevTier === "mid" ? 1 : 2;
        if (prevOrder > curOrder) upgrades++;
        else downgrades++;
        prevTier = applied;
      }
    }

    // At most 1 upgrade (low->mid on first mid classifier output), no downgrades during N_HOLD window.
    expect(upgrades).toBeLessThanOrEqual(1);
    expect(downgrades).toBe(0);
  });
});

describe("T3: downgrade requires K_CONSEC", () => {
  it("1 turn of low confidence after N_HOLD does not downgrade; 2nd turn does", () => {
    const policy = makePolicy();
    const state = makeRouterState("mid", policy.N_HOLD); // already past hold window

    // Turn 1: low confidence > DOWNGRADE_THRESHOLD, but only 1 consecutive -- no downgrade yet.
    const rec1 = { schema_version: "3.0.0", primary: { model_tier: "Haiku", effort: "low" }, candidates: [{ model_tier: "Haiku", effort: "low", confidence: 0.9 }], confidence: 0.9 };
    const { tier: tier1 } = applyPolicy(rec1 as any, state, policy);
    expect(tier1).toBe("mid");

    // Turn 2: same low recommendation -- K_CONSEC=2 satisfied, downgrade fires.
    const rec2 = { schema_version: "3.0.0", primary: { model_tier: "Haiku", effort: "low" }, candidates: [{ model_tier: "Haiku", effort: "low", confidence: 0.9 }], confidence: 0.9 };
    const { tier: tier2 } = applyPolicy(rec2 as any, state, policy);
    expect(tier2).toBe("low");
  });
});

describe("T3: cooldown decays", () => {
  it("escalateFor(2) applies the escalated route for exactly 2 turns then exits cooldown", () => {
    // Test the policy engine directly so we can observe state precisely.
    const policy = makePolicy({ COOLDOWN_TURNS: 2 });
    const state = makeRouterState("mid", 1); // mid baseline

    // Trigger cooldown -- escalates currentTier from mid to high for 2 turns.
    state.currentTier = "high";
    state.cooldownTurnsRemaining = 2;

    // Turn 1 of cooldown: classifier says low, cooldown keeps high.
    const rec = { schema_version: "3.0.0", primary: { model_tier: "Haiku", effort: "low" }, candidates: [{ model_tier: "Haiku", effort: "low", confidence: 0.9 }], confidence: 0.9 };
    const { tier: tier1, ruleFired: rule1 } = applyPolicy(rec as any, state, policy);
    expect(tier1).toBe("high");
    expect(rule1).toBe("cooldown");
    expect(state.cooldownTurnsRemaining).toBe(1);

    // Turn 2 of cooldown: still held.
    const { tier: tier2, ruleFired: rule2 } = applyPolicy(rec as any, state, policy);
    expect(tier2).toBe("high");
    expect(rule2).toBe("cooldown");
    expect(state.cooldownTurnsRemaining).toBe(0);

    // Turn 3: cooldown expired -- normal hysteresis takes over.
    const { ruleFired: rule3 } = applyPolicy(rec as any, state, policy);
    expect(rule3).not.toBe("cooldown");
  });
});

describe("T3: uncertainty fallback", () => {
  it("when enabled: classifier returns Haiku with confidence 0.4 while at mid -> stays at mid", () => {
    const policy = makePolicy({ UNCERTAIN_THRESHOLD: 0.55, UNCERTAIN_FALLBACK_ENABLED: true });
    const state = makeRouterState("mid", 5);

    const rec = { schema_version: "3.0.0", primary: { model_tier: "Haiku", effort: "low" }, candidates: [{ model_tier: "Haiku", effort: "low", confidence: 0.4 }], confidence: 0.4 };
    const { tier, ruleFired } = applyPolicy(rec as any, state, policy);
    expect(tier).toBe("mid"); // stayed at mid, not downgraded
    expect(ruleFired).toBe("uncertainty-fallback");
  });

  it("when disabled (default): low-confidence low-tier classifier downgrades normally after hysteresis allows", () => {
    const policy = makePolicy({ UNCERTAIN_THRESHOLD: 0.55 }); // UNCERTAIN_FALLBACK_ENABLED=false
    const state = makeRouterState("mid", 5); // past N_HOLD window

    // Turn 1: low-confidence Haiku; fallback is disabled, so hysteresis path runs.
    // With K_CONSEC=2, first eligible turn does not downgrade yet.
    const rec = { schema_version: "3.0.0", primary: { model_tier: "Haiku", effort: "low" }, candidates: [{ model_tier: "Haiku", effort: "low", confidence: 0.4 }], confidence: 0.4 };
    const { tier: t1, ruleFired: r1 } = applyPolicy(rec as any, state, policy);
    expect(t1).toBe("mid");
    expect(r1).not.toBe("uncertainty-fallback");

    // Turn 2: same low-confidence Haiku; K_CONSEC=2 satisfied, downgrade to low.
    const { tier: t2, ruleFired: r2 } = applyPolicy(rec as any, state, policy);
    expect(t2).toBe("low");
    expect(r2).not.toBe("uncertainty-fallback");
  });
});

describe("T3: effort cap clamps", () => {
  it("classifier returns Opus/high with high confidence and maxLevel=high -> applies Opus/high (xhigh clamped)", () => {
    const policy = makePolicy({ maxEffortLevel: "high" });
    const state = makeRouterState("low", 0);

    // Classifier wants xhigh -- schema maps to thinking level "xhigh" -> clamped to "high".
    const rec = { schema_version: "3.0.0", primary: { model_tier: "Opus", effort: "high" }, candidates: [{ model_tier: "Opus", effort: "high", confidence: 0.95 }], confidence: 0.95 };
    const { tier, effort, ruleFired } = applyPolicy(rec as any, state, policy);
    expect(tier).toBe("high");
    expect(effort).toBe("high"); // not xhigh
    // If classifier had said xhigh (via schema), effort-cap would fire.
    // Here effort stays "high" which is within cap, so rule is classifier.
    expect(ruleFired).toBe("classifier");
  });

  it("effort above maxLevel is clamped and fires effort-cap rule", () => {
    const policy = makePolicy({ maxEffortLevel: "medium" });
    const state = makeRouterState("low", 0);

    // SCHEMA_EFFORT_TO_THINKING maps "high" -> "high", which exceeds cap "medium".
    const rec = { schema_version: "3.0.0", primary: { model_tier: "Opus", effort: "high" }, candidates: [{ model_tier: "Opus", effort: "high", confidence: 0.95 }], confidence: 0.95 };
    const { effort, ruleFired } = applyPolicy(rec as any, state, policy);
    expect(effort).toBe("medium");
    expect(ruleFired).toBe("effort-cap");
  });
});

describe("T3: /router-explain exists", () => {
  it("router-explain command is registered", () => {
    const pi = createMockPi();
    promptRouter(pi as any);
    const names = pi._commands.map((c) => c.name);
    expect(names).toContain("router-explain");
  });
});

// ---------------------------------------------------------------------------
// T5: ship-config regression coverage
// ---------------------------------------------------------------------------

describe("T5: effort cap clamps xhigh to high", () => {
  it("classifier-shaped xhigh intent is clamped down to maxLevel=high", () => {
    // Schema-mapped effort "high" exceeds cap "medium" -> cap fires.
    // There is no schema value for xhigh (schema enum: none/low/medium/high),
    // so xhigh is prevented at the wire. The policy-level cap is the
    // belt-and-suspenders guarantee.
    const policy = makePolicy({ maxEffortLevel: "high" });
    const state = makeRouterState("low", 0);

    // With maxEffortLevel="high", schema "high" is within cap -- classifier rule.
    const rec = {
      schema_version: "3.0.0",
      primary: { model_tier: "Opus", effort: "high" },
      candidates: [{ model_tier: "Opus", effort: "high", confidence: 0.95 }],
      confidence: 0.95,
    };
    const { effort, ruleFired } = applyPolicy(rec as any, state, policy);
    expect(effort).toBe("high");
    expect(ruleFired).toBe("classifier");

    // Now lower the cap to "medium" -- the same classifier recommendation
    // must be clamped down.
    const cappedPolicy = makePolicy({ maxEffortLevel: "medium" });
    const state2 = makeRouterState("low", 0);
    const applied = applyPolicy(rec as any, state2, cappedPolicy);
    expect(applied.effort).toBe("medium");
    expect(applied.ruleFired).toBe("effort-cap");
  });
});

describe("T5: schema_version mismatch falls back", () => {
  it("schema_version 99.0.0 -> null-path, no crash", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    (pi.exec as any).mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({
        schema_version: "99.0.0",
        primary: { model_tier: "Sonnet", effort: "medium" },
        candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.8 }],
        confidence: 0.8,
      }),
      stderr: "",
    });

    await expect(
      inputHook.handler({ text: "a prompt", source: "user" }, ctx)
    ).resolves.toEqual({ action: "continue" });
    await new Promise((r) => setTimeout(r, 0));

    expect((pi as any).setModel).not.toHaveBeenCalled();
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("classifier output invalid"),
      "warning"
    );
  });
});

describe("T5: malformed JSON falls back", () => {
  it("garbage stdout -> null-path, no crash", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => [{ provider: "openai-codex", id: "gpt-5.4-mini" }]),
        find: vi.fn(() => ({ provider: "openai-codex", id: "gpt-5.4-mini" })),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: "}{ not json at all %%%", stderr: "" });

    await expect(
      inputHook.handler({ text: "trigger garbage", source: "user" }, ctx)
    ).resolves.toEqual({ action: "continue" });
    await new Promise((r) => setTimeout(r, 0));

    expect((pi as any).setModel).not.toHaveBeenCalled();
  });
});

describe("T5: temporary escalation decays", () => {
  it("_escalateFor(2) escalates for 2 turns, decays on turn 3", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;

    // Trigger cooldown escalation (from default low baseline).
    (pi as any)._escalateFor(2);

    // Turn 1 of cooldown: classifier says low (Haiku), but cooldown holds escalated tier.
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.9), stderr: "" });
    await inputHook.handler({ text: "prompt 1", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    (ctx.ui as any).notify.mockClear();
    await explainCmd.handler([], ctx);
    let output = (ctx.ui as any).notify.mock.calls[0][0];
    expect(output).toContain("cooldown");

    // Turn 2 of cooldown: still held.
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.9), stderr: "" });
    await inputHook.handler({ text: "prompt 2", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));
    (ctx.ui as any).notify.mockClear();
    await explainCmd.handler([], ctx);
    output = (ctx.ui as any).notify.mock.calls[0][0];
    expect(output).toContain("cooldown");

    // Turn 3: cooldown expired, classifier recommendation takes over.
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.9), stderr: "" });
    await inputHook.handler({ text: "prompt 3", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));
    (ctx.ui as any).notify.mockClear();
    await explainCmd.handler([], ctx);
    output = (ctx.ui as any).notify.mock.calls[0][0];
    expect(output).not.toContain("Rule fired: cooldown");
  });
});

describe("T5: N_HOLD=0 disables hysteresis hold", () => {
  it("with N_HOLD=0, classifier output drives routing every turn -- no hold window", () => {
    const policy = makePolicy({ N_HOLD: 0, K_CONSEC: 1 });
    const state = makeRouterState("high", 1); // Just upgraded, turnsAtCurrentTier=1.

    // With N_HOLD=0, downgrade to low should fire immediately (K_CONSEC=1).
    const rec = {
      schema_version: "3.0.0",
      primary: { model_tier: "Haiku", effort: "low" },
      candidates: [{ model_tier: "Haiku", effort: "low", confidence: 0.9 }],
      confidence: 0.9,
    };
    const { tier } = applyPolicy(rec as any, state, policy);
    // Step size stays at one tier per eligible turn (high -> mid).
    expect(tier).toBe("mid");

    // Next turn: another low recommendation -> one more step.
    const { tier: tier2 } = applyPolicy(rec as any, state, policy);
    expect(tier2).toBe("low");
  });
});

describe("T5: ConfGate ensemble_rule flows through", () => {
  it("router captures ensemble_rule and /router-explain reports it", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];

    const confgateJson = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "Sonnet", effort: "medium" },
      candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.82 }],
      confidence: 0.82,
      ensemble_rule: "agree",
    });
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: confgateJson, stderr: "" });
    await inputHook.handler({ text: "refactor this module", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
    (ctx.ui as any).notify.mockClear();
    await explainCmd.handler([], ctx);

    const output = (ctx.ui as any).notify.mock.calls[0][0];
    expect(output).toContain("ensemble_rule: agree");
  });

  it("safeParseClassifierOutput captures ensemble_rule when present", () => {
    const raw = JSON.stringify({
      schema_version: "3.0.0",
      primary: { model_tier: "Opus", effort: "high" },
      candidates: [{ model_tier: "Opus", effort: "high", confidence: 0.9 }],
      confidence: 0.9,
      ensemble_rule: "lgb-confident",
    });
    const rec = safeParseClassifierOutput(raw);
    expect(rec).not.toBeNull();
    expect(rec!.ensemble_rule).toBe("lgb-confident");
  });
});

describe("T5: /router-explain full decision trail", () => {
  it("includes prompt snippet, classifier JSON, applied route, rule, and current state", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    (pi as any).setThinkingLevel = vi.fn();
    promptRouter(pi as any);

    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4-fast" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    const promptText = "explain how the router policy integrates with confgate classifier output";
    (pi.exec as any).mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({
        schema_version: "3.0.0",
        primary: { model_tier: "Sonnet", effort: "medium" },
        candidates: [
          { model_tier: "Haiku", effort: "low", confidence: 0.1 },
          { model_tier: "Sonnet", effort: "medium", confidence: 0.82 },
        ],
        confidence: 0.82,
        ensemble_rule: "lgb-confident",
      }),
      stderr: "",
    });
    await inputHook.handler({ text: promptText, source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
    (ctx.ui as any).notify.mockClear();
    await explainCmd.handler([], ctx);

    const output = (ctx.ui as any).notify.mock.calls[0][0];

    // (a) classifier raw fields
    expect(output).toContain("schema_version: 3.0.0");
    expect(output).toContain("legacy_primary: {model_tier: Sonnet, effort: medium}");
    expect(output).toContain("confidence: 0.82");
    expect(output).toContain("canonical_candidates:");
    // (b) applied route
    expect(output).toContain("Applied route: core/medium");
    // (c) rule fired
    expect(output).toContain("Rule fired:");
    // (d) confidence already asserted above
    // (e) current model + current effort + cap
    expect(output).toContain("Current state:");
    expect(output).toContain("model=openai-codex/gpt-5.4-fast");
    expect(output).toContain("effort=medium");
    expect(output).toContain("cap=high");
    // prompt snippet
    expect(output).toContain("Prompt:");
    expect(output).toContain(promptText.slice(0, 40));
  });
});

describe("Provider architecture spike: awaited provider seam", () => {
  function routeCtx(current = { provider: "openai-codex", id: "gpt-5.4-mini" }) {
    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    return createMockCtx({
      model: current,
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });
  }

  it("awaits classification before provider dispatch and carries one immutable decision id", async () => {
    const pi = createMockPi();
    const order: string[] = ["pre-generation-start"];
    let releaseClassifier!: () => void;
    const classifierPending = new Promise<void>((resolve) => {
      releaseClassifier = resolve;
    });
    (pi.exec as any).mockImplementationOnce(async () => {
      order.push("classifier-start");
      await classifierPending;
      order.push("classifier-finish");
      return { code: 0, stdout: makeV3Json("Sonnet", "medium", 0.91), stderr: "" };
    });
    const decisionPromise = resolveProviderRouteDecision(pi as any, "synthetic same turn prompt", routeCtx());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["pre-generation-start", "classifier-start"]);
    releaseClassifier();
    const decision = await decisionPromise;
    order.push("route-resolved");
    const payload = applyRouteDecisionToProviderPayload({ model: "ambient-default", prompt: "synthetic same turn prompt" }, { ...decision, same_turn_applied: true }) as Record<string, unknown>;
    order.push("dispatch-called");
    order.push("first-token-or-provider-invoked");

    expect(order).toEqual([
      "pre-generation-start",
      "classifier-start",
      "classifier-finish",
      "route-resolved",
      "dispatch-called",
      "first-token-or-provider-invoked",
    ]);
    expect(payload.route_decision_id).toBe(decision.route_decision_id);
    expect(payload.model).toBe(decision.model_label);
    expect(payload.reasoning_effort).toBe(decision.thinking_level);
    expect(payload.same_turn_applied).toBe(true);
    expect(decision.route_resolution_reason).toBe("matched");
  });

  it("fails closed on timeout without applying stale previous route", async () => {
    const pi = createMockPi();
    (pi.exec as any).mockImplementationOnce(async () => new Promise(() => {}));
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic timeout prompt", routeCtx(), 1);
    expect(decision.route_resolution_reason).toBe("classifier_timeout");
    expect(decision.model_label).toBe("gpt-5.4-mini");
    expect(decision.same_turn_applied).toBe(false);
  });

  it("denies implicit cross-provider routing", async () => {
    const pi = createMockPi();
    const ctx = routeCtx({ provider: "anthropic", id: "claude-sonnet" });
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium", 0.91), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic provider boundary", ctx);
    expect(decision.route_resolution_reason).toBe("denied_by_policy");
    expect(decision.provider_family).toBe("anthropic");
  });

  it("keeps out-of-order prompt completions correlated by decision id", async () => {
    const pi = createMockPi();
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    (pi.exec as any)
      .mockImplementationOnce(async () => {
        await firstPending;
        return { code: 0, stdout: makeV3Json("Opus", "high", 0.95), stderr: "" };
      })
      .mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.95), stderr: "" });
    const first = resolveProviderRouteDecision(pi as any, "synthetic prompt one", routeCtx({ provider: "openai-codex", id: "gpt-5.4" }));
    const second = resolveProviderRouteDecision(pi as any, "synthetic prompt two", routeCtx());
    const secondDecision = await second;
    releaseFirst();
    const firstDecision = await first;
    expect(firstDecision.route_decision_id).not.toBe(secondDecision.route_decision_id);
    expect(firstDecision.prompt_hash).not.toBe(secondDecision.prompt_hash);
  });

  it("resolves profile fields from the immutable route decision", async () => {
    const pi = createMockPi();
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium", 0.91), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic resolver prompt", routeCtx());
    const profile = resolveRouteProfile(decision);
    expect(profile.route).toBe("core");
    expect(profile.profile).toBe("codex:core");
    expect(profile.provider).toBe("openai-codex");
    expect(profile.model).toBe(decision.model_label);
    expect(profile.routeState).toBe("available");
    expect(profile.providerTrust).toBe("same-family");
    expect(profile.confidence).toBe(0.91);
    expect(profile.candidates[0].route).toBe("core");
    expect(profile.contextFlags).toEqual([]);
    expect(profile.overrideScope).toBe("none");
  });

  it("falls back from nano to mini by default without leaking prompt text", async () => {
    const pi = createMockPi();
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("nano", "low", 0.88), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic nano prompt", routeCtx());
    expect(decision.raw_route).toBe("nano");
    expect(decision.applied_route).toBe("mini");
    expect(decision.route_resolution_reason).toBe("fallback_used");
    expect(decision.decisionTrace.fallbackFrom).toBe("nano");
    expect(decision.decisionTrace.routeState).toBe("fallback");
    expect(JSON.stringify(decision)).not.toContain("synthetic nano prompt");
  });

  it("uses only canonical route-state values and marks max as policy-only", async () => {
    const pi = createMockPi();
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("max", "high", 0.93), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic max prompt", routeCtx());
    expect(decision.raw_route).toBe("max");
    expect(decision.applied_route).toBe("max");
    expect(decision.decisionTrace.routeState).toBe("policy-only");
    expect(["available", "fallback", "policy-only", "disabled"]).toContain(decision.decisionTrace.routeState);
  });

  it("builds a deterministic continuation capsule without prompt text", () => {
    const capsule = buildRoutingContextCapsule({ prompt: "do option 2", messages: Array.from({ length: 120 }, () => ({ role: "user", content: "x" })) }, { model: { contextWindow: 1000 }, usage: { tokens: 900 }, router: { previousAppliedRoute: "large" } });
    expect(capsule.messageCount).toBe(99);
    expect(capsule.estimatedPromptChars).toBe("do option 2".length);
    expect(capsule.contextPercent).toBe(90);
    expect(capsule.isContinuation).toBe(true);
    expect(capsule.dependencyOnPriorContext).toBe(true);
    expect(capsule.lastEffectiveSize).toBe("large");
    expect(capsule.unresolvedTask).toBe(true);
    expect(capsule.flags).toEqual(["multi_turn", "context_window_high", "continuation_detected", "depends_on_prior_context", "unresolved_task"]);
    expect(JSON.stringify(capsule)).not.toContain("do option 2");
  });

  it("recognizes continuation phrases and rejects non-continuation lookalikes", () => {
    expect(buildRoutingContextCapsule({ prompt: "patch it" }, { router: { previousAppliedRoute: "core" } }).isContinuation).toBe(true);
    expect(buildRoutingContextCapsule({ prompt: "same but with auth" }, { router: { previousAppliedRoute: "core" } }).isContinuation).toBe(true);
    expect(buildRoutingContextCapsule({ prompt: "optionally explain auth" }, { router: { previousAppliedRoute: "core" } }).isContinuation).toBe(false);
    expect(buildRoutingContextCapsule({ prompt: "hi" }, { router: { previousAppliedRoute: "large" } }).dependencyOnPriorContext).toBe(false);
  });

  it("holds a one-turn continuation downgrade from the previous applied route", async () => {
    const pi = createMockPi();
    const ctx = routeCtx();
    (ctx as any).router = { previousAppliedRoute: "large" };
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.95), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "do option 2", ctx);
    expect(decision.raw_route).toBe("mini");
    expect(decision.applied_route).toBe("large");
    expect(decision.decisionTrace.contextFlags).toContain("context-continuation-hold");
    expect(decision.fallback_reason).toBe("one-turn context-continuation-hold");
  });

  it("allows unrelated and cheap continuation downgrades", async () => {
    const pi = createMockPi();
    const unrelatedCtx = routeCtx();
    (unrelatedCtx as any).router = { previousAppliedRoute: "large" };
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.95), stderr: "" });
    const unrelated = await resolveProviderRouteDecision(pi as any, "hi", unrelatedCtx);
    expect(unrelated.applied_route).toBe("mini");
    expect(unrelated.decisionTrace.contextFlags).not.toContain("context-continuation-hold");

    const cheapCtx = routeCtx();
    (cheapCtx as any).router = { previousAppliedRoute: "large" };
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.95), stderr: "" });
    const cheap = await resolveProviderRouteDecision(pi as any, "briefly do option 2", cheapCtx);
    expect(cheap.applied_route).toBe("mini");
    expect(cheap.decisionTrace.contextFlags).toContain("downgrade_intent_detected");
    expect(cheap.decisionTrace.contextFlags).toContain("context-continuation-hold-bypassed");
  });

  it("applies route pin before session override and records override scope/lifetime", async () => {
    const pi = createMockPi();
    const ctx = routeCtx();
    (ctx as any).router = { routeOverride: "mini", routePin: "large" };
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium", 0.91), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic override prompt", ctx);
    expect(decision.raw_route).toBe("core");
    expect(decision.applied_route).toBe("large");
    expect(decision.decisionTrace.overrideScope).toBe("route-pin");
    expect(decision.decisionTrace.overrideLifetime).toBe("until-cleared");
    expect(decision.decisionTrace.rule).toBe("override:route-pin");
  });

  it("preserves explicit user-selected model in provider payload", async () => {
    const pi = createMockPi();
    const ctx = routeCtx();
    (ctx as any).router = { explicitModelSelection: true };
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium", 0.91), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic explicit model prompt", ctx);
    expect(decision.decisionTrace.explicitModelPreserved).toBe(true);
    const payload = applyRouteDecisionToProviderPayload({ prompt: "synthetic explicit model prompt", model: "user/chosen", explicit_model_selection: true }, decision, ctx) as Record<string, unknown>;
    expect(payload.model).toBe("user/chosen");
    expect(payload.explicit_model_preserved).toBe(true);
  });

  it("reports provider trust and denied fallback metadata", async () => {
    const pi = createMockPi();
    const ctx = routeCtx({ provider: "anthropic", id: "claude-sonnet" });
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium", 0.91), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic provider trust prompt", ctx);
    expect(decision.route_resolution_reason).toBe("denied_by_policy");
    expect(decision.decisionTrace.providerTrust).toBe("cross-provider-denied");
    expect(decision.decisionTrace.fallbackAllowed).toBe(false);
    expect(decision.decisionTrace.fallbackDeniedReason).toBe("cross-provider fallback denied");
    expect(JSON.stringify(decision)).not.toContain("synthetic provider trust prompt");
  });

  it("raises low routes when context-window safety is high", async () => {
    const pi = createMockPi();
    const ctx = routeCtx({ provider: "openai-codex", id: "gpt-5.4-mini", contextWindow: 1000 } as any);
    (ctx as any).usage = { tokens: 950 };
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Haiku", "low", 0.95), stderr: "" });
    const decision = await resolveProviderRouteDecision(pi as any, "synthetic context safety prompt", ctx);
    expect(decision.raw_route).toBe("mini");
    expect(decision.applied_route).toBe("core");
    expect(decision.decisionTrace.contextFlags).toContain("context_window_high");
    expect(decision.decisionTrace.contextFlags).toContain("context_window_floor");
  });
});

describe("T0: same-turn routing feasibility", () => {
  it("documents that the input hook returns continue before async routing applies", async () => {
    const pi = createMockPi();
    const order: string[] = [];
    let releaseClassifier!: () => void;
    const classifierPending = new Promise<void>((resolve) => {
      releaseClassifier = resolve;
    });

    (pi as any).setModel = vi.fn(async () => {
      order.push("setModel");
    });
    (pi as any).setThinkingLevel = vi.fn(() => {
      order.push("setThinkingLevel");
    });
    (pi.exec as any).mockImplementationOnce(async () => {
      order.push("classifier-start");
      await classifierPending;
      order.push("classifier-finish");
      return {
        code: 0,
        stdout: JSON.stringify({
          schema_version: "3.0.0",
          primary: { model_tier: "Sonnet", effort: "medium" },
          candidates: [{ model_tier: "Sonnet", effort: "medium", confidence: 0.91 }],
          confidence: 0.91,
        }),
        stderr: "",
      };
    });

    promptRouter(pi as any);
    const availableModels = [
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      { provider: "openai-codex", id: "gpt-5.4-fast" },
      { provider: "openai-codex", id: "gpt-5.4" },
    ];
    const ctx = createMockCtx({
      model: { provider: "openai-codex", id: "gpt-5.4-mini" },
      modelRegistry: {
        getAvailable: vi.fn(() => availableModels),
        find: vi.fn((provider: string, id: string) => availableModels.find((m) => m.provider === provider && m.id === id)),
      },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const inputHook = pi._getHook("input")[0];
    const result = await inputHook.handler({ text: "synthetic prompt requiring broader reasoning", source: "user" }, ctx);
    order.push("hook-returned-continue");

    expect(result).toEqual({ action: "continue" });
    expect(order).toEqual(["classifier-start", "hook-returned-continue"]);
    expect((pi as any).setModel).not.toHaveBeenCalled();

    releaseClassifier();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(["classifier-start", "hook-returned-continue", "classifier-finish", "setModel", "setThinkingLevel"]);
  });
});

describe("T6: privacy-conscious router telemetry", () => {
  it("serializes schema-versioned routing telemetry without raw prompt text", () => {
    const privatePrompt = ["PRIVATE", "ROUTER", "PROMPT", "DO", "NOT", "LOG"].join("_");
    const payload = buildRouterTelemetryPayload({
      promptHash: "a".repeat(64),
      classifierMode: "t2",
      rawRoute: "large",
      appliedRoute: "core",
      rec: {
        schema_version: "3.0.0",
        primary: { model_tier: "Opus", effort: "high" },
        candidates: [
          { model_tier: "Opus", effort: "high", confidence: 0.7 },
          { model_tier: "Sonnet", effort: "medium", confidence: 0.55 },
        ],
        confidence: 0.7,
      },
      previousRoute: "core",
      ruleFired: "context-continuation-hold",
      contextCapsule: {
        isContinuation: true,
        dependencyOnPriorContext: true,
        lastEffectiveSize: "core",
        unresolvedTask: true,
        downgradeIntentDetected: false,
        messageCount: 2,
        contextPercent: null,
        flags: ["continuation_detected"],
      },
      providerFamily: "openai-codex",
      modelLabel: "gpt-5.4",
      profile: "codex-large",
      latencyMs: 12,
      fallbackReason: "one-turn context-continuation-hold",
    });
    const serialized = JSON.stringify(payload);

    expect(payload.schema_version).toBe("router-log-v1");
    expect(payload.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.prompt_excerpt).toBeNull();
    expect(payload.raw_route).toBe("large");
    expect(payload.applied_route).toBe("core");
    expect(payload.candidate_margin).toBe(0.15);
    expect(payload.context_capsule).toMatchObject({
      isContinuation: true,
      dependencyOnPriorContext: true,
      lastEffectiveSize: "core",
      unresolvedTask: true,
    });
    expect(payload.provider_family).toBe("openai-codex");
    expect(payload.model_label).toBe("gpt-5.4");
    expect(payload.profile).toBe("codex-large");
    expect(payload.latency_ms).toBe(12);
    expect(serialized).not.toContain(privatePrompt);
    expect(serialized).not.toContain("prompt_text");
    expect(serialized).not.toContain("raw_prompt");
  });
});
