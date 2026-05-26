import { describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		readFileSync: vi.fn((filePath: string) => {
			if (String(filePath).endsWith("plan-it.md"))
				return "Plan skill body $ARGUMENTS";
			if (String(filePath).endsWith("prd-it.md"))
				return "PRD skill body $ARGUMENTS";
			if (String(filePath).endsWith("review-it.md"))
				return "Review skill body $ARGUMENTS";
			if (String(filePath).endsWith("do-it.md"))
				return "Do skill body $ARGUMENTS";
			return "test stub";
		}),
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

vi.mock("@earendil-works/pi-ai", () => ({
	completeSimple: vi.fn(),
}));

function getHandler(mockPi: ReturnType<typeof createMockPi>, name: string) {
	const command = mockPi._commands.find((c) => c.name === name);
	if (!command) throw new Error(`${name} command not registered`);
	return command.handler as (args: string, ctx: unknown) => Promise<void>;
}

describe("workflow slash command dispatch", () => {
	it("/plan-it sends its hidden workflow prompt as a follow-up turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await getHandler(mockPi, "plan-it")("build the thing", {});

		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall).toBeDefined();
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
	});

	it("/prd-it sends its hidden workflow prompt as a follow-up turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await getHandler(mockPi, "prd-it")("fuzzy idea", {});

		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain(
			"PRD skill body fuzzy idea",
		);
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
	});

	it("/summarize sends a terse session-summary prompt as a follow-up turn", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);

		await getHandler(mockPi, "summarize")("", {});

		const hiddenPromptCall = mockPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall?.[0].content).toContain("3 bullets or fewer");
		expect(hiddenPromptCall?.[0].content).toContain("workflow issue");
		expect(hiddenPromptCall?.[1]).toEqual({
			triggerTurn: true,
			deliverAs: "followUp",
		});
	});

	it("/do-it plan-file sessions trigger the new turn immediately", async () => {
		const mockPi = createMockPi();
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
		const newSessionSendMessage = vi.fn();
		const ctx = {
			newSession: vi.fn(async ({ withSession }) => {
				await withSession({ sendMessage: newSessionSendMessage });
			}),
		};

		await getHandler(mockPi, "do-it")(".specs/example/plan.md", ctx);

		expect(newSessionSendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow.hiddenPrompt",
				display: false,
			}),
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	});
});
