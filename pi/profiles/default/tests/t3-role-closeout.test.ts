import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { resolveRoleSnapshot, SUBAGENT_AUTHORITY_EVENT } from "../lib/subagents/authority.ts";
import { harness as damageControl } from "./damage-control/fixtures/fake-pi.ts";
import { bindT3CloseoutAuthority, clearT3CloseoutAuthority, currentT3CloseoutAuthority, prepareT3Closeout } from "../lib/subagents/t3/closeout.ts";
import { authorizedPlanIntegration } from "../lib/damage-control/plan-integration-authority.ts";
import type { T3RoleHandoff, T3RoleThreadBinding } from "../lib/subagents/t3/contracts.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";
import type { Analysis, ToolRequest } from "../lib/damage-control/types.ts";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await clearT3CloseoutAuthority(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function fixture() {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", ""); vi.stubEnv("PI_SUBAGENT_ENDPOINT", "");
  const root = mkdtempSync(join(tmpdir(), "t3-closeout-")); roots.push(root);
  git(root, "init", "-b", "main"); git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.invalid");
  mkdirSync(join(root, ".specs/archive/demo"), { recursive: true });
  writeFileSync(join(root, ".specs/archive/demo/plan.md"), "---\nstatus: in-progress\ncompleted: null\n---\n# Demo\n");
  writeFileSync(join(root, "unrelated.txt"), "original\n");
  git(root, "add", "."); git(root, "commit", "-m", "base");
  const starting = git(root, "rev-parse", "HEAD");
  const task = join(root, ".worktrees/task"); git(root, "worktree", "add", "-b", "task/demo", task);
  writeFileSync(join(task, "feature.txt"), "feature\n"); git(task, "add", "."); git(task, "commit", "-m", "task");
  const manifest: CloseoutManifest = { repositoryRoot: root, targetCheckout: root, targetBranch: "main", taskWorktree: task, taskBranch: "task/demo", taskCommit: git(task, "rev-parse", "HEAD"), targetStartingCommit: starting, archivedPlanPath: ".specs/archive/demo/plan.md", activeSpecStub: "demo", completedDate: "2026-11-09", integrationEvidence: "isolated T3 fixture", noMerge: false };
  const profile = join(root, "profile"); mkdirSync(join(profile, "agents"), { recursive: true });
  for (const agent of ["integrator", "developer"]) writeFileSync(join(profile, "agents", `${agent}.md`), `---\nname: ${agent}\ndescription: Test\ntools: [bash]\nmodel: fixture/test\neffort: low\n---\nTest role`);
  const snapshot = resolveRoleSnapshot({ agent: "integrator", backend: "t3", profile, cwd: root, projectTrusted: false });
  const handoff: T3RoleHandoff = { version: 1, launchId: "launch", snapshot, commissioner: { threadId: "parent", runId: "run", piSessionId: "parent-session", piSessionFile: "parent.jsonl", profile, cwd: root }, workspace: { isolation: "shared", commissioningCwd: root }, assignment: `Integrate exactly.\n<pi-closeout-manifest>${JSON.stringify(manifest)}</pi-closeout-manifest>` };
  const ctx = { cwd: root } as ExtensionToolContext;
  const binding = (prepared: T3RoleHandoff): T3RoleThreadBinding => ({ version: 1, launchId: prepared.launchId, threadId: "child", parentThreadId: "parent", cwd: root, profile, snapshot: prepared.snapshot, commissioner: prepared.commissioner, closeout: prepared.closeout });
  return { root, task, manifest, handoff, ctx, binding };
}
it("requires an originating Integrator, exact manifest, actual target and shared isolation before launch", async () => {
  const f = fixture();
  const good = await prepareT3Closeout(f.handoff, f.ctx);
  expect(good.assignment).toBe("Integrate exactly."); expect(good.closeout).toEqual(f.manifest);
  for (const handoff of [
    { ...f.handoff, assignment: "no manifest" },
    { ...f.handoff, workspace: { ...f.handoff.workspace, isolation: "worktree" as const } },
    { ...f.handoff, commissioner: { ...f.handoff.commissioner, parentLaunchId: "worker" } },
    { ...f.handoff, snapshot: { ...f.handoff.snapshot, definition: { ...f.handoff.snapshot.definition, name: "developer" } } },
    { ...f.handoff, assignment: f.handoff.assignment.replace('"noMerge":false', '"noMerge":true') },
    { ...f.handoff, assignment: f.handoff.assignment.replace(f.manifest.taskCommit, "a".repeat(40)) },
    { ...f.handoff, assignment: f.handoff.assignment.replace('"targetBranch":"main"', '"targetBranch":"other"') },
  ]) await expect(prepareT3Closeout(handoff, f.ctx)).rejects.toThrow();
  await expect(prepareT3Closeout(f.handoff, { cwd: f.task } as ExtensionToolContext)).rejects.toThrow("Unsupported T3 Integrator target");
});
it("issues only runtime provenance, restores it, and authorizes only the unchanged literal helper", async () => {
  const f = fixture(); const prepared = await prepareT3Closeout(f.handoff, f.ctx); const bound = f.binding(prepared);
  const helper = resolve("scripts/plan-integration.mjs"); const command = `node "${helper}" closeout`;
  const request: ToolRequest = { callId: "closeout", cwd: f.root, tool: "bash", language: "bash", text: command, input: { command } };
  const analysis: Analysis = { effects: [], matches: [], uncertainties: [], health: { status: "ready" }, internal: { docker: [], scripts: [{ path: helper, sha256: createHash("sha256").update(readFileSync(helper)).digest("hex"), argv: ["closeout"], range: { start: 0, end: command.length } }] } };
  vi.stubEnv("PI_T3_CLOSEOUT_ENDPOINT", JSON.stringify({ token: "forged", port: 1 }));
  expect(authorizedPlanIntegration(request, analysis, resolve("."))).toBe(false);
  await bindT3CloseoutAuthority(bound);
  expect(currentT3CloseoutAuthority()?.provenance.source).toBe("t3-role-runtime");
  expect(authorizedPlanIntegration(request, analysis, resolve("."), currentT3CloseoutAuthority())).toBe(true);
  expect(authorizedPlanIntegration({ ...request, cwd: f.task }, analysis, resolve("."), currentT3CloseoutAuthority())).toBe(false);
  expect(authorizedPlanIntegration({ ...request, input: { command: `${command}; git status` } }, analysis, resolve("."), currentT3CloseoutAuthority())).toBe(false);
  const endpoint = process.env.PI_T3_CLOSEOUT_ENDPOINT;
  await clearT3CloseoutAuthority(); expect(process.env.PI_T3_CLOSEOUT_ENDPOINT).toBeUndefined();
  expect(authorizedPlanIntegration(request, analysis, resolve("."))).toBe(false);
  await bindT3CloseoutAuthority(bound); expect(process.env.PI_T3_CLOSEOUT_ENDPOINT).not.toBe(endpoint);
  git(f.root, "symbolic-ref", "HEAD", "refs/heads/task/demo");
  await expect(bindT3CloseoutAuthority(bound)).rejects.toThrow("branch mismatch");
  expect(currentT3CloseoutAuthority()).toBeUndefined();
});
it("resolves runtime closeout authority through the event bus across loader boundaries", async () => {
  const f = fixture(); const prepared = await prepareT3Closeout(f.handoff, f.ctx);
  const closeout = await bindT3CloseoutAuthority(f.binding(prepared));
  const gate = await damageControl();
  const helper = join(gate.cwd, "profile/scripts/plan-integration.mjs");
  mkdirSync(join(gate.cwd, "profile/scripts"), { recursive: true }); copyFileSync(resolve("scripts/plan-integration.mjs"), helper);
  gate.api.events.on(SUBAGENT_AUTHORITY_EVENT, (request: unknown) => {
    if (request && typeof request === "object" && "respond" in request && typeof request.respond === "function") request.respond({ backend: "t3", agent: "integrator", closeout: structuredClone(closeout) });
  });
  expect(await gate.gate.handle({ type: "tool_call", toolName: "bash", toolCallId: "t3-closeout", input: { command: `node "${helper}" closeout` } }, { ...gate.ctx, cwd: f.root })).toBeUndefined();
  expect(gate.review).not.toHaveBeenCalled(); expect(gate.select).not.toHaveBeenCalled();
});
it("executes the real helper via authenticated loopback, preserves dirty target and resumes cleanup", async () => {
  const f = fixture(); const prepared = await prepareT3Closeout(f.handoff, f.ctx);
  writeFileSync(join(f.root, "unrelated.txt"), "operator changes\n");
  await bindT3CloseoutAuthority(f.binding(prepared));
  const helper = resolve("scripts/plan-integration.mjs");
  const run = async (operation: string) => {
    const { stdout } = await execute(process.execPath, [helper, operation], { cwd: f.root, env: { ...process.env }, timeout: 30_000 });
    return JSON.parse(stdout);
  };
  expect(await run("integrate")).toMatchObject({ outcome: "INTEGRATION READY", metadata: "committed" });
  expect(readFileSync(join(f.root, "unrelated.txt"), "utf8")).toBe("operator changes\n");
  expect(existsSync(f.task)).toBe(true);
  await clearT3CloseoutAuthority(); await bindT3CloseoutAuthority(f.binding(prepared));
  expect(await run("cleanup")).toMatchObject({ outcome: "COMPLETED" });
  expect(existsSync(f.task)).toBe(false);
  expect(readFileSync(join(f.root, "unrelated.txt"), "utf8")).toBe("operator changes\n");
  await clearT3CloseoutAuthority();
  await expect(run("closeout")).rejects.toThrow();
}, 60_000);
it("rejects missing, substituted and no-merge bindings without installing endpoint authority", async () => {
  const f = fixture(); const prepared = await prepareT3Closeout(f.handoff, f.ctx); const b = f.binding(prepared);
  for (const binding of [ { ...b, closeout: undefined }, { ...b, closeout: { ...f.manifest, noMerge: true } }, { ...b, snapshot: { ...b.snapshot, definition: { ...b.snapshot.definition, name: "developer" } } }, { ...b, cwd: f.task } ]) {
    await expect(bindT3CloseoutAuthority(binding)).rejects.toThrow();
    expect(currentT3CloseoutAuthority()).toBeUndefined(); expect(process.env.PI_T3_CLOSEOUT_ENDPOINT).toBeUndefined();
  }
});
