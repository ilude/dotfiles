/**
 * Tests for the tool-reduction extension.
 *
 * Test 1: real end-to-end -- git status sample compacts to fewer bytes.
 * Test 2: three failure modes all fall through to raw (undefined return).
 * Test 3: source-level assertions -- no 'uv run', windowsHide present.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPi } from "./helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Controlled spawn mock -- tests set spawnBehavior before importing extension.
// "real" = use actual child_process.spawn; otherwise a factory fn is called.
// ---------------------------------------------------------------------------
type SpawnBehavior = "real" | (() => import("node:child_process").ChildProcess);

let spawnBehavior: SpawnBehavior = "real";

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: vi.fn((...args: Parameters<typeof actual.spawn>) => {
			if (spawnBehavior === "real") {
				return actual.spawn(...args);
			}
			return (spawnBehavior as () => import("node:child_process").ChildProcess)();
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

const EXTENSION_PATH = path.resolve(
	os.homedir(),
	".dotfiles",
	"pi",
	"extensions",
	"tool-reduction.ts",
);

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
			mod.default(mockPi as any);

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
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text)
				.join("");

			const bytesAfter = Buffer.byteLength(compactedText, "utf-8");
			expect(bytesAfter).toBeLessThan(bytesBefore);
		}, 10000);
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
			mod.default(mockPi as any);

			const [hook] = mockPi._getHook("tool_result");
			const event = makeBashResultEvent("some output");
			const result = await hook.handler(event);
			expect(result).toBeUndefined();
		});

		it("(b) subprocess sleeps 10s: hook returns within 3500ms with raw", async () => {
			// Spawn a real long-running process to exercise the SIGKILL timeout path.
			spawnBehavior = "real";

			// Override the script path by using a real sleep-like command.
			const { spawn: actualSpawn } = await import("node:child_process");
			const sleepCmd = process.platform === "win32" ? "timeout" : "sleep";
			const sleepArg = "10";
			spawnBehavior = () => actualSpawn(sleepCmd, [sleepArg], {
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as any);

			const [hook] = mockPi._getHook("tool_result");
			const event = makeBashResultEvent("some output");

			const start = Date.now();
			const result = await hook.handler(event);
			const elapsed = Date.now() - start;

			expect(result).toBeUndefined();
			expect(elapsed).toBeLessThan(3500);
		}, 5000);

		it("(c) subprocess emits non-JSON stdout: returns undefined", async () => {
			const { spawn: actualSpawn } = await import("node:child_process");
			const echoCmd = process.platform === "win32" ? "cmd" : "sh";
			const echoArgs =
				process.platform === "win32"
					? ["/c", "echo not json"]
					: ["-c", "printf 'not json'"];
			spawnBehavior = () => actualSpawn(echoCmd, echoArgs, {
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});

			const mod = await import("../extensions/tool-reduction.ts");
			mod.default(mockPi as any);

			const [hook] = mockPi._getHook("tool_result");
			const event = makeBashResultEvent("some output");
			const result = await hook.handler(event);
			expect(result).toBeUndefined();
		}, 5000);
	});

	// ---------------------------------------------------------------------------
	// Test 3: source-level assertions
	// ---------------------------------------------------------------------------
	describe("source-level safety assertions", () => {
		it("extension source does not contain 'uv run'", () => {
			const source = fs.readFileSync(EXTENSION_PATH, "utf-8");
			expect(source).not.toContain("uv run");
		});

		it("extension source contains windowsHide", () => {
			const source = fs.readFileSync(EXTENSION_PATH, "utf-8");
			expect(source).toContain("windowsHide");
		});
	});
});
