import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerScheduler from "../extensions/scheduler.ts";
import { formatScheduleFooterStatus, getProcessScheduler, parseAtTime, ProcessScheduler } from "../lib/process-scheduler.ts";

const schedulers: ProcessScheduler[] = [];
function scheduler() {
  const result = new ProcessScheduler();
  schedulers.push(result);
  return result;
}
function harness() {
  const hooks = new Map<string, (...args: any[]) => any>();
  let tool: any;
  const pi = {
    on: (name: string, handler: (...args: any[]) => any) => hooks.set(name, handler),
    registerTool: (value: any) => { tool = value; },
    registerCommand: vi.fn(),
    sendUserMessage: vi.fn(),
  };
  const ctx = { ui: { setStatus: vi.fn() } };
  registerScheduler(pi as unknown as ExtensionAPI);
  return { pi, ctx, tool, event: (name: string, reason: string) => hooks.get(name)?.({ reason }, ctx),
    call: (params: unknown) => tool.execute("call", params, undefined) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  getProcessScheduler().stopAll();
});
afterEach(() => {
  getProcessScheduler().stopAll();
  for (const item of schedulers.splice(0)) item.stopAll();
  vi.useRealTimers();
});

describe("one-shot scheduler", () => {
  it("fires once in time order, drops delivered jobs, and cancels by prefix", async () => {
    const s = scheduler();
    const delivery = vi.fn();
    s.bind(delivery, vi.fn());
    s.create("2m", "second");
    const cancelled = s.create("30s", "cancelled");
    s.create("1m", "first");
    s.cancel(cancelled.id.slice(0, 8));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(delivery.mock.calls).toEqual([["first"]]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(delivery.mock.calls).toEqual([["first"], ["second"]]);
    expect(s.list()).toEqual([]);
    expect(() => s.cancel(cancelled.id)).toThrow("cannot be recalled");
  });

  it("chunks delays exceeding Node's timeout limit instead of firing early", async () => {
    const s = scheduler();
    const delivery = vi.fn();
    s.bind(delivery, vi.fn());
    s.create("30d", "later");
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(delivery).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30 * 86_400_000 - 2_147_483_647);
    expect(delivery).toHaveBeenCalledExactlyOnceWith("later");
  });

  it("retains due work across an unbound gap, never using the old delivery", async () => {
    const s = scheduler();
    const old = vi.fn();
    s.bind(old, vi.fn());
    s.create("1s", "next session");
    s.unbind(old);
    await vi.advanceTimersByTimeAsync(2000);
    const fresh = vi.fn();
    s.bind(fresh, vi.fn());
    expect(fresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(old).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledExactlyOnceWith("next session");
  });

  it("keeps delivery errors inspectable, without retries or footer warnings", async () => {
    const s = scheduler();
    const delivery = vi.fn(() => { throw new Error("unavailable"); });
    s.bind(delivery, vi.fn());
    const job = s.create("1s", "work");
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.list()[0].error).toContain("unavailable");
    expect(formatScheduleFooterStatus(s.list())).toBeUndefined();
    s.bind(delivery, vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(delivery).toHaveBeenCalledOnce();
    s.cancel(job.id);
    expect(s.list()).toEqual([]);
  });

  it("validates durations, timestamps, prompts, ids, and capacity", () => {
    const s = scheduler();
    expect(parseAtTime("2h")).toBe(Date.now() + 7_200_000);
    expect(parseAtTime("2026-09-06T15:00:00+02:00")).toBe(Date.parse("2026-09-06T13:00:00Z"));
    for (const when of ["0s", "-1m", "tomorrow", "999999999999999999d", "2020-01-01T00:00:00Z", "2026-99-99T00:00:00Z"]) {
      expect(() => s.create(when, "work")).toThrow();
    }
    for (const prompt of ["", "  ", " /commit", "x".repeat(4001)]) expect(() => s.create("1m", prompt)).toThrow();
    expect(() => s.cancel("")).toThrow();
    for (let i = 0; i < 64; i++) s.create("1m", "work");
    expect(() => s.create("1m", "overflow")).toThrow("limit");
  });
});

describe("schedule tool", () => {
  it.each(["new", "resume", "reload", "fork"])("survives %s with follow-up delivery into the active session", async reason => {
    const first = harness();
    first.event("session_start", "startup");
    expect(first.pi.registerCommand).not.toHaveBeenCalled();
    expect(first.tool.parameters.properties.action.enum).toEqual(["create_at", "list", "cancel"]);
    await first.call({ action: "create_at", when: "1s", prompt: "continue" });
    first.event("session_shutdown", reason);
    vi.resetModules();
    const reloaded = await import("../lib/process-scheduler.ts");
    expect(reloaded.getProcessScheduler()).toBe(getProcessScheduler());
    const second = harness();
    second.event("session_start", reason);
    await vi.advanceTimersByTimeAsync(1000);
    expect(first.pi.sendUserMessage).not.toHaveBeenCalled();
    expect(second.pi.sendUserMessage).toHaveBeenCalledExactlyOnceWith("continue", { deliverAs: "followUp" });
    expect(second.ctx.ui.setStatus).toHaveBeenLastCalledWith("schedule", undefined);
  });

  it("lists/cancels jobs and only publishes the earliest injection time", async () => {
    const h = harness();
    h.event("session_start", "startup");
    expect(h.ctx.ui.setStatus).toHaveBeenLastCalledWith("schedule", undefined);
    await h.call({ action: "create_at", when: "2h", prompt: "later" });
    await h.call({ action: "create_at", when: "1m", prompt: "earlier" });
    const [first] = getProcessScheduler().list();
    expect(h.ctx.ui.setStatus).toHaveBeenLastCalledWith("schedule", formatScheduleFooterStatus([first]));
    expect((await h.call({ action: "list" })).content[0].text).toContain(first.id.slice(0, 8));
    await h.call({ action: "cancel", id: first.id });
    expect(h.ctx.ui.setStatus).toHaveBeenLastCalledWith("schedule", formatScheduleFooterStatus(getProcessScheduler().list()));
    h.event("session_shutdown", "quit");
    expect(getProcessScheduler().list()).toEqual([]);
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(h.pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("shows concise local times, short cancellation ids, and marked previews", async () => {
    const h = harness();
    const result = await h.call({ action: "create_at", when: "1m", prompt: "Check pipeline\n" + "x".repeat(90) });
    const [job] = getProcessScheduler().list();
    const localTime = new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(job.runAt));
    const summary = `${localTime} [${job.id.slice(0, 8)}]\n  Check pipeline ${"x".repeat(64)}…`;
    expect(result.content[0].text).toBe(`Scheduled for ${summary}\nRequires Pi to stay open.`);
    expect((await h.call({ action: "list" })).content[0].text).toBe(summary);
    expect((await h.call({ action: "cancel", id: job.id.slice(0, 8) })).content[0].text).toBe(`Cancelled: ${summary}`);
    expect((await h.call({ action: "list" })).content[0].text).toBe("No scheduled reminders.");
  });

  it("throws normal Pi tool errors for missing/invalid inputs", async () => {
    const h = harness();
    await expect(h.call({ action: "create_at" })).rejects.toThrow("requires");
    await expect(h.call({ action: "cancel" })).rejects.toThrow("requires");
    await expect(h.call({ action: "create_cron" })).rejects.toThrow("Unknown");
    await expect(h.call({ action: "create_at", when: "1m", prompt: "/commit" })).rejects.toThrow("slash");
  });
});
