/**
 * Deterministic fixture factories for Pi transcript sidecar trace events.
 *
 * These factories build typed event objects that align exactly with the
 * schema exported by pi/lib/transcript.ts (T1). They cover every core
 * event family expected from wave-2 (T3) integration work:
 *
 *   - Provider request (llm_request) with OTel GenAI attributes
 *   - Assistant message with visible thinking blocks + tool-call requests
 *   - Tool result with details, truncation metadata, and full-output path
 *   - Bash execution with truncated output and full-output spill reference
 *   - Routing decision with classifier-vs-applied-route fields
 *   - Parallel tool completion (unordered, ordered by tool_call_id)
 *   - Nested subagent event (carries parent_trace_id)
 *   - Session lifecycle (session_start, session_shutdown)
 *
 * All factories return a `TranscriptEvent` that can be passed directly to
 * `TranscriptWriter.write()` without translation code.
 */

import type {
  RoutingDecisionPayload,
  TranscriptEvent,
} from "../../lib/transcript.ts";
import { makeExcerpt, sha256Hex } from "../../lib/transcript.ts";

// ---------------------------------------------------------------------------
// Shared envelope defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SESSION_ID = "fixture-session-001";
export const DEFAULT_TURN_ID = "turn-1";
export const DEFAULT_TRACE_ID = "trace-0000-aaaa-bbbb-cccc";

/** Minimal base envelope fields shared by all fixtures. */
export interface BaseEnvelopeFields {
  session_id?: string;
  turn_id?: string;
  trace_id?: string;
  parent_trace_id?: string;
  message_id?: string;
  tool_call_id?: string;
  monotonic_ns?: bigint;
}

function base(
  event_type: string,
  fields: BaseEnvelopeFields = {},
): TranscriptEvent["envelope"] {
  return {
    session_id: fields.session_id ?? DEFAULT_SESSION_ID,
    turn_id: fields.turn_id ?? DEFAULT_TURN_ID,
    trace_id: fields.trace_id ?? DEFAULT_TRACE_ID,
    parent_trace_id: fields.parent_trace_id,
    message_id: fields.message_id,
    tool_call_id: fields.tool_call_id,
    event_type,
    monotonic_ns: fields.monotonic_ns,
  };
}

// ---------------------------------------------------------------------------
// Provider request (llm_request)
// ---------------------------------------------------------------------------

/** Represents a provider request payload with OTel GenAI attributes. */
export interface ProviderRequestPayload {
  "gen_ai.system": string;
  "gen_ai.request.model": string;
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  headers?: Record<string, string>;
}

/**
 * Builds an `llm_request` event fixture.
 *
 * Includes a realistic OTel-aligned payload and a header map with a
 * redaction-target key (x-api-key) so test suites can verify that the
 * redaction layer scrubs it before writing.
 */
