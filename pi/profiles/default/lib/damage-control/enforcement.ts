import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { adapt } from "./adapters.ts";
import { analyzeRequest, type AnalysisDependencies } from "./analysis.ts";
import { Breaker, fingerprint, type BreakerSnapshot } from "./breaker.ts";
import { bypassEligibility } from "./bypass.ts";
import { authorizedPlanIntegration } from "./plan-integration-authority.ts";
import { Context, BROWSER_INTENT_ENTRY, DIRECT_INPUT_LIMIT, processVariableEvidence } from "./context.ts";
import { decide, applyContextualEffect, contextualEffect } from "./engine.ts";
import { randomUUID } from "node:crypto";
import { bindBrowserPolicy, samePolicyIdentity, type BrowserEffect, type IntentScope, type TrustedRequest } from "../browser-effect-contract.ts";
import { interpretBrowserRequest } from "./judge.ts";
import { loadPolicy } from "./policy.ts";
import type { PathFacts } from "./paths.ts";
import { promptDecision } from "./prompt.ts";
import { analyzeShell, requireGrammars } from "./shell.ts";
import { DamageControlSessionState } from "./sequence.ts";
import type { ScriptReviewRequest } from "./script-review.ts";
import type { Effect, PendingCall, ReviewResult, Settings, ToolRequest } from "./types.ts";

export type Gate = { handle: (event: ToolCallEvent, ctx: ExtensionContext) => Promise<{ block: true; reason: string; terminate?: true } | undefined>; setBypass: (value: boolean) => void; setMode: (value: "default" | "noshell") => void; scan: (ctx: ExtensionContext) => Promise<unknown> };
export type GateDependencies = AnalysisDependencies & {
  review: (evidence: ReturnType<Context["buildEvidence"]>, ctx: ExtensionContext, settings: Settings, pending: PendingCall, generation: () => number) => Promise<ReviewResult>;
  scriptReview?: (request: ScriptReviewRequest) => Promise<unknown>;
  scriptScan?: (cwd: string, origin: string, notify: (message: string, level?: "info" | "warning") => void, signal?: AbortSignal) => Promise<unknown>;
  cancelScriptReviews?: () => void;
  interpretIntent?: (request: TrustedRequest, ctx: ExtensionContext, settings: Settings, signal: AbortSignal) => Promise<IntentScope[]>;
};
const WATCHDOG_STATE = "damage-control-watchdog";
const JUDGE_REVIEW_LOG = "damage-control-judge-review-v1";
const blocked = (reason: string, terminate = false) => ({ block: true as const, reason: reason.slice(0, 4000), ...(terminate ? { terminate: true as const } : {}) });

export async function initialize(pi: ExtensionAPI, profile: string, repo: string): Promise<Gate> {
  const loaded = await loadPolicy(profile);
  const { review } = await import("./judge.ts");
  const { ScriptReviewCoordinator } = await import("./script-review.ts");
  const coordinator = new ScriptReviewCoordinator({ profile });
  // Grammar health is required even before the first model action, including
  // grammars used only by nested interpreter invocations.
  await requireGrammars();
  const probe = adapt("bash", "readiness", { command: "echo readiness" }, repo);
  if (probe.status !== "adapted") throw new Error("Native adapter unavailable");
  const ready = await analyzeShell(probe.request, { rules: loaded.policy.commands, parseBudgetMs: loaded.settings.parseBudgetMs });
  if (ready.health.status === "failed") throw new Error(ready.health.reason);
  return registerGate(pi, profile, repo, {
    ...loaded,
    review,
    scriptReview: request => coordinator.review(request),
    scriptScan: (cwd, origin, notify, signal) => coordinator.scan(cwd, origin, notify, signal),
    cancelScriptReviews: () => coordinator.cancel(),
  });
}

