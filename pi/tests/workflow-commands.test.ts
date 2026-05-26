import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	showCodexStatus,
	suppressNextCodexStatusOnNewSession,
} from "../extensions/codex-status.ts";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("../extensions/codex-status.ts", () => ({
	clearCodexStatusNewSessionSuppression: vi.fn(),
	showCodexStatus: vi.fn(async () => {}),
	suppressNextCodexStatusOnNewSession: vi.fn(),
}));

const mockShowCodexStatus = showCodexStatus as ReturnType<typeof vi.fn>;
const mockSuppressNextCodexStatusOnNewSession =
	suppressNextCodexStatusOnNewSession as ReturnType<typeof vi.fn>;

describe("workflow command dispatch", () => {
	let mockPi: ReturnType<typeof createMockPi> & {
		setModel?: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		mockPi = createMockPi() as typeof mockPi;
		mockPi.setModel = vi.fn(async () => {});
		const mod = await import("../extensions/workflow-commands.ts");
		mod.default(mockPi as Parameters<typeof mod.default>[0]);
	});

	function getHandler(name: string) {
		const cmd = mockPi._commands.find((candidate) => candidate.name === name);
		if (!cmd) throw new Error(`${name} command not registered`);
		return cmd.handler as (args: string, ctx: unknown) => Promise<void>;
	}

	it("initializes the new session with previous usage before showing Codex status", async () => {
		type NewSessionOptions = {
			setup?: (sessionManager: {
				appendCustomMessageEntry: ReturnType<typeof vi.fn>;
			}) => Promise<void>;
			withSession?: (ctx: unknown) => Promise<void>;
		};

		const appendCustomMessageEntry = vi.fn();
		const order: string[] = [];
		mockSuppressNextCodexStatusOnNewSession.mockImplementationOnce(() => {
			order.push("suppress-session-start");
		});
		mockShowCodexStatus.mockImplementationOnce(async () => {
			order.push("codex-status");
		});
		const replacementCtx = { ui: { notify: vi.fn() } };
		const newSession = vi.fn(async (options?: NewSessionOptions) => {
			await options?.setup?.({ appendCustomMessageEntry });
			order.push("new-session");
			await options?.withSession?.(replacementCtx);
			return { cancelled: false };
		});
		const ctx = {
			getContextUsage: vi.fn(() => ({
				tokens: 12_345,
				contextWindow: 100_000,
				percent: 12.345,
			})),
			newSession,
			ui: { notify: vi.fn() },
		};

		await getHandler("clear")("", ctx);

		expect(newSession).toHaveBeenCalledWith(
			expect.objectContaining({
				setup: expect.any(Function),
				withSession: expect.any(Function),
			}),
		);
		expect(appendCustomMessageEntry).toHaveBeenCalledWith(
			"workflow-clear-usage",
			"Previous session usage: 12% (12k/100k tokens)",
			true,
		);
		expect(mockShowCodexStatus).toHaveBeenCalledWith(replacementCtx);
		expect(order).toEqual([
			"suppress-session-start",
			"new-session",
			"codex-status",
		]);
	});

	it("dispatches /commit through the workflow prompt", async () => {
		await getHandler("commit")("", { ui: { notify: vi.fn() } });

		expect(mockPi.sendMessage).toHaveBeenCalledWith({
			customType: "slash-echo",
			content: "/commit",
			display: true,
		});
		expect(mockPi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "workflow.hiddenPrompt",
				display: false,
				content: expect.stringContaining("Run `git status --short`"),
			}),
			expect.objectContaining({
				triggerTurn: true,
				deliverAs: "followUp",
			}),
		);
	});

	it("substitutes /commit arguments into the workflow prompt", async () => {
		await getHandler("commit")("push pi/skills/workflow/commit.md", {
			ui: { notify: vi.fn() },
		});

		const hiddenPromptCall = (
			mockPi.sendMessage as ReturnType<typeof vi.fn>
		).mock.calls.find(
			([message]) => message.customType === "workflow.hiddenPrompt",
		);
		expect(hiddenPromptCall).toBeDefined();
		expect(hiddenPromptCall?.[0].content).toContain(
			"push pi/skills/workflow/commit.md",
		);
	});
});
