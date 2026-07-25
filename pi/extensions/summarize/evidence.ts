import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export const TOOL_ARGUMENT_MAX_BYTES = 2_000;
export const TOOL_RESULT_MAX_BYTES = 5_000;
export const MESSAGE_TEXT_MAX_BYTES = 8_000;
export const SUMMARY_EVIDENCE_MAX_BYTES = 48_000;

const SECRET_KEY_PATTERN =
	/(?:api[_-]?key|access[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)/i;
const OMITTED_CUSTOM_TYPES = new Set([
	"summary-recap",
	"workflow.hiddenPrompt",
]);

export function truncateUtf8(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

	let low = 0;
	let high = text.length;
	while (low < high) {
		const midpoint = Math.ceil((low + high) / 2);
		if (Buffer.byteLength(text.slice(0, midpoint), "utf8") <= maxBytes) {
			low = midpoint;
		} else {
			high = midpoint - 1;
		}
	}
	let end = low;
	const last = text.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end -= 1;
	return text.slice(0, end);
}

function truncateUtf8Tail(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const midpoint = Math.floor((low + high) / 2);
		if (Buffer.byteLength(text.slice(midpoint), "utf8") <= maxBytes) {
			high = midpoint;
		} else {
			low = midpoint + 1;
		}
	}
	let start = low;
	const first = text.charCodeAt(start);
	if (first >= 0xdc00 && first <= 0xdfff) start += 1;
	return text.slice(start);
}

