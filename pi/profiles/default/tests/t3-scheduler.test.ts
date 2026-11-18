import { afterEach, expect, it, vi } from "vitest";
import { Type } from "typebox";
import { Check } from "typebox/value";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, SessionCompactEvent, ToolInfo } from "@earendil-works/pi-coding-agent";
import register, { scheduleOutputSchema } from "../extensions/scheduler.ts";
import registerRuntimeReload from "../extensions/runtime-reload.ts";
import { getProcessScheduler } from "../lib/process-scheduler.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

function cleanupFixture() {
  const f = fixture();
  vi.stubEnv("T3_MCP_URL", "http://127.0.0.1/mcp");
  vi.stubEnv("T3_MCP_BEARER_TOKEN", "fake-token");
  const reload = vi.fn(async () => {});
  const ctx = createMockCtx({ mode: "rpc", reload, waitForIdle: async () => {} });
  registerRuntimeReload(f.pi as unknown as ExtensionAPI);
  const command = (name: string, args: string) => f.pi._commands.find(command => command.name === name)!.handler(args, ctx);
  const compact = async (reason: SessionCompactEvent["reason"]) => {
    for (const hook of f.pi._getHook("session_compact")) await hook.handler({ type: "session_compact", reason }, ctx);
  };
  const past = "2020-01-01T00:00:00Z";
  const finished = (id: string, overrides: Record<string, unknown> = {}) => ({
    ...f.task(id, "thread-b", null), projectId: "project-a", lastRunStatus: "succeeded",
    schedule: { type: "once", runAt: past }, ...overrides,
  });
  let tasks = [finished("done")];
  let projectId = "project-a";
  let lists = 0;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const failDelete = new Set<string>();
  const rescheduled = new Set<string>();
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result: unknown = { protocolVersion: "2025-06-18" };
    if (request.method === "tools/call") {
      const { name, arguments: args } = request.params;
      calls.push({ name, args });
      if (name === "orchestrator_capabilities") result = { structuredContent: { parentThreadId: "thread-a" } };
      else if (name === "t3_thread_read") result = { structuredContent: { thread: { threadId: "thread-a", projectId } } };
      else if (name === "list_scheduled_tasks") {
        lists++;
        result = { structuredContent: { tasks: tasks.map(task => lists > 1 && rescheduled.has(task.scheduledTaskId) ? { ...task, nextRunAt: f.runAt } : task) } };
      } else if (name === "delete_scheduled_task") {
        if (failDelete.has(args.scheduledTaskId)) result = { isError: true, content: [{ type: "text", text: "private host error" }] };
        else {
          tasks = tasks.filter(task => task.scheduledTaskId !== args.scheduledTaskId);
          result = { structuredContent: { scheduledTaskId: args.scheduledTaskId, deleted: true } };
        }
      }
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  vi.stubGlobal("fetch", fetcher);
  return { ctx, run: (args = "") => command("task-clean", args), compact, reload,
    reloadRuntime: () => command("reload-runtime", ""), calls, finished, failDelete, rescheduled, fetcher, runAt: f.runAt,
    setTasks: (value: typeof tasks) => { tasks = value; },
    unsetProject: () => { projectId = ""; },
    deletions: () => calls.filter(call => call.name === "delete_scheduled_task").map(call => call.args.scheduledTaskId),
  };
}

it("removes finished one-shots across the project and preserves tasks that might still run", async () => {
  const f = cleanupFixture();
  f.setTasks([
    f.finished("done-other-thread"), f.finished("failed-unbound", { boundThreadId: null, lastRunStatus: "failed" }),
    f.finished("other-project", { projectId: "project-b" }), f.finished("never-ran", { lastRunStatus: "never" }),
    f.finished("running", { lastRunStatus: "running" }), f.finished("pending", { nextRunAt: f.runAt }),
    f.finished("paused", { enabled: false }), f.finished("recurring", { schedule: { type: "interval", everyMs: 60_000 } }),
    f.finished("webhook", { schedule: { type: "webhook" } }), f.finished("rescheduled"),
  ]);
  f.rescheduled.add("rescheduled");
  await f.run();
  expect(f.deletions()).toEqual(["done-other-thread", "failed-unbound"]);
  expect(f.calls.filter(call => call.name === "list_scheduled_tasks").every(call => call.args.projectId === "project-a")).toBe(true);
  expect(f.ctx.ui.notify).toHaveBeenLastCalledWith("Removed 2 finished one-shot tasks from this project.", "info");
  await f.run();
  expect(f.ctx.ui.notify).toHaveBeenLastCalledWith("No finished one-shot tasks to remove in this project.", "info");
  expect(f.deletions()).toEqual(["done-other-thread", "failed-unbound"]);
});

it("reports partial cleanup when T3 rejects a deletion", async () => {
  const f = cleanupFixture();
  f.setTasks([f.finished("done"), f.finished("denied"), f.finished("untouched")]);
  f.failDelete.add("denied");
  await f.run();
  expect(f.deletions()).toEqual(["done", "denied"]);
  expect(f.ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringMatching(/^Removed 1 finished one-shot task .* Cleanup stopped:/), "error");
});

it("does not clean without a current T3 project", async () => {
  const f = cleanupFixture();
  f.unsetProject();
  await f.run();
  expect(f.ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("requires a verified current project"), "error");
  expect(f.calls.map(call => call.name)).toEqual(["orchestrator_capabilities", "t3_thread_read"]);
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "native-child");
  f.fetcher.mockClear();
  await f.run();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("only available in a T3 Code Pi thread"), "warning");
});

it("cleans up on /reload-runtime and still reloads when a deletion fails", async () => {
  const f = cleanupFixture();
  f.setTasks([f.finished("done"), f.finished("denied")]);
  f.failDelete.add("denied");
  f.reload.mockImplementationOnce(async () => {
    expect(f.deletions()).toEqual(["done", "denied"]);
  });
  await f.reloadRuntime();
  expect(f.reload).toHaveBeenCalledOnce();
  expect(f.ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("Cleanup stopped:"), "warning");
});

it("cleans up after manual compaction only and stays quiet when nothing is removed", async () => {
  const f = cleanupFixture();
  await f.compact("threshold");
  await f.compact("overflow");
  expect(f.fetcher).not.toHaveBeenCalled();
  await f.compact("manual");
  expect(f.deletions()).toEqual(["done"]);
  expect(f.ctx.ui.notify).toHaveBeenCalledExactlyOnceWith("Removed 1 finished one-shot task from this project.", "info");
  f.ctx.ui.notify.mockClear();
  await f.compact("manual");
  expect(f.ctx.ui.notify).not.toHaveBeenCalled();
});

it("leaves both maintenance commands alone in a native Pi child", async () => {
  const f = cleanupFixture();
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "native-child");
  await f.compact("manual");
  await f.reloadRuntime();
  expect(f.reload).toHaveBeenCalledOnce();
  expect(f.fetcher).not.toHaveBeenCalled();
});
