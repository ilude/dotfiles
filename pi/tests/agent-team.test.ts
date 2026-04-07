/**
 * Characterization tests for agent-team.ts pure functions.
 * Written before refactor to pin current behavior.
 */
import { describe, it, expect } from "vitest";
import { parseYaml, resolveTeam, getAgentDir } from "../extensions/agent-team.ts";

const SAMPLE_YAML = `
engineering:
  name: engineering-lead
  file: .pi/agent/agents/engineering-lead.md
  description: Handles engineering tasks
  team:
    - name: builder
      file: .pi/agent/agents/builder.md
    - name: validator
      file: .pi/agent/agents/validator.md

design:
  name: design-lead
  file: .pi/agent/agents/design-lead.md
`;

const SIMPLE_YAML = `
solo:
  name: solo-lead
  file: agents/solo.md
`;

describe("getAgentDir", () => {
  it("returns a string containing .pi/agent", () => {
    const dir = getAgentDir();
    expect(typeof dir).toBe("string");
    expect(dir).toContain(".pi");
    expect(dir.endsWith("agent") || dir.endsWith("agent/") || dir.includes("agent")).toBe(true);
  });

  it("is based on the home directory", () => {
    const dir = getAgentDir();
    const home = process.env.HOME || process.env.USERPROFILE || "";
    // On Windows, home path may use backslashes or forward slashes
    const normalizedDir = dir.replace(/\\/g, "/");
    const normalizedHome = home.replace(/\\/g, "/");
    expect(normalizedDir.startsWith(normalizedHome) || normalizedDir.toLowerCase().startsWith(normalizedHome.toLowerCase())).toBe(true);
  });
});

describe("parseYaml", () => {
  it("happy path: parses a team entry with workers", () => {
    const result = parseYaml(SAMPLE_YAML);
    expect(result["engineering"]).toBeDefined();
    expect(result["engineering"].name).toBe("engineering-lead");
    expect(result["engineering"].file).toBe(".pi/agent/agents/engineering-lead.md");
    expect(result["engineering"].description).toBe("Handles engineering tasks");
    expect(result["engineering"].team).toHaveLength(2);
    expect(result["engineering"].team![0].name).toBe("builder");
    expect(result["engineering"].team![0].file).toBe(".pi/agent/agents/builder.md");
    expect(result["engineering"].team![1].name).toBe("validator");
    expect(result["engineering"].team![1].file).toBe(".pi/agent/agents/validator.md");
  });

  it("parses a second top-level entry", () => {
    const result = parseYaml(SAMPLE_YAML);
    expect(result["design"]).toBeDefined();
    expect(result["design"].name).toBe("design-lead");
    expect(result["design"].team).toBeUndefined();
  });

  it("parses entry without team array", () => {
    const result = parseYaml(SIMPLE_YAML);
    expect(result["solo"]).toBeDefined();
    expect(result["solo"].name).toBe("solo-lead");
    expect(result["solo"].file).toBe("agents/solo.md");
    expect(result["solo"].team).toBeUndefined();
  });

  it("skips blank lines and comments", () => {
    const yaml = `
# This is a comment
alpha:
  name: alpha-lead
  # inline comment
  file: agents/alpha.md
`;
    const result = parseYaml(yaml);
    expect(result["alpha"]).toBeDefined();
    expect(result["alpha"].name).toBe("alpha-lead");
  });

  it("returns empty object for empty content", () => {
    expect(parseYaml("")).toEqual({});
    expect(parseYaml("\n\n\n")).toEqual({});
  });

  it("handles team member with multi-line block format (indent 6)", () => {
    const yaml = `
myteam:
  name: team-lead
  file: agents/lead.md
  team:
    - name: worker-one
      file: agents/worker-one.md
`;
    const result = parseYaml(yaml);
    expect(result["myteam"].team).toHaveLength(1);
    expect(result["myteam"].team![0].name).toBe("worker-one");
    expect(result["myteam"].team![0].file).toBe("agents/worker-one.md");
  });
});

describe("resolveTeam", () => {
  it("resolves by exact key", () => {
    const teams = parseYaml(SAMPLE_YAML);
    const result = resolveTeam(teams, "engineering");
    expect(result).not.toBeNull();
    const [key, entry] = result!;
    expect(key).toBe("engineering");
    expect(entry.name).toBe("engineering-lead");
  });

  it("resolves by lead name", () => {
    const teams = parseYaml(SAMPLE_YAML);
    const result = resolveTeam(teams, "engineering-lead");
    expect(result).not.toBeNull();
    const [key, entry] = result!;
    expect(key).toBe("engineering");
    expect(entry.name).toBe("engineering-lead");
  });

  it("returns null for unknown target", () => {
    const teams = parseYaml(SAMPLE_YAML);
    expect(resolveTeam(teams, "nonexistent")).toBeNull();
  });
});
