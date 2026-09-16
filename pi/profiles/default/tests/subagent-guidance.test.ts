import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadDefinitions, type AgentDefinition } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext } from "../lib/subagents/guidance.ts";

function definition(name: string, extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return { name, description: `${name} role`, tools: [], delegates: [], skills: [], prompt: `${name} prompt`, source: "profile", filePath: `${name}.md`, ...extra };
}

const leaf = definition("leaf", { model: "provider/leaf" });
const noDefault = definition("no_default");
const coordinator = definition("coordinator", { delegates: ["leaf"] });
const strategist = definition("strategist", { model: "provider/strategist", effort: "high" });
const steward = definition("steward", { description: "Use after review findings or an unexpected check or deployment outcome, before follow-up fixes", model: "openai-codex/gpt-5.6-luna", effort: "high" });
const teamlead = definition("teamlead", { delegates: ["leaf", "steward"] });
const council = definition("council", { delegates: ["leaf"] });
const entries = [["strategist", strategist], ["steward", steward], ["no_default", noDefault], ["coordinator", coordinator], ["leaf", leaf], ["teamlead", teamlead], ["council", council]] as const;
const definitions = new Map(entries);

describe("delegation guidance", () => {
  it("renders a deterministic compact catalog with effective defaults", () => {
    const text = delegationContext({ audience: "caller", definitions });
    expect(text.indexOf("- coordinator:")).toBeLessThan(text.indexOf("- leaf:"));
    expect(text).toContain("model default: explicit model required; effort default: low");
    expect(text).not.toContain("leaf prompt");
    expect(delegationContext({ audience: "caller", definitions: new Map([...entries].reverse()) })).toBe(text);
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
    const guidance = text.slice(0, text.indexOf("\n\n## Available agent roles"));
    expect(text).toContain("Delegate only for bounded implementation");
    expect(text).toContain("otherwise work directly");
    expect(text).toContain('agent: "strategist"');
    expect(text).toContain('agent: "steward"');
    expect(text).toContain("unexpected agreed check or deployment outcome");
    expect(text).toContain("another MR, build, or deploy cycle");
    expect(text).toContain("corrections proved by the evidence");
    // Keep caller context compact; detailed decomposition belongs to selected coordinators.
    expect(guidance.length).toBeLessThan(1000);
    expect(text).toContain("at most one named plan task per subagent");
    expect(text).toContain("Run ready independent assignments concurrently");
    expect(text).not.toContain("Mark task splits or dependency corrections");
    expect(text).not.toContain("Steward uses Luna high or xhigh");
    expect(text).not.toContain("One automatic stronger-family retry");
    expect(text).not.toContain("Use Sol low for Strategist");
  });

  it("gives Strategists and generic coordinators active decomposition guidance", () => {
    for (const role of [strategist, coordinator]) {
      const text = composedAgentPrompt(role, definitions, ["leaf"]);
      expect(text).toContain("at most one named plan task per subagent");
      expect(text).toContain("split larger tasks into independently verifiable outcomes");
      expect(text).toContain("A Team Lead may coordinate several assignments");
      expect(text).toContain("Seek useful parallel work");
      expect(text).toContain("disjoint write ownership");
      expect(text).toContain("consumers need their specific interface or result, not unrelated producer work");
      expect(text).toContain("as proposals, not settled plan changes");
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
    expect(Buffer.byteLength(text)).toBeLessThan(3000);
    expect(text).toContain("Commission a Strategist");
    expect(text).toContain("one or more additional subagents");
    expect(text).toContain("consult the Strategist again");
    expect(text).toContain("no more than eight active subagents");
    expect(text).toContain("## Steward");
    expect(text).toContain("consult a Steward");
    expect(text).toContain("Use Luna high or xhigh for Steward");
    expect(text).toContain("## Unsuccessful assignments");
    expect(text).toContain("Retry the same bounded assignment once");
    expect(text).toContain("## Permitted subagent roles");
    expect(text).not.toContain("at most one named plan task per subagent");
    expect(text).not.toContain("A Team Lead may coordinate several assignments");
    expect(text).not.toContain("Use Sol low for Strategist");
    expect(text).not.toContain("Sol or Astra for Steward");
    expect(text).not.toContain("independent openings");
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
    // Includes role body, injected guidance, and catalog. Previously 3,887 bytes;
    // allow modest wording changes without losing the agreed whole-prompt reduction.
    expect(Buffer.byteLength(text)).toBeLessThan(3500);
    expect(text).toContain("Start now, Start after prerequisites, and Parent-owned actions");
    expect(text).toContain("exact prerequisite results");
    expect(text).toContain("completion evidence");
    expect(text).toContain("adaptable prose, not a schema or approval gate");
    expect(text).toContain("parent owns execution");
    expect(text).toContain("ongoing dependency coordination or integration helps");
    expect(text).toContain("model default: openai-codex/gpt-5.6-sol; effort default: low");
    expect(text).not.toContain("Use Sol low for Strategist");
    expect(text).not.toContain("Apply the Pareto principle");
    expect(composedAgentPrompt(role, new Map([...catalog.agents].reverse()))).toBe(text);
  });

  it("catalogs Steward for callers and permitted coordinators but not in ordinary leaf context", () => {
    expect(delegationContext({ audience: "caller", definitions })).toContain("- steward: Use after review findings or an unexpected check or deployment outcome, before follow-up fixes (model default: openai-codex/gpt-5.6-luna; effort default: high)");
    expect(composedAgentPrompt(teamlead, definitions)).toContain("- steward:");
    expect(composedAgentPrompt(steward, definitions)).toBe("steward prompt");
  });
});
