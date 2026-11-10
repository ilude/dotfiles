import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSubagentAuthority } from "../../lib/subagents/authority.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected fixture protocol object");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Expected fixture protocol string");
  return value;
}

/** Deterministic decisions only. All role/lifecycle side effects use the production tools. */
export default function fixture(pi: ExtensionAPI): void {
  const evidence = process.env.PI_T3_ROLE_SMOKE_EVIDENCE;
  if (!evidence) throw new Error("T3 smoke evidence path is missing");
  let current: ExtensionContext | undefined;
  let phase = "";
  const record = (kind: string, data: Record<string, unknown> = {}) => appendFileSync(evidence, `${JSON.stringify({ kind, pid: process.pid, sessionId: current?.sessionManager.getSessionId(), ...data })}\n`);
  pi.on("session_start", (event, ctx) => {
    current = ctx;
    const saved = ctx.sessionManager.getBranch().filter(entry => entry.type === "custom" && entry.customType === "t3-smoke-root").at(-1);
    if (saved?.type === "custom") phase = string(object(saved.data).phase);
    record("session", { reason: event.reason, cwd: ctx.cwd, profile: process.env.PI_CODING_AGENT_DIR });
  });
  pi.on("input", (event, ctx) => { current = ctx; record("input", { source: event.source, marker: /SMOKE_[A-Z_]+/.exec(event.text)?.[0], authorityId: getSubagentAuthority(pi.events)?.id }); });
  pi.on("before_agent_start", (_event, ctx) => { current = ctx; record("before-agent", { authorityId: getSubagentAuthority(pi.events)?.id }); });
  pi.on("agent_start", () => record("agent-start"));
  pi.on("turn_start", () => record("turn-start"));
  pi.on("agent_settled", (event, ctx) => { current = ctx; record("settled", { aborted: event.aborted, authorityId: getSubagentAuthority(pi.events)?.id, idle: ctx.isIdle() }); });
  pi.on("tool_call", event => {
    if (["t3_delegate_role", "t3_role_control", "t3_role_parent"].includes(event.toolName) || event.toolName.endsWith("__delegate_task")) record("tool-call", { name: event.toolName, callId: event.toolCallId, parentCallId: event.parentToolCallId, args: event.input });
  });
  pi.on("tool_execution_end", event => {
    if (event.parentToolCallId || event.toolName === "subagent") record("nested-call", { name: event.toolName, callId: event.toolCallId, parentCallId: event.parentToolCallId, isError: event.isError });
    if (["t3_delegate_role", "t3_role_control", "t3_role_parent", "read", "write", "codemode"].includes(event.toolName)) record("tool", { callId: event.toolCallId, name: event.toolName, content: event.result.content, details: event.result.details, isError: event.isError });
  });
  pi.on("message_end", event => {
    if (event.message.role === "custom") record("custom-message", { customType: event.message.customType });
  });
  pi.registerCommand("t3-smoke-bootstrap", { description: "Start the isolated deterministic role fixture", handler: async (args, ctx) => {
    current = ctx;
    if (getSubagentAuthority(pi.events) || !["parent", "reload", "restart"].includes(args.trim())) throw new Error("Invalid root-only smoke bootstrap");
    phase = args.trim();
    pi.appendEntry("t3-smoke-root", { phase });
    record("bootstrap", { target: phase });
    pi.sendUserMessage(`SMOKE_PARENT_${phase}`);
  } });
  const model = (id: string) => ({ id, name: id, reasoning: true, input: ["text"] as ("text" | "image")[], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 1024 });
  pi.registerProvider("t3-role-fixture", {
    apiKey: "deterministic-fixture", baseUrl: "http://invalid.test", api: "t3-role-fixture", models: [model("parent"), model("child")],
    streamSimple(selected, context) {
      const authority = getSubagentAuthority(pi.events);
      const declared = getCurrentTools(context.messages).map(tool => tool.name);
      record("request", { model: `${selected.provider}/${selected.id}`, bound: !!phase || !!authority, authorityId: authority?.id, role: authority?.agent, cwd: current?.cwd, effort: pi.getThinkingLevel(), tools: declared, systemPrompt: getCurrentSystemPrompt(context.messages) });
      const calls = context.messages.filter(message => message.role === "toolResult");
      const data = (id: string) => {
        const call = calls.find(message => message.toolCallId === id);
        if (!call) throw new Error(`Missing fixture result ${id}`);
        if (call.isError) throw new Error(`Fixture tool failed ${id}: ${JSON.stringify(call.content)}`);
        const part = call.content.find(part => part.type === "text");
        return object(JSON.parse(part?.type === "text" ? part.text : "null"));
      };
      const done = (id: string) => calls.some(message => message.toolCallId === id);
      const tool = (id: string, name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id, name, arguments: args });
      const childId = () => string(data("main-question").launchId);
      const control = (id: string, action: string, extra: ToolCall["arguments"] = {}) => tool(id, "t3_role_control", { action, id: childId(), ...extra });
      const wait = (id: string, target = childId(), timeoutMs = 45000) => tool(id, "t3_role_control", { action: "wait", id: target, blockingReason: "The finite isolated fixture must collect this native event-driven lifecycle boundary before its CLI turn exits.", timeoutMs });
      const delegate = (id: string, scenario: string, background: boolean, isolation = "shared") => tool(id, "t3_delegate_role", { agent: "reviewer", instructions: `SMOKE_${scenario}: read proof.txt, ${scenario === "QUESTION" || scenario === "CANCEL" ? "ask the real UI question before reporting" : "report the substantive outcome"}`, model: "t3-role-fixture/child", effort: "low", skills: ["testing"], background, isolation, ...(!background ? { blockingReason: "Collect the independent worktree child's proof while its sibling is blocked on a question." } : {}) });
      let content: AssistantMessage["content"];
      try {
        if (selected.id === "parent") {
          const steps: (() => ToolCall)[] = phase === "parent" ? [
            () => delegate("main-question", "QUESTION", true),
            () => wait("main-question-wait", childId(), 1000),
            () => delegate("main-worktree", "WORKTREE", false, "worktree"),
            () => control("main-questions", "questions"),
            () => {
              const pending = data("main-questions").requestIds;
              if (!Array.isArray(pending) || pending.length !== 1) throw new Error(`Expected one pending question: ${JSON.stringify(data("main-questions"))}`);
              return control("main-question-read", "questions", { requestId: string(pending[0]) });
            },
            () => {
              const question = data("main-question-read");
              const questions = question.questions;
              if (!Array.isArray(questions) || questions.length !== 1) throw new Error(`Expected one question body: ${JSON.stringify(question)}`);
              return control("main-answer", "answer", { requestId: string(question.requestId), answers: { [string(object(questions[0]).id)]: "SMOKE_APPROVED" } });
            },
            () => wait("main-completed-wait"),
            () => control("main-completed-inspect", "inspect"),
            () => control("main-history", "read"),
            () => control("main-followup", "message", { message: "SMOKE_FOLLOWUP: read proof.txt and report partial, not completed", freshContext: true }),
            () => wait("main-followup-wait"),
            () => control("main-followup-inspect", "inspect"),
            () => delegate("main-cancel-child", "CANCEL", false),
            () => tool("main-cancel", "t3_role_control", { action: "cancel", id: string(data("main-cancel-child").launchId), message: "Owned fixture question cancellation" }),
            () => wait("main-cancel-wait", string(data("main-cancel-child").launchId)),
            () => tool("main-cancel-inspect", "t3_role_control", { action: "inspect", id: string(data("main-cancel-child").launchId) }),
            () => control("main-retained-history", "read"),
          ] : [
            ...(phase === "reload" ? [
              () => control("reload-command", "message", { message: "/reload-runtime" }),
              () => wait("reload-command-wait"),
            ] : []),
            () => control(`${phase}-followup`, "message", { message: `SMOKE_${phase.toUpperCase()}: read proof.txt and report completion under the restored role` }),
            () => wait(`${phase}-wait`),
            () => control(`${phase}-inspect`, "inspect"),
          ];
          const next = steps.map(make => ({ make })).find(({ make }) => {
            // Resolve arguments only after all preceding results exist.
            return !done(make().id);
          });
          if (next) content = [next.make()];
          else {
            for (const make of steps) data(make().id);
            content = [{ type: "text", text: `SMOKE_PARENT_DONE ${phase}` }];
          }
        } else {
          const userTexts = context.messages.filter(message => message.role === "user").map(message => typeof message.content === "string" ? message.content : message.content.filter(part => part.type === "text").map(part => part.text).join("\n"));
          const scenario = userTexts.map(text => /SMOKE_(QUESTION|WORKTREE|FOLLOWUP|CANCEL|RELOAD|RESTART):/.exec(text)?.[1]).filter(Boolean).at(-1);
          if (!scenario) throw new Error("Missing child scenario marker");
          const prefix = `child-${scenario}`;
          if (!done(`${prefix}-read`)) content = [tool(`${prefix}-read`, "read", { path: "proof.txt" })];
          else if ((scenario === "QUESTION" || scenario === "CANCEL") && !done(`${prefix}-question`)) content = [tool(`${prefix}-question`, "t3_role_parent", { action: "question", message: `SMOKE_${scenario}: may the reviewer finish?` })];
          else if (!done(`${prefix}-report`)) {
            if (scenario === "QUESTION" && data(`${prefix}-question`).answer !== "SMOKE_APPROVED") throw new Error("Real question did not return the parent's answer");
            content = [tool(`${prefix}-report`, "t3_role_parent", { action: "report", outcome: scenario === "FOLLOWUP" ? "partial" : "completed", message: `SMOKE_${scenario}_RESULT: permitted read under frozen reviewer authority` })];
          } else content = [{ type: "text", text: `SMOKE_${scenario}_RESULT` }];
        }
      } catch (error) {
        record("fixture-error", { message: String(error) });
        content = [{ type: "text", text: `SMOKE_FAILED ${String(error)}` }];
      }
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = { role: "assistant", content: [], api: selected.api, provider: selected.provider, model: selected.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "pending", timestamp: Date.now() };
        stream.push({ type: "start", partial: message });
        for (const part of content) {
          const contentIndex = message.content.length;
          message.content.push(part);
          if (part.type === "toolCall") {
            stream.push({ type: "toolcall_start", contentIndex, partial: message });
            stream.push({ type: "toolcall_end", contentIndex, toolCall: part, partial: message });
          } else if (part.type === "text") {
            stream.push({ type: "text_start", contentIndex, partial: message });
            stream.push({ type: "text_delta", contentIndex, delta: part.text, partial: message });
            stream.push({ type: "text_end", contentIndex, content: part.text, partial: message });
          }
        }
        message.stopReason = content.some(part => part.type === "toolCall") ? "toolUse" : "stop";
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
      });
      return stream;
    },
  });
}
