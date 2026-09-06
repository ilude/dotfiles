import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsyncPoller } from "../lib/async-poller.ts";

afterEach(() => {
	vi.useRealTimers();
});

describe("createAsyncPoller", () => {
	it("waits for completion and emits only changed values", async () => {
		vi.useFakeTimers();
		const values = ["same", "same", "changed"];
		const run = vi.fn(async () => values.shift() ?? "changed");
		const onValue = vi.fn();
		const poller = createAsyncPoller({ intervalMs: 5_000, run, onValue });

		poller.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(onValue).toHaveBeenCalledWith("same");

		await vi.advanceTimersByTimeAsync(5_000);
		expect(run).toHaveBeenCalledTimes(2);
		expect(onValue).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5_000);
		expect(onValue).toHaveBeenLastCalledWith("changed");
		expect(onValue).toHaveBeenCalledTimes(2);
		poller.dispose();
	});

	it("does not overlap slow polls and aborts on dispose", async () => {
		vi.useFakeTimers();
		let resolveRun: ((value: string) => void) | undefined;
		let observedSignal: AbortSignal | undefined;
		const run = vi.fn(
			(signal: AbortSignal) =>
				new Promise<string>((resolve) => {
					observedSignal = signal;
					resolveRun = resolve;
				}),
		);
		const onValue = vi.fn();
		const poller = createAsyncPoller({ intervalMs: 1_000, run, onValue });

		poller.start();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(run).toHaveBeenCalledTimes(1);

		resolveRun?.("done");
		await vi.advanceTimersByTimeAsync(0);
		expect(onValue).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(1_000);
		expect(run).toHaveBeenCalledTimes(2);
		poller.dispose();
		expect(observedSignal?.aborted).toBe(true);
	});
});
