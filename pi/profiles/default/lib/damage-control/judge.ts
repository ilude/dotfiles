import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { isContextOverflow } from "@earendil-works/pi-ai";
import type { Evidence, JudgeDiagnostic, PendingCall, ReviewResult, Settings } from "./types.ts";

const MAX_REASON_CHARS = 1_000;
const MAX_RESPONSE_BYTES = 8 * 1024;
const MAX_DIAGNOSTIC_TEXT_BYTES = 64 * 1024;
const REDACTED = "[REDACTED]";
const REDACTION_OMISSION_NOTICE = "Sensitive text was redacted from the selected review context; do not infer the missing content.";
const ABORTED = Symbol("judge-aborted");

const secretAssignment = /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi;
const authHeader = /\b(authorization|proxy-authorization|x-api-key|api-key)(\s*:\s*)(?:bearer\s+|basic\s+)?[^\s,;&]+/gi;
const urlCredentials = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;
const sensitiveQuery = /([?&](?:access_token|api_key|apikey|key|token|secret|signature|sig)=)[^&#\s]*/gi;
const jwt = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const privateKey = /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g;
const opaquePayload = /\b[A-Za-z0-9+/=_-]{80,}\b/g;

/** Redacts a single outbound string. The returned flag means decision-relevant data may have been hidden. */
export function redactOutbound(value: string): { text: string; lossy: boolean } {
  let lossy = false;
  const markRedacted = (): string => { lossy = true; return REDACTED; };
  const replaceAfterPrefix = (_match: string, name: string, separator: string): string => { lossy = true; return `${name}${separator}${REDACTED}`; };
  let text = value.replace(privateKey, (_match: string) => markRedacted());
  text = text.replace(secretAssignment, replaceAfterPrefix);
  text = text.replace(authHeader, replaceAfterPrefix);
  text = text.replace(urlCredentials, (_match: string, scheme: string) => { lossy = true; return `${scheme}${REDACTED}@`; });
  text = text.replace(sensitiveQuery, (_match: string, prefix: string) => { lossy = true; return `${prefix}${REDACTED}`; });
  text = text.replace(jwt, (_match: string) => markRedacted());
  text = text.replace(opaquePayload, (_match: string) => markRedacted());
  return { text, lossy };
}

function redactInput(value: unknown): { value: unknown; lossy: boolean } {
  if (typeof value === "string") {
    const result = redactOutbound(value);
    return { value: result.text, lossy: result.lossy };
  }
  if (Array.isArray(value)) {
    let lossy = false;
    const items = value.map(item => { const result = redactInput(item); lossy ||= result.lossy; return result.value; });
    return { value: items, lossy };
  }
  if (typeof value === "object" && value !== null) {
    let lossy = false;
    const object = Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const result = redactInput(item); lossy ||= result.lossy; return [key, result.value];
    }));
    return { value: object, lossy };
  }
  return { value, lossy: false };
}

export type JudgeContext = {
  conversation: { role: "user" | "assistant"; text: string }[];
  pendingCall: { tool: string; input: unknown; cwd: string };
  applicableRules: { ruleId: string; action: string; applicability: string; reason: string }[];
  omissions: string[];
};

/** The one reduced, outbound-only view. Parser effects and all old history stay local. */
export function projectJudgeEvidence(evidence: Evidence): { status: "ready"; context: JudgeContext } | { status: "needs-input"; reason: string } {
  if (evidence.pendingCall === undefined) return { status: "needs-input", reason: "Pending call is unavailable for review." };
  let lossy = false;
  let identityLost = false;
  const text = (value: string): string => { const result = redactOutbound(value); lossy ||= result.lossy; return result.text; };
  const identity = (value: string): string => { const result = redactOutbound(value); lossy ||= result.lossy; identityLost ||= result.lossy; return result.text; };
  const input = redactInput(evidence.pendingCall.input); lossy ||= input.lossy;
  const conversation = (evidence.conversation ?? []).map(item => ({ role: item.role, text: text(item.text) }));
  const pendingCall = { tool: text(evidence.pendingCall.tool), input: input.value, cwd: text(evidence.pendingCall.cwd) };
  const applicableRules = evidence.untrusted.matches.map(match => ({ ruleId: identity(match.ruleId), action: match.action, applicability: match.applicability, reason: text(match.reason) }));
  if (identityLost) return { status: "needs-input", reason: "Sensitive rule identity was redacted; clarify the applicable rule before execution." };
  const omissions: string[] = [];
  if (lossy) omissions.push(REDACTION_OMISSION_NOTICE);
  const context: JudgeContext = { conversation, pendingCall, applicableRules, omissions };
  return { status: "ready", context };
}

