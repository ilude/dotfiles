import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSkills } from "../lib/subagents/options.ts";

const roots: string[] = [];
function root(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}
function skill(base: string, name: string): string {
  const directory = join(base, "skills", name);
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "SKILL.md");
  writeFileSync(file, `---\nname: ${name}\ndescription: test\n---\n`);
  return file;
}

afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("subagent skill resolution", () => {
  it("resolves a trusted project skill from a cwd ancestor before the profile", () => {
    const profile = root("subagent-skill-profile-");
    const project = root("subagent-skill-project-");
    mkdirSync(join(project, ".git"));
    const cwd = join(project, "nested", "work");
    mkdirSync(cwd, { recursive: true });
    const projectFile = skill(join(project, ".pi"), "project-skill");
    skill(profile, "project-skill");

    expect(resolveSkills(profile, [], ["project-skill"], { cwd, projectTrusted: true })).toEqual([projectFile]);
  });

  it("does not load a project skill when the project is untrusted", () => {
    const profile = root("subagent-skill-profile-");
    const project = root("subagent-skill-project-");
    mkdirSync(join(project, ".git"));
    skill(join(project, ".pi"), "project-skill");

    expect(() => resolveSkills(profile, [], ["project-skill"], { cwd: project, projectTrusted: false })).toThrow("Unknown skill project-skill");
  });

  it("falls back to a profile skill", () => {
    const profile = root("subagent-skill-profile-");
    const cwd = root("subagent-skill-cwd-");
    const profileFile = skill(profile, "profile-skill");

    expect(resolveSkills(profile, [], ["profile-skill"], { cwd, projectTrusted: true })).toEqual([profileFile]);
  });
});