export function registerGate(pi: ExtensionAPI, profile: string, repo: string, dependencies: GateDependencies): Gate {
  const context = new Context();
  const sequence = new DamageControlSessionState();
  const breaker = new Breaker();
  const completed = new Map<string, { request: ToolRequest; effects: Effect[]; created: string[]; generation: number }>();
  const watchdogCalls = new Map<string, { tool: string; input: unknown; cwd: string }>();
  const pending = new Map<string, AbortController>();
  const abortListeners = new Map<AbortSignal, () => void>();
  const clearAbortListeners = () => { for (const [signal, handler] of abortListeners) signal.removeEventListener("abort", handler); abortListeners.clear(); };
  let mode: "default" | "noshell" = "default";
  let bypassed = false;
  let deferred: { source: "interactive" | "rpc"; text: string }[] = [];
  let activeCtx: ExtensionContext | undefined;
  let unbindBrowser: (() => void) | undefined;
  let intentReady: Promise<void> = Promise.resolve();
  const persistIntent = () => { for (const record of context.browserIntentRecords()) pi.appendEntry(BROWSER_INTENT_ENTRY, record); };
  const captureIntent = (source: "interactive" | "rpc", text: string, ctx: ExtensionContext) => {
    activeCtx = ctx;
    const request = context.recordBrowserRequest(randomUUID(), source, text);
    if (!request) return;
    persistIntent();
    const signal = context.policySignal;
    intentReady = (dependencies.interpretIntent ?? interpretBrowserRequest)(request, ctx, dependencies.settings, signal).then(scopes => {
      if (signal.aborted || !samePolicyIdentity(request.identity, context.identity)) return;
      for (const scope of scopes) context.bindBrowserIntent(request.id, request.directText, scope, "independent-interpretation");
      persistIntent();
    }).catch(() => {});
  };
  const reviewBrowser = async (effect: BrowserEffect, signal: AbortSignal) => {
    await intentReady;
    const ctx = activeCtx;
    if (!ctx || signal.aborted) return { outcome: "deny" as const, reason: "Action context expired; inspect it again." };
    const analysis = { health: { status: "ready" as const }, effects: [], matches: [], uncertainties: [] };
    const evidence = context.buildEvidence(effect.id, effect.expectedEffect, [], [], [], [], undefined, { tool: "browser_page", input: { action: effect.action }, cwd: ctx.cwd });
    evidence.browser = context.browserEvidence(effect);
    applyContextualEffect(analysis, evidence);
    const request: ToolRequest = { tool: "browser_page", callId: effect.id, cwd: ctx.cwd, input: { action: effect.action, destination: effect.destination }, text: effect.expectedEffect };
    const call: PendingCall = { callId: effect.id, fingerprint: fingerprint(effect), generation: context.generation, signal };
    let decision = decide(analysis, evidence);
    if (decision.outcome === "review") {
      let result: ReviewResult;
      try { result = await dependencies.review(evidence, { ...ctx, signal }, dependencies.settings, call, () => context.generation); }
      catch { result = { status: "unavailable", reason: "Contextual review unavailable for this action." }; }
      if (signal.aborted || context.generation !== call.generation) return { outcome: "deny" as const, reason: "Review stale or canceled; action not executed." };
      decision = decide(analysis, evidence, result);
    }
    if (decision.outcome === "block") return { outcome: "deny" as const, reason: decision.reason };
    if (decision.outcome === "user") {
      const answer = await promptDecision(decision, request, analysis, { ...ctx, signal });
      if (answer.status !== "approved" || signal.aborted || context.generation !== call.generation) return { outcome: "deny" as const, reason: "Action not approved or context expired." };
      if (context.bindBrowserDecision(effect)) persistIntent();
    }
    return { outcome: "allow" as const, reason: "Scoped action authorized." };
  };
  const restoreBrowser = (ctx: ExtensionContext) => {
    activeCtx = ctx;
    unbindBrowser?.();
    const branch = ctx.sessionManager.getBranch();
    context.restoreBrowserIntent({ sessionId: ctx.sessionManager.getSessionId(), branchId: ctx.sessionManager.getLeafId?.() ?? "root" }, branch.filter(e => e.type === "custom" && e.customType === BROWSER_INTENT_ENTRY).map(e => e.type === "custom" ? e.data : undefined));
    intentReady = Promise.resolve();
    unbindBrowser = bindBrowserPolicy(pi.events, reviewBrowser, { identity: () => context.identity, signal: () => context.policySignal, observe: o => context.recordBrowserObservation(o), localFile: async (request, signal) => {
      if (!isAbsolute(request.nativePath) || request.nativePath.includes("\0")) return { outcome: "deny", reason: "An absolute native file path is required." };
      const result = await gate.handle({ type: "tool_call", toolName: "read", toolCallId: randomUUID(), input: { path: request.nativePath } } as ToolCallEvent, { ...ctx, signal }, true);
      return result ? { outcome: "deny", reason: result.reason } : { outcome: "allow", reason: "Existing filesystem read policy authorized this path." };
    } });
  };
  const invalidate = () => { clearAbortListeners(); for (const controller of pending.values()) controller.abort(); pending.clear(); completed.clear(); watchdogCalls.clear(); deferred = []; dependencies.cancelScriptReviews?.(); context.invalidate(); sequence.reset(); };
  const saveBreaker = () => pi.appendEntry(WATCHDOG_STATE, breaker.snapshot());
  const restoreBreaker = (ctx: ExtensionContext) => {
    breaker.reset();
    const entry = [...ctx.sessionManager.getBranch()].reverse().find(item => item.type === "custom" && item.customType === WATCHDOG_STATE);
    if (entry?.type === "custom") breaker.restore(entry.data as BreakerSnapshot);
  };
  pi.on("session_start", (_event, ctx) => { bypassed = false; invalidate(); restoreBreaker(ctx); restoreBrowser(ctx); });
  pi.on("session_tree", (_event, ctx) => { invalidate(); restoreBreaker(ctx); restoreBrowser(ctx); });
  pi.on("session_shutdown", () => { invalidate(); unbindBrowser?.(); unbindBrowser = undefined; activeCtx = undefined; });
  pi.on("input", (event, ctx) => {
    if (event.source !== "interactive" && event.source !== "rpc") return;
    if (!event.streamingBehavior) { breaker.reset(); saveBreaker(); }
    if (event.streamingBehavior) {
      deferred.push({ source: event.source, text: event.text });
      while (deferred.length > DIRECT_INPUT_LIMIT || deferred.reduce((n, item) => n + Buffer.byteLength(item.text, "utf8"), 0) > 16 * 1024) {
        deferred.shift(); context.noteOmission();
      }
    } else { context.recordDirectInput(event.source, event.text); captureIntent(event.source, event.text, ctx); }
  });
  pi.on("message_start", (event, ctx) => {
    // Queued steering/follow-ups are evidence only after actual delivery, not at enqueue time.
    if (event.message.role !== "user") return;
    const content = event.message.content;
    const text = typeof content === "string" ? content : content.filter(part => part.type === "text").map(part => part.text).join("\n");
    const index = deferred.findIndex(input => input.text === text);
    if (index >= 0) {
      const [input] = deferred.splice(index, 1);
      context.recordDirectInput(input.source, input.text);
      captureIntent(input.source, input.text, ctx);
    }
  });
  pi.on("agent_settled", () => { clearAbortListeners(); });
  pi.on("tool_result", async event => {
    const watchdogCall = watchdogCalls.get(event.toolCallId);
    watchdogCalls.delete(event.toolCallId);
    if (watchdogCall) { breaker.result(watchdogCall, event.isError); saveBreaker(); }
    const record = completed.get(event.toolCallId);
    completed.delete(event.toolCallId);
    if (!record || record.generation !== context.generation) return;
    if (event.isError) return;
    context.recordSuccess(event.toolCallId, record.effects, Date.now(), record.created);
  });
  const gate = {
    setBypass: value => { bypassed = value; },
    setMode: value => { mode = value; },
    // Executor authorization reuses the native read analysis/decision/prompt path,
    // but creates no tool-result, watchdog, bypass or successful-read evidence.
    async handle(event: ToolCallEvent, ctx: ExtensionContext, policyOnly = false) {
      const watchdogCall = { tool: event.toolName, input: event.input, cwd: ctx.cwd };
      const stop = policyOnly ? undefined : breaker.before(watchdogCall);
      if (stop) {
        saveBreaker();
        pi.sendMessage({ customType: "damage-control-loop", content: stop, display: false }, { deliverAs: "nextTurn" });
        ctx.abort();
        return blocked(stop, true);
      }
      if (!policyOnly) watchdogCalls.set(event.toolCallId, watchdogCall);
      while (watchdogCalls.size > 50) watchdogCalls.delete(watchdogCalls.keys().next().value!);
      const normalized = adapt(event.toolName, event.toolCallId, event.input, ctx.cwd);
      if (normalized.status === "uncovered") return;
      if (normalized.status === "unsupported") return blocked(normalized.reason);
      const request = normalized.request;
      if (mode === "noshell" && (request.tool === "bash" || request.tool === "powershell")) return blocked("Shell tools are disabled by damage-control noshell mode");
      if (ctx.signal?.aborted) return blocked("Pending call cancelled; action not executed");
      if (!policyOnly && ctx.signal && !abortListeners.has(ctx.signal)) {
        abortListeners.set(ctx.signal, invalidate);
        ctx.signal.addEventListener("abort", invalidate, { once: true });
      }
      // Tool-result events also account for denied calls; failed calls never
      // become creation evidence. No approval state is retained here.
      if (!policyOnly) completed.set(event.toolCallId, { request, effects: [], created: [], generation: context.generation });
      while (completed.size > 50) completed.delete(completed.keys().next().value!);
      const controller = new AbortController();
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, controller.signal]) : controller.signal;
      pending.set(event.toolCallId, controller);
      const call: PendingCall = { callId: event.toolCallId, fingerprint: fingerprint(event.input), generation: context.generation, signal };
      const fresh = () => !signal.aborted && context.generation === call.generation && fingerprint(event.input) === call.fingerprint;
      const facts: PathFacts = { platform: process.platform === "win32" ? "win32" : "posix", home: homedir(), cwd: ctx.cwd, profile, repo, realpath };
      try {
        const { analysis, createdPaths: created } = await analyzeRequest(request, facts, {
          wasCreated: target => context.wasCreated(target),
          wasDockerCreated: (daemonId, containerId) => context.wasDockerCreated(daemonId, containerId),
        }, dependencies);
        if (!fresh()) return blocked("Pending call cancelled or changed; action not executed");
        const sequenceDecision = sequence.check(request.tool, request.text, analysis.effects);
        if (sequenceDecision) analysis.matches.push({ ruleId: sequenceDecision.name, action: sequenceDecision.action === "review" ? "review" : "block", applicability: "confirmed", reason: sequenceDecision.reason, effects: analysis.effects.map(effect => effect.id) });
        if (!sequenceDecision && authorizedPlanIntegration(request, analysis, profile)) {
          sequence.record(request.tool, request.text);
          completed.set(call.callId, { request, effects: analysis.effects, created, generation: context.generation });
          while (completed.size > 50) completed.delete(completed.keys().next().value!);
          return undefined;
        }
        await intentReady;
        if (!fresh()) return blocked("Task changed; action not executed");
        const contextual = contextualEffect(context, request, analysis, event.input);
        // Browser target/frame effects belong to its executor policy callback.
        if (request.tool === "browser_page" || request.tool === "browser_session") analysis.matches = analysis.matches.filter(m => m.ruleId !== `custom-effect:${request.tool}`);
        const variables = [...(analysis.internal?.variables ?? []), ...processVariableEvidence(analysis.effects, process.env)];
        const evidence = context.buildEvidence(
          call.callId, request.text, analysis.effects, analysis.matches, analysis.uncertainties, variables, sequenceDecision?.evidence,
          { tool: request.tool, input: request.input, cwd: request.cwd }, typeof ctx.sessionManager.getBranch === "function" ? ctx.sessionManager.getBranch() : undefined,
        );
        if (contextual) { evidence.browser = context.browserEvidence(contextual); applyContextualEffect(analysis, evidence); }
        let decision = decide(analysis, evidence);
        if (decision.outcome === "review") {
          const reviewSession = ctx.sessionManager.getSessionId();
          const result = await dependencies.review(evidence, { ...ctx, signal }, dependencies.settings, call, () => context.generation);
          // Persist only while the originating session and generation are still active.
          // Logging is diagnostic and must never change the approval outcome.
          if (fresh() && ctx.sessionManager.getSessionId() === reviewSession && result.diagnostics) {
            try { pi.appendEntry(JUDGE_REVIEW_LOG, result.diagnostics); } catch { /* best-effort diagnostics */ }
          }
          if (!fresh()) return blocked("Review is stale or cancelled; action not executed");
          decision = decide(analysis, evidence, result);
        }
        if (decision.outcome === "block") return blocked(decision.reason);
        const localBypass = !policyOnly && bypassed && bypassEligibility(request, analysis, decision, facts).eligible;
        let reviewFuture = false;
        const reviewableScript = analysis.internal?.scripts?.length === 1 ? analysis.internal.scripts[0] : undefined;
        if (decision.outcome === "user" && !localBypass) {
          const answer = await promptDecision(decision, request, analysis, { ...ctx, signal, allowReview: !!dependencies.scriptReview && !!reviewableScript });
          if (answer.status !== "approved") return blocked(answer.reason);
          if (!fresh()) return blocked("Approval context expired; action not executed");
          if (contextual && context.bindBrowserDecision(contextual)) persistIntent();
          reviewFuture = answer.review === true;
        }
        if (!fresh()) return blocked("Pending call changed or cancelled; action not executed");
        if (decision.outcome === "review") return blocked("Review did not settle; action not executed");
        if (reviewFuture && reviewableScript && dependencies.scriptReview) {
          // The approval itself is for this call; future-use review must not
          // hold up execution. Bind its result to the session and generation
          // that commissioned it so a late child cannot notify a new turn.
          const origin = ctx.sessionManager.getSessionId();
          const generation = context.generation;
          const reviewRequest: ScriptReviewRequest = { script: reviewableScript, cwd: request.cwd, scope: "invocation", origin, signal };
          const current = () => !signal.aborted && context.generation === generation && ctx.sessionManager.getSessionId() === origin;
          void dependencies.scriptReview(reviewRequest).then(result => {
            if (!current()) return;
            const status = typeof result === "object" && result !== null && "status" in result ? String((result as { status: unknown }).status) : "failed";
            if (status === "approved") ctx.ui.notify("Damage Control: future use approved for this script invocation", "info");
            else if (status !== "nonqualifying") ctx.ui.notify("Damage Control: future review was not saved; runtime analysis remains active", "warning");
          }).catch(() => { if (current()) ctx.ui.notify("Damage Control: future review was not saved; runtime analysis remains active", "warning"); });
        }
        if (!policyOnly) {
          sequence.record(request.tool, request.text);
          completed.set(call.callId, { request, effects: analysis.effects, created, generation: context.generation });
        }
        while (completed.size > 50) completed.delete(completed.keys().next().value!);
        return undefined;
      } catch (error) {
        return blocked(`Required analysis failed; action not executed. ${error instanceof Error ? error.message : "Unknown enforcement error"}`);
      } finally {
        pending.delete(event.toolCallId);
      }
    },
    scan: async (ctx: ExtensionContext) => dependencies.scriptScan?.(ctx.cwd, ctx.sessionManager.getSessionId(), (message, level = "info") => ctx.ui.notify(message, level), ctx.signal),
  } satisfies Gate;
  return gate;
}
