/**
 * Transcript correlation tests -- T2 acceptance criteria, criterion 1.
 *
 * Covers the three explicit correlation contracts from the plan:
 *
 *   1. Multi-turn session_id/turn_id correlation -- every event in a
 *      session shares session_id; turn_id increments per turn and is
 *      stable within the same turn.
 *
 *   2. Parallel tool_call_id ordering -- parallel tool completions land
 *      in write-order (completion order, not launch order); each record's
 *      envelope tool_call_id matches its payload tool_call_id.
 *
 *   3. Nested subagent parent_trace_id linkage -- the child trace file's
 *      events carry parent_trace_id pointing at the parent's span; the
 *      child session_id differs from the parent session_id.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  TranscriptWriter,
  defaultSettings,
} from "../lib/transcript.ts";
import {
  DEFAULT_SESSION_ID,
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

function makeWriter(dir: string, sessionId: string): TranscriptWriter {
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

function jsonlPath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-correlation-test-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Multi-turn session_id / turn_id correlation
// ---------------------------------------------------------------------------

describe("multi-turn session_id and turn_id correlation", () => {
  it("all events in a session share the same session_id", async () => {
    const sessionId = "corr-session-001";
    const writer = makeWriter(tmpDir, sessionId);

    await writer.write(makeSessionStartEvent({ session_id: sessionId, turn_id: "turn-0" }));
    for (let turn = 1; turn <= 3; turn++) {
      const envBase = { session_id: sessionId, turn_id: `turn-${turn}` };
      await writer.write(makeRoutingDecisionEvent({ env: envBase }));
      await writer.write(makeProviderRequestEvent({ env: { ...envBase, message_id: `msg-${turn}` } }));
      await writer.write(makeAssistantMessageEvent({ env: { ...envBase, message_id: `msg-resp-${turn}` } }));
    }
    await writer.write(makeSessionShutdownEvent(3, { session_id: sessionId, turn_id: "turn-3" }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records.length).toBe(11); // 1 start + 3*(routing+request+response) + 1 shutdown

    for (const rec of records) {
      expect(rec.session_id).toBe(sessionId);
    }
  });

  it("turn_id is stable within a turn and advances between turns", async () => {
    const sessionId = "corr-session-002";
    const writer = makeWriter(tmpDir, sessionId);

    const turn1Env = { session_id: sessionId, turn_id: "turn-1" };
    const turn2Env = { session_id: sessionId, turn_id: "turn-2" };

    // Turn 1: routing + request + response
    await writer.write(makeRoutingDecisionEvent({ env: turn1Env }));
    await writer.write(makeProviderRequestEvent({ env: { ...turn1Env, message_id: "msg-1" } }));
    await writer.write(makeAssistantMessageEvent({ env: { ...turn1Env, message_id: "msg-resp-1" } }));

    // Turn 2: routing + request + response
    await writer.write(makeRoutingDecisionEvent({ env: turn2Env }));
    await writer.write(makeProviderRequestEvent({ env: { ...turn2Env, message_id: "msg-2" } }));
    await writer.write(makeAssistantMessageEvent({ env: { ...turn2Env, message_id: "msg-resp-2" } }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records.length).toBe(6);

    const turn1Records = records.filter((r) => r.turn_id === "turn-1");
    const turn2Records = records.filter((r) => r.turn_id === "turn-2");
    expect(turn1Records.length).toBe(3);
    expect(turn2Records.length).toBe(3);
  });

  it("message_id links the llm_request to its assistant_message within a turn", async () => {
    const sessionId = "corr-session-003";
    const writer = makeWriter(tmpDir, sessionId);
    const msgId = "msg-link-001";
    const env = { session_id: sessionId, turn_id: "turn-1", message_id: msgId };

    await writer.write(makeProviderRequestEvent({ env }));
    await writer.write(makeAssistantMessageEvent({ env }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records.length).toBe(2);
    expect(records[0].message_id).toBe(msgId);
    expect(records[1].message_id).toBe(msgId);
    expect(records[0].event_type).toBe("llm_request");
    expect(records[1].event_type).toBe("assistant_message");
  });

  it("tool_call_id links tool_call to its tool_result within a turn", async () => {
    const sessionId = "corr-session-004";
    const writer = makeWriter(tmpDir, sessionId);
    const tcId = "tc-link-001";
    const envBase = { session_id: sessionId, turn_id: "turn-1" };

    await writer.write(makeToolCallEvent(tcId, "bash", { command: "echo hi" }, envBase));
    await writer.write(makeToolResultEvent(tcId, "bash", "hi", { env: envBase }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records.length).toBe(2);
    expect(records[0].tool_call_id).toBe(tcId);
    expect(records[1].tool_call_id).toBe(tcId);
    expect(records[0].event_type).toBe("tool_call");
    expect(records[1].event_type).toBe("tool_result");
    // Payload also carries the tool_call_id for cross-field lookup.
    expect((records[0].payload as any).tool_call_id).toBe(tcId);
    expect((records[1].payload as any).tool_call_id).toBe(tcId);
  });

  it("routing_decision record precedes llm_request in the same turn", async () => {
    const sessionId = "corr-session-005";
    const writer = makeWriter(tmpDir, sessionId);
    const envBase = { session_id: sessionId, turn_id: "turn-1" };

    await writer.write(makeRoutingDecisionEvent({ env: envBase }));
    await writer.write(makeProviderRequestEvent({ env: { ...envBase, message_id: "msg-1" } }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records[0].event_type).toBe("routing_decision");
    expect(records[1].event_type).toBe("llm_request");
    expect(records[0].turn_id).toBe(records[1].turn_id);
    expect(records[0].session_id).toBe(records[1].session_id);
  });

  it("exactly one assistant_message record per turn (no streaming duplicates)", async () => {
    const sessionId = "corr-session-006";
    const writer = makeWriter(tmpDir, sessionId);
    const turns = [1, 2, 3];

    for (const turn of turns) {
      const env = { session_id: sessionId, turn_id: `turn-${turn}`, message_id: `msg-${turn}` };
      await writer.write(makeProviderRequestEvent({ env }));
      // Simulate one assistant_message per turn -- never per streaming token.
      await writer.write(makeAssistantMessageEvent({ env }));
    }

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    const assistantMessages = records.filter((r) => r.event_type === "assistant_message");
    expect(assistantMessages.length).toBe(turns.length);
    // Each belongs to a distinct turn.
    const seenTurnIds = new Set(assistantMessages.map((r) => r.turn_id));
    expect(seenTurnIds.size).toBe(turns.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Parallel tool_call_id ordering
// ---------------------------------------------------------------------------

describe("parallel tool_call_id ordering", () => {
  it("preserves write-order (completion order) for parallel results", async () => {
    const sessionId = "corr-parallel-001";
    const writer = makeWriter(tmpDir, sessionId);
    const [first, second] = makeParallelToolResultEvents({
      session_id: sessionId,
      turn_id: "turn-1",
    });

    // tc-parallel-002 completes first (written first), tc-parallel-001 second.
    await writer.write(first);
    await writer.write(second);

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records.length).toBe(2);
    expect(records[0].tool_call_id).toBe("tc-parallel-002");
    expect(records[1].tool_call_id).toBe("tc-parallel-001");
  });

  it("monotonic_ns differentiates parallel records even within the same turn", async () => {
    const sessionId = "corr-parallel-002";
    const writer = makeWriter(tmpDir, sessionId);
    const [first, second] = makeParallelToolResultEvents({
      session_id: sessionId,
      turn_id: "turn-1",
    });

    await writer.write(first);
    await writer.write(second);

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    const monos = records.map((r) => BigInt(r.monotonic_ns as string));
    expect(monos[0]).toBeLessThan(monos[1]);
  });

  it("envelope tool_call_id matches payload tool_call_id for each parallel record", async () => {
    const sessionId = "corr-parallel-003";
    const writer = makeWriter(tmpDir, sessionId);
    const [first, second] = makeParallelToolResultEvents({
      session_id: sessionId,
      turn_id: "turn-1",
    });

    await writer.write(first);
    await writer.write(second);

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    for (const rec of records) {
      const payload = rec.payload as Record<string, unknown>;
      expect(rec.tool_call_id).toBe(payload.tool_call_id);
    }
  });

  it("mixed tool types can run in parallel and are correlated by tool_call_id", async () => {
    const sessionId = "corr-parallel-004";
    const writer = makeWriter(tmpDir, sessionId);
    const envBase = { session_id: sessionId, turn_id: "turn-1" };

    // Dispatch two tools in parallel (different types).
    await writer.write(makeToolCallEvent("tc-bash-p1", "bash", { command: "ls" }, envBase));
    await writer.write(makeToolCallEvent("tc-read-p1", "read_file", { path: "README.md" }, envBase));

    // Results arrive out of launch order.
    await writer.write(makeToolResultEvent("tc-read-p1", "read_file", "# README", { env: envBase, duration_ms: 5 }));
    await writer.write(makeToolResultEvent("tc-bash-p1", "bash", "file.txt", { env: envBase, duration_ms: 50 }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    expect(records.length).toBe(4);

    const callRecords = records.filter((r) => r.event_type === "tool_call");
    const resultRecords = records.filter((r) => r.event_type === "tool_result");
    expect(callRecords.length).toBe(2);
    expect(resultRecords.length).toBe(2);

    // Each call has a matching result with the same tool_call_id.
    for (const call of callRecords) {
      const matchingResult = resultRecords.find(
        (r) => r.tool_call_id === call.tool_call_id,
      );
      expect(matchingResult).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Nested subagent parent_trace_id linkage
// ---------------------------------------------------------------------------

describe("nested subagent parent_trace_id linkage", () => {
  it("child trace file uses a different session_id from the parent", async () => {
    const parentSessionId = "session-parent-001";
    const childSessionId = "session-child-001";
    const parentTraceId = "trace-parent-aaaa";
    const childTraceId = "trace-child-bbbb";

    const parentWriter = makeWriter(tmpDir, parentSessionId);
    const childWriter = makeWriter(tmpDir, childSessionId);

    await parentWriter.write(
      makeSessionStartEvent({ session_id: parentSessionId, turn_id: "turn-0", trace_id: parentTraceId }),
    );
    await childWriter.write(
      makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId),
    );

    expect(fs.existsSync(jsonlPath(tmpDir, parentSessionId))).toBe(true);
    expect(fs.existsSync(jsonlPath(tmpDir, childSessionId))).toBe(true);

    const parentRecords = readJsonl(jsonlPath(tmpDir, parentSessionId));
    const childRecords = readJsonl(jsonlPath(tmpDir, childSessionId));

    expect(parentRecords[0].session_id).toBe(parentSessionId);
    expect(childRecords[0].session_id).toBe(childSessionId);
    expect(parentRecords[0].session_id).not.toBe(childRecords[0].session_id);
  });

  it("child trace events carry parent_trace_id matching the parent span", async () => {
    const parentTraceId = "trace-parent-cccc";
    const childSessionId = "session-child-002";
    const childTraceId = "trace-child-dddd";

    const childWriter = makeWriter(tmpDir, childSessionId);
    const childEnvBase = {
      session_id: childSessionId,
      turn_id: "turn-1",
      trace_id: childTraceId,
      parent_trace_id: parentTraceId,
    };

    await childWriter.write(
      makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId),
    );
    await childWriter.write(
      makeProviderRequestEvent({ env: { ...childEnvBase, message_id: "msg-c1" } }),
    );
    await childWriter.write(
      makeAssistantMessageEvent({ env: { ...childEnvBase, message_id: "msg-c2" } }),
    );
    await childWriter.write(
      makeToolCallEvent("tc-c1", "bash", { command: "ls" }, childEnvBase),
    );
    await childWriter.write(
      makeToolResultEvent("tc-c1", "bash", "file.txt", { env: childEnvBase }),
    );

    const records = readJsonl(jsonlPath(tmpDir, childSessionId));
    expect(records.length).toBe(5);

    for (const rec of records) {
      expect(rec.parent_trace_id).toBe(parentTraceId);
    }
  });

  it("child session_start payload carries traceparent and spawned_by fields", async () => {
    const parentTraceId = "trace-parent-eeee";
    const childSessionId = "session-child-003";
    const childTraceId = "trace-child-ffff";

    const childWriter = makeWriter(tmpDir, childSessionId);
    await childWriter.write(
      makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId),
    );

    const record = readJsonl(jsonlPath(tmpDir, childSessionId))[0];
    const payload = record.payload as Record<string, unknown>;
    expect(typeof payload.traceparent).toBe("string");
    expect((payload.traceparent as string).startsWith("00-")).toBe(true);
    expect(payload.spawned_by).toBe(parentTraceId);
  });

  it("parent trace file does not contain child session_id (traces are separate files)", async () => {
    const parentSessionId = "session-parent-002";
    const childSessionId = "session-child-004";
    const parentTraceId = "trace-parent-gggg";
    const childTraceId = "trace-child-hhhh";

    const parentWriter = makeWriter(tmpDir, parentSessionId);
    const childWriter = makeWriter(tmpDir, childSessionId);

    await parentWriter.write(makeSessionStartEvent({ session_id: parentSessionId, turn_id: "turn-0" }));
    await parentWriter.write(makeProviderRequestEvent({
      env: { session_id: parentSessionId, turn_id: "turn-1", message_id: "msg-p1" },
    }));

    await childWriter.write(
      makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId),
    );
    await childWriter.write(
      makeProviderRequestEvent({
        env: {
          session_id: childSessionId,
          turn_id: "turn-1",
          trace_id: childTraceId,
          parent_trace_id: parentTraceId,
          message_id: "msg-c1",
        },
      }),
    );

    const parentRaw = fs.readFileSync(jsonlPath(tmpDir, parentSessionId), "utf-8");
    expect(parentRaw).not.toContain(childSessionId);

    const childRecords = readJsonl(jsonlPath(tmpDir, childSessionId));
    expect(childRecords.every((r) => r.session_id === childSessionId)).toBe(true);
  });

  it("bash truncated output in child trace is also redacted", async () => {
    const parentTraceId = "trace-parent-iiii";
    const childSessionId = "session-child-005";
    const childTraceId = "trace-child-jjjj";

    const childWriter = makeWriter(tmpDir, childSessionId);
    await childWriter.write(
      makeBashTruncatedResultEvent({
        includeSecretInOutput: true,
        env: {
          session_id: childSessionId,
          turn_id: "turn-1",
          trace_id: childTraceId,
          parent_trace_id: parentTraceId,
        },
      }),
    );

    const raw = fs.readFileSync(jsonlPath(tmpDir, childSessionId), "utf-8");
    expect(raw).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(raw).toContain("[REDACTED]");
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: trace_id consistency within a single writer instance
// ---------------------------------------------------------------------------

describe("trace_id consistency", () => {
  it("events from the same session share the same trace_id when all use the session default", async () => {
    const sessionId = DEFAULT_SESSION_ID;
    const traceId = "trace-shared-1111";
    const writer = makeWriter(tmpDir, sessionId);
    const envBase = { session_id: sessionId, trace_id: traceId };

    await writer.write(makeSessionStartEvent({ ...envBase, turn_id: "turn-0" }));
    await writer.write(makeRoutingDecisionEvent({ env: { ...envBase, turn_id: "turn-1" } }));
    await writer.write(makeProviderRequestEvent({ env: { ...envBase, turn_id: "turn-1", message_id: "m1" } }));
    await writer.write(makeAssistantMessageEvent({ env: { ...envBase, turn_id: "turn-1", message_id: "m1" } }));

    const records = readJsonl(jsonlPath(tmpDir, sessionId));
    for (const rec of records) {
      expect(rec.trace_id).toBe(traceId);
    }
  });

  it("subagent assigns its own child trace_id distinct from the parent trace_id", async () => {
    const parentTraceId = "trace-parent-2222";
    const childTraceId = "trace-child-3333";
    const childSessionId = "session-child-006";

    const childWriter = makeWriter(tmpDir, childSessionId);
    await childWriter.write(
      makeSubagentSessionStartEvent(parentTraceId, childSessionId, childTraceId),
    );

    const record = readJsonl(jsonlPath(tmpDir, childSessionId))[0];
    expect(record.trace_id).toBe(childTraceId);
    expect(record.parent_trace_id).toBe(parentTraceId);
    expect(record.trace_id).not.toBe(record.parent_trace_id);
  });
});
