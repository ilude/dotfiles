import { describe, expect, it } from "vitest";
import type { ChildRecord } from "../lib/subagents/rpc.ts";
import { renderSubagentCall, renderSubagentControlCall, renderSubagentMessage, renderSubagentResult } from "../lib/subagents/presentation.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
const base: ChildRecord = {
  id: "child-12345678", agent: "explorer", displayName: "Clara", assignment: "Inspect the workspace and report the relevant files.",
  model: "openai-codex/test", effort: "low", cwd: "/worktree/example", skills: ["testing"], origin: "origin",
  surface: "headless", status: "running", retained: false, userOwned: false, turns: 0,
  createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:02.000Z", assignmentStartedAt: "2026-09-08T00:00:00.000Z",
  lastActivityAt: "2026-09-08T00:00:01.000Z", processState: "running", transportState: "connected", phase: "tool", toolName: "read",
};
function plain(component: any, width: number) { return component.render(width).join("\n").replace(/\x1b\[[0-9;]*m/g, ""); }
function result(record: Partial<ChildRecord>, expanded = false) { return renderSubagentResult({ content: [{ type: "text", text: "internal JSON should not be primary" }], details: { ...base, ...record } }, { expanded }, theme, {}); }

describe("subagent presentation", () => {
  it("renders a readable launch and control call at narrow and normal widths", () => {
    const call = renderSubagentCall({ agent: "explorer", instructions: "Find the implementation", surface: "visible", background: true }, theme, {});
    expect(plain(call, 36)).toContain("Assignment: Find the implementation");
    expect(plain(call, 120)).toContain("surface=visible");
    const control = renderSubagentControlCall({ action: "wait", id: "Clara", message: "continue" }, theme, {});
    expect(plain(control, 80)).toContain("subagent control · wait");
    expect(plain(control, 80)).toContain("Target: Clara");
  });

  it.each([
    ["running", { status: "running", phase: "model" }],
    ["background started", { status: "running", waitState: "background" }],
    ["detached", { status: "running", waitState: "detached" }],
    ["question", { status: "waiting", phase: "waiting-parent", result: "Should I include generated files?" }],
    ["complete", { status: "settled", outcome: "complete", result: "**Done**\n\n- one\n- two" }],
    ["partial", { status: "settled", outcome: "partial", result: "Finished the safe portion." }],
    ["blocked", { status: "settled", outcome: "blocked", result: "Blocked by a missing prerequisite." }],
    ["failed", { status: "settled", outcome: "failed", error: "Provider rejected the request" }],
    ["cancelled", { status: "settled", outcome: "cancelled" }],
  ] as const)("renders %s without raw JSON", (_label, record) => {
    const text = plain(result(record), 42);
    expect(text).toContain("Clara · explorer");
    expect(text).not.toContain("internal JSON should not be primary");
  });

  it("keeps question content and start/activity state visible", () => {
    const question = plain(result({ status: "waiting", phase: "waiting-parent", result: "Should generated files be included?" }), 80);
    expect(question).toContain("Question: Should generated files be included?");
    const starting = plain(result({ status: "running", phase: "starting", toolName: undefined }), 80);
    expect(starting).toContain("Activity: starting assignment");
  });

  it("shows resolved defaults, cleanup errors, and Markdown in expanded output", () => {
    const record = { status: "settled" as const, outcome: "complete" as const, result: "# Result\n\nA **multiline** answer.", error: "Cleanup failed: pane remained open", assignmentFinishedAt: "2026-09-08T00:00:04.000Z" };
    const text = plain(result(record, true), 120);
    expect(text).toContain("Model: openai-codex/test · effort: low");
    expect(text).toContain("Cwd: /worktree/example");
    expect(text).toContain("Cleanup failed: pane remained open");
    expect(text).toContain("multiline");
  });

  it("renders automatic outcomes as a named message rather than JSON", () => {
    const message = renderSubagentMessage({ customType: "subagent-result", content: "Subagent Clara · explorer complete:\n# Done\n\nResult", details: { displayName: "Clara", agent: "explorer", outcome: "complete", assignment: "Inspect files" } }, { expanded: true }, theme);
    const text = plain(message, 80);
    expect(text).toContain("Subagent Clara · explorer");
    expect(text).toContain("Done");
    expect(text).toContain("Assignment: Inspect files");
  });
});
