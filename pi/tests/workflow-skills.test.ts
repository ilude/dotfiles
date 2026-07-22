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
	it("keeps plan execution proportional", () => {
		const doIt = workflow("do-it");
		expect(doIt).toContain("Execute plan tasks directly");
		expect(doIt).toContain("Delegate only when independent workstreams");
		expect(doIt).not.toContain("task batch");
		expect(doIt).not.toContain("task drain");
		expect(doIt).not.toContain("plan-lint");
		expect(doIt).not.toContain("do-it-report-template");
	});

	it("keeps review and execution tracking opt-in", () => {
		const reviewIt = workflow("review-it");
		expect(reviewIt).toContain("Do not edit the artifact");
		expect(reviewIt).toContain("Delegate only when independent perspectives");
		expect(reviewIt).not.toContain("RESOLVE ->");
	});

	it("keeps same-file writes out of parallel plan tasks", () => {
		expect(workflow("plan-it")).toContain(
			"Never assign overlapping same-file write scopes to parallel tasks",
		);
	});
});
