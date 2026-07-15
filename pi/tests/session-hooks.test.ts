/**
 * Behavioral tests for session-hooks.ts (T4 Phase 2 Wave 2).
 *
 * Required AC coverage:
 *   - initializeTranscriptRuntime is called from session_start when transcript
 *     settings are enabled.
 *   - session_shutdown emits a trace event into the runtime when a writer is
 *     active.
 *   - logical shutdowns persist one close marker before session archival.
 *   - reload archives without marking the logical session closed.
 *
 * Strategy: spy on the real `transcript-runtime` and `lib/transcript` exports.
 * Vitest's spy mechanism redirects the named imports inside session-hooks.ts
 * via the live ES-module binding. The git pre-flight branch in session_start
 * uses an early `return` when pi.exec yields code !== 0; tests therefore
 * provide a successful pi.exec stub so the handler reaches the transcript
 * init step.
 */

import * as fs from "node:fs";
import os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBehindWarning } from "../extensions/session-hooks";
import * as transcriptRuntime from "../extensions/transcript-runtime";
import type { TranscriptSettings } from "../lib/transcript";
import * as transcriptLib from "../lib/transcript";
import { createMockCtx, createMockPi } from "./helpers/mock-pi";

let tmpDir: string;
let initializeRuntimeSpy: ReturnType<typeof vi.spyOn>;
let getWriterSpy: ReturnType<typeof vi.spyOn>;
let emitSpy: ReturnType<typeof vi.spyOn>;
let loadSettingsSpy: ReturnType<typeof vi.spyOn>;
let sweepRetentionSpy: ReturnType<typeof vi.spyOn>;
let originalArgv: string[];

const DISABLED_TRANSCRIPT_SETTINGS: TranscriptSettings = {
	enabled: false,
	path: "",
	maxInlineBytes: 64 * 1024,
	maxFileBytes: 64 * 1024 * 1024,
	retentionDays: 30,
};

function mockTranscriptWriter(): NonNullable<
	ReturnType<typeof transcriptRuntime.getWriter>
> {
	return {} as unknown as NonNullable<
		ReturnType<typeof transcriptRuntime.getWriter>
	>;
}

function makeSessionCtx(extra: Record<string, unknown> = {}) {
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
	const pi = Object.assign(createMockPi(), {
		setModel: vi.fn(async () => {}),
	});
	// Default behavior: git fetch returns code 0; behind-count returns "0".
	// This lets the session_start handler fall through to the transcript init
	// stage so we can assert on initializeTranscriptRuntime.
	pi.exec.mockImplementation(async (cmd: string, args?: string[]) => {
		if (cmd === "git" && args?.includes("rev-list")) {
			return { code: 0, stdout: "0\n", stderr: "" };
		}
		return { code: 0, stdout: "", stderr: "" };
	});
	return pi;
}

beforeEach(() => {
	originalArgv = [...process.argv];
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-session-hooks-test-"));

	initializeRuntimeSpy = vi
		.spyOn(transcriptRuntime, "initializeRuntime")
		.mockReturnValue(null);
	getWriterSpy = vi.spyOn(transcriptRuntime, "getWriter").mockReturnValue(null);
	emitSpy = vi.spyOn(transcriptRuntime, "emit").mockResolvedValue(undefined);
	loadSettingsSpy = vi
		.spyOn(transcriptLib, "loadSettings")
		.mockReturnValue(DISABLED_TRANSCRIPT_SETTINGS);
	sweepRetentionSpy = vi
		.spyOn(transcriptLib, "sweepRetention")
		.mockResolvedValue(undefined);
});

