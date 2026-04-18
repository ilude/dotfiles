import { describe, expect, it, vi } from "vitest";
import { parseCommitPlan, validateCommitPlan, confirmCommitMessage, chooseFilesToCommit, proposeCommitMessage } from "../extensions/workflow-commands.ts";

describe("parseCommitPlan", () => {
	it("parses JSON wrapped in assistant prose", () => {
		const text = `Here is the plan:\n{"groups":[{"files":["a.ts"],"subject":"feat(pi): add planner"}]}`;
		const plan = parseCommitPlan(text);
		expect(plan.groups).toHaveLength(1);
		expect(plan.groups[0]?.files).toEqual(["a.ts"]);
	});

	it("throws when groups are missing", () => {
		expect(() => parseCommitPlan('{"warnings":[]}')).toThrow(/no commit groups/i);
	});
});

describe("validateCommitPlan", () => {
	it("accepts a valid full-coverage plan", () => {
		const plan = {
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add planner" },
				{ files: ["b.ts"], subject: "test(pi): cover planner" },
			],
		};
		expect(() => validateCommitPlan(plan, ["a.ts", "b.ts"])).not.toThrow();
	});

	it("rejects duplicate files across groups", () => {
		const plan = {
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add planner" },
				{ files: ["a.ts"], subject: "test(pi): cover planner" },
			],
		};
		expect(() => validateCommitPlan(plan, ["a.ts"])).toThrow(/multiple groups/i);
	});

	it("rejects omitted changed files", () => {
		const plan = {
			groups: [{ files: ["a.ts"], subject: "feat(pi): add planner" }],
		};
		expect(() => validateCommitPlan(plan, ["a.ts", "b.ts"])).toThrow(/omitted changed files/i);
	});

	it("rejects invalid conventional commit subjects", () => {
		const plan = {
			groups: [{ files: ["a.ts"], subject: "Add planner" }],
		};
		expect(() => validateCommitPlan(plan, ["a.ts"])).toThrow(/invalid conventional commit/i);
	});
});

// ---------------------------------------------------------------------------
// confirmCommitMessage — cancellation safety
// ---------------------------------------------------------------------------

describe("confirmCommitMessage", () => {
	const baseMessage = { subject: "feat(pi): add something" };
	const files = ["a.ts"];
	const stat = "a.ts | 5 ++-";

	it("returns the original message without prompting", async () => {
		const result = await confirmCommitMessage({}, baseMessage, files, stat, stat);
		expect(result).toEqual(baseMessage);
	});

	it("preserves body without prompting", async () => {
		const withBody = { subject: "feat(pi): original", body: "Detailed context." };
		const result = await confirmCommitMessage({}, withBody, files, stat, stat);
		expect(result).toEqual(withBody);
	});

	it("throws when subject violates conventional commit format", async () => {
		await expect(
			confirmCommitMessage({}, { subject: "This is not conventional" }, files, stat, stat),
		).rejects.toThrow(/conventional commit format/i);
	});
});

// ---------------------------------------------------------------------------
// chooseFilesToCommit — cancellation safety
// ---------------------------------------------------------------------------

