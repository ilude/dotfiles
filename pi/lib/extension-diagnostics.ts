import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type UiNotifyContext,
	type UiNotifyLevel,
	uiNotify,
} from "./extension-utils.js";

const MAX_SOURCE_CHARS = 80;
const MAX_FAILURE_CHARS = 1200;
const MAX_CONTEXT_CHARS = 600;

function bounded(value: string, max: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= max
		? normalized
		: `${normalized.slice(0, max - 22)} ... truncated`;
}

function redacted(value: string): string {
	return value
		.replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [REDACTED]")
		.replace(
			/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi,
			"$1[REDACTED]@",
		)
		.replace(
			/(api[_-]?key|access[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)\s*[:=]\s*\S+/gi,
			"$1=[REDACTED]",
		)
		.replace(
			/((?:--?|\/)(?:api[_-]?key|access[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi,
			"$1[REDACTED]",
		)
		.replace(/\b(password|pwd|user\s+id|uid)\s*=\s*[^;\s]+/gi, "$1=[REDACTED]")
		.replace(
			/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16})\b/g,
			"[REDACTED]",
		)
		.replace(
			/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
			"[REDACTED]",
		)
		.replace(/\\\\[^\\\s]+\\[^\\\s]+(?:\\[^\s"'`]*)?/g, "[PATH]")
		.replace(/\b[A-Za-z]:[\\/][^\s"'`<>|]+/g, "[PATH]")
		.replace(
			/(^|[\s("'=])~?\/(?:[^/\s"'`]+\/)+[^\s"'`]*/g,
			"$1[PATH]",
		);
}

function safeConsoleError(message: string): void {
	try {
		console.error(message);
	} catch {
		// Reporting failures must not interrupt the primary operation.
	}
}

function boundedRedacted(value: string, max: number): string {
	return bounded(redacted(value), max);
}

export interface ActionableExtensionFailure {
	extension: string;
	failure: string;
	impact?: string;
	nextAction?: string;
}

export function formatActionableExtensionFailure(
	failure: ActionableExtensionFailure,
): string {
	return [
		"Actionable custom extension failure.",
		`Extension: ${boundedRedacted(failure.extension, MAX_SOURCE_CHARS)}`,
		`Failure: ${boundedRedacted(failure.failure, MAX_FAILURE_CHARS)}`,
		...(failure.impact
			? [`Impact: ${boundedRedacted(failure.impact, MAX_CONTEXT_CHARS)}`]
			: []),
		...(failure.nextAction
			? [`Next action: ${boundedRedacted(failure.nextAction, MAX_CONTEXT_CHARS)}`]
			: []),
	].join("\n");
}

export interface ActionableExtensionFailureOptions {
	deliverAs?: "followUp" | "nextTurn";
	level?: UiNotifyLevel;
	notify?: boolean;
	operatorMessage?: string;
	prefix?: string;
}

export function reportActionableExtensionFailure(
	pi: Pick<ExtensionAPI, "sendMessage">,
	ctx: UiNotifyContext | undefined,
	failure: ActionableExtensionFailure,
	options: ActionableExtensionFailureOptions = {},
): void {
	try {
		pi.sendMessage(
			{
				customType: "extension.actionable-failure",
				content: formatActionableExtensionFailure(failure),
				display: false,
				details: { extension: boundedRedacted(failure.extension, MAX_SOURCE_CHARS) },
			},
			{ deliverAs: options.deliverAs ?? "nextTurn" },
		);
	} catch (error) {
		safeConsoleError(
			`Failed to publish actionable extension diagnostic for ${boundedRedacted(failure.extension, MAX_SOURCE_CHARS)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (options.notify === false) return;
	try {
		uiNotify(
			ctx ?? {},
			options.level ?? "error",
			options.operatorMessage ?? failure.failure,
			{ prefix: options.prefix },
		);
	} catch (error) {
		safeConsoleError(
			`Failed to notify the operator about ${boundedRedacted(failure.extension, MAX_SOURCE_CHARS)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
