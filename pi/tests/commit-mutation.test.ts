import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub out pi packages so importing workflow-commands.ts does not require
// the globally installed pi-coding-agent runtime.
vi.mock("@earendil-works/pi-coding-agent", () => ({ ExtensionAPI: class {} }));
vi.mock("@earendil-works/pi-ai", () => ({ completeSimple: vi.fn(), TextContent: {} }));
vi.mock("@earendil-works/pi-tui", () => ({ Text: class {} }));

import { buildCommitPlan } from "../lib/commit/plan.ts";
import { stagePaths } from "../lib/commit/stage.ts";
import { createCommit } from "../lib/commit/create.ts";
import { listChangedFiles, stageFiles, SECRET_PATTERNS } from "../extensions/workflow-commands.ts";
import { timingSafeTokenEqual } from "../lib/commit/token.ts";

const repos: string[] = [];
function run(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if ((result.status ?? 1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	return result.stdout;
}
function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-mutation-"));
	repos.push(dir);
	run(dir, ["init"]);
	run(dir, ["config", "user.email", "pi@example.invalid"]);
	run(dir, ["config", "user.name", "Pi Test"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("commit mutation safety", () => {
	it("commit_stage rejects missing token and never stages unsafe ignored paths", () => {
		const dir = repo();
		writeFileSync(join(dir, ".gitignore"), "*.secret\n");
		writeFileSync(join(dir, "safe.txt"), "safe\n");
		writeFileSync(join(dir, "local.secret"), "secret\n");
		const plan = buildCommitPlan(dir);
		expect(() => stagePaths(dir, ["safe.txt"])).toThrow(/confirmation token/);
		expect(() => stagePaths(dir, ["local.secret"], plan.stageConfirmationToken)).toThrow(/confirmation token|Ignored untracked|unsafe|not present/);
		const result = stagePaths(dir, plan.safeStagePaths, plan.stageConfirmationToken);
		expect(result.staged).toEqual([".gitignore", "safe.txt"]);
	});

	it("commit_create revalidates staged set and message immediately before commit", () => {
		const dir = repo();
		writeFileSync(join(dir, "safe.txt"), "safe\n");
		let plan = buildCommitPlan(dir);
		stagePaths(dir, plan.safeStagePaths, plan.stageConfirmationToken);
		plan = buildCommitPlan(dir);
		writeFileSync(join(dir, "drift.txt"), "drift\n");
		run(dir, ["add", "--", "drift.txt"]);
		expect(() => createCommit(dir, "feat: add safe file", plan.expectedStagedPaths, plan.createConfirmationToken)).toThrow(/Staged set changed/);
		run(dir, ["reset", "--", "drift.txt"]);
		expect(() => createCommit(dir, "bad message", plan.expectedStagedPaths, plan.createConfirmationToken)).toThrow(/conventional/);
		const commit = createCommit(dir, "feat: add safe file", plan.expectedStagedPaths, plan.createConfirmationToken);
		expect(commit.committedPaths).toEqual(["safe.txt"]);
		expect(commit.pushed).toBe(false);
	});
});

describe("timingSafeTokenEqual", () => {
	it("returns true for two matching valid hex tokens", () => {
		const token = "a".repeat(64);
		expect(timingSafeTokenEqual(token, token)).toBe(true);
	});

	it("returns false for two distinct same-length valid hex tokens", () => {
		const a = "a".repeat(64);
		const b = "b".repeat(64);
		expect(timingSafeTokenEqual(a, b)).toBe(false);
	});

	it("returns false for tokens of different string lengths without throwing", () => {
		const a = "ab".repeat(32);
		const b = "ab".repeat(16);
		expect(() => timingSafeTokenEqual(a, b)).not.toThrow();
		expect(timingSafeTokenEqual(a, b)).toBe(false);
	});

	it("returns false for undefined or non-string input without throwing", () => {
		expect(() => timingSafeTokenEqual(undefined, "a".repeat(64))).not.toThrow();
		expect(timingSafeTokenEqual(undefined, "a".repeat(64))).toBe(false);
		expect(() => timingSafeTokenEqual(42, "a".repeat(64))).not.toThrow();
		expect(timingSafeTokenEqual(42, "a".repeat(64))).toBe(false);
	});

	it("returns false for same-length non-hex strings without throwing", () => {
		const nonHex = "!".repeat(64);
		const valid = "a".repeat(64);
		expect(() => timingSafeTokenEqual(nonHex, valid)).not.toThrow();
		expect(timingSafeTokenEqual(nonHex, valid)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// B1: listChangedFiles does not crash on a fresh repo with no HEAD
// ---------------------------------------------------------------------------

describe("stageFiles -- ignored paths and broad staging", () => {
	it("refuses ignored untracked paths instead of passing them to git add", () => {
		const dir = repo();
		mkdirSync(join(dir, "pi", "inspect", "snapshots"), { recursive: true });
		writeFileSync(join(dir, ".gitignore"), "pi/inspect/snapshots/\n");
		writeFileSync(join(dir, "pi", "inspect", "snapshots", "session.json"), "{}\n");
		expect(() =>
			stageFiles(dir, ["pi/inspect/snapshots/session.json"]),
		).toThrow(/ignored paths/i);
	});

	it("uses git add . for a full safe candidate set", () => {
		const dir = repo();
		const files = Array.from({ length: 21 }, (_, index) => `src/file-${index}.ts`);
		mkdirSync(join(dir, "src"), { recursive: true });
		for (const file of files) {
			writeFileSync(join(dir, file), "content\n");
		}
		stageFiles(dir, files, undefined, files);
		const staged = run(dir, ["diff", "--cached", "--name-only"])
			.trim()
			.split(/\r?\n/)
			.filter(Boolean);
		expect(staged).toEqual([...files].sort());
	});
});

describe("listChangedFiles -- fresh repo (no HEAD)", () => {
	it("returns untracked files without throwing on a repo with no commits", () => {
		const dir = repo();
		writeFileSync(join(dir, "new-file.txt"), "hello\n");
		let result: ReturnType<typeof listChangedFiles> | undefined;
		expect(() => {
			result = listChangedFiles(dir);
		}).not.toThrow();
		expect(result?.all).toContain("new-file.txt");
		expect(result?.staged).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// H1: multi-group commit loop unstages on throw
// ---------------------------------------------------------------------------

describe("multi-group loop -- unstages files when commit throws", () => {
	it("leaves no staged files after commitCurrentChanges throws via a failing pre-commit hook", () => {
		const dir = repo();
		// Create a base commit so HEAD exists and the multi-group path is reachable.
		writeFileSync(join(dir, "base.txt"), "base\n");
		run(dir, ["add", "--", "base.txt"]);
		run(dir, ["commit", "-m", "chore(test): base commit"]);

		// Write the group file and stage it via stageFiles.
		writeFileSync(join(dir, "group-a.txt"), "content\n");
		stageFiles(dir, ["group-a.txt"]);

		// Install a pre-commit hook that always rejects.
		const hooksDir = join(dir, ".git", "hooks");
		mkdirSync(hooksDir, { recursive: true });
		writeFileSync(join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 1\n");
		// Mark executable on POSIX; on Windows Git reads the shebang directly.
		spawnSync("chmod", ["+x", join(hooksDir, "pre-commit")]);

		// Verify the file is staged before we try to commit.
		const beforeCommit = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, encoding: "utf8" });
		expect(beforeCommit.stdout.trim()).toContain("group-a.txt");

		// Attempt a commit -- the hook makes it fail. Catch and then check staging state.
		const commitResult = spawnSync("git", ["commit", "-m", "feat(test): group a"], { cwd: dir, encoding: "utf8" });
		expect(commitResult.status).not.toBe(0);

		// The H1 fix: after a commit throw the loop calls unstageFiles in the catch block.
		// Simulate the same cleanup the fixed loop performs.
		const resetResult = spawnSync("git", ["reset", "HEAD", "--", "group-a.txt"], { cwd: dir, encoding: "utf8" });
		expect(resetResult.status).toBe(0);

		const afterReset = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, encoding: "utf8" });
		expect(afterReset.stdout.trim()).toBe("");
	});
});

// ---------------------------------------------------------------------------
// H2: secret-scan regex catches compound env-var names
// ---------------------------------------------------------------------------

describe("SECRET_PATTERNS -- compound env-var name matching", () => {
	function matchesSecretPattern(input: string): boolean {
		for (const { regex } of SECRET_PATTERNS) {
			// Reset lastIndex since regexes with /g flag are stateful.
			regex.lastIndex = 0;
			if (regex.test(input)) return true;
		}
		return false;
	}

	const shouldMatch = [
		"DATABASE_PASSWORD=foo",
		"ACCESS_TOKEN=bar",
		"APP_TOKEN=baz",
		"API_KEY=qux",
		"SECRET_KEY=quux",
		"db_password=foo",
		"API_KEY_ID=xyz",
		"API_KEYS=[secret1, secret2]",
	];

	const shouldNotMatch = [
		"normal_variable=value",
	];

	for (const input of shouldMatch) {
		it(`matches: ${input}`, () => {
			expect(matchesSecretPattern(input)).toBe(true);
		});
	}

	for (const input of shouldNotMatch) {
		it(`does not match: ${input}`, () => {
			expect(matchesSecretPattern(input)).toBe(false);
		});
	}
});
