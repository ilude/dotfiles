import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commit extension ownership", () => {
	it("adds non-mutating tools and preserves single /commit owner", () => {
		const extension = readFileSync(new URL("../extensions/commit.ts", import.meta.url), "utf8");
		const workflow = readFileSync(new URL("../extensions/workflow-commands.ts", import.meta.url), "utf8");
		expect(extension).toContain('name: "commit_plan"');
		expect(extension).toContain('name: "commit_validate_message"');
		expect(extension).toContain('name: "commit_stage"');
		expect(extension).toContain('name: "commit_create"');
		expect(workflow.match(/registerCommand\("commit"/g)?.length).toBe(1);
		expect(extension).toContain("export default function");
		expect(workflow).not.toContain("registerCommitTools(pi)");
	});
});
