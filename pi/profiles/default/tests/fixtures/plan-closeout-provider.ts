import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools, type AssistantMessage, type ToolCall, type TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CloseoutManifest } from "../../lib/plan-integration/contracts.ts";

export const fixtureIntegratorModel = "gpt-5.5-luna";
export interface CloseoutFixtureInput {
  manifest: CloseoutManifest;
  mixedRelease: boolean;
  origin: { pid: number; sessionId: string; paneId: string; workspaceId: string };
}
export interface CloseoutEvidence {
  kind: string;
  pid: number;
  sessionId?: string;
  [key: string]: unknown;
}

/** Deterministic reasoning only. No fixture tools, commands, admission or lifecycle replacements. */
export function registerCloseoutFixture(pi: ExtensionAPI, options: {
  role: "origin" | "successor";
  inputFile: string;
  evidenceFile: string;
}): void {
  let current: ExtensionContext | undefined;
  let prompt = "";
  let launched = false;
  let launchInspected = false;
  let readinessInspected = false;
  let blockerInspected = false;
  let released = false;
  const input = () => JSON.parse(readFileSync(options.inputFile, "utf8")) as CloseoutFixtureInput;
  const record = (kind: string, data: Record<string, unknown> = {}) => appendFileSync(options.evidenceFile, `${JSON.stringify({ kind, pid: process.pid, sessionId: current?.sessionManager.getSessionId(), ...data })}\n`);
  const session = () => ({ cwd: current?.cwd, sessionFile: current?.sessionManager.getSessionFile(), entries: current?.sessionManager.getEntries(), tools: pi.getActiveTools() });
  // No external reasoning or model network is allowed in either real Pi process.
  globalThis.fetch = async () => { throw new Error("Network forbidden in live closeout fixture"); };
  pi.on("session_start", (_event, ctx) => { current = ctx; record("session-start", session()); });
  pi.on("before_agent_start", (event, ctx) => { current = ctx; prompt = event.prompt; record("before-agent-start", { prompt, ...session() }); });
  pi.on("message_end", event => {
    if (event.message.role === "toolResult" && event.message.toolName === "closeout_successor" && event.message.toolCallId === "release" && !event.message.isError) released = true;
    record("message-end", { message: event.message });
  });
  pi.on("tool_result", event => { record("tool-result", { event }); });
  pi.on("tool_call", async event => {
    record("tool-call", { toolName: event.toolName, input: event.input });
    if (options.role !== "successor" || event.toolName !== "bash" || typeof event.input.command !== "string" || !event.input.command.endsWith(" cleanup")) return;
    const { manifest, origin } = input();
    let originAlive = true;
    try { process.kill(origin.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; originAlive = false; }
    const { stdout } = await promisify(execFile)(process.env.HERDR_BIN_PATH || "herdr", ["pane", "list", "--workspace", origin.workspaceId], { env: process.env, windowsHide: true, timeout: 20_000 });
    record("cleanup-start", { originAlive, origin, panes: JSON.parse(stdout), taskExists: existsSync(manifest.taskWorktree) });
  });
  pi.on("agent_settled", () => { record("settled", session()); });
  pi.on("session_shutdown", event => { record("shutdown", { reason: event.reason, ...session() }); });

  const tool = (id: string, name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id, name, arguments: args });
  const text = (value: string): AssistantMessage["content"] => [{ type: "text", text: value }];
  const choose = (context: TranscriptContext): AssistantMessage["content"] => {
    if (options.role === "successor") {
      const result = context.messages.filter(message => message.role === "toolResult" && message.toolName === "closeout_successor_handoff").at(-1);
      if (!result || result.role !== "toolResult") return [tool("handoff", "closeout_successor_handoff", {})];
      const raw = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      const outcome = JSON.parse(raw) as { outcome: string; reason?: string; action?: string };
      const label = outcome.outcome === "MERGE BLOCKED" ? "🔴 NOT COMPLETE: MERGE BLOCKED" : outcome.outcome === "COMPLETED" ? "🟢 COMPLETED" : outcome.outcome === "CLEANUP PENDING" ? "🟡 CLEANUP PENDING" : `🔴 NOT COMPLETE: ${outcome.outcome}`;
      return text(`${label}\n${raw}`);
    }
    if (released) return text("UNEXPECTED ORIGIN CONTINUATION AFTER RELEASE");
    if (!launched) {
      if (!existsSync(options.inputFile)) return text("Prepared task admitted; awaiting disposable implementation inputs.");
      launched = true;
      return [tool("launch", "closeout_successor", { action: "launch", instructions: `Execute the authorized canonical staged local closeout now.\n<pi-closeout-manifest>${JSON.stringify(input().manifest)}</pi-closeout-manifest>` })];
    }
    const notices = context.messages.filter(message => message.role === "user").map(message => typeof message.content === "string" ? message.content : message.content.filter(part => part.type === "text").map(part => part.text).join("\n"));
    const ready = notices.some(content => content.includes('"kind":"successor-integration-ready"'));
    const blocker = notices.some(content => content.includes('"kind":"successor-turn"'));
    if (prompt === "Origin obligations completed. Release final reporting.") {
      const batch = [tool("release", "closeout_successor", { action: "release" })];
      if (input().mixedRelease) batch.push(tool("release-sibling", "read", { path: "baseline.txt" }));
      return batch;
    }
    if (!launchInspected || (ready && !readinessInspected) || (blocker && !blockerInspected)) {
      launchInspected = true;
      if (ready) readinessInspected = true;
      if (blocker) blockerInspected = true;
      return [tool(ready ? "inspect-ready" : blocker ? "inspect-blocker" : "inspect-launch", "closeout_successor", { action: "inspect" })];
    }
    return text(ready ? "Integration readiness observed. Integrator owns final reporting after authorized handoff." : "Integrator owns closeout reporting; origin remains available.");
  };
  const streamSimple: NonNullable<Parameters<ExtensionAPI["registerProvider"]>[1]["streamSimple"]> = (model, context, streamOptions) => {
    record("request", { model: `${model.provider}/${model.id}`, reasoning: streamOptions?.reasoning, prompt, released, launchReceiptConsumed: process.env.PI_HERDR_PLAN_RUN === undefined, herdrSocket: process.env.HERDR_SOCKET_PATH, authority: JSON.parse(process.env.PI_SUBAGENT_AUTHORITY ?? "null"), systemPrompt: current?.getSystemPrompt(), providerSystemPrompt: getCurrentSystemPrompt(context.messages), declaredTools: getCurrentTools(context.messages).map(tool => tool.name), messages: context.messages, ...session() });
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      const message: AssistantMessage = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "pending", timestamp: Date.now() };
      try {
        const content = choose(context);
        stream.push({ type: "start", partial: message });
        for (const part of content) {
          const index = message.content.length;
          if (part.type === "toolCall") {
            message.content.push({ ...part, arguments: {} });
            stream.push({ type: "toolcall_start", contentIndex: index, partial: message });
            message.content[index] = part;
            stream.push({ type: "toolcall_end", contentIndex: index, toolCall: part, partial: message });
          } else if (part.type === "text") {
            message.content.push({ type: "text", text: "" });
            stream.push({ type: "text_start", contentIndex: index, partial: message });
            message.content[index] = part;
            stream.push({ type: "text_delta", contentIndex: index, delta: part.text, partial: message });
            stream.push({ type: "text_end", contentIndex: index, content: part.text, partial: message });
          }
        }
        message.stopReason = content.some(part => part.type === "toolCall") ? "toolUse" : "stop";
        if (streamOptions?.signal?.aborted) throw new Error("Fixture provider request aborted");
        stream.push({ type: "done", reason: message.stopReason, message });
      } catch (error) {
        message.stopReason = streamOptions?.signal?.aborted ? "aborted" : "error";
        message.errorMessage = String(error);
        stream.push({ type: "error", reason: message.stopReason, error: message });
      }
      stream.end();
    });
    return stream;
  };
  const model = (id: string) => ({ id, name: id, reasoning: true, input: ["text"] as ("text" | "image")[], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 8192 });
  pi.registerProvider("closeout-fixture", { apiKey: "fixture", baseUrl: "http://invalid.test", api: "closeout-fixture", models: [model("deterministic-origin")], streamSimple });
  // Keep the role's actual `model: luna` resolution and `effort: high`. Replace
  // only provider reasoning/network, including the authenticated Codex tier.
  pi.registerProvider("openai-codex", { apiKey: "fixture", baseUrl: "http://invalid.test", api: "closeout-fixture", models: [model("gpt-5.4-luna"), model(fixtureIntegratorModel)], streamSimple });
}
