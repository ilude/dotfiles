/**
 * Session Hooks Extension
 *
 * session_start: on reload, restores the configured default model; then runs
 *   git pre-flight checks (fetch + behind-count). Notifies if branch is behind
 *   remote. Silently skips if not a git repo. Also runs an idempotent
 *   transcript retention sweep when the per-user transcript toggle is enabled
 *   in ~/.pi/agent/settings.json. Initializes the transcript writer (when
 *   enabled), parses any inherited W3C TRACEPARENT, and emits a
 *   `session_start` event so the sidecar trace begins with lifecycle context.
 *
 * session_shutdown: archives the session conversation log to
 *   $HOME/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl and emits a
 *   `session_shutdown` event into the sidecar trace.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";
import { loadSettings as loadTranscriptSettings, sweepRetention as sweepTranscriptRetention } from "../lib/transcript.js";
import {
	emit as emitTranscript,
	getWriter as getTranscriptWriter,
	initializeRuntime as initializeTranscriptRuntime,
} from "./transcript-runtime.js";

export default function (pi: ExtensionAPI) {
	// -- session_start: restore default model on reload + git pre-flight -------
	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "reload") {
			try {
				const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
				const settings = JSON.parse(await fs.promises.readFile(settingsPath, "utf-8")) as {
					defaultProvider?: string;
					defaultModel?: string;
				};
				if (settings.defaultProvider && settings.defaultModel) {
					const model = ctx.modelRegistry.find(settings.defaultProvider, settings.defaultModel);
					if (model) {
						await pi.setModel(model);
					}
				}
			} catch {
				// Silently skip -- invalid/missing settings should not break reload
			}
		}

		try {
			// Silently skip if fetch fails (no remote, not a repo, no network, etc.)
			const fetchResult = await pi.exec("git", ["fetch", "--quiet"], { cwd: ctx.cwd });
			if (fetchResult.code !== 0) return;

			const behindResult = await pi.exec("git", ["rev-list", "--count", "HEAD..@{u}"], { cwd: ctx.cwd });
			if (behindResult.code !== 0) return;

			const count = parseInt(behindResult.stdout.trim(), 10);
			if (!isNaN(count) && count > 0) {
				uiNotify(
					ctx,
					"warning",
					`⚠ Branch is ${count} commit${count === 1 ? "" : "s"} behind remote. Consider git pull before starting.`,
					{ prefix: "session-hooks" },
				);
			}
		} catch {
			// Not a git repo, no remote, or other git failure -- silently skip
		}

		// Transcript retention sweep (opt-in via ~/.pi/agent/settings.json).
		// Reads the runtime toggle from the per-user settings file ONLY --
		// the repo-tracked pi/settings.json must NOT enable tracing.
		try {
			const transcriptSettings = loadTranscriptSettings();
			if (transcriptSettings.enabled) {
				await sweepTranscriptRetention(transcriptSettings.path, transcriptSettings.retentionDays);
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
			const sessionId = ctx.sessionManager.getSessionId() ?? `pi-${crypto.randomUUID()}`;
			initializeTranscriptRuntime(sessionId);
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
			if (!sessionFile) return;

			if (!fs.existsSync(sessionFile)) return;

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
