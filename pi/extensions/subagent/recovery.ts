import type { SubagentRunSnapshot } from "./run-manager.js";

export const INTERRUPTED_TOOL_RECOVERY_MESSAGE = [
	"The previous tool was interrupted because it stopped making acceptable progress.",
	"Its output and side effects are unknown. Inspect relevant state before relying on or repeating it.",
	"Continue the original task from the last durable session context.",
].join(" ");

export interface InterruptToolRequest {
	readonly runId: string;
	readonly toolCallId: string;
	readonly activityVersion: number;
	readonly parentSessionId?: string;
}

export interface PreparedInterruptedRecovery {
	readonly run: SubagentRunSnapshot;
	readonly sessionPath: string;
	readonly toolCallId: string;
	readonly recoveryMessage: string;
}

export interface InterruptedRecoveryExecutor<T> {
	readonly terminate: (runId: string) => Promise<boolean>;
	readonly waitForSettlement: (runId: string) => Promise<boolean>;
	readonly resume: (prepared: PreparedInterruptedRecovery) => Promise<T>;
}

export async function executeInterruptedRecovery<T>(
	prepared: PreparedInterruptedRecovery,
	executor: InterruptedRecoveryExecutor<T>,
): Promise<T> {
	if (!(await executor.terminate(prepared.run.runId)))
		throw new Error(
			"The interrupted child process tree did not terminate; its session was not resumed.",
		);
	if (!(await executor.waitForSettlement(prepared.run.runId)))
		throw new Error(
			"The interrupted child did not settle; its session was not resumed.",
		);
	return executor.resume(prepared);
}

export function prepareInterruptedRecovery(
	run: SubagentRunSnapshot | undefined,
	request: InterruptToolRequest,
	findSessionPath: (runId: string) => string | undefined,
): PreparedInterruptedRecovery {
	if (!run || run.status !== "running")
		throw new Error(`Subagent run is not live: ${request.runId}`);
	if (
		run.parentSessionId &&
		run.parentSessionId !== request.parentSessionId
	)
		throw new Error("The selected run belongs to another root session.");
	if (run.activityVersion !== request.activityVersion)
		throw new Error(
			`Stale interruption request: activity advanced from ${request.activityVersion} to ${run.activityVersion}.`,
		);
	if (!run.liveTools.some((tool) => tool.id === request.toolCallId))
		throw new Error("The requested tool call is not active on the selected run.");
	const sessionPath = run.sessionPath ?? findSessionPath(run.runId);
	if (!sessionPath)
		throw new Error(
			"The selected run has no persisted child session and cannot be recovered safely.",
		);
	return {
		run,
		sessionPath,
		toolCallId: request.toolCallId,
		recoveryMessage: INTERRUPTED_TOOL_RECOVERY_MESSAGE,
	};
}
