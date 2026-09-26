import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext } from "../lib/subagents/guidance.ts";
import { extractCloseoutHandoff } from "../lib/subagents/closeout-handoff.ts";
import subagents from "../extensions/subagents.ts";
import { composeCallerSystemPrompt } from "../extensions/subagents.ts";

const profile = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Integrator plan closeout guidance", () => {
  it("routes /do-it closeout after the task commit and preserves authorization boundaries", () => {
    const prompt = read("../prompts/do-it.md");
    expect(prompt).toContain("Unless `--no-merge` is present, dispatch one `integrator`");
    expect(prompt).toContain("after that task commit");
    expect(prompt).toContain("`<pi-closeout-manifest>...</pi-closeout-manifest>`");
    expect(prompt).toContain("tracked and untracked target changes");
    expect(prompt).toContain("ignored files are excluded");
    expect(prompt).toContain("disjoint changes should remain in place");
    expect(prompt).toContain("routine conflicts within settled intent");
    expect(prompt).toContain("restoration conflicts, consequential overlaps");
    expect(prompt).toContain("The parent owns user questions and final reporting");
    expect(prompt).toContain("Do not push or deploy unless the selected plan records explicit authorization");
    expect(prompt).toContain("With `--no-merge`, do not dispatch the Integrator for mutation");
    expect(prompt).toContain("🔴 **NOT COMPLETE: MERGE BLOCKED**");
    expect(prompt).toContain("🔴 **NOT COMPLETE: USER INPUT REQUIRED**");
    expect(prompt).toContain("🟡 **CLEANUP PENDING**");
    expect(prompt).not.toContain("without stashing, discarding, or committing unrelated changes");
  });

  it("puts future closeout routing in planning and Git guidance, not duplicate helper procedure", () => {
    const planning = read("../skills/planning/SKILL.md");
    const template = read("../skills/planning/references/plan-template.md");
    const git = read("../skills/git-workflow/SKILL.md");
    expect(planning).toContain("the orchestrator dispatches the\n   Integrator from the recorded target checkout");
    expect(template).toContain("dispatch the Integrator\nfrom the recorded target checkout");
    expect(template).toContain("If `--no-merge` applies, do not dispatch\nthe Integrator for mutation");
    expect(git).toContain("For `/do-it` execution, the orchestrator commits");
    expect(git).toContain("Outside this authorized closeout contract");
    expect(git).toContain("Obtain operator approval before temporarily removing pre-existing changes");
    expect(git).toContain("unless the authorized `/do-it` Integrator closeout contract above applies");
  });

  it("keeps ordinary orchestrator guidance concise and the closeout skill out of its prompt", () => {
    const catalog = loadDefinitions(profile, false, profile);
    expect(catalog.errors).toEqual([]);
    const caller = composeCallerSystemPrompt("inherited prompt", catalog.agents);
    const listedRole = delegationContext({ audience: "caller", definitions: catalog.agents });
    expect(listedRole).toContain("- integrator: Authorized local plan closeout and cleanup");
    expect(caller).toContain("- integrator: Authorized local plan closeout and cleanup");
    expect(caller).not.toContain("plan-integration.mjs");
    expect(caller).not.toContain("preservationStashOid");
    expect(caller).not.toContain("PI_SUBAGENT_AUTHORITY");
    expect(Buffer.byteLength(caller)).toBeLessThan(4500);
    const integrator = catalog.agents.get("integrator");
    if (!integrator) throw new Error("Missing Integrator role");
    expect(integrator.skills).toEqual(["plan-integration"]);
    const specialist = composedAgentPrompt(integrator, catalog.agents);
    expect(specialist).toContain("Perform only the authorized local closeout");
    expect(specialist).not.toContain("## Delegation guidance");
  });

  it("keeps the complete manifest out of the ordinary subagent tool schema and transfers it only from assignment text", () => {
    const tools: Record<string, any> = {};
    const pi: any = {
      events: { on: () => () => {} },
      on: () => {},
      registerTool: (tool: any) => { tools[tool.name] = tool; },
      registerCommand: () => {},
      registerMessageRenderer: () => {},
      appendEntry: () => {},
      sendMessage: () => {},
    };
    const previousAuthority = process.env.PI_SUBAGENT_AUTHORITY;
    process.env.PI_SUBAGENT_AUTHORITY = "";
    try { subagents(pi); } finally {
      if (previousAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY;
      else process.env.PI_SUBAGENT_AUTHORITY = previousAuthority;
    }
    expect(Object.keys(tools)).toEqual(["subagent", "subagent_control"]);
    expect(JSON.stringify(tools.subagent.parameters)).not.toContain("closeoutManifest");
    expect(JSON.stringify(tools.subagent.parameters)).not.toContain("targetCheckout");

    const manifest = { repositoryRoot: "/repo", targetCheckout: "/repo", targetBranch: "main", taskWorktree: "/repo/.worktrees/task", taskBranch: "feature/task", taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/task/plan.md", activeSpecStub: "task", noMerge: false, completedDate: "2026-09-26", integrationEvidence: "checks passed" };
    const handoff = extractCloseoutHandoff(`Close out this plan.\n<pi-closeout-manifest>${JSON.stringify(manifest)}</pi-closeout-manifest>`);
    expect(handoff).toEqual({ manifest, instructions: "Close out this plan." });
    expect(extractCloseoutHandoff("Ordinary subagent assignment.")).toBeUndefined();
    expect(() => extractCloseoutHandoff(`<pi-closeout-manifest>{}</pi-closeout-manifest><pi-closeout-manifest>{}</pi-closeout-manifest> assignment`)).toThrow(/Invalid closeout manifest handoff/);
  });

  it("documents the role and states the separate Damage Control allowance boundary", () => {
    const subagents = read("../docs/subagents.md");
    const damageControl = read("../docs/damage-control-setup.md");
    expect(subagents).toContain("the orchestrator dispatches Integrator after the task commit");
    expect(subagents).toContain("`--no-merge` skips dispatch");
    expect(subagents).toContain("rather than a closeout field in the ordinary subagent tool schema");
    expect(subagents).toContain("The orchestrator retains user questions, final reporting");
    expect(damageControl).toContain("only the unmodified canonical plan-integration helper");
    expect(damageControl).toContain("`/do-it` dispatches the Integrator after the task-branch commit");
    expect(damageControl).toContain("local closeout authority does not include push or deployment");
  });
});
