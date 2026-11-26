import type { ExtensionAPI, ExtensionContext, ExtensionToolContext, ExecuteToolOptions } from "@earendil-works/pi-coding-agent";
import { resolvePiClient } from "./herdr-host.ts";
import { callT3HostTool } from "./t3-host-tools.ts";
import { createT3McpClient, type T3McpClientOptions } from "./t3-mcp-client.ts";
import { parseAtTime, type ScheduledPrompt } from "./process-scheduler.ts";

type ScheduleJob = Pick<ScheduledPrompt, "id" | "runAt" | "prompt" | "error">;
export type ScheduleSuccess =
  | { action: "create_at"; job: ScheduleJob }
  | { action: "list"; jobs: ScheduleJob[]; limit: number; truncated?: boolean }
  | { action: "cancel"; cancelled: ScheduleJob };
type T3ScheduleSuccess = Exclude<ScheduleSuccess, { action: "create_at" }>
  | (Extract<ScheduleSuccess, { action: "create_at" }> & { nextRunAt: string | null });
export interface ScheduleInput { action: "create_at" | "list" | "cancel"; when?: string; prompt?: string; id?: string }
type Task = { id: string; prompt: string; runAt: string | null };
type ToolContext = Pick<ExtensionToolContext, "mode" | "tools" | "executeTool">;
type ToolRegistry = Pick<ExtensionAPI, "getAllTools">;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid T3 scheduled-task metadata");
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid T3 scheduled-task identity");
  return value;
}
function time(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid T3 scheduled-task time");
  return value;
}
/** Installed T3 scheduledTaskSummary uses nullable boundThreadId/nextRunAt. */
function ownedTask(value: unknown, threadId: string): Task | undefined {
  const task = object(value);
  if (task.boundThreadId === null || typeof task.boundThreadId === "string" && task.boundThreadId !== threadId) return undefined;
  if (task.boundThreadId !== threadId || typeof task.prompt !== "string") throw new Error("Invalid T3 scheduled-task ownership metadata");
  return { id: id(task.scheduledTaskId), prompt: task.prompt, runAt: task.nextRunAt === null ? null : time(task.nextRunAt) };
}

export async function runT3Schedule(
  pi: ToolRegistry,
  ctx: ToolContext,
  input: ScheduleInput,
  options: ExecuteToolOptions = {},
  clientRequestId?: string,
): Promise<T3ScheduleSuccess> {
  const caps = await callT3HostTool(pi, ctx, "orchestrator_capabilities", {}, options);
  // This capability's historical field name denotes the current caller, not its lineage parent.
  const threadId = id(caps.parentThreadId);
  if (input.action === "create_at") {
    if (!input.when || !input.prompt) throw new Error("create_at requires when and prompt");
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 4000) throw new Error("Prompt must contain 1–4000 characters");
    if (prompt.startsWith("/")) throw new Error("Scheduled slash commands are not allowed");
    const runAt = new Date(parseAtTime(input.when)).toISOString();
    const created = await callT3HostTool(pi, ctx, "schedule_task", {
      prompt, schedule: { type: "once", runAt }, bindToCurrentThread: true,
      ...(clientRequestId === undefined ? {} : { clientRequestId }),
    }, options);
    if (created.boundThreadId !== threadId) throw new Error("T3 scheduled task is not bound to the current thread");
    const nextRunAt = created.nextRunAt === null ? null : time(created.nextRunAt);
    return { action: "create_at", job: { id: id(created.scheduledTaskId), runAt: nextRunAt ?? runAt, prompt }, nextRunAt };
  }
  const listed = await callT3HostTool(pi, ctx, "list_scheduled_tasks", {}, options);
  if (!Array.isArray(listed.tasks)) throw new Error("Invalid T3 scheduled-task list");
  const tasks = listed.tasks.map(value => ownedTask(value, threadId)).filter((task): task is Task => task !== undefined);
  const pending: ScheduledPrompt[] = tasks.filter((task): task is Task & { runAt: string } => task.runAt !== null)
    .map(task => ({ id: task.id, runAt: task.runAt, prompt: task.prompt })).sort((a, b) => a.runAt.localeCompare(b.runAt));
  if (input.action === "list") return { action: "list", jobs: pending.slice(0, 64), limit: 64, truncated: pending.length > 64 };
  if (!input.id?.trim()) throw new Error("cancel requires id");
  const matches = pending.filter(task => task.id.startsWith(input.id!));
  if (!matches.length) throw new Error(`Schedule not found in this T3 thread: ${input.id}. Delivered prompts cannot be recalled.`);
  if (matches.length > 1) throw new Error(`Schedule id is ambiguous: ${input.id}`);
  const task = matches[0];
  const deleted = await callT3HostTool(pi, ctx, "delete_scheduled_task", { scheduledTaskId: task.id }, options);
  if (deleted.deleted !== true || deleted.scheduledTaskId !== task.id) throw new Error("Invalid T3 schedule deletion result");
  return { action: "cancel", cancelled: task };
}

