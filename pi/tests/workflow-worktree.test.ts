import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeWorkflowWorktree, ensureWorkflowWorktree, materializePlanInWorkflowWorktree, parseWorktreeListPorcelain, readWorkflowOwnershipRecord, verifyAndCleanupWorkflowWorktree } from "../lib/workflow-worktree.js";

const roots: string[] = [];

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function runner(cwd: string, args: string[]) {
	try {
		return { code: 0, stdout: git(cwd, args), stderr: "" };
	} catch (error) {
		const failure = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
		return { code: failure.status ?? 1, stdout: String(failure.stdout ?? ""), stderr: String(failure.stderr ?? "") };
	}
}

function completePlan(): string {
	return [
		"---",
		"status: complete",
		"---",
		"",
		"## Tasks",
		"",
		"- [x] **T1: Finish work**",
		"  - State: completed",
		"",
		"## Execution Status",
		"",
		"- State: complete",
		"",
	].join("\n");
}

function repo(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workflow-worktree-"));
	roots.push(root);
	git(root, ["init", "-q"]);
	git(root, ["config", "user.name", "Pi Test"]);
	git(root, ["config", "user.email", "pi@example.invalid"]);
	fs.writeFileSync(path.join(root, "README.md"), "initial\n");
	git(root, ["add", "."]);
	git(root, ["commit", "-q", "-m", "test: initialize"]);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("workflow worktree lifecycle", () => {
	it("parses all porcelain records and branches", () => {
		expect(parseWorktreeListPorcelain("worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/.worktrees/x\nHEAD def\nbranch refs/heads/workflow/x\n")).toEqual([
			{ path: path.resolve("/repo"), branch: "main" },
			{ path: path.resolve("/repo/.worktrees/x"), branch: "workflow/x" },
		]);
	});

	it("creates one owned worktree and resumes it deterministically from a secondary worktree", async () => {
		const root = repo();
		const first = await ensureWorkflowWorktree({ cwd: root, workflow: "plan-it", workflowId: "plan-it:fixture", slug: "fixture", runner });
		const secondary = path.join(root, ".worktrees", "secondary");
		git(root, ["worktree", "add", "-q", "-b", "secondary", secondary]);
		const second = await ensureWorkflowWorktree({ cwd: secondary, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		expect(first.resumed).toBe(false);
		expect(second.resumed).toBe(true);
		expect(second.ownership.primaryWorktree).toBe(root);
		expect(second.ownership.primaryBranch).toBe(git(root, ["branch", "--show-current"]));
	});

	it("does not inspect primary cleanliness when resuming owned work", async () => {
		const root = repo();
		const first = await ensureWorkflowWorktree({ cwd: root, workflow: "plan-it", workflowId: "plan-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(root, "dirty.txt"), "keep\n");
		const resumed = await ensureWorkflowWorktree({ cwd: first.ownership.worktree, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		expect(resumed.resumed).toBe(true);
	});

	it("creates plan work from a dirty primary without changing the dirty state", async () => {
		const root = repo();
		fs.writeFileSync(path.join(root, "README.md"), "dirty\n");
		fs.writeFileSync(path.join(root, "untracked.txt"), "keep\n");
		const status = git(root, ["status", "--porcelain=v1"]);
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "plan-it", workflowId: "plan-it:fixture", slug: "fixture", runner });
		expect(worktree.resumed).toBe(false);
		expect(git(root, ["status", "--porcelain=v1"])).toBe(status);
		expect(git(worktree.ownership.worktree, ["show", "HEAD:README.md"])).toBe("initial");
	});

	it.each(["do-it", "goal"] as const)("rejects a dirty primary when creating new %s work", async (workflow) => {
		const root = repo();
		fs.writeFileSync(path.join(root, "dirty.txt"), "keep\n");
		await expect(ensureWorkflowWorktree({ cwd: root, workflow, workflowId: `${workflow}:fixture`, slug: "fixture", runner })).rejects.toThrow(/primary worktree is dirty/);
	});

	it("transfers an untracked canonical spec while preserving unrelated primary changes", async () => {
		const root = repo();
		const planPath = ".specs/fixture/plan.md";
		fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
		fs.writeFileSync(path.join(root, planPath), "plan\n");
		fs.writeFileSync(path.join(root, "unrelated.txt"), "keep\n");
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner, allowDirtyPrimary: true });
		expect(await materializePlanInWorkflowWorktree({ worktree, planPath, runner })).toBe("transferred");
		expect(fs.existsSync(path.join(root, planPath))).toBe(false);
		expect(fs.readFileSync(path.join(worktree.ownership.worktree, planPath), "utf8")).toBe("plan\n");
		expect(fs.readFileSync(path.join(root, "unrelated.txt"), "utf8")).toBe("keep\n");
	});

	it("copies an ignored canonical spec without removing or tracking the primary copy", async () => {
		const root = repo();
		fs.writeFileSync(path.join(root, ".gitignore"), ".specs/\n");
		git(root, ["add", ".gitignore"]);
		git(root, ["commit", "-q", "-m", "test: ignore specs"]);
		const planPath = ".specs/fixture/plan.md";
		fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
		fs.writeFileSync(path.join(root, planPath), "ignored plan\n");
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner, allowDirtyPrimary: true });
		expect(await materializePlanInWorkflowWorktree({ worktree, planPath, runner })).toBe("ignored");
		expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe("ignored plan\n");
		expect(fs.readFileSync(path.join(worktree.ownership.worktree, planPath), "utf8")).toBe("ignored plan\n");
		expect(git(root, ["status", "--porcelain=v1", "--", ".specs"])).toBe("");
	});

	it("transfers an unstaged modified tracked plan and cleans the primary copy", async () => {
		const root = repo();
		const planPath = ".specs/fixture/plan.md";
		fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
		fs.writeFileSync(path.join(root, planPath), "tracked\n");
		git(root, ["add", planPath]);
		git(root, ["commit", "-q", "-m", "test: track plan"]);
		fs.writeFileSync(path.join(root, planPath), "modified\n");
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner, allowDirtyPrimary: true });
		expect(await materializePlanInWorkflowWorktree({ worktree, planPath, runner })).toBe("updated");
		expect(fs.readFileSync(path.join(worktree.ownership.worktree, planPath), "utf8")).toBe("modified\n");
		expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe("tracked\n");
		expect(git(root, ["status", "--porcelain=v1", "--", planPath])).toBe("");
	});

	it("rejects staged tracked plan changes without altering either copy", async () => {
		const root = repo();
		const planPath = ".specs/fixture/plan.md";
		fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
		fs.writeFileSync(path.join(root, planPath), "tracked\n");
		git(root, ["add", planPath]);
		git(root, ["commit", "-q", "-m", "test: track plan"]);
		fs.writeFileSync(path.join(root, planPath), "staged\n");
		git(root, ["add", planPath]);
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner, allowDirtyPrimary: true });
		await expect(materializePlanInWorkflowWorktree({ worktree, planPath, runner })).rejects.toThrow(/unsupported tracked or mixed changes/);
		expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe("staged\n");
		expect(fs.readFileSync(path.join(worktree.ownership.worktree, planPath), "utf8")).toBe("tracked\n");
	});

	it("rejects a plan path that differs from canonical ownership", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", planPath: ".specs/fixture/plan.md", runner });
		await expect(materializePlanInWorkflowWorktree({ worktree, planPath: ".specs/other/plan.md", runner })).rejects.toThrow(/does not match/);
	});

	it("restores a legacy ownership record without planPath", async () => {
		const root = repo();
		fs.mkdirSync(path.join(root, ".worktrees"), { recursive: true });
		fs.writeFileSync(path.join(root, ".worktrees", "legacy.workflow.json"), JSON.stringify({
			version: 1, workflow: "do-it", workflowId: "do-it:legacy", repoRoot: root,
			primaryWorktree: root, primaryBranch: "main", initialPrimaryHead: git(root, ["rev-parse", "HEAD"]),
			branch: "workflow/legacy", worktree: path.join(root, ".worktrees", "legacy"),
			createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z", state: "active",
		}));
		expect(readWorkflowOwnershipRecord(root, "legacy")).not.toHaveProperty("planPath");
	});

	it("resumes after archive and commit failures without repeating archive", async () => {
		const root = repo();
		const planPath = ".specs/fixture/plan.md";
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", planPath, runner });
		fs.mkdirSync(path.join(worktree.ownership.worktree, ".specs", "fixture"), { recursive: true });
		fs.writeFileSync(path.join(worktree.ownership.worktree, planPath), "complete\n");
		let archiveCalls = 0;
		let failCommit = true;
		const flakyRunner = async (cwd: string, args: string[]) => {
			if (args[0] === "commit" && failCommit) { failCommit = false; return { code: 1, stdout: "", stderr: "commit failed" }; }
			return runner(cwd, args);
		};
		const archivePlan = async (cwd: string, requested: string) => {
			archiveCalls += 1;
			if (archiveCalls === 1) throw new Error("archive hook failed");
			fs.mkdirSync(path.join(cwd, ".specs", "archive"), { recursive: true });
			fs.renameSync(path.join(cwd, ".specs", "fixture"), path.join(cwd, ".specs", "archive", "fixture"));
		};
		await expect(closeWorkflowWorktree({ worktree, planPath, archivePlan, runner: flakyRunner })).rejects.toThrow(/archive hook failed/);
		let resumed = readWorkflowOwnershipRecord(root, "fixture");
		if (!resumed) throw new Error("missing persisted closeout ownership");
		await expect(closeWorkflowWorktree({ worktree: { ownership: resumed, resumed: true }, planPath, archivePlan, runner: flakyRunner })).rejects.toThrow(/commit workflow closeout/);
		resumed = readWorkflowOwnershipRecord(root, "fixture");
		if (!resumed) throw new Error("missing persisted closeout ownership after commit failure");
		await closeWorkflowWorktree({ worktree: { ownership: resumed, resumed: true }, planPath, archivePlan, runner });
		expect(archiveCalls).toBe(2);
	});

	it("resumes merged closeout after cleanup failure", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		let failRemove = true;
		const flakyRunner = async (cwd: string, args: string[]) => {
			if (args[0] === "worktree" && args[1] === "remove" && failRemove) { failRemove = false; return { code: 1, stdout: "", stderr: "remove failed" }; }
			return runner(cwd, args);
		};
		await expect(closeWorkflowWorktree({ worktree, runner: flakyRunner })).rejects.toThrow(/remove workflow worktree/);
		const resumed = readWorkflowOwnershipRecord(root, "fixture");
		if (!resumed) throw new Error("missing merged closeout ownership");
		expect(resumed.closeoutStage).toBe("merged");
		await closeWorkflowWorktree({ worktree: { ownership: resumed, resumed: true }, runner });
		expect(fs.existsSync(path.join(root, ".worktrees", "fixture.workflow.json"))).toBe(false);
	});

	it("removes a deregistered residual worktree directory after Git reports failure", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		const residualRunner = async (cwd: string, args: string[]) => {
			if (args[0] === "worktree" && args[1] === "remove") {
				const removed = await runner(cwd, args);
				fs.mkdirSync(worktree.ownership.worktree, { recursive: true });
				return { ...removed, code: 1, stderr: "Windows path cleanup failed" };
			}
			return runner(cwd, args);
		};
		const completed = await closeWorkflowWorktree({ worktree, runner: residualRunner });
		expect(completed.state).toBe("complete");
		expect(fs.existsSync(worktree.ownership.worktree)).toBe(false);
		expect(fs.existsSync(path.join(root, ".worktrees", "fixture.workflow.json"))).toBe(false);
	});

	it("merges with --no-ff when the clean primary branch advances", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		fs.writeFileSync(path.join(root, "primary.txt"), "advanced\n");
		git(root, ["add", "primary.txt"]);
		git(root, ["commit", "-q", "-m", "test: advance primary"]);
		const completed = await closeWorkflowWorktree({ worktree, runner });
		expect(completed.state).toBe("complete");
		expect(git(root, ["show", "HEAD:primary.txt"])).toBe("advanced");
		expect(git(root, ["show", "HEAD:result.txt"])).toBe("done");
		expect(git(root, ["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ")).toHaveLength(3);
	});

	it("verifies model-managed commit and merge while preserving another untracked canonical plan", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		git(worktree.ownership.worktree, ["add", "--", "result.txt"]);
		git(worktree.ownership.worktree, ["commit", "-q", "-m", "feat: model closeout"]);
		git(root, ["merge", "--no-ff", "workflow/fixture", "-m", "Merge workflow/fixture"]);
		const otherPlan = path.join(root, ".specs", "other", "plan.md");
		fs.mkdirSync(path.dirname(otherPlan), { recursive: true });
		fs.writeFileSync(otherPlan, "other plan\n");
		const completed = await verifyAndCleanupWorkflowWorktree({ worktree, runner });
		expect(completed.state).toBe("complete");
		expect(fs.existsSync(worktree.ownership.worktree)).toBe(false);
		expect(fs.existsSync(path.join(root, ".worktrees", "fixture.workflow.json"))).toBe(false);
		expect(fs.readFileSync(otherPlan, "utf8")).toBe("other plan\n");
		expect(git(root, ["show", "HEAD:result.txt"])).toBe("done");
	});

	it("rejects cleanup when merged primary state does not contain the exact archive", async () => {
		const root = repo();
		const planPath = ".specs/fixture/plan.md";
		fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
		fs.writeFileSync(path.join(root, planPath), completePlan());
		git(root, ["add", "--", planPath]);
		git(root, ["commit", "-q", "-m", "test: add plan"]);
		const worktree = await ensureWorkflowWorktree({
			cwd: root,
			workflow: "do-it",
			workflowId: "do-it:fixture",
			slug: "fixture",
			planPath,
			runner,
		});
		fs.mkdirSync(path.join(worktree.ownership.worktree, ".specs", "archive"), { recursive: true });
		fs.renameSync(
			path.join(worktree.ownership.worktree, ".specs", "fixture"),
			path.join(worktree.ownership.worktree, ".specs", "archive", "fixture"),
		);
		git(worktree.ownership.worktree, ["add", "-A"]);
		git(worktree.ownership.worktree, ["commit", "-q", "-m", "chore: archive plan"]);
		git(root, ["merge", "--no-ff", "workflow/fixture", "-m", "Merge workflow/fixture"]);
		fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
		fs.renameSync(
			path.join(root, ".specs", "archive", "fixture", "plan.md"),
			path.join(root, planPath),
		);
		fs.rmSync(path.join(root, ".specs", "archive", "fixture"), { recursive: true, force: true });
		git(root, ["add", "-A"]);
		git(root, ["commit", "--amend", "--no-edit"]);

		await expect(verifyAndCleanupWorkflowWorktree({ worktree, planPath, runner })).rejects.toThrow(
			"required archived plan state",
		);
		expect(fs.existsSync(worktree.ownership.worktree)).toBe(true);
		expect(readWorkflowOwnershipRecord(root, "fixture")?.state).toBe("active");
	});

	it("rejects a fast-forward closeout and preserves owned recovery state", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		git(worktree.ownership.worktree, ["add", "--", "result.txt"]);
		git(worktree.ownership.worktree, ["commit", "-q", "-m", "feat: model closeout"]);
		git(root, ["merge", "--ff-only", "workflow/fixture"]);
		await expect(verifyAndCleanupWorkflowWorktree({ worktree, runner })).rejects.toThrow("--no-ff");
		expect(fs.existsSync(worktree.ownership.worktree)).toBe(true);
		expect(readWorkflowOwnershipRecord(root, "fixture")?.state).toBe("active");
	});

	it("commits, merges, and cleans up while preserving another untracked canonical plan", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		const otherPlan = path.join(root, ".specs", "other", "plan.md");
		fs.mkdirSync(path.dirname(otherPlan), { recursive: true });
		fs.writeFileSync(otherPlan, "other plan\n");
		const completed = await closeWorkflowWorktree({ worktree, runner });
		expect(completed.state).toBe("complete");
		expect(fs.existsSync(worktree.ownership.worktree)).toBe(false);
		expect(fs.existsSync(path.join(root, ".worktrees", "fixture.workflow.json"))).toBe(false);
		expect(fs.readFileSync(otherPlan, "utf8")).toBe("other plan\n");
		expect(git(root, ["show", "HEAD:result.txt"])).toBe("done");
		expect(git(root, ["branch", "--list", "workflow/fixture"])).toBe("");
	});
});
