import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { SubagentRuntime, type GoalBinding } from "../lib/subagents/runtime.ts";
import { RpcChild } from "../lib/subagents/rpc.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
import { childLaunch } from "../lib/subagents/launch.ts";
import { GoalRuntime, GOAL_RUNTIME_ENTRY, type GoalAdmission } from "../lib/goal/runtime.ts";
import { GOAL_ENTRY_TYPE } from "../lib/goal/contract.ts";

function fixture() {
  const branch: unknown[] = [];
  const admission = vi.fn(async (): Promise<GoalAdmission> => ({ allowed: true }));
  const stop = vi.fn(async () => {});
  const options = {
    persistState: (data: unknown) => { branch.push({ type: "custom", customType: GOAL_ENTRY_TYPE, data: structuredClone(data) }); },
    persistRuntime: (data: unknown) => { branch.push({ type: "custom", customType: GOAL_RUNTIME_ENTRY, data: structuredClone(data) }); },
    admit: admission,
    stopDescendants: stop,
  };
  const runtime = new GoalRuntime(options);
  runtime.start("owner", "owner.jsonl", { goal: "Fix the build", scope: ["compiler"], exclusions: ["deployment"], decisions: [] }, {});
  return { runtime, options, branch, admission, stop };
}
describe("goal runtime", () => {
  it("continues healthy stops with or without a checkpoint until an explicit outcome", async () => {
    const { runtime } = fixture();
    expect(await runtime.settle("completed", true)).toBe(true);
    runtime.control({ action: "checkpoint", summary: "Compiler fixed; run its existing checks" });
    expect(await runtime.settle("completed", true)).toBe(true);
    expect(await runtime.settle("completed", true)).toBe(true);
    expect(runtime.state?.outcome).toBe("running");
    runtime.control({ action: "complete", summary: "Existing checks pass" });
    expect(await runtime.settle("completed", true)).toBe(false);
  });
  it.each(["question", "blocker", "complete", "pause"] as const)("does not continue after %s", async action => {
    const { runtime, admission } = fixture();
    runtime.control({ action, summary: "Concrete evidence" });
    expect(await runtime.settle("completed", true)).toBe(false);
    expect(admission).not.toHaveBeenCalled();
  });
  it.each(["aborted", "error"] as const)("does not spin after %s", async outcome => {
    const { runtime, admission } = fixture();
    runtime.control({ action: "checkpoint", summary: "Progress" });
    expect(await runtime.settle(outcome, true)).toBe(false);
    expect(runtime.state?.outcome).toBe("interrupted");
    expect(admission).not.toHaveBeenCalled();
  });
  it("resumes a question from user text, preserving exact authority and separating notes", () => {
    const { runtime } = fixture();
    runtime.control({ action: "question", summary: "Change target?", findings: ["Optional discovery: rewrite deployment"] });
    expect(runtime.state?.authority.exclusions).toEqual(["deployment"]);
    runtime.userInstruction("No, keep the compiler target.");
    expect(runtime.state?.outcome).toBe("running");
    expect(runtime.state?.authority.decisions).toEqual(["No, keep the compiler target."]);
    expect(runtime.state?.authority.scope).toEqual(["compiler"]);
  });
  it("does not silently resume a user pause or revise its authority on unrelated chat", () => {
    const { runtime } = fixture();
    runtime.control({ action: "pause", summary: "Wait for maintenance" });
    runtime.userInstruction("What time is it?");
    expect(runtime.state?.outcome).toBe("interrupted");
    expect(runtime.state?.authority.decisions).toEqual([]);
    runtime.resume("Use compiler v2 instead.");
    expect(runtime.state?.outcome).toBe("running");
    expect(runtime.state?.authority.decisions).toEqual(["Use compiler v2 instead."]);
  });
  it("pauses and stops descendants on unavailable usage before another checkpoint", async () => {
    const { runtime, admission, stop } = fixture();
    admission.mockResolvedValue({ allowed: false, reason: "Accounting did not persist" });
    runtime.control({ action: "checkpoint", summary: "Next build step" });
    expect(await runtime.settle("completed", true)).toBe(false);
    expect(runtime.state?.outcome).toBe("budget");
    expect(stop).toHaveBeenCalledWith(runtime.state?.runId);
    expect(await runtime.admit()).toMatchObject({ allowed: false });
    expect(admission).toHaveBeenCalledTimes(1);
  });
  it("pauses only the goal and keeps descendant enrollment open until cancellation/accounting settles", async () => {
    const { runtime, stop } = fixture();
    let finish!: () => void;
    stop.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    runtime.enroll("child.jsonl");
    runtime.control({ action: "question", summary: "Choose target compiler?" });
    expect(runtime.state?.outcome).toBe("question");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(runtime.data?.sessions.find(s => s.session === "owner.jsonl")?.until).toBeDefined();
    expect(runtime.data?.sessions.find(s => s.session === "child.jsonl")?.until).toBeUndefined();
    finish();
    await runtime.waitForStops();
    expect(runtime.data?.sessions.find(s => s.session === "child.jsonl")?.until).toBeDefined();
  });
  it("keeps only current model checkpoint notes while preserving user decisions", () => {
    const { runtime } = fixture();
    runtime.userInstruction("Do not deploy");
    for (let i = 0; i < 20; i++) runtime.control({ action: "checkpoint", summary: `Progress ${i}`, findings: [`Finding ${i}`] });
    expect(runtime.state?.operational).toEqual({ notes: ["Progress 19"], findings: ["Finding 19"] });
    expect(runtime.state?.authority.decisions).toEqual(["Do not deploy"]);
  });
  it("closes attribution while paused and opens a new exact enrollment on resume", () => {
    const { runtime } = fixture();
    runtime.pause("interrupted", "User pause");
    expect(runtime.data?.sessions[0].until).toBeDefined();
    runtime.resume(undefined, true);
    runtime.enroll("owner.jsonl");
    expect(runtime.data?.sessions).toHaveLength(2);
    expect(runtime.data?.sessions[1].until).toBeUndefined();
    expect(runtime.data?.restoringBuildability).toBe(true);
  });
  it("restores native state after compaction without auto-starting and rejects independent branch ownership", () => {
    const { runtime, branch, options } = fixture();
    const runId = runtime.state?.runId;
    runtime.setBaseline({ capturedAt: 123, immutable: true });
    runtime.enroll("child.jsonl", "2026-06-01T12:00:00.000Z");
    branch.push({ type: "compaction", summary: "Invented goal: deploy everything" });
    const restored = new GoalRuntime(options);
    restored.restore(branch, "owner");
    expect(restored.state?.outcome).toBe("interrupted");
    expect(restored.state?.authority.goal).toBe("Fix the build");
    restored.resume();
    expect(restored.state?.runId).toBe(runId);
    expect(restored.data?.baseline).toEqual({ capturedAt: 123, immutable: true });
    expect(restored.data?.sessions.map(s => s.session)).toEqual(["owner.jsonl", "child.jsonl"]);
    expect(() => restored.setBaseline({ capturedAt: 456 })).toThrow("immutable");
    const fork = new GoalRuntime(options);
    fork.restore(branch, "independent");
    expect(fork.state).toBeUndefined();
  });
});

