/**
 * Shared helpers for Pi extensions.
 *
 * This module deliberately lives under pi/lib/ rather than pi/extensions/
 * because top-level *.ts files in pi/extensions/ are auto-discovered by Pi
 * and registered as extensions. A helper module placed there would either
 * crash startup or require a no-op default-export factory on every helper
 * (see pi/extensions/transcript-runtime.ts:30-40 for the workaround that
 * would otherwise be required).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir as getRuntimeAgentDir } from "@earendil-works/pi-coding-agent";

export interface TextContent {
	type: "text";
	text: string;
}

export interface ToolErrorResult {
	content: TextContent[];
	details: unknown;
	isError: true;
}

export type UiNotifyLevel = "info" | "warning" | "error" | "success";

export interface UiNotifyContext {
	ui?: {
		notify?: (message: string, level?: "info" | "warning" | "error") => void;
	};
}

export function emitTerminalBell(): void {
	if (!process.stdout.isTTY) return;
	try {
		process.stdout.write("\x07");
	} catch {
		// Bell failures must not block the prompt that needs user input.
	}
}

/**
 * Canonical Pi agent state directory, defaulting to ~/.pi/agent.
 *
 * Some setups symlink this to the dotfiles tree (see scripts/pi-link-setup),
 * so callers should not assume the resolved path is outside the repo.
 */
function getHomeDir(): string {
	return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

export function getAgentDir(): string {
	return getRuntimeAgentDir();
}

/**
 * Multi-team expertise root: pi/multi-team under the dotfiles repo by default.
 *
 * Resolution order:
 *  1. PI_MULTI_TEAM_DIR env var (explicit override)
 *  2. <agent-dir>/multi-team if it exists (production layout)
 *  3. dotfiles default at ~/.dotfiles/pi/multi-team
 */
export function getMultiTeamDir(): string {
	const override = process.env.PI_MULTI_TEAM_DIR;
	if (override) return override;

	const agentLocal = path.join(getAgentDir(), "multi-team");
	try {
		if (fs.statSync(agentLocal).isDirectory()) return agentLocal;
	} catch {
		// fall through
	}

	return path.join(os.homedir(), ".dotfiles", "pi", "multi-team");
}

/**
 * Canonicalize a path with symlink resolution where possible.
 *
 * Behavior:
 *  - Rejects paths containing NUL bytes by throwing TypeError. NUL is the
 *    sentinel POSIX uses to terminate strings; allowing it past validation
 *    is a known footgun for path-based safety checks.
 *  - Expands a leading "~/" to the user home directory before resolution.
 *  - If the path exists, returns fs.realpathSync(...) so symlink traversal
 *    cannot escape the canonicalized form.
 *  - If the path does not exist (e.g. a file about to be created), falls
 *    back to path.normalize on the absolute form.
 *
 * cwd defaults to process.cwd() when unspecified.
 */
export function canonicalize(filePath: string, cwd: string = process.cwd()): string {
	if (typeof filePath !== "string") {
		throw new TypeError("canonicalize: filePath must be a string");
	}
	if (filePath.includes("\0")) {
		throw new TypeError("canonicalize: filePath contains NUL byte");
	}

	const expanded = filePath.startsWith("~/")
		? path.join(getHomeDir(), filePath.slice(2))
		: filePath;

	const resolved = path.isAbsolute(expanded) ? expanded : path.join(cwd, expanded);

	try {
		return fs.realpathSync(resolved);
	} catch {
		return path.normalize(resolved);
	}
}

/**
 * Standard tool error result. Use this in tool execute() handlers when
 * returning a user-visible failure so error shapes are consistent across
 * extensions.
 *
 * Example:
 *   return formatToolError("(no UI available -- cannot prompt user)");
 *   return formatToolError("missing options", { details: { mode: "select" } });
 */
export function formatToolError(
	message: string,
	opts: { details?: unknown } = {},
): ToolErrorResult {
	return {
		content: [{ type: "text", text: message }],
		details: opts.details,
		isError: true,
	};
}

/**
 * Notify the user via the Pi UI with a consistent extension-prefixed message.
 *
 * Falls back to console.warn if the UI surface is not available so a non-
 * interactive Pi run still records the message instead of silently dropping
 * it. Extensions that need to suppress the prefix may call ctx.ui.notify
 * directly with a Documented Exception comment per pi/extensions/README.md.
 */
export function uiNotify(
	ctx: UiNotifyContext,
	level: UiNotifyLevel,
	message: string,
	opts: { prefix?: string } = {},
): void {
	const prefix = opts.prefix ? `[${opts.prefix}] ` : "";
	const text = `${prefix}${message}`;
	const hostLevel: "info" | "warning" | "error" = level === "success" ? "info" : level;
	if (ctx?.ui?.notify) {
		ctx.ui.notify(text, hostLevel);
		return;
	}
	if (level === "error" || level === "warning") {
		console.warn(text);
	} else {
		console.log(text);
	}
}
