import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext } from "../lib/subagents/guidance.ts";
import { SubagentRuntime } from "../lib/subagents/runtime.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";

const profile = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: profile, encoding: "utf8" }).trim();
const definitions = loadDefinitions(profile, false, profile);
const role = definitions.agents.get("integrator");
const manifest: CloseoutManifest = {
  repositoryRoot, targetCheckout: repositoryRoot, targetBranch: "main", taskWorktree: join(repositoryRoot, ".worktrees", "integrator-fixture"),
  taskBranch: "feature/integrator-fixture", taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/integrator-fixture/plan.md",
  activeSpecStub: "integrator-fixture", noMerge: true, completedDate: "2026-09-26", integrationEvidence: "checks passed",
};
const runtimes: SubagentRuntime[] = [];
afterEach(async () => { await Promise.all(runtimes.splice(0).map(runtime => runtime.shutdown("quit"))); });

describe("Integrator role and closeout handoff", () => {
  it("registers Luna high with isolated tools, skill, and no delegation", () => {
    expect(definitions.errors).toEqual([]);
    expect(role).toMatchObject({ name: "integrator", model: "luna", effort: "high", skills: ["plan-integration"], delegates: [] });
    expect(role?.tools).toEqual(["read", "grep", "find", "ls", "bash", "edit", "write"]);
    expect(role?.tools).not.toContain("subagent");
    expect(composedAgentPrompt(role!, definitions.agents)).not.toContain("Available agent roles");
    const skill = readFileSync(join(profile, "skills", "plan-integration", "SKILL.md"), "utf8");
    expect(skill).toContain("COMPLETED");
    expect(skill).toContain("MERGE BLOCKED");
    expect(skill).toContain("USER INPUT REQUIRED");
    expect(skill).toContain("CLEANUP PENDING");
    expect(skill).toContain("target and task commits");
    expect(skill).toContain("stash pop");
    expect(skill).toContain("Do not push, deploy");
  });

  it("keeps closeout procedure and manifest details out of ordinary orchestration composition", () => {
    const ordinary = delegationContext({ audience: "caller", definitions: definitions.agents });
    expect(ordinary).toContain("- integrator: Authorized local plan closeout and cleanup");
    expect(ordinary).not.toContain("preservationStashOid");
    expect(ordinary).not.toContain("exact preservation stash");
    expect(ordinary).not.toContain("COMPLETED");
    expect(ordinary).not.toContain("plan-integration/SKILL.md");
  });

  it("refuses to launch the Integrator without a manifest and refuses no-merge handoffs", async () => {
    const runtime = new SubagentRuntime(); runtimes.push(runtime);
    const launch = {
      definition: role!, instructions: "Close out this authorized plan.", cwd: repositoryRoot, model: "openai-codex/gpt-5.6-luna",
      effort: "high" as const, skills: [join(profile, "skills", "plan-integration", "SKILL.md")], origin: "root-session", retained: false,
      surface: "headless" as const, catalog: definitions.agents,
    };
    await expect(runtime.launch(launch, profile, join(profile, "extensions", "subagent-child.ts"), true)).rejects.toThrow(/requires a root-orchestrator closeout manifest/);
    await expect(runtime.launch({ ...launch, closeoutManifest: manifest }, profile, join(profile, "extensions", "subagent-child.ts"), true)).rejects.toThrow(/not launched when closeout is skipped/);
    const authorized = { ...manifest, noMerge: false };
    await expect(runtime.launch({ ...launch, cwd: join(repositoryRoot, "pi", "profiles", "default"), closeoutManifest: authorized }, profile, join(profile, "extensions", "subagent-child.ts"), true)).rejects.toThrow(/recorded target checkout/);
  });
});
