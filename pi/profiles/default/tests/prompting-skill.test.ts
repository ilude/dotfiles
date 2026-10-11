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
    const skill = result.skills[0];
    expect(skill.filePath).toBe(prompting);
    const discovery = formatSkillsForPrompt(result.skills);
    const xml = discovery.match(/<available_skills>[\s\S]*<\/available_skills>/)?.[0];
    if (!xml) throw new Error("Native skill discovery returned no catalog");
    expect(xml.match(/<skill>/g)).toHaveLength(1);
    const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    const fields = [...xml.matchAll(/<(name|description|location)>([\s\S]*?)<\/\1>/g)].map(
      ([, name, value]) => [name, value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => entities[entity])],
    );
    expect(fields).toEqual([
      ["name", skill.name], ["description", skill.description], ["location", skill.filePath],
    ]);
    const body = readFileSync(prompting, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "").trim();
    expect(body.length).toBeGreaterThan(0);
    expect(discovery).not.toContain(body);
  });

  it.each(["skill-creation", "pi-extension", "agent-process"])("%s links to the shared instruction-writing source", (name) => {
    const file = join(skills, name, "SKILL.md");
    const text = readFileSync(file, "utf8");
    const reference = /\[prompting\]\(([^)]+)\)/.exec(text)?.[1];
    expect(reference).toBeDefined();
    if (!reference) throw new Error(`Missing prompting reference in ${name}`);
    expect(resolve(dirname(file), reference)).toBe(prompting);
  });
});
