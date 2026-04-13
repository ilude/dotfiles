/**
 * Session Hooks Extension
 *
 * session_start: runs git pre-flight checks (fetch + behind-count).
 *   Notifies if branch is behind remote. Silently skips if not a git repo.
 *
 * session_shutdown: archives the session conversation log to
 *   $HOME/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// ── session_start: git pre-flight ──────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		try {
			// Silently skip if fetch fails (no remote, not a repo, no network, etc.)
			const fetchResult = await pi.exec("git", ["fetch", "--quiet"], { cwd: ctx.cwd });
			if (fetchResult.code !== 0) return;

			const behindResult = await pi.exec("git", ["rev-list", "--count", "HEAD..@{u}"], { cwd: ctx.cwd });
			if (behindResult.code !== 0) return;

			const count = parseInt(behindResult.stdout.trim(), 10);
			if (!isNaN(count) && count > 0) {
				ctx.ui.notify(
					`⚠ Branch is ${count} commit${count === 1 ? "" : "s"} behind remote. Consider git pull before starting.`,
					"warning",
				);
			}
		} catch {
			// Not a git repo, no remote, or other git failure — silently skip
		}
	});

	// ── session_shutdown: archive conversation log ─────────────────────────────
	pi.on("session_shutdown", async (_event, ctx) => {
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
			// Silently skip — never crash Pi on shutdown
		}
	});
}
