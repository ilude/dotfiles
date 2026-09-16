import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatSkillsForPrompt, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const skills = fileURLToPath(new URL("../skills/", import.meta.url));
const prompting = join(skills, "prompting", "SKILL.md");

describe("shared prompting skill", () => {
  it("is natively discoverable for general instruction editing without injecting its body", () => {
    const result = loadSkillsFromDir({ dir: dirname(prompting), source: "test" });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({ name: "prompting", disableModelInvocation: false });
    const discovery = formatSkillsForPrompt(result.skills);
    expect(discovery).toContain("role/system prompts, tool guidance, AGENTS.md, skills, and prompt templates");
    expect(discovery).not.toContain("Apply the Pareto principle");
    expect(readFileSync(prompting, "utf8")).toContain("Inspect the assembled instructions");
  });

  it.each(["skill-creation", "pi-extension", "agent-process"])("%s links to the shared instruction-writing source", (name) => {
    const file = join(skills, name, "SKILL.md");
    const text = readFileSync(file, "utf8");
    const reference = /\[prompting\]\(([^)]+)\)/.exec(text)?.[1];
    expect(reference).toBeDefined();
    if (!reference) throw new Error(`Missing prompting reference in ${name}`);
    expect(resolve(dirname(file), reference)).toBe(prompting);
    expect(text).not.toContain("Apply the Pareto principle");
  });
});
