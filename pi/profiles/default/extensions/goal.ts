import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerProfileCommand } from "../lib/profile-command.ts";
import { GOAL_ENTRY_TYPE, type GoalBudgetConfig } from "../lib/goal/contract.ts";
import { renderGoalPrompt } from "../lib/goal/prompt.ts";
import { GoalRuntime, GOAL_RUNTIME_ENTRY, type GoalRuntimeData } from "../lib/goal/runtime.ts";
import { captureGoalBudgetBaseline, evaluateGoalBudget, type GoalBudgetBaseline } from "../lib/goal/budget.ts";
import { readGoalUsage } from "../lib/goal/usage.ts";
import { getSubagentRuntime, type GoalBinding } from "../lib/subagents/runtime.ts";

const CONTEXT_TYPE = "goal-authority";
const CONTROL_GUIDANCE = "Record current progress and explicit outcomes with goal_control: checkpoint with concrete progress and next work, complete with acceptance evidence, question with the exact required user decision, blocker with the concrete obstacle, or pause. Healthy ordinary stops re-enter the same durable goal; a missing checkpoint does not require user intervention. Complete explicitly when acceptance is met. Do not checkpoint unchanged work, poll for user answers, or continue past a required question. Set restoringBuildability only for a bounded step restoring a broken build, never optional work. Choose workload and concurrency early against observed budget headroom and pace. Configured counters cover only their named provider; an omitted counter does not impose a provider restriction.";
export interface GoalCommand { action: "start" | "resume" | "pause" | "status"; text: string; budget: GoalBudgetConfig; restoringBuildability?: boolean }
export function parseGoalCommand(args: string): GoalCommand {
  let text = args.trim();
  const first = text.match(/^(start|resume|pause|status)(?:\s+|$)/);
  const action = (first?.[1] ?? (text ? "start" : "status")) as GoalCommand["action"];
  if (first) text = text.slice(first[0].length).trim();
  const budget: { bedrockUsd?: number; codexPercent?: number } = {};
  if (action === "start") {
    while (text.startsWith("--")) {
      const option = text.match(/^--(bedrock-usd|codex-percent)(?:=|\s+)(\S+)(?:\s+|$)/);
      if (!option) throw new Error("Use /goal [start] [--bedrock-usd N] [--codex-percent N] <goal>");
      const value = Number(option[2]);
      if (!Number.isFinite(value) || value <= 0 || (option[1] === "codex-percent" && value > 100)) throw new Error("Goal budgets must be positive; Codex is an absolute weekly ceiling at most 100 percent.");
      const key = option[1] === "bedrock-usd" ? "bedrockUsd" : "codexPercent";
      if (budget[key] !== undefined) throw new Error(`Duplicate --${option[1]}`);
      budget[key] = value;
      text = text.slice(option[0].length).trim();
    }
    if (!text) throw new Error("Provide a goal: /goal [start] [--bedrock-usd N] [--codex-percent N] <goal>");
  } else if ((action === "status" || action === "pause") && text) throw new Error(`/goal ${action} takes no arguments`);
  if (action === "resume" && /^--restore-buildability(?:\s+|$)/.test(text)) return { action, text: text.replace(/^--restore-buildability(?:\s+|$)/, "").trim(), budget, restoringBuildability: true };
  return { action, text, budget };
}
function baseline(value: unknown): value is GoalBudgetBaseline {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.capturedAt !== "number" || !Number.isFinite(v.capturedAt) || !v.limits || typeof v.limits !== "object") return false;
  if (v.codex === undefined) return true;
  if (!v.codex || typeof v.codex !== "object") return false;
  const c = v.codex as Record<string, unknown>;
  return [c.usedPercent, c.resetAt, c.emergencyCeilingPercent].every(n => typeof n === "number" && Number.isFinite(n));
}
function attribution(data: GoalRuntimeData, launchedAt: string) {
  return { runId: data.runId, launchedAt: Date.parse(launchedAt), complete: data.attributionComplete,
    incompleteReason: data.attributionComplete ? undefined : data.reason,
    sessions: data.sessions.map(s => ({ session: s.session, from: Date.parse(s.from), ...(s.until ? { until: Date.parse(s.until) } : {}) })) };
}
export default function goalExtension(pi: ExtensionAPI): void {
  if (process.env.PI_SUBAGENT_AUTHORITY) return;
  let current: ExtensionContext | undefined;
  let guidance: string | undefined;
  let goalTurn = false;
  let goalBinding: GoalBinding | undefined;
  let goalOrigin: string | undefined;
  let subagents = getSubagentRuntime();
  const accounted = new Set<string>();
  const accounting = async (value: unknown): Promise<void> => {
    const state = runtime.state, data = runtime.data;
    if (!state || !data || state.budget.bedrockUsd === undefined || !value || typeof value !== "object") return;
    const event = value as Record<string, unknown>;
    if (event.runId !== state.runId) return;
    if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) return;
    const timestamp = event.timestamp;
    const row = data.sessions.find(s => s.session === event.session && timestamp >= Date.parse(s.from) && (s.until === undefined || timestamp < Date.parse(s.until)));
    if (!row) return;
    if (typeof event.recordId !== "string" || !event.recordId || typeof event.persisted !== "boolean") {
      await runtime.unavailable("Invalid whole-run accounting signal"); return;
    }
    if (!event.persisted) { if (!data.attributionComplete) return; current?.abort(); await runtime.unavailable("A goal response could not be persisted in the Bedrock ledger"); return; }
    if (accounted.has(event.recordId)) return;
    accounted.add(event.recordId);
  };
  const bind = () => {
    if (goalBinding && goalOrigin) subagents.unbindGoal(goalOrigin, goalBinding);
    goalBinding = undefined; goalOrigin = undefined;
    const state = runtime.state;
    if (!state) return;
    goalBinding = { runId: state.runId, capture: () => goalTurn && runtime.state?.runId === state.runId && runtime.state.outcome === "running",
      admit: () => runtime.state?.runId === state.runId ? runtime.admit() : Promise.resolve({ allowed: false, reason: "Owning goal is no longer active" }),
      enroll: session => runtime.enroll(session), close: session => runtime.closeSession(session), accounting };
    goalOrigin = state.sessionId;
    subagents.bindGoal(goalOrigin, goalBinding);
  };
  const status = () => {
    if (!current) return;
    const state = runtime.state;
    current.ui.setStatus("goal", state ? `goal: ${state.outcome}` : undefined);
  };
  const runtime: GoalRuntime = new GoalRuntime({
    persistState: state => { pi.appendEntry(GOAL_ENTRY_TYPE, state); status(); },
    persistRuntime: data => pi.appendEntry(GOAL_RUNTIME_ENTRY, data),
    admit: async (state, data) => {
      if (state.budget.bedrockUsd === undefined && state.budget.codexPercent === undefined) return { allowed: true };
      if (state.budget.bedrockUsd !== undefined && !data.attributionComplete) return { allowed: false, reason: data.reason ?? "Whole-run Bedrock accounting coverage is incomplete" };
      if (!current) return { allowed: false, reason: "Goal session is unavailable" };
      const usage = await readGoalUsage({
        attribution: state.budget.bedrockUsd === undefined ? undefined : attribution(data, state.startedAt),
        modelRegistry: state.budget.codexPercent === undefined ? undefined : current.modelRegistry,
        signal: current.signal ?? new AbortController().signal,
      });
      if (data.baseline === undefined) runtime.setBaseline(captureGoalBudgetBaseline(state.budget, usage, Date.parse(state.startedAt)));
      if (!baseline(data.baseline)) return { allowed: false, reason: "Goal launch budget baseline is invalid" };
      const result = evaluateGoalBudget(state.budget, data.baseline, usage, { restoringBuildability: data.restoringBuildability, previousCodex: data.previousCodex });
      if (result.codexObservation) runtime.recordCodex(result.codexObservation);
      guidance = `Budget checkpoint: ${JSON.stringify(result)}\nUse smaller bounded work and fewer concurrent agents as headroom shrinks. These are observed costs and shared quota pace, not a completion estimate.`;
      return { allowed: result.decision === "continue", reason: result.reasons.join(" "), guidance };
    },
    stopDescendants: runId => subagents.stopGoal(runtime.state!.sessionId, runId),
  });
  const restore = (ctx: ExtensionContext) => {
    if (goalBinding && goalOrigin) subagents.unbindGoal(goalOrigin, goalBinding);
    subagents = getSubagentRuntime();
    current = ctx; runtime.restore(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
    guidance = undefined; goalTurn = false; accounted.clear(); bind(); status();
  };
  const subscriptions = [
    pi.events.on("goal-run-id", value => {
      if (!value || typeof value !== "object") return;
      const request = value as Record<string, unknown>;
      const state = runtime.state;
      if (state && runtime.data?.sessions.some(s => s.session === request.session) && typeof request.respond === "function") request.respond(state.runId);
    }),
    pi.events.on("goal-accounting", value => {
      if (!value || typeof value !== "object") return;
      const event = value as Record<string, unknown>;
      if (Array.isArray(event.pending)) event.pending.push(accounting(event));
    }),
  ];
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", async (_event, ctx) => {
    if (runtime.state) await subagents.stopGoal(runtime.state.sessionId, runtime.state.runId);
    restore(ctx);
  });
  pi.on("session_shutdown", event => {
    if (goalOrigin && goalBinding) subagents.unbindGoal(goalOrigin, goalBinding);
    if (event.reason === "quit" || event.reason === "reload") for (const unsubscribe of subscriptions) unsubscribe();
    current?.ui.setStatus("goal", undefined); current = undefined; goalTurn = false;
  });
  pi.on("input", async event => {
    if (event.source !== "extension" && !event.text.startsWith("/")) {
      await runtime.waitForStops();
      runtime.userInstruction(event.text);
    }
  });
  pi.on("before_agent_start", (event, ctx) => {
    if (!runtime.state || runtime.state.outcome === "complete") { delete event.systemPromptOptions.sections.goal; return; }
    goalTurn = runtime.state.outcome === "running";
    if (goalTurn) {
      const session = ctx.sessionManager.getSessionFile();
      if (session) runtime.enroll(session);
    }
    // A required question is resumed only by input, never by a child-result message.
    if (event.messageType === "custom" && !goalTurn && ["goal-start", "goal-continuation", "subagent-result"].includes(event.message.customType)) ctx.abort();
    event.systemPromptOptions.sections.goal = `${renderGoalPrompt(runtime.state)}\n${CONTROL_GUIDANCE}${goalTurn ? "" : "\nThis goal is paused. Ordinary unrelated user requests may proceed; do not resume goal work without /goal resume."}`;
  });
  pi.on("context", event => {
    if (!runtime.state || runtime.state.outcome === "complete") return;
    return { messages: [
      ...event.messages.filter(m => !(m.role === "custom" && m.customType === CONTEXT_TYPE)),
      { role: "custom" as const, customType: CONTEXT_TYPE, content: `${renderGoalPrompt(runtime.state)}\n${CONTROL_GUIDANCE}${guidance ? `\n${guidance}` : ""}`, display: false, timestamp: 0 },
    ] };
  });
  pi.on("turn_start", async (_event, ctx) => {
    current = ctx;
    if (!goalTurn || !runtime.state || runtime.state.outcome === "complete") return;
    if (!(await runtime.admit()).allowed) ctx.abort();
  });
  pi.on("tool_call", async (event, ctx) => {
    if (!goalTurn || !runtime.state || runtime.state.outcome === "complete") return;
    if (runtime.state.outcome !== "running") return { block: true, reason: runtime.data?.reason ?? `Goal is ${runtime.state.outcome}` };
    if (event.toolName === "subagent_control" && typeof event.input.id === "string" && typeof event.input.action === "string") {
      try { subagents.assertGoalControl(event.input.id, runtime.state.sessionId, event.input.action); }
      catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
    }
    if (event.toolName !== "subagent") return;
    current = ctx;
    const decision = await runtime.admit();
    if (!decision.allowed) return { block: true, reason: decision.reason ?? "Goal budget paused delegation" };
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    current = ctx;
    const messages = event.context.llmMessages;
    // A healthy final assistant is not continuable until this boundary supplies
    // new context. Pi validates canContinue again after committing our entry.
    const canContinue = event.context.canContinue || (event.outcome === "completed" && messages.length > 0 && messages[messages.length - 1].role === "assistant");
    if (await runtime.settle(event.outcome, canContinue)) return {
      continue: true,
      entries: [{ type: "custom_message", customType: "goal-continuation", content: "Reconcile the durable goal with the work so far. If acceptance is met, record goal_control complete with evidence. Otherwise continue the same bounded goal, or record the required question, blocker, or pause. Do not expand acceptance scope or treat ordinary discoveries as requirements.", display: false }],
    };
  });
  pi.on("agent_settled", (event) => {
    if (event.aborted && runtime.state?.outcome === "running") runtime.pause("interrupted", "Agent interrupted. Use /goal resume to continue.");
  });
  const ControlSchema = Type.Object({
    action: Type.Union([Type.Literal("checkpoint"), Type.Literal("complete"), Type.Literal("question"), Type.Literal("blocker"), Type.Literal("pause")]),
    summary: Type.String({ minLength: 1, description: "Concrete progress and next work, acceptance evidence, exact question, or blocker. Never changes goal scope." }),
    findings: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    restoringBuildability: Type.Optional(Type.Boolean({ description: "True only for the next bounded step restoring a broken build. Emergency reserve cannot fund other work." })),
  }, { additionalProperties: false });
  const ResultSchema = Type.Object({ outcome: Type.String(), summary: Type.String() });
  pi.registerTool({
    name: "goal_control", exposure: "model-only", label: "Goal checkpoint", description: CONTROL_GUIDANCE,
    parameters: ControlSchema, outputSchema: ResultSchema, executionMode: "sequential",
    async execute(_id, input) {
      if (!goalTurn) throw new Error("No active goal turn. Use /goal resume to continue this goal.");
      if (input.action === "complete" && runtime.state && subagents.goalActive(runtime.state.sessionId, runtime.state.runId)) throw new Error("Goal descendants are still active or cleaning up. Wait for their outcomes before completion.");
      runtime.control(input);
      const result = { outcome: runtime.state!.outcome, summary: input.summary };
      return { content: [{ type: "text", text: input.summary }], details: result, structuredContent: result, terminate: true };
    },
    renderCall(args, theme) { return new Text(theme.fg("toolTitle", `Goal ${args.action ?? "control"}`), 0, 0); },
    renderResult(result, _options, theme) {
      const detail = result.details;
      return new Text(theme.fg("text", detail ? `${detail.outcome}: ${detail.summary}` : "Goal checkpoint"), 0, 0);
    },
  });
  registerProfileCommand(pi, "goal", {
    description: "Start, resume, inspect, or pause a same-session goal with optional Bedrock dollar and Codex weekly ceilings",
    handler: async (args, ctx) => {
      current = ctx;
      try {
        const command = parseGoalCommand(args);
        if (command.action === "status") {
          ctx.ui.notify(runtime.state ? `${renderGoalPrompt(runtime.state)}${runtime.data?.reason ? `\n${runtime.data.reason}` : ""}${guidance ? `\n${guidance}` : ""}` : "No goal in this session. Use /goal <goal>.", "info");
          return;
        }
        if (command.action === "pause") { ctx.abort(); await runtime.halt("interrupted", "Paused by user. Use /goal resume to continue."); goalTurn = false; status(); return; }
        await ctx.waitForIdle();
        if (command.action === "start") {
          const session = ctx.sessionManager.getSessionFile();
          if (!session) throw new Error("Goals require a durable native Pi session");
          if (runtime.state && runtime.state.outcome !== "running") await subagents.stopGoal(runtime.state.sessionId, runtime.state.runId);
          runtime.start(ctx.sessionManager.getSessionId(), session, { goal: command.text, scope: [], exclusions: [], decisions: [] }, command.budget);
        } else {
          await runtime.waitForStops();
          runtime.resume(command.text, command.restoringBuildability);
        }
        goalTurn = true;
        const session = ctx.sessionManager.getSessionFile();
        if (session) runtime.enroll(session);
        bind();
        const decision = await runtime.admit();
        if (!decision.allowed) { ctx.ui.notify(decision.reason ?? "Goal paused", "warning"); return; }
        pi.sendMessage({ customType: "goal-start", content: command.action === "start" ? "Begin the user-authorized /goal in this session. Use the authoritative goal context and goal_control protocol." : "Resume the same /goal. Apply the recorded user instructions without expanding scope.", display: false }, { triggerTurn: true, deliverAs: "followUp" });
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
    },
  });
}
