import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import registerWorkflowCommands from "../extensions/workflow-commands.ts";
import { archiveCompletedPlan } from "../lib/plan-archive.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const roots: string[] = [];

function workspace(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-plan-archive-"));
	roots.push(root);
	return root;
}

function writePlan(
	root: string,
	slug: string,
	options: {
		status?: string;
		checked?: boolean;
		validationChecked?: boolean;
	} = {},
): string {
	const plan = path.join(root, ".specs", slug, "plan.md");
	fs.mkdirSync(path.dirname(plan), { recursive: true });
	fs.writeFileSync(
		plan,
		[
			"---",
			"created: 2026-08-15",
			`status: ${options.status ?? "complete"}`,
			"completed: 2026-08-15",
			"---",
			"",
			"# Plan: Fixture",
			"",
			"## Tasks",
			"",
			`- [${options.checked === false ? " " : "x"}] **T1: Finish fixture**`,
			"  - State: complete",
			"",
			"## Validation",
			"",
			`- [${options.validationChecked === false ? " " : "x"}] Focused check: \`fixture\``,
			"",
			"## Execution Status",
			"",
			"- State: complete",
			"- Blocker: none",
			"- Next: none",
			"",
		].join("\n"),
		"utf8",
	);
	return plan;
}

afterEach(() => {
	for (const root of roots.splice(0))
		fs.rmSync(root, { recursive: true, force: true });
});

describe("completed plan archival", () => {
	it("moves the complete spec directory under .specs/archive", () => {
		const root = workspace();
		writePlan(root, "fixture");
		fs.writeFileSync(
			path.join(root, ".specs", "fixture", "review.md"),
			"reviewed\n",
		);

		const result = archiveCompletedPlan(root, ".specs/fixture/plan.md");

		expect(result).toEqual({
			sourcePlan: ".specs/fixture/plan.md",
			archivedPlan: ".specs/archive/fixture/plan.md",
			archivedDirectory: ".specs/archive/fixture",
		});
		expect(fs.existsSync(path.join(root, ".specs", "fixture"))).toBe(false);
		expect(
			fs.readFileSync(
				path.join(root, ".specs", "archive", "fixture", "review.md"),
				"utf8",
			),
		).toBe("reviewed\n");
	});

	it("runs through the /do-it-gated tool and deactivates after success", async () => {
		const root = workspace();
		writePlan(root, "tool-fixture");
		const pi = createMockPi();
		registerWorkflowCommands(pi as Parameters<typeof registerWorkflowCommands>[0]);
		pi.setActiveTools([]);
		const doIt = pi._commands.find((command) => command.name === "do-it");
		if (!doIt) throw new Error("do-it command not registered");

		await doIt.handler(".specs/tool-fixture/plan.md", {});
		expect(pi.getActiveTools()).toEqual(["plan_archive"]);
		const tool = pi._getTool("plan_archive");
		if (!tool) throw new Error("plan_archive tool not registered");
		const result = await tool.execute(
			"archive-1",
			{ path: ".specs/tool-fixture/plan.md" },
			new AbortController().signal,
			() => {},
			createMockCtx({ cwd: root }),
		);

		expect(JSON.parse(result.content[0].text)).toMatchObject({
			outcome: "archived",
			archivedPlan: ".specs/archive/tool-fixture/plan.md",
		});
		expect(pi.getActiveTools()).toEqual([]);
	});

	it("rejects incomplete plans and existing archive targets", () => {
		const root = workspace();
		writePlan(root, "incomplete", { checked: false });
		expect(() =>
			archiveCompletedPlan(root, ".specs/incomplete/plan.md"),
		).toThrow("plan is not complete");

		writePlan(root, "unvalidated", { validationChecked: false });
		expect(() =>
			archiveCompletedPlan(root, ".specs/unvalidated/plan.md"),
		).toThrow("validation checklist is incomplete");

		writePlan(root, "collision");
		fs.mkdirSync(path.join(root, ".specs", "archive", "collision"), {
			recursive: true,
		});
		expect(() =>
			archiveCompletedPlan(root, ".specs/collision/plan.md"),
		).toThrow("archive target already exists");
	});

	it("rejects draft, archived, and noncanonical plan paths", () => {
		const root = workspace();
		writePlan(root, "draft", { status: "draft" });
		expect(() => archiveCompletedPlan(root, ".specs/draft/plan.md")).toThrow(
			"status must be complete",
		);
		expect(() =>
			archiveCompletedPlan(root, ".specs/archive/draft/plan.md"),
		).toThrow("automatic archival requires");
		expect(() => archiveCompletedPlan(root, "plan.md")).toThrow(
			"automatic archival requires",
		);
	});
});
