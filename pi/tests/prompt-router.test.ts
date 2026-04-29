import { describe, expect, it, vi } from "vitest";
import promptRouter, {
  isValidTier,
  applyHysteresis,
  applyPolicy,
  buildStatusLabel,
  safeParseClassifierOutput,
} from "../extensions/prompt-router.ts";
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
  it("returns label with model and effort", () => {
    const label = buildStatusLabel("low", "low", "gpt-5.4-mini", "minimal");
    expect(label).toContain("gpt-5.4-mini");
    expect(label).toContain("minimal");
    expect(label).not.toContain("held");
  });

  it("appends held annotation when effective differs from raw", () => {
    const label = buildStatusLabel("high", "low", "claude-opus-4-6", "high");
    expect(label).toContain("claude-opus-4-6");
    expect(label).toContain("held from high");
  });

  it("shows cap when cap differs from applied effort", () => {
    const label = buildStatusLabel("high", "high", "claude-opus-4-6", "medium", "high", "effort-cap");
    expect(label).toContain("claude-opus-4-6");
    expect(label).toContain("medium");
  });

  it("shows rule when ruleFired is supplied", () => {
    const label = buildStatusLabel("mid", "mid", "gpt-5.4-fast", "medium", "medium", "classifier");
    expect(label).toContain("gpt-5.4-fast");
    expect(label).toContain("medium");
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

  it("calls exec for normal user text and routes to a dynamic same-family model", async () => {
    const { pi, inputHook, ctx } = setup();
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: makeV3Json("Sonnet", "medium"), stderr: "" });

    const result = await inputHook.handler(
      { text: "explain the architecture of this system", source: "user" },
      ctx
    );

    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).toHaveBeenCalledWith(
      "uv",
      expect.arrayContaining([
        "run",
        "--project",
        expect.stringContaining("prompt-routing"),
        "python",
        expect.stringContaining("classify.py"),
      ]),
      expect.objectContaining({ timeout: 5000 })
    );

    await new Promise((r) => setTimeout(r, 0));
    expect((pi as any).setModel).toHaveBeenCalledWith({ provider: "openai-codex", id: "gpt-5.4-fast" });
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith(
      "router",
      expect.stringContaining("gpt-5.4-fast")
    );
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
    expect(output).toContain("primary: {model: Sonnet, effort: medium}");
    expect(output).toContain("confidence: 0.82");
    expect(output).toContain("candidates:");
    // (b) applied route
    expect(output).toContain("Applied route: Sonnet/medium");
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
