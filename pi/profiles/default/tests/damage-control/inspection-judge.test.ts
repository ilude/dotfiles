import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { projectInspectionEvidence, reviewInspection } from "../../lib/damage-control/inspection-judge.ts";
import { modelFixture, registryFixture } from "../helpers/model-selection.ts";
import type { InspectionEvidence, PendingCall, Settings } from "../../lib/damage-control/types.ts";

const settings: Settings = { version: 1, judge: { enabled: true, provider: "openai-codex", model: "luna", reasoning: "high", deadlineMs: 80, retries: 0 }, parseBudgetMs: 50 };
const pending: PendingCall = { callId: "pending-id", fingerprint: "fp", generation: 4 };
function evidence(): InspectionEvidence {
  return {
    route: "review", reason: "unsupported command", request: { tool: "bash", input: { command: "curl https://example.test" }, cwd: "/work" }, analysis: { effects: [], matches: [], uncertainties: [], health: { status: "ready" } },
    sources: [{ path: "/work/check.sh", source: "curl https://example.test" }],
  };
}
function message(value: unknown, stopReason: "stop" | "error" | "aborted" = "stop"): AssistantMessage {
  return { role: "assistant", api: "openai-codex-responses", provider: "openai-codex", model: "gpt-6-luna", timestamp: 0, content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }], stopReason, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
function context(complete: ReturnType<typeof vi.fn<ExtensionContext["modelRegistry"]["complete"]>>, authenticated = true): Pick<ExtensionContext, "modelRegistry" | "signal"> {
  const registry = registryFixture([modelFixture("openai-codex", "gpt-6-luna")], authenticated ? ["openai-codex"] : []);
  vi.spyOn(registry, "complete").mockImplementation(complete);
  return { modelRegistry: registry, signal: undefined };
}
const observation = { verdict: "observation", reason: "The complete request and source only retrieve response data." };

describe("Explorer inspection judge", () => {
  it("projects only the whole pending call and controlled source, redacting outbound secrets", () => {
    const input = evidence();
    input.request.input = { command: "curl https://host.test?token=SYNTHETIC_SECRET" };
    input.sources[0]!.source = "# api_key=SYNTHETIC_SECRET\ncurl https://host.test";
    const projection = projectInspectionEvidence(input);
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("SYNTHETIC_SECRET");
    expect(serialized).toContain("[REDACTED]");
    expect(projection.request).toEqual({ tool: "bash", input: { command: "curl https://host.test?token=[REDACTED]" }, cwd: "/work" });
    expect(projection.sources[0]?.source).toContain("curl https://host.test");
    expect(projection.omissions.join(" ")).toContain("redacted");
  });

  it.each(["observation", "mutation", "uncertain"] as const)("accepts explicit %s classification only", async verdict => {
    const complete = vi.fn().mockResolvedValue(message({ verdict, reason: "Complete request analyzed." }));
    await expect(reviewInspection(evidence(), context(complete), settings, pending, () => 4)).resolves.toMatchObject({ status: "valid", verdict });
    expect(complete).toHaveBeenCalledOnce();
    const [model, request, options] = complete.mock.calls[0] as unknown as [{ provider: string; id: string }, { messages: [{ content: [{ text: string }] }] }, { maxRetries: number; reasoningEffort: string; signal: AbortSignal }];
    expect(model).toMatchObject({ provider: "openai-codex", id: "gpt-6-luna" });
    expect(options).toMatchObject({ maxRetries: 0, reasoningEffort: "high" });
    expect(request.messages[0].content[0].text).toContain('"pendingCall":{"tool":"bash"');
    expect(request.messages[0].content[0].text).toContain("curl https://example.test");
    expect(request.messages[0].content[0].text).toContain("/work/check.sh");
    expect(request.messages[0].content[0].text).not.toContain('"analysis"');
  });

  it("records omitted source honestly and never treats missing content as safe", async () => {
    const input = evidence();
    input.sources = [{ path: "/work/private.sh", omission: "protected source" }];
    const complete = vi.fn().mockResolvedValue(message({ verdict: "uncertain", reason: "The source is unavailable." }));
    expect(await reviewInspection(input, context(complete), settings, pending, () => 4)).toMatchObject({ status: "valid", verdict: "uncertain" });
    const prompt = complete.mock.calls[0]![1].messages[0].content[0].text;
    expect(prompt).toContain("protected source");
    expect(prompt).toContain("unavailable or omitted");
  });

  it("rejects malformed, extra-field, empty, and secret-bearing responses", async () => {
    for (const response of ["not json", { verdict: "observation", reason: "ok", extra: true }, { verdict: "allow", reason: "ok" }, { verdict: "mutation", reason: "token=SYNTHETIC_SECRET" }]) {
      const complete = vi.fn().mockResolvedValue(message(response));
      const result = await reviewInspection(evidence(), context(complete), settings, pending, () => 4);
      expect(result.status).toBe("invalid");
      expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET");
    }
  });

  it("fails closed when disabled, unauthenticated, or provider errors", async () => {
    const never = vi.fn();
    expect(await reviewInspection(evidence(), context(never), { ...settings, judge: { ...settings.judge, enabled: false } }, pending, () => 4)).toMatchObject({ status: "unavailable" });
    expect(await reviewInspection(evidence(), context(never, false), settings, pending, () => 4)).toMatchObject({ status: "unavailable" });
    const failed = vi.fn().mockResolvedValue(message({ verdict: "observation", reason: "ignored" }, "error"));
    expect(await reviewInspection(evidence(), context(failed), settings, pending, () => 4)).toMatchObject({ status: "unavailable" });
    expect(never).not.toHaveBeenCalled();
  });

  it("honors deadline, cancellation, and stale generation", async () => {
    const timeout = vi.fn<ExtensionContext["modelRegistry"]["complete"]>(() => new Promise<AssistantMessage>(() => undefined));
    expect(await reviewInspection(evidence(), context(timeout), { ...settings, judge: { ...settings.judge, deadlineMs: 5 } }, pending, () => 4)).toMatchObject({ status: "timeout" });
    const aborted = new AbortController(); aborted.abort();
    const unused = vi.fn();
    expect(await reviewInspection(evidence(), { ...context(unused), signal: aborted.signal }, settings, pending, () => 4)).toMatchObject({ status: "cancelled" });
    expect(await reviewInspection(evidence(), context(unused), settings, pending, () => 5)).toMatchObject({ status: "cancelled" });
    expect(unused).not.toHaveBeenCalled();
  });
});
