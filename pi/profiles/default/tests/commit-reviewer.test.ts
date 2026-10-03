import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendGitignoreRule, buildCommitTask, describeCommitTool, formatPublicationEligibility, isCommitInspection, validateGitignorePattern } from "../commands/commit/reviewer.ts";

it("supplies boundaries, stage-first ordering, and captured publication permission", () => {
	const inventory = ['Repository: .\n M "first.txt"', 'Repository: child\n?? "new.txt"'];
	const task = buildCommitTask(false, "C:/work/repo with spaces", inventory);
	expect(task).toContain('Repository root: "C:/work/repo with spaces"');
	expect(task).toContain(inventory.join("\n\n"));
	expect(task).toContain("running git add -A in each repository before staged review");
	expect(task).toContain("Push was NOT requested");
	expect(task).not.toContain("commit_git_review");
	expect(buildCommitTask(true, ".", inventory)).toContain("clean initialized submodules with outgoing referenced commits");
	expect(buildCommitTask(true, ".", inventory)).toContain("--recurse-submodules=no origin HEAD:refs/heads/<own-branch>");
});

it("retains deterministic attached and detached publication behavior", () => {
	expect(formatPublicationEligibility(false, "main")).toBe("");
	expect(formatPublicationEligibility(true, "main")).toContain('attached branch "main"');
	expect(formatPublicationEligibility(true, "")).toContain("do not re-check its branch, outgoing commits, upstream, remotes, or push");
});

it("composes stage-first instructions without obsolete gates", () => {
	const prompt = readFileSync(new URL("../commands/commit/reviewer.md", import.meta.url), "utf8");
	expect(prompt).toContain('add -A` before reviewing');
	expect(prompt).toContain("Unstage and selectively restage");
	expect(prompt).toContain("`.local` alone is not a reason");
	expect(prompt).toContain("Correct routine read/search/Git inspection errors and continue");
	expect(prompt).toContain("git stash create");
	expect(prompt).toContain("Local parent gitlink commits do not require publication or pulling");
	expect(prompt).not.toContain("commit_git_review");
	expect(prompt).not.toContain("before staging them");
});

it("validates and appends one ignore rule without duplicates", async () => {
	const repo = mkdtempSync(join(tmpdir(), "commit-ignore-"));
	try {
		await appendGitignoreRule(repo, "cache/");
		await appendGitignoreRule(repo, "cache/");
		expect(readFileSync(join(repo, ".gitignore"), "utf8")).toBe("cache/\n");
		expect(() => validateGitignorePattern("!cache/")).toThrow(/Negated/);
		expect(() => validateGitignorePattern("C:\\temp")).toThrow(/Absolute/);
		expect(() => validateGitignorePattern("**/*")).toThrow(/Blanket/);
		const aborted = AbortSignal.abort();
		await expect(appendGitignoreRule(repo, "other/", aborted)).rejects.toThrow();
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

it("recognizes recoverable inspections, not mixed/unknown mutation failures", () => {
	for (const command of ['git -C "child" diff --bad-option', 'git status', 'rg missing .', 'find . -name AGENTS.md', 'ls -R']) expect(isCommitInspection(command)).toBe(true);
	for (const command of ['git add -A', 'git commit', 'git restore --staged .', 'git push', 'echo rule >> .gitignore', 'git diff && git add -A', 'unknown']) expect(isCommitInspection(command)).toBe(false);
});

it("bounds failure descriptions", () => {
	expect(describeCommitTool("read", { path: "AGENTS.md" })).toBe("file read: AGENTS.md");
	expect(describeCommitTool("bash", { command: `git commit -m "${"x".repeat(400)}"` }).length).toBeLessThan(330);
});
