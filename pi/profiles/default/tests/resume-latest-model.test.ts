import { describe, expect, it, vi } from "vitest";
import resumeLatestModel, { latestSameFamily } from "../extensions/resume-latest-model.ts";

type Candidate = { provider: string; id: string };
const model = (provider: string, id: string): Candidate => ({ provider, id });

describe("resumed model upgrades", () => {
  it("keeps provider and tier, choosing only newer versions", () => {
    const available = [
      model("openai-codex", "gpt-5.6-sol"), model("openai-codex", "gpt-6-sol"),
      model("openai-codex", "gpt-6-luna"), model("bedrock-mantle", "openai.gpt-6-sol"),
      model("bedrock-mantle", "anthropic.claude-opus-5"), model("bedrock-mantle", "anthropic.claude-opus-5-5"),
    ];
    expect(latestSameFamily(model("openai-codex", "gpt-5.6-sol"), available)).toEqual(available[1]);
    expect(latestSameFamily(model("bedrock-mantle", "anthropic.claude-opus-5"), available)).toEqual(available[5]);
    expect(latestSameFamily(model("openai-codex", "gpt-6-sol"), available)).toBeUndefined();
    expect(latestSameFamily(model("openai-codex", "gpt-5.5"), available)).toBeUndefined();
  });

  it("switches resumed sessions but not new sessions or subagents", async () => {
    const handlers = new Map<string, (event: { reason: string }, ctx: any) => Promise<void>>();
    const setModel = vi.fn(async () => true);
    resumeLatestModel({ on: (name: string, handler: any) => handlers.set(name, handler), setModel } as never);
    const saved = model("openai-codex", "gpt-5.6-sol");
    const newer = model("openai-codex", "gpt-6-sol");
    const ctx = {
      model: saved,
      sessionManager: { getBranch: () => [{ type: "message" }] },
      modelRegistry: { getAll: () => [saved, newer] },
      ui: { notify: vi.fn() },
    };
    const start = handlers.get("session_start")!;
    await start({ reason: "new" }, ctx);
    expect(setModel).not.toHaveBeenCalled();
    await start({ reason: "startup" }, { ...ctx, sessionManager: { getBranch: () => [] } });
    expect(setModel).not.toHaveBeenCalled();
    await start({ reason: "resume" }, ctx);
    expect(setModel).toHaveBeenCalledExactlyOnceWith(newer);
  });
});
