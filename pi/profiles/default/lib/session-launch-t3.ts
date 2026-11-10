import type { ExecuteToolOptions, ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { callT3HostTool } from "./t3-host-tools.ts";
import { samePlatformPath } from "./path-identity.ts";

export const T3_SESSION_LAUNCH_OPERATIONS = ["t3_thread_launch", "t3_thread_transfer", "orchestrator_capabilities", "t3_thread_read"] as const;
export type T3WorkspaceStrategy =
  | { type: "root" }
  | { type: "existing_worktree"; worktreePath: string }
  | { type: "worktree"; branch?: string; baseRef?: string; startFromOrigin?: boolean };
type SessionToolContext = Pick<ExtensionToolContext, "mode" | "tools" | "executeTool">;
type ToolRegistry = Pick<ExtensionAPI, "getAllTools">;

async function currentWorkspace(pi: ToolRegistry, ctx: SessionToolContext, options: ExecuteToolOptions): Promise<T3WorkspaceStrategy> {
  const caps = await callT3HostTool(pi, ctx, "orchestrator_capabilities", {}, options);
  if (typeof caps.parentThreadId !== "string" || !caps.parentThreadId) throw new Error("T3 caller identity unavailable");
  const metadata = await callT3HostTool(pi, ctx, "t3_thread_read", { threadId: caps.parentThreadId, limit: 1, runLimit: 1 }, options);
  const thread = metadata.thread;
  if (!thread || typeof thread !== "object" || !("threadId" in thread) || thread.threadId !== caps.parentThreadId || !("worktreePath" in thread)) throw new Error("T3 workspace identity unavailable");
  if (thread.worktreePath === null) return { type: "root" };
  if (typeof thread.worktreePath === "string" && thread.worktreePath) return { type: "existing_worktree", worktreePath: thread.worktreePath };
  throw new Error("T3 workspace identity unavailable");
}

/** Shared by session actions and plan consumers. This API is tool-context-only. */
export async function launchT3Thread(
  pi: ToolRegistry,
  ctx: SessionToolContext,
  input: { title: string; message?: string; workspaceStrategy?: T3WorkspaceStrategy; clientRequestId?: string },
  options: ExecuteToolOptions = {},
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = { title: input.title, workspaceStrategy: input.workspaceStrategy ?? await currentWorkspace(pi, ctx, options) };
  if (input.message !== undefined) args.message = input.message;
  if (input.clientRequestId !== undefined) args.clientRequestId = input.clientRequestId;
  const result = await callT3HostTool(pi, ctx, "t3_thread_launch", args, options);
  if (typeof result.threadId !== "string" || !result.threadId) throw new Error("T3 launch returned no thread identity");
  return result;
}

export async function forkT3Thread(
  pi: ToolRegistry,
  ctx: Pick<ExtensionToolContext, "mode" | "tools" | "executeTool">,
  input: { title?: string } = {},
  options: ExecuteToolOptions = {},
): Promise<Record<string, unknown>> {
  return callT3HostTool(pi, ctx, "t3_thread_transfer", {
    action: "fork",
    ...(input.title ? { title: input.title } : {}),
    sourcePoint: { type: "latest_stable" },
  }, options);
}

export function t3SessionActionAvailable(pi: ToolRegistry, operation: typeof T3_SESSION_LAUNCH_OPERATIONS[number]): boolean {
  const bridge = process.env.T3_PI_MCP_EXTENSION_PATH;
  return !!bridge && pi.getAllTools().some(tool => samePlatformPath(tool.sourceInfo.path, bridge)
    && (tool.name === operation || tool.name.endsWith(`__${operation}`)));
}

/** Commands cannot execute injected tools. Hand the explicit request to the model as a user message. */
export function t3CommandHandoff(pi: Pick<ExtensionAPI, "sendUserMessage">, action: "launch" | "fork", title?: string): void {
  const titleText = title ? ` titled ${JSON.stringify(title)}` : "";
  const request = action === "launch"
    ? `Use session_launch to create an idle top-level T3 thread in the current T3 workspace${titleText}. If that supported operation is unavailable, report the limitation without a terminal fallback. Report the tool's actual result; do not claim success before it returns.`
    : `Use the available T3 thread transfer tool to fork the current thread at its latest stable point${titleText}. Report the tool's actual result; do not claim success before it returns.`;
  pi.sendUserMessage(request, { deliverAs: "followUp" });
}
