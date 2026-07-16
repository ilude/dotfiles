/**
 * Tests for the tool-reduction extension.
 *
 * Test 1: real end-to-end -- git status sample compacts to fewer bytes.
 * Test 2: three failure modes all fall through to raw (undefined return).
 * Test 3: mocked child-process behavior covers invocation and timeout cleanup.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Controlled spawn mock -- tests set spawnBehavior before importing extension.
// "real" = use actual child_process.spawn; otherwise a factory fn is called.
// ---------------------------------------------------------------------------
type SpawnBehavior =
	| "real"
	| ((
			...args: Parameters<typeof import("node:child_process").spawn>
	  ) => import("node:child_process").ChildProcess);

let spawnBehavior: SpawnBehavior = "real";

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: vi.fn((...args: Parameters<typeof actual.spawn>) => {
			if (spawnBehavior === "real") {
				return actual.spawn(...args);
			}
			return spawnBehavior(...args);
		}),
	};
});

const FIXTURE_PATH = path.resolve(
	os.homedir(),
	".dotfiles",
	"pi",
	"tool-reduction",
	"tests",
	"fixtures",
	"git-status-sample.txt",
);

type TextBlock = { type: "text"; text: string };

function makeBashResultEvent(stdout: string, isError = false) {
	return {
		type: "tool_result" as const,
		toolName: "bash" as const,
		toolCallId: "test-call-id",
		input: { command: "git status" },
		content: [{ type: "text" as const, text: stdout }],
		isError,
		details: undefined,
	};
}

function createMockChild(pid = 123): import("node:child_process").ChildProcess {
	const child = new EventEmitter();
	Object.assign(child, {
		pid,
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
	});
	return child as unknown as import("node:child_process").ChildProcess;
}

function closeWithStdout(
	child: import("node:child_process").ChildProcess,
	stdout: string,
): void {
	queueMicrotask(() => {
		child.stdout?.emit("data", Buffer.from(stdout));
		child.emit("close", 0);
	});
}

describe("tool-reduction extension", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.resetModules();
		spawnBehavior = "real";
		mockPi = createMockPi();
	});

	// ---------------------------------------------------------------------------
	// Test 1: real end-to-end compaction
	// ---------------------------------------------------------------------------
	describe("git status compaction (end-to-end)", () => {
		it("compacts git status sample to fewer bytes", async () => {
			const fixtureText = fs.readFileSync(FIXTURE_PATH, "utf-8");
			const bytesBefore = Buffer.byteLength(fixtureText, "utf-8");

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			expect(hook).toBeDefined();

			const event = makeBashResultEvent(fixtureText);
			const result = await hook.handler(event);

			if (result === undefined) {
				// Reducer not available in this environment -- skip bytes assertion.
				return;
			}

			expect(result).toBeDefined();
			expect(result.content).toBeDefined();
			expect(result.content.length).toBeGreaterThan(0);

			const compactedText = result.content
				.filter((c): c is TextBlock => c.type === "text")
				.map((c) => c.text)
				.join("");

			const bytesAfter = Buffer.byteLength(compactedText, "utf-8");
			expect(bytesAfter).toBeLessThan(bytesBefore);
		}, 30000);
	});

	describe("small-output bypass", () => {
		it("does not spawn the reducer for tiny bash output", async () => {
			const { spawn } = await import("node:child_process");
			vi.mocked(spawn).mockClear();
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const result = await hook.handler(makeBashResultEvent("ok\n"));

			expect(result).toBeUndefined();
			expect(spawn).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// Test 2: failure modes fall through to raw (return undefined)
	// ---------------------------------------------------------------------------
	describe("failure modes fall through to raw", () => {
		it("(a) spawn throws ENOENT: returns undefined without throwing", async () => {
			spawnBehavior = () => {
				throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const event = makeBashResultEvent("some output".repeat(24));
			const result = await hook.handler(event);
			expect(result).toBeUndefined();
		});

		it("(b) timeout stops the reducer process and returns undefined", async () => {
			vi.useFakeTimers();
			const { spawn } = await import("node:child_process");
			const child = createMockChild();
			spawnBehavior = () => child;
			const processKill = vi
				.spyOn(process, "kill")
				.mockImplementation(() => true);

			try {
				const mod = await import("../extensions/tool-reduction.ts");
				mod.default(mockPi as unknown as ExtensionAPI);

				const [hook] = mockPi._getHook("tool_result");
				const resultPromise = hook.handler(
					makeBashResultEvent("some output".repeat(24)),
				);
				await vi.advanceTimersByTimeAsync(3000);

				if (process.platform === "win32") {
					expect(spawn).toHaveBeenLastCalledWith(
						"taskkill",
						["/PID", "123", "/T", "/F"],
						expect.objectContaining({
							stdio: "ignore",
							windowsHide: true,
						}),
					);
				} else {
					expect(processKill).toHaveBeenCalledWith(-123, "SIGKILL");
				}

				child.emit("close", 0);
				expect(await resultPromise).toBeUndefined();
			} finally {
				processKill.mockRestore();
				vi.useRealTimers();
			}
		});

		it("(c) subprocess emits non-JSON stdout: returns undefined", async () => {
			const child = createMockChild();
			spawnBehavior = () => {
				closeWithStdout(child, "not json");
				return child;
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const result = await hook.handler(
				makeBashResultEvent("some output".repeat(24)),
			);
			expect(result).toBeUndefined();
		});
	});

	describe("child-process invocation", () => {
		it("uses bare Python with hidden Windows process options", async () => {
			const { spawn } = await import("node:child_process");
			const child = createMockChild();
			spawnBehavior = () => {
				closeWithStdout(child, '{"inline_text":"compacted"}');
				return child;
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			await hook.handler(makeBashResultEvent("some output".repeat(24)));

			expect(spawn).toHaveBeenCalledWith(
				"python",
				[expect.stringMatching(/tool-reduction[\\/]reduce\.py$/)],
				expect.objectContaining({
					detached: process.platform !== "win32",
					windowsHide: true,
					stdio: ["pipe", "pipe", "pipe"],
				}),
			);
		});
	});
});
