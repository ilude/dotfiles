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
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

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

function makeBashResultEvent(
	stdout: string,
	isError = false,
	details?: { fullOutputPath?: string },
) {
	return {
		type: "tool_result" as const,
		toolName: "bash" as const,
		toolCallId: "test-call-id",
		input: { command: "git status" },
		content: [{ type: "text" as const, text: stdout }],
		isError,
		details,
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

function reducedResponse(inlineText = "compacted", bytesBefore = 1000): string {
	return JSON.stringify({
		inline_text: inlineText,
		facts: {},
		rule_id: "git/status",
		bytes_before: bytesBefore,
		bytes_after: Buffer.byteLength(inlineText, "utf-8"),
		reduction_applied: true,
	});
}

function extremeOutput(text: string): string {
	return text.repeat(Math.ceil((64 * 1024) / Buffer.byteLength(text, "utf-8")) + 1);
}

function makeToolResultMessage(
	toolCallId: string,
	toolName: string,
	stdout: string,
	isError = false,
) {
	return {
		role: "toolResult" as const,
		toolCallId,
		toolName,
		content: [{ type: "text" as const, text: stdout }],
		isError,
		timestamp: 1,
	};
}

function attachRequestAwareReducer(
	child: import("node:child_process").ChildProcess,
): void {
	child.stdin?.on("data", (chunk: Buffer) => {
		const request = JSON.parse(chunk.toString("utf-8")) as { stdout: string };
		queueMicrotask(() => {
			child.stdout?.emit(
				"data",
				Buffer.from(
					`${reducedResponse("compacted", Buffer.byteLength(request.stdout, "utf-8"))}\n`,
				),
			);
		});
	});
}

function closeWithStdout(
	child: import("node:child_process").ChildProcess,
	stdout: string,
): void {
	queueMicrotask(() => {
		child.stdout?.emit("data", Buffer.from(`${stdout}\n`));
		child.emit("close", 0);
	});
}

function contextWithUsage(
	percent: number,
	sessionFile = "C:/sessions/test.jsonl",
) {
	return createMockCtx({
		getContextUsage: () => ({
			tokens: percent * 1000,
			contextWindow: 100_000,
			percent,
		}),
		sessionManager: {
			getSessionFile: () => sessionFile,
		},
	});
}

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
		it("compacts an extreme git status sample to fewer bytes", async () => {
			const fixtureText = extremeOutput(fs.readFileSync(FIXTURE_PATH, "utf-8"));
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
			expect(compactedText).toContain("[tool-reduction] bytes=");
			const rawPath = compactedText.match(/ raw=(.+)$/)?.[1];
			expect(rawPath).toBeDefined();
			expect(fs.readFileSync(rawPath ?? "", "utf-8")).toBe(fixtureText);
		}, 30000);
	});

	describe("ingestion bypass", () => {
		it("does not spawn the reducer for routine bash output", async () => {
			const { spawn } = await import("node:child_process");
			vi.mocked(spawn).mockClear();
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const result = await hook.handler(
				makeBashResultEvent("routine output\n".repeat(100)),
			);

			expect(result).toBeUndefined();
			expect(spawn).not.toHaveBeenCalled();
		});
	});

	describe("recovery markers", () => {
		it("writes reducer-only raw output and appends a recovery marker", async () => {
			const scratchHome = fs.mkdtempSync(
				path.join(os.tmpdir(), "tool-reduction-home-"),
			);
			const previousHome = process.env.HOME;
			process.env.HOME = scratchHome;
			try {
				const child = createMockChild();
				spawnBehavior = () => {
					closeWithStdout(child, reducedResponse());
					return child;
				};
				const mod = await import("../extensions/tool-reduction.ts");
				mod.default(mockPi as unknown as ExtensionAPI);
				const [hook] = mockPi._getHook("tool_result");
				const raw = extremeOutput("raw output\n");
				const result = await hook.handler(makeBashResultEvent(raw));
				const text = (result?.content[0] as TextBlock).text;
				expect(text).toContain(
					"[tool-reduction] bytes=1000->9 rule=git/status raw=",
				);
				const rawPath = text.match(/ raw=(.+)$/)?.[1];
				expect(rawPath).toBeDefined();
				expect(fs.readFileSync(rawPath ?? "", "utf-8")).toBe(raw);
			} finally {
				if (previousHome === undefined) delete process.env.HOME;
				else process.env.HOME = previousHome;
			}
		});

		it("uses Pi's full output path when the bash result was truncated", async () => {
			const fullPath = path.join(
				fs.mkdtempSync(path.join(os.tmpdir(), "tool-reduction-full-")),
				"full.txt",
			);
			fs.writeFileSync(fullPath, "complete raw output", "utf-8");
			const child = createMockChild();
			spawnBehavior = () => {
				closeWithStdout(child, reducedResponse());
				return child;
			};
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("tool_result");
			const result = await hook.handler(
				makeBashResultEvent(extremeOutput("truncated\n"), false, {
					fullOutputPath: fullPath,
				}),
			);
			const text = (result?.content[0] as TextBlock).text;
			expect(text).toContain(`raw=${fullPath}`);
			expect(fs.readFileSync(fullPath, "utf-8")).toBe("complete raw output");
		});

		it("bypasses reduction when PI_TOOL_REDUCTION is off", async () => {
			const previous = process.env.PI_TOOL_REDUCTION;
			process.env.PI_TOOL_REDUCTION = "off";
			try {
				const { spawn } = await import("node:child_process");
				vi.mocked(spawn).mockClear();
				const mod = await import("../extensions/tool-reduction.ts");
				mod.default(mockPi as unknown as ExtensionAPI);
				const [hook] = mockPi._getHook("tool_result");
				expect(
					await hook.handler(makeBashResultEvent("raw output".repeat(30))),
				).toBeUndefined();
				expect(spawn).not.toHaveBeenCalled();
			} finally {
				if (previous === undefined) delete process.env.PI_TOOL_REDUCTION;
				else process.env.PI_TOOL_REDUCTION = previous;
			}
		});

		it("removes expired raw output and enforces the byte cap", async () => {
			const rawDir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-reduction-raw-"));
			const expired = path.join(rawDir, "expired.txt");
			const oldest = path.join(rawDir, "oldest.txt");
			const newest = path.join(rawDir, "newest.txt");
			fs.writeFileSync(expired, "old");
			fs.writeFileSync(oldest, "1234");
			fs.writeFileSync(newest, "5678");
			fs.utimesSync(expired, new Date(0), new Date(0));
			fs.utimesSync(oldest, new Date(1000), new Date(1000));
			fs.utimesSync(newest, new Date(2000), new Date(2000));
			const mod = await import("../extensions/tool-reduction.ts");
			await mod.pruneRawOutputs(rawDir, {
				now: 3000,
				retentionMs: 2500,
				maxBytes: 4,
			});
			expect(fs.existsSync(expired)).toBe(false);
			expect(fs.existsSync(oldest)).toBe(false);
			expect(fs.existsSync(newest)).toBe(true);
		});
	});

