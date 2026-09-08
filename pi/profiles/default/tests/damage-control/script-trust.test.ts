import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { addTrustRecord, findTrust, scriptIdentity, trustPath } from "../../lib/damage-control/script-trust.ts";

async function temp() { return mkdtemp(path.join(os.tmpdir(), "dc-trust-")); }
const execFile = promisify(execFileCallback);

describe("script trust", () => {
  it("binds approval to bytes, arguments, and required helper hashes", async () => {
    const root = await temp(); const script = path.join(root, "tool.sh");
    await writeFile(script, "echo safe\n");
    const id = await scriptIdentity(script);
    await addTrustRecord(root, { path: "tool.sh", sha256: id.sha256, outcome: "approved", reason: "reviewed", conditions: [{ argv: ["tool.sh", "--safe"], helpers: { "helper.sh": "abc" } }] });
    expect((await findTrust(script, root, ["tool.sh", "--safe"], { "helper.sh": "abc" })).matched).toBe(true);
    expect((await findTrust(script, root, ["tool.sh", "--other"], { "helper.sh": "abc" })).matched).toBe(false);
    await writeFile(script, "echo changed\n");
    expect((await findTrust(script, root, ["tool.sh", "--safe"], { "helper.sh": "abc" })).matched).toBe(false);
  });

  it("hashes helper files from the current worktree for runtime matching", async () => {
    const root = await temp(); const script = path.join(root, "script.sh"); const helper = path.join(root, "helper.sh");
    await writeFile(script, "source helper.sh\n"); await writeFile(helper, "echo safe\n");
    const id = await scriptIdentity(script); const helperId = await scriptIdentity(helper);
    await addTrustRecord(root, { path: "script.sh", sha256: id.sha256, outcome: "approved", reason: "helper-bound", conditions: [{ argv: [], helpers: { "helper.sh": helperId.sha256 } }] });
    expect((await findTrust(script, root, [])).matched).toBe(true);
    await writeFile(helper, "echo changed\n");
    expect((await findTrust(script, root, [])).matched).toBe(false);
  });

  it("uses the Git common directory for linked worktrees", async () => {
    const root = await temp(); const common = path.join(root, ".git"); const worktree = path.join(root, "linked");
    await mkdir(common, { recursive: true }); await mkdir(worktree, { recursive: true });
    await writeFile(path.join(worktree, ".git"), `gitdir: ${path.join(common, "worktrees", "linked")}\n`);
    await mkdir(path.join(common, "worktrees", "linked"), { recursive: true });
    await writeFile(path.join(common, "worktrees", "linked", "commondir"), "../..\n");
    expect(await trustPath(worktree)).toBe(path.join(common, "pi", "damage-control-trust.yaml"));
    const script = path.join(worktree, "script.sh"); await writeFile(script, "echo ok\n"); const id = await scriptIdentity(script);
    await addTrustRecord(worktree, { path: "script.sh", sha256: id.sha256, outcome: "approved", reason: "ok" });
    expect((await findTrust(script, worktree, [])).matched).toBe(true);
  });

  it("rejects malformed conditions and records outside the project", async () => {
    const root = await temp(); const script = path.join(root, "script.sh"); await writeFile(script, "true\n");
    const store = await trustPath(root); await mkdir(path.dirname(store), { recursive: true });
    await writeFile(store, "version: 1\nrecords:\n  - path: ../outside.sh\n    sha256: bad\n    outcome: approved\n    reason: unsafe\n  - path: script.sh\n    sha256: " + "a".repeat(64) + "\n    outcome: approved\n    reason: unsafe\n    conditions: [{}]\n");
    expect((await findTrust(script, root, [])).matched).toBe(false);
  });

  it("shares a real Git worktree approval but binds each worktree's bytes", async () => {
    const root = await temp(); const first = path.join(root, "first"); const second = path.join(root, "second");
    await execFile("git", ["init", "-q", root]);
    await execFile("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
    await execFile("git", ["-C", root, "config", "user.name", "Damage Control Test"]);
    await writeFile(path.join(root, "script.sh"), "echo shared\n");
    await execFile("git", ["-C", root, "add", "script.sh"]); await execFile("git", ["-C", root, "commit", "-qm", "fixture"]);
    await execFile("git", ["-C", root, "worktree", "add", "-q", first, "HEAD"]);
    await execFile("git", ["-C", root, "worktree", "add", "-q", second, "HEAD"]);
    const id = await scriptIdentity(path.join(first, "script.sh"));
    await addTrustRecord(first, { path: "script.sh", sha256: id.sha256, outcome: "approved", reason: "shared fixture" });
    expect((await findTrust(path.join(second, "script.sh"), second, [])).matched).toBe(true);
    await writeFile(path.join(second, "script.sh"), "echo changed\n");
    expect((await findTrust(path.join(second, "script.sh"), second, [])).matched).toBe(false);
  });

  it("falls back on malformed stores and preserves concurrent updates", async () => {
    const root = await temp(); const script = path.join(root, "script.sh"); await writeFile(script, "true\n");
    const store = await trustPath(root); await mkdir(path.dirname(store), { recursive: true }); await writeFile(store, "not: [valid");
    expect((await findTrust(script, root, [])).matched).toBe(false);
    const id = await scriptIdentity(script);
    await Promise.all([1, 2].map(i => addTrustRecord(root, { path: "script.sh", sha256: id.sha256, outcome: "review", reason: `r${i}`, conditions: [{ argv: [String(i)] }] })));
    const text = await readFile(store, "utf8"); expect(text).toContain("r1"); expect(text).toContain("r2");
  });
});
