import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext, composedIntegratorSuccessorPrompt, preparedPlanRunContext } from "../lib/subagents/guidance.ts";
import { successorSystemPrompt } from "../lib/subagents/successor-surface.ts";
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
    expect(prompt).toContain("additive `CHANGELOG.md` restoration conflicts");
    expect(prompt).toContain("other restoration conflicts, consequential overlaps");
    expect(prompt).toContain("Ordinary closeout returns to the parent, which owns user questions and final reporting");
    expect(prompt).toContain("Do not push or deploy unless the selected plan records explicit authorization");
    expect(prompt).toContain("With `--no-merge`, do not dispatch the Integrator for mutation");
    expect(prompt).toContain("🔴 **NOT COMPLETE: MERGE BLOCKED**");
    expect(prompt).toContain("🔴 **NOT COMPLETE: USER INPUT REQUIRED**");
    expect(prompt).toContain("🟡 **CLEANUP PENDING**");
    expect(prompt).not.toContain("without stashing, discarding, or committing unrelated changes");
  });

  it("separates prepared execution and successor ownership from direct and no-merge paths", () => {
    const prompt = read("../prompts/do-it.md");
    const skill = read("../skills/plan-integration/SKILL.md");
    expect(prompt).toContain("runtime-issued prepared-run context identifies this selected plan");
    expect(prompt).toContain("Do not create a second worktree");
    expect(prompt).toContain("Without that context, create or resume");
    expect(prompt).toContain("use `closeout_successor` action `launch` only for the runtime-issued prepared Herdr run");
    expect(prompt).toContain("otherwise use ordinary `subagent` closeout");
    expect(prompt).toContain("Respect each module's owning repository");
    expect(prompt).toContain("before action `release`");
    expect(prompt).toContain("Do not duplicate its report or mutate its target concurrently");
    expect(prompt).toContain("With `--no-merge`, do not dispatch the Integrator for mutation");
    expect(skill).toContain("For ordinary closeout, remove the task worktree");
    expect(skill).toContain("`INTEGRATION READY` with the worktree still present");
    expect(skill).toContain("`closeout_successor_handoff`");
    expect(skill).toContain("In ordinary closeout, do not ask the user directly");
    expect(skill).toContain("In runtime-admitted successor closeout, use native operator input");
    expect(skill).toContain("Keep your pane available after reporting");
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

  it("composes distinct ordinary/successor audiences and deterministic prepared coordinates", () => {
    const catalog = loadDefinitions(profile, false, profile);
    const integrator = catalog.agents.get("integrator");
    if (!integrator) throw new Error("Missing Integrator role");
    const ordinary = composedAgentPrompt(integrator, catalog.agents);
    const replacement = composedIntegratorSuccessorPrompt();
    const manifest = { repositoryRoot: "/repo", targetCheckout: "/repo", targetBranch: "dev", taskWorktree: "/repo/.worktrees/task", taskBranch: "task/task", taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/task/plan.md", activeSpecStub: "task", noMerge: false, completedDate: "2026-09-30", integrationEvidence: "checks passed" };
    const successor = successorSystemPrompt("inherited prompt", integrator.tools, replacement, manifest);
    expect(ordinary).toContain("Report consequential decisions to the parent; do not prompt the user directly");
    expect(successor).not.toContain("do not prompt the user directly");
    expect(successor).not.toContain("Report consequential decisions to the parent");
    expect(successor).toContain("Accept native operator input");
    expect(successor).toContain("closeout_successor_handoff");
    expect(successor).toContain("INTEGRATION READY is not whole-run completion");
    expect(successor).toContain("**Reason** and **Action needed**");
    expect(successor).not.toContain("## Delegation guidance");
    expect(integrator.delegates).toEqual([]);
    expect(integrator.tools).toEqual(["read", "grep", "find", "ls", "bash", "edit", "write"]);
    expect(integrator.model).toBe("luna");
    expect(integrator.effort).toBe("high");
    expect(Buffer.byteLength(successor)).toBeLessThan(3000);
    const receipt = { version: 1 as const, specRelativePath: ".specs/task/plan.md", specStub: "task", taskWorktreePath: "/repo/.worktrees/task", taskBranch: "task/task", originCheckoutPath: "/repo", originBranch: "dev", startingTargetCommit: "b".repeat(40) };
    const prepared = preparedPlanRunContext(receipt);
    expect(prepared).toBe(preparedPlanRunContext({ ...receipt }));
    expect(prepared).toBe(preparedPlanRunContext(Object.fromEntries(Object.entries(receipt).reverse()) as typeof receipt));
    expect(prepared).toContain('"originBranch":"dev"');
    expect(prepared).toContain("With --no-merge, do not launch mutating closeout or release/retire");
    expect(prepared).toContain("Direct/run-here execution without this runtime context");
    expect(Buffer.byteLength(prepared)).toBeLessThan(1800);
    expect(composeCallerSystemPrompt("inherited prompt", catalog.agents)).not.toContain("Runtime-issued prepared plan-run context");
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
    expect(Object.keys(tools)).toEqual(["subagent", "subagent_control", "closeout_successor"]);
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
    expect(subagents).toContain("For ordinary/direct closeout, the orchestrator retains user questions, final reporting");
    expect(subagents).toContain("Prepared Herdr runs instead use the narrow `closeout_successor`");
    const herdr = read("../docs/herdr.md");
    expect(herdr).toContain("Herdr's native worktree open/reuse groups that checkout");
    expect(herdr).toContain("Only a known newly created initial shell is removed");
    expect(herdr).toContain("Direct `/do-it`, run here");
    expect(herdr).toContain("`--no-merge` excludes successor mutation and retirement");
    expect(damageControl).toContain("only the unmodified canonical plan-integration helper");
    expect(damageControl).toContain("`/do-it` dispatches the Integrator after the task-branch commit");
    expect(damageControl).toContain("local closeout authority does not include push or deployment");
  });
});
