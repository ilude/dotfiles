import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());
import { Type } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionToolContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import register from "../extensions/session-launch.ts";
import { forkT3Thread, launchT3Thread } from "../lib/session-launch-t3.ts";

function fixture(worktreePath: string | null = null) {
  const env = { T3_PI_MCP_EXTENSION_PATH: "/bridge.ts" };
  vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", env.T3_PI_MCP_EXTENSION_PATH);
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  const calls: Array<{ name: string; args: unknown }> = [];
  const infos: ToolInfo[] = [];
  const tools: AgentTool[] = [];
  for (const operation of ["t3_thread_launch", "t3_thread_transfer", "orchestrator_capabilities", "t3_thread_read"]) {
    const name = `mcp__bridge__${operation}`;
    infos.push({ name, description: operation, parameters: Type.Object({}), exposure: "deferred", sourceInfo: { path: env.T3_PI_MCP_EXTENSION_PATH, source: "fixture", scope: "user", origin: "top-level" } });
    tools.push({ name, label: operation, description: operation, parameters: Type.Object({}), execute: async () => ({ content: [], details: {} }) });
  }
  const ctx: Pick<ExtensionToolContext, "mode" | "tools" | "executeTool"> = { mode: "rpc", tools, executeTool: vi.fn<ExtensionToolContext["executeTool"]>(async (name, args) => {
    calls.push({ name, args });
    const operation = name.split("__").at(-1);
    const data: NonNullable<AgentToolResult<unknown>["structuredContent"]> = operation === "orchestrator_capabilities" ? { parentThreadId: "caller" }
      : operation === "t3_thread_read" ? { thread: { threadId: "caller", worktreePath } }
      : { threadId: "actual-from-host" };
    return { toolCall: { type: "toolCall", id: "1", name, arguments: {} }, isError: false, result: { content: [], details: {}, structuredContent: data } };
  }) };
  return { ctx, calls, pi: { getAllTools: () => infos }, env };
}

it("launches a top-level idle thread with an explicit title through the callable T3 tool", async () => {
  const f = fixture();
  expect(await launchT3Thread(f.pi, f.ctx, { title: "review" })).toEqual({ threadId: "actual-from-host" });
  expect(f.calls.at(-1)).toEqual({ name: "mcp__bridge__t3_thread_launch", args: { title: "review", workspaceStrategy: { type: "root" } } });
});

it("preserves the observed current worktree instead of silently selecting project root", async () => {
  const f = fixture("/project/.worktrees/task");
  const signal = new AbortController().signal;
  await launchT3Thread(f.pi, f.ctx, { title: "same workspace", clientRequestId: "user-call" }, { signal });
  expect(f.calls.at(-1)?.args).toEqual({ title: "same workspace", workspaceStrategy: { type: "existing_worktree", worktreePath: "/project/.worktrees/task" }, clientRequestId: "user-call" });
  expect(f.ctx.executeTool).toHaveBeenCalledWith("mcp__bridge__t3_thread_launch", expect.any(Object), { signal });
});

it("rejects mismatched workspace metadata without a launch or terminal fallback", async () => {
  const f = fixture();
  const executeTool = vi.fn<ExtensionToolContext["executeTool"]>(async name => {
    const data: NonNullable<AgentToolResult<unknown>["structuredContent"]> = name.endsWith("orchestrator_capabilities")
      ? { parentThreadId: "caller" } : { thread: { threadId: "other", worktreePath: null } };
    return { toolCall: { type: "toolCall", id: "1", name, arguments: {} }, isError: false, result: { content: [], details: {}, structuredContent: data } };
  });
  await expect(launchT3Thread(f.pi, { ...f.ctx, executeTool }, { title: "wrong workspace" })).rejects.toThrow("workspace identity");
  expect(executeTool.mock.calls.some(call => call[0].endsWith("t3_thread_launch"))).toBe(false);
});

it("forks at the supported latest stable point and does not infer native session identity", async () => {
  const f = fixture();
  await forkT3Thread(f.pi, f.ctx, { title: "branch" });
  expect(f.calls[0]?.args).toEqual({ action: "fork", title: "branch", sourcePoint: { type: "latest_stable" } });
});

it("refuses unsupported T3 resume and restart commands without terminal or shutdown actions", async () => {
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const handoffs: string[] = [];
  const pi = {
    getAllTools: () => [{ name: "mcp__bridge__t3_thread_launch", description: "launch", parameters: Type.Object({}), exposure: "deferred", sourceInfo: { path: "/bridge.ts", source: "fixture", scope: "user", origin: "top-level" } }],
    registerTool() {}, on() {}, registerEntryRenderer() {}, registerShortcut() {},
    registerCommand(name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) { commands[name] = command; },
    sendUserMessage(text: string) { handoffs.push(text); },
  };
  register(pi as never);
  const ctx = { mode: "rpc", cwd: "/project", ui: { notify() {} }, sessionManager: {} };
  await expect(commands["new-instance"]!.handler("--resume native-uuid", ctx)).rejects.toThrow("native Pi session UUID");
  await expect(commands.pi!.handler("--restart", ctx)).rejects.toThrow("unsupported inside T3");
  expect(handoffs).toEqual([]);
});
