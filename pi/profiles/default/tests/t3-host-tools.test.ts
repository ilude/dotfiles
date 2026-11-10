import { expect, it, vi } from "vitest";
import { Type } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionToolContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { callT3HostTool, t3HostToolNames, T3HostToolError } from "../lib/t3-host-tools.ts";

function fixture() {
  const env: NodeJS.ProcessEnv = { T3_PI_MCP_EXTENSION_PATH: "/fixture/bridge.ts" };
  const info: ToolInfo = {
    name: "mcp__t3_code__list_scheduled_tasks", description: "List jobs", parameters: Type.Object({}), exposure: "deferred",
    sourceInfo: { path: "/fixture/bridge.ts", source: "fixture", scope: "user", origin: "top-level" },
  };
  const callable: AgentTool = { name: info.name, label: "List jobs", description: info.description, parameters: info.parameters, execute: async () => ({ content: [], details: {} }) };
  let result: AgentToolResult<unknown> = { content: [], details: {}, structuredContent: { structuredContent: { tasks: [] } } };
  let error = false;
  const executeTool = vi.fn<ExtensionToolContext["executeTool"]>(async (_name, _args, _options) => ({
    toolCall: { type: "toolCall", id: "outer/1", name: info.name, arguments: {} }, result, isError: error,
  }));
  const ctx: Pick<ExtensionToolContext, "mode" | "tools" | "executeTool"> = { mode: "rpc", tools: [callable], executeTool };
  const pi = { getAllTools: () => [info] };
  return { env, info, pi, ctx, executeTool, setResult: (value: AgentToolResult<unknown>, failed = false) => { result = value; error = failed; } };
}

it("calls only the callable installed bridge through native tool execution and unwraps MCP data", async () => {
  const f = fixture(); const signal = new AbortController().signal;
  expect(await callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, { signal }, f.env)).toEqual({ tasks: [] });
  expect(f.executeTool).toHaveBeenCalledWith(f.info.name, {}, { signal });
  expect(t3HostToolNames(f.pi, ["list_scheduled_tasks"], f.env)).toEqual([f.info.name]);
});

it("rejects generic RPC and native children with inherited T3 markers without calling a tool", async () => {
  const f = fixture();
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, {})).rejects.toThrow("T3-owned");
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, { ...f.env, PI_SUBAGENT_AUTHORITY: "native" })).rejects.toThrow("T3-owned");
  expect(f.executeTool).not.toHaveBeenCalled();
  expect(t3HostToolNames(f.pi, ["list_scheduled_tasks"], {})).toEqual([]);
});

it("does not execute a same-name substitute or a registered tool outside the callable set", async () => {
  const f = fixture(); f.info.sourceInfo.path = "/imposter.ts";
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, f.env)).rejects.toThrow("unavailable");
  f.info.sourceInfo.path = "/fixture/bridge.ts";
  await expect(callT3HostTool(f.pi, { ...f.ctx, tools: [] }, "list_scheduled_tasks", {}, {}, f.env)).rejects.toThrow("unavailable");
  expect(f.executeTool).not.toHaveBeenCalled();
});

it("preserves permission rejection and MCP errors as failed native tool results", async () => {
  const f = fixture();
  const denied: AgentToolResult<unknown> = { content: [{ type: "text", text: "Approval denied" }], details: { denied: true } };
  f.setResult(denied, true);
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, f.env)).rejects.toMatchObject({
    name: "T3HostToolError", toolResult: { ...denied, isError: true },
  });
  f.setResult({ ...denied, structuredContent: { isError: true, content: [{ type: "text", text: "Approval denied" }] } });
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, f.env)).rejects.toBeInstanceOf(T3HostToolError);
});

it("accepts MCP text JSON but rejects missing or malformed structured results without fallback", async () => {
  const f = fixture();
  f.setResult({ content: [], details: {}, structuredContent: { content: [{ type: "text", text: '{"tasks":[]}' }] } });
  expect(await callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, f.env)).toEqual({ tasks: [] });
  f.setResult({ content: [], details: {} });
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, f.env)).rejects.toThrow("invalid structured");
  f.setResult({ content: [], details: {}, structuredContent: { content: [{ type: "text", text: "not JSON" }] } });
  await expect(callT3HostTool(f.pi, f.ctx, "list_scheduled_tasks", {}, {}, f.env)).rejects.toThrow("invalid structured");
});
