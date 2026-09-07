import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import type { Effect, Evidence, PendingCall, ReviewResult, Settings, Target } from "./types.ts";

const MAX_OPERATION_BYTES = 16 * 1024;
const MAX_OPERATOR_ENTRIES = 16;
const MAX_OPERATOR_BYTES = 16 * 1024;
const MAX_EVIDENCE_ITEMS = 256;
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_REASON_CHARS = 1_000;
const MAX_RESPONSE_BYTES = 8 * 1024;
const REDACTED = "[REDACTED]";
const ABORTED = Symbol("judge-aborted");

export type EvidenceProjection =
  | { status: "ready"; evidence: Evidence }
  | { status: "needs-input"; reason: string };

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

function redactTarget(target: Target): { target: Target; lossy: boolean } {
  if (target.resolution === "static") {
    const path = redactOutbound(target.path);
    return { target: { resolution: "static", path: path.text }, lossy: path.lossy };
  }
  const expression = redactOutbound(target.expression);
  const reason = redactOutbound(target.reason);
  return { target: { resolution: "unknown", expression: expression.text, reason: reason.text }, lossy: expression.lossy || reason.lossy };
}

function redactEffect(effect: Effect): { effect: Effect; lossy: boolean; identityLost: boolean } {
  let lossy = false;
  const targets = (values: Target[]): Target[] => values.map((value) => { const projected = redactTarget(value); lossy ||= projected.lossy; return projected.target; });
  const cwd = redactOutbound(effect.context.cwd);
  const executable = effect.context.executable === undefined ? undefined : redactOutbound(effect.context.executable);
  const daemon = effect.context.daemon === undefined ? undefined : redactOutbound(effect.context.daemon);
  const resourceId = effect.context.resourceId === undefined ? undefined : redactOutbound(effect.context.resourceId);
  lossy ||= cwd.lossy || executable?.lossy === true || daemon?.lossy === true || resourceId?.lossy === true;
  const id = redactOutbound(effect.id); lossy ||= id.lossy;
  const base = {
    ...effect, id: id.text,
    sources: targets(effect.sources), targets: targets(effect.targets), destinations: targets(effect.destinations),
    context: { ...effect.context, cwd: cwd.text, executable: executable?.text, daemon: daemon?.text, resourceId: resourceId?.text },
  };
  const identityLost = lossy;
  if (effect.resolution === "unknown") {
    const reason = redactOutbound(effect.reason); lossy ||= reason.lossy;
    return { effect: { ...base, resolution: "unknown", reason: reason.text }, lossy, identityLost };
  }
  return { effect: { ...base, resolution: "static" }, lossy, identityLost };
}

function evidenceItemCount(evidence: Evidence): number {
  const effects = [...evidence.untrusted.effects, ...(evidence.untrusted.priorEffects ?? []).map(item => item.effect)];
  return evidence.operator.length + effects.length + evidence.untrusted.matches.length
    + evidence.untrusted.uncertainties.length + evidence.omissions.length
    + effects.reduce((count, effect) => count + effect.sources.length + effect.targets.length + effect.destinations.length, 0)
    + evidence.untrusted.matches.reduce((count, match) => count + match.effects.length, 0);
}

