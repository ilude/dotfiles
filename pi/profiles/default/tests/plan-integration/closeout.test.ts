import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeout, inspectCloseout } from "../../lib/plan-integration/closeout.ts";
import type { CloseoutManifest } from "../../lib/plan-integration/contracts.ts";
import { preparePlanRun } from "../../lib/plan-run.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(cwd: string, ...args: string[]): string { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function commit(cwd: string, message: string): string { git(cwd, "add", "-A"); git(cwd, "commit", "-m", message); return git(cwd, "rev-parse", "HEAD"); }
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "plan integration ")); roots.push(base);
  const root = join(base, "repo"); mkdirSync(root); git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.invalid");
  writeFileSync(join(root, ".gitignore"), "ignored.tmp\n");
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n");
  writeFileSync(join(root, "file.txt"), "one\ntwo\nthree\nfour\nfive\n");
  const archive = join(root, ".specs/archive/demo/plan.md"); mkdirSync(join(root, ".specs/archive/demo"), { recursive: true });
  writeFileSync(archive, "---\nstatus: in progress\ncompleted: null\n---\n# Demo\n\n## Tasks\n- [x] Ship\n");
  commit(root, "base"); const targetStart = git(root, "rev-parse", "HEAD");
  const taskPath = join(root, ".worktrees/task"); mkdirSync(join(root, ".worktrees"), { recursive: true });
  git(root, "worktree", "add", "-b", "task/demo", taskPath);
  writeFileSync(join(taskPath, "feature.txt"), "feature\n");
  const taskCommit = commit(taskPath, "feature implementation");
  const manifest: CloseoutManifest = { repositoryRoot: root, targetCheckout: root, targetBranch: "main", taskWorktree: taskPath, taskBranch: "task/demo", taskCommit, archivedPlanPath: ".specs/archive/demo/plan.md", activeSpecStub: "demo", targetStartingCommit: targetStart, noMerge: false, completedDate: "2026-09-26", integrationEvidence: "Manual bootstrap closeout verified." };
  return { root, taskPath, manifest, archive };
}

function preparedFixture() {
  const { root, taskPath, manifest } = fixture();
  git(root, "worktree", "remove", taskPath);
  git(root, "branch", "-D", "task/demo");
  rmSync(join(root, ".specs/archive"), { recursive: true });
  mkdirSync(join(root, ".specs/demo"));
  writeFileSync(join(root, ".specs/demo/plan.md"), "---\nstatus: in progress\n---\n# Prepared\n");
  writeFileSync(join(root, ".specs/demo/support.md"), "original support\n");
  commit(root, "active selected spec");
  writeFileSync(join(root, ".specs/demo/support.md"), "dirty carried support\n");
  writeFileSync(join(root, ".specs/demo/loose.md"), "untracked carried support\n");
  const receipt = preparePlanRun({ originCheckoutPath: root, specRelativePath: ".specs/demo/plan.md", taskWorktreePath: taskPath, taskBranch: "task/demo" });
  mkdirSync(join(taskPath, ".specs/archive"), { recursive: true });
  renameSync(join(taskPath, ".specs/demo"), join(taskPath, ".specs/archive/demo"));
  const taskCommit = commit(taskPath, "archive prepared spec");
  return { root, taskPath, manifest: { ...manifest, taskCommit, targetStartingCommit: receipt.startingTargetCommit } };
}

it("retires unchanged prepared receipt and dirty/untracked carried support before preservation", () => {
  const { root, taskPath, manifest } = preparedFixture();
  expect(existsSync(join(root, ".specs/demo/.pi-plan-run.json"))).toBe(true);
  const result = closeout(manifest, { operation: "integrate" });
  expect(result).toMatchObject({ outcome: "INTEGRATION READY", activeSpecAbsent: true, stashState: "not-needed" });
  expect(existsSync(join(root, ".specs/demo"))).toBe(false);
  expect(readFileSync(join(root, ".specs/archive/demo/support.md"), "utf8")).toBe("dirty carried support\n");
  expect(readFileSync(join(root, ".specs/archive/demo/loose.md"), "utf8")).toBe("untracked carried support\n");
  expect(git(root, "show", `${manifest.taskCommit}:.specs/archive/demo/.pi-plan-run.json`)).toContain("sourceSpecSnapshot");
  expect(git(root, "stash", "list")).toBe("");
  expect(existsSync(taskPath)).toBe(true);
  expect(closeout(manifest, { operation: "cleanup" }).outcome).toBe("COMPLETED");
}, 30_000);