describe("chooseFilesToCommit", () => {
	const changed = ["a.ts", "b.ts", "c.ts"];
	const staged = ["a.ts"];

	it("returns requested files when files are explicitly specified", async () => {
		const result = await chooseFilesToCommit({}, changed, staged, ["b.ts"]);
		expect(result.cancelled).toBe(false);
		expect(result.files).toEqual(["b.ts"]);
		expect(result.stageAll).toBe(true);
	});

	it("returns all changed files when nothing is staged", async () => {
		const result = await chooseFilesToCommit({}, changed, [], []);
		expect(result.cancelled).toBe(false);
		expect(result.files).toEqual(changed);
		expect(result.stageAll).toBe(true);
	});

	it("returns all changed files even when some files are already staged", async () => {
		const result = await chooseFilesToCommit({}, changed, staged, []);
		expect(result.cancelled).toBe(false);
		expect(result.files).toEqual(changed);
		expect(result.stageAll).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// parseCommitPlan multi-group
// ---------------------------------------------------------------------------

describe("parseCommitPlan multi-group", () => {
	it("parses a 3-group plan with body and warnings", () => {
		const json = JSON.stringify({
			groups: [
				{ files: ["src/api.ts", "src/db.ts"], subject: "feat(pi): add commit planner", body: "Implements LLM-based commit grouping" },
				{ files: ["src/api.test.ts"], subject: "test(pi): cover commit planner" },
				{ files: ["README.md"], subject: "docs(pi): document commit planner" },
			],
			warnings: ["large diff detected"],
		});
		const plan = parseCommitPlan(json);
		expect(plan.groups).toHaveLength(3);
		expect(plan.groups[0]?.body).toBe("Implements LLM-based commit grouping");
		expect(Array.isArray(plan.warnings)).toBe(true);
	});

	it("rejects a group with an empty files array", () => {
		const json = JSON.stringify({
			groups: [{ files: [], subject: "feat(pi): add planner" }],
		});
		expect(() => parseCommitPlan(json)).toThrow(/without valid files/i);
	});

	it("rejects a group with non-string file entries", () => {
		const json = JSON.stringify({
			groups: [{ files: [42], subject: "feat(pi): add planner" }],
		});
		expect(() => parseCommitPlan(json)).toThrow(/without valid files/i);
	});
});

// ---------------------------------------------------------------------------
// validateCommitPlan multi-group sequential staging
// ---------------------------------------------------------------------------

describe("validateCommitPlan multi-group sequential staging", () => {
	it("accepts a 3-group plan covering all changed files", () => {
		const plan = {
			groups: [
				{ files: ["src/api.ts", "src/db.ts"], subject: "feat(pi): add commit planner" },
				{ files: ["src/api.test.ts"], subject: "test(pi): cover commit planner" },
				{ files: ["README.md"], subject: "docs(pi): document commit planner" },
			],
		};
		const changedFiles = ["src/api.ts", "src/db.ts", "src/api.test.ts", "README.md"];
		expect(() => validateCommitPlan(plan, changedFiles)).not.toThrow();
	});

	it("rejects a group referencing a file not in changedFiles", () => {
		const plan = {
			groups: [
				{ files: ["src/api.ts"], subject: "feat(pi): add api" },
				{ files: ["untracked.ts"], subject: "test(pi): cover api" },
			],
		};
		expect(() => validateCommitPlan(plan, ["src/api.ts"])).toThrow(/unknown file/i);
	});

	it("preserves group order for sequential staging", () => {
		const plan = {
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): first commit" },
				{ files: ["b.ts"], subject: "fix(pi): second commit" },
				{ files: ["c.ts"], subject: "chore(pi): third commit" },
			],
		};
		expect(() => validateCommitPlan(plan, ["a.ts", "b.ts", "c.ts"])).not.toThrow();
		expect(plan.groups.map((g) => g.subject)).toEqual([
			"feat(pi): first commit",
			"fix(pi): second commit",
			"chore(pi): third commit",
		]);
	});
});

// ---------------------------------------------------------------------------
// proposeCommitMessage — planner-fallback path
// ---------------------------------------------------------------------------

describe("proposeCommitMessage", () => {
	const CONVENTIONAL_COMMIT_RE = /^(feat|fix|docs|chore|refactor|test|perf|ci|build)(\([^)]+\))?: [a-z0-9]/;

	it("docs-only files produce type docs", () => {
		const result = proposeCommitMessage(["README.md", "CHANGELOG.md"], "", "");
		expect(result.subject).toMatch(/^docs\(/);
	});

	it("test-only files produce type test", () => {
		const result = proposeCommitMessage(["pi/tests/foo.test.ts"], "", "");
		expect(result.subject).toMatch(/^test\(/);
	});

	it("pi/ files produce scope pi", () => {
		const result = proposeCommitMessage(["pi/extensions/workflow-commands.ts"], "", "");
		expect(result.subject).toMatch(/\(pi\):/);
	});

	it("hint is used as description", () => {
		const result = proposeCommitMessage(["pi/extensions/workflow-commands.ts"], "add planner fallback", "");
		expect(result.subject).toContain("add planner fallback");
	});

	it("result matches conventional commit regex", () => {
		const result = proposeCommitMessage(["pi/extensions/workflow-commands.ts"], "add planner fallback", "");
		expect(result.subject).toMatch(CONVENTIONAL_COMMIT_RE);
	});

	it("more than 3 files includes a body", () => {
		const files = ["pi/a.ts", "pi/b.ts", "pi/c.ts", "pi/d.ts"];
		const result = proposeCommitMessage(files, "", "");
		expect(result.body).toBeDefined();
		expect(result.body).toContain("4");
	});

	it("feat detected from diff containing registerCommand text", () => {
		const result = proposeCommitMessage(["pi/extensions/workflow-commands.ts"], "", "+registerCommand(");
		expect(result.subject).toMatch(/^feat\(/);
	});

	it("fix detected from diff containing fix text", () => {
		const result = proposeCommitMessage(["pi/extensions/workflow-commands.ts"], "", "+fix the bug");
		expect(result.subject).toMatch(/^fix\(/);
	});
});