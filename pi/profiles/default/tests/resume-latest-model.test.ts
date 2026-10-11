import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import resumeLatestModel, { latestSameFamily } from "../extensions/resume-latest-model.ts";

type Candidate = { provider: string; id: string };
const model = (provider: string, id: string): Candidate => ({ provider, id });

function lifecycle(saved: Candidate, available: Candidate[]) {
  const handlers = new Map<string, (event: { reason: string }, ctx: any) => Promise<void>>();
  const setModel = vi.fn(async () => true);
  resumeLatestModel({ on: (name: string, handler: any) => handlers.set(name, handler), setModel } as never);
  const ctx = {
    model: saved,
    sessionManager: { getBranch: () => [{ type: "message" }] },
    modelRegistry: { getAll: vi.fn(() => available) },
    ui: { notify: vi.fn() },
  };
  return { start: handlers.get("session_start")!, setModel, ctx };
}

describe("resumed model upgrades", () => {
  beforeEach(() => vi.stubEnv("PI_SUBAGENT_AUTHORITY", undefined));
  afterEach(() => vi.unstubAllEnvs());
  it("keeps provider and tier, choosing pinned Sol 6.1 and newer versions of other families", () => {
    const available = [
      model("openai", "gpt-5.6-sol"), model("openai", "gpt-6-sol"),
      model("openai", "gpt-6-luna"), model("bedrock-mantle", "openai.gpt-6-sol"),
      model("bedrock-mantle", "anthropic.claude-opus-5"), model("bedrock-mantle", "anthropic.claude-opus-5-5"),
      model("openai", "gpt-6.1-sol"),
    ];
    expect(latestSameFamily(model("openai", "gpt-5.6-sol"), available)).toEqual(available[6]);
    expect(latestSameFamily(model("openai-codex", "gpt-6-sol"), available)).toEqual(available[6]);
    expect(latestSameFamily(model("openai", "gpt-6.1-sol"), available)).toBeUndefined();
    expect(latestSameFamily(model("bedrock-mantle", "openai.gpt-5.6-sol"), available)).toBeUndefined();
    expect(latestSameFamily(model("bedrock-mantle", "anthropic.claude-opus-5"), available)).toEqual(available[5]);
    expect(latestSameFamily(model("openai", "gpt-6-sol"), available)).toEqual(available[6]);
    expect(latestSameFamily(model("openai", "gpt-5.5"), available)).toBeUndefined();
  });

  it("migrates equal versions only across the retired provider without downgrading other families", () => {
    const native = model("openai", "gpt-6-luna");
    const older = model("openai", "gpt-5.6-luna");
    expect(latestSameFamily(model("openai-codex", native.id), [older, native])).toEqual(native);
    expect(latestSameFamily(native, [older, native])).toBeUndefined();
    expect(latestSameFamily(model("openai-codex", "gpt-6.1-luna"), [older, native])).toBeUndefined();
    expect(latestSameFamily(model("bedrock-mantle", "openai.gpt-6-luna"), [native])).toBeUndefined();
    expect(latestSameFamily(model("openai", "gpt-6.2-sol"), [model("openai", "gpt-6.1-sol")]))
      .toEqual(model("openai", "gpt-6.1-sol"));
  });

  it.each(["resume", "startup"])("migrates same-id Sol and Luna providers on %s", async (reason) => {
    for (const id of ["gpt-6.1-sol", "gpt-6-luna"]) {
      const saved = model("openai-codex", id);
      const native = model("openai", id);
      const { start, setModel, ctx } = lifecycle(saved, [saved, native]);
      await start({ reason }, ctx);
      expect(setModel).toHaveBeenCalledExactlyOnceWith(native);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining(`openai/${id}`), "info");
    }
  });

  it.each(["resume", "startup"])("skips subagents on %s", async (reason) => {
    vi.stubEnv("PI_SUBAGENT_AUTHORITY", "test-subagent");
    const saved = model("openai-codex", "gpt-6.1-sol");
    const { start, setModel, ctx } = lifecycle(saved, [model("openai", saved.id)]);
    await start({ reason }, ctx);
    expect(setModel).not.toHaveBeenCalled();
    expect(ctx.modelRegistry.getAll).not.toHaveBeenCalled();
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("switches resumed sessions but not new sessions or empty startup sessions", async () => {
    const saved = model("openai-codex", "gpt-6-sol");
    const newer = model("openai", "gpt-6.1-sol");
    const { start, setModel, ctx } = lifecycle(saved, [saved, newer]);
    await start({ reason: "new" }, ctx);
    expect(setModel).not.toHaveBeenCalled();
    await start({ reason: "startup" }, { ...ctx, sessionManager: { getBranch: () => [] } });
    expect(setModel).not.toHaveBeenCalled();
    await start({ reason: "resume" }, ctx);
    expect(setModel).toHaveBeenCalledExactlyOnceWith(newer);
  });
});