function parseResponse(text: string, candidateIds: ReadonlySet<string>, confirmedIds: ReadonlySet<string>): ReviewResult {
  if (!text.trim() || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) return { status: "invalid", reason: "Luna returned an empty or oversized response." };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { status: "invalid", reason: "Luna returned malformed JSON." }; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { status: "invalid", reason: "Luna returned the wrong response shape." };
  const object = value as Record<string, unknown>;
  if (Object.keys(object).sort().join(",") !== "dismissedCandidates,reason,verdict" || (object.verdict !== "allow" && object.verdict !== "ask") || typeof object.reason !== "string" || !object.reason.trim() || object.reason.length > MAX_REASON_CHARS || !Array.isArray(object.dismissedCandidates) || !object.dismissedCandidates.every((id): id is string => typeof id === "string")) return { status: "invalid", reason: "Luna returned an invalid review schema." };
  const dismissed = object.dismissedCandidates;
  if (new Set(dismissed).size !== dismissed.length || dismissed.some((id) => !candidateIds.has(id) || confirmedIds.has(id))) return { status: "invalid", reason: "Luna attempted to dismiss an unknown or confirmed rule." };
  const reason = redactOutbound(object.reason);
  if (reason.lossy) return { status: "invalid", reason: "Luna returned sensitive content in its explanation." };
  return { status: "valid", verdict: object.verdict, reason: reason.text, dismissedCandidates: dismissed };
}

function safeErrorExplanation(error: unknown): string | undefined {
  try {
    const raw = error instanceof Error ? error.message : String(error);
    const redacted = redactOutbound(raw);
    if (redacted.lossy) return undefined;
    const bounded = redacted.text.trim().slice(0, MAX_REASON_CHARS);
    return bounded || undefined;
  } catch {
    return undefined;
  }
}

function boundedDiagnostic(value: string, maxBytes = MAX_DIAGNOSTIC_TEXT_BYTES): { text: string; truncated: boolean; redacted: boolean } {
  const scrubbed = redactOutbound(value);
  const redacted = scrubbed.text;
  if (Buffer.byteLength(redacted, "utf8") <= maxBytes) return { text: redacted, truncated: false, redacted: scrubbed.lossy };
  let text = redacted;
  while (Buffer.byteLength(text, "utf8") > maxBytes - 16) text = text.slice(0, Math.max(0, text.length - 256));
  return { text: `${text}…[TRUNCATED]`, truncated: true, redacted: scrubbed.lossy };
}

function unavailable(error: unknown): ReviewResult {
  const explanation = safeErrorExplanation(error);
  return { status: "unavailable", reason: explanation === undefined ? "Luna review failed without a safe error explanation." : `Luna review failed: ${explanation}` };
}

function readReviewContract(): string {
  const contract = readFileSync(new URL("./judge-prompt.md", import.meta.url), "utf8").trim();
  if (!contract) throw new Error("judge-prompt.md is empty");
  return contract;
}

