import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { review } from "../../lib/damage-control/judge.ts";
import { Context, DIRECT_INPUT_LIMIT } from "../../lib/damage-control/context.ts";
import type { Evidence, PendingCall, Settings } from "../../lib/damage-control/types.ts";

const settings: Settings = { version: 1, judge: { enabled: true, provider: "openai-codex", model: "gpt-5.6-luna", reasoning: "high", deadlineMs: 50, retries: 0 }, parseBudgetMs: 50 };
const pending: PendingCall = { callId: "call-1", fingerprint: "fp", generation: 3 };
function evidence(applicability: "candidate" | "confirmed" = "candidate"): Evidence {
  return { callId: "call-1", operation: "rm ./scratch", operator: [{ source: "interactive", text: "remove the scratch fixture" }], conversation: [{ role: "user", text: "Remove the scratch fixture." }, { role: "assistant", text: "I will remove only the generated scratch output." }], pendingCall: { tool: "bash", input: { command: "rm ./scratch" }, cwd: "/work" }, untrusted: { effects: [], matches: [{ ruleId: "delete", action: applicability === "confirmed" ? "block" : "review", applicability, reason: "delete match", effects: [] }], uncertainties: ["parser detail must stay local"] }, omissions: [] };
}
function textResponse(value: unknown, stopReason?: "stop" | "error" | "aborted", errorMessage?: string): { content: { type: "text"; text: string }[]; stopReason?: string; errorMessage?: string } {
  return { content: [{ type: "text", text: JSON.stringify(value) }], ...(stopReason === undefined ? {} : { stopReason }), ...(errorMessage === undefined ? {} : { errorMessage }) };
}
function context(complete: ReturnType<typeof vi.fn>, signal?: AbortSignal, authenticated = true): Pick<ExtensionContext, "modelRegistry" | "signal"> {
  const registry = { find: vi.fn(() => ({ provider: "openai-codex", id: "gpt-5.6-luna" })), hasConfiguredAuth: vi.fn(() => authenticated), complete };
  return { modelRegistry: registry as unknown as ExtensionContext["modelRegistry"], signal };
}

const valid = { verdict: "allow", reason: "Known disposable target matches direct intent.", dismissedCandidates: ["delete"] };

