import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeout, inspectCloseout } from "../../lib/plan-integration/closeout.ts";
import type { CloseoutManifest } from "../../lib/plan-integration/contracts.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(cwd: string, ...args: string[]): string { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function commit(cwd: string, message: string): string { git(cwd, "add", "-A"); git(cwd, "commit", "-m", message); return git(cwd, "rev-parse", "HEAD"); }
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "plan integration ")); roots.push(base);
  const root = join(base, "repo"); mkdirSync(root); git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.invalid");
  writeFileSync(join(root, ".gitignore"), "ignored.tmp\n");
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

it("completes a clean target, commits only completion metadata, and removes the worktree but retains its branch", () => {
  const { root, taskPath, manifest, archive } = fixture();
  const result = closeout(manifest);
  expect(result).toMatchObject({ outcome: "COMPLETED", merge: "merged", metadata: "committed", worktree: "deregistered", archivedPlanVerified: true, activeSpecAbsent: true });
  expect(existsSync(taskPath)).toBe(false);
  expect(git(root, "show-ref", "--verify", "refs/heads/task/demo")).toContain(manifest.taskCommit);
  expect(readFileSync(archive, "utf8")).toContain("status: completed\ncompleted: 2026-09-26");
  expect(git(root, "log", "-2", "--format=%s")).toContain(`docs(plan): record demo integration`);
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
  const result = closeout({ ...manifest, taskCommit });
  expect(result).toMatchObject({ outcome: "COMPLETED", stashState: "restored", merge: "merged" });
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
  const result = closeout({ ...manifest, taskCommit: updatedTask });
  expect(result).toMatchObject({ outcome: "MERGE BLOCKED", merge: "conflict", worktree: "registered" });
  expect(result.reason).toContain("file.txt");
  expect(existsSync(taskPath)).toBe(true);
  writeFileSync(join(root, "file.txt"), "resolved within plan intent\n");
  git(root, "add", "--", "file.txt");
  const resumed = closeout({ ...manifest, taskCommit: updatedTask });
  expect(resumed).toMatchObject({ outcome: "COMPLETED", merge: "merged" });
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
  const result = closeout({ ...manifest, noMerge: true });
  expect(result.outcome).toBe("USER INPUT REQUIRED");
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
  const result = closeout(manifest);
  expect(result).toMatchObject({ outcome: "COMPLETED", worktree: "remnant-removed" });
  expect(existsSync(taskPath)).toBe(false);
});