const owners: SubagentRuntime[] = [];
afterEach(async () => {
  await Promise.all(owners.splice(0).map(owner => owner.shutdown("quit")));
  vi.restoreAllMocks();
});
const here = dirname(fileURLToPath(import.meta.url));
const profile = join(here, "..");
const probe: AgentDefinition = { name: "probe", description: "probe", tools: [], delegates: [], skills: [], prompt: "probe", source: "profile", filePath: "probe.md" };
function dispatch(runtime: SubagentRuntime, child: string, message: { type: string; payload?: unknown }): Promise<unknown> {
  // Exercise the authenticated dispatch boundary without spawning a model process.
  const endpoint = runtime as unknown as { dispatch(identity: { child: string; origin: string; run: string }, message: { type: string; payload?: unknown }, signal: AbortSignal): Promise<unknown> };
  return endpoint.dispatch({ child, origin: "origin", run: "test" }, message, new AbortController().signal);
}
function descendantFixture() {
  vi.spyOn(RpcChild.prototype, "start").mockImplementation(async function (this: RpcChild) { this.record.processState = "exited"; return this.snapshot(); });
  vi.spyOn(RpcChild.prototype, "command").mockResolvedValue({ success: true });
  const owner = new SubagentRuntime(); owners.push(owner);
  const admission = vi.fn(async (): Promise<GoalAdmission> => ({ allowed: true }));
  const enroll = vi.fn(), accounting = vi.fn(async () => {});
  let capture = true;
  const binding: GoalBinding = { runId: "goal-run", capture: () => capture, admit: admission, enroll, accounting };
  owner.bindGoal("origin", binding);
  const input = { definition: probe, instructions: "Hold", cwd: here, model: "openai/test", effort: "low" as const, skills: [], origin: "origin", retained: false, surface: "headless" as const };
  const launch = (overrides: Partial<typeof input> = {}) => owner.launch({ ...input, ...overrides }, profile, join(profile, "extensions/subagent-child.ts"), true);
  return { owner, input, launch, admission, enroll, accounting, binding, unclaimed: () => { capture = false; }, claim: () => { capture = true; } };
}
describe("goal descendant admission and attribution", () => {
  it("claims only new owned launches and stops scoped descendants rather than counting them", async () => {
    const f = descendantFixture();
    const owned = await f.launch();
    f.unclaimed();
    const unrelated = await f.launch();
    expect(f.admission).toHaveBeenCalledTimes(1);
    expect(f.owner.goalActive("origin", "goal-run")).toBe(true);
    await f.owner.stopGoal("origin", "goal-run");
    expect(f.owner.get(owned.id).record.status).toBe("settled");
    expect(f.owner.get(unrelated.id).record.status).toBe("running");
  });
  it("enrolls exact identity and routes each descendant admission/accounting through its owner", async () => {
    const f = descendantFixture();
    const child = await f.launch();
    await dispatch(f.owner, child.id, { type: "session-identity", payload: { sessionId: "child-session", sessionFile: "exact-child.jsonl" } });
    expect(f.enroll).toHaveBeenCalledWith("exact-child.jsonl");
    expect(await dispatch(f.owner, child.id, { type: "goal-admit" })).toEqual({ allowed: true });
    const event = { type: "goal-accounting", runId: "goal-run", session: "exact-child.jsonl", recordId: "response", timestamp: Date.now(), persisted: false };
    await dispatch(f.owner, child.id, { type: "goal-accounting", payload: event });
    expect(f.accounting).toHaveBeenCalledWith(event);
    await expect(dispatch(f.owner, child.id, { type: "goal-accounting", payload: { ...event, session: "ancestor.jsonl" } })).rejects.toThrow("mismatch");
    f.admission.mockResolvedValue({ allowed: false, reason: "Quota reached" });
    expect(await dispatch(f.owner, child.id, { type: "goal-admit" })).toEqual({ allowed: false, reason: "Quota reached" });
  });
  it("inherits the same run for grandchildren even when new root launches are unclaimed", async () => {
    const f = descendantFixture();
    const coordinator = { ...probe, name: "teamlead", tools: ["subagent"], delegates: ["probe"] };
    const parent = await f.owner.launch({ ...f.input, definition: coordinator, catalog: new Map([["teamlead", coordinator], ["probe", probe]]) }, profile, join(profile, "extensions/subagent-child.ts"), true);
    await dispatch(f.owner, parent.id, { type: "session-identity", payload: { sessionId: "coordinator-session", sessionFile: "coordinator.jsonl" } });
    f.unclaimed();
    await f.owner.launch({ ...f.input, parentId: parent.id }, profile, join(profile, "extensions/subagent-child.ts"), true);
    expect(f.admission).toHaveBeenCalledTimes(2);
    f.admission.mockResolvedValue({ allowed: false, reason: "No headroom" });
    await expect(f.owner.launch({ ...f.input, parentId: parent.id }, profile, join(profile, "extensions/subagent-child.ts"), true)).rejects.toThrow("No headroom");
  });
  it("rejects active pre-goal exchanges but adopts only a closed child's new goal exchange", async () => {
    const f = descendantFixture(), dir = mkdtempSync(join(tmpdir(), "goal-reopen-"));
    try {
      f.unclaimed();
      const old = await f.launch();
      f.claim();
      await expect(f.owner.message(old.id, "origin", "New goal work")).rejects.toThrow("active pre-goal exchange");
      expect(() => f.owner.assertGoalControl(old.id, "origin", "answer")).toThrow("active pre-goal exchange");
      expect(f.enroll).not.toHaveBeenCalled();
      const child = f.owner.get(old.id), sessionFile = join(dir, "old-session.jsonl");
      writeFileSync(sessionFile, "");
      child.record.status = "settled"; child.record.phase = "settled"; child.record.sessionFile = sessionFile;
      child.record.cleanup = { attempted: true, attempts: 1, complete: true, process: "closed", pane: "not-applicable", launcher: "not-applicable", errors: [] };
      await child.finish();
      await f.owner.message(old.id, "origin", "New goal work");
      expect(f.enroll).toHaveBeenCalledWith(sessionFile);
      expect(f.owner.goalActive("origin", "goal-run")).toBe(true);
      expect(f.admission).toHaveBeenCalledTimes(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("reports exact fulfilled cancellation failures instead of claiming the goal stopped", async () => {
    const f = descendantFixture();
    const owned = await f.launch();
    const cancel = vi.spyOn(f.owner.get(owned.id), "cancel").mockResolvedValue({ attempted: true, attempts: 1, complete: false, process: "open", pane: "not-applicable", launcher: "not-applicable", errors: ["process still running", "transport close failed"] });
    try {
      await expect(f.owner.stopGoal("origin", "goal-run")).rejects.toThrow(`${owned.id}: process still running; transport close failed`);
      expect(f.owner.goalActive("origin", "goal-run")).toBe(true);
    } finally { cancel.mockRestore(); }
  });
  it("clears inherited goal environment from unrelated launches", () => {
    const input = { definition: probe, instructions: "Hold", cwd: here, model: "openai/test", effort: "low" as const, skills: [], origin: "origin", retained: false, surface: "headless" as const };
    expect(childLaunch({ ...input, goalRunId: "goal-run" }, "child", profile).env.PI_GOAL_RUN_ID).toBe("goal-run");
    expect(childLaunch(input, "unrelated", profile).env.PI_GOAL_RUN_ID).toBe("");
  });
});