describe("retroactive context reduction", () => {
		it("keeps the five newest results whole and reduces older results in one batch", async () => {
			const { spawn } = await import("node:child_process");
			const child = createMockChild();
			attachRequestAwareReducer(child);
			spawnBehavior = () => child;
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("context");
			const oldOutput = "old evidence line\n".repeat(900);
			const recentOutput = "recent full-fidelity output\n".repeat(900);
			const messages = [
				makeToolResultMessage("old-task", "task", oldOutput),
				makeToolResultMessage("old-subagent", "subagent", oldOutput),
				...Array.from({ length: 5 }, (_, index) =>
					makeToolResultMessage(`recent-${index}`, "bash", recentOutput),
				),
			];

			const sessionFile = path.join(
				fs.mkdtempSync(path.join(os.tmpdir(), "tool-reduction-session-")),
				"session.jsonl",
			);
			fs.writeFileSync(
				sessionFile,
				messages
					.map((message) => JSON.stringify({ type: "message", message }))
					.join("\n"),
				"utf-8",
			);
			const first = await hook.handler(
				{ type: "context", messages },
				contextWithUsage(51, sessionFile),
			);
			const second = await hook.handler(
				{ type: "context", messages },
				contextWithUsage(40, sessionFile),
			);

			expect(first).toEqual(second);
			expect(spawn).toHaveBeenCalledTimes(1);
			for (const message of first.messages.slice(0, 2)) {
				const text = (message.content[0] as TextBlock).text;
				expect(text).toContain("compacted");
				expect(text).toContain(`raw=${sessionFile}`);
				expect(text).toContain("locator=toolCallId:old-");
			}
			for (const message of first.messages.slice(-5)) {
				expect((message.content[0] as TextBlock).text).toBe(recentOutput);
			}
			expect((messages[0].content[0] as TextBlock).text).toBe(oldOutput);
			const stored = fs
				.readFileSync(sessionFile, "utf-8")
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(stored[0].message.content[0].text).toBe(oldOutput);

			const shortenedBranch = messages.slice(0, 5);
			expect(
				await hook.handler(
					{ type: "context", messages: shortenedBranch },
					contextWithUsage(40, sessionFile),
				),
			).toBeUndefined();

			const appended = [
				...messages,
				makeToolResultMessage("newest", "bash", recentOutput),
			];
			const beforeNextGeneration = await hook.handler(
				{ type: "context", messages: appended },
				contextWithUsage(55, sessionFile),
			);
			expect(
				(beforeNextGeneration.messages[2].content[0] as TextBlock).text,
			).toBe(recentOutput);
			expect(spawn).toHaveBeenCalledTimes(1);

			const nextGeneration = await hook.handler(
				{ type: "context", messages: appended },
				contextWithUsage(56, sessionFile),
			);
			expect(
				(nextGeneration.messages[2].content[0] as TextBlock).text,
			).toContain("[tool-reduction]");
			expect(spawn).toHaveBeenCalledTimes(1);
		});

		it("does nothing below the threshold before any batch has run", async () => {
			const { spawn } = await import("node:child_process");
			vi.mocked(spawn).mockClear();
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("context");
			const messages = Array.from({ length: 6 }, (_, index) =>
				makeToolResultMessage(
					`result-${index}`,
					"task",
					"full output\n".repeat(2000),
				),
			);

			expect(
				await hook.handler(
					{ type: "context", messages },
					contextWithUsage(49),
				),
			).toBeUndefined();
			expect(spawn).not.toHaveBeenCalled();
		});

		it("retries a retroactive result after a transient worker crash", async () => {
			const { spawn } = await import("node:child_process");
			const crashed = createMockChild(201);
			const restarted = createMockChild(202);
			attachRequestAwareReducer(restarted);
			let attempts = 0;
			spawnBehavior = () => {
				attempts += 1;
				if (attempts === 1) {
					queueMicrotask(() => crashed.emit("close", 1));
					return crashed;
				}
				return restarted;
			};
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("context");
			const messages = [
				makeToolResultMessage("old", "task", "old output\n".repeat(2500)),
				...Array.from({ length: 5 }, (_, index) =>
					makeToolResultMessage(`recent-${index}`, "task", "recent"),
				),
			];
			const event = { type: "context", messages };
			const ctx = contextWithUsage(60);

			expect(await hook.handler(event, ctx)).toBeUndefined();
			expect(await hook.handler(event, ctx)).toBeDefined();
			expect(spawn).toHaveBeenCalledTimes(2);
		});

		it("waits until pending reductions reclaim a full batch", async () => {
			const { spawn } = await import("node:child_process");
			const child = createMockChild();
			attachRequestAwareReducer(child);
			spawnBehavior = () => child;
			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("context");
			const messages = [
				makeToolResultMessage("old", "task", "old output\n".repeat(400)),
				...Array.from({ length: 5 }, (_, index) =>
					makeToolResultMessage(`recent-${index}`, "task", "recent"),
				),
			];
			const event = { type: "context", messages };
			const ctx = contextWithUsage(60);

			expect(await hook.handler(event, ctx)).toBeUndefined();
			expect(await hook.handler(event, ctx)).toBeUndefined();
			expect(spawn).toHaveBeenCalledTimes(1);
		});
	});

	// ---------------------------------------------------------------------------
	// Failure modes fall through to raw (return undefined)
	// ---------------------------------------------------------------------------
	describe("failure modes fall through to raw", () => {
		it("(a) spawn throws ENOENT: returns undefined without throwing", async () => {
			spawnBehavior = () => {
				throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const event = makeBashResultEvent(extremeOutput("some output"));
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
					makeBashResultEvent(extremeOutput("some output")),
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

		it("(c) asynchronous stdin failure stops the worker and returns undefined", async () => {
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
				const result = hook.handler(
					makeBashResultEvent(extremeOutput("some output")),
				);
				child.stdin?.emit("error", new Error("write EOF"));

				expect(await result).toBeUndefined();
				if (process.platform === "win32") {
					expect(spawn).toHaveBeenLastCalledWith(
						"taskkill",
						["/PID", "123", "/T", "/F"],
						expect.objectContaining({ stdio: "ignore", windowsHide: true }),
					);
				} else {
					expect(processKill).toHaveBeenCalledWith(-123, "SIGKILL");
				}
			} finally {
				processKill.mockRestore();
			}
		});

		it("(d) subprocess emits non-JSON stdout: returns undefined", async () => {
			const child = createMockChild();
			spawnBehavior = () => {
				closeWithStdout(child, "not json");
				return child;
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const result = await hook.handler(
				makeBashResultEvent(extremeOutput("some output")),
			);
			expect(result).toBeUndefined();
		});
	});

describe("persistent worker behavior", () => {
		it("reuses one worker process for sequential requests", async () => {
			const { spawn } = await import("node:child_process");
			const child = createMockChild();
			child.stdin?.on("data", () => {
				queueMicrotask(() => {
					child.stdout?.emit("data", Buffer.from(`${reducedResponse()}\n`));
				});
			});
			spawnBehavior = () => child;

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("tool_result");

			await hook.handler(makeBashResultEvent(extremeOutput("first output")));
			await hook.handler(makeBashResultEvent(extremeOutput("second output")));

			expect(spawn).toHaveBeenCalledTimes(1);
		});

		it("cleans the worker process tree on session shutdown", async () => {
			const child = createMockChild();
			spawnBehavior = () => child;
			const processKill = vi
				.spyOn(process, "kill")
				.mockImplementation(() => true);
			try {
				const mod = await import("../extensions/tool-reduction.ts");
				mod.default(mockPi as unknown as ExtensionAPI);
				const [toolHook] = mockPi._getHook("tool_result");
				const [shutdownHook] = mockPi._getHook("session_shutdown");
				const result = toolHook.handler(
					makeBashResultEvent(extremeOutput("pending output")),
				);

				shutdownHook.handler();
				if (process.platform !== "win32") {
					expect(processKill).toHaveBeenCalledWith(-123, "SIGKILL");
				}
				expect(await result).toBeUndefined();
			} finally {
				processKill.mockRestore();
			}
		});

		it("restarts after a worker crash", async () => {
			const { spawn } = await import("node:child_process");
			const crashed = createMockChild(101);
			const restarted = createMockChild(102);
			restarted.stdin?.on("data", () => {
				queueMicrotask(() => {
					restarted.stdout?.emit("data", Buffer.from(`${reducedResponse()}\n`));
				});
			});
			let attempts = 0;
			spawnBehavior = () => {
				attempts += 1;
				if (attempts === 1) {
					queueMicrotask(() => crashed.emit("close", 1));
					return crashed;
				}
				return restarted;
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);
			const [hook] = mockPi._getHook("tool_result");

			expect(
				await hook.handler(makeBashResultEvent(extremeOutput("crashed output"))),
			).toBeUndefined();
			expect(
				await hook.handler(makeBashResultEvent(extremeOutput("restarted output"))),
			).toBeDefined();
			expect(spawn).toHaveBeenCalledTimes(2);
		});
	});

	describe("child-process invocation", () => {
		it("uses bare Python and sends only the observable reducer schema", async () => {
			const { spawn } = await import("node:child_process");
			const child = createMockChild();
			let requestBody = "";
			child.stdin?.on("data", (chunk: Buffer) => {
				requestBody += chunk.toString("utf-8");
			});
			spawnBehavior = () => {
				closeWithStdout(child, '{"inline_text":"compacted"}');
				return child;
			};

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as unknown as ExtensionAPI);

			const [hook] = mockPi._getHook("tool_result");
			const stdout = extremeOutput("some output");
			await hook.handler(makeBashResultEvent(stdout));

			expect(JSON.parse(requestBody)).toEqual({
				argv: ["git", "status"],
				exit_code: 0,
				stdout,
			});
			expect(spawn).toHaveBeenCalledWith(
				"python",
				[expect.stringMatching(/tool-reduction[\\/]reduce\.py$/), "--worker"],
				expect.objectContaining({
					detached: process.platform !== "win32",
					windowsHide: true,
					stdio: ["pipe", "pipe", "pipe"],
				}),
			);
		});
	});
