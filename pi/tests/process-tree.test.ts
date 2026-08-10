import { afterEach, describe, expect, it, vi } from "vitest";
import {
	signalProcessTree,
	terminateProcessTree,
	type ProcessTreeHandle,
} from "../lib/process-tree.ts";

function processHandle(): ProcessTreeHandle {
	return {
		pid: 42,
		exitCode: null,
		signalCode: null,
		kill: vi.fn(() => true),
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe("process tree termination", () => {
	it("signals the POSIX process group and falls back to the child", async () => {
		const child = processHandle();
		const killGroup = vi
			.fn<typeof process.kill>()
			.mockImplementationOnce(() => true)
			.mockImplementationOnce(() => {
				throw new Error("group missing");
			});

		await signalProcessTree(child, false, { platform: "linux", killGroup });
		expect(killGroup).toHaveBeenLastCalledWith(-42, "SIGTERM");

		await signalProcessTree(child, true, { platform: "linux", killGroup });
		expect(child.kill).toHaveBeenCalledWith("SIGKILL");
	});

	it("uses taskkill for Windows process trees", async () => {
		const child = processHandle();
		const runTaskkill = vi.fn(async () => 0);

		await signalProcessTree(child, true, {
			platform: "win32",
			runTaskkill,
		});

		expect(runTaskkill).toHaveBeenCalledWith(42, true);
		expect(child.kill).not.toHaveBeenCalled();
	});

	it("supports immediate force termination", () => {
		const child = processHandle();
		const runTaskkill = vi.fn(async () => 0);

		terminateProcessTree(child, {
			platform: "win32",
			runTaskkill,
			forceImmediately: true,
		});

		expect(runTaskkill).toHaveBeenCalledWith(42, true);
	});

	it("escalates a still-running process after the grace period", async () => {
		vi.useFakeTimers();
		const child = processHandle();
		const killGroup = vi.fn<typeof process.kill>(() => true);

		terminateProcessTree(child, {
			platform: "linux",
			killGroup,
			graceMs: 25,
		});
		expect(killGroup).toHaveBeenCalledWith(-42, "SIGTERM");

		await vi.advanceTimersByTimeAsync(25);
		expect(killGroup).toHaveBeenLastCalledWith(-42, "SIGKILL");
	});
});
