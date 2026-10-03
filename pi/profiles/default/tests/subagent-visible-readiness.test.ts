import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VisibleChild } from "../lib/subagents/visible.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const profile = join(dirname(fileURLToPath(import.meta.url)), "..");
const definition: AgentDefinition = {
  name: "developer", description: "Implement", tools: ["read", "tool_search", "web_fetch"],
  delegates: [], skills: [], prompt: "Implement", source: "profile", filePath: "developer.md",
};

describe("visible developer readiness", () => {
  it.each([
    { type: "app-ready" as const },
    { type: "app-ready" as const, payload: { tools: ["read", "tool_search"] } },
  ])("accepts readiness without requiring every permitted tool to be active", message => {
    // web_fetch can remain deferred. Readiness is not a second permission check.
    const child = new VisibleChild({
      definition, instructions: "Implement", cwd: profile, model: "test/model", effort: "low",
      skills: [], origin: "readiness-test", retained: false, surface: "visible",
    }, join(profile, "extensions/subagent-child.ts"), profile);
    expect(child.parentMessage(message)).toEqual({ accepted: true });
    expect(child.snapshot()).toMatchObject({ processState: "running", readyCount: 1 });
    expect(child.snapshot().error).toBeUndefined();
  });
});
