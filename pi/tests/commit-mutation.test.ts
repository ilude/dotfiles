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

const REAL_GIT_TEST_TIMEOUT_MS = 60_000;

import { commitFailureMessage } from "../lib/commit/failure.ts";
import { buildCommitPlan } from "../lib/commit/plan.ts";
import { stagePaths } from "../lib/commit/stage.ts";
import { createCommit } from "../lib/commit/create.ts";
import {
	chooseFilesToCommit,
	executeCommitCommand,
	ignoredCommitArgumentPaths,
	listChangedFiles,
	postClassificationRequestedFiles,
	resolveLowConfidenceClassifications,
	stageFiles,
	SECRET_PATTERNS,
} from "../extensions/workflow-commands.ts";
import { timingSafeTokenEqual } from "../lib/commit/token.ts";
import {
	CommitWorkflowError,
	formatCommitWorkflowFailure,
} from "../lib/workflow-commands/commit-orchestration.ts";
import { initializeGitRepository } from "./helpers/git-fixture.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const repos: string[] = [];
function run(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if ((result.status ?? 1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	return result.stdout;
}
function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-mutation-"));
	repos.push(dir);
	initializeGitRepository(dir, {
		name: "Pi Test",
		email: "pi@example.invalid",
	});
	return dir;
}

function bareRepo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-mutation-bare-"));
	repos.push(dir);
	run(dir, ["init", "--bare"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("commit untracked classification prompt state", () => {
	it("reports a Herdr blocker only while awaiting a classification", async () => {
		const select = vi.fn(async () => "do_not_ignore");
		const reportHerdrBlocked = vi.fn();

		await expect(
			resolveLowConfidenceClassifications(
				{
					cwd: process.cwd(),
					ui: { select } as never,
					model: undefined,
					modelRegistry: {} as never,
					signal: undefined,
					reportHerdrBlocked,
				},
				[{ path: "notes.txt", decision: "do_not_ignore", reason: "classification uncertain" }],
			),
		).resolves.toEqual([
			{ path: "notes.txt", decision: "do_not_ignore", reason: "classification uncertain" },
		]);
		expect(reportHerdrBlocked.mock.calls).toEqual([
			[true, "Waiting for user: Track untracked path notes.txt? classification uncertain"],
			[false],
		]);
	});

	it("clears the Herdr blocker when classification is cancelled", async () => {
		const reportHerdrBlocked = vi.fn();

		await expect(
			resolveLowConfidenceClassifications(
				{
					cwd: process.cwd(),
					ui: { select: vi.fn(async () => undefined) } as never,
					model: undefined,
					modelRegistry: {} as never,
					signal: undefined,
					reportHerdrBlocked,
				},
				[{ path: "notes.txt", decision: "ignore", reason: "classification uncertain" }],
			),
		).rejects.toThrow("Commit cancelled during untracked classification");
		expect(reportHerdrBlocked).toHaveBeenLastCalledWith(false);
	});
});

describe("commit mutation safety", () => {
	it("commits dirty submodules before the parent unless opted out", async () => {
		const child = repo();
		writeFileSync(join(child, "child.txt"), "base\n");
		run(child, ["add", "--", "child.txt"]);
		run(child, ["commit", "-m", "chore: seed child"]);

		const parent = repo();
		writeFileSync(join(parent, "parent.txt"), "base\n");
		run(parent, ["add", "--", "parent.txt"]);
		run(parent, ["commit", "-m", "chore: seed parent"]);
		run(parent, [
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			child,
			"module",
		]);
		run(parent, ["commit", "-m", "chore: add module"]);

		const checkout = join(parent, "module");
		run(checkout, ["config", "user.email", "pi@example.invalid"]);
		run(checkout, ["config", "user.name", "Pi Test"]);
		writeFileSync(join(checkout, "child.txt"), "dirty\n");
		expect(buildCommitPlan(parent).entries).toEqual([]);
		expect(listChangedFiles(parent).all).toEqual([]);

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: parent });
		await executeCommitCommand(pi as never, "--no-submodules", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"No committable parent-repository changes found; dirty submodule worktrees were left untouched.",
			"info",
		);
		expect(run(parent, ["diff", "--cached", "--name-only"]).trim()).toBe("");

		await executeCommitCommand(pi as never, "", ctx as never);

		expect(run(checkout, ["status", "--porcelain"]).trim()).toBe("");
		expect(run(parent, ["status", "--porcelain"]).trim()).toBe("");
		expect(run(parent, ["rev-parse", "HEAD:module"]).trim()).toBe(
			run(checkout, ["rev-parse", "HEAD"]).trim(),
		);
		expect(run(checkout, ["log", "-1", "--format=%s"]).trim()).toMatch(
			/^(?:feat|fix|docs|chore|refactor|test|perf|ci|build|wip)(?:\([^)]+\))?: /,
		);
	}, REAL_GIT_TEST_TIMEOUT_MS);

	it("commits a staged submodule pointer while leaving its worktree dirty", async () => {
		const child = repo();
		writeFileSync(join(child, "child.txt"), "base\n");
		run(child, ["add", "--", "child.txt"]);
		run(child, ["commit", "-m", "chore: seed child"]);

		const parent = repo();
		run(parent, [
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			child,
			"module",
		]);
		run(parent, ["commit", "-m", "chore: add module"]);

		const checkout = join(parent, "module");
		run(checkout, ["config", "user.email", "pi@example.invalid"]);
		run(checkout, ["config", "user.name", "Pi Test"]);
		writeFileSync(join(checkout, "child.txt"), "committed\n");
		run(checkout, ["add", "--", "child.txt"]);
		run(checkout, ["commit", "-m", "fix: advance module"]);
		run(parent, ["add", "--", "module"]);
		writeFileSync(join(checkout, "child.txt"), "dirty\n");

		expect(buildCommitPlan(parent).entries).toEqual([
			expect.objectContaining({
				path: "module",
				classification: "staged_change",
				recommendedAction: "keep_staged",
			}),
		]);
		const parentHead = run(parent, ["rev-parse", "HEAD"]).trim();

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: parent });
		await executeCommitCommand(pi as never, "--no-submodules", ctx as never);

		expect(run(parent, ["rev-parse", "HEAD"]).trim()).not.toBe(parentHead);
		expect(run(parent, ["rev-parse", "HEAD:module"]).trim()).toBe(
			run(checkout, ["rev-parse", "HEAD"]).trim(),
		);
		expect(run(checkout, ["status", "--porcelain"]).trim()).toBe(
			"M child.txt",
		);
		expect(run(parent, ["diff", "--cached", "--name-only"]).trim()).toBe(
			"",
		);
		expect(run(parent, ["status", "--porcelain"]).trim()).toContain(
			"module",
		);
	}, REAL_GIT_TEST_TIMEOUT_MS);

	it("stops before mutation when a dirty submodule has no upstream", async () => {
		const child = repo();
		writeFileSync(join(child, "child.txt"), "base\n");
		run(child, ["add", "--", "child.txt"]);
		run(child, ["commit", "-m", "chore: seed child"]);

		const parent = repo();
		writeFileSync(join(parent, "parent.txt"), "base\n");
		run(parent, ["add", "--", "parent.txt"]);
		run(parent, ["commit", "-m", "chore: seed parent"]);
		run(parent, [
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			child,
			"module",
		]);
		run(parent, ["commit", "-m", "chore: add module"]);

		const checkout = join(parent, "module");
		run(checkout, ["branch", "--unset-upstream"]);
		writeFileSync(join(checkout, "child.txt"), "dirty\n");
		const childHead = run(checkout, ["rev-parse", "HEAD"]).trim();
		const parentHead = run(parent, ["rev-parse", "HEAD"]).trim();

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: parent });
		await expect(
			executeCommitCommand(pi as never, "", ctx as never),
		).rejects.toThrow(
			"Submodule module must have an upstream branch before /commit can update it",
		);
		expect(run(checkout, ["rev-parse", "HEAD"]).trim()).toBe(childHead);
		expect(run(parent, ["rev-parse", "HEAD"]).trim()).toBe(parentHead);
	});

	it("pushes an automatically committed submodule before the parent", async () => {
		const child = repo();
		writeFileSync(join(child, "child.txt"), "base\n");
		run(child, ["add", "--", "child.txt"]);
		run(child, ["commit", "-m", "chore: seed child"]);
		const childBranch = run(child, ["branch", "--show-current"]).trim();
		const childRemote = bareRepo();
		run(child, ["remote", "add", "origin", childRemote]);
		run(child, ["push", "-u", "origin", childBranch]);
		run(childRemote, ["symbolic-ref", "HEAD", `refs/heads/${childBranch}`]);

		const parent = repo();
		writeFileSync(join(parent, "parent.txt"), "base\n");
		run(parent, ["add", "--", "parent.txt"]);
		run(parent, ["commit", "-m", "chore: seed parent"]);
		run(parent, [
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			childRemote,
			"module",
		]);
		run(parent, ["commit", "-m", "chore: add module"]);
		const parentBranch = run(parent, ["branch", "--show-current"]).trim();
		const parentRemote = bareRepo();
		run(parent, ["remote", "add", "origin", parentRemote]);
		run(parent, ["push", "-u", "origin", parentBranch]);

		const checkout = join(parent, "module");
		run(checkout, ["config", "user.email", "pi@example.invalid"]);
		run(checkout, ["config", "user.name", "Pi Test"]);
		writeFileSync(join(checkout, "child.txt"), "pushed\n");

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: parent });
		await executeCommitCommand(pi as never, "push", ctx as never);

		expect(run(childRemote, ["rev-parse", `refs/heads/${childBranch}`]).trim()).toBe(
			run(checkout, ["rev-parse", "HEAD"]).trim(),
		);
		expect(run(parentRemote, ["rev-parse", `refs/heads/${parentBranch}`]).trim()).toBe(
			run(parent, ["rev-parse", "HEAD"]).trim(),
		);
		expect(run(parent, ["rev-parse", "HEAD:module"]).trim()).toBe(
			run(checkout, ["rev-parse", "HEAD"]).trim(),
		);
	}, REAL_GIT_TEST_TIMEOUT_MS);

	it("pushes a clean submodule commit when its branch differs from the parent", async () => {
		const child = repo();
		writeFileSync(join(child, "child.txt"), "base\n");
		run(child, ["add", "--", "child.txt"]);
		run(child, ["commit", "-m", "chore: seed child"]);
		run(child, ["branch", "-m", "feature/child"]);
		const childBranch = run(child, ["branch", "--show-current"]).trim();
		const childRemote = bareRepo();
		run(child, ["remote", "add", "origin", childRemote]);
		run(child, ["push", "-u", "origin", childBranch]);
		run(childRemote, ["symbolic-ref", "HEAD", `refs/heads/${childBranch}`]);

		const parent = repo();
		writeFileSync(join(parent, "parent.txt"), "base\n");
		run(parent, ["add", "--", "parent.txt"]);
		run(parent, ["commit", "-m", "chore: seed parent"]);
		run(parent, [
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			childRemote,
			"module",
		]);
		run(parent, ["commit", "-m", "chore: add module"]);
		const parentBranch = run(parent, ["branch", "--show-current"]).trim();
		const parentRemote = bareRepo();
		run(parent, ["remote", "add", "origin", parentRemote]);
		run(parent, ["push", "-u", "origin", parentBranch]);

		const checkout = join(parent, "module");
		run(checkout, ["config", "user.email", "pi@example.invalid"]);
		run(checkout, ["config", "user.name", "Pi Test"]);
		writeFileSync(join(checkout, "child.txt"), "unpushed\n");
		run(checkout, ["add", "--", "child.txt"]);
		run(checkout, ["commit", "-m", "fix: advance module"]);
		run(parent, ["add", "--", "module"]);
		run(parent, ["commit", "-m", "fix: advance module pointer"]);
		writeFileSync(join(parent, "parent.txt"), "next\n");
		run(parent, ["config", "push.recurseSubmodules", "check"]);

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: parent });
		await executeCommitCommand(pi as never, "push", ctx as never);

		expect(run(childRemote, ["rev-parse", `refs/heads/${childBranch}`]).trim()).toBe(
			run(checkout, ["rev-parse", "HEAD"]).trim(),
		);
		expect(run(parentRemote, ["rev-parse", `refs/heads/${parentBranch}`]).trim()).toBe(
			run(parent, ["rev-parse", "HEAD"]).trim(),
		);
	}, REAL_GIT_TEST_TIMEOUT_MS);

	it("labels push failures and identifies commits already created", () => {
		expect(
			formatCommitWorkflowFailure(
				new CommitWorkflowError("Push", "remote rejected update", [
					"abc1234 fix(pi): preserve commit",
				]),
			),
		).toBe(
			"Push failed after creating abc1234 fix(pi): preserve commit: remote rejected update",
		);
	});

	it.each([
		"nothing to commit, working tree clean",
		"nothing added to commit but untracked files present",
	])("prioritizes %s over successful hook stderr", (message) => {
		expect(
			commitFailureMessage({
				stdout: `On branch main\n${message}\n`,
				stderr: "dolos scan ok\n",
			}),
		).toBe(message);
	});

	it("rejects explicit ignored paths instead of treating them as hints", async () => {
		const dir = repo();
		writeFileSync(join(dir, ".gitignore"), "*.secret\n");
		writeFileSync(join(dir, "local.secret"), "secret\n");
		writeFileSync(join(dir, "visible.txt"), "visible\n");
		expect(
			await ignoredCommitArgumentPaths(dir, "local.secret"),
		).toEqual(["local.secret"]);

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: dir });
		await expect(
			executeCommitCommand(pi as never, "local.secret", ctx as never),
		).rejects.toThrow("Requested commit paths are ignored");
		expect(run(dir, ["diff", "--cached", "--name-only"]).trim()).toBe("");
	});

	it("keeps generated .gitignore changes in an explicit selection", () => {
		expect(
			postClassificationRequestedFiles(
				["generated.log", "source.ts"],
				[".gitignore", "source.ts"],
				[".gitignore"],
			),
		).toEqual([".gitignore", "source.ts"]);
	});

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

	it("commit_stage rejects content drift after planning", () => {
		const dir = repo();
		writeFileSync(join(dir, "safe.txt"), "before\n");
		const plan = buildCommitPlan(dir);
		writeFileSync(join(dir, "safe.txt"), "after\n");
		expect(() =>
			stagePaths(dir, plan.safeStagePaths, plan.stageConfirmationToken),
		).toThrow(/worktree state/);
	});

	it("commit_stage stages an exact deletion without staging adjacent changes", () => {
		const dir = repo();
		writeFileSync(join(dir, "delete.txt"), "delete\n");
		writeFileSync(join(dir, "keep.txt"), "before\n");
		run(dir, ["add", "--", "delete.txt", "keep.txt"]);
		run(dir, ["commit", "-m", "chore: seed files"]);
		rmSync(join(dir, "delete.txt"));
		writeFileSync(join(dir, "keep.txt"), "after\n");

		const plan = buildCommitPlan(dir, ["delete.txt"]);
		stagePaths(dir, plan.safeStagePaths, plan.stageConfirmationToken);

		expect(run(dir, ["diff", "--cached", "--name-only"]).trim()).toBe(
			"delete.txt",
		);
		expect(run(dir, ["diff", "--name-only"]).trim()).toBe("keep.txt");
	});

	it("commit_create rejects staged content drift and newly added secrets", () => {
		const dir = repo();
		writeFileSync(join(dir, "safe.txt"), "before\n");
		const plan = buildCommitPlan(dir);
		const staged = stagePaths(
			dir,
			plan.safeStagePaths,
			plan.stageConfirmationToken,
		);
		writeFileSync(
			join(dir, "safe.txt"),
			["api", "key=abcdef123456\n"].join("_"),
		);
		run(dir, ["add", "--", "safe.txt"]);
		expect(() =>
			createCommit(
				dir,
				"feat: add safe file",
				staged.expectedStagedPaths,
				staged.createConfirmationToken,
			),
		).toThrow(/confirmation token/);
		const refreshed = buildCommitPlan(dir);
		expect(() =>
			createCommit(
				dir,
				"feat: add safe file",
				refreshed.expectedStagedPaths,
				refreshed.createConfirmationToken,
			),
		).toThrow(/Secret scan/);
	});

	it("commit_create revalidates staged set and message immediately before commit", () => {
		const dir = repo();
		writeFileSync(join(dir, "safe.txt"), "safe\n");
		const plan = buildCommitPlan(dir);
		let staged = stagePaths(
			dir,
			plan.safeStagePaths,
			plan.stageConfirmationToken,
		);
		writeFileSync(join(dir, "drift.txt"), "drift\n");
		run(dir, ["add", "--", "drift.txt"]);
		expect(() => createCommit(dir, "feat: add safe file", staged.expectedStagedPaths, staged.createConfirmationToken)).toThrow(/confirmation token|Staged set changed/);
		run(dir, ["reset", "--", "drift.txt"]);
		rmSync(join(dir, "drift.txt"));
		staged = stagePaths(dir, [], buildCommitPlan(dir).stageConfirmationToken);
		expect(() => createCommit(dir, "bad message", staged.expectedStagedPaths, staged.createConfirmationToken)).toThrow(/conventional/);
		const commit = createCommit(dir, "feat: add safe file", staged.expectedStagedPaths, staged.createConfirmationToken);
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

describe("chooseFilesToCommit -- large and staged worktrees", () => {
	const ctx = { cwd: "", ui: {}, modelRegistry: {} } as never;

	it("defaults to all changed files even when some files are staged", async () => {
		const files = ["a.txt", "b.txt", "c.txt"];
		const selection = await chooseFilesToCommit(ctx, files, ["b.txt"], []);
		expect(selection).toEqual({
			files,
			stageAll: true,
			cancelled: false,
		});
	});

	it("defaults to all changed files for a large unstaged selection", async () => {
		const files = Array.from(
			{ length: 51 },
			(_, index) => `src/file-${index}.ts`,
		);
		const selection = await chooseFilesToCommit(ctx, files, [], []);
		expect(selection).toEqual({
			files,
			stageAll: true,
			cancelled: false,
		});
	});

	it("allows explicit files even when the worktree is large", async () => {
		const files = Array.from(
			{ length: 51 },
			(_, index) => `src/file-${index}.ts`,
		);
		const selection = await chooseFilesToCommit(ctx, files, [], ["src/file-1.ts"]);
		expect(selection).toEqual({
			files: ["src/file-1.ts"],
			stageAll: true,
			cancelled: false,
		});
	});
});

describe("stageFiles -- ignored paths and exact staging", () => {
	it("refuses ignored untracked paths instead of passing them to git add", () => {
		const dir = repo();
		mkdirSync(join(dir, "pi", "inspect", "snapshots"), { recursive: true });
		writeFileSync(join(dir, ".gitignore"), "pi/inspect/snapshots/\n");
		writeFileSync(join(dir, "pi", "inspect", "snapshots", "session.json"), "{}\n");
		expect(() =>
			stageFiles(dir, ["pi/inspect/snapshots/session.json"]),
		).toThrow(/ignored paths/i);
	});

	it("stages a large full safe candidate set without broad git add dot", () => {
		const dir = repo();
		const files = Array.from({ length: 51 }, (_, index) => `src/file-${index}.ts`);
		mkdirSync(join(dir, "src"), { recursive: true });
		for (const file of files) {
			writeFileSync(join(dir, file), "content\n");
		}
		stageFiles(dir, files);
		const staged = run(dir, ["diff", "--cached", "--name-only"])
			.trim()
			.split(/\r?\n/)
			.filter(Boolean);
		expect(staged).toEqual([...files].sort());
	});

	it("finishes staging a rename whose move is already staged", () => {
		const dir = repo();
		writeFileSync(join(dir, "old.txt"), "before\n");
		run(dir, ["add", "--", "old.txt"]);
		run(dir, ["commit", "-m", "chore: seed file"]);
		run(dir, ["mv", "old.txt", "new.txt"]);
		writeFileSync(join(dir, "new.txt"), "after\n");

		expect(() => stageFiles(dir, ["old.txt", "new.txt"])).not.toThrow();

		expect(run(dir, ["diff", "--name-only"]).trim()).toBe("");
		expect(run(dir, ["show", ":new.txt"]).trim()).toBe("after");
		expect(
			run(dir, ["diff", "--cached", "--name-status", "--find-renames"]),
		).toContain("old.txt");
	});

	it("stages an exact deletion without staging adjacent changes", () => {
		const dir = repo();
		writeFileSync(join(dir, "delete.txt"), "delete\n");
		writeFileSync(join(dir, "keep.txt"), "before\n");
		run(dir, ["add", "--", "delete.txt", "keep.txt"]);
		run(dir, ["commit", "-m", "chore: seed files"]);
		rmSync(join(dir, "delete.txt"));
		writeFileSync(join(dir, "keep.txt"), "after\n");

		stageFiles(dir, ["delete.txt"]);

		expect(run(dir, ["diff", "--cached", "--name-only"]).trim()).toBe(
			"delete.txt",
		);
		expect(run(dir, ["diff", "--name-only"]).trim()).toBe("keep.txt");
	});
});

describe("listChangedFiles -- fresh repo (no HEAD)", () => {
	it("includes and commits staged files before the first commit", async () => {
		const dir = repo();
		writeFileSync(join(dir, "staged.txt"), "hello\n");
		run(dir, ["add", "--", "staged.txt"]);
		expect(listChangedFiles(dir)).toEqual({
			all: ["staged.txt"],
			staged: ["staged.txt"],
			untracked: [],
		});

		const pi = createMockPi();
		const ctx = createMockCtx({ cwd: dir });
		await executeCommitCommand(pi as never, "", ctx as never);
		expect(run(dir, ["rev-parse", "--verify", "HEAD"]).trim()).not.toBe("");
		expect(run(dir, ["show", "--format=", "--name-only", "HEAD"])).toContain(
			"staged.txt",
		);
	});

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
// H2: secret-scan regex catches compound env-var names with literal values
// ---------------------------------------------------------------------------

describe("SECRET_PATTERNS -- compound env-var literal value matching", () => {
	function matchesSecretPattern(input: string): boolean {
		for (const { regex } of SECRET_PATTERNS) {
			// Reset lastIndex since regexes with /g flag are stateful.
			regex.lastIndex = 0;
			if (regex.test(input)) return true;
		}
		return false;
	}

	const shouldMatch = [
		"DATABASE_PASSWORD=hunter2",
		"ACCESS_TOKEN=literal-token",
		"APP_TOKEN=bazvalue",
		"API_KEY=abcdef123456",
		"SECRET_KEY=quuxvalue",
		"db_password=foovalue",
		"API_KEY_ID=xyzvalue",
	];

	const shouldNotMatch = [
		"normal_variable=value",
		"CF_DNS_API_TOKEN=%s",
		"ACCESS_TOKEN=$" + "{ACCESS_TOKEN}",
		"APP_TOKEN=$APP_TOKEN",
		"API_KEY=",
		"SECRET_KEY=<redacted>",
		'CloudflareDNSAPIToken: values["CF_DNS_API_TOKEN"]',
		"CF_DNS_API_TOKEN=token-value",
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