describe("Luna review", () => {
  it("uses the maintained prompt, exact Luna model, high reasoning, zero retries, and one completion", async () => {
    const complete = vi.fn().mockResolvedValue(textResponse(valid, "stop"));
    const ctx = context(complete);
    await expect(review(evidence(), ctx, settings, pending, () => 3)).resolves.toMatchObject({ status: "valid", ...valid, diagnostics: { version: 1, callId: "call-1", provider: "openai-codex", model: "gpt-5.6-luna", promptTruncated: false, outputTruncated: false, stopReason: "stop", verdict: "allow" } });
    expect(complete).toHaveBeenCalledTimes(1);
    const [model, request, options] = complete.mock.calls[0] as unknown as [{ provider: string; id: string }, { messages: [{ content: [{ text: string }] }] }, { reasoningEffort: string; maxRetries: number; signal: AbortSignal }];
    const contract = readFileSync(new URL("../../lib/damage-control/judge-prompt.md", import.meta.url), "utf8").trim();
    expect(contract).toContain("used unchanged within that call");
    expect(contract).toContain("confirmed `review` rule");
    expect(contract).toContain("variable is reassigned");
    expect(model).toMatchObject({ provider: "openai-codex", id: "gpt-5.6-luna" });
    expect(options).toMatchObject({ reasoningEffort: "high", maxRetries: 0 });
    expect(request.messages[0].content[0].text.startsWith(`${contract}\n\nEVIDENCE JSON:\n`)).toBe(true);
    const outbound = request.messages[0].content[0].text;
    expect(outbound).toContain("Remove the scratch fixture.");
    expect(outbound).toContain("I will remove only the generated scratch output.");
    expect(outbound).toContain('"tool":"bash"');
    expect(outbound).toContain('"cwd":"/work"');
    expect(outbound).toContain('"command":"rm ./scratch"');
    expect(outbound).toContain('"applicableRules"');
    const judgeJson = outbound.slice(outbound.indexOf("EVIDENCE JSON:") + "EVIDENCE JSON:".length);
    expect(judgeJson).not.toContain("parser detail must stay local");
    expect(judgeJson).not.toContain("toolCall");
    expect(judgeJson).not.toContain("toolResult");
  });

  it("sends all conversation text without the former count or byte caps", async () => {
    const input = evidence();
    input.conversation = Array.from({ length: 40 }, (_, index) => ({ role: "user" as const, text: `message ${index}: ${"visible words ".repeat(200)}` }));
    const complete = vi.fn().mockResolvedValue(textResponse(valid));
    const result = await review(input, context(complete), settings, pending, () => 3);
    expect(result.status).toBe("valid");
    const payload = JSON.parse(complete.mock.calls[0]![1].messages[0].content[0].text.split("EVIDENCE JSON:\n")[1]);
    expect(payload.conversation).toEqual(input.conversation);
    expect(complete).toHaveBeenCalledOnce();
  });

  it("trims only after provider context overflow, discloses it, and preserves the pending call", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(textResponse(null, "error", "Your input exceeds the context window of this model"))
      .mockResolvedValueOnce(textResponse(valid));
    const input = evidence();
    const result = await review(input, context(complete), settings, pending, () => 3);
    expect(result.status).toBe("valid");
    expect(complete).toHaveBeenCalledTimes(2);
    const payloads = complete.mock.calls.map(call => JSON.parse(call[1].messages[0].content[0].text.split("EVIDENCE JSON:\n")[1]));
    expect(payloads[0].conversation).toEqual(input.conversation);
    expect(payloads[1].conversation).toEqual(input.conversation!.slice(1));
    expect(payloads[1].pendingCall).toEqual(payloads[0].pendingCall);
    expect(payloads[1].applicableRules).toEqual(payloads[0].applicableRules);
    expect(payloads[1].omissions).toContainEqual(expect.stringContaining("omitted 1 of 2"));
    expect(result.diagnostics?.prompt).toContain("Context window exceeded:");
    expect(input.conversation).toHaveLength(2);
  });

  it("stops context recovery if the pending call alone still overflows", async () => {
    const complete = vi.fn().mockResolvedValue(textResponse(null, "error", "Your input exceeds the context window of this model"));
    const result = await review(evidence(), context(complete), settings, pending, () => 3);
    expect(result.status).toBe("unavailable");
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed, extra-field, unknown-ID, and confirmed override responses", async () => {
    const cases: Array<[Evidence, unknown]> = [
      [evidence(), { ...valid, extra: true }],
      [evidence(), { ...valid, dismissedCandidates: ["unknown"] }],
      [evidence("confirmed"), { ...valid, dismissedCandidates: ["delete"] }],
    ];
    for (const [input, response] of cases) {
      const complete = vi.fn().mockResolvedValue(textResponse(response));
      await expect(review(input, context(complete), settings, pending, () => 3)).resolves.toMatchObject({ status: "invalid" });
      expect(complete).toHaveBeenCalledTimes(1);
    }
    const complete = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "not json" }] });
    await expect(review(evidence(), context(complete), settings, pending, () => 3)).resolves.toMatchObject({ status: "invalid" });
  });

  it("rejects error and aborted stop reasons even when content contains valid JSON", async () => {
    const errored = vi.fn().mockResolvedValue(textResponse(valid, "error", "synthetic provider error"));
    await expect(review(evidence(), context(errored), settings, pending, () => 3)).resolves.toMatchObject({ status: "unavailable" });
    const aborted = vi.fn().mockResolvedValue(textResponse(valid, "aborted"));
    await expect(review(evidence(), context(aborted), settings, pending, () => 3)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("returns unavailable without fallback when model, auth, or completion throws", async () => {
    const failed = vi.fn().mockRejectedValue(new Error("synthetic provider failure"));
    await expect(review(evidence(), context(failed), settings, pending, () => 3)).resolves.toMatchObject({ status: "unavailable" });
    expect(failed).toHaveBeenCalledTimes(1);

    const syncFailure = vi.fn(() => { throw new Error("synchronous completion failure"); });
    await expect(review(evidence(), context(syncFailure), settings, pending, () => 3)).resolves.toMatchObject({ status: "unavailable" });

    const noAuth = vi.fn();
    await expect(review(evidence(), context(noAuth, undefined, false), settings, pending, () => 3)).resolves.toMatchObject({ status: "unavailable" });
    expect(noAuth).not.toHaveBeenCalled();

    const findFailure = context(vi.fn());
    vi.mocked(findFailure.modelRegistry.find).mockImplementation(() => { throw new Error("registry lookup failure"); });
    await expect(review(evidence(), findFailure, settings, pending, () => 3)).resolves.toMatchObject({ status: "unavailable" });

    const authFailure = context(vi.fn());
    vi.mocked(authFailure.modelRegistry.hasConfiguredAuth).mockImplementation(() => { throw new Error("auth lookup failure"); });
    await expect(review(evidence(), authFailure, settings, pending, () => 3)).resolves.toMatchObject({ status: "unavailable" });
  });

  it("redacts model explanations and provider errors before returning", async () => {
    const secretReason = { ...valid, reason: "token=SYNTHETIC_SENTINEL" };
    const invalidResult = await review(evidence(), context(vi.fn().mockResolvedValue(textResponse(secretReason))), settings, pending, () => 3);
    expect(invalidResult).toMatchObject({ status: "invalid" });
    expect(JSON.stringify(invalidResult)).not.toContain("SYNTHETIC_SENTINEL");

    const errorResult = await review(evidence(), context(vi.fn().mockResolvedValue(textResponse(valid, "error", "token=SYNTHETIC_SENTINEL"))), settings, pending, () => 3);
    expect(errorResult).toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(errorResult)).not.toContain("SYNTHETIC_SENTINEL");

    const thrownResult = await review(evidence(), context(vi.fn().mockRejectedValue(new Error("password=SYNTHETIC_SENTINEL"))), settings, pending, () => 3);
    expect(JSON.stringify(thrownResult)).not.toContain("SYNTHETIC_SENTINEL");
  });

  it("cancels the underlying request on deadline and ignores its late result", async () => {
    let passedSignal: AbortSignal | undefined;
    const complete = vi.fn((_model, _request, options: { signal: AbortSignal }) => {
      passedSignal = options.signal;
      return new Promise((resolve) => setTimeout(() => resolve(textResponse(valid)), 100));
    });
    await expect(review(evidence(), context(complete), { ...settings, judge: { ...settings.judge, deadlineMs: 5 } }, pending, () => 3)).resolves.toMatchObject({ status: "timeout" });
    expect(passedSignal?.aborted).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("honors parent cancellation, including pre-abort and providers that ignore cancellation", async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    const neverCalled = vi.fn();
    const redactedInput = evidence(); redactedInput.operator[0]!.text = "token=SYNTHETIC_SENTINEL";
    await expect(review(redactedInput, context(neverCalled, preAborted.signal), settings, pending, () => 3)).resolves.toMatchObject({ status: "cancelled" });
    expect(neverCalled).not.toHaveBeenCalled();

    const racedAbort = new AbortController();
    const raceCompletion = vi.fn();
    await expect(review(evidence(), context(raceCompletion, racedAbort.signal), settings, pending, () => { racedAbort.abort(); return 3; })).resolves.toMatchObject({ status: "cancelled" });
    expect(raceCompletion).not.toHaveBeenCalled();

    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const ignoresCancellation = vi.fn(() => new Promise(() => undefined));
    const result = review(evidence(), context(ignoresCancellation, controller.signal), settings, pending, () => 3);
    controller.abort();
    await expect(result).resolves.toMatchObject({ status: "cancelled" });
    expect(ignoresCancellation).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));

    const complete = vi.fn().mockResolvedValue(textResponse(valid));
    await expect(review(evidence(), context(complete), settings, pending, () => 4)).resolves.toMatchObject({ status: "cancelled" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("reviews safely redacted native conversation while ignoring old history with one completion", async () => {
    const history = new Context(() => 0);
    for (let i = 0; i <= DIRECT_INPUT_LIMIT; i++) history.recordDirectInput("interactive", "stale direct input token=SYNTHETIC_SENTINEL");
    const input = history.buildEvidence("call-1", "rm ./scratch # token=SYNTHETIC_SENTINEL", [], evidence().untrusted.matches, [], [], undefined, undefined, [{ type: "message", message: { role: "user", content: "Remove the scratch fixture. token=SYNTHETIC_SENTINEL" } }]);
    input.untrusted.priorEffects = [{ callId: "prior-call", timestamp: 0, effect: { id: "effect-1", kind: "filesystem", operation: "read", sources: [], targets: [{ resolution: "static", path: "token=SYNTHETIC_SENTINEL" }], destinations: [], context: { cwd: "/work" }, range: { start: 0, end: 1 }, resolution: "static" } }];
    input.pendingCall = { tool: "bash", input: { command: "rm ./scratch" }, cwd: "/work" };
    const complete = vi.fn().mockResolvedValue(textResponse(valid));
    expect(await review(input, context(complete), settings, pending, () => 3)).toMatchObject({ status: "valid", ...valid, diagnostics: { promptTruncated: false, outputTruncated: false } });
    expect(complete).toHaveBeenCalledOnce();
    const outbound = JSON.stringify(complete.mock.calls[0]);
    expect(outbound).not.toContain("SYNTHETIC_SENTINEL");
    expect(outbound).toContain("[REDACTED]");
    const judgeJson = outbound.slice(outbound.indexOf("EVIDENCE JSON:") + "EVIDENCE JSON:".length);
    expect(judgeJson).not.toContain("prior-call");
    expect(judgeJson).not.toContain("uncertainties");
    expect(judgeJson).not.toContain("sequence");
    expect(judgeJson).not.toContain("variables");
  });

  it("returns a normal needs-input ask without sending evidence when safe projection loses facts", async () => {
    const complete = vi.fn();
    const secret = evidence(); secret.untrusted.matches[0]!.ruleId = "token=SYNTHETIC_SENTINEL";
    await expect(review(secret, context(complete), settings, pending, () => 3)).resolves.toMatchObject({ status: "valid", verdict: "ask", dismissedCandidates: [] });
    expect(complete).not.toHaveBeenCalled();
  });
});
