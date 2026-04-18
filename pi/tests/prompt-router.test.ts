import { describe, expect, it, vi } from "vitest";
import promptRouter, {
  isValidTier,
  applyNeverDowngrade,
  buildStatusLabel,
} from "../extensions/prompt-router.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

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
    expect(state.sessionMax).toBe("high");
  });
});

describe("buildStatusLabel", () => {
  it("returns plain label when no upgrade occurred", () => {
    const label = buildStatusLabel("low", "low", "low", "gpt-5.4-mini");
    expect(label).toContain("gpt-5.4-mini");
    expect(label).toContain("▸");
    expect(label).not.toContain("kept");
  });

  it("appends upgrade annotation when effective differs from raw", () => {
    const label = buildStatusLabel("high", "low", "high", "claude-opus-4-6");
    expect(label).toContain("claude-opus-4-6");
    expect(label).toContain("kept high");
  });
});

describe("prompt-router extension — input hook", () => {
  function setup(overrides: Record<string, any> = {}) {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
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
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: "mid", stderr: "" });

    const result = await inputHook.handler(
      { text: "explain the architecture of this system", source: "user" },
      ctx
    );

    expect(result).toEqual({ action: "continue" });
    expect(pi.exec).toHaveBeenCalledWith(
      "python",
      expect.arrayContaining([expect.stringContaining("classify.py")]),
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

  it("/router-status shows the resolved current ladder", async () => {
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
      expect.stringContaining("low  → gpt-5.4-mini"),
      "info"
    );
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("mid  → gpt-5.4-fast"),
      "info"
    );
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("high → gpt-5.4"),
      "info"
    );
  });

  it("/router-reset clears session state", async () => {
    const pi = createMockPi();
    (pi as any).setModel = vi.fn(async () => {});
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
    (pi.exec as any).mockResolvedValueOnce({ code: 0, stdout: "high", stderr: "" });
    await inputHook.handler({ text: "design a distributed system", source: "user" }, ctx);
    await new Promise((r) => setTimeout(r, 0));

    const resetCmd = pi._commands.find((c) => c.name === "router-reset");
    await resetCmd!.handler([], ctx);

    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: reset");
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(expect.stringContaining("reset"), "info");
  });
});

describe("prompt-router extension — session_start hook", () => {
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
});
