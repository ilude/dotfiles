import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadDefinitions, type AgentDefinition } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext, type DelegationAudience } from "../lib/subagents/guidance.ts";
import { CALLER_GUIDANCE_SUFFIX, composeCallerSystemPrompt } from "../extensions/subagents.ts";

function definition(name: string, extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return { name, description: `${name} role`, tools: [], delegates: [], skills: [], prompt: `${name} private role body`, source: "profile", filePath: `${name}.md`, ...extra };
}

const leaf = definition("leaf", { model: "provider/leaf" });
const strategist = definition("strategist", { model: "provider/strategist", effort: "high" });
const coordinator = definition("coordinator", { delegates: ["leaf"] });
const teamlead = definition("teamlead", { delegates: ["leaf"] });
const council = definition("council", { delegates: ["leaf"] });
const noDefault = definition("no_default");
const entries = [leaf, strategist, coordinator, teamlead, council, noDefault].map(role => [role.name, role] as const);
const definitions = new Map(entries);
const reversed = new Map([...entries].reverse());

function catalogNames(text: string): string[] {
  return [...text.matchAll(/^- ([^:]+):/gm)].map(match => match[1]);
}

describe("delegation prompt composition", () => {
  it("renders a sorted catalog with effective defaults, not private role bodies", () => {
    const text = delegationContext({ audience: "caller", definitions });
    expect(catalogNames(text)).toEqual([...definitions.keys()].sort());
    expect(text).toContain("model default: provider/strategist; effort default: high");
    expect(text).toContain("model default: explicit model required; effort default: low");
    for (const role of definitions.values()) expect(text).not.toContain(role.prompt);
    expect(delegationContext({ audience: "caller", definitions: reversed })).toBe(text);
  });

  it("preserves inherited instructions and appends one composed caller context and suffix", () => {
    const inherited = "inherited instructions";
    const context = delegationContext({ audience: "caller", definitions });
    const result = composeCallerSystemPrompt(inherited, definitions);
    expect(result).toBe(`${inherited}\n\n${context}\n\n${CALLER_GUIDANCE_SUFFIX}`);
    expect(composeCallerSystemPrompt(inherited, reversed)).toBe(result);
  });

  it.each([
    [coordinator, undefined],
    [teamlead, undefined],
    [council, undefined],
    [strategist, ["leaf"]],
  ] as const)("limits %s catalogs to permitted roles without mutating definitions", (role, permitted) => {
    const before = structuredClone([...definitions.entries()]);
    const result = composedAgentPrompt(role, definitions, permitted);
    expect(result.startsWith(`${role.prompt}\n\n`)).toBe(true);
    expect(catalogNames(result)).toEqual(["leaf"]);
    expect(result).not.toContain(leaf.prompt);
    expect(composedAgentPrompt(role, reversed, permitted)).toBe(result);
    expect([...definitions.entries()]).toEqual(before);
  });

  it("keeps ordinary leaf instructions unchanged and injects no delegation context", () => {
    expect(composedAgentPrompt(leaf, definitions)).toBe(leaf.prompt);
    expect(delegationContext({ audience: "leaf", definitions })).toBe("");
  });

  it.each(["caller", "coordinator", "strategist", "teamlead", "council"] satisfies DelegationAudience[])(
    "does not expand an explicitly empty %s catalog into the full catalog",
    audience => {
      expect(catalogNames(delegationContext({ audience, definitions, permitted: [] }))).toEqual([]);
    },
  );

  it("keeps complete bundled prompts within their context budgets and order-independent", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    expect(catalog.errors).toEqual([]);
    const reordered = new Map([...catalog.agents].reverse());
    const caller = composeCallerSystemPrompt("<Pi inherited system prompt>", catalog.agents);
    expect(Buffer.byteLength(caller)).toBeLessThan(4500);
    expect(composeCallerSystemPrompt("<Pi inherited system prompt>", reordered)).toBe(caller);
    for (const [name, budget] of [["teamlead", 3900], ["strategist", 3600], ["steward", 1900]] as const) {
      const role = catalog.agents.get(name);
      if (!role) throw new Error(`Missing bundled ${name}`);
      const prompt = composedAgentPrompt(role, catalog.agents);
      expect(Buffer.byteLength(prompt)).toBeLessThan(budget);
      expect(composedAgentPrompt(role, reordered)).toBe(prompt);
      expect(prompt.startsWith(role.prompt)).toBe(true);
    }
  });
});