for (const change of ["changed", "new", "receipt", "missing"] as const) it(`retains prepared source without merge or stash on ${change} divergence`, () => {
  const { root, manifest } = preparedFixture();
  const path = join(root, ".specs/demo", change === "receipt" ? ".pi-plan-run.json" : change === "new" ? "concurrent.md" : "support.md");
  if (change === "missing") rmSync(path);
  else writeFileSync(path, "concurrent source work\n");
  const before = git(root, "rev-parse", "HEAD");
  const result = closeout(manifest, { operation: "integrate" });
  expect(result).toMatchObject({ outcome: "USER INPUT REQUIRED", merge: "not-started", stashState: "not-needed", retainedArtifacts: [join(root, ".specs/demo")] });
  expect(result.reason).toContain(change === "receipt" ? ".pi-plan-run.json" : change === "new" ? "concurrent.md" : "support.md");
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(git(root, "stash", "list")).toBe("");
  expect(existsSync(join(root, ".specs/demo/.pi-plan-run.json"))).toBe(true);
  if (change !== "missing") expect(readFileSync(path, "utf8")).toBe("concurrent source work\n");
}, 30_000);

it("retires staged task-owned support through ordinary Git deletion without restoration", () => {
  const { root, manifest } = preparedFixture();
  git(root, "add", "--", ".specs/demo/support.md", ".specs/demo/loose.md");
  const result = closeout(manifest, { operation: "integrate" });
  expect(result).toMatchObject({ outcome: "INTEGRATION READY", stashState: "not-needed", activeSpecAbsent: true });
  expect(git(root, "status", "--porcelain=v1")).toBe("");
}, 30_000);

it("preserves divergent staged source content even when working bytes still match preparation", () => {
  const { root, manifest } = preparedFixture();
  const support = join(root, ".specs/demo/support.md");
  writeFileSync(support, "concurrent staged work\n");
  git(root, "add", "--", ".specs/demo/support.md");
  writeFileSync(support, "dirty carried support\n");
  const result = closeout(manifest);
  expect(result.outcome).toBe("USER INPUT REQUIRED");
  expect(result.reason).toContain(".specs/demo/support.md has divergent staged content");
  expect(git(root, "show", ":.specs/demo/support.md")).toBe("concurrent staged work");
  expect(readFileSync(support, "utf8")).toBe("dirty carried support\n");
  expect(git(root, "stash", "list")).toBe("");
}, 30_000);

it("does not consume prepared source using a receipt from outside exact taskCommit", () => {
  const { root, taskPath, manifest } = preparedFixture();
  rmSync(join(taskPath, ".specs/archive/demo/.pi-plan-run.json"));
  const taskCommit = commit(taskPath, "omit receipt from task commit");
  const result = closeout({ ...manifest, taskCommit });
  expect(result).toMatchObject({ outcome: "USER INPUT REQUIRED", merge: "not-started" });
  expect(result.reason).toContain("has no archived record in exact taskCommit");
  expect(existsSync(join(root, ".specs/demo/.pi-plan-run.json"))).toBe(true);
  expect(readFileSync(join(root, ".specs/demo/support.md"), "utf8")).toBe("dirty carried support\n");
}, 30_000);

it("leaves prepared source receipt and supporting files unchanged under noMerge", () => {
  const { root, manifest } = preparedFixture();
  const before = git(root, "status", "--porcelain=v1", "--untracked-files=all");
  const receipt = readFileSync(join(root, ".specs/demo/.pi-plan-run.json"), "utf8");
  expect(closeout({ ...manifest, noMerge: true }).outcome).toBe("USER INPUT REQUIRED");
  expect(git(root, "status", "--porcelain=v1", "--untracked-files=all")).toBe(before);
  expect(readFileSync(join(root, ".specs/demo/.pi-plan-run.json"), "utf8")).toBe(receipt);
}, 30_000);

it("resolves unique abbreviated task and starting commits", () => {
  const { manifest } = fixture();
  const inspection = inspectCloseout({ ...manifest, taskCommit: manifest.taskCommit.slice(0, 7), targetStartingCommit: manifest.targetStartingCommit!.slice(0, 7) });
  expect(inspection.taskCommit).toBe(manifest.taskCommit);
});

it("reports missing camelCase manifest fields before using paths", () => {
  expect(() => inspectCloseout({ task_commit: "abcdef0" } as unknown as CloseoutManifest)).toThrow(/camelCase fields: repositoryRoot, targetCheckout/);
});

