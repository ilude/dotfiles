/**
 * Transcript Runtime -- shared session-scoped state for transcript extensions.
 *
 * The T1 writer (`pi/lib/transcript.ts`) is event-scoped: every `write()` call
 * supplies the full envelope. Wave-2 extensions need a level above that to:
 *   - Hold a single TranscriptWriter instance per Pi session
 *   - Track the active turn_id, message_id, and trace span IDs
 *   - Parse W3C TRACEPARENT from the env so child sessions inherit parent_trace_id
 *   - Expose the current trace/span IDs to the subagent extension so it can
 *     inject TRACEPARENT into spawned children
 *
 * Module-level state is intentional: a Pi process is exactly one session, and
 * the writer/turn-counter must be shared by transcript-provider, transcript-
 * tools, prompt-router, session-hooks, and subagent extensions without
 * threading a context object through every event handler.
 *
 * All functions are no-ops when the writer is not initialized or transcript
 * tracing is disabled. None of them throw.
 */

import * as crypto from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	TranscriptWriter,
	loadSettings,
	type TranscriptEvent,
	type TranscriptSettings,
} from "../lib/transcript.js";

// Convention exception: this module is pure shared runtime state (writer, turn counter, trace IDs) -- no tool execute() handlers, no UI notifications, no path inputs.
// Risk: if a tool or command handler is added here and uses an ad-hoc error shape or direct ctx.ui.notify, it will be invisible to downstream consistency checks.
// Why shared helper is inappropriate: formatToolError and uiNotify have no call sites in this file; the module exports its own public API consumed by other transcript extensions.

/**
 * No-op Pi extension factory.
 *
 * This module is imported by the transcript extensions as shared runtime state,
 * but top-level `*.ts` files under `~/.pi/agent/extensions/` are also
 * auto-discovered by Pi. Exporting a harmless factory keeps auto-discovery happy
 * without registering duplicate hooks or tools.
 */
export default function transcriptRuntime(_pi: ExtensionAPI): void {
	// Intentionally empty.
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

interface RuntimeState {
	writer: TranscriptWriter | null;
	settings: TranscriptSettings | null;
	sessionId: string;
	traceId: string;
	parentTraceId: string | undefined;
	currentSpanId: string;
	turnIndex: number;
	currentTurnId: string;
	currentMessageId: string | undefined;
	/** Per-turn flag: ensures exactly ONE assistant_message record per turn at message_end. */
	assistantMessageEmittedForTurn: boolean;
}

const state: RuntimeState = {
	writer: null,
	settings: null,
	sessionId: "",
	traceId: "",
	parentTraceId: undefined,
	currentSpanId: "",
	turnIndex: 0,
	currentTurnId: "turn-0",
	currentMessageId: undefined,
	assistantMessageEmittedForTurn: false,
};

// ---------------------------------------------------------------------------
// W3C Trace Context parsing
// ---------------------------------------------------------------------------

/**
 * Parses a W3C `traceparent` header value: `00-<32-hex-trace-id>-<16-hex-span-id>-<2-hex-flags>`.
 *
 * Returns null on any malformed input. The caller decides how to react -- a
 * missing or invalid header simply means "no parent context", not an error.
 */
export function parseTraceparent(value: string | undefined): { traceId: string; spanId: string } | null {
	if (!value || typeof value !== "string") return null;
	const match = value.trim().match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i);
	if (!match) return null;
	return { traceId: match[1].toLowerCase(), spanId: match[2].toLowerCase() };
}

/** Generates a fresh 32-hex W3C trace id. */
export function newTraceId(): string {
	return crypto.randomBytes(16).toString("hex");
}

/** Generates a fresh 16-hex W3C span id. */
export function newSpanId(): string {
	return crypto.randomBytes(8).toString("hex");
}

