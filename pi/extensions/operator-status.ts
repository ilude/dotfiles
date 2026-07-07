/**
 * Operator Status Extension
 *
 * Adds three status bar slots for the operator layer. Owned by
 * .specs/pi-operator-layer-mvp/plan.md (T3).
 *
 * Status bar slots:
 *   - "pi" -- always shown, format: `pi vX.Y.Z`
 *   - "task" -- shown only when non-terminal tasks exist, e.g. `task 3 (1 blocked)`
 *   - "elevated" -- shown only when session approvals exist, e.g. `elevated (2)`
 *
 * Healthy default keeps the bar quiet (no `OK` token, no zero counters). The
 * other slots (model/provider/codex/effort) are owned by other extensions
 * (prompt-router, etc.); this extension only fills the operator-specific
 * gaps.
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { listSessionApprovals } from "../lib/permission-registry.js";
import {
	createReloadStatusState,
	needsPiReload,
	type ReloadStatusState,
	resetReloadStatusBaseline,
} from "../lib/reload-status.js";
import { listTasks, type TaskRecordV1 } from "../lib/task-registry.js";

let cachedPiVersion: string | null | undefined;
let currentSessionStartedAt: string | null = null;
const cachedStatusDirectories = new Map<string, string>();
const reloadStatus = createReloadStatusState();

const ANSI = {
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	grey: "\x1b[90m",
	orange: "\x1b[38;5;208m",
	pink: "\x1b[38;5;205m",
	red: "\x1b[31m",
	reset: "\x1b[0m",
	white: "\x1b[37m",
	yellow: "\x1b[33m",
} as const;

interface ContextUsage {
	tokens: number | null;
	contextWindow: number | null;
	percent: number | null;
}

function runCommand(args: string[], cwd?: string): string {
	try {
		const useWindowsShellShim =
			process.platform === "win32" && args[0] === "pi";
		const result = useWindowsShellShim
			? childProcess.spawnSync("pi --version", {
					cwd,
					encoding: "utf-8",
					shell: true,
					timeout: 3000,
					windowsHide: true,
				})
			: childProcess.spawnSync(args[0], args.slice(1), {
					cwd,
					encoding: "utf-8",
					timeout: 3000,
					windowsHide: true,
				});
		return result.status === 0
			? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
			: "";
	} catch {
		return "";
	}
}

function normalizePathForDisplay(inputPath: string): string {
	return inputPath
		.replace(/\\/g, "/")
		.replace(/^[A-Za-z]:/, "")
		.replace(/^\/[a-z]\//, "/")
		.replace(/^\/mnt\/[a-z]\//, "/");
}

function homePattern(): string {
	const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
	return normalizePathForDisplay(home);
}

export function formatPiStatusDirectory(cwd: string): string {
	const cached = cachedStatusDirectories.get(cwd);
	if (cached !== undefined) return cached;

	const normalizedCwd = normalizePathForDisplay(cwd);
	const home = homePattern();
	const gitRoot = runCommand([
		"git",
		"-C",
		cwd,
		"rev-parse",
		"--show-toplevel",
	]);
	let directory: string;
	if (gitRoot) {
		const normalizedRoot = normalizePathForDisplay(gitRoot).replace(/\/$/, "");
		const basename = path.basename(normalizedRoot);
		directory = normalizedRoot.startsWith(home) ? `~/${basename}` : basename;
	} else if (normalizedCwd.startsWith(home)) {
		const relative = normalizedCwd.slice(home.length);
		directory = relative ? `~${relative}` : "~";
	} else {
		directory = normalizedCwd;
	}
	cachedStatusDirectories.set(cwd, directory);
	return directory;
}

function colorBranch(branchName: string | null): string {
	if (!branchName) return "";
	return `${ANSI.white}[${ANSI.cyan}${branchName}${ANSI.white}]${ANSI.reset}`;
}

export function formatReloadIndicator(needsReload: boolean): string {
	return needsReload
		? `${ANSI.white}[${ANSI.pink}reload${ANSI.white}]${ANSI.reset}`
		: "";
}

function sanitizeSingleLine(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function rightAnchor(
	left: string,
	right: string | null,
	width: number,
): string {
	if (!right) return left;
	const gap = width - visibleWidth(left) - visibleWidth(right);
	if (gap < 2) return left;
	return `${left}${" ".repeat(gap)}${right}`;
}

export function rightAlign(text: string, width: number): string {
	const gap = width - visibleWidth(text);
	return gap > 0 ? `${" ".repeat(gap)}${text}` : text;
}

function formatModelName(
	model: { id?: string; name?: string } | undefined,
): string {
	return model?.id || model?.name || "no-model";
}

function compactTokens(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
	return `${Number.isInteger(tokens / 1_000_000) ? tokens / 1_000_000 : (tokens / 1_000_000).toFixed(1)}M`;
}

function colorForContextPercent(percent: number): string {
	if (percent >= 90) return ANSI.red;
	if (percent >= 67) return ANSI.yellow;
	return ANSI.green;
}

export function formatContextUsageSegment(
	usage: ContextUsage | null | undefined,
): string | null {
	if (
		!usage ||
		usage.tokens === null ||
		usage.contextWindow === null ||
		usage.contextWindow <= 0
	)
		return null;
	const percent = usage.percent ?? (usage.tokens / usage.contextWindow) * 100;
	const roundedPercent = Math.round(percent);
	const tokenText = `${compactTokens(usage.tokens)}/${compactTokens(usage.contextWindow)}`;
	return `${colorForContextPercent(roundedPercent)}${roundedPercent}%${ANSI.reset} ${ANSI.grey}${tokenText}${ANSI.reset}`;
}

function formatThinkingLevel(pi: ExtensionAPI): string {
	try {
		return pi.getThinkingLevel?.() || "off";
	} catch {
		return "off";
	}
}

export function colorForThinkingLevel(
	model: string,
	thinkingLevel: string,
): string {
	const normalizedModel = model.toLowerCase();
	const normalizedLevel = thinkingLevel.toLowerCase();
	if (normalizedLevel === "off") return ANSI.yellow;
	if (
		normalizedModel === "gpt-5.5" &&
		["medium", "high", "xhigh"].includes(normalizedLevel)
	)
		return ANSI.pink;
	if (["high", "xhigh"].includes(normalizedLevel)) return ANSI.pink;
	return ANSI.cyan;
}

export function rightAnchoredStatus(
	footerData: ReadonlyFooterDataProvider,
): string | null {
	const status = footerData.getExtensionStatuses().get("codex");
	return status ? sanitizeSingleLine(status) : null;
}

export function formatExtensionStatuses(
	footerData: ReadonlyFooterDataProvider,
): string | null {
	const statuses = Array.from(footerData.getExtensionStatuses().entries())
		.filter(([key]) => key !== "codex")
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => sanitizeSingleLine(text))
		.filter(Boolean);
	return statuses.length > 0 ? statuses.join(" ") : null;
}

export function formatExtensionStatusLine(
	footerData: ReadonlyFooterDataProvider,
	width: number,
): string | null {
	const statuses = footerData.getExtensionStatuses();
	const left = sanitizeSingleLine(statuses.get("tps") ?? "");
	const right = Array.from(statuses.entries())
		.filter(([key]) => key !== "codex" && key !== "tps")
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => sanitizeSingleLine(text))
		.filter(Boolean)
		.join(" ");
	if (!left && !right) return null;
	if (!left) return rightAlign(right, width);
	if (!right)
		return visibleWidth(left) > width ? truncateToWidth(left, width) : left;
	const gap = width - visibleWidth(left) - visibleWidth(right);
	if (gap < 2) return truncateToWidth(`${left} ${right}`, width);
	return `${left}${" ".repeat(gap)}${right}`;
}

export function formatPiStatusLine(options: {
	cwd: string;
	branch: string | null;
	model: { id?: string; name?: string } | undefined;
	pi: ExtensionAPI;
	piVersion: string | null;
	reloadNeeded?: boolean;
	contextUsage?: ContextUsage | null;
	router: string | null;
	width: number;
}): string {
	const directory = formatPiStatusDirectory(options.cwd);
	const branch = colorBranch(options.branch);
	const model = formatModelName(options.model);
	const thinking = formatThinkingLevel(options.pi);
	const thinkingColor = colorForThinkingLevel(model, thinking);
	const thinkingLabel = `${ANSI.white}[${thinkingColor}${thinking}${ANSI.white}]${ANSI.reset}`;
	const contextSegment = formatContextUsageSegment(options.contextUsage);
	const versionLabel = `${ANSI.dim}π v${options.piVersion ?? "?"}${ANSI.reset}${formatReloadIndicator(Boolean(options.reloadNeeded))}`;
	const buildLeft = (modelText: string) => {
		const modelLabel = `${ANSI.orange}${modelText}${ANSI.reset}${thinkingLabel}${contextSegment ? ` ${contextSegment}` : ""}`;
		return `${ANSI.green}${directory}${ANSI.reset}${branch} | ${modelLabel} | ${versionLabel}`;
	};
	let left = buildLeft(model);
	if (contextSegment && visibleWidth(left) > options.width) {
		const nonModelWidth = visibleWidth(buildLeft(""));
		const availableModelWidth = Math.max(0, options.width - nonModelWidth);
		left = buildLeft(truncateToWidth(model, availableModelWidth));
	}
	const composed = rightAnchor(left, options.router, options.width);
	return visibleWidth(composed) > options.width
		? truncateToWidth(composed, options.width)
		: composed;
}

function installClaudeStyleFooter(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
): boolean {
	if (typeof ctx.ui.setFooter !== "function") return false;
	const footerFactory: Parameters<ExtensionContext["ui"]["setFooter"]>[0] = (
		_tui,
		_theme,
		footerData: ReadonlyFooterDataProvider,
	) => ({
		invalidate: () => {},
		render: (width: number) => {
			const piVersion = resolvePiVersion();
			const reloadNeeded = needsPiReload({ state: reloadStatus });
			const contextUsage = ctx.getContextUsage?.() ?? null;
			const statusLine = formatPiStatusLine({
				cwd: ctx.cwd,
				branch: footerData.getGitBranch(),
				model: ctx.model,
				pi,
				piVersion,
				reloadNeeded,
				contextUsage,
				router: rightAnchoredStatus(footerData),
				width,
			});
			const extensionStatusLine = formatExtensionStatusLine(footerData, width);
			if (!extensionStatusLine) return [statusLine];
			return [statusLine, extensionStatusLine];
		},
	});
	ctx.ui.setFooter(footerFactory);
	return true;
}

/**
 * Resolve the running Pi CLI version once, then cache it for the session.
 *
 * Do not read settings.lastChangelogVersion here: that value tracks the last
 * changelog the user saw, not necessarily the installed/runtime version.
 */
