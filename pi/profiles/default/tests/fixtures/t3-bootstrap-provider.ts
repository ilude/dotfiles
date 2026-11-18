import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerT3RoleTools } from "../../lib/subagents/t3/launch.ts";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools, type AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createT3RoleRuntime } from "../../lib/subagents/t3/bootstrap.ts";

/** Offline provider for the real installed Pi command-to-first-request path. */
export default function fixture(pi: ExtensionAPI) {
  const profile = process.env.PI_CODING_AGENT_DIR!;
  const evidence = process.env.PI_T3_BOOTSTRAP_EVIDENCE!;
  const coordinator = process.env.PI_T3_BOOTSTRAP_COORDINATOR === "1";
  const bridgePath = fileURLToPath(new URL("./t3-bootstrap-bridge.ts", import.meta.url));
  const metadata = {
    capabilities: async () => ({ inheritedProviderInstanceId: "offline-pi", providers: [{ providerInstanceId: "offline-pi", driverKind: "pi", canRunChildTask: true, models: [{ id: "bootstrap-fixture/reader" }] }] }),
    thread: async () => ({}),
    currentThread: async (cwd?: string) => ({ threadId: "child", parentThreadId: "parent", runId: "child-run", cwd: cwd! }),
  };
  const runtime = createT3RoleRuntime(pi, { profile, metadata, bridgePath });
  if (coordinator) {
    registerT3RoleTools(pi, runtime, { profile, metadata, bridgePath });
  }
  pi.registerProvider("bootstrap-fixture", {
    apiKey: "offline", baseUrl: "http://invalid.test", api: "bootstrap-fixture",
    models: [{ id: "reader", name: "reader", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 1024 }],
    streamSimple(model, context) {
      const prior = context.messages.filter(message => message.role === "toolResult");
      const repeat = coordinator && prior.length === 4;
      const done = prior.length > 0 && !repeat;
      appendFileSync(evidence, JSON.stringify({ tools: getCurrentTools(context.messages).map(tool => tool.name), prompt: getCurrentSystemPrompt(context.messages), messages: context.messages }) + "\n");
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content: done ? [{ type: "text", text: "DONE" }] : repeat ? [
          { type: "toolCall", id: "nested-strategist-again", name: "t3_delegate_role", arguments: { agent: "strategist", instructions: "Plan again offline" } },
        ] : coordinator ? [
          { type: "toolCall", id: "nested-strategist", name: "t3_delegate_role", arguments: { agent: "strategist", instructions: "Plan offline" } },
          { type: "toolCall", id: "blocked-direct-raw", name: "mcp__t3-code__delegate_task", arguments: { task: "escape" } },
          { type: "toolCall", id: "blocked-hidden-raw", name: "mcp__t3_code__delegate_task", arguments: { task: "escape" } },
          { type: "toolCall", id: "blocked-write", name: "write", arguments: { path: "escape.txt", content: "escape" } },
        ] : [
          { type: "toolCall", id: "allowed-read", name: "read", arguments: { path: "evidence.txt" } },
          { type: "toolCall", id: "blocked-write", name: "write", arguments: { path: "escape.txt", content: "escape" } },
          { type: "toolCall", id: "blocked-codemode", name: "codemode", arguments: { code: 'return await tools.write({path:"escape.txt",content:"escape"})' } },
          { type: "toolCall", id: "blocked-raw", name: "mcp__t3__delegate_task", arguments: { task: "escape" } },
        ], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: done ? "stop" : "toolUse", timestamp: Date.now() };
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: done ? "stop" : "toolUse", message }); stream.end();
      });
      return stream;
    },
  });
}
