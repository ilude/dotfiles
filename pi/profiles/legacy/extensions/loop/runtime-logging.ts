import { onSessionStart } from "../../lib/session-start-metrics.js";
import fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SCHEMA_VERSION = 1;
const MODIFYING_CAPABLE_TOOLS = new Set([
	"bash",
	"pwsh",
	"write",
	"edit",
	"text_edit",
	"structured_edit",
	"bg_start",
	"subagent",
	"subagent_continue",
]);

function integerEnvironmentValue(name: string): number | undefined {
	const value = process.env[name]?.trim();
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function containsNeedsApproval(content: unknown): boolean {
	if (!Array.isArray(content)) return false;
	return content.some(
		(item) =>
			item &&
			typeof item === "object" &&
			"text" in item &&
			typeof item.text === "string" &&
			/"outcome"\s*:\s*"needs_approval"/.test(item.text),
	);
}

export default function (pi: ExtensionAPI) {
	const configuredLogPath = process.env.PI_LOOP_LOG_PATH?.trim();
	const configuredJobId = process.env.PI_LOOP_JOB_ID?.trim();
	if (!configuredLogPath || !configuredJobId) return;
	const logPath = configuredLogPath;
	const jobId = configuredJobId;

	const supervisorPid = integerEnvironmentValue("PI_LOOP_SUPERVISOR_PID");
	const iteration = integerEnvironmentValue("PI_LOOP_ITERATION");
	const attempt = integerEnvironmentValue("PI_LOOP_ATTEMPT");
	const invocationId = process.env.PI_LOOP_INVOCATION_ID?.trim() || undefined;
	const goalId = process.env.PI_GOAL_ID?.trim() || undefined;
	let startedAt: number | undefined;

	function append(event: string, data: Record<string, unknown>): void {
		const record = {
			schema_version: SCHEMA_VERSION,
			timestamp: new Date().toISOString(),
			event,
			job_id: jobId,
			supervisor_pid: supervisorPid,
			pi_pid: process.pid,
			iteration,
			attempt,
			invocation_id: invocationId,
			goal_id: goalId,
			...data,
		};
		try {
			fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
		} catch {
			// Runtime logging must not change loop execution.
		}
	}

	onSessionStart(pi, import.meta.url, (event, ctx) => {
		startedAt = Date.now();
		append("pi_process_started", {
			reason: event.reason,
			session_id: ctx.sessionManager.getSessionId(),
		});
	});

	pi.on("tool_execution_start", (event) => {
		append("tool_execution_started", {
			tool_call_id: event.toolCallId,
			tool: event.toolName,
			modifying_capable: MODIFYING_CAPABLE_TOOLS.has(event.toolName),
		});
	});

	pi.on("tool_execution_end", (event) => {
		append("tool_execution_finished", {
			tool_call_id: event.toolCallId,
			tool: event.toolName,
			is_error: event.isError,
		});
	});

	pi.on("tool_result", (event) => {
		if (!containsNeedsApproval(event.content)) return;
		append("approval_required", {
			tool_call_id: event.toolCallId,
			tool: event.toolName,
		});
	});

	pi.on("session_shutdown", (event, ctx) => {
		append("pi_process_stopped", {
			reason: event.reason,
			session_id: ctx.sessionManager.getSessionId(),
			duration_ms:
				startedAt === undefined
					? undefined
					: Math.max(0, Date.now() - startedAt),
		});
	});
}
