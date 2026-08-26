import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerWorkflowCommands from "../extensions/workflow-commands.ts";
import { archiveCompletedPlan } from "../lib/plan-archive.ts";
import { parsePlanCloseoutPolicy } from "../lib/workflow-commands/plan-lifecycle.ts";
import * as workflowWorktree from "../lib/workflow-worktree.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

vi.mock("../lib/workflow-worktree", () => ({
	ensureWorkflowWorktree: vi.fn(async (input: { cwd: string; workflow: string; workflowId: string; slug: string }) => ({
		resumed: false,
		ownership: { version: 1, workflow: input.workflow, workflowId: input.workflowId, repoRoot: input.cwd, primaryWorktree: input.cwd, primaryBranch: "main", initialPrimaryHead: "initial-head", branch: `workflow/${input.slug}`, worktree: input.cwd, createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z", state: "active" },
	})),
	closeWorkflowWorktree: vi.fn(),
	verifyAndCleanupWorkflowWorktree: vi.fn(async (input: any) => ({
		...input.worktree.ownership,
		state: "complete",
		mergedHead: "merged-head",
	})),
	verifyRetainedWorkflowWorktree: vi.fn(async (input: any) => ({
		...input.worktree.ownership,
		state: "complete",
		closeoutStage: "committed",
	})),
	readWorkflowOwnershipForWorktree: vi.fn(() => undefined),
	readWorkflowOwnershipRecord: vi.fn(() => undefined),
	workflowSlugFromPlan: (value: string) => value.match(/\.specs\/([^/]+)\/plan\.md/)?.[1] ?? "workflow",
	workflowSlugFromRequest: (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workflow",
}));

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
			"## Objective",
			"",
			"Deliver the fixture.",
			"",
			"## Completion Evidence",
			"",
			"- Evidence: The fixture works through its supported entrypoint.",
			"- Fails when: The supported entrypoint does not produce the expected result.",
			"",
			"## Boundaries",
			"",
			"- In scope: Fixture.",
			"- Out of scope: Other work.",
			"- Preserve: Existing behavior.",
			"- Assumptions: None.",
			"",
			"## Tasks",
			"",
			`- [${options.checked === false ? " " : "x"}] **T1: Finish fixture**`,
			"  - Files: `src/fixture.ts`",
			"  - Change: Implement the fixture.",
			"  - Done when: The fixture works.",
			"  - Verify: `pnpm test fixture.test.ts`",
			"",
			"## Validation",
			"",
			`- [${options.validationChecked === false ? " " : "x"}] Focused check: \`fixture\``,
			"",
			"## Retention",
			"",
			`Archive the completed directory to .specs/archive/${slug}/.`,
			"",
			"## Execution Status",
			"",
			"- State: complete",
			"- Blocker: none",
			"- Next: none",
			`- Resume: \`/do-it .specs/${slug}/plan.md\``,
			"",
		].join("\n"),
		"utf8",
	);
	return plan;
}

afterEach(() => {
	vi.clearAllMocks();
	for (const root of roots.splice(0))
		fs.rmSync(root, { recursive: true, force: true });
});

describe("completed plan archival", () => {
	it("uses merge by default and recognizes the exact retained-closeout marker", () => {
		expect(parsePlanCloseoutPolicy("## Retention\n\nArchive after completion.\n")).toBe("merge");
		expect(parsePlanCloseoutPolicy(
			"## Retention\n\n- Closeout: Retain the committed workflow branch and worktree; do not merge into the primary branch.\n",
		)).toBe("retain");
	});

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
		const plan = writePlan(root, "tool-fixture", { status: "ready" });
		fs.writeFileSync(plan, fs.readFileSync(plan, "utf8").replace("- State: complete", "- State: planned"));
		const pi = createMockPi();
		registerWorkflowCommands(pi as Parameters<typeof registerWorkflowCommands>[0]);
		pi.setActiveTools([]);
		const doIt = pi._commands.find((command) => command.name === "do-it");
		if (!doIt) throw new Error("do-it command not registered");
		vi.mocked(workflowWorktree.readWorkflowOwnershipRecord).mockReturnValue({
			version: 1,
			workflow: "do-it",
			workflowId: "do-it:tool-fixture",
			repoRoot: root,
			primaryWorktree: root,
			primaryBranch: "main",
			initialPrimaryHead: "initial-head",
			branch: "workflow/tool-fixture",
			worktree: root,
			createdAt: "2026-08-23T00:00:00.000Z",
			updatedAt: "2026-08-23T00:00:00.000Z",
			state: "active",
		});

		const archiveDir = path.join(root, ".specs", "archive", "tool-fixture");
		fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
		fs.renameSync(path.join(root, ".specs", "tool-fixture"), archiveDir);

		pi.setActiveTools(["plan_archive"]);
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

		expect(result.content[0].text).toBe(
			"Plan archived:\nfrom: .specs/tool-fixture/plan.md to: .specs/archive/tool-fixture/plan.md\nworkflow/tool-fixture committed and merged into main and cleaned up.",
		);
		expect(result.details).toMatchObject({
			sourcePlan: ".specs/tool-fixture/plan.md",
			archivedPlan: ".specs/archive/tool-fixture/plan.md",
			branch: "workflow/tool-fixture",
			primaryBranch: "main",
		});
		expect(pi.getActiveTools()).toEqual([]);
	});

	it("uses retained verification and leaves owned resources intact for retain policy", async () => {
		const root = workspace();
		writePlan(root, "retained");
		const archiveDir = path.join(root, ".specs", "archive", "retained");
		fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
		fs.renameSync(path.join(root, ".specs", "retained"), archiveDir);
		const archivedPlan = path.join(archiveDir, "plan.md");
		fs.writeFileSync(
			archivedPlan,
			fs.readFileSync(archivedPlan, "utf8").replace(
				"## Execution Status",
				"- Closeout: Retain the committed workflow branch and worktree; do not merge into the primary branch.\n\n## Execution Status",
			),
		);
		const ownership = {
			version: 1 as const,
			workflow: "do-it" as const,
			workflowId: "do-it:retained",
			repoRoot: root,
			primaryWorktree: root,
			primaryBranch: "main",
			initialPrimaryHead: "initial-head",
			branch: "workflow/retained",
			worktree: root,
			createdAt: "2026-08-23T00:00:00.000Z",
			updatedAt: "2026-08-23T00:00:00.000Z",
			state: "active" as const,
		};
		vi.mocked(workflowWorktree.readWorkflowOwnershipRecord).mockReturnValueOnce(ownership);
		const pi = createMockPi();
		registerWorkflowCommands(pi as Parameters<typeof registerWorkflowCommands>[0]);
		pi.setActiveTools(["plan_archive"]);
		const tool = pi._getTool("plan_archive");
		if (!tool) throw new Error("plan_archive tool not registered");

		const result = await tool.execute(
			"archive-retained",
			{ path: ".specs/retained/plan.md" },
			new AbortController().signal,
			() => {},
			createMockCtx({ cwd: root }),
		);

		expect(workflowWorktree.verifyRetainedWorkflowWorktree).toHaveBeenCalledWith(
			expect.objectContaining({ planPath: ".specs/retained/plan.md" }),
		);
		expect(workflowWorktree.verifyAndCleanupWorkflowWorktree).not.toHaveBeenCalled();
		expect(result.content[0].text).toContain("retained without merging into main");
		expect(result.details).toMatchObject({ closeoutPolicy: "retain", branch: "workflow/retained" });
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
