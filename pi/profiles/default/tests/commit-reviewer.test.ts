import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendGitignoreRule, buildCommitTask, describeCommitTool, formatPublicationEligibility, validateGitignorePattern } from "../commands/commit/reviewer.ts";

it("supplies boundaries, stage-first ordering, and captured publication permission", () => {
	const inventory = ['Repository: .\n M "first.txt"', 'Repository: child\n?? "new.txt"'];
	const task = buildCommitTask(false, "C:/work/repo with spaces", inventory);
	expect(task).toContain('Repository root: "C:/work/repo with spaces"');
	expect(task).toContain(`Host platform: ${process.platform}`);
	expect(task).toContain("not invented /mnt/c paths");
	expect(task).toContain(inventory.join("\n\n"));
	expect(task).toContain("run git add -A");
	expect(task).toContain("staged child gitlinks before staged review");
	expect(task).toContain("call submit_commit_plan covering every current changed path exactly once");
	expect(task).toContain("Current repository: .");
	expect(buildCommitTask(false, ".", inventory, "child")).toContain("Current repository: child. Work only in this repository");
	expect(task).toContain("Push was NOT requested");
	expect(task).not.toContain("commit_git_review");
	expect(buildCommitTask(true, ".", inventory)).toContain("clean initialized submodules with outgoing referenced commits");
	expect(buildCommitTask(true, ".", inventory)).toContain("Publication is code-owned");
	expect(buildCommitTask(true, ".", inventory)).toContain("Do not check outgoing commits or run pull/push");
	expect(buildCommitTask(true, ".", inventory)).toContain("integrates and publishes children before parents");
	expect(buildCommitTask(true, ".", inventory)).toContain("request conflict resolution separately");
	expect(buildCommitTask(true, ".", inventory)).not.toContain("publish_repository");
	expect(buildCommitTask(false, ".", inventory)).not.toContain("git pull");
});

it("retains deterministic attached and detached publication behavior", () => {
	expect(formatPublicationEligibility(false, "main")).toBe("");
	expect(formatPublicationEligibility(true, "main")).toContain('attached branch "main"');
	expect(formatPublicationEligibility(true, "main")).toContain("integrates origin/main with git pull --no-rebase --ff");
	expect(formatPublicationEligibility(true, "main")).toContain("publishes after a successful pass");
	expect(formatPublicationEligibility(true, "")).toContain("do not re-check its branch, outgoing commits, upstream, remotes, or push");
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

it("retains complete failure commands, including the tail and original whitespace", () => {
	expect(describeCommitTool("read", { path: "AGENTS.md" })).toBe("file read: AGENTS.md");
	const command = `pwd && git diff -- '${"x".repeat(400)}'\n&& git check-ignore 'file with  spaces.lock'`;
	for (const name of ["bash", "inspect"]) expect(describeCommitTool(name, { command })).toBe(`shell command: ${command}`);
});