it("completes a clean target, commits only completion metadata, and removes the worktree but retains its branch", () => {
  const { root, taskPath, manifest, archive } = fixture();
  const result = closeout(manifest);
  expect(result).toMatchObject({ outcome: "COMPLETED", merge: "merged", metadata: "committed", worktree: "deregistered", archivedPlanVerified: true, activeSpecAbsent: true });
  expect(existsSync(taskPath)).toBe(false);
  expect(git(root, "show-ref", "--verify", "refs/heads/task/demo")).toContain(manifest.taskCommit);
  expect(readFileSync(archive, "utf8")).toContain("status: completed\ncompleted: 2026-09-26");
  expect(git(root, "log", "-2", "--format=%s")).toContain(`docs(plan): record demo integration`);
}, 30_000);

it("stages verified delivery before later bounded cleanup through the canonical entrypoint", () => {
  const { root, taskPath, manifest, archive } = fixture();
  const helper = resolve("scripts/plan-integration.mjs");
  const authority = {
    id: "child", agent: "integrator", delegates: [], cwd: root,
    closeout: { manifest, provenance: { source: "subagent-runtime", version: 1, agent: "integrator", childId: "child", parentSessionId: "parent", targetCheckout: root } },
  };
  const invoke = (operation: string) => JSON.parse(execFileSync(process.execPath, [helper, operation], {
    cwd: root, encoding: "utf8", env: { ...process.env, PI_SUBAGENT_AUTHORITY: JSON.stringify(authority), PI_SUBAGENT_ENDPOINT: "authenticated-endpoint" },
  }));
  const ready = invoke("integrate");
  expect(ready).toMatchObject({ outcome: "INTEGRATION READY", merge: "merged", metadata: "committed", worktree: "registered", archivedPlanVerified: true, activeSpecAbsent: true, retainedArtifacts: [taskPath] });
  expect(ready.targetCommit).toBe(git(root, "rev-parse", "HEAD"));
  expect(existsSync(taskPath)).toBe(true);
  expect(readFileSync(archive, "utf8")).toContain("status: completed");
  expect(inspectCloseout(manifest)).toMatchObject({ merged: true, metadataCommitted: true, worktree: "registered" });
  const repeated = invoke("integrate");
  expect(repeated).toMatchObject({ outcome: "INTEGRATION READY", metadata: "already-committed", targetCommit: ready.targetCommit });
  const cleaned = invoke("cleanup");
  expect(cleaned).toMatchObject({ outcome: "COMPLETED", targetCommit: ready.targetCommit, worktree: "deregistered" });
  expect(existsSync(taskPath)).toBe(false);
  expect(git(root, "show-ref", "--verify", "refs/heads/task/demo")).toContain(manifest.taskCommit);
  expect(invoke("cleanup")).toMatchObject({ outcome: "COMPLETED", targetCommit: ready.targetCommit, worktree: "missing" });
}, 30_000);

it("does not integrate or write metadata when cleanup is requested before delivery", () => {
  const { root, taskPath, manifest, archive } = fixture();
  const before = git(root, "rev-parse", "HEAD");
  const text = readFileSync(archive, "utf8");
  expect(closeout(manifest, { operation: "cleanup" })).toMatchObject({ outcome: "USER INPUT REQUIRED", retainedArtifacts: [taskPath] });
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(archive, "utf8")).toBe(text);
  expect(existsSync(taskPath)).toBe(true);
});

it("reports post-delivery Git removal failure without undoing integration", () => {
  const { root, taskPath, manifest } = fixture();
  const ready = closeout(manifest, { operation: "integrate" });
  expect(ready.outcome).toBe("INTEGRATION READY");
  git(root, "worktree", "lock", "--reason", "removal failure fixture", taskPath);
  const cleaned = closeout(manifest, { operation: "cleanup" });
  expect(cleaned).toMatchObject({ outcome: "CLEANUP PENDING", targetCommit: ready.targetCommit, metadata: "already-committed", worktree: "registered", archivedPlanVerified: true, retainedArtifacts: [taskPath] });
  expect(cleaned.reason).toContain("Git could not remove");
  expect(existsSync(taskPath)).toBe(true);
  expect(git(root, "rev-parse", "HEAD")).toBe(ready.targetCommit);
  git(root, "worktree", "unlock", taskPath);
  expect(closeout(manifest, { operation: "cleanup" }).outcome).toBe("COMPLETED");
});

it("keeps a dirty task worktree after integration-ready until cleanup can succeed", () => {
  const { taskPath, manifest } = fixture();
  writeFileSync(join(taskPath, "retained.txt"), "uncommitted task work\n");
  const ready = closeout(manifest, { operation: "integrate" });
  expect(ready.outcome).toBe("INTEGRATION READY");
  expect(closeout(manifest, { operation: "cleanup" })).toMatchObject({ outcome: "CLEANUP PENDING", targetCommit: ready.targetCommit, retainedArtifacts: [taskPath] });
  expect(readFileSync(join(taskPath, "retained.txt"), "utf8")).toBe("uncommitted task work\n");
});

