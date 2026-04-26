/**
 * Transcript Tools Extension
 *
 * Captures every tool boundary with the same correlation envelope used by
 * transcript-provider.ts. Each event uses `tool_call_id` for correlation,
 * which the writer also stores in the envelope so out-of-order parallel
 * completions remain stitched correctly.
 *
 * Hooks:
 *   - tool_call            -> emit `tool_call` with parameters (cloned + redacted)
 *   - tool_execution_start -> emit `tool_execution_start` (timestamp captured by writer)
 *   - tool_execution_end   -> emit `tool_execution_end` with duration_ms
 *   - tool_result          -> emit `tool_result` with content/details/error/truncation
 *
 * Free-text redaction (T1) scrubs secrets from `tool_result.content[*].text`
 * and `tool_result.details` before they hit disk. Source objects from Pi are
 * never mutated.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { clonePayload } from "../lib/transcript.js";
import { emit, getWriter } from "./transcript-runtime.js";

// Convention exception: this file hooks tool lifecycle events and emits structured trace records -- it returns no user-facing tool errors and shows no UI notifications.
// Risk: if a tool execute() handler is added here with an ad-hoc error shape, downstream filtering breaks silently.
// Why shared helper is inappropriate: formatToolError and uiNotify have no call sites in this file; adding the import solely for future-proofing contradicts KISS.

/**
 * In-memory map of toolCallId -> wallclock start (epoch ms) so tool_execution_end
 * can compute duration_ms. The map is bounded by Pi's concurrent-tool ceiling
 * and entries are deleted at end. Out-of-order completions are correlated by
 * key, not by ordering.
 */
const startTimes = new Map<string, number>();

/**
 * Best-effort extraction of truncation metadata from a tool result's `details`
 * object. The shape varies by tool: bash uses `truncated` + `originalLength`;
 * read uses `truncated` + `linesShown`; etc. We pass the raw details through
 * as-is and add an explicit `truncated` flag at the top level for callers
 * that just need to know "was anything cut".
 */
function detectTruncation(details: unknown): { truncated: boolean; details: unknown } {
	if (!details || typeof details !== "object") {
		return { truncated: false, details };
	}
	const d = details as Record<string, unknown>;
	const truncated =
		Boolean(d.truncated) ||
		Boolean(d.wasTruncated) ||
		(typeof d.originalLength === "number" && typeof d.returnedLength === "number" && d.originalLength > d.returnedLength);
	return { truncated, details };
}

export default function (pi: ExtensionAPI) {
	// --------------------------------------------------------------------------
	// tool_call: fired before tool execution. `event.input` is mutable in Pi
	// for argument patching; we clone before serializing so any later mutation
	// by a downstream extension does not affect the persisted snapshot.
	// --------------------------------------------------------------------------
	pi.on("tool_call", async (event) => {
		if (!getWriter()) return;
		const cloneResult = clonePayload(event.input);
		const input = cloneResult.ok ? cloneResult.value : null;
		const inputDiagnostic = cloneResult.ok ? undefined : cloneResult.error;

		await emit(
			{ event_type: "tool_call", tool_call_id: event.toolCallId },
			{
				tool_call_id: event.toolCallId,
				tool_name: event.toolName,
				input,
				input_diagnostic: inputDiagnostic
					? { error_class: inputDiagnostic.errorClass, error_message: inputDiagnostic.errorMessage }
					: undefined,
			},
		);
	});

	// --------------------------------------------------------------------------
	// tool_execution_start: record start time so tool_execution_end can compute
	// duration_ms. Emitted as an event for trace symmetry; consumers that only
	// care about durations can ignore start records and read duration_ms off
	// the end record.
	// --------------------------------------------------------------------------
	pi.on("tool_execution_start", async (event) => {
		if (!getWriter()) return;
		startTimes.set(event.toolCallId, Date.now());
		await emit(
			{ event_type: "tool_execution_start", tool_call_id: event.toolCallId },
			{
				tool_call_id: event.toolCallId,
				tool_name: event.toolName,
				args_excerpt: summarizeArgs(event.args),
			},
		);
	});

	// --------------------------------------------------------------------------
	// tool_execution_end: compute duration_ms from the start time we stored,
	// then forget the start time so the map cannot grow unbounded.
	// --------------------------------------------------------------------------
	pi.on("tool_execution_end", async (event) => {
		if (!getWriter()) return;
		const start = startTimes.get(event.toolCallId);
		startTimes.delete(event.toolCallId);
		const duration_ms = typeof start === "number" ? Date.now() - start : null;

		await emit(
			{ event_type: "tool_execution_end", tool_call_id: event.toolCallId },
			{
				tool_call_id: event.toolCallId,
				tool_name: event.toolName,
				duration_ms,
				is_error: event.isError,
			},
		);
	});

	// --------------------------------------------------------------------------
	// tool_result: emit a record with content, details, error state, and any
	// truncation metadata Pi attached. Free-text redaction inside
	// content[*].text and details runs inside writer.write() (T1) -- this
	// extension does not need to scan secrets itself.
	// --------------------------------------------------------------------------
	pi.on("tool_result", async (event) => {
		if (!getWriter()) return;
		const cloneContent = clonePayload(event.content);
		const cloneDetails = clonePayload(event.details);
		const cloneInput = clonePayload(event.input);
		const truncation = detectTruncation(cloneDetails.ok ? cloneDetails.value : event.details);

		await emit(
			{ event_type: "tool_result", tool_call_id: event.toolCallId },
			{
				tool_call_id: event.toolCallId,
				tool_name: event.toolName,
				input: cloneInput.ok ? cloneInput.value : null,
				content: cloneContent.ok ? cloneContent.value : [],
				details: cloneDetails.ok ? cloneDetails.value : null,
				is_error: event.isError,
				error: event.isError ? extractErrorText(event.content) : null,
				truncation: truncation.truncated
					? { truncated: true, details: truncation.details }
					: { truncated: false },
			},
		);
	});
}

/**
 * Best-effort short summary of tool arguments for `tool_execution_start`.
 * The full argument object is captured by `tool_call`; this excerpt exists
 * so the start record stays small while still being human-readable.
 */
function summarizeArgs(args: unknown): string {
	try {
		const json = JSON.stringify(args);
		if (typeof json !== "string") return "";
		return json.length > 200 ? json.slice(0, 200) + "..." : json;
	} catch {
		return "";
	}
}

/**
 * Pull a printable error string from a tool_result content array when the
 * tool reported an error. Pi conventionally puts the message in the first
 * text block.
 */
function extractErrorText(content: unknown): string | null {
	if (!Array.isArray(content)) return null;
	for (const block of content) {
		if (block && typeof block === "object" && (block as Record<string, unknown>).type === "text") {
			const text = (block as Record<string, unknown>).text;
			if (typeof text === "string") return text;
		}
	}
	return null;
}