function readPackageVersion(packageName: string): string | null {
	try {
		const entryPath = fileURLToPath(import.meta.resolve(packageName));
		let currentDir = path.dirname(entryPath);
		while (true) {
			const packageJsonPath = path.join(currentDir, "package.json");
			if (fs.existsSync(packageJsonPath)) {
				const parsed = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf-8"),
				) as { version?: unknown };
				return typeof parsed.version === "string" ? parsed.version : null;
			}
			const parentDir = path.dirname(currentDir);
			if (parentDir === currentDir) return null;
			currentDir = parentDir;
		}
	} catch {
		return null;
	}
}

export function resolvePiVersion(): string | null {
	if (cachedPiVersion !== undefined) return cachedPiVersion;
	const packageVersion = readPackageVersion("@earendil-works/pi-coding-agent");
	if (packageVersion) {
		cachedPiVersion = packageVersion;
		return cachedPiVersion;
	}
	const output = runCommand(["pi", "--version"]);
	const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
	cachedPiVersion = match?.[0] ?? null;
	return cachedPiVersion;
}

interface TaskCounts {
	pending: number;
	running: number;
	blocked: number;
	failed: number;
	completed: number;
	cancelled: number;
	skipped: number;
	nonTerminal: number;
	urgent: number; // blocked + failed
}

