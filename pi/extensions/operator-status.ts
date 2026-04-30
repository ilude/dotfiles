/**
 * Operator Status Extension
 *
 * Adds three status bar slots and the `/doctor` command surface for the
 * operator layer. Owned by .specs/pi-operator-layer-mvp/plan.md (T3).
 *
 * Status bar slots:
 *   - "pi" -- always shown, format: `pi vX.Y.Z`
 *   - "task" -- shown only when non-terminal tasks exist, e.g. `task 3 (1 blocked)`
 *   - "elevated" -- shown only when session approvals exist, e.g. `elevated (2)`
 *
 * Healthy default keeps the bar quiet (no `OK` token, no zero counters). The
 * other slots (model/provider/router/effort) are owned by other extensions
 * (prompt-router, etc.); this extension only fills the operator-specific
 * gaps.
 *
 * Commands:
 *   /doctor               -- compact health check
 *   /doctor --verbose     -- expanded diagnostic output
 *   /doctor --json        -- machine-readable JSON
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type ExtensionAPI, type ExtensionContext, type ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import { listRecentDecisions, listSessionApprovals } from "../lib/permission-registry.js";
import { listTasks, type TaskRecordV1 } from "../lib/task-registry.js";

interface DoctorCheck {
	name: string;
	ok: boolean;
	detail: string;
}

interface DoctorReport {
	piVersion: string | null;
	checks: DoctorCheck[];
	taskCounts: Record<string, number>;
	sessionApprovals: number;
	recentDecisions: number;
	cwd: string;
	platform: string;
}

let cachedPiVersion: string | null | undefined;

const ANSI = {
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	orange: "\x1b[38;5;208m",
	reset: "\x1b[0m",
	white: "\x1b[37m",
	yellow: "\x1b[33m",
} as const;

function runCommand(args: string[], cwd?: string): string {
	try {
		const result = childProcess.spawnSync(args[0], args.slice(1), {
			cwd,
			encoding: "utf-8",
			timeout: 1000,
		});
		return result.status === 0 ? result.stdout.trim() : "";
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
	const normalizedCwd = normalizePathForDisplay(cwd);
	const home = homePattern();
	const gitRoot = runCommand(["git", "-C", cwd, "rev-parse", "--show-toplevel"]);
	if (gitRoot) {
		const normalizedRoot = normalizePathForDisplay(gitRoot).replace(/\/$/, "");
		const basename = path.basename(normalizedRoot);
		return normalizedRoot.startsWith(home) ? `~/${basename}` : basename;
	}
	if (normalizedCwd.startsWith(home)) {
		const relative = normalizedCwd.slice(home.length);
		return relative ? `~${relative}` : "~";
	}
	return normalizedCwd;
}

function colorBranch(branchName: string | null): string {
	if (!branchName) return "";
	return `${ANSI.yellow}[${ANSI.blue}${branchName}${ANSI.yellow}]${ANSI.reset}`;
}

function formatModelName(model: { id?: string; name?: string } | undefined): string {
	return model?.id || model?.name || "no-model";
}

function formatThinkingLevel(pi: ExtensionAPI): string {
	try {
		return pi.getThinkingLevel?.() || "off";
	} catch {
		return "off";
	}
}

function sanitizeSingleLine(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function formatExtensionStatuses(footerData: ReadonlyFooterDataProvider): string | null {
	const statuses = Array.from(footerData.getExtensionStatuses().entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => sanitizeSingleLine(text))
		.filter(Boolean);
	return statuses.length > 0 ? statuses.join(" ") : null;
}

export function formatPiStatusLine(options: {
	cwd: string;
	branch: string | null;
	model: { id?: string; name?: string } | undefined;
	pi: ExtensionAPI;
	piVersion: string | null;
}): string {
	const directory = formatPiStatusDirectory(options.cwd);
	const branch = colorBranch(options.branch);
	const model = formatModelName(options.model);
	const thinking = formatThinkingLevel(options.pi);
	const thinkingLabel = `${ANSI.white}[${ANSI.cyan}${thinking}${ANSI.white}]${ANSI.reset}`;
	const versionLabel = `${ANSI.dim}v${options.piVersion ?? "?"}${ANSI.reset}`;
	return `${ANSI.green}${directory}${ANSI.reset}${branch} | ${ANSI.orange}${model}${ANSI.reset}${thinkingLabel} | ${versionLabel}`;
}

function installClaudeStyleFooter(ctx: ExtensionContext, pi: ExtensionAPI): boolean {
	if (typeof ctx.ui.setFooter !== "function") return false;
	const footerFactory: Parameters<ExtensionContext["ui"]["setFooter"]>[0] = (
		_tui,
		_theme,
		footerData: ReadonlyFooterDataProvider,
	) => ({
		invalidate: () => {},
		render: () => {
			const piVersion = resolvePiVersion();
			const statusLine = formatPiStatusLine({
				cwd: ctx.cwd,
				branch: footerData.getGitBranch(),
				model: ctx.model,
				pi,
				piVersion,
			});
			const extensionStatuses = formatExtensionStatuses(footerData);
			return extensionStatuses ? [statusLine, extensionStatuses] : [statusLine];
		},
	});
	ctx.ui.setFooter(footerFactory);
	return true;
}

/**
 * Resolve Pi version from the CLI once, then cache for the session.
 */
