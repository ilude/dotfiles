import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExecuteToolOptions, ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { resolvePiClient } from "./herdr-host.ts";
import { samePlatformPath } from "./path-identity.ts";
import { t3ToolNames } from "./subagents/t3/call.ts";

type ToolRegistry = Pick<ExtensionAPI, "getAllTools">;
type CallableContext = Pick<ExtensionToolContext, "mode" | "tools" | "executeTool">;

export class T3HostToolError extends Error {
  readonly toolResult: AgentToolResult<unknown> | undefined;
  constructor(message: string, toolResult?: AgentToolResult<unknown>) {
    super(message);
    this.toolResult = toolResult;
    this.name = "T3HostToolError";
  }
}

function object(value: unknown, operation: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new T3HostToolError(`T3 ${operation} returned an invalid structured result`);
  }
  return value as Record<string, unknown>;
}

/** Late discovery hints only. Actual invocation still requires the installed source and callable set. */
export function t3HostToolNames(pi: ToolRegistry, operations: readonly string[], env: NodeJS.ProcessEnv = process.env): string[] {
  return env.T3_PI_MCP_EXTENSION_PATH ? t3ToolNames(pi, operations, env.T3_PI_MCP_EXTENSION_PATH) : [];
}

/** Compose through Pi's hooks/permissions. Commands do not have this API and must not fabricate it. */
export async function callT3HostTool(
  pi: ToolRegistry,
  ctx: CallableContext,
  operation: string,
  args: Record<string, unknown>,
  options: ExecuteToolOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> {
  if (resolvePiClient(ctx.mode, env) !== "t3code") throw new T3HostToolError("This operation requires a T3-owned Pi client");
  const bridge = env.T3_PI_MCP_EXTENSION_PATH;
  const tool = pi.getAllTools().find(candidate => bridge && samePlatformPath(candidate.sourceInfo.path, bridge)
    && (candidate.name === operation || candidate.name.endsWith(`__${operation}`))
    && ctx.tools.some(callable => callable.name === candidate.name));
  if (!tool) throw new T3HostToolError(`Callable injected T3 ${operation} unavailable`);

  const outcome = await ctx.executeTool(tool.name, args, options);
  const failed = () => new T3HostToolError(`T3 ${operation} failed`, { ...outcome.result, isError: true });
  if (outcome.isError || outcome.result.isError) throw failed();
  let data = object(outcome.result.structuredContent, operation);
  if (data.isError === true) throw failed();
  if (data.structuredContent !== undefined) data = object(data.structuredContent, operation);
  else if (Array.isArray(data.content)) {
    const text = data.content.find((part: unknown): part is { type: "text"; text: string } =>
      !!part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string");
    if (!text) throw new T3HostToolError(`T3 ${operation} returned no structured result`);
    let parsed: unknown;
    try { parsed = JSON.parse(text.text); }
    catch { throw new T3HostToolError(`T3 ${operation} returned an invalid structured result`); }
    data = object(parsed, operation);
  }
  if (data.isError === true) throw failed();
  return data;
}
