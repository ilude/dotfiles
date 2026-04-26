/**
 * Transcript Provider Extension
 *
 * Hooks into Pi's provider/message lifecycle to capture LLM interactions:
 *
 *   - before_provider_request -> emit `llm_request` (cloned + redacted payload)
 *   - after_provider_response -> emit `llm_response` (status + redacted headers)
 *   - message_start          -> note message_id; emit `message_start`
 *   - message_update         -> NEVER per-token; optional N-second heartbeat (off by default)
 *   - message_end            -> emit EXACTLY ONE `assistant_message` per turn
 *   - model_select           -> emit `model_select`
 *   - turn_start             -> advance turn counter so subsequent events use turn-N
 *
 * This extension owns the writer initialization in this Pi process. Other
 * transcript-* extensions read the active writer and trace IDs via
 * `transcript-runtime.ts`. Default-off respect: when transcript.enabled is
 * false in ~/.pi/agent/settings.json, every handler short-circuits.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { clonePayload } from "../lib/transcript.js";

// Convention exception: this file emits structured trace events and never returns user-facing tool errors or shows UI notifications.
// Risk: if a tool execute() handler is added here and uses an ad-hoc error shape, downstream filtering breaks.
// Why shared helper is inappropriate: formatToolError and uiNotify have no call sites in this file; importing them for unused symbols adds noise.
import {
	advanceTurn,
	claimAssistantMessageEmission,
	emit,
	getCurrentMessageId,
	getWriter,
	setCurrentMessageId,
} from "./transcript-runtime.js";

/**
 * Map Pi's `usage` shape onto OpenTelemetry GenAI attribute names. The plan
 * mandates `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` so a
 * future OTel collector can ingest the trace verbatim.
 */
