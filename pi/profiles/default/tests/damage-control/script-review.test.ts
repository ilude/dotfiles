import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { discoverScripts, runScriptReview, ScriptReviewCoordinator, type ReviewerResult } from "../../lib/damage-control/script-review.ts";
import { loadTrust, scriptIdentity } from "../../lib/damage-control/script-trust.ts";

async function temp() { return mkdtemp(path.join(tmpdir(), "dc-review-")); }
const exec = promisify(execFile);
const profile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("script review coordinator", () => {
  it("reviews deterministic script fixtures without executing them and persists qualifying results", async () => {
    const root = await temp();
    const marker = path.join(root, "marker");
    const file = path.join(root, "safe.sh");
    await writeFile(file, `printf executed > ${JSON.stringify(marker)}\n`);
    const identity = await scriptIdentity(file);
    let seen = "";
    const result = await runScriptReview({ script: { path: file, sha256: identity.sha256, range: { start: 0, end: identity.bytes.length }, argv: ["safe.sh"] }, cwd: root, scope: "invocation" }, async request => {
      seen = request.source ?? "";
      return { status: "complete", qualifying: true, reason: "fixture is recoverable", scope: "invocation" };
    });
    expect(result.status).toBe("approved");
    expect(seen).toContain("printf executed");
    await expect(readFile(marker)).rejects.toThrow();
    expect((await loadTrust(root)).store.records).toHaveLength(1);
  });

  it("does not write approval for failed, cancelled, or mutated reviews", async () => {
    const root = await temp();
    const file = path.join(root, "candidate.py");
    await writeFile(file, "print('fixture')\n");
    const identity = await scriptIdentity(file);
    const failed = await runScriptReview({ script: { path: file, sha256: identity.sha256, range: { start: 0, end: identity.bytes.length }, argv: [] }, cwd: root, scope: "whole-script" }, async () => ({ status: "failed", reason: "fixture unavailable" }));
    expect(failed.status).toBe("failed");
    expect((await loadTrust(root)).store.records).toHaveLength(0);
    const cancelled = await runScriptReview({ script: { path: file, sha256: identity.sha256, range: { start: 0, end: identity.bytes.length }, argv: [] }, cwd: root, scope: "whole-script" }, async () => ({ status: "cancelled", reason: "fixture cancelled" }));
    expect(cancelled.status).toBe("cancelled");
    const mutated = await runScriptReview({ script: { path: file, sha256: identity.sha256, range: { start: 0, end: identity.bytes.length }, argv: [] }, cwd: root, scope: "whole-script" }, async () => {
      await writeFile(file, "print('changed')\n");
      return { status: "complete", qualifying: true, reason: "must not persist" };
    });
    expect(mutated.status).toBe("stale");
    expect((await loadTrust(root)).store.records).toHaveLength(0);
  });

  it("reuses completed results on incremental scans and retains nonqualifying results", async () => {
    const root = await temp();
    await writeFile(path.join(root, "one.sh"), "echo one\n");
    await writeFile(path.join(root, "two.sh"), "echo two\n");
    let calls = 0;
    const coordinator = new ScriptReviewCoordinator({ profile: root, runner: async request => {
      calls++;
      return { status: "complete", qualifying: request.script.path.endsWith("one.sh"), reason: "deterministic fixture" };
    }});
    const first = await coordinator.scan(root, "fixture");
    expect(first).toMatchObject({ discovered: 2, reviewed: 2, approved: 1, nonqualifying: 1 });
    expect(calls).toBe(2);
    const second = await coordinator.scan(root, "fixture");
    expect(second).toMatchObject({ discovered: 2, reused: 2, reviewed: 0 });
    expect(calls).toBe(2);
  });

  it("cancels an in-flight scan and does not persist cancelled reviews", async () => {
    const root = await temp();
    await writeFile(path.join(root, "one.sh"), "echo one\n");
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const controller = new AbortController();
    const coordinator = new ScriptReviewCoordinator({ profile: root, runner: async (_request, signal) => {
      markStarted();
      return await new Promise<ReviewerResult>(resolve => signal.addEventListener("abort", () => resolve({ status: "cancelled", reason: "cancelled fixture" }), { once: true }));
    }});
    const scan = coordinator.scan(root, "fixture", () => {}, controller.signal);
    await started;
    controller.abort();
    const result = await scan;
    expect(result.reviewed).toBe(0);
    expect(result.approved).toBe(0);
    expect(result.nonqualifying).toBe(0);
    expect((await loadTrust(root)).store.records).toHaveLength(0);
  });

  it("finds extensionless supported shebang scripts and excludes dependency trees", async () => {
    const root = await temp();
    await writeFile(path.join(root, "probe"), "#!/usr/bin/env python\nprint('ok')\n");
    await (await import("node:fs/promises")).mkdir(path.join(root, "node_modules"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "ignored.py"), "print('ignored')\n");
    const scripts = await discoverScripts(root);
    expect(scripts.map(script => path.basename(script.path))).toEqual(["probe"]);
  });

  it.skipIf(process.env.PI_DAMAGE_CONTROL_SCAN_LIVE !== "1")("uses real read-only children and shares results across worktrees", async () => {
    const root = await temp();
    const linked = `${root}-linked`;
    try {
      await exec("git", ["init", "-b", "main", root]);
      await exec("git", ["-C", root, "config", "user.name", "Damage Control Fixture"]);
      await exec("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
      await writeFile(path.join(root, "harmless.sh"), "#!/bin/sh\nprintf '%s\\n' fixture\n");
      await writeFile(path.join(root, "argument-sensitive.sh"), "#!/bin/sh\nif [ \"$1\" = --delete-only-copy ]; then rm -rf ./important; else printf '%s\\n' status; fi\n");
      await exec("git", ["-C", root, "add", "."]);
      await exec("git", ["-C", root, "commit", "-m", "fixture scripts"]);
      await exec("git", ["-C", root, "worktree", "add", "-b", "linked", linked]);
      const notices: string[] = [];
      const liveProfile = process.env.PI_CODING_AGENT_DIR ? path.resolve(process.env.PI_CODING_AGENT_DIR) : profile;
      const coordinator = new ScriptReviewCoordinator({ profile: liveProfile });
      const first = await coordinator.scan(root, "damage-control-live-scan", message => notices.push(message));
      expect(first, notices.join("\n")).toMatchObject({ discovered: 2, reviewed: 2, failed: 0 });
      expect(first.approved + first.nonqualifying).toBe(2);
      expect(await coordinator.scan(root, "damage-control-live-rescan")).toMatchObject({ discovered: 2, reused: 2, reviewed: 0 });
      expect(await coordinator.scan(linked, "damage-control-live-cross-worktree")).toMatchObject({ discovered: 2, reused: 2, reviewed: 0 });
      await writeFile(path.join(linked, "harmless.sh"), "#!/bin/sh\nprintf '%s\\n' changed-fixture\n");
      expect(await coordinator.scan(linked, "damage-control-live-changed")).toMatchObject({ discovered: 2, reused: 1, reviewed: 1, failed: 0 });
      const identity = await scriptIdentity(path.join(root, "argument-sensitive.sh"));
      const invocation = await coordinator.review({ script: { path: identity.path, sha256: identity.sha256, range: { start: 0, end: identity.bytes.length }, argv: ["argument-sensitive.sh", "--status"] }, cwd: root, scope: "invocation", origin: "damage-control-live-prompt" });
      expect(["approved", "nonqualifying"]).toContain(invocation.status);
    } finally {
      await exec("git", ["-C", root, "worktree", "remove", "--force", linked]).catch(() => undefined);
      await rm(linked, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