function finishedProjectTaskIds(tasks: unknown, projectId: string): Set<string> {
  if (!Array.isArray(tasks)) throw new Error("Invalid T3 scheduled-task list");
  const finished = new Set<string>();
  for (const value of tasks) {
    const task = object(value);
    if (task.projectId !== projectId || task.enabled !== true || task.nextRunAt !== null
      || (task.lastRunStatus !== "succeeded" && task.lastRunStatus !== "failed")) continue;
    const schedule = object(task.schedule);
    if (schedule.type === "once" && Date.parse(time(schedule.runAt)) <= Date.now()) {
      finished.add(id(task.scheduledTaskId));
    }
  }
  return finished;
}

/** User-invoked cleanup; command contexts cannot compose Pi tools. T3 still authorizes each deletion. */
export async function cleanT3ProjectTasks(options?: T3McpClientOptions): Promise<{ removed: number; error?: string }> {
  const { call } = createT3McpClient(options);
  const caps = object(await call("orchestrator_capabilities"));
  const threadId = id(caps.parentThreadId);
  const thread = object(object(await call("t3_thread_read", { threadId, limit: 1, runLimit: 1, maxCharsPerItem: 1 })).thread);
  if (thread.threadId !== threadId || typeof thread.projectId !== "string" || !thread.projectId.trim()) {
    throw new Error("T3 cleanup requires a verified current project");
  }
  const projectId = thread.projectId;
  const listFinished = async () => finishedProjectTaskIds(object(await call("list_scheduled_tasks", { projectId })).tasks, projectId);
  const candidates = await listFinished();
  let removed = 0;
  try {
    for (const scheduledTaskId of candidates) {
      // A task may have been rescheduled from another thread after the first list.
      if (!(await listFinished()).has(scheduledTaskId)) continue;
      const deleted = object(await call("delete_scheduled_task", { scheduledTaskId }));
      if (deleted.deleted !== true || deleted.scheduledTaskId !== scheduledTaskId) throw new Error("Invalid T3 schedule deletion result");
      removed++;
    }
  } catch (error) {
    return { removed, error: error instanceof Error ? error.message : "Unknown T3 cleanup error" };
  }
  return { removed };
}

export async function runT3TaskCleanup(ctx: Pick<ExtensionContext, "mode" | "ui">, trigger: "task-clean" | "maintenance"): Promise<void> {
  const explicit = trigger === "task-clean";
  if (resolvePiClient(ctx.mode) !== "t3code") {
    if (explicit) ctx.ui.notify("/task-clean is only available in a T3 Code Pi thread.", "warning");
    return;
  }
  const failureLevel = explicit ? "error" : "warning";
  try {
    const { removed, error } = await cleanT3ProjectTasks();
    const summary = `Removed ${removed} finished one-shot ${removed === 1 ? "task" : "tasks"} from this project.`;
    if (error) ctx.ui.notify(`${summary} Cleanup stopped: ${error}`, failureLevel);
    else if (removed) ctx.ui.notify(summary, "info");
    else if (explicit) ctx.ui.notify("No finished one-shot tasks to remove in this project.", "info");
  } catch (error) {
    ctx.ui.notify(`Task cleanup could not start: ${error instanceof Error ? error.message : "Unknown T3 cleanup error"}`, failureLevel);
  }
}
