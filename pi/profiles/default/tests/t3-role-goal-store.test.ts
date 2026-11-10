import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRoleSnapshot } from "../lib/subagents/authority.ts";
import { createHandoffStore } from "../lib/subagents/t3/handoffs.ts";
import type { RoleGoalScope, T3RoleOutcomeReport } from "../lib/subagents/t3/contracts.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "t3-goal-store-")); roots.push(root);
  const profile = join(root, "profile"), cwd = join(root, "work"), ownerFile = join(root, "owner.jsonl");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(join(profile, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Review\ntools: [read]\nmodel: openai/luna\n---\nReview only.");
  const snapshot = resolveRoleSnapshot({ agent: "reviewer", backend: "t3", profile, cwd, projectTrusted: false });
  const scope: RoleGoalScope = { runId: "goal-run", ownerSessionId: "owner", ownerSessionFile: ownerFile };
  const handoff = (launchId: string, goal: RoleGoalScope = scope) => ({ version: 1, launchId, snapshot, commissioner: { threadId: "parent", runId: "commissioning", piSessionId: "session", piSessionFile: ownerFile, profile, cwd }, assignment: "review", taskTitle: `title-${launchId}`, workspace: { isolation: "shared", commissioningCwd: cwd }, goal });
  return { root, profile, cwd, ownerFile, scope, handoff, store: createHandoffStore(profile) };
}

describe("T3 role goal metadata store", () => {
  it("replaces only the scoped private endpoint and rejects conflicting owner paths", async () => {
    const s = setup(), first = { child: "c", run: "r", origin: "o", port: 4321, token: "private-one" }, replacement = { ...first, port: 4322, token: "private-two" };
    expect(await s.store.goalEndpoint(s.scope)).toBeUndefined();
    await s.store.setGoalEndpoint(s.scope, first);
    expect(await s.store.goalEndpoint(s.scope)).toEqual(first);
    await s.store.setGoalEndpoint(s.scope, replacement);
    expect(await s.store.goalEndpoint(s.scope)).toEqual(replacement);
    expect(await s.store.goalEndpoint({ ...s.scope, ownerSessionId: "different" })).toBeUndefined();
    await expect(s.store.setGoalEndpoint({ ...s.scope, ownerSessionFile: join(s.root, "other.jsonl") }, first)).rejects.toThrow("scope mismatch");
    const directory = join(s.profile, "sessions", ".t3-roles", "goal-endpoints"), files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const file = join(directory, files[0]!);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8")).toContain("private-two");
    expect(readFileSync(file, "utf8")).not.toContain("private-one");
  });

  it("projects only exact goal-scoped claimed members and pending handoffs, preserving task titles", async () => {
    const s = setup();
    await s.store.create(s.handoff("member"));
    await s.store.create(s.handoff("pending"));
    await s.store.create(s.handoff("other", { ...s.scope, runId: "another-run" }));
    const identity = { threadId: "child", parentThreadId: "parent", cwd: s.cwd };
    const binding = await s.store.claim("member", { identity, profile: s.profile, cwd: s.cwd, actualParentThreadId: "parent" });
    expect(binding.taskTitle).toBe("title-member");
    expect((await s.store.binding("child"))?.taskTitle).toBe("title-member");
    expect((await s.store.goalMembers(s.scope)).map(value => value.threadId)).toEqual(["child"]);
    expect((await s.store.goalHandoffs(s.scope)).map(value => value.launchId).sort()).toEqual(["member", "pending"]);
    expect(await s.store.goalMembers({ ...s.scope, ownerSessionId: "other" })).toEqual([]);
    expect(await s.store.goalHandoffs({ ...s.scope, ownerSessionFile: join(s.root, "other.jsonl") })).toEqual([]);
  });

  it("returns outcome appends in monotonic same-tick creation order", async () => {
    const s = setup(), clock = vi.spyOn(Date, "now").mockReturnValue(1234567890123);
    const report = (n: number): T3RoleOutcomeReport => ({ version: 1, launchId: `launch-${n}`, threadId: "child", runId: "run", taskId: `task-${n}`, roleOutcome: "completed", summary: `result-${n}` });
    await s.store.outcome(report(1)); await s.store.outcome(report(2)); await s.store.outcome(report(3));
    expect((await s.store.outcomes("child")).map(value => value.taskId)).toEqual(["task-1", "task-2", "task-3"]);
    clock.mockRestore();
  });
});
