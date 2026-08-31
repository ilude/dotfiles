import { onSessionStart } from "../lib/session-start-metrics.js";
/**
 * Session Hooks Extension
 *
 * session_start: runs git pre-flight checks (fetch + behind-count) for primary startup only.
 *   Notifies if branch is behind remote. Silently skips if not a git repo. Also runs an idempotent
 *   transcript retention sweep when the per-user transcript toggle is enabled
 *   in ~/.pi/agent/settings.json. Initializes the transcript writer (when
 *   enabled), parses any inherited W3C TRACEPARENT, and emits a
 *   `session_start` event so the sidecar trace begins with lifecycle context.
 *
 * session_shutdown: records logical session-close evidence, archives the
 *   conversation log to $HOME/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl,
 *   and emits a `session_shutdown` event into the sidecar trace.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";
import {
	loadSettings as loadTranscriptSettings,
	sweepRetention as sweepTranscriptRetention,
} from "../lib/transcript.js";
import {
	emit as emitTranscript,
	getWriter as getTranscriptWriter,
	initializeRuntime as initializeTranscriptRuntime,
} from "./transcript-runtime.js";

const GIT_PREFLIGHT_TIMEOUT_MS = 5000;
const LOGICAL_SESSION_CLOSE_REASONS = new Set([
	"quit",
	"new",
	"resume",
	"fork",
]);

interface SessionCloseEntry {
	schemaVersion: 1;
	sessionId: string;
	reason: string;
	closedAt: string;
	targetSessionFile?: string;
}

function shouldRunGitPreflight(reason: string): boolean {
	return reason === "startup" && !process.argv.includes("--no-session");
}

function withSshSafetyOptions(command: string): string {
	const trimmed = command.trim();
	if (!trimmed.startsWith("ssh")) return command;

	const options = [];
	if (!/(^|\s)-o\s+BatchMode=/i.test(command)) {
		options.push("-o", "BatchMode=yes");
	}
	if (!/(^|\s)-o\s+ConnectTimeout=/i.test(command)) {
		options.push("-o", "ConnectTimeout=5");
	}
	if (options.length === 0) return command;

	return command.replace(/^ssh(\s|$)/, `ssh ${options.join(" ")}$1`);
}

async function runGitFetchPreflight(
	pi: ExtensionAPI,
	cwd: string,
) {
	const args = ["fetch", "--quiet"];
	const sshCommand = await pi.exec(
		"git",
		["config", "--get", "core.sshCommand"],
		{
			cwd,
			timeout: GIT_PREFLIGHT_TIMEOUT_MS,
		},
	);
	const configuredSshCommand =
		sshCommand.code === 0 ? sshCommand.stdout.trim() : "";
	if (configuredSshCommand) {
		args.unshift(
			"-c",
			`core.sshCommand=${withSshSafetyOptions(configuredSshCommand)}`,
		);
	}

	return pi.exec("git", args, {
		cwd,
		timeout: GIT_PREFLIGHT_TIMEOUT_MS,
	});
}

async function notifyIfBranchBehind(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	try {
		const fetchResult = await runGitFetchPreflight(pi, ctx.cwd);
		if (fetchResult.code !== 0) return;
		const behindResult = await pi.exec(
			"git",
			["rev-list", "--count", "HEAD..@{u}"],
			{ cwd: ctx.cwd, timeout: GIT_PREFLIGHT_TIMEOUT_MS },
		);
		if (behindResult.code !== 0) return;
		const count = parseInt(behindResult.stdout.trim(), 10);
		if (!Number.isNaN(count) && count > 0) {
			uiNotify(
				ctx,
				"warning",
				`Branch is ${count} commit${count === 1 ? "" : "s"} behind remote. Consider git pull before starting.`,
				{ prefix: "session-hooks" },
			);
		}
	} catch {
		// Not a git repo, no remote, or other git failure.
	}
}

export default function (pi: ExtensionAPI) {
	// -- session_start: git pre-flight + transcript initialization ----------------
	onSessionStart(pi, import.meta.url, async (event, ctx) => {
		if (shouldRunGitPreflight(event.reason)) {
			void notifyIfBranchBehind(pi, ctx);
		}

		// Load the per-user transcript settings once and reuse them for both the
		// retention sweep and runtime initialization.
		let transcriptSettings: ReturnType<typeof loadTranscriptSettings> | undefined;
		try {
			transcriptSettings = loadTranscriptSettings();
			if (transcriptSettings.enabled) {
				await sweepTranscriptRetention(
					transcriptSettings.path,
					transcriptSettings.retentionDays,
				);
			}
		} catch {
			// Sweep is best-effort -- never crash session_start.
		}

		// Transcript writer init + session_start emit. initializeTranscriptRuntime
		// returns null when transcript.enabled is false, so the emit() call below
		// is a safe no-op in the default-off configuration. The runtime parses
		// W3C TRACEPARENT internally so subagent processes inherit parent_trace_id
		// without any extra wiring here.
		try {
			const sessionId =
				ctx.sessionManager.getSessionId() ?? `pi-${crypto.randomUUID()}`;
			initializeTranscriptRuntime(sessionId, transcriptSettings);
			if (getTranscriptWriter()) {
				await emitTranscript(
					{ event_type: "session_start", turn_id: "turn-0" },
					{
						agent_name: "pi",
						pid: process.pid,
						reason: event.reason,
						traceparent_inherited: Boolean(process.env.TRACEPARENT),
					},
				);
			}
		} catch {
			// Never crash session_start on transcript wiring failure.
		}

	});

	// -- session_shutdown: archive conversation log -----------------------------
	pi.on("session_shutdown", async (event, ctx) => {
		// Best-effort transcript flush before the writer goes out of scope.
		try {
			if (getTranscriptWriter()) {
				await emitTranscript(
					{ event_type: "session_shutdown" },
					{
						reason: event.reason,
						target_session_file: event.targetSessionFile,
					},
				);
			}
		} catch {
			// Continue with archival even when transcript emit fails.
		}

		try {
			const sessionId = ctx.sessionManager.getSessionId();
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile || !fs.existsSync(sessionFile)) return;

			if (LOGICAL_SESSION_CLOSE_REASONS.has(event.reason)) {
				const closeEntry: SessionCloseEntry = {
					schemaVersion: 1,
					sessionId,
					reason: event.reason,
					closedAt: new Date().toISOString(),
				};
				if (event.targetSessionFile) {
					closeEntry.targetSessionFile = event.targetSessionFile;
				}
				try {
					await pi.appendEntry("workflow.sessionClose", closeEntry);
				} catch {
					// Preserve archival when lifecycle evidence cannot be appended.
				}
			}

			const date = new Date().toISOString().slice(0, 10);
			const historyDir = path.join(os.homedir(), ".pi", "agent", "history");
			const archivePath = path.join(historyDir, `${date}-${sessionId}.jsonl`);

			await fs.promises.mkdir(historyDir, { recursive: true });
			await fs.promises.copyFile(sessionFile, archivePath);
		} catch {
			// Silently skip -- never crash Pi on shutdown
		}
	});
}