it("leaves disjoint tracked and untracked target changes in place and excludes ignored files from preservation", () => {
  const { root, manifest } = fixture();
  writeFileSync(join(root, "target.txt"), "tracked dirty\n");
  writeFileSync(join(root, "loose.txt"), "untracked dirty\n");
  writeFileSync(join(root, "ignored.tmp"), "ignored\n");
  const result = closeout(manifest);
  expect(result.outcome).toBe("COMPLETED");
  expect(readFileSync(join(root, "target.txt"), "utf8")).toBe("tracked dirty\n");
  expect(readFileSync(join(root, "loose.txt"), "utf8")).toBe("untracked dirty\n");
  expect(readFileSync(join(root, "ignored.tmp"), "utf8")).toBe("ignored\n");
  expect(git(root, "stash", "list")).toBe("");
});

it("stashes overlapping tracked and untracked changes without stashing ignored files, then restores and drops only its stash", () => {
  const { root, taskPath, manifest } = fixture();
  writeFileSync(join(taskPath, "file.txt"), "task-one\ntwo\nthree\nfour\nfive\n");
  const taskCommit = commit(taskPath, "task edits overlapping path");
  writeFileSync(join(root, "file.txt"), "one\ntwo\nthree\nfour\nlocal-five\n");
  writeFileSync(join(root, "loose.txt"), "local untracked\n");
  writeFileSync(join(root, "ignored.tmp"), "ignored\n");
  const result = closeout({ ...manifest, taskCommit }, { operation: "integrate" });
  expect(result).toMatchObject({ outcome: "INTEGRATION READY", stashState: "restored", merge: "merged" });
  expect(existsSync(taskPath)).toBe(true);
  expect(closeout({ ...manifest, taskCommit }, { operation: "cleanup" })).toMatchObject({ outcome: "COMPLETED", targetCommit: result.targetCommit });
  expect(result.stashOid).toMatch(/^[0-9a-f]{40}$/);
  expect(readFileSync(join(root, "file.txt"), "utf8")).toBe("task-one\ntwo\nthree\nfour\nlocal-five\n");
  expect(readFileSync(join(root, "loose.txt"), "utf8")).toBe("local untracked\n");
  expect(existsSync(join(root, "ignored.tmp"))).toBe(true);
  expect(git(root, "stash", "list")).toBe("");
});

it("reports a routine merge conflict with exact paths and retains evidence", () => {
  const { root, taskPath, manifest } = fixture();
  writeFileSync(join(root, "file.txt"), "target\n"); commit(root, "target edit");
  writeFileSync(join(taskPath, "file.txt"), "task\n");
  const updatedTask = commit(taskPath, "task edit");
  const result = closeout({ ...manifest, taskCommit: updatedTask }, { operation: "integrate" });
  expect(result).toMatchObject({ outcome: "MERGE BLOCKED", merge: "conflict", worktree: "registered" });
  expect(result.reason).toContain("file.txt");
  expect(existsSync(taskPath)).toBe(true);
  writeFileSync(join(root, "file.txt"), "resolved within plan intent\n");
  git(root, "add", "--", "file.txt");
  const resumed = closeout({ ...manifest, taskCommit: updatedTask });
  expect(resumed).toMatchObject({ outcome: "COMPLETED", merge: "merged" });
});

it("restores additive changelog entries from both sides without operator intervention", () => {
  const { root, taskPath, manifest } = fixture();
  writeFileSync(join(taskPath, "CHANGELOG.md"), "# Changelog\n\n- Task entry.\n");
  const taskCommit = commit(taskPath, "add task changelog entry");
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n- Existing target entry.\n");
  const result = closeout({ ...manifest, taskCommit });
  expect(result).toMatchObject({ outcome: "COMPLETED", stashState: "restored", merge: "merged" });
  expect(readFileSync(join(root, "CHANGELOG.md"), "utf8")).toContain("- Task entry.");
  expect(readFileSync(join(root, "CHANGELOG.md"), "utf8")).toContain("- Existing target entry.");
  expect(result.evidence).toContain("restoration-conflict=CHANGELOG.md additive union");
  expect(git(root, "stash", "list")).toBe("");
});