export function resolvePiVersion(): string | null {
	if (cachedPiVersion !== undefined) return cachedPiVersion;
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		const settingsPath = path.resolve(here, "../settings.json");
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { lastChangelogVersion?: string };
		cachedPiVersion = settings.lastChangelogVersion?.trim() || null;
		return cachedPiVersion;
	} catch {
		cachedPiVersion = null;
		return cachedPiVersion;
	}
}

interface TaskCounts {
	pending: number;
	running: number;
	blocked: number;
	failed: number;
	completed: number;
	cancelled: number;
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
		nonTerminal: 0,
		urgent: 0,
	};
	for (const t of records) {
		counts[t.state]++;
	}
	counts.nonTerminal = counts.pending + counts.running + counts.blocked + counts.failed;
	counts.urgent = counts.blocked + counts.failed;
	return counts;
}

export function formatTaskStatus(counts: TaskCounts): string | null {
	if (counts.nonTerminal === 0) return null;
	const parts: string[] = [`task ${counts.nonTerminal}`];
	const flags: string[] = [];
	if (counts.blocked > 0) flags.push(`${counts.blocked} blocked`);
	if (counts.failed > 0) flags.push(`${counts.failed} failed`);
	if (flags.length > 0) parts.push(`(${flags.join(", ")})`);
	return parts.join(" ");
}

export function formatElevatedStatus(approvalCount: number): string | null {
	if (approvalCount === 0) return null;
	return `elevated (${approvalCount})`;
}