export async function review(
  evidence: Evidence,
  ctx: Pick<ExtensionContext, "modelRegistry" | "signal">,
  settings: Settings,
  pending: PendingCall,
  currentGeneration: () => number,
): Promise<ReviewResult> {
  if (!settings.judge.enabled) return { status: "unavailable", reason: "Luna review is disabled." };
  if (evidence.callId !== pending.callId) return { status: "cancelled", reason: "Review no longer matches the pending call." };
  const parentSignals = [ctx.signal, pending.signal].filter((signal): signal is AbortSignal => signal !== undefined);
  if (parentSignals.some((signal) => signal.aborted)) return { status: "cancelled", reason: "Review was cancelled or became stale." };
  try {
    if (currentGeneration() !== pending.generation || parentSignals.some((signal) => signal.aborted)) return { status: "cancelled", reason: "Review was cancelled or became stale." };
  } catch (error) {
    return unavailable(error);
  }

  const projection = projectJudgeEvidence(evidence);
  if (projection.status === "needs-input") return { status: "valid", verdict: "ask", reason: projection.reason, dismissedCandidates: [] };

  let model: ReturnType<ExtensionContext["modelRegistry"]["find"]>;
  let contract: string;
  try {
    contract = readReviewContract();
    model = ctx.modelRegistry.find(settings.judge.provider, settings.judge.model);
    if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) return { status: "unavailable", reason: "Configured Luna model or authentication is unavailable." };
  } catch (error) {
    return unavailable(error);
  }

  const controller = new AbortController();
  const abortFromParent = (): void => controller.abort();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prompt = "";
  let startedAt = 0;
  const finish = (result: ReviewResult, response?: { content?: unknown[]; stopReason?: string; errorMessage?: string; usage?: unknown }): ReviewResult => {
    const endedAt = Date.now();
    const promptValue = boundedDiagnostic(prompt);
    const diagnostic: JudgeDiagnostic = {
      version: 1, callId: pending.callId, startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(),
      elapsedMs: Math.max(0, endedAt - startedAt), deadlineMs: settings.judge.deadlineMs, provider: settings.judge.provider,
      model: settings.judge.model, effort: settings.judge.reasoning, maxTokens: 800, retries: settings.judge.retries,
      prompt: promptValue.text, promptTruncated: promptValue.truncated, promptRedacted: promptValue.redacted, status: result.status,
      ...(result.status === "valid" ? { verdict: result.verdict } : {}),
      ...(response?.stopReason === undefined ? {} : { stopReason: response.stopReason }),
      ...(response?.usage && typeof response.usage === "object" ? { usage: Object.fromEntries(["input", "output", "totalTokens", "cacheRead", "cacheWrite"].filter(key => typeof (response.usage as Record<string, unknown>)[key] === "number").map(key => [key, (response.usage as Record<string, unknown>)[key]])) } : {}),
    };
    if (response?.content) {
      const raw = response.content.filter((part): part is { type: "text"; text: string } => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string").map(part => part.text).join("\\n");
      const output = boundedDiagnostic(raw);
      diagnostic.output = output.text; diagnostic.outputTruncated = output.truncated; diagnostic.outputRedacted = output.redacted;
    }
    if (response?.errorMessage !== undefined) {
      const error = boundedDiagnostic(response.errorMessage, 4 * 1024);
      diagnostic.error = error.text; diagnostic.errorTruncated = error.truncated; diagnostic.errorRedacted = error.redacted;
    }
    return { ...result, diagnostics: diagnostic };
  };
  let removeAbortWait: (() => void) | undefined;

  try {
    for (const signal of parentSignals) {
      signal.addEventListener("abort", abortFromParent, { once: true });
      if (signal.aborted) controller.abort();
    }
    if (controller.signal.aborted) return { status: "cancelled", reason: "Review was cancelled or became stale." };
    if (currentGeneration() !== pending.generation) return { status: "cancelled", reason: "Review was cancelled or became stale." };
    if (controller.signal.aborted || parentSignals.some((signal) => signal.aborted)) return { status: "cancelled", reason: "Review was cancelled or became stale." };

    timer = setTimeout(() => { timedOut = true; controller.abort(); }, settings.judge.deadlineMs);
    const aborted = new Promise<typeof ABORTED>((resolve) => {
      const onAbort = (): void => resolve(ABORTED);
      removeAbortWait = () => controller.signal.removeEventListener("abort", onAbort);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    startedAt = Date.now();
    const originalMessages = projection.context.conversation.length;
    while (true) {
      prompt = `${contract}\n\nEVIDENCE JSON:\n${JSON.stringify(projection.context)}`;
      const completion = ctx.modelRegistry.complete(
        model,
        { messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] },
        { maxTokens: 800, reasoningEffort: settings.judge.reasoning, cacheRetention: "none", maxRetries: 0, signal: controller.signal },
      );
      const response = await Promise.race([completion, aborted]);
      if (response === ABORTED) {
        return timedOut
          ? finish({ status: "timeout", reason: `Luna review exceeded its ${settings.judge.deadlineMs}ms deadline.` })
          : finish({ status: "cancelled", reason: "Luna review was cancelled." });
      }
      if (timedOut) return finish({ status: "timeout", reason: `Luna review exceeded its ${settings.judge.deadlineMs}ms deadline.` }, response);
      if (controller.signal.aborted || parentSignals.some((signal) => signal.aborted) || currentGeneration() !== pending.generation) return finish({ status: "cancelled", reason: "Review was cancelled or became stale." }, response);
      if (response.stopReason === "aborted") return finish({ status: "cancelled", reason: "Luna completion was aborted." }, response);
      // Send the full conversation first. Only an actual provider context overflow
      // permits dropping older conversation text; never shorten the pending call.
      if (isContextOverflow(response, model.contextWindow) && projection.context.conversation.length) {
        projection.context.conversation.splice(0, Math.ceil(projection.context.conversation.length / 2));
        projection.context.omissions = [
          ...projection.context.omissions.filter(item => !item.startsWith("Context window exceeded:")),
          `Context window exceeded: omitted ${originalMessages - projection.context.conversation.length} of ${originalMessages} oldest user/assistant messages after the provider reported overflow. Pending call and applicable rules are unchanged.`,
        ];
        continue;
      }
      if (response.stopReason === "error") return finish(unavailable(response.errorMessage ?? "provider returned an error stop reason"), response);
      const text = response.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n");
      const candidates = new Set(evidence.untrusted.matches.filter((match) => match.applicability === "candidate").map((match) => match.ruleId));
      const confirmed = new Set(evidence.untrusted.matches.filter((match) => match.applicability === "confirmed").map((match) => match.ruleId));
      return finish(parseResponse(text, candidates, confirmed), response);
    }
  } catch (error) {
    if (timedOut) return finish({ status: "timeout", reason: `Luna review exceeded its ${settings.judge.deadlineMs}ms deadline.` });
    if (controller.signal.aborted || parentSignals.some((signal) => signal.aborted)) return finish({ status: "cancelled", reason: "Luna review was cancelled." });
    try {
      if (currentGeneration() !== pending.generation) return { status: "cancelled", reason: "Review was cancelled or became stale." };
    } catch (generationError) {
      return unavailable(generationError);
    }
    const safeError = safeErrorExplanation(error);
    return finish(unavailable(error), { errorMessage: safeError ?? "provider failure without a safe explanation" });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    removeAbortWait?.();
    for (const signal of parentSignals) signal.removeEventListener("abort", abortFromParent);
  }
}