export function summarizeTaskCounts(records: TaskRecordV1[]): TaskCounts {
	const counts: TaskCounts = {
		pending: 0,
		running: 0,
		blocked: 0,
		failed: 0,
		completed: 0,
		cancelled: 0,
		skipped: 0,
		nonTerminal: 0,
		urgent: 0,
	};
	for (const t of records) {
		counts[t.state]++;
	}
	counts.nonTerminal =
		counts.pending + counts.running + counts.blocked + counts.failed;
	counts.urgent = counts.blocked + counts.failed;
	return counts;
}

export function filterCurrentSessionActiveTasks(
	records: TaskRecordV1[],
	sessionStartedAt: string | null,
): TaskRecordV1[] {
	const sessionStartMs = sessionStartedAt
		? Date.parse(sessionStartedAt)
		: Number.NEGATIVE_INFINITY;
	return records.filter((task) => {
		if (task.state !== "running" && task.state !== "blocked") return false;
		const createdMs = Date.parse(task.createdAt);
		return Number.isFinite(createdMs) && createdMs >= sessionStartMs;
	});
}

export function formatTaskStatus(counts: TaskCounts): string | null {
	const active = counts.running + counts.blocked;
	if (active === 0) return null;
	const parts: string[] = [`tasks ${active}`];
	const flags: string[] = [];
	if (counts.running > 0) flags.push(`${counts.running} running`);
	if (counts.blocked > 0) flags.push(`${counts.blocked} blocked`);
	if (flags.length > 0) parts.push(`(${flags.join(", ")})`);
	return parts.join(" ");
}

