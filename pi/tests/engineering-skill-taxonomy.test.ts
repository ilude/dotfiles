import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { discoverSkills, splitFrontmatter } from "../lib/skill-discovery.js";

const piRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(piRoot, "..");

const claudeModifyingAgents = [
	"builder.md",
	"builder-light.md",
	"builder-heavy.md",
	"csharp-pro.md",
	"devops-pro.md",
	"python-pro.md",
	"rust-ffi.md",
	"rust-pro.md",
	"rust-serde.md",
	"rust-web.md",
	"skills-engineer.md",
	"terraform-pro.md",
	"typescript-pro.md",
];

describe("Pi taxonomy", () => {
	it("discovers the intended owners and parses the developer assignment", () => {
		const skills = discoverSkills({
			roots: [{ path: path.join(piRoot, "skills"), source: "builtin" }],
		});
		const skillNames = skills.map((skill) => skill.name);

		expect(skillNames).toEqual(
			expect.arrayContaining([
				"analysis-workflow",
				"architecture-design",
				"least-astonishment",
			]),
		);
		expect(skillNames).not.toContain("development-philosophy");

		const developer = splitFrontmatter(
			fs.readFileSync(path.join(piRoot, "agents", "developer.md"), "utf8"),
		);
		expect(developer.frontmatter.skills).toEqual([
			"analysis-workflow",
			"least-astonishment",
		]);
	});
});

describe("Claude taxonomy", () => {
	it("discovers the intended owners and parses modifying-agent assignments", () => {
		const skills = discoverSkills({
			roots: [{ path: path.join(repoRoot, "claude", "skills"), source: "builtin" }],
		});
		const skillNames = skills.map((skill) => skill.name);

		expect(skillNames).toEqual(
			expect.arrayContaining([
				"analysis-workflow",
				"architecture-design",
				"least-astonishment",
			]),
		);
		expect(skillNames).not.toContain("development-philosophy");

		for (const agent of claudeModifyingAgents) {
			const parsed = splitFrontmatter(
				fs.readFileSync(path.join(repoRoot, "claude", "agents", agent), "utf8"),
			);
			expect(parsed.frontmatter.skills, agent).toBe(
				"analysis-workflow, least-astonishment",
			);
		}
	});
});