function capped(
	text: string,
	maxBytes: number,
	notice: string,
	force = false,
): string {
	if (!force && Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	const suffix = `\n[${notice}]`;
	return `${truncateUtf8(text, maxBytes - Buffer.byteLength(suffix, "utf8"))}${suffix}`;
}

export function redactSummarySecrets(text: string): string {
	return text
		.replace(
			/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g,
			"[REDACTED PRIVATE KEY]",
		)
		.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
		.replace(
			/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,})\b/g,
			"[REDACTED]",
		)
		.replace(
			/(["']?(?:api[_-]?key|access[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)["']?\s*[:=]\s*)(["'])((?:\\[\s\S]|(?!\2)[\s\S])*)\2/gi,
			"$1$2[REDACTED]$2",
		)
		.replace(
			/(["']?(?:api[_-]?key|access[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)["']?\s*[:=]\s*)[^\s,;}]+/gi,
			"$1[REDACTED]",
		)
		.replace(
			/([?&](?:api[_-]?key|access[_-]?token|key|secret|token)=)[^&#\s]+/gi,
			"$1[REDACTED]",
		);
}

function sanitizeValue(value: unknown, key?: string, depth = 0): unknown {
	if (key && SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
	if (depth >= 6) return "[nested value omitted]";
	if (typeof value === "string") {
		return redactSummarySecrets(
			capped(value, TOOL_ARGUMENT_MAX_BYTES, "string value capped"),
		);
	}
	if (typeof value === "bigint") return `${value}n`;
	if (typeof value === "function" || typeof value === "symbol") {
		return `[${typeof value} omitted]`;
	}
	if (Array.isArray(value)) {
		const items = value
			.slice(0, 30)
			.map((item) => sanitizeValue(item, undefined, depth + 1));
		if (value.length > items.length) items.push("[additional items omitted]");
		return items;
	}
	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value);
		const sanitized = Object.fromEntries(
			entries.slice(0, 30).map(([entryKey, entryValue]) => [
				capped(entryKey, 200, "key capped"),
				sanitizeValue(entryValue, entryKey, depth + 1),
			]),
		);
		if (entries.length > 30) sanitized["[additional keys omitted]"] = true;
		return sanitized;
	}
	return value;
}

function serializeToolArguments(value: unknown): string {
	try {
		return JSON.stringify(sanitizeValue(value), null, 2) ?? "(no arguments)";
	} catch {
		return "[tool arguments could not be serialized]";
	}
}

function textContent(
	content: unknown,
	maxBytes = MESSAGE_TEXT_MAX_BYTES,
	notice = "text content capped",
): string {
	if (typeof content === "string") {
		return redactSummarySecrets(capped(content, maxBytes, notice));
	}
	if (!Array.isArray(content)) return "";
	let text = "";
	let truncated = false;
	for (const block of content) {
		if (
			typeof block !== "object" ||
			block === null ||
			!("type" in block) ||
			block.type !== "text" ||
			!("text" in block) ||
			typeof block.text !== "string"
		) {
			continue;
		}
		const separator = text ? "\n" : "";
		const remaining =
			maxBytes -
			Buffer.byteLength(text, "utf8") -
			Buffer.byteLength(separator, "utf8");
		if (Buffer.byteLength(block.text, "utf8") <= remaining) {
			text += `${separator}${block.text}`;
			continue;
		}
		text += `${separator}${truncateUtf8(block.text, remaining)}`;
		truncated = true;
		break;
	}
	return redactSummarySecrets(capped(text, maxBytes, notice, truncated));
}

function serializeMessage(entry: Extract<SessionEntry, { type: "message" }>): string {
	const { message } = entry;
	if (message.role === "user") {
		const text = textContent(
			message.content,
			MESSAGE_TEXT_MAX_BYTES,
			"user message capped",
		);
		return text ? `USER\n${text}` : "";
	}
	if (message.role === "assistant") {
		const maxBytes = MESSAGE_TEXT_MAX_BYTES + TOOL_ARGUMENT_MAX_BYTES;
		const text = textContent(
			message.content,
			MESSAGE_TEXT_MAX_BYTES,
			"assistant text capped",
		);
		let result = text ? `ASSISTANT\n${text}` : "";
		for (const block of message.content) {
			if (block.type !== "toolCall") continue;
			const piece = `${result ? "\n\n" : ""}TOOL CALL ${capped(block.name, 200, "tool name capped")}\n${capped(
				serializeToolArguments(block.arguments),
				TOOL_ARGUMENT_MAX_BYTES,
				"tool arguments capped",
			)}`;
			const candidate = `${result}${piece}`;
			if (Buffer.byteLength(candidate, "utf8") > maxBytes) {
				return capped(
					candidate,
					maxBytes,
					"assistant message evidence capped",
				);
			}
			result = candidate;
		}
		return result;
	}
	if (message.role === "toolResult") {
		const text = textContent(
			message.content,
			TOOL_RESULT_MAX_BYTES,
			"tool result capped",
		);
		return `TOOL RESULT ${capped(message.toolName, 200, "tool name capped")}${message.isError ? " (error)" : ""}\n${text || "(no text output)"}`;
	}
	if (message.role === "bashExecution") {
		const command = redactSummarySecrets(
			capped(message.command, TOOL_ARGUMENT_MAX_BYTES, "command capped"),
		);
		const output = redactSummarySecrets(
			capped(message.output, TOOL_RESULT_MAX_BYTES, "command output capped"),
		);
		return `USER SHELL${message.exitCode === undefined ? "" : ` (exit ${message.exitCode})`}\n${command}\n${output}`;
	}
	if (message.role === "custom") {
		if (OMITTED_CUSTOM_TYPES.has(message.customType)) return "";
		const text = textContent(
			message.content,
			MESSAGE_TEXT_MAX_BYTES,
			"extension message capped",
		);
		return text ? `EXTENSION ${message.customType}\n${text}` : "";
	}
	return "";
}

export function serializeSummaryEvidence(
	entries: readonly SessionEntry[],
	maxBytes = SUMMARY_EVIDENCE_MAX_BYTES,
): string {
	const marker = "\n\n[... evidence capped; middle omitted ...]\n\n";
	const markerBytes = Buffer.byteLength(marker, "utf8");
	if (maxBytes <= markerBytes) return truncateUtf8("[evidence capped]", maxBytes);
	const headBytes = Math.floor((maxBytes - markerBytes) * 0.58);
	const tailBytes = maxBytes - markerBytes - headBytes;
	let full = "";
	let head = "";
	let tail = "";
	let sectionCount = 0;
	let overflowed = false;
	let omittingPreviousSummary = false;

	const append = (section: string) => {
		if (!section) return;
		const piece = `${sectionCount > 0 ? "\n\n---\n\n" : ""}${section}`;
		sectionCount++;
		if (!overflowed) {
			const candidate = `${full}${piece}`;
			if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
				full = candidate;
				return;
			}
			overflowed = true;
			head = truncateUtf8(candidate, headBytes);
			tail = truncateUtf8Tail(candidate, tailBytes);
			full = "";
			return;
		}
		tail = truncateUtf8Tail(`${tail}${piece}`, tailBytes);
	};

	for (const entry of entries) {
		if (entry.type === "message") {
			if (entry.message.role === "user") omittingPreviousSummary = false;
			else if (omittingPreviousSummary) continue;
			append(serializeMessage(entry));
			continue;
		}
		if (entry.type !== "custom_message") continue;
		const rawText = textContent(
			entry.content,
			MESSAGE_TEXT_MAX_BYTES,
			"extension message capped",
		);
		if (
			entry.customType === "slash-echo" &&
			/^\/summarize(?:\s|$)/.test(rawText.trim())
		) {
			omittingPreviousSummary = true;
			continue;
		}
		if (omittingPreviousSummary || OMITTED_CUSTOM_TYPES.has(entry.customType)) {
			continue;
		}
		if (rawText) append(`EXTENSION ${entry.customType}\n${rawText}`);
	}

	if (sectionCount === 0) return "(no textual session evidence)";
	return overflowed ? `${head}${marker}${tail}` : full;
}

export function buildSummaryEvidenceFallback(entries: readonly SessionEntry[]): string {
	const tools = new Set<string>();
	let toolCallCount = 0;
	let finalAssistantText = "";
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		for (const block of entry.message.content) {
			if (block.type === "toolCall") {
				toolCallCount++;
				if (tools.size < 32) {
					tools.add(
						redactSummarySecrets(capped(block.name, 80, "name capped")),
					);
				}
			}
			if (block.type === "text") {
				const bounded = capped(
					block.text,
					700,
					"final response capped",
				).trim();
				if (bounded) finalAssistantText = redactSummarySecrets(bounded);
			}
		}
	}
	const toolList = [...tools];
	const lines = [
		"Detailed evidence serialization failed; use the active conversation as the primary source.",
		`Observed tool calls: ${toolCallCount}${toolList.length ? ` across ${toolList.join(", ")}` : ""}${tools.size >= 32 ? " (tool list capped)" : ""}.`,
	];
	if (finalAssistantText) {
		lines.push(finalAssistantText.replace(/\s+/g, " "));
	}
	return capped(lines.join("\n"), 2_000, "fallback evidence capped");
}
