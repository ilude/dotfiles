import { describe, expect, it } from "vitest";
import { childLaunch } from "../lib/subagents/launch.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
import type { LaunchSpec } from "../lib/subagents/rpc.ts";

const definition: AgentDefinition = { name: "probe", description: "Probe", tools: ["read"], delegates: [], model: "provider/model", effort: "low", skills: [], prompt: "definition body", source: "profile", filePath: "probe.md" };
function spec(surface: "headless" | "visible"): LaunchSpec {
  return { definition, prompt: "frozen composed prompt", instructions: "check", cwd: process.cwd(), model: "provider/model", effort: "low", skills: [], origin: "origin", retained: false, surface };
}

describe("subagent launch prompt", () => {
  it.each(["headless", "visible"] as const)("exports the frozen composed prompt for %s hosting without changing model or effort", (surface) => {
    const launch = childLaunch(spec(surface), "id", process.cwd());
    expect(launch.env.PI_SUBAGENT_PROMPT).toBe("frozen composed prompt");
    expect(launch.args).toContain("provider/model");expect(launch.args).toContain("low");
    expect(launch.args.includes("rpc")).toBe(surface === "headless");
  });
});
