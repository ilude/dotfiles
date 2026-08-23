import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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

	it("/plan-it sends its hidden workflow prompt as a follow-up turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await getHandler(mockPi, "plan-it")("build the thing", {});

		expect(mockPi.sendMessage).toHaveBeenCalledWith({
			customType: "slash-echo",
			content: "/plan-it build the thing",
			display: true,
		});
		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("build the thing");
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
		for (const input of [
			{ action: "draft", planPath: fixture.planPath },
			{ action: "risk", risk: "low", inspectedBy: "primary" },
			{ action: "ready" },
		]) {
			await tool.execute("progress", input, undefined, undefined, ctx);
		}
		expect(mockPi.appendEntry).toHaveBeenLastCalledWith(
			"workflow.plan-lifecycle",
			expect.objectContaining({
				stage: "ready",
				planPath: fixture.planPath,
			}),
		);
		expect(mockPi.getActiveTools()).not.toContain("plan_progress");
	});

	it("/review-it dispatches the plan path without opening a new session", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const fixture = await createPlanFixture();
		const ctx = { cwd: fixture.root, newSession: vi.fn() };

		try {
			await getHandler(mockPi, "review-it")(fixture.planPath, ctx);

			expect(mockPi.sendMessage).toHaveBeenCalledWith({
				customType: "slash-echo",
				content: `/review-it ${fixture.planPath}`,
				display: true,
			});
			expect(mockPi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining(fixture.planPath),
					customType: "workflow.hiddenPrompt",
					display: false,
				}),
				{ triggerTurn: true, deliverAs: "followUp" },
			);
			expect(ctx.newSession).not.toHaveBeenCalled();
			const friction = await import("../lib/workflow-friction");
			const telemetry = await import("../lib/workflow-telemetry");
			expect(friction.noteWorkflowSubmission).not.toHaveBeenCalled();
			expect(telemetry.startWorkflowEpisode).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(fixture.root, { recursive: true, force: true });
		}
	});

	it("/prd-it sends its hidden workflow prompt as a follow-up turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await getHandler(mockPi, "prd-it")("fuzzy idea", {});

		expect(mockPi.sendMessage).toHaveBeenCalledWith({
			customType: "slash-echo",
			content: "/prd-it fuzzy idea",
			display: true,
		});
		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("fuzzy idea");
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
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

	it("/do-it keeps raw task dispatch unchanged", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		mockPi.setActiveTools([]);

		await getHandler(mockPi, "do-it")("fix the task", { cwd: "/missing" });

		expect(mockPi.getActiveTools()).toEqual([]);
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: "workflow.hiddenPrompt" }),
			expect.anything(),
		);
	});
});
