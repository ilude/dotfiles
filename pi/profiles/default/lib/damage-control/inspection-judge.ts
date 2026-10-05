import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import type { InspectionEvidence, PendingCall, Settings } from "./types.ts";
import { redactOutbound } from "./judge.ts";
import { resolveLatestCodexModelFromRegistry } from "../model-selection.ts";

const MAX_REASON_CHARS = 1_000;
const MAX_RESPONSE_BYTES = 8 * 1024;
const ABORTED = Symbol("inspection-judge-aborted");

type Result =
  | { status: "valid"; verdict: "observation" | "mutation" | "uncertain"; reason: string }
  | { status: "invalid" | "unavailable" | "timeout" | "cancelled"; reason: string };
type Projection = { request: InspectionEvidence["request"]; sources: InspectionEvidence["sources"]; omissions: string[] };

function redactValue(value: unknown, state: { lossy: boolean }): unknown {
  if (typeof value === "string") {
    const result = redactOutbound(value);
    state.lossy ||= result.lossy;
    return result.text;
  }
  if (Array.isArray(value)) return value.map(item => redactValue(item, state));
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, state)]));
  return value;
}

/** Construct the only inspection evidence allowed to leave the process. */
export function projectInspectionEvidence(evidence: InspectionEvidence): Projection {
  const state = { lossy: false };
  const request = redactValue(evidence.request, state) as InspectionEvidence["request"];
  const sources = evidence.sources.map(source => ({
    path: redactOutbound(source.path).text,
    ...(source.source === undefined ? {} : { source: redactValue(source.source, state) as string }),
    ...(source.omission === undefined ? {} : { omission: redactValue(source.omission, state) as string }),
  }));
  const omissions = [
    ...(state.lossy ? ["Sensitive text was redacted from the pending call or source; do not infer the missing content."] : []),
    ...sources.flatMap(source => source.omission ? [`Source unavailable or omitted for ${source.path}: ${source.omission}`] : []),
  ];
  return { request, sources, omissions };
}

function parseResponse(text: string): Result {
  if (!text.trim() || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) return { status: "invalid", reason: "Luna returned an empty or oversized inspection response." };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { status: "invalid", reason: "Luna returned malformed inspection JSON." }; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { status: "invalid", reason: "Luna returned the wrong inspection response shape." };
  const object = value as Record<string, unknown>;
  if (Object.keys(object).sort().join(",") !== "reason,verdict" || !["observation", "mutation", "uncertain"].includes(String(object.verdict)) || typeof object.reason !== "string" || !object.reason.trim() || object.reason.length > MAX_REASON_CHARS) return { status: "invalid", reason: "Luna returned an invalid inspection response schema." };
  const reason = redactOutbound(object.reason);
  if (reason.lossy) return { status: "invalid", reason: "Luna returned sensitive content in its inspection explanation." };
  return { status: "valid", verdict: object.verdict as "observation" | "mutation" | "uncertain", reason: reason.text };
}

function safeError(error: unknown): string {
  try {
    const result = redactOutbound(error instanceof Error ? error.message : String(error));
    return result.lossy || !result.text.trim() ? "Luna inspection review failed without a safe error explanation." : `Luna inspection review failed: ${result.text.slice(0, MAX_REASON_CHARS)}`;
  } catch { return "Luna inspection review failed without a safe error explanation."; }
}

function promptContract(): string {
  const prompt = readFileSync(new URL("./inspection-judge-prompt.md", import.meta.url), "utf8").trim();
  if (!prompt) throw new Error("inspection-judge-prompt.md is empty");
  return prompt;
}

/** Tool-free review. An observation verdict authorizes only the unchanged pending request. */
export async function reviewInspection(
  evidence: InspectionEvidence,
  ctx: Pick<ExtensionContext, "modelRegistry" | "signal">,
  settings: Settings,
  pending: PendingCall,
  currentGeneration: () => number,
): Promise<Result> {
  if (!settings.judge.enabled) return { status: "unavailable", reason: "Luna inspection review is disabled." };
  const parents = [ctx.signal, pending.signal].filter((signal): signal is AbortSignal => signal !== undefined);
  const stale = (): boolean => pending.callId.length === 0 || currentGeneration() !== pending.generation;
  try { if (parents.some(signal => signal.aborted) || stale()) return { status: "cancelled", reason: "Inspection review was cancelled or became stale." }; }
  catch (error) { return { status: "unavailable", reason: safeError(error) }; }

  let model: ReturnType<ExtensionContext["modelRegistry"]["find"]>;
  let contract: string;
  try {
    contract = promptContract();
    model = resolveLatestCodexModelFromRegistry("luna", ctx.modelRegistry);
  } catch (error) { return { status: "unavailable", reason: safeError(error) }; }
  const projection = projectInspectionEvidence(evidence);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortWait: (() => void) | undefined;
  try {
    for (const signal of parents) { signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) controller.abort(); }
    if (controller.signal.aborted || stale()) return { status: "cancelled", reason: "Inspection review was cancelled or became stale." };
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, settings.judge.deadlineMs);
    const aborted = new Promise<typeof ABORTED>(resolve => {
      const onAbort = (): void => resolve(ABORTED);
      removeAbortWait = () => controller.signal.removeEventListener("abort", onAbort);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    while (true) {
      const prompt = `${contract}\n\nINSPECTION EVIDENCE JSON:\n${JSON.stringify({ pendingCall: projection.request, sources: projection.sources, omissions: projection.omissions })}`;
      const completion = ctx.modelRegistry.complete(model, { messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] }, { maxTokens: 500, reasoningEffort: settings.judge.reasoning, cacheRetention: "none", maxRetries: 0, signal: controller.signal });
      const response = await Promise.race([completion, aborted]);
      if (response === ABORTED) return timedOut ? { status: "timeout", reason: `Luna inspection review exceeded its ${settings.judge.deadlineMs}ms deadline.` } : { status: "cancelled", reason: "Luna inspection review was cancelled." };
      if (timedOut) return { status: "timeout", reason: `Luna inspection review exceeded its ${settings.judge.deadlineMs}ms deadline.` };
      if (controller.signal.aborted || parents.some(signal => signal.aborted) || stale()) return { status: "cancelled", reason: "Inspection review was cancelled or became stale." };
      if (response.stopReason === "aborted") return { status: "cancelled", reason: "Luna inspection completion was aborted." };
      if (response.stopReason === "error") return { status: "unavailable", reason: safeError(response.errorMessage ?? "provider returned an error stop reason") };
      const text = response.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map(part => part.text).join("\n");
      return parseResponse(text);
    }
  } catch (error) {
    if (timedOut) return { status: "timeout", reason: `Luna inspection review exceeded its ${settings.judge.deadlineMs}ms deadline.` };
    if (controller.signal.aborted || parents.some(signal => signal.aborted)) return { status: "cancelled", reason: "Inspection review was cancelled." };
    try { if (stale()) return { status: "cancelled", reason: "Inspection review became stale." }; }
    catch (generationError) { return { status: "unavailable", reason: safeError(generationError) }; }
    return { status: "unavailable", reason: safeError(error) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    removeAbortWait?.();
    for (const signal of parents) signal.removeEventListener("abort", abort);
  }
}
