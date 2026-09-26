import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadDefinitions, type AgentDefinition } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext } from "../lib/subagents/guidance.ts";
import { CALLER_GUIDANCE_SUFFIX, composeCallerSystemPrompt } from "../extensions/subagents.ts";

function definition(name: string, extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return { name, description: `${name} role`, tools: [], delegates: [], skills: [], prompt: `${name} prompt`, source: "profile", filePath: `${name}.md`, ...extra };
}

const leaf = definition("leaf", { model: "provider/leaf" });
const reviewer = definition("reviewer", { description: "Read-only independent review; return evidence-based findings" });
const writer = definition("writer", { description: "Writable prose authoring for documents and other text artifacts" });
const noDefault = definition("no_default");
const coordinator = definition("coordinator", { delegates: ["leaf"] });
const strategist = definition("strategist", { model: "provider/strategist", effort: "high" });
const steward = definition("steward", { description: "Post-implementation triage of reviewer/validator agent findings: assess whether additional work is warranted or would create scope drift or fix churn. Not for planning or pre-implementation assessment.", model: "openai-codex/gpt-5.6-luna", effort: "high" });
const teamlead = definition("teamlead", { delegates: ["leaf", "steward"] });
const council = definition("council", { delegates: ["leaf"] });
const entries = [["strategist", strategist], ["steward", steward], ["no_default", noDefault], ["coordinator", coordinator], ["leaf", leaf], ["reviewer", reviewer], ["writer", writer], ["teamlead", teamlead], ["council", council]] as const;
const definitions = new Map(entries);

