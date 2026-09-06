import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sendHiddenWorkflowPrompt } from "./workflow-prompt.js";

const MAX_FAILURE_CHARS = 1_200;
const MAX_COMMAND_CHARS = 240;

function bounded(value: string, max: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= max ? normalized : `${normalized.slice(0, max - 22)} ... truncated`;
}

function redacted(value: string): string {
	return value
		.replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [REDACTED]")
		.replace(/(?:api[_-]?key|access[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
		.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, "[REDACTED]");
}

export interface RecoverableLocalFailure {
	command: string;
	failure: string;
	cwd?: string;
	context?: string;
}

export function isRecoverableLocalFailure(error: unknown): boolean {
	if (!(error instanceof Error)) return true;
	const message = error.message.toLowerCase();
	return ![
		"operation cancelled",
		"cancelled",
		"abort",
		"aborted",
		"approval",
		"safety",
		"secret",
		"credential",
		"production",
		"permission denied",
		"refusing",
		"blocked",
	].some((marker) => message.includes(marker));
}

export function buildRecoverableLocalFailureHandoff(
	failure: RecoverableLocalFailure,
): string {
	const lines = [
		"Recoverable local workflow failure handoff.",
		`Command: ${bounded(redacted(failure.command), MAX_COMMAND_CHARS)}`,
		`Failure: ${bounded(redacted(failure.failure), MAX_FAILURE_CHARS)}`,
		...(failure.cwd ? [`Workspace: ${bounded(redacted(failure.cwd), MAX_COMMAND_CHARS)}`] : []),
		...(failure.context ? [`Context: ${bounded(redacted(failure.context), MAX_FAILURE_CHARS)}`] : []),
		"This is recovery context, not permission to bypass safety controls.",
		"Inspect the current local state before retrying. Do not replay a partially observed mutation blindly, weaken secret or credential handling, alter submodule ownership, or cross destructive or production boundaries.",
	];
	return lines.join("\n");
}

export function sendRecoverableLocalFailureHandoff(
	pi: ExtensionAPI,
	failure: RecoverableLocalFailure,
): void {
	pi.sendMessage(
		{
			customType: "workflow.recoverable-local-failure",
			content: buildRecoverableLocalFailureHandoff(failure),
			display: false,
		},
		{ triggerTurn: true, deliverAs: "followUp" },
	);
}

export function handoffRecoverableLocalFailure(
	pi: ExtensionAPI,
	failure: RecoverableLocalFailure,
): boolean {
	if (!isRecoverableLocalFailure(new Error(failure.failure))) return false;
	sendRecoverableLocalFailureHandoff(pi, failure);
	return true;
}
