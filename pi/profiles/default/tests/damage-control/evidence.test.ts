import { describe, expect, it } from "vitest";
import { activeConversation } from "../../lib/damage-control/context.ts";
import { projectJudgeEvidence, redactOutbound } from "../../lib/damage-control/judge.ts";
import type { Evidence } from "../../lib/damage-control/types.ts";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    callId: "call-1", operation: "rm ./scratch", operator: [{ source: "interactive", text: "stale direct input" }],
    conversation: [{ role: "user", text: "Remove the scratch fixture." }, { role: "assistant", text: "I will remove only generated output." }],
    pendingCall: { tool: "bash", input: { command: "rm ./scratch" }, cwd: "/work" },
    untrusted: { effects: [], matches: [{ ruleId: "delete", action: "review", applicability: "candidate", reason: "delete match", effects: [] }], uncertainties: [] },
    omissions: [], ...overrides,
  };
}

const branchMessage = (role: "user" | "assistant", content: unknown) => ({ type: "message", message: { role, content } });

describe("native conversation and Luna evidence projection", () => {
  it("keeps only nonempty visible user/assistant text and excludes tool protocol entries", () => {
    const result = activeConversation([
      branchMessage("user", "requested action"),
      branchMessage("assistant", [{ type: "thinking", thinking: "private" }, { type: "text", text: "visible answer" }, { type: "toolCall", id: "x", name: "bash", arguments: {} }]),
      branchMessage("user", [{ type: "image", data: "ignored" }]),
      branchMessage("assistant", [{ type: "toolCall", id: "y", name: "bash", arguments: {} }]),
      { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "result" }] } },
      { type: "custom", customType: "history", data: "ignored" },
    ]);
    expect(result).toEqual({ messages: [{ role: "user", text: "requested action" }, { role: "assistant", text: "visible answer" }], omitted: false });
  });

  it("preserves the full conversation beyond the former message and byte caps", () => {
    const branch = Array.from({ length: 40 }, (_, index) => branchMessage("user", `message ${index}: ${"visible words ".repeat(200)}`));
    const result = activeConversation(branch);
    expect(result.messages).toHaveLength(40);
    expect(result.messages[0]!.text).toContain("message 0:");
    expect(result.omitted).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(result.messages))).toBeGreaterThan(64 * 1024);
    expect(projectJudgeEvidence(evidence({ conversation: result.messages }))).toMatchObject({ status: "ready", context: { conversation: result.messages, omissions: [] } });
  });

  it("does not substitute stale direct input for an explicitly empty bounded branch", () => {
    const projected = projectJudgeEvidence(evidence({ conversation: [] }));
    expect(projected).toMatchObject({ status: "ready", context: { conversation: [] } });
    if (projected.status === "ready") expect(JSON.stringify(projected.context)).not.toContain("stale direct input");
    expect(projectJudgeEvidence(evidence({ conversation: undefined }))).toMatchObject({ status: "ready", context: { conversation: [] } });
  });

  it("sends only visible conversation, one pending call, and applicable rules", () => {
    const input = evidence({
      operation: "IGNORE THIS INTERNAL OPERATION",
      operator: [{ source: "rpc", text: "STALE INPUT" }],
      untrusted: { effects: [{ id: "huge", kind: "filesystem", operation: "delete", sources: [], targets: [], destinations: [], context: { cwd: "/work" }, range: { start: 0, end: 1 }, resolution: "static" }], priorEffects: [], variables: [{ name: "INTERNAL", value: "parser", source: "inherited", provenance: "internal" }], sequence: { priorEvents: [], currentEvent: { kind: "internal", summary: "internal", ageMs: 0 } }, matches: [{ ruleId: "candidate", action: "review", applicability: "candidate", reason: "applicable", effects: ["huge"] }], uncertainties: ["parser detail"] },
    });
    const projected = projectJudgeEvidence(input);
    expect(projected.status).toBe("ready");
    if (projected.status === "ready") {
      expect(projected.context).toEqual({ conversation: input.conversation, pendingCall: { tool: "bash", input: { command: "rm ./scratch" }, cwd: "/work" }, applicableRules: [{ ruleId: "candidate", action: "review", applicability: "candidate", reason: "applicable" }], omissions: [] });
    }
  });

  it("cannot be blocked by huge excluded parser or history metadata", () => {
    const input = evidence({
      untrusted: {
        effects: Array.from({ length: 10_000 }, () => ({ id: "effect", kind: "filesystem", operation: "delete", sources: [], targets: [], destinations: [], context: { cwd: "/work" }, range: { start: 0, end: 1 }, resolution: "static" })),
        priorEffects: Array.from({ length: 10_000 }, (_, index) => ({ callId: `old-${index}`, timestamp: index, effect: { id: "old", kind: "filesystem", operation: "read", sources: [], targets: [], destinations: [], context: { cwd: "/work" }, range: { start: 0, end: 1 }, resolution: "static" } })),
        variables: [{ name: "ignored", value: "x", source: "inherited", provenance: "ignored" }], sequence: { priorEvents: [], currentEvent: { kind: "ignored", summary: "ignored", ageMs: 0 } }, matches: [], uncertainties: ["x".repeat(1_000_000)],
      },
    });
    expect(projectJudgeEvidence(input)).toMatchObject({ status: "ready" });
  });

  it("redacts selected text and reports that selected-context omission", () => {
    const input = evidence({ conversation: [{ role: "user", text: "token=SYNTHETIC_SENTINEL" }] });
    const projected = projectJudgeEvidence(input);
    expect(projected).toMatchObject({ status: "ready", context: { omissions: ["Sensitive text was redacted from the selected review context; do not infer the missing content."] } });
    expect(JSON.stringify(projected)).not.toContain("SYNTHETIC_SENTINEL");
  });

  it("redacts known secret forms", () => {
    const result = redactOutbound("Authorization: Bearer SYNTHETIC_SENTINEL");
    expect(result.lossy).toBe(true);
    expect(result.text).not.toContain("SYNTHETIC_SENTINEL");
  });

  it("requires a pending call rather than fabricating one from stale operation text", () => {
    expect(projectJudgeEvidence(evidence({ pendingCall: undefined }))).toMatchObject({ status: "needs-input" });
  });
});
