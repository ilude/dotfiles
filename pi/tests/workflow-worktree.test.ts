import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeWorkflowWorktree, ensureWorkflowWorktree, parseWorktreeListPorcelain } from "../lib/workflow-worktree.js";

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

	it("commits, merges, verifies, and removes only the owned worktree", async () => {
		const root = repo();
		const worktree = await ensureWorkflowWorktree({ cwd: root, workflow: "do-it", workflowId: "do-it:fixture", slug: "fixture", runner });
		fs.writeFileSync(path.join(worktree.ownership.worktree, "result.txt"), "done\n");
		const completed = await closeWorkflowWorktree({ worktree, runner });
		expect(completed.state).toBe("complete");
		expect(fs.existsSync(worktree.ownership.worktree)).toBe(false);
		expect(fs.existsSync(path.join(root, ".worktrees", "fixture.workflow.json"))).toBe(false);
		expect(git(root, ["show", "HEAD:result.txt"])).toBe("done");
		expect(git(root, ["branch", "--list", "workflow/fixture"])).toBe("");
	});
});
