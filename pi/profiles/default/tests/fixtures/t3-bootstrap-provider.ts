import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools, type AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createT3RoleRuntime } from "../../lib/subagents/t3/bootstrap.ts";

/** Offline provider for the real installed Pi command-to-first-request path. */
export default function fixture(pi: ExtensionAPI) {
  const profile = process.env.PI_CODING_AGENT_DIR!;
  const evidence = process.env.PI_T3_BOOTSTRAP_EVIDENCE!;
  createT3RoleRuntime(pi, { profile, metadata: {
    capabilities: async () => ({}), thread: async () => ({}),
    currentThread: async cwd => ({ threadId: "child", parentThreadId: "parent", cwd: cwd! }),
  } });
  pi.registerProvider("bootstrap-fixture", {
    apiKey: "offline", baseUrl: "http://invalid.test", api: "bootstrap-fixture",
    models: [{ id: "reader", name: "reader", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 1024 }],
    streamSimple(model, context) {
      const prior = context.messages.filter(message => message.role === "toolResult");
      appendFileSync(evidence, JSON.stringify({ tools: getCurrentTools(context.messages).map(tool => tool.name), prompt: getCurrentSystemPrompt(context.messages), messages: context.messages }) + "\n");
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content: prior.length ? [{ type: "text", text: "DONE" }] : [
          { type: "toolCall", id: "allowed-read", name: "read", arguments: { path: "evidence.txt" } },
          { type: "toolCall", id: "blocked-write", name: "write", arguments: { path: "escape.txt", content: "escape" } },
          { type: "toolCall", id: "blocked-codemode", name: "codemode", arguments: { code: 'return await tools.write({path:"escape.txt",content:"escape"})' } },
          { type: "toolCall", id: "blocked-raw", name: "mcp__t3__delegate_task", arguments: { task: "escape" } },
        ], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: prior.length ? "stop" : "toolUse", timestamp: Date.now() };
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: prior.length ? "stop" : "toolUse", message }); stream.end();
      });
      return stream;
    },
  });
}
