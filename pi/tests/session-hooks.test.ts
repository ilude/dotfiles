/**
 * Behavioral tests for session-hooks.ts (T4 Phase 2 Wave 2).
 *
 * Required AC coverage:
 *   - initializeTranscriptRuntime is called from session_start when transcript
 *     settings are enabled.
 *   - session_shutdown emits a trace event into the runtime when a writer is
 *     active.
 *
 * Strategy: spy on the real `transcript-runtime` and `lib/transcript` exports.
 * Vitest's spy mechanism redirects the named imports inside session-hooks.ts
 * via the live ES-module binding. The git pre-flight branch in session_start
 * uses an early `return` when pi.exec yields code !== 0; tests therefore
 * provide a successful pi.exec stub so the handler reaches the transcript
 * init step.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi, createMockCtx } from "./helpers/mock-pi";
import * as transcriptRuntime from "../extensions/transcript-runtime";
import * as transcriptLib from "../lib/transcript";

let tmpDir: string;
let initializeRuntimeSpy: ReturnType<typeof vi.spyOn>;
let getWriterSpy: ReturnType<typeof vi.spyOn>;
let emitSpy: ReturnType<typeof vi.spyOn>;
let loadSettingsSpy: ReturnType<typeof vi.spyOn>;
let sweepRetentionSpy: ReturnType<typeof vi.spyOn>;

function makeSessionCtx(extra: Record<string, any> = {}) {
	return {
		...createMockCtx(),
		cwd: tmpDir,
		modelRegistry: {
			find: vi.fn(() => undefined),
		},
		sessionManager: {
			getSessionId: vi.fn(() => "test-session-id"),
			getSessionFile: vi.fn(() => null),
		},
		...extra,
	};
}

function makeGitFriendlyPi() {
	const pi = createMockPi();
	(pi as any).setModel = vi.fn(async () => {});
	// Default behavior: git fetch returns code 0; behind-count returns "0".
	// This lets the session_start handler fall through to the transcript init
	// stage so we can assert on initializeTranscriptRuntime.
	(pi.exec as any).mockImplementation(async (cmd: string, args: string[]) => {
		if (cmd === "git" && args && args.includes("rev-list")) {
			return { code: 0, stdout: "0\n", stderr: "" };
		}
		return { code: 0, stdout: "", stderr: "" };
	});
	return pi;
}

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-session-hooks-test-"));

	initializeRuntimeSpy = vi.spyOn(transcriptRuntime, "initializeRuntime").mockReturnValue(null as any);
	getWriterSpy = vi.spyOn(transcriptRuntime, "getWriter").mockReturnValue(null as any);
	emitSpy = vi.spyOn(transcriptRuntime, "emit").mockResolvedValue(undefined as any);
	loadSettingsSpy = vi.spyOn(transcriptLib, "loadSettings").mockReturnValue({
		enabled: false,
		path: "",
		retentionDays: 30,
	} as any);
	sweepRetentionSpy = vi.spyOn(transcriptLib, "sweepRetention").mockResolvedValue(undefined as any);
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe("session-hooks: session_start", () => {
	it("calls initializeTranscriptRuntime when transcript settings are enabled", async () => {
		// Transcript-enabled config -- both branches (sweep + writer init) fire.
		loadSettingsSpy.mockReturnValue({
			enabled: true,
			path: path.join(tmpDir, "traces"),
			retentionDays: 7,
		} as any);
		initializeRuntimeSpy.mockReturnValue({ sessionId: "test-session-id" } as any);
		getWriterSpy.mockReturnValue({ closed: false } as any);

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as any);

		const sessionStartHooks = pi._getHook("session_start");
		expect(sessionStartHooks.length).toBeGreaterThan(0);

		const ctx = makeSessionCtx();
		await sessionStartHooks[0].handler({ reason: "fresh" }, ctx as any);

		expect(initializeRuntimeSpy).toHaveBeenCalledTimes(1);
		expect(initializeRuntimeSpy).toHaveBeenCalledWith("test-session-id");

		// Writer is active -- session_start trace event should have been emitted.
		const sessionStartEmits = emitSpy.mock.calls.filter(
			(args: any[]) => args[0]?.event_type === "session_start",
		);
		expect(sessionStartEmits.length).toBe(1);
		expect(sessionStartEmits[0][0]).toMatchObject({
			event_type: "session_start",
			turn_id: "turn-0",
		});

		// Sweep was triggered because settings.enabled is true.
		expect(sweepRetentionSpy).toHaveBeenCalled();
	});

	it("does not crash session_start when transcript is disabled", async () => {
		loadSettingsSpy.mockReturnValue({ enabled: false, path: "", retentionDays: 30 } as any);
		initializeRuntimeSpy.mockReturnValue(null as any);
		getWriterSpy.mockReturnValue(null as any);

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as any);

		const sessionStartHooks = pi._getHook("session_start");
		const ctx = makeSessionCtx();

		await expect(
			sessionStartHooks[0].handler({ reason: "fresh" }, ctx as any),
		).resolves.toBeUndefined();

		// Sweep is skipped when settings.enabled is false.
		expect(sweepRetentionSpy).not.toHaveBeenCalled();
		// initializeTranscriptRuntime is still invoked unconditionally; it returns
		// null when transcript is disabled, which gates the subsequent emit().
		expect(initializeRuntimeSpy).toHaveBeenCalledTimes(1);
		const sessionStartEmits = emitSpy.mock.calls.filter(
			(args: any[]) => args[0]?.event_type === "session_start",
		);
		expect(sessionStartEmits.length).toBe(0);
	});
});

describe("session-hooks: session_shutdown", () => {
	it("emits a session_shutdown trace event when the writer is active", async () => {
		getWriterSpy.mockReturnValue({ closed: false } as any);

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as any);

		const shutdownHooks = pi._getHook("session_shutdown");
		expect(shutdownHooks.length).toBeGreaterThan(0);

		const ctx = makeSessionCtx();
		await shutdownHooks[0].handler(
			{ reason: "user-quit", targetSessionFile: "/tmp/never-exists.jsonl" },
			ctx as any,
		);

		const shutdownEmits = emitSpy.mock.calls.filter(
			(args: any[]) => args[0]?.event_type === "session_shutdown",
		);
		expect(shutdownEmits.length).toBe(1);
		expect(shutdownEmits[0][1]).toMatchObject({
			reason: "user-quit",
			target_session_file: "/tmp/never-exists.jsonl",
		});
	});

	it("does not emit a session_shutdown event when no writer is active", async () => {
		getWriterSpy.mockReturnValue(null as any);

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as any);

		const shutdownHooks = pi._getHook("session_shutdown");
		const ctx = makeSessionCtx();
		await shutdownHooks[0].handler({ reason: "user-quit", targetSessionFile: null }, ctx as any);

		const shutdownEmits = emitSpy.mock.calls.filter(
			(args: any[]) => args[0]?.event_type === "session_shutdown",
		);
		expect(shutdownEmits.length).toBe(0);
	});
});