function refreshOperatorStatus(ctx: { ui?: { setStatus?: (key: string, value: string) => void } }): void {
	if (!ctx.ui?.setStatus) return;
	try {
		const counts = summarizeTaskCounts(listTasks());
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

function buildDoctorReport(cwd: string): DoctorReport {
	const checks: DoctorCheck[] = [];
	const piVersion = resolvePiVersion();
	checks.push({
		name: "pi runtime",
		ok: piVersion !== null,
		detail: piVersion ? `pi v${piVersion}` : "pi-coding-agent install not found in known npm/bun locations",
	});

	let taskRegistryOk = false;
	let taskCounts: Record<string, number> = {};
	try {
		const records = listTasks();
		taskCounts = summarizeTaskCounts(records) as unknown as Record<string, number>;
		taskRegistryOk = true;
	} catch (err) {
		checks.push({
			name: "task registry",
			ok: false,
			detail: err instanceof Error ? err.message : String(err),
		});
	}
	if (taskRegistryOk) {
		checks.push({
			name: "task registry",
			ok: true,
			detail: `${taskCounts.nonTerminal ?? 0} active, ${taskCounts.completed ?? 0} completed`,
		});
	}

	let sessionApprovals = 0;
	let recentDecisions = 0;
	let permissionRegistryOk = false;
	try {
		sessionApprovals = listSessionApprovals().length;
		recentDecisions = listRecentDecisions({ limit: 50 }).length;
		permissionRegistryOk = true;
	} catch (err) {
		checks.push({
			name: "permission registry",
			ok: false,
			detail: err instanceof Error ? err.message : String(err),
		});
	}
	if (permissionRegistryOk) {
		checks.push({
			name: "permission registry",
			ok: true,
			detail: `${sessionApprovals} session approvals, ${recentDecisions} recent decisions`,
		});
	}

	return {
		piVersion,
		checks,
		taskCounts,
		sessionApprovals,
		recentDecisions,
		cwd,
		platform: `${process.platform} ${process.arch}`,
	};
}

function formatDoctorCompact(report: DoctorReport): string {
	const failures = report.checks.filter((c) => !c.ok);
	if (failures.length === 0) {
		const version = report.piVersion ? `pi v${report.piVersion}` : "pi (version unknown)";
		return `${version} - all checks passed (${report.checks.length})`;
	}
	const lines = [`${failures.length} check(s) failed:`];
	for (const f of failures) lines.push(`  ! ${f.name}: ${f.detail}`);
	return lines.join("\n");
}

function formatDoctorVerbose(report: DoctorReport): string {
	const lines: string[] = ["doctor:"];
	if (report.piVersion) lines.push(`  pi: v${report.piVersion}`);
	else lines.push(`  pi: (version unknown -- pi-coding-agent install not found)`);
	lines.push(`  cwd: ${report.cwd}`);
	lines.push(`  platform: ${report.platform}`);
	lines.push("  checks:");
	for (const c of report.checks) {
		lines.push(`    [${c.ok ? "ok" : "fail"}] ${c.name}: ${c.detail}`);
	}
	if (Object.keys(report.taskCounts).length > 0) {
		lines.push("  tasks:");
		for (const [state, count] of Object.entries(report.taskCounts)) {
			if (typeof count === "number" && count > 0) lines.push(`    ${state}: ${count}`);
		}
	}
	lines.push("  permissions:");
	lines.push(`    session approvals: ${report.sessionApprovals}`);
	lines.push(`    recent decisions: ${report.recentDecisions}`);
	return lines.join("\n");
}

function formatDoctorJson(report: DoctorReport): string {
	return JSON.stringify(report, null, 2);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const footerInstalled = installClaudeStyleFooter(ctx, pi);
		if (!footerInstalled) {
			const piVersion = resolvePiVersion();
			ctx.ui.setStatus("pi", piVersion ? `pi v${piVersion}` : "pi");
		}
		refreshOperatorStatus(ctx);
	});

	pi.on("tool_result", async (_event, ctx) => {
		// Refresh task/elevated counts after each tool result. Cheap because
		// listTasks just enumerates a single directory and registry I/O is
		// already non-blocking from the producer side.
		refreshOperatorStatus(ctx);
	});

	pi.registerCommand("doctor", {
		description:
			"Operator layer health check. Usage: /doctor [--verbose | --json]. " +
			"Reports pi runtime version, registry availability, task and permission state.",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const report = buildDoctorReport(ctx.cwd);
			let output: string;
			if (trimmed === "--json") {
				output = formatDoctorJson(report);
			} else if (trimmed === "--verbose" || trimmed === "-v") {
				output = formatDoctorVerbose(report);
			} else {
				output = formatDoctorCompact(report);
			}
			const failed = report.checks.some((c) => !c.ok);
			ctx.ui.notify(output, failed ? "warning" : "info");
		},
	});
}
