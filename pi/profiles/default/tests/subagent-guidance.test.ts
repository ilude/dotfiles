import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext } from "../lib/subagents/guidance.ts";

function definition(name: string, extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return { name, description: `${name} role`, tools: [], delegates: [], skills: [], prompt: `${name} prompt`, source: "profile", filePath: `${name}.md`, ...extra };
}

const leaf = definition("leaf", { model: "provider/leaf" });
const noDefault = definition("no_default");
const coordinator = definition("coordinator", { delegates: ["leaf"] });
const strategist = definition("strategist", { model: "provider/strategist", effort: "high" });
const steward = definition("steward", { model: "openai-codex/gpt-5.6-luna", effort: "high" });
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

  it("keeps the settled caller selection, consultation, and recovery guidance", () => {
    const text = delegationContext({ audience: "caller", definitions });
    expect(text).toContain("Delegate only for bounded implementation");
    expect(text).toContain("Otherwise work directly");
    expect(text).toContain('agent: "strategist"');
    expect(text).toContain('agent: "steward"');
    expect(text).toContain("Steward uses Luna high or xhigh");
    expect(text).toContain("obtain user approval");
    expect(text).toContain("Use Sol low for Strategist");
    expect(text).toContain("One automatic stronger-family retry");
    expect(text).toContain("do not chain automatic retries");
  });

  it("gives Strategist selection advice without Steward follow-up or retry policy", () => {
    const text = composedAgentPrompt(strategist, definitions, ["leaf"]);
    expect(text).toContain("Recommend direct execution");
    expect(text).toContain("State the evidence for role, model, and effort choices");
    expect(text).toContain("Use Sol low for Strategist");
    expect(text).not.toContain("consult Steward");
    expect(text).not.toContain("One stronger-family retry");
  });

  it("gives Team Lead coordination and retry advice without Strategist or Council policy", () => {
    const text = composedAgentPrompt(teamlead, definitions);
    expect(text).toContain("Coordinate permitted leaves");
    expect(text).toContain("consult Steward");
    expect(text).toContain("One stronger-family retry");
    expect(text).not.toContain("Use Sol low for Strategist");
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

  it("catalogs Steward for callers and permitted coordinators but not in ordinary leaf context", () => {
    expect(delegationContext({ audience: "caller", definitions })).toContain("- steward: steward role (model default: openai-codex/gpt-5.6-luna; effort default: high)");
    expect(composedAgentPrompt(teamlead, definitions)).toContain("- steward:");
    expect(composedAgentPrompt(steward, definitions)).toBe("steward prompt");
  });
});