describe("delegation guidance", () => {
  it("renders a deterministic compact catalog with effective defaults", () => {
    const text = delegationContext({ audience: "caller", definitions });
    expect(text.indexOf("- coordinator:")).toBeLessThan(text.indexOf("- leaf:"));
    expect(text).toContain("model default: explicit model required; effort default: low");
    expect(text).not.toContain("leaf prompt");
    expect(delegationContext({ audience: "caller", definitions: new Map([...entries].reverse()) })).toBe(text);
  });

  it("renders the complete caller composition with a stable suffix", () => {
    const first = composeCallerSystemPrompt("inherited instructions", definitions);
    expect(first).toBe(composeCallerSystemPrompt("inherited instructions", new Map([...entries].reverse())));
    expect(first).toContain("inherited instructions");
    expect(first).toContain("## Delegation guidance");
    expect(first).toContain("## Available agent roles");
    expect(first).toContain('agent: "strategist"');
    expect(first).toContain("Choose a Team Lead only when coordination helps.");
    expect(first).toContain("Background results start an orchestrator turn");
    expect(first).toContain("let the result resume you");
    expect(first).toContain("Use subagent_control for retained conversations and answers.");
    expect(first).toContain("Treat notifications as evidence, not receipts.");
    expect(first).toContain("Reviewer and validator are read-only");
    expect(first).toContain("returned through their normal results");
    expect(first).toContain("You correlate and integrate results unless synthesis is explicitly assigned");
    expect(first).toContain("Use writer when the delegated outcome is a prose artifact");
    expect(first).toContain("natural-language brief and applicable skills as useful suggestions, not required fields");
    expect(first).toContain("Do not repeat established synthesis just to write it");
    expect(first).toContain("- reviewer:");
    expect(first).toContain("- writer:");
    expect(first.endsWith(CALLER_GUIDANCE_SUFFIX)).toBe(true);
    expect(Buffer.byteLength(first)).toBe(Buffer.byteLength(composeCallerSystemPrompt("inherited instructions", definitions)));
  });

  it("filters coordinator and strategist catalogs without mutating definitions", () => {
    const before = [...definitions.keys()];
    const coordinatorPrompt = composedAgentPrompt(coordinator, definitions);
    const strategistPrompt = composedAgentPrompt(strategist, definitions, ["leaf"]);
    expect(coordinatorPrompt).toContain("- leaf:");
    expect(coordinatorPrompt).not.toContain("- strategist:");
    expect(coordinatorPrompt).not.toContain("- steward:");
    expect(strategistPrompt).toContain("Recommendation options");
    expect(strategistPrompt).toContain("- leaf:");
    expect(strategistPrompt).not.toContain("- coordinator:");
    expect([...definitions.keys()]).toEqual(before);
  });

  it("adds no catalog or caller policy to an ordinary leaf", () => {
    expect(composedAgentPrompt(leaf, definitions)).toBe("leaf prompt");
    expect(delegationContext({ audience: "leaf", definitions })).toBe("");
  });

  it("keeps caller routing compact and makes the Steward trigger concrete", () => {
    const text = delegationContext({ audience: "caller", definitions });
    const guidance = text.slice(0, text.indexOf('Consult `subagent` with `agent: "steward"`'));
    expect(text).toContain('agent: "strategist"');
    expect(text).toContain("implementation-plan execution or user-authorized work suited to parallel subagents or Team Leads");
    expect(text).toContain("standalone job to a single subagent or Team Lead only when the user explicitly requests it or delegation conserves context");
    expect(text).toContain("explain the context-conservation reason when applicable");
    expect(text).toContain("skip the Strategist consultation in either case");
    expect(text).toContain("Otherwise work directly, including when Strategist recommends one worker without an exception");
    expect(text).toContain("An explicit single-agent handoff also bypasses consultation when handing off plan work");
    expect(text).toContain("launch the requested agent in the background and continue the discussion");
    expect(text).toContain('agent: "steward"');
    expect(text).toContain("when a reviewer or validator agent reports findings about implemented work");
    expect(text).toContain("assess whether those findings warrant additional work");
    expect(text).toContain("Handle corrections directly when the evidence proves the correction");
    // Keep caller context bounded; detailed decomposition belongs to selected coordinators.
    // The standalone-job and explicit-handoff policy intentionally expands this section.
    expect(guidance.length).toBeLessThan(1500);
    expect(text).toContain("at most one named plan task per subagent");
    expect(text).toContain("Run ready independent assignments concurrently");
    expect(text).toContain("Reviewer and validator are read-only");
    expect(text).toContain("Use writer when the delegated outcome is a prose artifact");
    expect(text).not.toContain("Mark task splits or dependency corrections");
    expect(text).not.toContain("reuse its advice for related assignments");
    expect(text).not.toContain("Delegate only for bounded implementation, parallel investigation, specialist research, or requested independent review; otherwise work directly.");
    expect(text).not.toContain("Steward uses Luna high or xhigh");
    expect(text).not.toContain("One automatic stronger-family retry");
    expect(text).not.toContain("Use Sol low for Strategist");
  });

  it("keeps Herdr recovery conditional while rendering stable complete caller and Team Lead prompts", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    expect(catalog.errors).toEqual([]);
    const lead = catalog.agents.get("teamlead");
    if (!lead) throw new Error("Missing bundled Team Lead");
    const root = composeCallerSystemPrompt("<Pi inherited system prompt>", catalog.agents);
    const teamLeadPrompt = composedAgentPrompt(lead, catalog.agents);
    expect(composeCallerSystemPrompt("<Pi inherited system prompt>", new Map([...catalog.agents].reverse()))).toBe(root);
    expect(composedAgentPrompt(lead, new Map([...catalog.agents].reverse()))).toBe(teamLeadPrompt);
    for (const prompt of [root, teamLeadPrompt]) {
      expect(prompt).not.toContain("herdr_agent");
      expect(prompt).not.toContain("herdr_layout");
      expect(prompt).not.toContain("herdr_pane");
      expect(prompt).not.toContain("cross-agent pane recovery");
      expect(prompt).not.toContain("herdr --skill");
    }
    // The root uses a fixed stand-in for Pi's runtime-owned inherited system prompt.
    expect(Buffer.byteLength(root)).toBeLessThan(4500);
    expect(Buffer.byteLength(teamLeadPrompt)).toBeLessThan(3900);
    const skill = readFileSync(new URL("../skills/herdr/SKILL.md", import.meta.url), "utf8");
    const description = /^description: (.+)$/m.exec(skill)?.[1];
    expect(description).toContain("owned subagent controls cannot reach a visible agent or pane");
    expect(description).toContain("cross-agent recovery");
    expect(description).not.toContain("herdr --skill");
  });

  it("shares post-implementation finding triage and excludes requested-work preflight across caller and Team Lead", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    const lead = catalog.agents.get("teamlead");
    if (!lead) throw new Error("Missing bundled Team Lead");
    const caller = composeCallerSystemPrompt("inherited instructions", catalog.agents);
    const teamleadPrompt = composedAgentPrompt(lead, catalog.agents);
    for (const text of [caller, teamleadPrompt]) {
      expect(text).toContain("when a reviewer or validator agent reports findings about implemented work");
      expect(text).toContain("assess whether those findings warrant additional work");
      expect(text).toContain("Provide the requested outcome, completed work, findings, and proposed follow-up");
      expect(text).toContain("Steward advises whether further work is justified; it does not approve implementation");
      expect(text).toContain("Do not consult Steward before starting requested implementation, including user-authorized fixes from a code review");
      expect(text).toContain("Do not send it implementation plans, task decomposition, or the orchestrator's own investigation");
      expect(text).toContain("Handle corrections directly when the evidence proves the correction");
      expect(text).toContain("Reuse its assessment for the same finding");
      expect(text).toContain("Reviewer and validator are read-only");
      expect(text).toContain("You correlate and integrate results unless synthesis is explicitly assigned");
      expect(text).toContain("Use writer when the delegated outcome is a prose artifact");
      expect(text).toContain("natural-language brief and applicable skills as useful suggestions, not required fields");
      expect(text).toContain("Do not repeat established synthesis just to write it");
      expect(text).not.toContain("routine pre-implementation");
      expect(text).not.toContain("before assigning follow-up work");
      expect(text).not.toContain("unexpected agreed check or deployment outcome");
      expect(text).not.toContain("another MR, build, or deploy cycle");
    }
    // Bound the composed caller while allowing the consolidated role guidance.
    expect(Buffer.byteLength(caller)).toBeLessThan(4500);
  });

  it("gives Strategists and generic coordinators active decomposition guidance", () => {
    for (const role of [strategist, coordinator]) {
      const text = composedAgentPrompt(role, definitions, ["leaf"]);
      expect(text).toContain("at most one named plan task per subagent");
      expect(text).toContain("A Team Lead may coordinate several assignments");
      expect(text).toContain("Seek useful parallel work");
      expect(text).toContain("disjoint write ownership");
      expect(text).toContain("consumers need their specific interface or result, not unrelated producer work");
      expect(text).toContain("as proposals, not settled plan changes");
    }
  });

  it("sizes outcomes within named tasks only in Strategist guidance", () => {
    const text = composedAgentPrompt(strategist, definitions, ["leaf"]);
    expect(text).toContain("Treat it as an upper boundary, not an assignment size");
    expect(text).toContain("Split multiple independently provable outcomes into smaller assignments with specific finishes");
    expect(text).toContain("preserving task requirements");
    expect(text).not.toContain("split larger tasks into independently verifiable outcomes");
    const coordinatorText = composedAgentPrompt(coordinator, definitions);
    expect(coordinatorText).toContain("split larger tasks into independently verifiable outcomes");
    for (const audience of ["caller", "coordinator", "teamlead", "council", "leaf"] as const) {
      expect(delegationContext({ audience, definitions })).not.toContain("upper boundary, not an assignment size");
    }
  });

  it("gives Strategist detailed selection advice without follow-up or retry policy", () => {
    const text = composedAgentPrompt(strategist, definitions, ["leaf"]);
    expect(text).toContain("Recommend direct execution");
    expect(text).toContain("Use catalog defaults unless evidence warrants an override");
    expect(text).toContain("one worker for a bounded outcome");
    expect(text).toContain("direct parallel workers for independent outcomes");
    expect(text).toContain("ongoing dependency coordination or integration helps; name that responsibility");
    expect(text).toContain("Luna Strategist requires at least high effort");
    expect(text).toContain("Steward uses Luna high/xhigh");
    expect(text).toContain("requires prior user approval");
    expect(text).not.toContain("consult Steward");
    expect(text).not.toContain("One stronger-family retry");
  });

  it("gives Team Lead its complete workflow, Steward trigger, and retry policy without Strategist-owned decomposition guidance", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    expect(catalog.errors).toEqual([]);
    const role = catalog.agents.get("teamlead");
    if (!role) throw new Error("Missing bundled Team Lead");
    const text = composedAgentPrompt(role, catalog.agents);
    // Shared Steward and writing boundaries add context while keeping the full prompt bounded.
    expect(Buffer.byteLength(text)).toBeLessThan(3900);
    expect(text).toContain("Commission a Strategist");
    expect(text).toContain("one or more additional subagents");
    expect(text).toContain("consult the Strategist again");
    expect(text).toContain("no more than eight active subagents");
    expect(text).toContain("## Steward");
    expect(text).toContain('agent: "steward"');
    expect(text).toContain("Use Luna high or xhigh for Steward");
    expect(text).toContain("## Unsuccessful assignments");
    expect(text).toContain("Retry the same bounded assignment once");
    expect(text).toContain("## Permitted subagent roles");
    expect(text).not.toContain("at most one named plan task per subagent");
    expect(text).not.toContain("A Team Lead may coordinate several assignments");
    expect(text).not.toContain("Use Sol low for Strategist");
    expect(text).not.toContain("Sol or Astra for Steward");
    expect(text).not.toContain("independent openings");
    const caller = composeCallerSystemPrompt("inherited instructions", catalog.agents);
    expect(caller).toContain("Reviewer and validator are read-only");
    expect(caller).toContain("You correlate and integrate results unless synthesis is explicitly assigned");
    expect(caller).toContain("Use writer when the delegated outcome is a prose artifact");
    expect(caller).toContain("Do not repeat established synthesis just to write it");
    expect(caller).toContain("- writer: Writable prose authoring");
    expect(caller).toContain("- reviewer: Read-only independent review");
  });

  it("gives Council only deliberation guidance and its permitted catalog", () => {
    const text = composedAgentPrompt(council, definitions);
    expect(text).toContain("only when the user explicitly requested one");
    expect(text).toContain("independent openings");
    expect(text).toContain("- leaf:");
    expect(text).not.toContain("consult Steward");
    expect(text).not.toContain("stronger-family retry");
    expect(text).not.toContain("Use Sol low for Strategist");
  });

  it("is byte-stable across repeated composition and equivalent catalog order", () => {
    for (const role of [strategist, teamlead, council]) {
      const permitted = role === strategist ? ["leaf"] : undefined;
      const first = composedAgentPrompt(role, definitions, permitted);
      expect(composedAgentPrompt(role, definitions, permitted)).toBe(first);
      expect(composedAgentPrompt(role, new Map([...entries].reverse()), permitted)).toBe(first);
    }
  });

  it("keeps the assembled bundled Strategist concise, actionable, and advisory", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    expect(catalog.errors).toEqual([]);
    const role = catalog.agents.get("strategist");
    if (!role) throw new Error("Missing bundled Strategist");
    const text = composedAgentPrompt(role, catalog.agents);
    // Includes role body, injected guidance, and catalog. The concise Integrator
    // catalog entry adds bounded role-routing context without exposing its skill.
    expect(Buffer.byteLength(text)).toBeLessThan(3600);
    expect(text).toContain("Start now, Start after prerequisites, and Parent-owned actions");
    expect(text).toContain("exact prerequisite results");
    expect(text).toContain("completion evidence");
    expect(text).toContain("adaptable prose, not a schema or approval gate");
    expect(text).toContain("parent owns execution");
    expect(text).toContain("ongoing dependency coordination or integration helps");
    expect(text).toContain("model default: sol; effort default: low");
    expect(text).not.toContain("Use Sol low for Strategist");
    expect(text).not.toContain("Apply the Pareto principle");
    expect(composedAgentPrompt(role, new Map([...catalog.agents].reverse()))).toBe(text);
  });

  it("instructs Steward to return misrouted assignments without performing pre-implementation assessment", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    const role = catalog.agents.get("steward");
    if (!role) throw new Error("Missing bundled Steward");
    const text = composedAgentPrompt(role, catalog.agents);
    expect(text).toContain("Assess findings returned by reviewer or validator agents about implemented work");
    expect(text).toContain("If the assignment requests planning, initial investigation, or pre-implementation assessment, briefly identify the mismatch and return without performing that assessment");
    expect(text).toContain("Assess whether the proposed additional work is necessary to satisfy the existing request");
    expect(text).toContain("Do not develop an implementation plan");
    expect(text).not.toContain("Recommend the smallest fix");
    expect(text).not.toContain("## Delegation guidance");
    // Role-only triage and misrouting guidance, without a second caller workflow.
    expect(Buffer.byteLength(text)).toBeLessThan(1900);
    expect(composedAgentPrompt(role, catalog.agents)).toBe(text);
  });

  it("catalogs Steward for callers and permitted coordinators but not in ordinary leaf context", () => {
    expect(delegationContext({ audience: "caller", definitions })).toContain("- steward: Post-implementation triage of reviewer/validator agent findings: assess whether additional work is warranted or would create scope drift or fix churn. Not for planning or pre-implementation assessment. (model default: openai-codex/gpt-5.6-luna; effort default: high)");
    expect(composedAgentPrompt(teamlead, definitions)).toContain("- steward:");
    expect(composedAgentPrompt(steward, definitions)).toBe("steward prompt");
  });
});
