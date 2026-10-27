import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { loadDefinitions, type AgentDefinition } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext, SUBAGENT_LAUNCH_DESCRIPTION, SUBAGENT_CONTROL_DESCRIPTION, type DelegationAudience } from "../lib/subagents/guidance.ts";
import subagents, { CALLER_GUIDANCE_SUFFIX, composeCallerSystemPrompt } from "../extensions/subagents.ts";
import childAuthority, { childSystemPrompt } from "../extensions/subagent-child.ts";

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

  it("keeps ordinary roles free of live-retention instructions and unavailable parent tools", () => {
    const profile = fileURLToPath(new URL("../", import.meta.url));
    const catalog = loadDefinitions(profile, false, profile);
    for (const name of ["teamlead", "council"]) {
      const role = catalog.agents.get(name)!;
      const prompt = composedAgentPrompt(role, catalog.agents);
      expect(prompt).not.toMatch(/retain (?:a subagent conversation|useful member contexts)|while retaining member contexts/i);
      expect(prompt).toContain("reopen");
    }
    const integrator = catalog.agents.get("integrator")!;
    const prompt = childSystemPrompt("native base", integrator.name, integrator.tools, integrator.prompt);
    expect(prompt).not.toContain("subagent_parent");
    expect(prompt).toContain("A normal final reply completes your assignment.");
  });

  it("uses one lifecycle contract in root and coordinator tools without a retain option", () => {
    const beforeAuthority = process.env.PI_SUBAGENT_AUTHORITY;
    const beforeEndpoint = process.env.PI_SUBAGENT_ENDPOINT;
    const rootTools = new Map<string, ToolDefinition>();
    const coordinatorTools = new Map<string, ToolDefinition>();
    const api = (tools: Map<string, ToolDefinition>) => ({
      registerTool: (tool: ToolDefinition) => { tools.set(tool.name, tool); },
      registerCommand: () => {}, on: () => {}, registerMessageRenderer: () => {},
      events: { on: () => () => {} },
    });
    try {
      delete process.env.PI_SUBAGENT_AUTHORITY;
      delete process.env.PI_SUBAGENT_ENDPOINT;
      subagents(api(rootTools) as never);
      process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({ id: "coordinator", agent: "teamlead", tools: ["subagent", "subagent_control", "subagent_parent"], delegates: ["developer"], cwd: process.cwd(), skills: [] });
      childAuthority(api(coordinatorTools) as never);
      for (const tools of [rootTools, coordinatorTools]) {
        expect(tools.get("subagent")!.parameters).not.toHaveProperty("properties.retain");
        expect(tools.get("subagent")!.description.startsWith(SUBAGENT_LAUNCH_DESCRIPTION)).toBe(true);
        expect(tools.get("subagent_control")!.description.startsWith(SUBAGENT_CONTROL_DESCRIPTION)).toBe(true);
      }
      expect(SUBAGENT_CONTROL_DESCRIPTION).toContain("reopens a closed saved conversation");
      expect(SUBAGENT_CONTROL_DESCRIPTION).toContain("original role and permissions");
      expect(SUBAGENT_CONTROL_DESCRIPTION).toContain("follow-up closes on completion");
    } finally {
      if (beforeAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY; else process.env.PI_SUBAGENT_AUTHORITY = beforeAuthority;
      if (beforeEndpoint === undefined) delete process.env.PI_SUBAGENT_ENDPOINT; else process.env.PI_SUBAGENT_ENDPOINT = beforeEndpoint;
    }
  });

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
