import type {
	CompactOptions,
	ContextUsage,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	registerActiveTurnCompaction,
	shouldCompactDuringActiveTurn,
} from "../extensions/active-turn-compaction.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const policy = { enabled: true, reserveTokens: 16_384 };

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

function setup(initialUsage: ContextUsage = usage(100_000)) {
	const pi = createMockPi();
	let currentUsage = initialUsage;
	let compactOptions: CompactOptions | undefined;
	const compact = vi.fn((options?: CompactOptions) => {
		compactOptions = options;
	});
	const ctx = createMockCtx({
		isProjectTrusted: () => true,
		getContextUsage: vi.fn(() => currentUsage),
		compact,
	}) as unknown as ExtensionContext;

	registerActiveTurnCompaction(pi as never, {
		loadPolicy: () => policy,
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
		sessionStart: hook("session_start"),
		sessionShutdown: hook("session_shutdown"),
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

describe("active-turn compaction", () => {
	it("matches Pi's strict reserve-token threshold", () => {
		expect(
			shouldCompactDuringActiveTurn(usage(355_616), policy),
		).toBe(false);
		expect(
			shouldCompactDuringActiveTurn(usage(355_617), policy),
		).toBe(true);
		expect(
			shouldCompactDuringActiveTurn(usage(400_000), {
				...policy,
				enabled: false,
			}),
		).toBe(false);
		expect(shouldCompactDuringActiveTurn(usage(null), policy)).toBe(false);
	});

	it("compacts during a tool-driven request and resumes after completion", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);

		expect(runtime.compact).toHaveBeenCalledTimes(1);
		expect(runtime.ctx.ui.notify).toHaveBeenCalledWith(
			"[auto-compact] Compacting context before continuing the active request.",
			"info",
		);

		runtime.compactOptions?.onComplete?.({} as never);
		expect(runtime.pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "active-turn-compaction.continue",
				display: false,
			}),
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	});

	it("does not interrupt a final turn or a turn below the threshold", async () => {
		const runtime = setup(usage(355_616));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		runtime.setUsage(usage(360_000));
		await runtime.turnEnd(activeTurn([]), runtime.ctx);

		expect(runtime.compact).not.toHaveBeenCalled();
	});

	it("attempts only once while usage remains above the threshold", async () => {
		const runtime = setup(usage(360_000));
		await runtime.sessionStart({ type: "session_start", reason: "startup" }, runtime.ctx);
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		runtime.compactOptions?.onError?.(new Error("summarizer unavailable"));
		await runtime.turnEnd(activeTurn(), runtime.ctx);

		expect(runtime.compact).toHaveBeenCalledTimes(1);
		expect(runtime.pi.sendMessage).toHaveBeenCalledTimes(1);

		runtime.setUsage(usage(100_000));
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		runtime.setUsage(usage(360_000));
		await runtime.turnEnd(activeTurn(), runtime.ctx);
		expect(runtime.compact).toHaveBeenCalledTimes(2);
	});

	it("does not resume when compaction is cancelled or after session shutdown", async () => {
		const cancelled = setup(usage(360_000));
		await cancelled.sessionStart(
			{ type: "session_start", reason: "startup" },
			cancelled.ctx,
		);
		await cancelled.turnEnd(activeTurn(), cancelled.ctx);
		cancelled.compactOptions?.onError?.(new Error("Compaction cancelled"));
		expect(cancelled.pi.sendMessage).not.toHaveBeenCalled();

		const stale = setup(usage(360_000));
		await stale.sessionStart(
			{ type: "session_start", reason: "startup" },
			stale.ctx,
		);
		await stale.turnEnd(activeTurn(), stale.ctx);
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
		});
		const disabledCtx = createMockCtx({
			isProjectTrusted: () => true,
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