export function formatElevatedStatus(approvalCount: number): string | null {
	if (approvalCount === 0) return null;
	return `elevated (${approvalCount})`;
}

function refreshOperatorStatus(ctx: {
	ui?: { setStatus?: (key: string, value: string) => void };
}): void {
	if (!ctx.ui?.setStatus) return;
	try {
		const counts = summarizeTaskCounts(
			filterCurrentSessionActiveTasks(listTasks(), currentSessionStartedAt),
		);
		const taskLabel = formatTaskStatus(counts);
		ctx.ui.setStatus("task", taskLabel ?? "");
	} catch {
		// ignore
	}
	try {
		const approvals = listSessionApprovals();
		const elevatedLabel = formatElevatedStatus(approvals.length);
		ctx.ui.setStatus("elevated", elevatedLabel ?? "");
	} catch {
		// ignore
	}
}

export function resetOperatorReloadStatus(
	state: ReloadStatusState = reloadStatus,
	nowMs = Date.now(),
): void {
	resetReloadStatusBaseline(state, nowMs);
}

export function isOperatorReloadNeeded(
	state: ReloadStatusState = reloadStatus,
): boolean {
	return needsPiReload({ state });
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
		currentSessionStartedAt = new Date().toISOString();
		if (event.reason === "reload") resetOperatorReloadStatus();
		const footerInstalled = installClaudeStyleFooter(ctx, pi);
		if (!footerInstalled) {
			const piVersion = resolvePiVersion();
			ctx.ui.setStatus("pi", piVersion ? `π v${piVersion}` : "π");
		}
		refreshOperatorStatus(ctx);
	});

	pi.on("tool_result", async (_event, ctx) => {
		// Refresh task/elevated counts after each tool result. Cheap because
		// listTasks just enumerates a single directory and registry I/O is
		// already non-blocking from the producer side.
		refreshOperatorStatus(ctx);
	});
}
