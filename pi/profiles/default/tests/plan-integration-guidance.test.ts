import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext, composedIntegratorSuccessorPrompt, preparedPlanRunContext } from "../lib/subagents/guidance.ts";
import { successorSystemPrompt } from "../lib/subagents/successor-surface.ts";
import { extractCloseoutHandoff } from "../lib/subagents/closeout-handoff.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";
import type { PreparedPlanRun } from "../lib/plan-run.ts";
import subagents, { composeCallerSystemPrompt } from "../extensions/subagents.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

const profile = fileURLToPath(new URL("../", import.meta.url));
const manifest: CloseoutManifest = {
  repositoryRoot: "/repo", targetCheckout: "/repo", targetBranch: "dev",
  taskWorktree: "/repo/.worktrees/task", taskBranch: "task/task", taskCommit: "a".repeat(40),
  archivedPlanPath: ".specs/archive/task/plan.md", activeSpecStub: "task", noMerge: false,
  completedDate: "2026-09-30", integrationEvidence: "checks passed",
};

function catalog() {
  const result = loadDefinitions(profile, false, profile);
  expect(result.errors).toEqual([]);
  const integrator = result.agents.get("integrator");
  if (!integrator) throw new Error("Missing Integrator role");
  return { agents: result.agents, integrator };
}

describe("Integrator prompt composition and handoff", () => {
  it("lists the specialist without injecting its role body or closeout procedure into the caller", () => {
    const { agents, integrator } = catalog();
    const caller = composeCallerSystemPrompt("inherited prompt", agents);
    const listedRole = delegationContext({ audience: "caller", definitions: agents });
    for (const text of [caller, listedRole]) {
      expect(text).toContain(`- ${integrator.name}: ${integrator.description}`);
      expect(text).not.toContain(integrator.prompt);
      expect(text).not.toContain("plan-integration.mjs");
      expect(text).not.toContain("preservationStashOid");
      expect(text).not.toContain("PI_SUBAGENT_AUTHORITY");
    }
    expect(integrator.skills).toEqual(["plan-integration"]);
    expect(composedAgentPrompt(integrator, agents)).toBe(integrator.prompt);
    expect(Buffer.byteLength(caller)).toBeLessThan(4500);
  });

  it("replaces the ordinary role body for successors and serializes the exact manifest and prepared coordinates", () => {
    const { agents, integrator } = catalog();
    const ordinary = composedAgentPrompt(integrator, agents);
    const replacement = composedIntegratorSuccessorPrompt();
    const successor = successorSystemPrompt("inherited prompt", integrator.tools, replacement, manifest);
    expect(successor.startsWith("inherited prompt\n\n")).toBe(true);
    expect(successor).toContain(replacement);
    expect(successor).not.toContain(ordinary);
    expect(JSON.parse(successor.slice(successor.lastIndexOf("\n") + 1))).toEqual(manifest);
    expect(integrator.delegates).toEqual([]);
    expect([...integrator.tools].sort()).toEqual(["read", "grep", "find", "ls", "bash", "edit", "write"].sort());
    expect(integrator.model).toBe("luna");
    expect(integrator.effort).toBe("high");
    expect(Buffer.byteLength(successor)).toBeLessThan(3000);

    const receipt: PreparedPlanRun = {
      version: 1, specRelativePath: ".specs/task/plan.md", specStub: "task",
      taskWorktreePath: manifest.taskWorktree, taskBranch: manifest.taskBranch,
      originCheckoutPath: manifest.targetCheckout, originBranch: manifest.targetBranch,
      startingTargetCommit: "b".repeat(40),
    };
    const prepared = preparedPlanRunContext(receipt);
    const payload = prepared.split("\n\n")[1];
    expect(JSON.parse(payload)).toEqual(receipt);
    const reordered: PreparedPlanRun = {
      startingTargetCommit: receipt.startingTargetCommit, originBranch: receipt.originBranch,
      originCheckoutPath: receipt.originCheckoutPath, taskBranch: receipt.taskBranch,
      taskWorktreePath: receipt.taskWorktreePath, specStub: receipt.specStub,
      specRelativePath: receipt.specRelativePath, version: receipt.version,
    };
    expect(preparedPlanRunContext(reordered)).toBe(prepared);
    expect(Buffer.byteLength(prepared)).toBeLessThan(1800);
    expect(composeCallerSystemPrompt("inherited prompt", agents)).not.toContain(payload);
  });

  it("keeps manifest fields out of ordinary tool parameters and validates assignment-text handoffs", () => {
    const pi = { ...createMockPi(), registerMessageRenderer: vi.fn() };
    const previousAuthority = process.env.PI_SUBAGENT_AUTHORITY;
    process.env.PI_SUBAGENT_AUTHORITY = "";
    try { subagents(pi as unknown as ExtensionAPI); } finally {
      if (previousAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY;
      else process.env.PI_SUBAGENT_AUTHORITY = previousAuthority;
    }
    expect(pi._tools.map(tool => tool.name)).toEqual(["subagent", "subagent_control", "closeout_successor"]);
    const parameters = pi._getTool("subagent")?.parameters;
    expect(parameters).toBeDefined();
    expect(parameters).not.toHaveProperty("properties.closeoutManifest");
    expect(parameters).not.toHaveProperty("properties.targetCheckout");

    const handoff = extractCloseoutHandoff(`Close out this plan.\n<pi-closeout-manifest>${JSON.stringify(manifest)}</pi-closeout-manifest>`);
    expect(handoff).toEqual({ manifest, instructions: "Close out this plan." });
    expect(extractCloseoutHandoff("Ordinary subagent assignment.")).toBeUndefined();
    expect(() => extractCloseoutHandoff("<pi-closeout-manifest>{}</pi-closeout-manifest><pi-closeout-manifest>{}</pi-closeout-manifest> assignment")).toThrow(/Invalid closeout manifest handoff/);
  });
});
