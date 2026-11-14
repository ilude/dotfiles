import { expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withCommitStatusRetry } from "../commands/commit/status.ts";

type Result = Awaited<ReturnType<ExtensionAPI["exec"]>>;
const clean: Result = { stdout: "", stderr: "", code: 0, killed: false, truncated: false };
const timeout: Result = { ...clean, code: 1, killed: true };
const args = ["-C", "checkout with spaces", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=dirty"];
const options = { timeout: 15_000 };

it("returns a successful empty status without retrying", async () => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(clean);
	const failed = vi.fn();
	expect(await withCommitStatusRetry(exec, failed)("git", args, options)).toBe(clean);
	expect(exec).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
});

it("retries one timed-out read with identical arguments and retains the complete successful status", async () => {
	const status = { ...clean, stdout: "M  a\0?? new file\0" };
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValueOnce(timeout).mockResolvedValueOnce(status);
	const failed = vi.fn(), progress = vi.fn();
	expect(await withCommitStatusRetry(exec, failed, progress)("git", args, options)).toBe(status);
	expect(exec.mock.calls).toEqual([["git", args, options], ["git", args, options]]);
	expect(progress).toHaveBeenCalledWith(expect.stringContaining('checkout with spaces'));
	expect(failed).not.toHaveBeenCalled();
});

it("stops after two timeouts and reports the repository, command, elapsed time and timeout", async () => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(timeout), failed = vi.fn();
	await expect(withCommitStatusRetry(exec, failed)("git", args, options)).rejects.toThrow(/Git status --porcelain=v1[\s\S]*checkout with spaces[\s\S]*after \d+ms \(attempt 2\/2; timeout 15000ms\): timed out/);
	expect(exec).toHaveBeenCalledTimes(2); expect(failed).toHaveBeenCalledTimes(1);
});

it("does not start a read when already cancelled", async () => {
	const controller = new AbortController(); controller.abort(new Error("operator cancelled"));
	const exec = vi.fn<ExtensionAPI["exec"]>(), failed = vi.fn();
	await expect(withCommitStatusRetry(exec, failed)("git", args, { ...options, signal: controller.signal })).rejects.toThrow("operator cancelled");
	expect(exec).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
});

it("does not retry a read cancelled while running", async () => {
	const controller = new AbortController(), failed = vi.fn();
	const exec = vi.fn<ExtensionAPI["exec"]>().mockImplementation(async () => {
		controller.abort(new Error("operator cancelled")); return timeout;
	});
	await expect(withCommitStatusRetry(exec, failed)("git", args, { ...options, signal: controller.signal })).rejects.toThrow("operator cancelled");
	expect(exec).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
});

it.each([
	[{ ...timeout, truncated: true }, "output limit exceeded"],
	[{ ...clean, code: 128, stderr: "invalid index" }, "exit 128; invalid index"],
] as const)("does not retry a failed read that was not a timeout: %j", async (result, reason) => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(result), failed = vi.fn();
	await expect(withCommitStatusRetry(exec, failed)("git", args, options)).rejects.toThrow(reason);
	expect(exec).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
});

it.each(["add", "commit", "fetch", "merge", "push"])("does not retry or reinterpret a timed-out %s", async operation => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(timeout), failed = vi.fn();
	const operationArgs = ["-C", "repo", operation];
	expect(await withCommitStatusRetry(exec, failed)("git", operationArgs, options)).toBe(timeout);
	expect(exec).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
});
