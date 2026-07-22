import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@earendil-works/pi-ai", () => ({
	completeSimple: vi.fn(),
}));

function getHandler(mockPi: ReturnType<typeof createMockPi>, name: string) {
	const command = mockPi._commands.find((c) => c.name === name);
	if (!command) throw new Error(`${name} command not registered`);
	return command.handler as (args: string, ctx: unknown) => Promise<void>;
}

async function createPlanFixture(): Promise<{
	root: string;
	planPath: string;
}> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workflow-dispatch-"));
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

	it("/plan-it sends its hidden workflow prompt as a follow-up turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await getHandler(mockPi, "plan-it")("build the thing", {});

		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("build the thing");
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
	});

	it("/review-it dispatches the plan path without opening a new session", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const fixture = await createPlanFixture();
		const ctx = { cwd: fixture.root, newSession: vi.fn() };

		try {
			await getHandler(mockPi, "review-it")(fixture.planPath, ctx);

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

		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("fuzzy idea");
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
	});

	it("/do-it plan files dispatch in the current session without preflight", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const ctx = { newSession: vi.fn() };
		const planPath = ".specs/workflow-fixture/plan.md";

		await getHandler(mockPi, "do-it")(planPath, ctx);

		expect(ctx.newSession).not.toHaveBeenCalled();
		const friction = await import("../lib/workflow-friction");
		const telemetry = await import("../lib/workflow-telemetry");
		expect(friction.noteWorkflowSubmission).not.toHaveBeenCalled();
		expect(telemetry.startWorkflowEpisode).not.toHaveBeenCalled();
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining(planPath),
				customType: "workflow.hiddenPrompt",
				display: false,
			}),
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	});
});
