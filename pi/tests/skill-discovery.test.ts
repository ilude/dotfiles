import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	discoverSkills,
	findSkillByName,
	splitFrontmatter,
	type SkillRecord,
} from "../lib/skill-discovery.js";

let tmpRoot: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-skill-discovery-"));
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeFile(relPath: string, body: string): string {
	const full = path.join(tmpRoot, relPath);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, body, "utf-8");
	return full;
}

describe("splitFrontmatter", () => {
	it("returns empty frontmatter when no leading marker", () => {
		const { frontmatter, body, hadFrontmatter } = splitFrontmatter("body only\nlines");
		expect(frontmatter).toEqual({});
		expect(body).toBe("body only\nlines");
		expect(hadFrontmatter).toBe(false);
	});

	it("parses frontmatter with name and description", () => {
		const raw = ["---", "name: my-skill", "description: A test skill", "---", "body line"].join("\n");
		const { frontmatter, body, hadFrontmatter } = splitFrontmatter(raw);
		expect(frontmatter.name).toBe("my-skill");
		expect(frontmatter.description).toBe("A test skill");
		expect(body).toBe("body line");
		expect(hadFrontmatter).toBe(true);
	});

	it("treats unterminated frontmatter as no-frontmatter", () => {
		const raw = "---\nname: x\nno closing marker\n";
		const { frontmatter, hadFrontmatter } = splitFrontmatter(raw);
		expect(frontmatter).toEqual({});
		expect(hadFrontmatter).toBe(false);
	});

	it("preserves CRLF line endings", () => {
		const raw = "---\r\nname: x\r\ndescription: y\r\n---\r\nbody";
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter.name).toBe("x");
		expect(body).toBe("body");
	});
});

describe("discoverSkills (subdir layout)", () => {
	it("discovers SKILL.md under <root>/<dir>/SKILL.md", () => {
		writeFile(
			"my-skill/SKILL.md",
			"---\nname: my-skill\ndescription: hello\n---\nbody",
		);
		const skills = discoverSkills({ roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(skills.length).toBe(1);
		expect(skills[0].name).toBe("my-skill");
		expect(skills[0].description).toBe("hello");
	});

	it("uses directory name when frontmatter lacks name", () => {
		writeFile("dir-named/SKILL.md", "no frontmatter here");
		const skills = discoverSkills({ roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(skills[0].name).toBe("dir-named");
		expect(skills[0].description).toBe("");
	});
});

describe("discoverSkills (flat layout)", () => {
	it("discovers <root>/<file>.md and uses basename when no name field", () => {
		writeFile("plan-it.md", "Just a template body");
		const skills = discoverSkills({ roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(skills.map((s) => s.name)).toEqual(["plan-it"]);
		expect(skills[0].body).toBe("Just a template body");
	});

	it("ignores readme.md", () => {
		writeFile("README.md", "should be skipped");
		writeFile("real-skill.md", "---\nname: real-skill\ndescription: x\n---\nbody");
		const skills = discoverSkills({ roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(skills.map((s) => s.name)).toEqual(["real-skill"]);
	});
});

describe("discoverSkills (nested layout)", () => {
	it("scans one directory deeper for layouts like pi/skills/pi-skills/<name>/SKILL.md", () => {
		writeFile("pi-skills/foo/SKILL.md", "---\nname: foo\ndescription: a\n---\nfoo body");
		writeFile("workflow/bar.md", "---\nname: bar\ndescription: b\n---\nbar body");
		const skills = discoverSkills({ roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(skills.map((s) => s.name).sort()).toEqual(["bar", "foo"]);
	});
});

describe("discoverSkills (last-wins on collision)", () => {
	it("user root overrides builtin root for the same skill name", () => {
		const builtinRoot = path.join(tmpRoot, "builtin");
		const userRoot = path.join(tmpRoot, "user");
		fs.mkdirSync(builtinRoot, { recursive: true });
		fs.mkdirSync(userRoot, { recursive: true });

		fs.mkdirSync(path.join(builtinRoot, "shared"), { recursive: true });
		fs.writeFileSync(
			path.join(builtinRoot, "shared", "SKILL.md"),
			"---\nname: shared\ndescription: from builtin\n---\nbuiltin",
			"utf-8",
		);
		fs.mkdirSync(path.join(userRoot, "shared"), { recursive: true });
		fs.writeFileSync(
			path.join(userRoot, "shared", "SKILL.md"),
			"---\nname: shared\ndescription: from user\n---\nuser",
			"utf-8",
		);

		const skills = discoverSkills({
			roots: [
				{ path: builtinRoot, source: "builtin" },
				{ path: userRoot, source: "user" },
			],
		});
		expect(skills.length).toBe(1);
		expect(skills[0].description).toBe("from user");
		expect(skills[0].source).toBe("user");
	});
});

describe("conditional activation via paths:", () => {
	it("filters out skills whose paths: glob does not match cwd", () => {
		writeFile(
			"py-only/SKILL.md",
			"---\nname: py-only\ndescription: x\npaths:\n  - **/python/**\n---\nbody",
		);
		writeFile("always/SKILL.md", "---\nname: always\ndescription: y\n---\nbody");

		const matched = discoverSkills({
			roots: [{ path: tmpRoot, source: "builtin" }],
			cwd: "/repo/python/proj",
		});
		expect(matched.map((s) => s.name).sort()).toEqual(["always", "py-only"]);

		const excluded = discoverSkills({
			roots: [{ path: tmpRoot, source: "builtin" }],
			cwd: "/repo/javascript/proj",
		});
		expect(excluded.map((s) => s.name)).toEqual(["always"]);
	});
});

describe("findSkillByName", () => {
	it("returns the first matching record", () => {
		writeFile("a/SKILL.md", "---\nname: a\ndescription: x\n---\n");
		writeFile("b/SKILL.md", "---\nname: b\ndescription: y\n---\n");
		const a = findSkillByName("a", { roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(a?.name).toBe("a");
		const missing = findSkillByName("nope", { roots: [{ path: tmpRoot, source: "builtin" }] });
		expect(missing).toBeNull();
	});
});

describe("metadata passthrough", () => {
	it("preserves unknown frontmatter keys on metadata", () => {
		writeFile(
			"weird/SKILL.md",
			"---\nname: weird\ndescription: x\nargs: <topic>\n---\nbody",
		);
		const skills = discoverSkills({ roots: [{ path: tmpRoot, source: "builtin" }] });
		const skill = skills.find((s: SkillRecord) => s.name === "weird")!;
		expect(skill.args).toBe("<topic>");
		expect(skill.metadata.description).toBe("x");
	});
});
