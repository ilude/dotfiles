import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { adapt } from "./adapters.ts";
import { analyzeRequest, type AnalysisDependencies } from "./analysis.ts";
import { Breaker, fingerprint } from "./breaker.ts";
import { Context, DIRECT_INPUT_LIMIT } from "./context.ts";
import { decide } from "./engine.ts";
import { loadPolicy } from "./policy.ts";
import type { PathFacts } from "./paths.ts";
import { promptDecision } from "./prompt.ts";
import { analyzeShell, requireGrammars } from "./shell.ts";
import { DamageControlSessionState } from "./sequence.ts";
import type { ScriptReviewRequest } from "./script-review.ts";
import type { Effect, PendingCall, ReviewResult, Settings, ToolRequest } from "./types.ts";

export type Gate = { handle: (event: ToolCallEvent, ctx: ExtensionContext) => Promise<{ block: true; reason: string } | undefined>; setBypass: (value: boolean) => void; setMode: (value: "default" | "noshell") => void; scan: (ctx: ExtensionContext) => Promise<unknown> };
export type GateDependencies = AnalysisDependencies & {
  review: (evidence: ReturnType<Context["buildEvidence"]>, ctx: ExtensionContext, settings: Settings, pending: PendingCall, generation: () => number) => Promise<ReviewResult>;
  scriptReview?: (request: ScriptReviewRequest) => Promise<unknown>;
  scriptScan?: (cwd: string, origin: string, notify: (message: string, level?: "info" | "warning") => void) => Promise<unknown>;
  cancelScriptReviews?: () => void;
};
const blocked = (reason: string) => ({ block: true as const, reason: reason.slice(0, 4000) });

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
    scriptScan: (cwd, origin, notify) => coordinator.scan(cwd, origin, notify),
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
  const invalidate = () => { clearAbortListeners(); for (const controller of pending.values()) controller.abort(); pending.clear(); completed.clear(); watchdogCalls.clear(); deferred = []; dependencies.cancelScriptReviews?.(); context.invalidate(); sequence.reset(); breaker.reset(); };
  pi.on("session_start", () => { bypassed = false; invalidate(); });
  pi.on("session_tree", invalidate);
  pi.on("session_shutdown", invalidate);
  pi.on("input", (event) => {
    if (event.source !== "interactive" && event.source !== "rpc") return;
    breaker.reset();
    if (event.streamingBehavior) {
      deferred.push({ source: event.source, text: event.text });
      while (deferred.length > DIRECT_INPUT_LIMIT || deferred.reduce((n, item) => n + Buffer.byteLength(item.text, "utf8"), 0) > 16 * 1024) {
        deferred.shift(); context.noteOmission();
      }
    } else context.recordDirectInput(event.source, event.text);
  });
  pi.on("message_start", event => {
    // Queued steering/follow-ups are evidence only after actual delivery, not at enqueue time.
    if (event.message.role !== "user") return;
    const content = event.message.content;
    const text = typeof content === "string" ? content : content.filter(part => part.type === "text").map(part => part.text).join("\n");
    const index = deferred.findIndex(input => input.text === text);
    if (index >= 0) {
      const [input] = deferred.splice(index, 1);
      context.recordDirectInput(input.source, input.text);
    }
  });
  pi.on("agent_settled", () => { clearAbortListeners(); });
  pi.on("tool_result", async event => {
    const watchdogCall = watchdogCalls.get(event.toolCallId);
    watchdogCalls.delete(event.toolCallId);
    if (watchdogCall) breaker.result(watchdogCall, event.isError);
    const record = completed.get(event.toolCallId);
    completed.delete(event.toolCallId);
    if (!record || record.generation !== context.generation) return;
    if (event.isError) return;
    context.recordSuccess(event.toolCallId, record.effects, Date.now(), record.created);
    if (event.content.some(part => part.type !== "text")) context.noteOmission();
    context.recordToolResult(record.request, event.content.filter(part => part.type === "text").map(part => part.text).join("\n"));
  });
  const gate: Gate = {
    setBypass: value => { bypassed = value; },
    setMode: value => { mode = value; },
    async handle(event, ctx) {
      // Only the actual command-scoped tool is exempt, not arbitrary names containing commit.
      if (event.toolName === "commit_git_review") return;
      const watchdogCall = { tool: event.toolName, input: event.input, cwd: ctx.cwd };
      const stop = breaker.before(watchdogCall);
      if (stop) {
        pi.sendMessage({ customType: "damage-control-loop", content: stop, display: false }, { deliverAs: "nextTurn" });
        ctx.abort();
        return blocked(stop);
      }
      watchdogCalls.set(event.toolCallId, watchdogCall);
      while (watchdogCalls.size > 50) watchdogCalls.delete(watchdogCalls.keys().next().value!);
      const normalized = adapt(event.toolName, event.toolCallId, event.input, ctx.cwd);
      if (normalized.status === "uncovered") return;
      if (normalized.status === "unsupported") return blocked(normalized.reason);
      const request = normalized.request;
      if (mode === "noshell" && (request.tool === "bash" || request.tool === "powershell")) return blocked("Shell tools are disabled by damage-control noshell mode");
      if (ctx.signal?.aborted) return blocked("Pending call cancelled; action not executed");
      if (ctx.signal && !abortListeners.has(ctx.signal)) {
        abortListeners.set(ctx.signal, invalidate);
        ctx.signal.addEventListener("abort", invalidate, { once: true });
      }
      // Tool-result events also account for denied calls; failed calls never
      // become creation evidence. No approval state is retained here.
      completed.set(event.toolCallId, { request, effects: [], created: [], generation: context.generation });
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
        const evidence = context.buildEvidence(call.callId, request.text, analysis.effects, analysis.matches, analysis.uncertainties, analysis.internal?.variables, sequenceDecision?.evidence);
        let decision = decide(analysis, evidence);
        if (decision.outcome === "review") {
          const result = await dependencies.review(evidence, { ...ctx, signal }, dependencies.settings, call, () => context.generation);
          if (!fresh()) return blocked("Review is stale or cancelled; action not executed");
          decision = decide(analysis, evidence, result);
        }
        if (decision.outcome === "block") return blocked(decision.reason);
        const localBypass = bypassed && (request.tool === "bash" || request.tool === "powershell") && /^(?:\s*)(?:rm\b|git\s+(?!push\b)|docker\s+(?!.*\bvolume\b))/i.test(request.input.command) && !/\b(?:aws|az|gcloud|kubectl|helm|terraform|tofu|pulumi|ssh|scp|curl|wget)\b/i.test(request.input.command);
        let reviewFuture = false;
        const reviewableScript = analysis.internal?.scripts?.length === 1 ? analysis.internal.scripts[0] : undefined;
        if (decision.outcome === "user" && !localBypass) {
          const answer = await promptDecision(decision, request, analysis, { ...ctx, signal, allowReview: !!dependencies.scriptReview && !!reviewableScript });
          if (answer.status !== "approved") return blocked(answer.reason);
          reviewFuture = answer.review === true;
        }
        if (!fresh()) return blocked("Pending call changed or cancelled; action not executed");
        if (decision.outcome === "review") return blocked("Review did not settle; action not executed");
        if (reviewFuture && reviewableScript && dependencies.scriptReview) {
          const reviewRequest: ScriptReviewRequest = { script: reviewableScript, cwd: request.cwd, scope: "invocation", origin: ctx.sessionManager.getSessionId() };
          void dependencies.scriptReview(reviewRequest).then(result => {
            const status = typeof result === "object" && result !== null && "status" in result ? String((result as { status: unknown }).status) : "failed";
            if (status === "approved") ctx.ui.notify("Damage Control: future use approved for this script invocation", "info");
            else if (status !== "nonqualifying") ctx.ui.notify("Damage Control: future review was not saved; runtime analysis remains active", "warning");
          }).catch(() => ctx.ui.notify("Damage Control: future review was not saved; runtime analysis remains active", "warning"));
        }
        sequence.record(request.tool, request.text);
        completed.set(call.callId, { request, effects: analysis.effects, created, generation: context.generation });
        while (completed.size > 50) completed.delete(completed.keys().next().value!);
        return undefined;
      } catch (error) {
        return blocked(`Required analysis failed; action not executed. ${error instanceof Error ? error.message : "Unknown enforcement error"}`);
      } finally {
        pending.delete(event.toolCallId);
      }
    },
    scan: async ctx => dependencies.scriptScan?.(ctx.cwd, ctx.sessionManager.getSessionId(), (message, level = "info") => ctx.ui.notify(message, level)),
  };
  return gate;
}
