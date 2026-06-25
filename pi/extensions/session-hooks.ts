/**
 * Session Hooks Extension
 *
 * session_start: on reload, restores the configured default model; then runs
 *   git pre-flight checks (fetch + behind-count) for primary startup only.
 *   Notifies if branch is behind remote. Silently skips if not a git repo. Also runs an idempotent
 *   transcript retention sweep when the per-user transcript toggle is enabled
 *   in ~/.pi/agent/settings.json. Initializes the transcript writer (when
 *   enabled), parses any inherited W3C TRACEPARENT, and emits a
 *   `session_start` event so the sidecar trace begins with lifecycle context.
 *
 * session_shutdown: archives the session conversation log to
 *   $HOME/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl and emits a
 *   `session_shutdown` event into the sidecar trace.
 */

import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";
import { readMergedSettings } from "../lib/settings-loader.js";
import { loadSettings as loadTranscriptSettings, sweepRetention as sweepTranscriptRetention } from "../lib/transcript.js";
import {
	emit as emitTranscript,
	getWriter as getTranscriptWriter,
	initializeRuntime as initializeTranscriptRuntime,
} from "./transcript-runtime.js";

const GIT_PREFLIGHT_TIMEOUT_MS = 5000;

interface CommandResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
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

async function killProcessTree(pid: number): Promise<void> {
	if (process.platform === "win32") {
		await new Promise<void>((resolve) => {
			spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
				.on("error", () => resolve())
				.on("close", () => resolve());
		});
		return;
	}

	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// Process already exited.
		}
	}
}

function runCommandWithTreeTimeout(
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<CommandResult> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd,
			detached: process.platform !== "win32",
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let killed = false;
		let settled = false;

		const timeoutId = setTimeout(() => {
			if (child.pid) {
				killed = true;
				void killProcessTree(child.pid);
			}
		}, timeout);

		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			resolve({ stdout, stderr: stderr || error.message, code: 1, killed });
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			resolve({ stdout, stderr, code: code ?? 0, killed });
		});
	});
}

async function runGitFetchPreflight(pi: ExtensionAPI, cwd: string): Promise<CommandResult> {
	const args = ["fetch", "--quiet"];
	const sshCommand = await pi.exec("git", ["config", "--get", "core.sshCommand"], {
		cwd,
		timeout: GIT_PREFLIGHT_TIMEOUT_MS,
	});
	const configuredSshCommand = sshCommand.code === 0 ? sshCommand.stdout.trim() : "";
	if (configuredSshCommand) {
		args.unshift("-c", `core.sshCommand=${withSshSafetyOptions(configuredSshCommand)}`);
	}

	return runCommandWithTreeTimeout("git", args, cwd, GIT_PREFLIGHT_TIMEOUT_MS);
}

export default function (pi: ExtensionAPI) {
	// -- session_start: restore default model on reload + git pre-flight -------
	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "reload") {
			try {
				// User-level only: model defaults belong to the user profile,
				// not the project. skipProject + skipLocal preserves the
				// pre-cascade semantics of the original ad-hoc read.
				const settings = readMergedSettings({ skipProject: true, skipLocal: true }) as {
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

		if (shouldRunGitPreflight(event.reason)) {
			try {
				// Silently skip if fetch fails (no remote, not a repo, no network, timeout, etc.)
				const fetchResult = await runGitFetchPreflight(pi, ctx.cwd);
				if (fetchResult.code !== 0) return;

				const behindResult = await pi.exec("git", ["rev-list", "--count", "HEAD..@{u}"], {
					cwd: ctx.cwd,
					timeout: GIT_PREFLIGHT_TIMEOUT_MS,
				});
				if (behindResult.code !== 0) return;

				const count = parseInt(behindResult.stdout.trim(), 10);
				if (!Number.isNaN(count) && count > 0) {
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

		// menos circuit breaker probe/backfill. Best-effort only; never fail session_start.
		try {
			if (process.env.MENOS_CIRCUIT_DISABLED !== "1") {
				const home = os.homedir();
				const probePath = path.join(home, ".claude", "hooks", "menos-circuit", "probe.py");
				const backfillPath = path.join(home, ".claude", "hooks", "menos-circuit", "backfill.py");
				await pi.exec("python", [probePath], { timeout: 3000 }).catch(() => undefined);
				void pi
					.exec("python", [backfillPath, "--detach"], { timeout: 3000 })
					.catch(() => undefined);
			}
		} catch {
			// menos hooks are best-effort.
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