function mapUsageToOtel(usage: unknown): Record<string, unknown> | undefined {
	if (!usage || typeof usage !== "object") return undefined;
	const u = usage as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	if (typeof u.input === "number") out["gen_ai.usage.input_tokens"] = u.input;
	if (typeof u.output === "number") out["gen_ai.usage.output_tokens"] = u.output;
	if (typeof u.cacheRead === "number") out["gen_ai.usage.cache_read_tokens"] = u.cacheRead;
	if (typeof u.cacheWrite === "number") out["gen_ai.usage.cache_write_tokens"] = u.cacheWrite;
	if (u.cost && typeof u.cost === "object") {
		const c = u.cost as Record<string, unknown>;
		if (typeof c.total === "number") out["gen_ai.usage.cost_total"] = c.total;
	}
	if (typeof u.totalTokens === "number") out["gen_ai.usage.total_tokens"] = u.totalTokens;
	return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Extract visible thinking blocks and tool-call requests from an assistant
 * message. Hidden CoT is never persisted -- only what the model surfaced
 * through the message content array is captured.
 */
function extractAssistantContent(message: unknown): {
	content: unknown[];
	toolCalls: unknown[];
} {
	const content: unknown[] = [];
	const toolCalls: unknown[] = [];
	if (!message || typeof message !== "object") return { content, toolCalls };
	const msg = message as Record<string, unknown>;
	const blocks = Array.isArray(msg.content) ? msg.content : [];
	for (const block of blocks) {
		if (!block || typeof block !== "object") continue;
		const b = block as Record<string, unknown>;
		// Pi normalizes to type=text|thinking|toolCall|image
		switch (b.type) {
			case "text":
				content.push({ type: "text", text: b.text });
				break;
			case "thinking":
				// Visible thinking only -- this is what the model exposes in the
				// message body. Hidden CoT does not appear here.
				content.push({ type: "thinking", thinking: b.thinking });
				break;
			case "toolCall":
				content.push({ type: "tool_use", id: b.id, name: b.name, input: b.arguments });
				toolCalls.push({ id: b.id, name: b.name, input: b.arguments });
				break;
			default:
				content.push(block);
				break;
		}
	}
	return { content, toolCalls };
}

export default function (pi: ExtensionAPI) {
	// Writer initialization and session_start/session_shutdown emission live in
	// session-hooks.ts so all session-lifecycle work happens in one place.
	// This file owns provider/message/model events only.

	// --------------------------------------------------------------------------
	// turn_start: increment the runtime turn counter. We use turn_start (not
	// before_agent_start) because Pi fires turn_start at the start of each
	// agent loop iteration, including post-tool-result continuations.
	// --------------------------------------------------------------------------
	pi.on("turn_start", async (_event) => {
		if (!getWriter()) return;
		advanceTurn();
	});

	// --------------------------------------------------------------------------
	// before_provider_request: clone + redact the request payload, emit llm_request.
	// On serialization failure (circular refs, etc.) the writer emits a
	// payload_unserializable diagnostic record automatically.
	// --------------------------------------------------------------------------
	pi.on("before_provider_request", async (event) => {
		if (!getWriter()) return;
		const cloneResult = clonePayload(event.payload);
		if (!cloneResult.ok) {
			await emit(
				{ event_type: "payload_unserializable" },
				{
					field: "request_payload",
					error_class: cloneResult.error.errorClass,
					error_message: cloneResult.error.errorMessage,
				},
			);
			return;
		}
		// Hand the cloned payload to the writer; redaction (header + field-name
		// + free-text) is applied inside writer.write() before serialization.
		await emit({ event_type: "llm_request" }, { payload: cloneResult.value });
	});

	// --------------------------------------------------------------------------
	// after_provider_response: emit llm_response with status + redacted headers.
	// The writer's redact() pipeline scrubs `set-cookie`, `authorization`,
	// `x-api-key`, etc. The response body is not surfaced by this hook -- Pi
	// streams it through message_start/message_end where the assistant content
	// is captured separately.
	// --------------------------------------------------------------------------
	pi.on("after_provider_response", async (event) => {
		if (!getWriter()) return;
		await emit(
			{ event_type: "llm_response" },
			{
				status: event.status,
				headers: event.headers,
			},
		);
	});

	// --------------------------------------------------------------------------
	// message_start: note the message id so subsequent events on this turn
	// can correlate. Emit a lightweight message_start record.
	// --------------------------------------------------------------------------
	pi.on("message_start", async (event) => {
		if (!getWriter()) return;
		const message = event.message as unknown as Record<string, unknown> | undefined;
		const messageId = typeof message?.id === "string" ? message.id : undefined;
		setCurrentMessageId(messageId);
		await emit(
			{ event_type: "message_start", message_id: messageId },
			{
				role: typeof message?.role === "string" ? message.role : undefined,
			},
		);
	});

	// --------------------------------------------------------------------------
	// message_update: per-token streaming. Per the plan, NEVER emit a record
	// per token. The optional heartbeat is off by default and intentionally
	// omitted from the ship config -- enabling it would require a settings
	// flag plus a per-session timer. Leaving the hook registered (no-op) makes
	// it discoverable without bloating traces by 1000x.
	// --------------------------------------------------------------------------
	pi.on("message_update", async (_event) => {
		// Intentional no-op. See `assistant_streaming` heartbeat note in the plan.
	});

	// --------------------------------------------------------------------------
	// message_end: emit EXACTLY ONE assistant_message per turn.
	//
	// Pi fires message_end for every message-shaped entry (user, assistant,
	// toolResult). The per-turn dedupe flag (claimAssistantMessageEmission)
	// guarantees only the assistant message is captured here -- tool results
	// are handled by transcript-tools.ts via the tool_result hook.
	// --------------------------------------------------------------------------
	pi.on("message_end", async (event) => {
		if (!getWriter()) return;
		const message = event.message as unknown as Record<string, unknown> | undefined;
		if (!message || message.role !== "assistant") return;
		if (!claimAssistantMessageEmission()) return; // already emitted for this turn

		const messageId = typeof message.id === "string" ? message.id : getCurrentMessageId();
		const { content, toolCalls } = extractAssistantContent(message);
		const usage = mapUsageToOtel(message.usage);

		await emit(
			{ event_type: "assistant_message", message_id: messageId },
			{
				content,
				tool_calls: toolCalls,
				usage,
				stop_reason: typeof message.stopReason === "string" ? message.stopReason : undefined,
				model: typeof message.model === "string" ? message.model : undefined,
			},
		);
	});

	// --------------------------------------------------------------------------
	// model_select: emit when Pi switches model (manual or via prompt-router).
	// --------------------------------------------------------------------------
	pi.on("model_select", async (event) => {
		if (!getWriter()) return;
		const model = event.model as unknown as Record<string, unknown> | undefined;
		const previous = event.previousModel as unknown as Record<string, unknown> | undefined;
		await emit(
			{ event_type: "model_select" },
			{
				source: event.source,
				model: model
					? { provider: model.provider, id: model.id, name: model.name }
					: undefined,
				previous_model: previous
					? { provider: previous.provider, id: previous.id, name: previous.name }
					: undefined,
			},
		);
	});
}
