import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverScripts, runScriptReview, ScriptReviewCoordinator } from "../../lib/damage-control/script-review.ts";
import { loadTrust, scriptIdentity } from "../../lib/damage-control/script-trust.ts";

async function temp() { return mkdtemp(path.join(tmpdir(), "dc-review-")); }

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

  it("finds extensionless supported shebang scripts and excludes dependency trees", async () => {
    const root = await temp();
    await writeFile(path.join(root, "probe"), "#!/usr/bin/env python\nprint('ok')\n");
    await (await import("node:fs/promises")).mkdir(path.join(root, "node_modules"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "ignored.py"), "print('ignored')\n");
    const scripts = await discoverScripts(root);
    expect(scripts.map(script => path.basename(script.path))).toEqual(["probe"]);
  });
});
