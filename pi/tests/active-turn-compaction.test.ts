import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	CompactOptions,
	ContextUsage,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	hasCompactableContent,
	loadActiveTurnCompactionPolicy,
	registerActiveTurnCompaction,
	shouldCompactDuringActiveTurn,
} from "../extensions/active-turn-compaction.ts";
import { invalidateSettingsCache } from "../lib/settings-loader.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const policy = {
	enabled: true,
	reserveTokens: 16_384,
	keepRecentTokens: 20_000,
};

function usage(tokens: number | null, contextWindow = 372_000): ContextUsage {
	return {
		tokens,
		contextWindow,
		percent:
			tokens === null || contextWindow <= 0
				? null
				: (tokens / contextWindow) * 100,
	};
}

function setup(
	initialUsage: ContextUsage = usage(100_000),
	canCompact: () => boolean = () => true,
) {
	const pi = createMockPi();
	let currentUsage = initialUsage;
	let pendingMessages = false;
	let compactOptions: CompactOptions | undefined;
	const compact = vi.fn((options?: CompactOptions) => {
		compactOptions = options;
	});
	const ctx = createMockCtx({
		isProjectTrusted: () => true,
		hasPendingMessages: () => pendingMessages,
		getContextUsage: vi.fn(() => currentUsage),
		sessionManager: { getBranch: () => [] },
		compact,
	}) as unknown as ExtensionContext;

	registerActiveTurnCompaction(pi as never, {
		loadPolicy: () => policy,
		canCompact,
	});
	const hook = (name: string) => {
		const registered = pi._getHook(name)[0];
		if (!registered) throw new Error(`Missing ${name} hook`);
		return registered.handler;
	};

	return {
		pi,
		ctx,
		compact,
		get compactOptions() {
			return compactOptions;
		},
		setUsage(next: ContextUsage) {
			currentUsage = next;
		},
		setPendingMessages(pending: boolean) {
			pendingMessages = pending;
		},
		sessionStart: hook("session_start"),
		sessionShutdown: hook("session_shutdown"),
		sessionBeforeCompact: hook("session_before_compact"),
		sessionCompact: hook("session_compact"),
		sessionCompactFailed: hook("session_compact_failed"),
		agentSettled: hook("agent_settled"),
		messageEnd: hook("message_end"),
		turnEnd: hook("turn_end"),
	};
}

function activeTurn(toolResults: unknown[] = [{}]) {
	return {
		type: "turn_end",
		turnIndex: 1,
		message: {},
		toolResults,
	};
}

function messageEntry(
	id: string,
	parentId: string | null,
	message: Record<string, unknown>,
): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-07-09T00:00:00.000Z",
		message,
	} as SessionEntry;
}