/** Builds a W3C traceparent header from the active trace and a span id. */
export function formatTraceparent(traceId: string, spanId: string): string {
	return `00-${traceId}-${spanId}-01`;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Initialize the writer for this Pi process. Idempotent within a session --
 * subsequent calls with the same sessionId are no-ops. A new sessionId
 * replaces the prior writer (e.g. on session_start with reason="new").
 *
 * Reads `TRACEPARENT` from `process.env` to inherit parent context when this
 * Pi was spawned as a subagent. When absent, generates a fresh trace id.
 */
export function initializeRuntime(sessionId: string): TranscriptWriter | null {
	if (state.writer && state.sessionId === sessionId) return state.writer;

	const settings = loadSettings();
	state.settings = settings;
	state.sessionId = sessionId;

	const parentCtx = parseTraceparent(process.env.TRACEPARENT);
	if (parentCtx) {
		state.traceId = parentCtx.traceId;
		state.parentTraceId = parentCtx.spanId;
	} else {
		state.traceId = newTraceId();
		state.parentTraceId = undefined;
	}
	state.currentSpanId = newSpanId();
	state.turnIndex = 0;
	state.currentTurnId = "turn-0";
	state.currentMessageId = undefined;
	state.assistantMessageEmittedForTurn = false;

	if (!settings.enabled) {
		state.writer = null;
		return null;
	}

	try {
		state.writer = new TranscriptWriter({
			sessionId,
			settings,
		});
	} catch {
		state.writer = null;
	}
	return state.writer;
}

/** Returns the active writer, or null when tracing is disabled/unavailable. */
export function getWriter(): TranscriptWriter | null {
	return state.writer;
}

/** Returns the current W3C trace id (32 hex). Empty string before init. */
export function getTraceId(): string {
	return state.traceId;
}

/** Returns the current span id for this Pi session (16 hex). Empty string before init. */
export function getCurrentSpanId(): string {
	return state.currentSpanId;
}

/** Returns the inherited parent span id (set by TRACEPARENT), or undefined. */
export function getParentTraceId(): string | undefined {
	return state.parentTraceId;
}

/** Returns the current turn id. */
export function getCurrentTurnId(): string {
	return state.currentTurnId;
}

/** Returns the current message id, or undefined when no assistant message is in flight. */
export function getCurrentMessageId(): string | undefined {
	return state.currentMessageId;
}

/** Increments the turn counter and resets per-turn flags. Returns the new turn id. */
export function advanceTurn(): string {
	state.turnIndex += 1;
	state.currentTurnId = `turn-${state.turnIndex}`;
	state.assistantMessageEmittedForTurn = false;
	state.currentMessageId = undefined;
	return state.currentTurnId;
}

/** Sets the current message id (called from message_start). */
export function setCurrentMessageId(messageId: string | undefined): void {
	state.currentMessageId = messageId;
}

/** Returns true and sets the per-turn flag iff this is the first assistant_message for the turn. */
export function claimAssistantMessageEmission(): boolean {
	if (state.assistantMessageEmittedForTurn) return false;
	state.assistantMessageEmittedForTurn = true;
	return true;
}

/**
 * Resets all runtime state. Intended for tests so module-level singletons do
 * not bleed across describe blocks. Also called at session_shutdown so a
 * reload starts clean.
 */
export function resetRuntime(): void {
	state.writer = null;
	state.settings = null;
	state.sessionId = "";
	state.traceId = "";
	state.parentTraceId = undefined;
	state.currentSpanId = "";
	state.turnIndex = 0;
	state.currentTurnId = "turn-0";
	state.currentMessageId = undefined;
	state.assistantMessageEmittedForTurn = false;
}

// ---------------------------------------------------------------------------
// Convenience emit
// ---------------------------------------------------------------------------

/**
 * Build a base envelope from current runtime state. Callers may override any
 * field (commonly `event_type`, `message_id`, `tool_call_id`).
 */
export function buildEnvelope(
	overrides: Partial<TranscriptEvent["envelope"]> & { event_type: string },
): TranscriptEvent["envelope"] {
	return {
		session_id: state.sessionId,
		turn_id: overrides.turn_id ?? state.currentTurnId,
		message_id: overrides.message_id ?? state.currentMessageId,
		tool_call_id: overrides.tool_call_id,
		trace_id: overrides.trace_id ?? state.traceId,
		parent_trace_id: overrides.parent_trace_id ?? state.parentTraceId,
		event_type: overrides.event_type,
	};
}

/**
 * Append an event using the active writer. No-op when tracing is disabled.
 * Never throws -- writer.write() already swallows errors internally.
 */
export async function emit(
	envelopeOverrides: Partial<TranscriptEvent["envelope"]> & { event_type: string },
	payload: Record<string, unknown>,
): Promise<void> {
	const writer = state.writer;
	if (!writer) return;
	const envelope = buildEnvelope(envelopeOverrides);
	await writer.write({ envelope, payload });
}
