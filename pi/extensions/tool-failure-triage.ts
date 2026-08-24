import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

interface ToolFailureCandidate {
	candidateId: string;
	tool: string;
	errorClass: string;
	occurrences: number;
	sessions: number;
	status: string;
}

interface ToolFailureReport {
	actionable: ToolFailureCandidate[];
	summary: {
		unchangedSkipped: number;
		resolved: number;
		expectedSuppressed: number;
	};
}

export function resolveRepositoryRoot(
	extensionUrl: string,
	resolveRealPath: (filePath: string) => string = realpathSync,
): string {
	return path.resolve(
		path.dirname(resolveRealPath(fileURLToPath(extensionUrl))),
		"../..",
	);
}

const repositoryRoot = resolveRepositoryRoot(import.meta.url);
const analyticsScript = path.join("pi", "analytics", "pi_log_query.py");
const scratchRoot = path.join(".tmp", "pi-log-analytics");
const snapshotPath = path.join(scratchRoot, "tool-failures.duckdb");
const scanPath = path.join(scratchRoot, "tool-failure-scan.json");
const commandPrefix = [
	"run",
	"--no-sync",
	"--project",
	"pi/analytics",
	"python",
	analyticsScript,
];

function parseReport(value: string): ToolFailureReport {
	const parsed = JSON.parse(value) as Partial<ToolFailureReport>;
	if (
		!Array.isArray(parsed.actionable) ||
		!parsed.summary ||
		typeof parsed.summary.unchangedSkipped !== "number" ||
		typeof parsed.summary.resolved !== "number" ||
		typeof parsed.summary.expectedSuppressed !== "number"
	)
		throw new Error("tool-failure report returned an invalid result");
	return parsed as ToolFailureReport;
}

export function renderToolFailureReport(report: ToolFailureReport): string {
	const lines = [
		"# Tool Failure Triage",
		"",
		`Actionable: ${report.actionable.length}; expected suppressed: ${report.summary.expectedSuppressed}; unchanged skipped: ${report.summary.unchangedSkipped}; resolved: ${report.summary.resolved}.`,
	];
	if (report.actionable.length === 0) {
		lines.push("", "No new, changed, regressed, or due-for-review failure candidates.");
		return lines.join("\n");
	}
	lines.push("");
	for (const candidate of report.actionable) {
		lines.push(
			`- [${candidate.status}] ${candidate.tool}: ${candidate.errorClass} - ${candidate.occurrences} occurrences across ${candidate.sessions} sessions (${candidate.candidateId})`,
		);
	}
	lines.push(
		"",
		`Decision source: ${scanPath}`,
		"Use the documented tool-failure-decide CLI to mark a candidate addressed or skipped.",
	);
	return lines.join("\n");
}

async function runAnalytics(
	pi: ExtensionAPI,
	args: string[],
): Promise<string> {
	const result = await pi.exec("uv", [...commandPrefix, ...args], {
		cwd: repositoryRoot,
		timeout: 300_000,
	});
	if (result.code !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
		throw new Error(detail.slice(0, 1_000));
	}
	return result.stdout;
}

export default function toolFailureTriageExtension(pi: ExtensionAPI) {
	pi.registerCommand("find-fails", {
		description: "Find new or recurring tool-call failure candidates",
		handler: async (args: string, ctx: ExtensionContext) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /find-fails", "warning");
				return;
			}
			ctx.ui.notify("Tool-failure scan started.", "info");
			ctx.ui.setStatus("find-fails", "find-fails: scanning");
			try {
				await runAnalytics(pi, [
					"--snapshot-db",
					snapshotPath,
					"--source",
					"session_entries",
					"snapshot",
				]);
				await runAnalytics(pi, [
					"--snapshot-db",
					snapshotPath,
					"--source",
					"session_entries",
					"tool-failure-scan",
					"--output",
					scanPath,
				]);
				const output = await runAnalytics(pi, [
					"tool-failure-report",
					scanPath,
				]);
				pi.sendMessage(
					{
						customType: "tool-failure-triage",
						content: renderToolFailureReport(parseReport(output)),
						display: true,
					},
					{ triggerTurn: false },
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Tool-failure scan failed: ${message}`, "error");
			} finally {
				ctx.ui.setStatus("find-fails", undefined);
			}
		},
	});
}