describe("active-turn compaction", () => {
	it("loads the soft limit independently from native compaction settings", () => {
		const projectRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-active-turn-compaction-"),
		);
		fs.mkdirSync(path.join(projectRoot, ".pi"));
		fs.writeFileSync(
			path.join(projectRoot, ".pi", "settings.json"),
			JSON.stringify({
				compaction: { reserveTokens: 12_000, keepRecentTokens: 24_000 },
				activeTurnCompaction: {
					softLimitTokens: 255_616,
					softLimitMaxContextWindowTokens: 372_000,
				},
			}),
			"utf-8",
		);
		invalidateSettingsCache();

		try {
			expect(loadActiveTurnCompactionPolicy(projectRoot, true)).toMatchObject({
				enabled: true,
				reserveTokens: 12_000,
				keepRecentTokens: 24_000,
				softLimitTokens: 255_616,
				softLimitMaxContextWindowTokens: 372_000,
			});
		} finally {
			invalidateSettingsCache();
			fs.rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	it("applies the soft limit only to configured context window sizes", () => {
		const softPolicy = {
			...policy,
			softLimitTokens: 255_616,
			softLimitMaxContextWindowTokens: 372_000,
		};

		expect(
			shouldCompactDuringActiveTurn(usage(296_000, 1_000_000), softPolicy),
		).toBe(false);
		expect(
			shouldCompactDuringActiveTurn(usage(296_000, 372_000), softPolicy),
		).toBe(true);
		expect(
			shouldCompactDuringActiveTurn(usage(983_617, 1_000_000), softPolicy),
		).toBe(true);
		expect(shouldCompactDuringActiveTurn(usage(355_617), policy)).toBe(true);
	});

	it("detects the trailing tool-result cut-point failure before compacting", () => {
		const entries: SessionEntry[] = [
			messageEntry("old-user", null, {
				role: "user",
				content: "old request",
				timestamp: 1,
			}),
			messageEntry("old-assistant", "old-user", {
				role: "assistant",
				content: [{ type: "text", text: "x".repeat(100_000) }],
				timestamp: 2,
			}),
			messageEntry("current-user", "old-assistant", {
				role: "user",
				content: "continue",
				timestamp: 3,
			}),
			messageEntry("tool-call", "current-user", {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "call-1",
						name: "read",
						arguments: {},
					},
				],
				timestamp: 4,
			}),
			...Array.from({ length: 7 }, (_, index) =>
				messageEntry(`tool-result-${index}`, "tool-call", {
					role: "toolResult",
					toolCallId: "call-1",
					toolName: "read",
					content: [{ type: "text", text: "x".repeat(16_000) }],
					isError: false,
					timestamp: 5 + index,
				}),
			),
		];

		expect(hasCompactableContent(entries, 20_000)).toBe(false);
	});

	it("skips compaction when the current branch has no valid cut point", async () => {
		const runtime = setup(usage(256_158, 272_000), () => false);
		await runtime.sessionStart(
			{ type: "session_start", reason: "startup" },
			runtime.ctx,
		);
		await runtime.turnEnd(activeTurn(), runtime.ctx);

		expect(runtime.compact).not.toHaveBeenCalled();
		expect(runtime.ctx.ui.notify).not.toHaveBeenCalled();
		expect(runtime.pi.sendMessage).not.toHaveBeenCalled();
	});

	it("compacts during a tool-driven request and resumes after completion", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);

		expect(runtime.ctx.abort).toHaveBeenCalledTimes(1);
		expect(runtime.compact).not.toHaveBeenCalled();
		expect(runtime.ctx.ui.notify).not.toHaveBeenCalled();

		await runtime.agentSettled(
			{ type: "agent_settled" },
			runtime.ctx,
		);
		expect(runtime.compact).toHaveBeenCalledTimes(1);
		expect(runtime.compactOptions?.customInstructions).toContain(
			"settled observable completion evidence",
		);
		expect(runtime.compactOptions?.customInstructions).toContain(
			"response owed to the user",
		);
		expect(runtime.compactOptions?.customInstructions).toContain(
			"pending question that must be answered or settled",
		);
		expect(runtime.compactOptions?.customInstructions).toContain(
			"supplemental durable requirements, constraints, dependencies, and acceptance checks",
		);
		expect(runtime.compactOptions?.customInstructions).toContain(
			"Do not reconstruct the conversation from task state",
		);
		expect(runtime.compactOptions?.customInstructions).toContain(
			"write conversation history into task notes",
		);

		runtime.compactOptions?.onComplete?.({} as never);
		expect(runtime.pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "active-turn-compaction.continue",
				content: expect.stringMatching(
					/compacted summary and retained messages[\s\S]*latest user correction[\s\S]*response owed[\s\S]*pending question/i,
				),
				display: false,
			}),
			{ triggerTurn: true, deliverAs: "followUp" },
		);
		const continuation = runtime.pi.sendMessage.mock.calls[0]?.[0].content as string;
		expect(continuation).not.toMatch(/inspect active root tasks/i);
		expect(continuation).toMatch(
			/Do not create replacement tasks during recovery/i,
		);
	});

	it("recovers through threshold, manual, and overflow compaction without task-directed reconstruction", async () => {
		for (const reason of ["threshold", "manual", "overflow"] as const) {
			const runtime = setup(usage(360_000));
			await runtime.sessionStart(
				{ type: "session_start", reason: "startup" },
				runtime.ctx,
			);
			await runtime.turnEnd(activeTurn(), runtime.ctx);

			expect(
				await runtime.sessionBeforeCompact(
					{ type: "session_before_compact", reason },
					runtime.ctx,
				),
			).toBeUndefined();
			await runtime.sessionCompact(
				{
					type: "session_compact",
					reason,
					willRetry: false,
				},
				runtime.ctx,
			);
			await runtime.agentSettled(
				{ type: "agent_settled" },
				runtime.ctx,
			);
			expect(runtime.compact).not.toHaveBeenCalled();
			expect(runtime.pi.sendMessage).toHaveBeenCalledTimes(1);
		}
	});

	it("does not enqueue recovery behind a newer pending interaction", async () => {
		for (const reason of ["threshold", "manual", "overflow"] as const) {
			const runtime = setup(usage(360_000));
			await runtime.sessionStart(
				{ type: "session_start", reason: "startup" },
				runtime.ctx,
			);
			await runtime.turnEnd(activeTurn(), runtime.ctx);
			runtime.setPendingMessages(true);

			await runtime.sessionCompact(
				{
					type: "session_compact",
					reason,
					willRetry: false,
				},
				runtime.ctx,
			);

			expect(runtime.pi.sendMessage).not.toHaveBeenCalled();
		}
	});

	it("does not enqueue recovery behind a pending interaction after manual compaction", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart(
			{ type: "session_start", reason: "startup" },
			runtime.ctx,
		);
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		await runtime.agentSettled({ type: "agent_settled" }, runtime.ctx);
		runtime.setPendingMessages(true);

		runtime.compactOptions?.onComplete?.({} as never);

		expect(runtime.pi.sendMessage).not.toHaveBeenCalled();
	});

	it("leaves retryable overflow recovery to the native retry", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart(
			{ type: "session_start", reason: "startup" },
			runtime.ctx,
		);
		await runtime.turnEnd(activeTurn(), runtime.ctx);

		await runtime.sessionCompact(
			{
				type: "session_compact",
				reason: "overflow",
				willRetry: true,
			},
			runtime.ctx,
		);

		expect(runtime.pi.sendMessage).not.toHaveBeenCalled();
		await runtime.agentSettled({ type: "agent_settled" }, runtime.ctx);
		expect(runtime.compact).not.toHaveBeenCalled();
	});

	it("attempts compaction only once while the same run remains above threshold", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart(
			{ type: "session_start", reason: "startup" },
			runtime.ctx,
		);

		await runtime.turnEnd(activeTurn(), runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		await runtime.agentSettled(
			{ type: "agent_settled" },
			runtime.ctx,
		);

		expect(runtime.compact).toHaveBeenCalledTimes(1);
	});

	it("hides the provider error caused by the intentional compaction abort", async () => {
		const runtime = setup(usage(360_000));
		const abortedAssistant = {
			role: "assistant",
			content: [],
			api: "openai-codex-responses",
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
			},
			stopReason: "error",
			errorMessage: "This operation was aborted",
			timestamp: Date.now(),
		};
		await runtime.sessionStart(
			{ type: "session_start", reason: "startup" },
			runtime.ctx,
		);

		expect(
			await runtime.messageEnd(
				{ type: "message_end", message: abortedAssistant },
				runtime.ctx,
			),
		).toBeUndefined();
		await runtime.turnEnd(activeTurn(), runtime.ctx);

		const replacement = await runtime.messageEnd(
			{ type: "message_end", message: abortedAssistant },
			runtime.ctx,
		);
		expect(replacement?.message).toMatchObject({
			role: "assistant",
			content: [],
			stopReason: "stop",
		});
		expect(replacement?.message).not.toHaveProperty("errorMessage");
		expect(
			await runtime.messageEnd(
				{ type: "message_end", message: abortedAssistant },
				runtime.ctx,
			),
		).toBeUndefined();
		expect(
			await runtime.messageEnd(
				{
					type: "message_end",
					message: {
						...abortedAssistant,
						errorMessage: "network unavailable",
					},
				},
				runtime.ctx,
			),
		).toBeUndefined();
	});

	it("does not interrupt when a user continuation is already queued", async () => {
		const runtime = setup(usage(360_000));
		const ctx = {
			...runtime.ctx,
			hasPendingMessages: () => true,
		} as ExtensionContext;
		await runtime.sessionStart(
			{ type: "session_start", reason: "startup" },
			ctx,
		);
		await runtime.turnEnd(activeTurn(), ctx);

		expect(runtime.ctx.abort).not.toHaveBeenCalled();
		expect(runtime.compact).not.toHaveBeenCalled();
	});

	it("does not interrupt a final turn or a turn below the threshold", async () => {
		const runtime = setup(usage(355_616));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		runtime.setUsage(usage(360_000));
		await runtime.turnEnd(activeTurn([]), runtime.ctx);

		expect(runtime.compact).not.toHaveBeenCalled();
	});

	it("opens a failure circuit while preserving manual and overflow compaction", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		await runtime.agentSettled(
			{ type: "agent_settled" },
			runtime.ctx,
		);
		runtime.compactOptions?.onError?.(new Error("summarizer unavailable"));
		expect(runtime.ctx.ui.notify).not.toHaveBeenCalledWith(
			"[auto-compact] Compaction failed: summarizer unavailable",
			"error",
		);

		expect(
			await runtime.sessionBeforeCompact(
				{ type: "session_before_compact", reason: "threshold" },
				runtime.ctx,
			),
		).toEqual({ cancel: true });
		for (const reason of ["manual", "overflow"] as const) {
			expect(
				await runtime.sessionBeforeCompact(
					{ type: "session_before_compact", reason },
					runtime.ctx,
				),
			).toBeUndefined();
		}

		runtime.setUsage(usage(100_000));
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		runtime.setUsage(usage(360_000));
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		expect(runtime.compact).toHaveBeenCalledTimes(1);
		expect(runtime.pi.sendMessage).toHaveBeenCalledTimes(1);

		await runtime.sessionCompact(
			{ type: "session_compact", reason: "manual" },
			runtime.ctx,
		);
		expect(
			await runtime.sessionBeforeCompact(
				{ type: "session_before_compact", reason: "threshold" },
				runtime.ctx,
			),
		).toBeUndefined();
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		await runtime.agentSettled(
			{ type: "agent_settled" },
			runtime.ctx,
		);
		expect(runtime.compact).toHaveBeenCalledTimes(2);
	});

	it("borrows Pi's failure event to stop repeated native threshold compaction", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);

		await runtime.sessionCompactFailed(
			{
				type: "session_compact_failed",
				reason: "threshold",
				errorMessage: "Auto-compaction failed: summarizer unavailable",
				aborted: false,
				willRetry: false,
				fromExtension: false,
			},
			runtime.ctx,
		);

		expect(
			await runtime.sessionBeforeCompact(
				{ type: "session_before_compact", reason: "threshold" },
				runtime.ctx,
			),
		).toEqual({ cancel: true });
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		expect(runtime.ctx.abort).not.toHaveBeenCalled();

		await runtime.sessionCompact(
			{ type: "session_compact", reason: "manual" },
			runtime.ctx,
		);
		expect(
			await runtime.sessionBeforeCompact(
				{ type: "session_before_compact", reason: "threshold" },
				runtime.ctx,
			),
		).toBeUndefined();
	});

	it("does not open the failure circuit for an aborted compaction", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.sessionCompactFailed(
			{
				type: "session_compact_failed",
				reason: "threshold",
				aborted: true,
				willRetry: false,
				fromExtension: false,
			},
			runtime.ctx,
		);

		expect(
			await runtime.sessionBeforeCompact(
				{ type: "session_before_compact", reason: "threshold" },
				runtime.ctx,
			),
		).toBeUndefined();
	});

	it("does not resume when compaction is cancelled or after session shutdown", async () => {
		const cancelled = setup(usage(360_000));
		await cancelled.sessionStart(
			{ type: "session_start", reason: "startup" },
			cancelled.ctx,
		);
		await cancelled.turnEnd(activeTurn(), cancelled.ctx);
		await cancelled.agentSettled(
			{ type: "agent_settled" },
			cancelled.ctx,
		);
		cancelled.compactOptions?.onError?.(new Error("Compaction cancelled"));
		expect(cancelled.pi.sendMessage).not.toHaveBeenCalled();

		const stale = setup(usage(360_000));
		await stale.sessionStart(
			{ type: "session_start", reason: "startup" },
			stale.ctx,
		);
		await stale.turnEnd(activeTurn(), stale.ctx);
		await stale.agentSettled(
			{ type: "agent_settled" },
			stale.ctx,
		);
		await stale.sessionShutdown(
			{ type: "session_shutdown", reason: "reload" },
			stale.ctx,
		);
		stale.compactOptions?.onComplete?.({} as never);
		expect(stale.pi.sendMessage).not.toHaveBeenCalled();
	});

	it("honors disabled native compaction policy", async () => {
		const disabledPi = createMockPi();
		registerActiveTurnCompaction(disabledPi as never, {
			loadPolicy: () => ({ ...policy, enabled: false }),
			canCompact: () => true,
		});
		const disabledCtx = createMockCtx({
			isProjectTrusted: () => true,
			hasPendingMessages: () => false,
			getContextUsage: () => usage(360_000),
			compact: vi.fn(),
		});
		await disabledPi._getHook("session_start")[0].handler(
			{ type: "session_start", reason: "startup" },
			disabledCtx,
		);
		await disabledPi._getHook("turn_end")[0].handler(
			activeTurn(),
			disabledCtx,
		);
		expect(disabledCtx.compact).not.toHaveBeenCalled();
	});
});
