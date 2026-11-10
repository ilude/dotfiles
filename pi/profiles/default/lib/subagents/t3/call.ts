import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { samePlatformPath } from "../../path-identity.ts";
import type { T3RoleRuntime } from "./bootstrap.ts";

export function record(value: unknown, label = "response"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid T3 ${label}`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing T3 ${label}`);
  return value;
}
export function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
class ComposedError extends Error {
  readonly result: AgentToolResult<unknown>;
  constructor(result: AgentToolResult<unknown>) { super("T3 composed tool failed"); this.result = result; }
}
export function failure(error: unknown): AgentToolResult<unknown> {
  if (error instanceof ComposedError) return error.result;
  return { content: [{ type: "text", text: error instanceof Error ? error.message : "T3 role operation failed" }], details: {}, isError: true };
}
export function result(data: unknown): AgentToolResult<unknown> {
  return { content: [{ type: "text", text: JSON.stringify(data) }], details: data };
}
/** Resolve registered names, with known bridge names retained for deferred discovery. */
export function t3ToolNames(pi: Pick<ExtensionAPI, "getAllTools">, operations: readonly string[], bridge = process.env.T3_PI_MCP_EXTENSION_PATH): string[] {
  const names = pi.getAllTools().filter(tool => bridge && samePlatformPath(tool.sourceInfo.path, bridge) && operations.some(op => tool.name === op || tool.name.endsWith(`__${op}`))).map(tool => tool.name);
  return names.length ? names : operations.flatMap(op => [op, `mcp__t3-code__${op}`, `mcp__t3_code__${op}`]);
}
/** Only compose a callable injected tool from the installed bridge, never a same-name substitute. */
export async function callT3(pi: ExtensionAPI, runtime: T3RoleRuntime, ctx: ExtensionToolContext, parentId: string, operation: string, args: Record<string, unknown>, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback, bridge = process.env.T3_PI_MCP_EXTENSION_PATH): Promise<Record<string, unknown>> {
  const tool = pi.getAllTools().find(candidate => bridge && samePlatformPath(candidate.sourceInfo.path, bridge) && (candidate.name === operation || candidate.name.endsWith(`__${operation}`)) && ctx.tools.some(callable => callable.name === candidate.name));
  if (!tool) throw new Error(`Callable injected T3 ${operation} unavailable`);
  const outcome = await runtime.withOperation(parentId, operation, args, () => ctx.executeTool(tool.name, args, { signal, onUpdate }));
  let envelope: unknown = outcome.result.structuredContent;
  if (outcome.isError || outcome.result.isError) throw new ComposedError({ ...outcome.result, isError: true });
  // The generated bridge returns the MCP envelope as Pi structuredContent.
  // MCP-native fixtures may expose the domain structuredContent directly.
  if (envelope === undefined) throw new Error(`T3 ${operation} returned no structured result`);
  let data = record(envelope);
  if (data.isError === true) throw new ComposedError({ ...outcome.result, isError: true });
  if (data.structuredContent !== undefined) data = record(data.structuredContent);
  else if (Array.isArray(data.content)) {
    const part = data.content.find(item => item && typeof item === "object" && "text" in item && typeof item.text === "string");
    if (!part || typeof part.text !== "string") throw new Error(`T3 ${operation} returned no domain result`);
    try { data = record(JSON.parse(part.text)); } catch { throw new Error(`T3 ${operation} returned an invalid domain result`); }
  }
  if (data.isError === true) throw new ComposedError({ ...outcome.result, isError: true });
  return data;
}