export function makeProviderRequestEvent(
  overrides: {
    env?: BaseEnvelopeFields;
    payload?: Partial<ProviderRequestPayload>;
  } = {},
): TranscriptEvent {
  const payload: ProviderRequestPayload = {
    "gen_ai.system": "anthropic",
    "gen_ai.request.model": "claude-sonnet-4-5",
    messages: [
      { role: "user", content: "Refactor the auth pipeline to use JWT." },
    ],
    temperature: 1,
    max_tokens: 16384,
    headers: {
      "x-api-key": "sk-ant-abcdefghijklmnopqrstuvwxyz",
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    ...overrides.payload,
  };
  return {
    envelope: base("llm_request", {
      message_id: "msg-llm-001",
      ...overrides.env,
    }),
    payload: payload as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Assistant message with visible thinking + tool calls
// ---------------------------------------------------------------------------

/** A single visible thinking block (model-exposed, not hidden CoT). */
export interface VisibleThinkingBlock {
  type: "thinking";
  thinking: string;
}

/** A tool-call request embedded in an assistant message. */
export interface ToolCallRequest {
  id: string;
  type: "tool_use";
  name: string;
  input: Record<string, unknown>;
}

/** OTel GenAI usage counts. Field names use `_count` suffix rather than
 *  `_tokens` to avoid the `token` substring matching the redaction key
 *  pattern. T3 wire-up maps these to the canonical OTel attribute names
 *  (`gen_ai.usage.input_tokens`) when emitting to an OTel collector. */
export interface GenAiUsage {
  /** Number of input (prompt) tokens consumed. */
  input_count: number;
  /** Number of output (completion) tokens produced. */
  output_count: number;
}

/** Payload shape for an `assistant_message` event. */
export interface AssistantMessagePayload {
  content: Array<
    | VisibleThinkingBlock
    | ToolCallRequest
    | { type: "text"; text: string }
  >;
  usage: GenAiUsage;
  stop_reason: string;
}

/**
 * Builds an `assistant_message` event fixture with a visible thinking block
 * and one tool-call request embedded in the content array.
 *
 * This is ONE record per turn (message_end), never per-token.
 */
export function makeAssistantMessageEvent(
  overrides: {
    env?: BaseEnvelopeFields;
    payload?: Partial<AssistantMessagePayload>;
  } = {},
): TranscriptEvent {
  const payload: AssistantMessagePayload = {
    content: [
      {
        type: "thinking",
        thinking:
          "The user wants JWT migration. I should read the current auth module first.",
      },
      {
        type: "tool_use",
        id: "tc-read-001",
        name: "read_file",
        input: { path: "src/auth/session.ts" },
      },
    ],
    usage: { input_count: 1024, output_count: 312 },
    stop_reason: "tool_use",
    ...overrides.payload,
  };
  return {
    envelope: base("assistant_message", {
      message_id: "msg-assistant-001",
      ...overrides.env,
    }),
    payload: payload as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Tool call input
// ---------------------------------------------------------------------------

/** Payload shape for a `tool_call` event. */
export interface ToolCallPayload {
  tool_call_id: string;
  tool_name: string;
  input: Record<string, unknown>;
}

/**
 * Builds a `tool_call` event fixture.
 */
export function makeToolCallEvent(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  envOverrides: BaseEnvelopeFields = {},
): TranscriptEvent {
  const payload: ToolCallPayload = { tool_call_id: toolCallId, tool_name: toolName, input };
  return {
    envelope: base("tool_call", {
      tool_call_id: toolCallId,
      ...envOverrides,
    }),
    payload: payload as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Tool result with details and truncation metadata
// ---------------------------------------------------------------------------

/** Content block within a tool result. */
export interface ToolResultContentBlock {
  type: "text";
  text: string;
}

/** Metadata attached when Pi truncates bash/tool output. */
export interface TruncationDetails {
  truncated: boolean;
  original_byte_count: number;
  returned_byte_count: number;
  /** Path to the full output artifact on disk, if spilled. */
  full_output_path?: string;
}

/** Payload shape for a `tool_result` event. */
export interface ToolResultPayload {
  tool_call_id: string;
  tool_name: string;
  content: ToolResultContentBlock[];
  /** Structured details from the tool runner -- may include stdout/stderr. */
  details?: Record<string, unknown>;
  truncation?: TruncationDetails;
  error?: string | null;
  duration_ms?: number;
}

/**
 * Builds a `tool_result` event fixture for a standard (non-truncated)
 * file-read tool result.
 */
export function makeToolResultEvent(
  toolCallId: string,
  toolName: string,
  content: string,
  overrides: {
    env?: BaseEnvelopeFields;
    details?: Record<string, unknown>;
    truncation?: TruncationDetails;
    error?: string;
    duration_ms?: number;
  } = {},
): TranscriptEvent {
  const payload: ToolResultPayload = {
    tool_call_id: toolCallId,
    tool_name: toolName,
    content: [{ type: "text", text: content }],
    details: overrides.details,
    truncation: overrides.truncation,
    error: overrides.error ?? null,
    duration_ms: overrides.duration_ms ?? 42,
  };
  return {
    envelope: base("tool_result", {
      tool_call_id: toolCallId,
      ...overrides.env,
    }),
    payload: payload as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Bash execution with truncation and full-output spill
// ---------------------------------------------------------------------------

/**
 * Builds a `tool_result` event fixture for a bash execution where Pi
 * truncated the output. The `details.stdout` contains the truncated text
 * and `truncation` carries the original size plus a full-output path.
 *
 * Also embeds a fake AKIA-style key in `details.stdout` so the redaction
 * path can be validated in tests.
 */
export function makeBashTruncatedResultEvent(
  overrides: {
    env?: BaseEnvelopeFields;
    includeSecretInOutput?: boolean;
  } = {},
): TranscriptEvent {
  const rawStdout = overrides.includeSecretInOutput
    ? "AKIAABCDEFGHIJKLMNOP\nline2\nline3"
    : "line1\nline2\nline3";

  const payload: ToolResultPayload = {
    tool_call_id: "tc-bash-001",
    tool_name: "bash",
    content: [{ type: "text", text: rawStdout.slice(0, 20) + "...[truncated]" }],
    details: {
      stdout: rawStdout,
      stderr: "",
      exit_code: 0,
    },
    truncation: {
      truncated: true,
      original_byte_count: rawStdout.length,
      returned_byte_count: 20,
      full_output_path: "/tmp/pi-bash-tc-bash-001.txt",
    },
    error: null,
    duration_ms: 134,
  };
  return {
    envelope: base("tool_result", {
      tool_call_id: "tc-bash-001",
      ...overrides.env,
    }),
    payload: payload as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

/**
 * Builds a `routing_decision` event fixture with classifier-vs-applied-route
 * fields. The `raw_classifier_output` contains the raw ConfGate recommendation
 * while `applied_route` may differ due to policy/cap/hysteresis.
 */
export function makeRoutingDecisionEvent(
  overrides: {
    env?: BaseEnvelopeFields;
    promptText?: string;
    classifierTier?: string;
    appliedRoute?: string;
    ruleFired?: string;
    confidence?: number;
    capApplied?: string | null;
  } = {},
): TranscriptEvent {
  const promptText =
    overrides.promptText ?? "Refactor the auth pipeline to use JWT.";
  const decision: RoutingDecisionPayload = {
    prompt_hash: sha256Hex(promptText),
    prompt_excerpt: makeExcerpt(promptText),
    raw_classifier_output: {
      primary: {
        model_tier: overrides.classifierTier ?? "Sonnet",
        effort: "medium",
      },
      confidence: overrides.confidence ?? 0.81,
      ensemble_rule: "lgb-confident",
    },
    applied_route: overrides.appliedRoute ?? "mid:medium",
    confidence: overrides.confidence ?? 0.81,
    rule_fired: overrides.ruleFired ?? "classifier",
    fallback_metadata: {
      cap: overrides.capApplied ?? null,
      hysteresis: null,
    },
  };
  return {
    envelope: base("routing_decision", overrides.env),
    payload: decision as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Parallel tool completion fixtures
// ---------------------------------------------------------------------------

/**
 * Returns two tool-result events that were dispatched in parallel and
 * completed in non-launch order (tc-parallel-002 finishes before tc-parallel-001).
 * Callers can verify that the writer preserves the order in which events
 * are appended rather than the order in which tools were launched.
 */
export function makeParallelToolResultEvents(
  envOverrides: BaseEnvelopeFields = {},
): [TranscriptEvent, TranscriptEvent] {
  const first = makeToolResultEvent(
    "tc-parallel-002",
    "read_file",
    "content of file B",
    { env: envOverrides, duration_ms: 30 },
  );
  const second = makeToolResultEvent(
    "tc-parallel-001",
    "read_file",
    "content of file A",
    { env: envOverrides, duration_ms: 80 },
  );
  return [first, second];
}

// ---------------------------------------------------------------------------
// Nested subagent event
// ---------------------------------------------------------------------------

/**
 * Builds a session_start event fixture for a nested subagent that carries
 * the parent's span ID in `parent_trace_id`. Tests use this to verify that
 * a child trace file correctly references the parent trace.
 */
export function makeSubagentSessionStartEvent(
  parentTraceId: string,
  childSessionId: string,
  childTraceId: string,
  envOverrides: BaseEnvelopeFields = {},
): TranscriptEvent {
  return {
    envelope: base("session_start", {
      session_id: childSessionId,
      turn_id: "turn-0",
      trace_id: childTraceId,
      parent_trace_id: parentTraceId,
      ...envOverrides,
    }),
    payload: {
      agent_name: "subagent-worker",
      spawned_by: parentTraceId,
      traceparent: `00-${childTraceId.replace(/-/g, "")}-${parentTraceId.slice(0, 16).replace(/-/g, "")}-01`,
    },
  };
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Builds a `session_start` event for the primary (non-subagent) session. */
export function makeSessionStartEvent(
  envOverrides: BaseEnvelopeFields = {},
): TranscriptEvent {
  return {
    envelope: base("session_start", {
      turn_id: "turn-0",
      ...envOverrides,
    }),
    payload: {
      agent_name: "pi",
      pid: 12345,
    },
  };
}

/** Builds a `session_shutdown` event. */
export function makeSessionShutdownEvent(
  turnCount: number,
  envOverrides: BaseEnvelopeFields = {},
): TranscriptEvent {
  return {
    envelope: base("session_shutdown", {
      turn_id: `turn-${turnCount}`,
      ...envOverrides,
    }),
    payload: {
      turn_count: turnCount,
    },
  };
}
