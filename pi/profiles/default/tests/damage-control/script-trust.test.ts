import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addTrustRecord, findTrust, scriptIdentity, trustPath } from "../../lib/damage-control/script-trust.ts";

async function temp() { return mkdtemp(path.join(os.tmpdir(), "dc-trust-")); }

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

  it("uses the Git common directory for linked worktrees", async () => {
    const root = await temp(); const common = path.join(root, ".git"); const worktree = path.join(root, "linked");
    await mkdir(common, { recursive: true }); await mkdir(worktree, { recursive: true });
    await writeFile(path.join(worktree, ".git"), `gitdir: ${path.join(common, "worktrees", "linked")}\n`);
    await mkdir(path.join(common, "worktrees", "linked"), { recursive: true });
    await writeFile(path.join(common, "worktrees", "linked", "commondir"), "../..\n");
    expect(await trustPath(worktree)).toBe(path.join(common, "pi", "damage-control-trust.yaml"));
    const script = path.join(worktree, "script.sh"); await writeFile(script, "echo ok\n"); const id = await scriptIdentity(script);
    await addTrustRecord(worktree, { path: "linked/script.sh", sha256: id.sha256, outcome: "approved", reason: "ok" });
    expect((await findTrust(script, worktree, [])).matched).toBe(true);
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