afterEach(() => {
	process.argv = originalArgv;
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe("session-hooks: warning formatting", () => {
	it("keeps a visible gap between the warning icon and branch text", () => {
		expect(formatBehindWarning(1)).toBe(
			"⚠  Branch is 1 commit behind remote. Consider git pull before starting.",
		);
		expect(formatBehindWarning(9)).toContain("9 commits behind remote");
	});
});

describe("session-hooks: session_start", () => {
	it("runs git preflight on primary startup", async () => {
		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const sessionStartHooks = pi._getHook("session_start");
		const ctx = makeSessionCtx();
		await sessionStartHooks[0].handler(
			{ reason: "startup" },
			ctx as unknown as ExtensionContext,
		);

		expect(pi.exec).toHaveBeenCalledWith(
			"git",
			["config", "--get", "core.sshCommand"],
			{
				cwd: ctx.cwd,
				timeout: 5000,
			},
		);
	});

	it("skips git preflight for non-startup session events", async () => {
		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const sessionStartHooks = pi._getHook("session_start");
		const ctx = makeSessionCtx();
		await sessionStartHooks[0].handler(
			{ reason: "new" },
			ctx as unknown as ExtensionContext,
		);

		expect(pi.exec).not.toHaveBeenCalledWith(
			"git",
			["config", "--get", "core.sshCommand"],
			expect.anything(),
		);
	});

	it("skips git preflight for no-session processes", async () => {
		process.argv = [...originalArgv, "--no-session"];
		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const sessionStartHooks = pi._getHook("session_start");
		const ctx = makeSessionCtx();
		await sessionStartHooks[0].handler(
			{ reason: "startup" },
			ctx as unknown as ExtensionContext,
		);

		expect(pi.exec).not.toHaveBeenCalledWith(
			"git",
			["config", "--get", "core.sshCommand"],
			expect.anything(),
		);
	});

	it("calls initializeTranscriptRuntime when transcript settings are enabled", async () => {
		// Transcript-enabled config -- both branches (sweep + writer init) fire.
		loadSettingsSpy.mockReturnValue({
			...DISABLED_TRANSCRIPT_SETTINGS,
			enabled: true,
			path: path.join(tmpDir, "traces"),
			retentionDays: 7,
		});
		initializeRuntimeSpy.mockReturnValue(mockTranscriptWriter());
		getWriterSpy.mockReturnValue(mockTranscriptWriter());

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const sessionStartHooks = pi._getHook("session_start");
		expect(sessionStartHooks.length).toBeGreaterThan(0);

		const ctx = makeSessionCtx();
		await sessionStartHooks[0].handler(
			{ reason: "fresh" },
			ctx as unknown as ExtensionContext,
		);

		expect(initializeRuntimeSpy).toHaveBeenCalledTimes(1);
		expect(initializeRuntimeSpy).toHaveBeenCalledWith("test-session-id");

		// Writer is active -- session_start trace event should have been emitted.
		const sessionStartEmits = emitSpy.mock.calls.filter(
			(args) => args[0]?.event_type === "session_start",
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
		loadSettingsSpy.mockReturnValue(DISABLED_TRANSCRIPT_SETTINGS);
		initializeRuntimeSpy.mockReturnValue(null);
		getWriterSpy.mockReturnValue(null);

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const sessionStartHooks = pi._getHook("session_start");
		const ctx = makeSessionCtx();

		await expect(
			sessionStartHooks[0].handler(
				{ reason: "fresh" },
				ctx as unknown as ExtensionContext,
			),
		).resolves.toBeUndefined();

		// Sweep is skipped when settings.enabled is false.
		expect(sweepRetentionSpy).not.toHaveBeenCalled();
		// initializeTranscriptRuntime is still invoked unconditionally; it returns
		// null when transcript is disabled, which gates the subsequent emit().
		expect(initializeRuntimeSpy).toHaveBeenCalledTimes(1);
		const sessionStartEmits = emitSpy.mock.calls.filter(
			(args) => args[0]?.event_type === "session_start",
		);
		expect(sessionStartEmits.length).toBe(0);
	});
});

describe("session-hooks: session_shutdown", () => {
	function setupPersistedSession(pi: ReturnType<typeof createMockPi>) {
		vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
		const sessionFile = path.join(tmpDir, "session.jsonl");
		fs.writeFileSync(
			sessionFile,
			`${JSON.stringify({ type: "session", version: 3, id: "test-session-id", cwd: tmpDir })}\n`,
			"utf8",
		);
		pi.appendEntry.mockImplementation(
			async (customType: string, data: unknown) => {
				fs.appendFileSync(
					sessionFile,
					`${JSON.stringify({
						type: "custom",
						id: "close-entry",
						parentId: null,
						timestamp: new Date().toISOString(),
						customType,
						data,
					})}\n`,
					"utf8",
				);
			},
		);
		const ctx = makeSessionCtx({
			sessionManager: {
				getSessionId: vi.fn(() => "test-session-id"),
				getSessionFile: vi.fn(() => sessionFile),
			},
		});
		const archivePath = path.join(
			tmpDir,
			".pi",
			"agent",
			"history",
			`${new Date().toISOString().slice(0, 10)}-test-session-id.jsonl`,
		);
		return { archivePath, ctx, sessionFile };
	}

	function readEntries(file: string): Array<Record<string, unknown>> {
		return fs
			.readFileSync(file, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	}

	it("emits a session_shutdown trace event when the writer is active", async () => {
		getWriterSpy.mockReturnValue(mockTranscriptWriter());

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const shutdownHooks = pi._getHook("session_shutdown");
		expect(shutdownHooks.length).toBeGreaterThan(0);

		const ctx = makeSessionCtx();
		await shutdownHooks[0].handler(
			{ reason: "quit", targetSessionFile: "/tmp/never-exists.jsonl" },
			ctx as unknown as ExtensionContext,
		);

		const shutdownEmits = emitSpy.mock.calls.filter(
			(args) => args[0]?.event_type === "session_shutdown",
		);
		expect(shutdownEmits.length).toBe(1);
		expect(shutdownEmits[0][1]).toMatchObject({
			reason: "quit",
			target_session_file: "/tmp/never-exists.jsonl",
		});
	});

	it.each([
		"quit",
		"new",
		"resume",
		"fork",
	])("persists one %s close marker before archival", async (reason) => {
		const pi = makeGitFriendlyPi();
		const { archivePath, ctx, sessionFile } = setupPersistedSession(pi);
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);
		const targetSessionFile =
			reason === "quit" ? undefined : path.join(tmpDir, `${reason}.jsonl`);

		await pi
			._getHook("session_shutdown")[0]
			.handler(
				{ reason, targetSessionFile },
				ctx as unknown as ExtensionContext,
			);

		expect(pi.appendEntry).toHaveBeenCalledTimes(1);
		const sourceMarkers = readEntries(sessionFile).filter(
			(entry) =>
				entry.type === "custom" && entry.customType === "workflow.sessionClose",
		);
		const archiveMarkers = readEntries(archivePath).filter(
			(entry) =>
				entry.type === "custom" && entry.customType === "workflow.sessionClose",
		);
		expect(sourceMarkers).toHaveLength(1);
		expect(archiveMarkers).toHaveLength(1);
		expect(sourceMarkers[0].data).toEqual({
			schemaVersion: 1,
			sessionId: "test-session-id",
			reason,
			closedAt: expect.any(String),
			...(targetSessionFile ? { targetSessionFile } : {}),
		});
		expect(archiveMarkers[0].data).toEqual(sourceMarkers[0].data);
	});

	it("archives reload without a logical close marker", async () => {
		const pi = makeGitFriendlyPi();
		const { archivePath, ctx, sessionFile } = setupPersistedSession(pi);
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		await pi
			._getHook("session_shutdown")[0]
			.handler(
				{ reason: "reload", targetSessionFile: undefined },
				ctx as unknown as ExtensionContext,
			);

		expect(pi.appendEntry).not.toHaveBeenCalled();
		expect(
			readEntries(sessionFile).some(
				(entry) => entry.customType === "workflow.sessionClose",
			),
		).toBe(false);
		expect(
			readEntries(archivePath).some(
				(entry) => entry.customType === "workflow.sessionClose",
			),
		).toBe(false);
	});

	it("preserves archival when the close marker cannot be appended", async () => {
		const pi = makeGitFriendlyPi();
		const { archivePath, ctx } = setupPersistedSession(pi);
		pi.appendEntry.mockRejectedValue(new Error("append failed"));
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		await pi
			._getHook("session_shutdown")[0]
			.handler(
				{ reason: "quit", targetSessionFile: undefined },
				ctx as unknown as ExtensionContext,
			);

		expect(fs.existsSync(archivePath)).toBe(true);
		expect(
			readEntries(archivePath).some(
				(entry) => entry.customType === "workflow.sessionClose",
			),
		).toBe(false);
	});

	it("does not emit a session_shutdown event when no writer is active", async () => {
		getWriterSpy.mockReturnValue(null);

		const pi = makeGitFriendlyPi();
		const mod = await import("../extensions/session-hooks");
		mod.default(pi as unknown as ExtensionAPI);

		const shutdownHooks = pi._getHook("session_shutdown");
		const ctx = makeSessionCtx();
		await shutdownHooks[0].handler(
			{ reason: "quit", targetSessionFile: null },
			ctx as unknown as ExtensionContext,
		);

		const shutdownEmits = emitSpy.mock.calls.filter(
			(args) => args[0]?.event_type === "session_shutdown",
		);
		expect(shutdownEmits.length).toBe(0);
	});
});
