import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerProfileCommand } from "../lib/profile-command.ts";
import { GOAL_ENTRY_TYPE, type GoalBudgetConfig } from "../lib/goal/contract.ts";
import { renderGoalPrompt } from "../lib/goal/prompt.ts";
import { FULL_SEND_ENTRY, FULL_SEND_QUERY, restoreFullSend, type FullSendArm, type FullSendAuthorization } from "../lib/goal/full-send.ts";
import { GoalRuntime, GOAL_RUNTIME_ENTRY, type GoalRuntimeData } from "../lib/goal/runtime.ts";
import { captureGoalBudgetBaseline, evaluateGoalBudget, type GoalBudgetBaseline } from "../lib/goal/budget.ts";
import { readGoalUsage } from "../lib/goal/usage.ts";
import { getSubagentRuntime, type GoalBinding } from "../lib/subagents/runtime.ts";
import { selectedSubagentBackend } from "../lib/subagents/authority.ts";
import { createT3GoalBackend } from "../lib/subagents/t3/goal.ts";
import type { SubagentGoalOperations } from "../lib/subagents/t3/contracts.ts";

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
  let fullSend: FullSendArm | undefined;
  let fullSendSkill: string | undefined;
  const loadFullSendSkill = () => fullSendSkill ??= readFileSync(new URL("../skills/full-send/SKILL.md", import.meta.url), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  const isFullSendArmed = () => !!fullSend?.armed && fullSend.sessionId === runtime.state?.sessionId && fullSend.runId === runtime.state.runId && runtime.state.outcome !== "complete";
  const authorization = (): FullSendAuthorization | undefined => {
    const state = runtime.state;
    if (roleChild() || !state || !goalTurn || !isFullSendArmed() || state.outcome !== "running") return;
    return { source: "/full-send", sessionId: state.sessionId, runId: state.runId,
      task: { goal: state.authority.goal, scope: [...state.authority.scope], exclusions: [...state.authority.exclusions], decisions: [...state.authority.decisions] } };
  };
  const armFullSend = (armed: boolean) => {
    const state = runtime.state;
    if (!state || state.outcome === "complete") throw new Error("No incomplete goal. Use /full-send <task>.");
    fullSend = { version: 1, sessionId: state.sessionId, runId: state.runId, armed };
    pi.appendEntry(FULL_SEND_ENTRY, fullSend);
    status();
  };
  let goalBinding: GoalBinding | undefined;
  let goalOrigin: string | undefined;
  const t3 = selectedSubagentBackend() === "t3" ? createT3GoalBackend(pi) : undefined;
  let t3Ready = !t3;
  const roleChild = () => !!t3 && (!t3Ready || t3.isChild());
  let subagents: SubagentGoalOperations = t3 ?? getSubagentRuntime();
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
  const bind = async () => {
    if (goalBinding && goalOrigin) subagents.unbindGoal(goalOrigin, goalBinding);
    goalBinding = undefined; goalOrigin = undefined;
    const state = runtime.state;
    if (!state) return;
    goalBinding = { runId: state.runId, capture: () => goalTurn && runtime.state?.runId === state.runId && runtime.state.outcome === "running",
      admit: () => runtime.state?.runId === state.runId ? runtime.admit() : Promise.resolve({ allowed: false, reason: "Owning goal is no longer active" }),
      enroll: session => runtime.enroll(session), close: session => runtime.closeSession(session), accounting };
    goalOrigin = state.sessionId;
    await subagents.bindGoal(goalOrigin, goalBinding);
  };
  const status = () => {
    if (!current) return;
    const state = runtime.state;
    current.ui.setStatus("goal", state ? `goal: ${state.outcome}${isFullSendArmed() ? " (full send)" : ""}` : undefined);
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
  const restore = async (ctx: ExtensionContext) => {
    if (goalBinding && goalOrigin) subagents.unbindGoal(goalOrigin, goalBinding);
    if (t3) {
      t3Ready = false;
      try { await t3.restore(ctx); t3Ready = true; }
      catch (error) { ctx.ui.notify(`Goal policy unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning"); return; }
      if (roleChild()) { current = undefined; goalTurn = false; return; }
    } else subagents = getSubagentRuntime();
    current = ctx; runtime.restore(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId(), { stopDescendants: !t3 });
    fullSend = restoreFullSend(ctx.sessionManager.getBranch(), runtime.state);
    guidance = undefined; goalTurn = false; accounted.clear(); await bind(); status();
  };
  const subscriptions = [
    pi.events.on(FULL_SEND_QUERY, value => {
      if (!value || typeof value !== "object") return;
      const request = value as Record<string, unknown>;
      const active = authorization();
      if (active && request.sessionId === active.sessionId && typeof request.respond === "function") request.respond(active);
    }),
    pi.events.on("goal-run-id", value => {
      if (!value || typeof value !== "object") return;
      const request = value as Record<string, unknown>;
      if (roleChild()) return;
      const state = runtime.state;
      if (state && runtime.data?.sessions.some(s => s.session === request.session) && typeof request.respond === "function") request.respond(state.runId);
    }),
    pi.events.on("goal-accounting", value => {
      if (!value || typeof value !== "object") return;
      const event = value as Record<string, unknown>;
      if (roleChild()) return;
      if (Array.isArray(event.pending)) event.pending.push(accounting(event));
    }),
  ];
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", async (_event, ctx) => {
    if (!roleChild() && runtime.state) await subagents.stopGoal(runtime.state.sessionId, runtime.state.runId);
    await restore(ctx);
  });
  pi.on("session_shutdown", async event => {
    if (goalOrigin && goalBinding) subagents.unbindGoal(goalOrigin, goalBinding);
    if (t3 || event.reason === "quit" || event.reason === "reload") for (const unsubscribe of subscriptions) unsubscribe();
    current?.ui.setStatus("goal", undefined); current = undefined; goalTurn = false; fullSend = undefined;
    await t3?.close();
  });
  pi.on("input", async event => {
    if (roleChild()) return;
    if (event.source !== "extension" && !event.text.startsWith("/")) {
      await runtime.waitForStops();
      runtime.userInstruction(event.text);
    }
  });
  pi.on("before_agent_start", (event, ctx) => {
    if (roleChild()) return;
    if (!runtime.state || runtime.state.outcome === "complete") { delete event.systemPromptOptions.sections.goal; return; }
    goalTurn = runtime.state.outcome === "running";
    if (goalTurn) {
      const session = ctx.sessionManager.getSessionFile();
      if (session) runtime.enroll(session);
    }
    // A required question is resumed only by input, never by a child-result message.
    if (event.messageType === "custom" && !goalTurn && ["goal-start", "goal-continuation", "subagent-result"].includes(event.message.customType)) ctx.abort();
    event.systemPromptOptions.sections.goal = `${renderGoalPrompt(runtime.state)}\n${CONTROL_GUIDANCE}${authorization() ? "\nFull send is active for this goal. Follow the full-send workflow in the goal authority context." : ""}${goalTurn ? "" : "\nThis goal is paused. Ordinary unrelated user requests may proceed; do not resume goal work without /goal resume."}`;
  });
  pi.on("context", event => {
    if (roleChild()) return;
    if (!runtime.state || runtime.state.outcome === "complete") return;
    return { messages: [
      ...event.messages.filter(m => !(m.role === "custom" && m.customType === CONTEXT_TYPE)),
      { role: "custom" as const, customType: CONTEXT_TYPE, content: `${renderGoalPrompt(runtime.state)}\n${CONTROL_GUIDANCE}${authorization() ? `\n\n${loadFullSendSkill()}` : ""}${guidance ? `\n${guidance}` : ""}`, display: false, timestamp: 0 },
    ] };
  });
  pi.on("turn_start", async (_event, ctx) => {
    if (roleChild()) { if (!t3Ready) ctx.abort(); return; }
    current = ctx;
    if (!goalTurn || !runtime.state || runtime.state.outcome === "complete") return;
    if (!(await runtime.admit()).allowed) ctx.abort();
  });
  pi.on("tool_call", async (event, ctx) => {
    if (roleChild()) return;
    if (!goalTurn || !runtime.state || runtime.state.outcome === "complete") return;
    if (runtime.state.outcome !== "running") return { block: true, reason: runtime.data?.reason ?? `Goal is ${runtime.state.outcome}` };
    if ((event.toolName === "subagent_control" || event.toolName === "t3_role_control") && typeof event.input.id === "string" && typeof event.input.action === "string") {
      try { await subagents.assertGoalControl(event.input.id, runtime.state.sessionId, event.input.action); }
      catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
    }
    if (event.toolName !== "subagent" && event.toolName !== "t3_delegate_role") return;
    current = ctx;
    const decision = await runtime.admit();
    if (!decision.allowed) return { block: true, reason: decision.reason ?? "Goal budget paused delegation" };
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    if (roleChild()) return;
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
    if (!roleChild() && event.aborted && runtime.state?.outcome === "running") runtime.pause("interrupted", "Agent interrupted. Use /goal resume to continue.");
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
      if (roleChild()) throw new Error("Role children cannot control the owning goal");
      if (!goalTurn) throw new Error("No active goal turn. Use /goal resume to continue this goal.");
      if (input.action === "complete" && runtime.state && await subagents.goalActive(runtime.state.sessionId, runtime.state.runId)) throw new Error("Goal descendants are still active or cleaning up. Wait for their outcomes before completion.");
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
  const runGoal = async (command: GoalCommand, ctx: ExtensionCommandContext, enableFullSend = false) => {
    await ctx.waitForIdle();
    if (enableFullSend) loadFullSendSkill();
    if (command.action === "start") {
      const session = ctx.sessionManager.getSessionFile();
      if (!session) throw new Error("Goals require a durable native Pi session");
      if (runtime.state && runtime.state.outcome !== "running") await subagents.stopGoal(runtime.state.sessionId, runtime.state.runId);
      runtime.start(ctx.sessionManager.getSessionId(), session, { goal: command.text, scope: [], exclusions: [], decisions: [] }, command.budget);
    } else {
      await runtime.waitForStops();
      runtime.resume(command.text, command.restoringBuildability);
    }
    if (enableFullSend) armFullSend(true);
    goalTurn = true;
    const session = ctx.sessionManager.getSessionFile();
    if (session) runtime.enroll(session);
    await bind();
    const decision = await runtime.admit();
    if (!decision.allowed) { ctx.ui.notify(decision.reason ?? "Goal paused", "warning"); return; }
    pi.sendMessage({ customType: "goal-start", content: command.action === "start" ? "Begin the user-authorized /goal in this session. Use the authoritative goal context and goal_control protocol." : "Resume the same /goal. Apply the recorded user instructions without expanding scope.", display: false }, { triggerTurn: true, deliverAs: "followUp" });
  };
  registerProfileCommand(pi, "full-send", {
    description: "Complete a task as a goal with scoped local preapproval; bare invocation resumes the current goal, status inspects, off disarms",
    handler: async (args, ctx) => {
      if (roleChild()) { ctx.ui.notify("Role children cannot arm full send", "warning"); return; }
      current = ctx;
      try {
        const text = args.trim();
        if (text === "status") {
          const state = runtime.state;
          ctx.ui.notify(state ? `Full send: ${isFullSendArmed() ? (authorization() ? "active" : "armed, suspended") : "off"}\nRun: ${state.runId}\nTask: ${state.authority.goal}\nGoal: ${state.outcome}` : "Full send: off. Use /full-send <task>.", "info");
          return;
        }
        if (text === "off") { armFullSend(false); ctx.ui.notify("Full send off; the goal is unchanged.", "info"); return; }
        // Arming an already-running goal must not wait for its continuation loop to finish.
        if (!text && runtime.state?.outcome === "running") {
          loadFullSendSkill(); armFullSend(true);
          pi.sendMessage({ customType: "full-send-start", content: "The user enabled full send for the current goal. Follow the full-send workflow in the goal authority context.", display: false }, { triggerTurn: true, deliverAs: "steer" });
          return;
        }
        const command = parseGoalCommand(text || "resume");
        if (command.action !== "start" && command.action !== "resume") throw new Error("Use /full-send [task] | /full-send status | /full-send off");
        await runGoal(command, ctx, true);
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
    },
  });
  registerProfileCommand(pi, "goal", {
    description: "Start, resume, inspect, or pause a same-session goal with optional Bedrock dollar and Codex weekly ceilings",
    handler: async (args, ctx) => {
      if (roleChild()) { ctx.ui.notify("Role children cannot start or resume an owning goal", "warning"); return; }
      current = ctx;
      try {
        const command = parseGoalCommand(args);
        if (command.action === "status") {
          ctx.ui.notify(runtime.state ? `${renderGoalPrompt(runtime.state)}${runtime.data?.reason ? `\n${runtime.data.reason}` : ""}${guidance ? `\n${guidance}` : ""}` : "No goal in this session. Use /goal <goal>.", "info");
          return;
        }
        if (command.action === "pause") { ctx.abort(); await runtime.halt("interrupted", "Paused by user. Use /goal resume to continue."); goalTurn = false; status(); return; }
        await runGoal(command, ctx);
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
    },
  });
}
