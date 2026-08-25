import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		mkdirSync: vi.fn(),
		appendFileSync: vi.fn(),
	};
});

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}));

vi.mock("../lib/model-routing", () => ({
	resolveCommitPlanningModelFromRegistry: vi.fn(),
}));

vi.mock("../lib/workflow-friction", () => ({
	noteWorkflowSubmission: vi.fn(),
}));

vi.mock("../lib/workflow-telemetry", () => ({
	startWorkflowEpisode: vi.fn(),
}));

vi.mock("../lib/workflow-worktree", () => ({
	ensureWorkflowWorktree: vi.fn(async (input: { cwd: string; workflow: string; workflowId: string; slug: string }) => ({
		resumed: false,
		ownership: {
			version: 1,
			workflow: input.workflow,
			workflowId: input.workflowId,
			repoRoot: input.cwd,
			primaryWorktree: input.cwd,
			primaryBranch: "main",
			initialPrimaryHead: "initial-head",
			branch: `workflow/${input.slug}`,
			worktree: input.cwd,
			createdAt: "2026-08-23T00:00:00.000Z",
			updatedAt: "2026-08-23T00:00:00.000Z",
			state: "active",
		},
	})),
	closeWorkflowWorktree: vi.fn(),
	materializePlanInWorkflowWorktree: vi.fn(async () => "transferred"),
	resolveWorkflowRepoRoot: vi.fn(async (cwd: string) => cwd),
	readWorkflowOwnershipForWorktree: vi.fn(() => undefined),
	readWorkflowOwnershipRecord: vi.fn(() => undefined),
	workflowSlugFromPlan: (value: string) => value.match(/\.specs\/([^/]+)\/plan\.md/)?.[1] ?? "workflow",
	workflowSlugFromRequest: (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workflow",
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => ({
	...(await importOriginal<typeof import("@earendil-works/pi-ai")>()),
	completeSimple: vi.fn(),
}));

function getHandler(mockPi: ReturnType<typeof createMockPi>, name: string) {
	const command = mockPi._commands.find((c) => c.name === name);
	if (!command) throw new Error(`${name} command not registered`);
	return command.handler as (args: string, ctx: unknown) => Promise<void>;
}

function readyPlan(planPath: string): string {
	const slug = planPath.split("/")[1];
	return `---
created: 2026-08-15
status: ready
completed:
---

# Plan: Workflow fixture

## Objective

Deliver the fixture.

## Completion Evidence

- Evidence: The fixture works through its supported entrypoint.
- Fails when: The supported entrypoint does not produce the expected result.

## Boundaries

- In scope: Fixture.
- Out of scope: Other work.
- Preserve: Existing behavior.
- Assumptions: None.

## Tasks

- [ ] **T1: Deliver fixture**
  - Files: \`src/fixture.ts\`
  - Change: Implement the fixture.
  - Done when: The fixture works.
  - Verify: \`pnpm test fixture.test.ts\`

## Validation

- [ ] Focused check: \`pnpm test fixture.test.ts\`
  - Expected: The fixture passes.

## Retention

Archive the completed directory to \`.specs/archive/${slug}/\`.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: \`/do-it ${planPath}\`
`;
}

const fixtureRoots = new Set<string>();

async function createPlanFixture(): Promise<{
	root: string;
	planPath: string;
}> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workflow-dispatch-"));
	fixtureRoots.add(root);
	const planPath = ".specs/workflow-fixture/plan.md";
	const absolutePlan = path.join(root, planPath);
	await fs.promises.mkdir(path.dirname(absolutePlan), { recursive: true });
	await fs.promises.writeFile(absolutePlan, "# Workflow fixture\n", "utf8");
	return { root, planPath };
}

describe("workflow slash command dispatch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		for (const root of fixtureRoots) {
			fs.rmSync(root, { recursive: true, force: true });
		}
		fixtureRoots.clear();
	});

	it("does not register the retired /review-it command", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		expect(mockPi._commands.map((command) => command.name)).not.toContain("review-it");
	});

	it("/plan-it sends its hidden workflow prompt as a follow-up turn without creating a worktree", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const root = path.resolve("/repo");
		const setStatus = vi.fn();

		await getHandler(mockPi, "plan-it")("build the thing", {
			cwd: root,
			mode: "tui",
			ui: { setStatus },
		});

		expect(setStatus).toHaveBeenNthCalledWith(1, "plan-it", "planning...");
		expect(setStatus).toHaveBeenLastCalledWith("plan-it", undefined);

		expect(mockPi.appendEntry).toHaveBeenCalledWith("slash-echo", {
			text: "/plan-it build the thing",
		});
		expect(mockPi.sendMessage).not.toHaveBeenCalledWith({
			customType: "slash-echo",
			content: "/plan-it build the thing",
			display: true,
		});
		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("build the thing");
		expect(hiddenPromptCall?.[0].content).toContain("PRIMARY REPOSITORY (mandatory)");
		expect(hiddenPromptCall?.[0].content).toContain("<meaningful-slug>");
		expect(hiddenPromptCall?.[0].content).not.toMatch(/plan-[a-f0-9]{8}/);
		expect(worktrees.ensureWorkflowWorktree).not.toHaveBeenCalled();
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
		expect(mockPi.getActiveTools()).toContain("plan_progress");
		expect(mockPi.appendEntry).toHaveBeenCalledWith(
			"workflow.plan-lifecycle",
			expect.objectContaining({ stage: "started", request: "build the thing" }),
		);
	});

	it("/plan-it echoes before repository resolution completes", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		let resolveRoot: ((root: string) => void) | undefined;
		vi.mocked(worktrees.resolveWorkflowRepoRoot).mockImplementationOnce(() => new Promise((resolve) => {
			resolveRoot = resolve;
		}));
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		const dispatched = getHandler(mockPi, "plan-it")("build the thing", {
			cwd: "/repo",
			mode: "tui",
			ui: { setStatus: vi.fn() },
		});

		expect(mockPi.appendEntry).toHaveBeenCalledWith("slash-echo", {
			text: "/plan-it build the thing",
		});
		resolveRoot?.("/repo");
		await dispatched;
	});

	it("clears plan status when acknowledgement workflow fails", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const setStatus = vi.fn();
		mockPi.appendEntry.mockImplementationOnce(() => {
			throw new Error("session write failed");
		});
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await expect(
			getHandler(mockPi, "plan-it")("build the thing", {
				cwd: "/repo",
				mode: "tui",
				ui: { setStatus },
			}),
		).rejects.toThrow("session write failed");
		expect(setStatus).toHaveBeenLastCalledWith("plan-it", undefined);
	});

	it("/plan-it continues from cwd when repository discovery fails", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		vi.mocked(worktrees.resolveWorkflowRepoRoot).mockRejectedValueOnce(new Error("git unavailable"));
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const root = path.resolve("/repo");

		await getHandler(mockPi, "plan-it")("build the thing", { cwd: root, ui: { notify: vi.fn() } });

		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain(`PRIMARY REPOSITORY (mandatory): ${root}`);
		expect(hiddenPromptCall?.[0].content).toContain("repository-discovery failures never block planning");
		expect(mockPi.appendEntry).toHaveBeenCalledWith(
			"workflow.plan-lifecycle",
			expect.objectContaining({ stage: "started" }),
		);
	});

	it("bare /plan-it derives its plan name in the planning turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		await getHandler(mockPi, "plan-it")("", { cwd: path.resolve("/repo") });
		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("conversation context");
		expect(hiddenPromptCall?.[0].content).toContain("never use an invocation ID");
		expect(worktrees.ensureWorkflowWorktree).not.toHaveBeenCalled();
	});

	it("restores and completes the compact plan lifecycle from session entries", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const lifecycle = await import(
			"../lib/workflow-commands/plan-lifecycle.ts"
		);
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const fixture = await createPlanFixture();
		await fs.promises.writeFile(
			path.join(fixture.root, fixture.planPath),
			readyPlan(fixture.planPath),
			"utf8",
		);
		const started = lifecycle.createPlanLifecycleSnapshot(
			"restored-invocation",
			"fixture",
		);
		const sessionStart = mockPi._getHook("session_start")[0]?.handler;
		if (!sessionStart) throw new Error("session_start hook not registered");
		await sessionStart(
			{ reason: "resume" },
			{
				sessionManager: {
					getSessionId: () => "workflow-session",
					getBranch: () => [
						{
							type: "custom",
							customType: lifecycle.PLAN_LIFECYCLE_ENTRY_TYPE,
							data: started,
						},
					],
				},
			},
		);
		expect(mockPi.getActiveTools()).toContain("plan_progress");
		const tool = mockPi._getTool("plan_progress");
		if (!tool) throw new Error("plan_progress tool not registered");
		const ctx = { cwd: fixture.root };
		const inputs = [
			{ action: "draft", planPath: fixture.planPath },
			{ action: "review", role: "adversary", concern: "runtime behavior", outcome: "covered" },
			{
				action: "review",
				role: "specialist",
				concern: "extension contract",
				outcome: "covered",
				strategy: "x".repeat(121),
			},
			{ action: "review", role: "subtractive", concern: "overengineering and churn", outcome: "no_finding" },
			{ action: "ready" },
		];
		for (const input of inputs) {
			expect(Value.Check(tool.parameters, input)).toBe(true);
			await tool.execute("progress", input, undefined, undefined, ctx);
		}
		const persisted = mockPi.appendEntry.mock.calls.at(-1)?.[1];
		expect(persisted).toBeDefined();
		expect(persisted.reviewers[0]).not.toHaveProperty("strategy");
		expect(persisted.reviewers[1]).toMatchObject({
			strategy: "x".repeat(120),
		});
		expect(mockPi.appendEntry).toHaveBeenLastCalledWith(
			"workflow.plan-lifecycle",
			expect.objectContaining({
				stage: "ready",
				planPath: fixture.planPath,
			}),
		);
		expect(mockPi.getActiveTools()).not.toContain("plan_progress");
	});

	it("/do-it echoes before repository resolution completes", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		let resolveRoot: ((root: string) => void) | undefined;
		vi.mocked(worktrees.resolveWorkflowRepoRoot).mockImplementationOnce(() => new Promise((resolve) => {
			resolveRoot = resolve;
		}));
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		const dispatched = getHandler(mockPi, "do-it")("fix the task", {
			cwd: "/repo",
			mode: "tui",
			ui: { setStatus: vi.fn() },
		});

		expect(mockPi.appendEntry).toHaveBeenCalledWith("slash-echo", {
			text: "/do-it fix the task",
		});
		resolveRoot?.("/repo");
		await dispatched;
	});

	it("/do-it rejects an invalid canonical plan before archive activation or execution", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const fixture = await createPlanFixture();
		mockPi.setActiveTools([]);

		await getHandler(mockPi, "do-it")(fixture.planPath, { cwd: fixture.root });

		expect(mockPi.getActiveTools()).not.toContain("plan_archive");
		expect(mockPi.sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
		expect(mockPi.sendMessage).toHaveBeenCalledWith({
			customType: "workflow.plan-preflight",
			content: expect.stringContaining("Plan preflight failed"),
			display: true,
		});
	});

	it("/do-it dispatches a valid canonical plan after preflight", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const fixture = await createPlanFixture();
		await fs.promises.writeFile(
			path.join(fixture.root, fixture.planPath),
			readyPlan(fixture.planPath),
			"utf8",
		);
		mockPi.setActiveTools([]);

		await getHandler(mockPi, "do-it")(fixture.planPath, { cwd: fixture.root });

		expect(mockPi.getActiveTools()).toEqual(["plan_archive"]);
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining(fixture.planPath),
				customType: "workflow.hiddenPrompt",
				display: false,
			}),
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	});

	it("/do-it canonicalizes trailing punctuation before ownership and validation", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const fixture = await createPlanFixture();
		await fs.promises.writeFile(path.join(fixture.root, fixture.planPath), readyPlan(fixture.planPath), "utf8");
		mockPi.setActiveTools([]);

		await getHandler(mockPi, "do-it")(`${fixture.planPath}.`, { cwd: fixture.root });

		expect(worktrees.ensureWorkflowWorktree).toHaveBeenCalledWith(expect.objectContaining({
			planPath: fixture.planPath,
		}));
		expect(mockPi.getActiveTools()).toEqual(["plan_archive"]);
	});

	it("/do-it keeps prose containing a plan path on the raw route", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		const worktrees = await import("../lib/workflow-worktree.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		mockPi.setActiveTools([]);

		await getHandler(mockPi, "do-it")("please execute .specs/workflow-fixture/plan.md!", { cwd: "/repo" });

		expect(worktrees.ensureWorkflowWorktree).toHaveBeenCalledWith(expect.objectContaining({ planPath: undefined }));
		expect(mockPi.getActiveTools()).toEqual(["workflow_complete"]);
	});

	it("/do-it keeps raw task dispatch unchanged", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		mockPi.setActiveTools([]);

		await getHandler(mockPi, "do-it")("fix the task", { cwd: "/missing" });

		expect(mockPi.getActiveTools()).toEqual(["workflow_complete"]);
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
	});
});
