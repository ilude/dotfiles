import { expect, it } from "vitest";
import { describeCommitTool, isBroadDiscoveryCommand } from "../commands/commit/reviewer.ts";

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
