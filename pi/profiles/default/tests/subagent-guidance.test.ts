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
const definitions = new Map([["strategist", strategist], ["no_default", noDefault], ["coordinator", coordinator], ["leaf", leaf]]);

describe("delegation guidance", () => {
  it("renders a deterministic compact catalog with effective defaults", () => {
    const text = delegationContext({ audience: "caller", definitions });
    expect(text.indexOf("- coordinator:")).toBeLessThan(text.indexOf("- leaf:"));
    expect(text).toContain("model default: explicit model required; effort default: low");
    expect(text).not.toContain("leaf prompt");
  });

  it("filters coordinator and strategist catalogs without mutating definitions", () => {
    const before = [...definitions.keys()];
    const coordinatorPrompt = composedAgentPrompt(coordinator, definitions);
    const strategistPrompt = composedAgentPrompt(strategist, definitions, ["leaf"]);
    expect(coordinatorPrompt).toContain("- leaf:");
    expect(coordinatorPrompt).not.toContain("- strategist:");
    expect(strategistPrompt).toContain("Recommendation options");
    expect(strategistPrompt).toContain("- leaf:");
    expect(strategistPrompt).not.toContain("- coordinator:");
    expect([...definitions.keys()]).toEqual(before);
  });

  it("adds no catalog or caller policy to an ordinary leaf", () => {
    expect(composedAgentPrompt(leaf, definitions)).toBe("leaf prompt");
    expect(delegationContext({ audience: "leaf", definitions })).toBe("");
  });

  it("contains the settled selection, consultation, and recovery guidance", () => {
    const text = delegationContext({ audience: "caller", definitions });
    expect(text).toContain("Delegate only for bounded implementation");
    expect(text).toContain("Otherwise work directly");
    expect(text).toContain('agent: "strategist"');
    expect(text).toContain("Reuse its advice");
    expect(text).toContain("observable facts");
    expect(text).toContain("Luna xhigh");
    expect(text).toContain("Use Sol low for Strategist");
    expect(text).toContain("Never use Luna low or medium for Strategist");
    expect(text).toContain("Astra above high is user-selected only");
    expect(text).toContain("One automatic stronger-family retry");
    expect(text).toContain("do not chain automatic retries");
    expect(text).not.toContain("score each");
  });
});
