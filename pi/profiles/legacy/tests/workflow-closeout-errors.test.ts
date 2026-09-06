import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import workflowCommands from "../extensions/workflow-commands.ts";
import * as workflowWorktree from "../lib/workflow-worktree.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

vi.mock("../lib/workflow-worktree", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/workflow-worktree")>();
	return {
		...actual,
		readActiveInPlaceWorkflowOwnership: vi.fn(() => undefined),
		readInPlaceWorkflowOwnership: vi.fn(() => undefined),
		readWorkflowOwnershipForWorktree: vi.fn(() => undefined),
		readWorkflowOwnershipRecord: vi.fn(() => undefined),
		verifyInPlaceWorkflow: vi.fn(),
		verifyAndCleanupWorkflowWorktree: vi.fn(),
		verifyRetainedWorkflowWorktree: vi.fn(),
	};
});

const roots: string[] = [];
const ownership = (root: string) => ({
	version: 1 as const,
	workflow: "do-it" as const,
	workflowId: "do-it:closeout",
	repoRoot: root,
	primaryWorktree: root,
	primaryBranch: "main",
	initialPrimaryHead: "initial-head",
	branch: "workflow/closeout",
	worktree: root,
	createdAt: "2026-09-04T00:00:00.000Z",
	updatedAt: "2026-09-04T00:00:00.000Z",
	state: "active" as const,
});

function registered() {
	const pi = createMockPi();
	workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
	return pi;
}

function archiveFixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workflow-closeout-errors-"));
	roots.push(root);
	const archived = path.join(root, ".specs", "archive", "closeout", "plan.md");
	fs.mkdirSync(path.dirname(archived), { recursive: true });
	fs.writeFileSync(archived, "---\nstatus: complete\n---\n");
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("workflow closeout tool errors", () => {
	it("throws an ownership error from workflow_complete", async () => {
		const pi = registered();
		pi.setActiveTools(["workflow_complete"]);
		const tool = pi._getTool("workflow_complete");
		if (!tool) throw new Error("workflow_complete tool not registered");

		await expect(tool.execute("complete", {}, undefined, undefined, createMockCtx()))
			.rejects.toThrow("No active raw /do-it workflow worktree exists.");
		expect(pi.getActiveTools()).toEqual(["workflow_complete"]);
	});

	it("throws a verification error from workflow_complete without clearing ownership", async () => {
		const root = archiveFixture();
		const currentOwnership = { ...ownership(root), baselineHead: "initial-head" };
		vi.mocked(workflowWorktree.readActiveInPlaceWorkflowOwnership).mockReturnValue(currentOwnership);
		vi.mocked(workflowWorktree.verifyInPlaceWorkflow).mockRejectedValueOnce(
			new Error("in-place verification failed: committed state is not clean"),
		);
		const pi = registered();
		pi.setActiveTools(["workflow_complete"]);
		const tool = pi._getTool("workflow_complete");
		if (!tool) throw new Error("workflow_complete tool not registered");

		await expect(tool.execute("complete", {}, undefined, undefined, createMockCtx({ cwd: root })))
			.rejects.toThrow("in-place verification failed: committed state is not clean");
		expect(workflowWorktree.readActiveInPlaceWorkflowOwnership).toHaveBeenCalled();
		expect(pi.getActiveTools()).toEqual(["workflow_complete"]);
	});

	it("throws an ownership error from plan_archive", async () => {
		const root = archiveFixture();
		const pi = registered();
		pi.setActiveTools(["plan_archive"]);
		const tool = pi._getTool("plan_archive");
		if (!tool) throw new Error("plan_archive tool not registered");

		await expect(tool.execute("archive", { path: ".specs/closeout/plan.md" }, undefined, undefined, createMockCtx({ cwd: root })))
			.rejects.toThrow("Plan closeout requires its active owned workflow worktree.");
		expect(pi.getActiveTools()).toEqual(["plan_archive"]);
	});

	it("throws a verification error from plan_archive without changing ownership", async () => {
		const root = archiveFixture();
		const currentOwnership = ownership(root);
		vi.mocked(workflowWorktree.readWorkflowOwnershipRecord).mockReturnValue(currentOwnership);
		vi.mocked(workflowWorktree.verifyAndCleanupWorkflowWorktree).mockRejectedValueOnce(
			new Error("merge verification failed; owned worktree preserved"),
		);
		const pi = registered();
		pi.setActiveTools(["plan_archive"]);
		const tool = pi._getTool("plan_archive");
		if (!tool) throw new Error("plan_archive tool not registered");

		await expect(tool.execute("archive", { path: ".specs/closeout/plan.md" }, undefined, undefined, createMockCtx({ cwd: root })))
			.rejects.toThrow("merge verification failed; owned worktree preserved");
		expect(workflowWorktree.readWorkflowOwnershipRecord).toHaveBeenCalledWith(root, "closeout");
		expect(currentOwnership.state).toBe("active");
		expect(pi.getActiveTools()).toEqual(["plan_archive"]);
	});
});
