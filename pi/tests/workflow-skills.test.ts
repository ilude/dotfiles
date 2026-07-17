import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

function workflow(name: string): string {
	return fs.readFileSync(
		path.join(process.cwd(), "skills", "workflow", `${name}.md`),
		"utf8",
	);
}

describe("workflow scheduling guidance", () => {
	it("hands plan execution to one graph batch and the drain scheduler", () => {
		const doIt = workflow("do-it");
		expect(doIt).toContain("one graph-aware `task batch` call");
		expect(doIt).toContain("`blockedByKeys`");
		expect(doIt).toContain("Start `task drain`");
		expect(doIt).not.toContain("Execute ready tasks wave by wave");
	});

	it("keeps same-file writes out of parallel plan tasks", () => {
		expect(workflow("plan-it")).toContain(
			"Never assign overlapping same-file write scopes to parallel tasks",
		);
	});
});