/** Produces the only representation that may be serialized for Luna. */
export function projectEvidence(evidence: Evidence): EvidenceProjection {
  const currentOnly = { ...evidence, untrusted: { ...evidence.untrusted, priorEffects: [] } };
  if (evidence.operator.length > MAX_OPERATOR_ENTRIES || evidenceItemCount(currentOnly) > MAX_EVIDENCE_ITEMS) {
    return { status: "needs-input", reason: "Review evidence exceeds the safe item-count limit." };
  }
  if (Buffer.byteLength(evidence.operation, "utf8") > MAX_OPERATION_BYTES) return { status: "needs-input", reason: "Operation evidence exceeds the safe review limit." };
  if (evidence.operator.reduce((bytes, entry) => bytes + Buffer.byteLength(entry.text, "utf8"), 0) > MAX_OPERATOR_BYTES) {
    return { status: "needs-input", reason: "Operator evidence exceeds the safe review limit." };
  }
  let lossy = false;
  let identityLost = false;
  const text = (value: string): string => { const result = redactOutbound(value); lossy ||= result.lossy; return result.text; };
  const identity = (value: string): string => { const result = redactOutbound(value); lossy ||= result.lossy; identityLost ||= result.lossy; return result.text; };
  const operation = text(evidence.operation);
  const operator = evidence.operator.map(entry => ({ source: entry.source, text: text(entry.text) }));
  const effects = evidence.untrusted.effects.map(effect => {
    const result = redactEffect(effect); lossy ||= result.lossy; identityLost ||= result.identityLost; return result.effect;
  });
  const matches = evidence.untrusted.matches.map(match => ({ ...match, ruleId: identity(match.ruleId), reason: text(match.reason), effects: match.effects.map(identity) }));
  const uncertainties = evidence.untrusted.uncertainties.map(text);
  const omissions = evidence.omissions.map(text);
  const callId = identity(evidence.callId);
  if (identityLost) return { status: "needs-input", reason: "Sensitive evidence was redacted from a current target or rule identity; clarify target and scope before execution." };
  const priorEffects = (evidence.untrusted.priorEffects ?? []).map(item => {
    const result = redactEffect(item.effect); lossy ||= result.lossy;
    return { callId: item.callId === undefined ? undefined : text(item.callId), timestamp: item.timestamp, effect: result.effect };
  });
  if (lossy) omissions.push("Sensitive text was redacted. Ask if the missing values are necessary to assess this call; never infer them.");
  const projected: Evidence = { callId, operation, operator, untrusted: { effects, priorEffects, matches, uncertainties }, omissions };
  const oversized = () => evidenceItemCount(projected) > MAX_EVIDENCE_ITEMS || Buffer.byteLength(JSON.stringify(projected), "utf8") > MAX_EVIDENCE_BYTES;
  if (priorEffects.length && oversized()) {
    omissions.push("Older historical effects omitted to fit the review budget; current effects are complete.");
    while (priorEffects.length && oversized()) priorEffects.shift();
  }
  if (evidenceItemCount(projected) > MAX_EVIDENCE_ITEMS) return { status: "needs-input", reason: "Review evidence exceeds the safe item-count limit." };
  if (Buffer.byteLength(JSON.stringify(projected), "utf8") > MAX_EVIDENCE_BYTES) return { status: "needs-input", reason: "Review evidence exceeds the safe total-size limit." };
  return { status: "ready", evidence: projected };
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

  const projection = projectEvidence(evidence);
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
    const prompt = `${contract}\n\nEVIDENCE JSON:\n${JSON.stringify(projection.evidence)}`;
    const completion = ctx.modelRegistry.complete(
      model,
      { messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] },
      { maxTokens: 800, reasoningEffort: settings.judge.reasoning, cacheRetention: "none", maxRetries: 0, signal: controller.signal },
    );
    const response = await Promise.race([completion, aborted]);
    if (response === ABORTED) {
      return timedOut
        ? { status: "timeout", reason: "Luna review exceeded its deadline." }
        : { status: "cancelled", reason: "Luna review was cancelled." };
    }
    if (timedOut) return { status: "timeout", reason: "Luna review exceeded its deadline." };
    if (controller.signal.aborted || parentSignals.some((signal) => signal.aborted) || currentGeneration() !== pending.generation) return { status: "cancelled", reason: "Review was cancelled or became stale." };
    if (response.stopReason === "aborted") return { status: "cancelled", reason: "Luna completion was aborted." };
    if (response.stopReason === "error") return unavailable(response.errorMessage ?? "provider returned an error stop reason");
    const text = response.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n");
    const candidates = new Set(projection.evidence.untrusted.matches.filter((match) => match.applicability === "candidate").map((match) => match.ruleId));
    const confirmed = new Set(projection.evidence.untrusted.matches.filter((match) => match.applicability === "confirmed").map((match) => match.ruleId));
    return parseResponse(text, candidates, confirmed);
  } catch (error) {
    if (timedOut) return { status: "timeout", reason: "Luna review exceeded its deadline." };
    if (controller.signal.aborted || parentSignals.some((signal) => signal.aborted)) return { status: "cancelled", reason: "Luna review was cancelled." };
    try {
      if (currentGeneration() !== pending.generation) return { status: "cancelled", reason: "Review was cancelled or became stale." };
    } catch (generationError) {
      return unavailable(generationError);
    }
    return unavailable(error);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    removeAbortWait?.();
    for (const signal of parentSignals) signal.removeEventListener("abort", abortFromParent);
  }
}
