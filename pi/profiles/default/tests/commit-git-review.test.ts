import { afterEach, beforeEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { gitReviewTool } from "../commands/commit/tools.ts";

let root: string;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15000, windowsHide: true });
const pi = {
	exec: async (command: string, args: string[]) => ({
		stdout: execFileSync(command, args, { encoding: "utf8", timeout: 15000, windowsHide: true }),
		stderr: "", code: 0, killed: false,
	}),
} as unknown as ExtensionAPI;

beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "commit-diff-")));
	git(root, "init", "--quiet");
	writeFileSync(join(root, "first.txt"), "first staged\n");
	writeFileSync(join(root, "second.txt"), "second staged\n");
	git(root, "add", "--", "first.txt", "second.txt");
	writeFileSync(join(root, "first.txt"), "first worktree\n");
	writeFileSync(join(root, "second.txt"), "second worktree\n");
	writeFileSync(join(root, "untracked.txt"), "untracked contents\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function review(params: Parameters<ReturnType<typeof gitReviewTool>["execute"]>[1], repositories = [root]) {
	return (await gitReviewTool(pi, repositories).execute("test", params, undefined, undefined, { cwd: root })).content[0]!.text;
}

it("refreshes status with exact quoted paths in the selected inventory repository", async () => {
	writeFileSync(join(root, "path with spaces.txt"), "new contents\n");
	const status = await review({ action: "status", repo: "." });
	expect(status).toContain('AM "first.txt"');
	expect(status).toContain('?? "path with spaces.txt"');
	const nested = join(root, "nested"); mkdirSync(nested); git(nested, "init", "--quiet");
	writeFileSync(join(nested, "child.txt"), "child\n");
	const child = await review({ action: "status", repo: "nested" }, [root, nested]);
	expect(child).toContain('?? "child.txt"');
	expect(child).not.toContain('"first.txt"');
	await expect(review({ action: "status", repo: "nested" })).rejects.toThrow("Repository is not in the supplied inventory");
});

it.each([undefined, []])("allows pathless worktree and staged diffs (paths=%s)", async paths => {
	const worktree = await review({ action: "diff", paths });
	expect(worktree).toContain("+first worktree");
	expect(worktree).toContain("+second worktree");
	expect(worktree).not.toContain("untracked contents");
	const staged = await review({ action: "diff", paths, staged: true });
	expect(staged).toContain("+first staged");
	expect(staged).toContain("+second staged");
	expect(staged).not.toContain("+first worktree");
});

it("retains explicit path filtering and paginates a large pathless diff", async () => {
	expect(await review({ action: "diff", paths: ["first.txt"] })).not.toContain("second.txt");
	writeFileSync(join(root, "first.txt"), "large diff line\n".repeat(2000));
	const first = await review({ action: "diff" });
	expect(first).toContain("[Characters 0-12000 of");
	expect(first).toContain("offset=12000");
	expect(await review({ action: "diff", offset: 12000 })).toContain("[Characters 12000-24000 of");
});

it("restricts pathless diffs to the selected inventory repository", async () => {
	const nested = join(root, "nested"); mkdirSync(nested); git(nested, "init", "--quiet");
	writeFileSync(join(nested, "nested.txt"), "nested staged\n"); git(nested, "add", "--", "nested.txt");
	await expect(review({ action: "diff", repo: "nested", staged: true })).rejects.toThrow("Repository is not in the supplied inventory");
	const output = await review({ action: "diff", repo: "nested", staged: true }, [root, nested]);
	expect(output).toContain("Repository: nested");
	expect(output).toContain("+nested staged");
	expect(output).not.toContain("first.txt");
});
