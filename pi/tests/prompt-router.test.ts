import { describe, expect, it, vi } from "vitest";
import promptRouter, {
  isValidTier,
  applyNeverDowngrade,
  buildStatusLabel,
} from "../extensions/prompt-router.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

// ---------------------------------------------------------------------------
// Pure helper unit tests
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

describe("applyNeverDowngrade", () => {
  function makeState(sessionMax: "low" | "mid" | "high") {
    return {
      sessionMax,
      lastRaw: null,
      lastEffective: null,
      lastPromptSnippet: "",
      enabled: true,
    };
  }

  it("returns raw tier when it equals sessionMax", () => {
    const state = makeState("mid");
    expect(applyNeverDowngrade("mid", state)).toBe("mid");
    expect(state.sessionMax).toBe("mid");
  });

  it("escalates sessionMax when raw is higher", () => {
    const state = makeState("low");
    const effective = applyNeverDowngrade("high", state);
    expect(effective).toBe("high");
    expect(state.sessionMax).toBe("high");
  });

  it("never downgrades — returns sessionMax when raw is lower", () => {
    const state = makeState("high");
    const effective = applyNeverDowngrade("low", state);
    expect(effective).toBe("high");
    expect(state.sessionMax).toBe("high"); // unchanged
  });

  it("mid → mid when sessionMax is already mid", () => {
    const state = makeState("mid");
    expect(applyNeverDowngrade("low", state)).toBe("mid");
  });
});

describe("buildStatusLabel", () => {
  it("returns plain label when no upgrade occurred", () => {
    const label = buildStatusLabel("low", "low", "low");
    expect(label).toContain("GPT-5.4 Mini");
    expect(label).toContain("▸");
    expect(label).not.toContain("kept");
  });

  it("appends upgrade annotation when effective differs from raw", () => {
    // sessionMax is high, raw was low, effective is high
    const label = buildStatusLabel("high", "low", "high");
    expect(label).toContain("GPT-5.4");
    expect(label).toContain("kept high");
  });

  it("uses correct icons per tier", () => {
    expect(buildStatusLabel("low", "low", "low")).toMatch(/^▸ /);
    expect(buildStatusLabel("mid", "mid", "mid")).toMatch(/^▸▸ /);
    expect(buildStatusLabel("high", "high", "high")).toMatch(/^▸▸▸ /);
  });
});

// ---------------------------------------------------------------------------
// Input hook routing-branch tests
// ---------------------------------------------------------------------------

describe("prompt-router extension — input hook", () => {
  function setup() {
    const pi = createMockPi();
    // Add setModel spy (not in base mock but needed for full routing path)
    (pi as any).setModel = vi.fn(async () => {});
    promptRouter(pi as any);

    const inputHooks = pi._getHook("input");
    if (inputHooks.length === 0) throw new Error("input hook not registered");
    const inputHook = inputHooks[0];

    const ctx = createMockCtx({
      modelRegistry: { find: vi.fn(() => undefined) },
      ui: {
        ...createMockCtx().ui,
        setStatus: vi.fn(),
        notify: vi.fn(),
      },
    });

    return { pi, inputHook, ctx };
  }

  it("skips classification for extension-generated input (existing)", async () => {
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

  it("skips classification for empty text", async () => {
    const { pi, inputHook, ctx } = setup();
    const result = await inputHook.handler({ text: "", source: "user" }, ctx);
    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("skips classification for whitespace-only text", async () => {
    const { pi, inputHook, ctx } = setup();
    const result = await inputHook.handler({ text: "   ", source: "user" }, ctx);
    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("skips classification when router is disabled", async () => {
    const { pi, inputHook, ctx } = setup();

    // Disable via /router-off command
    const offCmd = pi._commands.find((c) => c.name === "router-off");
    expect(offCmd).toBeDefined();
    await offCmd!.handler([], ctx);

    const result = await inputHook.handler({ text: "refactor this service", source: "user" }, ctx);
    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("calls exec for normal user text (happy path)", async () => {
    const { pi, inputHook, ctx } = setup();
    const result = await inputHook.handler(
      { text: "explain the architecture of this system", source: "user" },
      ctx
    );
    // Hook returns immediately (fire-and-forget classify)
    expect(result).toEqual({ action: "continue" });
    // exec is called synchronously before first await inside classifyAndRoute
    expect(pi.exec).toHaveBeenCalledWith(
      "python",
      expect.arrayContaining([expect.stringContaining("classify.py")]),
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it("passes the trimmed prompt text to the classifier", async () => {
    const { pi, inputHook, ctx } = setup();
    await inputHook.handler(
      { text: "  fix the null pointer bug  ", source: "user" },
      ctx
    );
    const [, args] = (pi.exec as any).mock.calls[0];
    // The second argument array ends with the prompt text
    expect(args[args.length - 1]).toBe("fix the null pointer bug");
  });
});

// ---------------------------------------------------------------------------
// Command registration tests
// ---------------------------------------------------------------------------

describe("prompt-router extension — command registration", () => {
  it("registers all four router commands", () => {
    const pi = createMockPi();
    promptRouter(pi as any);

    const names = pi._commands.map((c) => c.name);
    expect(names).toContain("router-status");
    expect(names).toContain("router-reset");
    expect(names).toContain("router-off");
    expect(names).toContain("router-on");
  });

  it("/router-reset clears session state", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
    promptRouter(pi as any);

    const ctx = createMockCtx({
      modelRegistry: { find: vi.fn(() => ({ id: "gpt-5.4" })) },
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    // Simulate a session-max escalation by triggering input hook
    const inputHook = pi._getHook("input")[0];
    // Fake a high-tier classify response
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: "high", stderr: "" });
    await inputHook.handler({ text: "design a distributed system", source: "user" }, ctx);
    // Let microtasks drain so classifyAndRoute completes
    await new Promise((r) => setTimeout(r, 0));

    // Now reset
    const resetCmd = pi._commands.find((c) => c.name === "router-reset");
    await resetCmd!.handler([], ctx);

    // Verify status was set to reset message
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: reset");
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("reset"),
      "info"
    );
  });

  it("/router-off disables and /router-on re-enables", async () => {
    const pi = createMockPi();
    promptRouter(pi as any);

    const ctx = createMockCtx({
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });

    const offCmd = pi._commands.find((c) => c.name === "router-off")!;
    const onCmd = pi._commands.find((c) => c.name === "router-on")!;

    await offCmd.handler([], ctx);
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: off");

    await onCmd.handler([], ctx);
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: on");
  });
});

// ---------------------------------------------------------------------------
// Session-start hook test
// ---------------------------------------------------------------------------

describe("prompt-router extension — session_start hook", () => {
  it("registers a session_start hook that sets ready status", async () => {
    const pi = createMockPi();
    promptRouter(pi as any);

    const sessionHooks = pi._getHook("session_start");
    expect(sessionHooks.length).toBeGreaterThan(0);

    const ctx = createMockCtx({
      ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
    });
    await sessionHooks[0].handler({}, ctx);
    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: ready");
  });
});
