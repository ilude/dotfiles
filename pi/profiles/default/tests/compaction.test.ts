import { describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream, type AssistantMessage, type Context, type Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { compact, type ExtensionAPI, type ExtensionContext, type SessionBeforeCompactEvent, type CompactionResult } from "@earendil-works/pi-coding-agent";
import { HANDOFF_INSTRUCTIONS, registerCompaction, unifiedPreparation } from "../extensions/compaction.ts";

const model: Model<"openai-completions"> = { id: "fixture", name: "Fixture", provider: "fixture", api: "openai-completions", baseUrl: "https://unused.invalid", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 4096 };
const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function event(history = true): SessionBeforeCompactEvent {
  return {
    type: "session_before_compact", reason: "threshold", willRetry: false,
    signal: new AbortController().signal, customInstructions: "FOCUS_SENTINEL", branchEntries: [],
    preparation: {
      firstKeptEntryId: "retained-entry", tokensBefore: 25000, previousSummary: "PRIOR_SENTINEL: approval pending",
      messagesToSummarize: history ? [{ role: "user", content: "HISTORY_SENTINEL", timestamp: 1 }] : [],
      turnPrefixMessages: [{ role: "user", content: "CORRECTION_SENTINEL: approved, use two thirds", timestamp: 2 }],
      isSplitTurn: true, fileOps: { read: new Set(["read.ts"]), edited: new Set(["changed.ts"]), written: new Set() },
      settings: { enabled: true, reserveTokens: 4096, keepRecentTokens: 2000 },
    },
  };
}
function transport(stopReason: "stop" | "length" = "stop") {
  const requests: Context[] = [];
  const stream: StreamFn = (_model, context) => {
    requests.push(context);
    const result = createAssistantMessageEventStream();
    const message: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "## Goal\nImplement the approved correction." }], api: model.api, provider: model.provider, model: model.id, usage, stopReason, timestamp: 1 };
    result.push({ type: "done", reason: stopReason, message });
    result.end();
    return result;
  };
  return { requests, stream };
}

describe("unified compaction", () => {
  it.each([true, false])("sends prior summary, chronological history/prefix and focus together (history=%s)", async history => {
    const input = event(history);
    const { requests, stream } = transport();
    const result = await compact(unifiedPreparation(input), model, "inert", undefined, `${HANDOFF_INSTRUCTIONS}\n${input.customInstructions}`, input.signal, "off", stream);
    expect(requests).toHaveLength(1);
    const text = JSON.stringify(requests[0]);
    for (const sentinel of ["PRIOR_SENTINEL", "CORRECTION_SENTINEL", "FOCUS_SENTINEL"]) expect(text).toContain(sentinel);
    if (history) expect(text.indexOf("HISTORY_SENTINEL")).toBeLessThan(text.indexOf("CORRECTION_SENTINEL"));
    expect(result).toMatchObject({ firstKeptEntryId: "retained-entry", tokensBefore: 25000, usage, details: { readFiles: ["read.ts"], modifiedFiles: ["changed.ts"] } });
    expect(result.summary).not.toContain("Turn Context (split turn)");
    expect(input.preparation.isSplitTurn).toBe(true);
    expect(input.preparation.turnPrefixMessages).toHaveLength(1);
  });

  it("carries extension checkpoint file metadata through repeated compaction without mutating preparation", async () => {
    const input = event(false);
    input.branchEntries = [{ type: "compaction", id: "prior", parentId: null, timestamp: "2026-09-17T00:00:00Z", summary: "old summary", firstKeptEntryId: "old-kept", tokensBefore: 20000, fromHook: true, details: { readFiles: ["old-read.ts", "changed.ts"], modifiedFiles: ["old-edit.ts"] } }];
    const prepared = unifiedPreparation(input);
    const result = await compact(prepared, model, "inert", undefined, undefined, input.signal, "off", transport().stream);
    expect(result.details).toEqual({ readFiles: ["old-read.ts", "read.ts"], modifiedFiles: ["changed.ts", "old-edit.ts"] });
    expect(input.preparation.fileOps.read).toEqual(new Set(["read.ts"]));
  });

  it("retains native rejection of truncated summaries", async () => {
    await expect(compact(unifiedPreparation(event()), model, "inert", undefined, undefined, undefined, "off", transport("length").stream)).rejects.toThrow("incomplete");
  });

  it.each(["manual", "threshold", "overflow"] as const)("handles %s through one hook and preserves auth/options", async reason => {
    const { requests, stream } = transport();
    const summarize = vi.fn<typeof compact>((...args) => { args[7] = stream; return compact(...args); });
    const { handler, ctx, notify } = fixture(summarize);
    const input = { ...event(), reason };
    const result = await handler(input, ctx);
    expect(result?.compaction?.firstKeptEntryId).toBe(input.preparation.firstKeptEntryId);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize.mock.calls[0][1].baseUrl).toBe("https://auth-route.invalid");
    expect(summarize.mock.calls[0][3]).toEqual({ "x-fixture": "header" });
    expect(summarize.mock.calls[0][5]).toBe(input.signal);
    expect(summarize.mock.calls[0][6]).toBe("low");
    expect(summarize.mock.calls[0][8]).toEqual({ FIXTURE: "value" });
    expect(summarize.mock.calls[0][9]).toBeDefined();
    expect(JSON.stringify(requests[0])).toContain("FOCUS_SENTINEL");
    expect(notify).not.toHaveBeenCalled();
  });

  it("cancels a failed hook instead of falling back to native split generation", async () => {
    const { handler, ctx, notify } = fixture(vi.fn().mockRejectedValue(new Error("provider unavailable")));
    expect(await handler(event(), ctx)).toEqual({ cancel: true });
    expect(notify).toHaveBeenCalledWith("Compaction failed: provider unavailable", "error");
  });

  it("honors cancellation without error notification or continuation", async () => {
    const controller = new AbortController();
    controller.abort();
    const { handler, ctx, notify } = fixture(vi.fn().mockRejectedValue(new Error("aborted")));
    expect(await handler({ ...event(), signal: controller.signal }, ctx)).toEqual({ cancel: true });
    expect(notify).not.toHaveBeenCalled();
  });
});

function fixture(summarize: typeof compact) {
  let handler: ((event: SessionBeforeCompactEvent, ctx: ExtensionContext) => Promise<void | { cancel?: boolean; compaction?: CompactionResult }>) | undefined;
  const pi = { on: (_name: string, callback: typeof handler) => { handler = callback; }, getThinkingLevel: () => "low" } as unknown as ExtensionAPI;
  const notify = vi.fn();
  const ctx = { cwd: process.cwd(), isProjectTrusted: () => false, model, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "inert", headers: { "x-fixture": "header" }, baseUrl: "https://auth-route.invalid", env: { FIXTURE: "value" } }) }, ui: { notify } } as unknown as ExtensionContext;
  registerCompaction(pi, summarize);
  if (!handler) throw new Error("Compaction hook not registered");
  return { handler, ctx, notify };
}
