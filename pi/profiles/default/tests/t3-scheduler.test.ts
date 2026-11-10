import { afterEach, expect, it, vi } from "vitest";
import { Type } from "typebox";
import { Check } from "typebox/value";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";
import register, { scheduleOutputSchema } from "../extensions/scheduler.ts";
import { getProcessScheduler } from "../lib/process-scheduler.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function fixture() {
  vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "/fixture/bridge.ts");
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  const pi = createMockPi();
  const operations = ["orchestrator_capabilities", "schedule_task", "list_scheduled_tasks", "delete_scheduled_task"];
  const infos: ToolInfo[] = operations.map(op => ({ name: `mcp__t3_code__${op}`, description: op, parameters: Type.Object({}), exposure: "deferred", sourceInfo: { path: "/fixture/bridge.ts", source: "fixture", scope: "user", origin: "top-level" } }));
  pi.getAllTools.mockReturnValue(infos as never);
  const runAt = new Date(Date.now() + 60_000).toISOString();
  const data: Record<string, Record<string, unknown>> = {
    orchestrator_capabilities: { parentThreadId: "thread-a" },
    schedule_task: { scheduledTaskId: "actual-t3-job", boundThreadId: "thread-a", nextRunAt: runAt },
    list_scheduled_tasks: { tasks: [] },
    delete_scheduled_task: { scheduledTaskId: "job-a", deleted: true },
  };
  let denied = false;
  const executeTool = vi.fn(async (name: string, args: unknown) => ({
    toolCall: { id: "outer/1", name, arguments: args }, isError: denied,
    result: denied ? { content: [{ type: "text", text: "Permission declined" }], details: { denied: true } }
      : { content: [], details: {}, structuredContent: { structuredContent: data[name.split("__").at(-1)!] } },
  }));
  const tools: AgentTool[] = infos.map(info => ({ name: info.name, label: info.name, description: info.description, parameters: info.parameters, execute: async () => ({ content: [], details: {} }) }));
  const ctx = { mode: "rpc", tools, executeTool, ui: { setStatus: vi.fn() } };
  register(pi as unknown as ExtensionAPI);
  const tool = pi._getTool("schedule")!;
  const run = (input: unknown) => tool.execute("stable-user-call", input, new AbortController().signal, undefined, ctx);
  const task = (id: string, thread: string | null = "thread-a", time: string | null = runAt) => ({ scheduledTaskId: id, boundThreadId: thread, nextRunAt: time, prompt: "Check deployment", enabled: true, schedule: { type: "once", runAt } });
  return { pi, ctx, run, runAt, data, executeTool, task, deny: () => { denied = true; } };
}

it("creates an actual thread-bound one-shot request without adding a native timer", async () => {
  const f = fixture(); const before = getProcessScheduler().list();
  const output = await f.run({ action: "create_at", when: "5m", prompt: "Check\n deployment" });
  expect(f.executeTool).toHaveBeenCalledWith("mcp__t3_code__schedule_task", expect.objectContaining({ bindToCurrentThread: true, clientRequestId: "stable-user-call", prompt: "Check\n deployment", schedule: { type: "once", runAt: expect.any(String) } }), expect.any(Object));
  expect(output.structuredContent).toEqual({ action: "create_at", job: { id: "actual-t3-job", runAt: f.runAt, prompt: "Check\n deployment" } });
  expect(Check(scheduleOutputSchema, output.structuredContent)).toBe(true);
  expect(getProcessScheduler().list()).toEqual(before);
  expect(output.content[0].text).toContain("Check deployment");
});

it("uses the requested once time when T3 has already cleared nextRunAt", async () => {
  const f = fixture(); f.data.schedule_task.nextRunAt = null;
  const output = await f.run({ action: "create_at", when: "5m", prompt: "Check" });
  expect(Date.parse(output.structuredContent.job.runAt)).toBeGreaterThan(Date.now());
  expect(Check(scheduleOutputSchema, output.structuredContent)).toBe(true);
});

it("lists current-thread pending jobs, not unbound, other-thread or completed jobs", async () => {
  const f = fixture(); f.data.list_scheduled_tasks.tasks = [f.task("job-a"), f.task("unbound", null), f.task("foreign", "thread-b"), f.task("done", "thread-a", null)];
  const output = await f.run({ action: "list" });
  expect(output.structuredContent).toEqual({ action: "list", jobs: [{ id: "job-a", runAt: f.runAt, prompt: "Check deployment" }], limit: 64, truncated: false });
  expect(Check(scheduleOutputSchema, output.structuredContent)).toBe(true);
});

it("cancels only a matching current-thread job using its real opaque ID", async () => {
  const f = fixture(); f.data.list_scheduled_tasks.tasks = [f.task("job-a"), f.task("job-foreign", "thread-b")];
  const output = await f.run({ action: "cancel", id: "job-" });
  expect(f.executeTool).toHaveBeenCalledWith("mcp__t3_code__delete_scheduled_task", { scheduledTaskId: "job-a" }, expect.any(Object));
  expect(output.structuredContent.cancelled.id).toBe("job-a");
  expect(Check(scheduleOutputSchema, output.structuredContent)).toBe(true);
});

it("does not delete unowned or ambiguous jobs", async () => {
  const f = fixture(); f.data.list_scheduled_tasks.tasks = [f.task("foreign", "thread-b")];
  await expect(f.run({ action: "cancel", id: "foreign" })).rejects.toThrow("not found in this T3 thread");
  f.data.list_scheduled_tasks.tasks = [f.task("job-a"), f.task("job-b")];
  await expect(f.run({ action: "cancel", id: "job-" })).rejects.toThrow("ambiguous");
  expect(f.executeTool.mock.calls.some(call => call[0].endsWith("delete_scheduled_task"))).toBe(false);
});

it("preserves native permission failure and never falls back to the process scheduler", async () => {
  const f = fixture(); f.deny(); const before = getProcessScheduler().list();
  const output = await f.run({ action: "create_at", when: "5m", prompt: "Check" });
  expect(output).toMatchObject({ isError: true, content: [{ type: "text", text: "Permission declined" }], details: { denied: true }, structuredContent: { action: "error", message: "Permission declined" } });
  expect(Check(scheduleOutputSchema, output.structuredContent)).toBe(true);
  expect(getProcessScheduler().list()).toEqual(before);
});

it("rejects malformed metadata and a mismatched deletion result", async () => {
  const f = fixture(); f.data.list_scheduled_tasks.tasks = "invalid";
  await expect(f.run({ action: "list" })).rejects.toThrow("scheduled-task list");
  f.data.list_scheduled_tasks.tasks = [f.task("job-a", "thread-a", "not-a-time")];
  await expect(f.run({ action: "list" })).rejects.toThrow("scheduled-task time");
  f.data.list_scheduled_tasks.tasks = [f.task("job-a")]; f.data.delete_scheduled_task.scheduledTaskId = "different";
  await expect(f.run({ action: "cancel", id: "job-a" })).rejects.toThrow("deletion result");
});

it("does not bind native scheduling for a T3 session and reports bounded lists", async () => {
  const f = fixture(); const bind = vi.spyOn(getProcessScheduler(), "bind");
  for (const hook of f.pi._getHook("session_start")) await hook.handler({}, f.ctx);
  expect(bind).not.toHaveBeenCalled();
  f.data.list_scheduled_tasks.tasks = Array.from({ length: 65 }, (_, index) => f.task(`job-${index}`));
  const output = await f.run({ action: "list" });
  expect(output.structuredContent).toMatchObject({ limit: 64, truncated: true });
  expect(output.structuredContent.jobs).toHaveLength(64);
});
