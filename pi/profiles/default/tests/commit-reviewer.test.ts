import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildCommitTask, describeCommitTool, isBroadDiscoveryCommand } from "../commands/commit/reviewer.ts";

it("supplies exact workflow locations and routes status refreshes to the existing tool", () => {
	const root = "C:/work/repository with spaces";
	const inventory = ['Repository: .\n M "first.txt"', 'Repository: modules/example\n?? "new.txt"'];
	const task = buildCommitTask(false, root, inventory);
	expect(task).toContain(`Repository root: ${JSON.stringify(root)}`);
	const utility = JSON.parse(task.match(/^Whitespace utility: (.+)$/m)![1]);
	expect(readFileSync(utility, "utf8")).toContain("trimTrailingWhitespace");
	expect(task).toContain(inventory.join("\n\n"));
	expect(task).toContain("use commit_git_review for status refreshes, not shell git status");
	expect(task).toContain("Push was NOT requested. Do not push.");
	const pushTask = buildCommitTask(true, root, inventory);
	expect(pushTask).toContain("--recurse-submodules=no origin HEAD:refs/heads/<own-branch>");
	expect(pushTask).toContain("clean initialized submodules with outgoing referenced commits");
});

it("specifies usable inspection examples and the utility's actual argument contract", () => {
	const prompt = readFileSync(new URL("../commands/commit/reviewer.md", import.meta.url), "utf8");
	const examples = [...prompt.matchAll(/commit_git_review\((\{[^\n]+?\})\)/g)].map(match => JSON.parse(match[1]));
	expect(examples).toContainEqual({ action: "status", repo: "." });
	expect(examples).toContainEqual({ action: "status", repo: "modules/example" });
	expect(examples).toContainEqual({ action: "diff", repo: ".", staged: true });
	expect(prompt).toContain('do not insert a literal `--`');
	expect(prompt).toContain("--recurse-submodules=no origin");
	expect(prompt).toContain("clean submodules whose outgoing commits are referenced");
	expect(prompt).toContain("refresh the parent status");
	expect(prompt).toContain("Stop on any actual tool, Git, hook, cancellation, or timeout failure");
});

it("blocks broad discovery without blocking ordinary Git commands", () => {
	expect(isBroadDiscoveryCommand("find .. -name AGENTS.md")).toBe(true);
	expect(isBroadDiscoveryCommand("git status && rg --files")).toBe(true);
	expect(isBroadDiscoveryCommand("ls -laR .")).toBe(true);
	expect(isBroadDiscoveryCommand("git -C modules/example status --short")).toBe(false);
});

it("describes failed commit tools without dumping unbounded commands", () => {
	expect(describeCommitTool("commit_git_review", { action: "diff", repo: "modules/example" }))
		.toBe("Git review action=diff repo=modules/example");
	expect(describeCommitTool("read", { path: "modules/example/AGENTS.md" }))
		.toBe("file read: modules/example/AGENTS.md");
	const description = describeCommitTool("bash", { command: `git   commit -m "${"x".repeat(400)}"` });
	expect(description).toMatch(/^shell command: git commit/);
	expect(description.length).toBeLessThan(330);
	expect(description.endsWith("…")).toBe(true);
});
