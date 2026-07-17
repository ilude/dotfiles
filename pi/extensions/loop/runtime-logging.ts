import fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SCHEMA_VERSION = 1;

function integerEnvironmentValue(name: string): number | undefined {
	const value = process.env[name]?.trim();
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
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
			...data,
		};
		try {
			fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
		} catch {
			// Runtime logging must not change loop execution.
		}
	}

	pi.on("session_start", (event, ctx) => {
		startedAt = Date.now();
		append("pi_process_started", {
			reason: event.reason,
			session_id: ctx.sessionManager.getSessionId(),
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
