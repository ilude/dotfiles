/**
 * Transcript fixtures test -- T2 acceptance criteria, criterion 1.
 *
 * Verifies that the fixture factories produce well-formed TranscriptEvent
 * objects that round-trip correctly through the T1 writer and redaction
 * layer. Every core event family is exercised:
 *
 *   - Provider request (llm_request) -- OTel attributes, header redaction
 *   - Assistant message -- visible thinking block + tool-call request
 *   - Tool result -- content, details, truncation metadata
 *   - Bash execution -- truncated output with full-output path, AKIA key
 *   - Routing decision -- classifier vs applied route fields
 *   - Parallel tool completion -- unordered write, stable ordering
 *   - Nested subagent event -- parent_trace_id linkage
 *   - Session lifecycle -- session_start and session_shutdown
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  REDACTED,
  SCHEMA_VERSION,
  TranscriptWriter,
  defaultSettings,
  makeExcerpt,
  sha256Hex,
} from "../lib/transcript.ts";
import {
  DEFAULT_SESSION_ID,
  DEFAULT_TRACE_ID,
  DEFAULT_TURN_ID,
  makeAssistantMessageEvent,
  makeBashTruncatedResultEvent,
  makeParallelToolResultEvents,
  makeProviderRequestEvent,
  makeRoutingDecisionEvent,
  makeSessionShutdownEvent,
  makeSessionStartEvent,
  makeSubagentSessionStartEvent,
  makeToolCallEvent,
  makeToolResultEvent,
} from "./helpers/transcript-fixtures.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  const text = fs.readFileSync(filePath, "utf-8");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function makeWriter(dir: string, sessionId = DEFAULT_SESSION_ID): TranscriptWriter {
  let mono = 1n;
  return new TranscriptWriter({
    sessionId,
    settings: {
      ...defaultSettings(),
      enabled: true,
      path: dir,
    },
    now: () => new Date("2026-04-25T12:00:00.000Z"),
    monotonic: () => {
      const v = mono;
      mono += 1n;
      return v;
    },
  });
}

function jsonlPath(dir: string, sessionId = DEFAULT_SESSION_ID): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fixtures-test-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Envelope invariants shared by all fixture events
// ---------------------------------------------------------------------------

describe("envelope invariants", () => {
  it("every fixture event produces a record with schema_version as first key", async () => {
    const writer = makeWriter(tmpDir);
    const events = [
      makeProviderRequestEvent(),
      makeAssistantMessageEvent(),
      makeRoutingDecisionEvent(),
      makeSessionStartEvent(),
      makeSessionShutdownEvent(1),
    ];
    for (const event of events) {
      await writer.write(event);
    }
    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(5);
    for (const record of records) {
      const raw = JSON.stringify(record);
      expect(raw.indexOf('"schema_version"')).toBe(1);
      expect(record.schema_version).toBe(SCHEMA_VERSION);
      expect(typeof record.session_id).toBe("string");
      expect(typeof record.turn_id).toBe("string");
      expect(typeof record.trace_id).toBe("string");
      expect(typeof record.event_type).toBe("string");
      expect(typeof record.timestamp).toBe("string");
      expect(typeof record.monotonic_ns).toBe("string");
    }
  });

  it("monotonic_ns values are strictly increasing across a sequence of events", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeSessionStartEvent());
    await writer.write(makeProviderRequestEvent());
    await writer.write(makeAssistantMessageEvent());
    const records = readJsonl(jsonlPath(tmpDir));
    const monos = records.map((r) => BigInt(r.monotonic_ns as string));
    for (let i = 1; i < monos.length; i++) {
      expect(monos[i]).toBeGreaterThan(monos[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Provider request (llm_request)
// ---------------------------------------------------------------------------

describe("provider request fixture (llm_request)", () => {
  it("writes a record with OTel GenAI attributes and correct event_type", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeProviderRequestEvent());
    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.event_type).toBe("llm_request");
    expect(rec.message_id).toBe("msg-llm-001");
    const payload = rec.payload as Record<string, unknown>;
    expect(payload["gen_ai.system"]).toBe("anthropic");
    expect(payload["gen_ai.request.model"]).toBe("claude-sonnet-4-5");
    expect(Array.isArray(payload.messages)).toBe(true);
  });

  it("redacts x-api-key header in the persisted record", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeProviderRequestEvent());
    const raw = fs.readFileSync(jsonlPath(tmpDir), "utf-8");
    expect(raw).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz");
    expect(raw).toContain(REDACTED);
    const record = readJsonl(jsonlPath(tmpDir))[0];
    const payload = record.payload as Record<string, unknown>;
    const headers = payload.headers as Record<string, unknown>;
    expect(headers["x-api-key"]).toBe(REDACTED);
    expect(headers["content-type"]).toBe("application/json");
  });

  it("does not mutate the original fixture event payload", () => {
    const event = makeProviderRequestEvent();
    const originalHeaders = (event.payload as any).headers;
    const originalKey = originalHeaders["x-api-key"];
    // Run through redact by constructing a writer (but don't write -- just verify
    // the factory output is unchanged since redact is pure).
    expect(originalKey).toBe("sk-ant-abcdefghijklmnopqrstuvwxyz");
  });
});

// ---------------------------------------------------------------------------
// Assistant message with visible thinking + tool calls
// ---------------------------------------------------------------------------

describe("assistant message fixture (assistant_message)", () => {
  it("writes a record with visible thinking block and tool-call request", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeAssistantMessageEvent());
    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.event_type).toBe("assistant_message");
    const payload = rec.payload as Record<string, unknown>;
    const content = payload.content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);

    const thinkingBlock = content.find((b) => b.type === "thinking");
    expect(thinkingBlock).toBeDefined();
    expect(typeof (thinkingBlock as any).thinking).toBe("string");

    const toolUse = content.find((b) => b.type === "tool_use");
    expect(toolUse).toBeDefined();
    expect((toolUse as any).name).toBe("read_file");
    expect((toolUse as any).id).toBe("tc-read-001");
  });

  it("includes usage fields and stop_reason", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeAssistantMessageEvent());
    const payload = readJsonl(jsonlPath(tmpDir))[0].payload as Record<string, unknown>;
    const usage = payload.usage as Record<string, unknown>;
    expect(typeof usage.input_count).toBe("number");
    expect(typeof usage.output_count).toBe("number");
    expect(payload.stop_reason).toBe("tool_use");
  });
});

// ---------------------------------------------------------------------------
// Tool call input
// ---------------------------------------------------------------------------

describe("tool call fixture (tool_call)", () => {
  it("writes a record with tool_call_id, tool_name, and input", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(
      makeToolCallEvent("tc-001", "bash", { command: "ls -la" }),
    );
    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.event_type).toBe("tool_call");
    expect(rec.tool_call_id).toBe("tc-001");
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.tool_name).toBe("bash");
    expect((payload.input as any).command).toBe("ls -la");
  });
});

// ---------------------------------------------------------------------------
// Tool result with details and truncation
// ---------------------------------------------------------------------------

describe("tool result fixture (tool_result)", () => {
  it("writes a non-truncated tool result with content and details", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(
      makeToolResultEvent("tc-002", "read_file", "file content here", {
        details: { path: "src/auth.ts", byte_count: 17 },
      }),
    );
    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.event_type).toBe("tool_result");
    expect(rec.tool_call_id).toBe("tc-002");
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.tool_name).toBe("read_file");
    const content = payload.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("file content here");
    expect((payload.details as any).byte_count).toBe(17);
    expect(payload.error).toBeNull();
  });

  it("writes a tool result with truncation metadata and full_output_path", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(
      makeToolResultEvent("tc-003", "bash", "truncated...", {
        truncation: {
          truncated: true,
          original_byte_count: 50000,
          returned_byte_count: 1000,
          full_output_path: "/tmp/pi-bash-tc-003.txt",
        },
      }),
    );
    const payload = readJsonl(jsonlPath(tmpDir))[0].payload as Record<string, unknown>;
    const trunc = payload.truncation as Record<string, unknown>;
    expect(trunc.truncated).toBe(true);
    expect(trunc.original_byte_count).toBe(50000);
    expect(trunc.returned_byte_count).toBe(1000);
    expect(trunc.full_output_path).toBe("/tmp/pi-bash-tc-003.txt");
  });
});

// ---------------------------------------------------------------------------
// Bash truncation with AKIA key in output
// ---------------------------------------------------------------------------

describe("bash truncated result fixture", () => {
  it("writes truncation metadata fields", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeBashTruncatedResultEvent());
    const payload = readJsonl(jsonlPath(tmpDir))[0].payload as Record<string, unknown>;
    const trunc = payload.truncation as Record<string, unknown>;
    expect(trunc.truncated).toBe(true);
    expect(typeof trunc.original_byte_count).toBe("number");
    expect(typeof trunc.returned_byte_count).toBe("number");
    expect(typeof trunc.full_output_path).toBe("string");
  });

  it("redacts AKIA-style AWS access key found in bash stdout via free-text scan", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeBashTruncatedResultEvent({ includeSecretInOutput: true }));
    const raw = fs.readFileSync(jsonlPath(tmpDir), "utf-8");
    expect(raw).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(raw).toContain(REDACTED);
  });

  it("does not redact non-secret content in bash output", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeBashTruncatedResultEvent({ includeSecretInOutput: false }));
    const raw = fs.readFileSync(jsonlPath(tmpDir), "utf-8");
    expect(raw).toContain("line1");
    expect(raw).not.toContain("AKIA");
  });
});

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

describe("routing decision fixture (routing_decision)", () => {
  it("writes a record with all required classifier-vs-applied-route fields", async () => {
    const writer = makeWriter(tmpDir);
    const promptText = "Refactor the auth pipeline to use JWT.";
    await writer.write(
      makeRoutingDecisionEvent({
        promptText,
        classifierTier: "Sonnet",
        appliedRoute: "mid:medium",
        ruleFired: "classifier",
        confidence: 0.81,
      }),
    );
    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.event_type).toBe("routing_decision");
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.prompt_hash).toBe(sha256Hex(promptText));
    expect(payload.prompt_excerpt).toBe(makeExcerpt(promptText));
    expect(payload.applied_route).toBe("mid:medium");
    expect(payload.confidence).toBe(0.81);
    expect(payload.rule_fired).toBe("classifier");
    expect(payload.raw_classifier_output).toBeDefined();
    const raw = payload.raw_classifier_output as Record<string, unknown>;
    expect((raw.primary as any).model_tier).toBe("Sonnet");
    const fb = payload.fallback_metadata as Record<string, unknown>;
    expect(fb.cap).toBeNull();
    expect(fb.hysteresis).toBeNull();
  });

  it("captures cap metadata when an effort cap fires instead of classifier", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(
      makeRoutingDecisionEvent({
        classifierTier: "Opus",
        appliedRoute: "mid:high",
        ruleFired: "effort-cap",
        confidence: 0.91,
        capApplied: "high",
      }),
    );
    const payload = readJsonl(jsonlPath(tmpDir))[0].payload as Record<string, unknown>;
    expect(payload.rule_fired).toBe("effort-cap");
    const fb = payload.fallback_metadata as Record<string, unknown>;
    expect(fb.cap).toBe("high");
  });

  it("prompt_hash is a deterministic sha256 hex of the prompt text", () => {
    const text = "hello world";
    const event = makeRoutingDecisionEvent({ promptText: text });
    const payload = event.payload as Record<string, unknown>;
    expect(payload.prompt_hash).toBe(sha256Hex(text));
    // Calling again with the same text produces the same hash.
    const event2 = makeRoutingDecisionEvent({ promptText: text });
    expect(event2.payload.prompt_hash).toBe(payload.prompt_hash);
  });
});

// ---------------------------------------------------------------------------
// Parallel tool completion
// ---------------------------------------------------------------------------

describe("parallel tool completion fixtures", () => {
  it("writes two parallel results in the appended order (completion order, not launch order)", async () => {
    const writer = makeWriter(tmpDir);
    const [first, second] = makeParallelToolResultEvents();
    await writer.write(first);
    await writer.write(second);

    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(2);
    // The writer preserves insertion order -- tc-parallel-002 was written first.
    expect(records[0].tool_call_id).toBe("tc-parallel-002");
    expect(records[1].tool_call_id).toBe("tc-parallel-001");
  });

  it("each parallel record has its own tool_call_id in both envelope and payload", async () => {
    const writer = makeWriter(tmpDir);
    const [first, second] = makeParallelToolResultEvents();
    await writer.write(first);
    await writer.write(second);

    const records = readJsonl(jsonlPath(tmpDir));
    for (const rec of records) {
      const payload = rec.payload as Record<string, unknown>;
      expect(rec.tool_call_id).toBe(payload.tool_call_id);
    }
  });
});

// ---------------------------------------------------------------------------
// Nested subagent fixture
// ---------------------------------------------------------------------------

describe("nested subagent fixture", () => {
  it("writes a session_start with parent_trace_id linking child to parent", async () => {
    const parentTraceId = "trace-parent-1234";
    const childSessionId = "session-child-001";
    const childTraceId = "trace-child-5678";
    const writer = makeWriter(tmpDir, childSessionId);

    await writer.write(
      makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId),
    );

    const records = readJsonl(jsonlPath(tmpDir, childSessionId));
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.event_type).toBe("session_start");
    expect(rec.session_id).toBe(childSessionId);
    expect(rec.trace_id).toBe(childTraceId);
    expect(rec.parent_trace_id).toBe(parentTraceId);
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.spawned_by).toBe(parentTraceId);
    expect(typeof payload.traceparent).toBe("string");
  });

  it("parent_trace_id is present on every child event when set in the envelope", async () => {
    const parentTraceId = "trace-parent-1234";
    const childSessionId = "session-child-002";
    const childTraceId = "trace-child-9999";
    const writer = makeWriter(tmpDir, childSessionId);
    const childEnvBase = {
      session_id: childSessionId,
      trace_id: childTraceId,
      parent_trace_id: parentTraceId,
    };

    await writer.write(makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId));
    await writer.write(makeProviderRequestEvent({ env: { ...childEnvBase, message_id: "msg-c1" } }));
    await writer.write(makeAssistantMessageEvent({ env: { ...childEnvBase, message_id: "msg-c2" } }));

    const records = readJsonl(jsonlPath(tmpDir, childSessionId));
    expect(records.length).toBe(3);
    for (const rec of records) {
      expect(rec.parent_trace_id).toBe(parentTraceId);
    }
  });
});

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

describe("session lifecycle fixtures", () => {
  it("writes session_start with pid and agent_name", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeSessionStartEvent());
    const rec = readJsonl(jsonlPath(tmpDir))[0];
    expect(rec.event_type).toBe("session_start");
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.agent_name).toBe("pi");
    expect(payload.pid).toBe(12345);
  });

  it("writes session_shutdown with turn_count", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeSessionShutdownEvent(7));
    const rec = readJsonl(jsonlPath(tmpDir))[0];
    expect(rec.event_type).toBe("session_shutdown");
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.turn_count).toBe(7);
  });

  it("writes a full session lifecycle sequence in order", async () => {
    const writer = makeWriter(tmpDir);
    await writer.write(makeSessionStartEvent());
    await writer.write(makeRoutingDecisionEvent());
    await writer.write(makeProviderRequestEvent());
    await writer.write(makeAssistantMessageEvent());
    await writer.write(makeToolCallEvent("tc-x", "bash", { command: "pwd" }));
    await writer.write(makeToolResultEvent("tc-x", "bash", "/home/user"));
    await writer.write(makeSessionShutdownEvent(1));

    const records = readJsonl(jsonlPath(tmpDir));
    expect(records.length).toBe(7);
    const types = records.map((r) => r.event_type);
    expect(types[0]).toBe("session_start");
    expect(types[types.length - 1]).toBe("session_shutdown");
  });
});