it("reports a restoration conflict and retains the exact stash", () => {
  const { root, taskPath, manifest } = fixture();
  writeFileSync(join(taskPath, "file.txt"), "task version\n");
  const taskCommit = commit(taskPath, "change overlapping file");
  writeFileSync(join(root, "file.txt"), "local version\n");
  const result = closeout({ ...manifest, taskCommit });
  expect(result).toMatchObject({ outcome: "USER INPUT REQUIRED", stashState: "retained", merge: "merged" });
  expect(result.stashOid).toMatch(/^[0-9a-f]{40}$/);
  expect(result.reason).toContain("restoration conflicted");
  expect(git(root, "stash", "list", "--format=%H")).toContain(result.stashOid);
});

it("recognizes an already-merged task and already-committed metadata on resume", () => {
  const { root, taskPath, manifest, archive } = fixture();
  git(root, "merge", "--no-edit", manifest.taskCommit);
  rmSync(archive);
  // The task tree's archived plan remains authoritative for the normal merged state.
  writeFileSync(archive, readFileSync(join(taskPath, manifest.archivedPlanPath), "utf8"));
  const first = closeout(manifest);
  expect(first.outcome).toBe("COMPLETED");
  const metadataHead = git(root, "rev-parse", "HEAD");
  const second = closeout({ ...manifest, taskWorktree: join(root, ".worktrees/missing") });
  expect(second).toMatchObject({ outcome: "COMPLETED", merge: "already-merged", metadata: "already-committed", worktree: "missing" });
  expect(git(root, "rev-parse", "HEAD")).toBe(metadataHead);
});

it("reports inspection and rejects absent or ambiguous preservation identity rather than substituting a stash", () => {
  const { root, manifest } = fixture();
  const inspection = inspectCloseout(manifest);
  expect(inspection).toMatchObject({ targetCommit: git(root, "rev-parse", "HEAD"), worktree: "registered" });
  expect(() => closeout({ ...manifest, archivedPlanPath: ".specs/archive/other/plan.md" })).toThrow("Archived plan must be");
  expect(() => closeout({ ...manifest, taskWorktree: resolve(root, ".worktrees/../outside") })).toThrow("exact child");
});

it("honors no-merge authorization without changing Git state", () => {
  const { root, taskPath, manifest } = fixture();
  const before = git(root, "rev-parse", "HEAD");
  for (const operation of ["closeout", "integrate", "cleanup"] as const) {
    const result = closeout({ ...manifest, noMerge: true }, { operation });
    expect(result.outcome).toBe("USER INPUT REQUIRED");
  }
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(taskPath)).toBe(true);
  expect(git(root, "stash", "list")).toBe("");
});

it("returns exact missing and ambiguous stash identity rather than using a substitute", () => {
  const missing = fixture();
  const stashHash = git(missing.root, "hash-object", "--stdin");
  const missingResult = closeout({ ...missing.manifest, preservationStashOid: stashHash });
  expect(missingResult).toMatchObject({ outcome: "USER INPUT REQUIRED", stashState: "missing", stashOid: stashHash });

  const ambiguous = fixture();
  writeFileSync(join(ambiguous.root, "file.txt"), "overlap\n");
  const message = `plan-integration:${ambiguous.manifest.activeSpecStub}:${ambiguous.manifest.taskCommit}`;
  git(ambiguous.root, "stash", "push", "--include-untracked", "-m", message);
  writeFileSync(join(ambiguous.root, "file.txt"), "overlap again\n");
  git(ambiguous.root, "stash", "push", "--include-untracked", "-m", message);
  const ambiguousResult = closeout(ambiguous.manifest);
  expect(ambiguousResult).toMatchObject({ outcome: "USER INPUT REQUIRED", stashState: "ambiguous" });
  expect(ambiguousResult.retainedArtifacts).toHaveLength(2);
});

it("recognizes and removes only an exact post-deregistration remnant", () => {
  const { root, taskPath, manifest } = fixture();
  // An ordinary interrupted closeout can leave a registered worktree; model Git deregistration plus remnant.
  git(root, "worktree", "remove", taskPath);
  mkdirSync(taskPath); writeFileSync(join(taskPath, "remnant"), "simulated long-path residue");
  expect(inspectCloseout(manifest).worktree).toBe("deregistered");
  expect(closeout(manifest, { operation: "integrate" })).toMatchObject({ outcome: "INTEGRATION READY", worktree: "deregistered" });
  expect(existsSync(taskPath)).toBe(true);
  const result = closeout(manifest, { operation: "cleanup" });
  expect(result).toMatchObject({ outcome: "COMPLETED", worktree: "remnant-removed" });
  expect(existsSync(taskPath)).toBe(false);
});
