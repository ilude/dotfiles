import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { childLaunch } from "../lib/subagents/launch.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
import type { LaunchSpec } from "../lib/subagents/rpc.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";

const definition: AgentDefinition = { name: "probe", description: "Probe", tools: ["read"], delegates: [], model: "provider/model", effort: "low", skills: [], prompt: "definition body", source: "profile", filePath: "probe.md" };
function spec(surface: "headless" | "visible"): LaunchSpec {
  return { definition, prompt: "frozen composed prompt", instructions: "check", cwd: process.cwd(), model: "provider/model", effort: "low", skills: [], origin: "origin", retained: false, surface };
}
const closeoutManifest: CloseoutManifest = {
  repositoryRoot: process.cwd(), targetCheckout: process.cwd(), targetBranch: "main", taskWorktree: join(process.cwd(), ".worktrees", "task"), taskBranch: "feature/task",
  taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/task/plan.md", activeSpecStub: "task", noMerge: false,
  completedDate: "2026-09-26", integrationEvidence: "checks passed",
};

describe("subagent launch prompt", () => {
  it.each(["headless", "visible"] as const)("exports the frozen composed prompt for %s hosting without changing model or effort", (surface) => {
    const launch = childLaunch(spec(surface), "id", process.cwd());
    expect(launch.env.PI_SUBAGENT_PROMPT).toBe("frozen composed prompt");
    expect(launch.args).toContain("provider/model");expect(launch.args).toContain("low");
    expect(launch.args.includes("rpc")).toBe(surface === "headless");
    expect(launch.args).not.toContain("--no-context-files");
    expect(launch.args).toContain("--approve");
    expect(launch.args).not.toContain("--no-approve");
    expect(launch.args).toContain(join(process.cwd(), "extensions", "session-profile.ts"));
    expect(launch.args).toContain(join(process.cwd(), "extensions", "compaction.ts"));
    expect(launch.args).toContain(join(process.cwd(), "extensions", "tool-invocation-provenance.ts"));
  });

  it("loads context files for all roles while keeping skill discovery exclusive to Team Leads", () => {
    const ordinary = childLaunch(spec("headless"), "ordinary", process.cwd());
    const teamlead = childLaunch({
      ...spec("headless"),
      definition: { ...definition, name: "teamlead", delegates: ["probe"] },
    }, "teamlead", process.cwd());

    expect(ordinary.args).not.toContain("--no-context-files");
    expect(ordinary.args).toContain("--no-skills");
    expect(teamlead.args).not.toContain("--no-context-files");
    expect(teamlead.args).not.toContain("--no-skills");
    expect(teamlead.args).toContain("--no-extensions");
    expect(teamlead.args).toEqual(expect.arrayContaining(["--no-prompt-templates", "--no-themes"]));
    expect(teamlead.args).toContain(join(process.cwd(), "extensions", "herdr-tools.ts"));
    expect(teamlead.args).toContain(join(process.cwd(), "extensions", "tool-visibility.ts"));
  });

  it("does not load Herdr tools for ordinary roles", () => {
    const ordinary = childLaunch(spec("headless"), "ordinary", process.cwd());
    expect(ordinary.args).not.toContain(join(process.cwd(), "extensions", "herdr-tools.ts"));
    expect(ordinary.args).not.toContain(join(process.cwd(), "extensions", "tool-visibility.ts"));
  });

  it("keeps the system prompt independent of assignments and runtime launch values", () => {
    const first = childLaunch(spec("headless"), "child-one", process.cwd());
    const changed = childLaunch({ ...spec("visible"), instructions: "different assignment", cwd: join(process.cwd(), "other"), origin: "other-origin", parentId: "parent-two", retained: true }, "child-two", process.cwd());
    expect(changed.env.PI_SUBAGENT_PROMPT).toBe(first.env.PI_SUBAGENT_PROMPT);
    expect(changed.env.PI_SUBAGENT_PROMPT).toBe("frozen composed prompt");
    for (const runtimeValue of ["different assignment", "child-two", "parent-two", "other-origin", join(process.cwd(), "other")]) {
      expect(changed.env.PI_SUBAGENT_PROMPT).not.toContain(runtimeValue);
    }
  });

  it("transfers the typed manifest with runtime-issued Integrator provenance only to the child", () => {
    const launch = childLaunch({ ...spec("headless"), definition: { ...definition, name: "integrator" }, closeoutManifest, closeoutParentSessionId: "parent-session" }, "child-id", process.cwd());
    const authority = JSON.parse(launch.env.PI_SUBAGENT_AUTHORITY);
    expect(authority.closeout).toEqual({
      manifest: closeoutManifest,
      provenance: { source: "subagent-runtime", version: 1, childId: "child-id", agent: "integrator", parentSessionId: "parent-session", targetCheckout: closeoutManifest.targetCheckout },
    });
    expect(launch.env.PI_SUBAGENT_AUTHORITY).not.toContain("bash");
    expect(launch.env.PI_SUBAGENT_PROMPT).toBe("frozen composed prompt");
  });

  it("loads provider plus accounting for Mantle children without the operator extension", () => {
    const launch = childLaunch({ ...spec("headless"), model: "bedrock-mantle/anthropic.claude-sonnet-5" }, "id", process.cwd());
    expect(launch.args).toContain("--extension");
    expect(launch.args).toContain(join(process.cwd(), "extensions", "bedrock/provider.ts"));
    expect(launch.args).not.toContain(join(process.cwd(), "extensions", "bedrock/accounting.ts"));
    expect(launch.args).not.toContain(join(process.cwd(), "extensions", "bedrock/index.ts"));
  });

  it("loads accounting without the Mantle provider for native Bedrock children", () => {
    const launch = childLaunch({ ...spec("headless"), model: "amazon-bedrock/us.anthropic.claude-fable-5-1" }, "id", process.cwd());
    expect(launch.args).toContain(join(process.cwd(), "extensions", "bedrock/accounting.ts"));
    expect(launch.args).not.toContain(join(process.cwd(), "extensions", "bedrock/provider.ts"));
    expect(launch.args).not.toContain(join(process.cwd(), "extensions", "bedrock/index.ts"));
  });
});
