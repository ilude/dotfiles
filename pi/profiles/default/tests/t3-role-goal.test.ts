import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createT3GoalBackend, captureT3RoleGoal, clearT3RoleWork, gateT3GoalStream } from "../lib/subagents/t3/goal.ts";
import { createHandoffStore } from "../lib/subagents/t3/handoffs.ts";
import { resolveRoleSnapshot } from "../lib/subagents/authority.ts";
import type { T3MetadataClient } from "../lib/subagents/t3/context.ts";
import type { RoleGoalScope, T3RoleHandoff, T3ThreadIdentity } from "../lib/subagents/t3/contracts.ts";
import { GoalRuntime } from "../lib/goal/runtime.ts";
import { GOAL_ENTRY_TYPE } from "../lib/goal/contract.ts";
import { captureGoalBudgetBaseline, evaluateGoalBudget } from "../lib/goal/budget.ts";
import { readGoalUsage } from "../lib/goal/usage.ts";
import { appendRecord, makeRecord } from "../lib/bedrock/ledger.ts";
import { notifyGoalAccounting } from "../lib/bedrock/goal-notification.ts";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); });
function harness(identity: T3ThreadIdentity, file: string, id: string) {
  const handlers = new Map<string, Array<(event: never, ctx: ExtensionContext) => unknown>>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const pi = {
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
    events: {
      on(name: string, listener: (value: unknown) => void) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); return () => { set.delete(listener); }; },
      emit(name: string, value: unknown) { for (const listener of listeners.get(name) ?? []) listener(value); },
    },
  } as unknown as ExtensionAPI;
  const ctx = { cwd: identity.cwd, abort: vi.fn(), sessionManager: { getSessionId: () => id, getSessionFile: () => file }, ui: { notify: vi.fn() } } as unknown as ExtensionToolContext;
  return { pi, ctx, async emit(name: string, event: object = {}) { const results = []; for (const handler of handlers.get(name) ?? []) results.push(await handler(event as never, ctx)); return results; } };
}
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "t3-role-goal-")); cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const profile = join(root, "profile"), cwd = join(root, "project"), ledger = join(root, "ledger.jsonl");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(cwd); writeFileSync(ledger, "");
  writeFileSync(join(profile, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Review\ntools: [read]\nmodel: openai/luna\n---\nReview only.");
  const snapshot = resolveRoleSnapshot({ agent: "reviewer", backend: "t3", profile, cwd, projectTrusted: false });
  const store = createHandoffStore(profile);
  const owner = harness({ threadId: "parent", cwd }, join(root, "owner.jsonl"), "owner");
  const cancel = vi.fn(async () => true), roleLaunch = vi.fn(async () => ({ taskId: "real-task", status: "running" }));
  function client(threadId: string, parentThreadId?: string): T3MetadataClient {
    return { capabilities: async () => ({}), currentThread: async () => ({ threadId, parentThreadId, cwd }), thread: async () => ({}), roleLaunch, cancelOwnedRole: cancel, cancelOwnedLaunch: cancel };
  }
  const backend = createT3GoalBackend(owner.pi, { store, metadata: () => client("parent") }); cleanup.push(() => backend.close()); await backend.restore(owner.ctx);
  const entries: unknown[] = [];
  let runtime: GoalRuntime;
  runtime = new GoalRuntime({ persistState: state => entries.push({ type: "custom", customType: GOAL_ENTRY_TYPE, data: state }), persistRuntime: data => entries.push({ type: "custom", customType: "goal-runtime", data: structuredClone(data) }),
    admit: async (state, data) => {
      const usage = await readGoalUsage({ ledgerFile: ledger, signal: new AbortController().signal, attribution: { runId: state.runId, launchedAt: Date.parse(state.startedAt), complete: data.attributionComplete, sessions: data.sessions.map(row => ({ session: row.session, from: Date.parse(row.from), until: row.until ? Date.parse(row.until) : undefined })) } });
      if (!data.baseline) runtime.setBaseline(captureGoalBudgetBaseline(state.budget, usage));
      const result = evaluateGoalBudget(state.budget, data.baseline as ReturnType<typeof captureGoalBudgetBaseline>, usage);
      return { allowed: result.decision === "continue", reason: result.reasons.join(" ") };
    }, stopDescendants: runId => backend.stopGoal("owner", runId),
  });
  runtime.start("owner", owner.ctx.sessionManager.getSessionFile()!, { goal: "Fix compiler", scope: [], exclusions: [], decisions: [] }, { bedrockUsd: 1 });
  const accounting = vi.fn(async (event: unknown) => { const value = event as { persisted: boolean }; if (!value.persisted) await runtime.unavailable("Ledger unavailable"); });
  const binding = { runId: runtime.state!.runId, capture: () => runtime.state?.outcome === "running", admit: () => runtime.admit(), enroll: (file: string) => runtime.enroll(file), accounting };
  await backend.bindGoal("owner", binding);
  const goal = await captureT3RoleGoal(owner.pi, owner.ctx, "first");
  expect(goal).toBeDefined();
  async function launch(launchId: string, parentThreadId: string, threadId: string, scope: RoleGoalScope | null | undefined = goal) {
    const handoff: T3RoleHandoff = { version: 1, launchId, snapshot, commissioner: { threadId: parentThreadId, runId: "t3-run", piSessionId: parentThreadId === "parent" ? "owner" : "child-session", piSessionFile: join(root, `${parentThreadId}.jsonl`), profile, cwd }, assignment: "Review", workspace: { isolation: "shared", commissioningCwd: cwd }, goal: scope ?? undefined, taskTitle: `Review [pi-role:${launchId}]` };
    await store.create(handoff);
    await store.claim(launchId, { identity: { threadId, parentThreadId, cwd }, profile, cwd, actualParentThreadId: parentThreadId });
    const h = harness({ threadId, parentThreadId, cwd }, join(root, `${threadId}.jsonl`), `${threadId}-session`);
    const b = createT3GoalBackend(h.pi, { store, metadata: () => client(threadId, parentThreadId) }); cleanup.push(() => b.close()); await b.restore(h.ctx);
    return { ...h, backend: b, handoff };
  }
  return { root, ledger, owner, backend, runtime, store, binding, goal: goal!, accounting, cancel, roleLaunch, launch, entries };
}

describe("T3 role goal scope and canonical accounting", () => {
  it("enrolls real child/nested session files before requests and accounts exact response IDs once", async () => {
    const f = await fixture(), child = await f.launch("first", "parent", "child");
    expect(f.runtime.data!.sessions).toHaveLength(1);
    await child.emit("turn_start");
    expect(child.ctx.abort).not.toHaveBeenCalled();
    expect(f.runtime.data!.sessions.map(row => row.session)).toContain(child.ctx.sessionManager.getSessionFile());
    const nested = await captureT3RoleGoal(child.pi, child.ctx, "nested", f.goal);
    expect(nested).toEqual(f.goal);
    const grandchild = await f.launch("nested", "child", "grandchild", nested);
    await grandchild.emit("turn_start");
    const file = grandchild.ctx.sessionManager.getSessionFile()!;
    expect(f.runtime.data!.sessions.map(row => row.session)).toContain(file);
    const record = makeRecord({ session: file, provider: "amazon-bedrock", model: "anthropic.claude-haiku-4-5", timestamp: Date.now(), usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 } });
    expect(await appendRecord(record, f.ledger)).toBe(true);
    expect(await appendRecord(record, f.ledger)).toBe(false);
    await notifyGoalAccounting(grandchild.pi, { record, message: {}, persisted: true });
    await notifyGoalAccounting(grandchild.pi, { record, message: {}, persisted: true });
    const usage = await readGoalUsage({ ledgerFile: f.ledger, signal: new AbortController().signal, attribution: { runId: f.goal.runId, launchedAt: Date.parse(f.runtime.state!.startedAt), complete: true, sessions: [{ session: file, from: 0 }] } });
    expect(usage.bedrock).toMatchObject({ status: "available", responses: 1 });
    await grandchild.emit("turn_start");
    expect(grandchild.ctx.abort).toHaveBeenCalled();
    expect(f.runtime.state?.outcome).toBe("budget");
    await f.runtime.waitForStops();
    expect(f.cancel).toHaveBeenCalledWith(child.handoff);
    expect(f.cancel).not.toHaveBeenCalledWith(grandchild.handoff);
  });
  it("blocks missing admission and enrollment after owner reload without cancelling as a reload side effect", async () => {
    const f = await fixture(), child = await f.launch("first", "parent", "child");
    await child.emit("turn_start");
    const preserved = f.runtime.data!.sessions.find(row => row.session === child.ctx.sessionManager.getSessionFile())!;
    const branch = [{ type: "custom", customType: GOAL_ENTRY_TYPE, data: f.runtime.state }, { type: "custom", customType: "goal-runtime", data: structuredClone(f.runtime.data) }];
    f.runtime.restore(branch, "owner", { stopDescendants: false });
    await f.runtime.waitForStops();
    expect(f.runtime.state!.outcome).toBe("interrupted");
    expect(f.runtime.data!.sessions.find(row => row.session === preserved.session)?.until).toBeUndefined();
    expect(f.cancel).not.toHaveBeenCalled();
    await child.emit("turn_start"); expect(child.ctx.abort).toHaveBeenCalled(); expect(f.cancel).not.toHaveBeenCalled();
    await f.backend.close();
    await expect(captureT3RoleGoal(child.pi, child.ctx, "second", f.goal)).rejects.toThrow("unavailable");
  });
  it("reconnects a retained child to the resumed owner's replacement authenticated endpoint", async () => {
    const f = await fixture(), child = await f.launch("first", "parent", "child");
    await child.emit("turn_start");
    await f.backend.close();
    const replacement = createT3GoalBackend(f.owner.pi, { store: f.store, metadata: () => ({ capabilities: async () => ({}), currentThread: async () => ({ threadId: "parent", cwd: f.owner.ctx.cwd }), thread: async () => ({}), roleLaunch: f.roleLaunch, cancelOwnedRole: f.cancel, cancelOwnedLaunch: f.cancel }) });
    cleanup.push(() => replacement.close());
    await replacement.restore(f.owner.ctx);
    await replacement.bindGoal("owner", f.binding);
    await child.emit("turn_start");
    expect(child.ctx.abort).not.toHaveBeenCalled();
  });
  it("keeps unavailable finalized accounting canonical and blocks later child requests", async () => {
    const f = await fixture(), child = await f.launch("first", "parent", "child");
    await child.emit("turn_start");
    const file = child.ctx.sessionManager.getSessionFile()!;
    const record = makeRecord({ session: file, provider: "amazon-bedrock", model: "anthropic.claude-haiku-4-5", timestamp: Date.now(), usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 } });
    await notifyGoalAccounting(child.pi, { record, message: {}, persisted: false });
    expect(f.runtime.data!.attributionComplete).toBe(false);
    expect(f.runtime.state!.outcome).toBe("budget");
    await child.emit("turn_start");
    expect(child.ctx.abort).toHaveBeenCalled();
    await f.runtime.waitForStops();
  });
  it("discovers blocking work before receipts, respects scope, and distinguishes clear from reload", async () => {
    const f = await fixture(), child = await f.launch("first", "parent", "child");
    const other = await f.launch("outside", "parent", "outside-child", null);
    // No ownership receipt exists for the blocking delegation.
    expect(await f.store.receipts("parent")).toEqual([]);
    expect(await f.backend.goalActive("owner", f.goal.runId)).toBe(true);
    await f.runtime.halt("interrupted", "Paused by user");
    expect(f.cancel).toHaveBeenCalledWith(child.handoff);
    expect(f.cancel).not.toHaveBeenCalledWith(other.handoff);
    f.cancel.mockClear();
    await f.backend.restore(f.owner.ctx); expect(f.cancel).not.toHaveBeenCalled();
    await clearT3RoleWork(f.owner.pi, f.owner.ctx);
    expect(f.cancel).toHaveBeenCalledWith(child.handoff); expect(f.cancel).toHaveBeenCalledWith(other.handoff);
  });
  it("uses canonical activity plus in-flight calls, not stale unaccepted handoffs, to decide completion", async () => {
    const f = await fixture(); await f.launch("first", "parent", "child");
    f.roleLaunch.mockResolvedValue({ taskId: "real-task", status: "completed" });
    expect(await f.backend.goalActive("owner", f.goal.runId)).toBe(false);
    await f.owner.emit("tool_call", { toolName: "t3_delegate_role", toolCallId: "pending-launch" });
    expect(await f.backend.goalActive("owner", f.goal.runId)).toBe(true);
    await f.owner.emit("tool_execution_end", { toolCallId: "pending-launch" });
    expect(await f.backend.goalActive("owner", f.goal.runId)).toBe(false);
    f.roleLaunch.mockResolvedValue({ taskId: "real-task", status: "future-unknown" });
    expect(await f.backend.goalActive("owner", f.goal.runId)).toBe(true);
  });
  it("gates each helper attempt before provider stream creation and preserves its final response", async () => {
    const f = await fixture(), child = await f.launch("first", "parent", "child");
    const message: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "Summary" }], provider: "fixture", model: "fixture", api: "openai-completions", timestamp: Date.now(), stopReason: "stop", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    const start = vi.fn(() => { const stream = createAssistantMessageEventStream(); stream.push({ type: "done", reason: "stop", message }); return stream; });
    expect(await gateT3GoalStream(child.pi, child.ctx, start).result()).toBe(message);
    expect(start).toHaveBeenCalledTimes(1);
    await f.runtime.halt("interrupted", "User paused");
    await expect(gateT3GoalStream(child.pi, child.ctx, start).result()).rejects.toThrow("User paused");
    expect(start).toHaveBeenCalledTimes(1);
  });
});
