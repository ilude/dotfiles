import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import subagents from "../extensions/subagents.ts";
import childAuthority from "../extensions/subagent-child.ts";
import { ChildTransport } from "../lib/subagents/transport.ts";
import { resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import { initTheme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
initTheme("dark", false);
import type { ChildRecord } from "../lib/subagents/rpc.ts";
import { progressResult, renderSubagentCall, renderSubagentControlCall, renderSubagentMessage, renderSubagentResult } from "../lib/subagents/presentation.ts";

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
    expect(plain(call, 36)).toContain("Prompt: Find the implementation");
    expect(plain(call, 120)).not.toContain("surface=visible");
    const control = renderSubagentControlCall({ action: "wait", id: "Clara", message: "continue" }, theme, {});
    expect(plain(control, 80)).toContain("subagent control · wait");
    expect(plain(control, 80)).toContain("Target: Clara");
  });

  it.each([
    ["running", { status: "running", phase: "model" }],
    ["background started", { status: "running", waitState: "background" }],
    ["detached", { status: "running", waitState: "detached" }],
    ["redirecting", { status: "running", phase: "redirecting", notice: "Redirecting the current turn" }],
    ["question", { status: "waiting", phase: "waiting-parent", result: "Should I include generated files?" }],
    ["complete", { status: "settled", outcome: "complete", result: "**Done**\n\n- one\n- two" }],
    ["partial", { status: "settled", outcome: "partial", result: "Finished the safe portion." }],
    ["blocked", { status: "settled", outcome: "blocked", result: "Blocked by a missing prerequisite." }],
    ["failed", { status: "settled", outcome: "failed", error: "Provider rejected the request" }],
    ["cancelled", { status: "settled", outcome: "cancelled" }],
  ] as const)("renders %s without raw JSON", (_label, record) => {
    const text = plain(result(record), 42);
    expect(text).not.toContain("Clara · explorer");
    expect(text).not.toContain("Role:");
    expect(text).not.toContain("internal JSON should not be primary");
  });

  it("keeps question content and start/activity state visible", () => {
    const questionRecord = { ...base, status: "waiting" as const, phase: "waiting-parent" as const, result: "Should generated files be included?" };
    const question = plain(result(questionRecord), 80);
    expect(question).toContain("Question: Should generated files be included?");
    expect(question).toContain("question for parent");
    const progress = progressResult(questionRecord).content[0].text;
    expect(progress).toContain("Question: Should generated files be included?");
    const expandedQuestion = plain(result(questionRecord, true), 120);
    expect(expandedQuestion).not.toContain("Question:");
    expect(expandedQuestion.match(/Should generated files be included\?/g)).toHaveLength(1);
    expect(plain(result({ status: "running", phase: "redirecting" }), 80)).toContain("redirecting current turn");
    const starting = plain(result({ status: "running", phase: "starting", toolName: undefined }), 80);
    expect(starting).not.toContain("Activity: starting assignment");
    expect(starting).toContain("starting assignment");
  });

  it("shows resolved defaults, cleanup errors, and Markdown in expanded output", () => {
    const record = { status: "settled" as const, outcome: "complete" as const, result: "# Result\n\nA **multiline** answer.", error: "Cleanup failed: pane remained open", assignmentFinishedAt: "2026-09-08T00:00:04.000Z" };
    const text = plain(renderSubagentMessage({ details: { ...base, ...record } }, { expanded: true }, theme), 120);
    expect(text).toContain("Model: openai-codex/test [low]");
    expect(text).toContain("Cwd: /worktree/example");
    expect(text).toContain("Cleanup failed: pane remained open");
    expect(text).toContain("multiline");
    const cleanup = plain(result({ ...record, phase: "cleanup" }), 120);
    expect(cleanup).toContain("complete · cleaning up");
    expect(plain(result({ userOwned: true }), 120)).toContain("user intervention; parent control suspended");
    const automatic = plain(renderSubagentMessage({ content: "fallback", details: { ...base, ...record } }, { expanded: true }, theme), 120);
    expect(automatic).toContain("Duration: 4s");
    expect(automatic).toContain("multiline");
    expect(automatic).toContain("Cleanup failed: pane remained open");
  });

  it("renders automatic outcomes as a named message rather than JSON", () => {
    const message = renderSubagentMessage({ customType: "subagent-result", content: "Subagent Clara · explorer complete:\n# Done\n\nResult", details: { displayName: "Clara", agent: "explorer", outcome: "complete", assignment: "Inspect files" } }, { expanded: true }, theme);
    const text = plain(message, 80);
    expect(text).toContain("Subagent Clara · explorer");
    expect(text).toContain("Done");
    expect(text.replace(/\s+/g, " ")).toContain("Prompt: Inspect files");
  });

  it("consolidates paired call and result fields and expands the exact prompt once", () => {
    const prompt = `first line\n${"prompt detail ".repeat(30)}\nFINAL PROMPT LINE`;
    const context: any = { state: {}, executionStarted: true };
    const call = renderSubagentCall({ agent: "explorer", instructions: prompt }, theme, context);
    renderSubagentResult({ details: { ...base, assignment: "record copy", status: "running" } }, {}, theme, context);
    const collapsed = plain(call, 120);
    expect(collapsed.match(/Model:/g)).toHaveLength(1);
    expect(collapsed.match(/Started:/g)).toHaveLength(1);
    expect(collapsed).toContain("for full prompt");
    const finished = { ...base, assignment: "record copy that must not replace the sent prompt", status: "settled", outcome: "complete", result: "answer" };
    const resultView = renderSubagentResult({ details: finished }, {}, theme, context);
    const paired = `${plain(call, 120)}\\n${plain(resultView, 120)}`;
    expect(paired.match(/Model:/g)).toHaveLength(1);
    expect(paired.match(/Started:/g)).toHaveLength(1);
    expect(paired.match(/Prompt:/g)).toHaveLength(1);
    renderSubagentResult({ details: finished }, { expanded: true }, theme, context);
    const expanded = plain(call, 10000);
    expect(expanded.replace(/\s+/g, " ")).toContain(prompt.replace(/\s+/g, " "));
    expect(expanded).toContain("FINAL PROMPT LINE");
    expect(expanded.match(/Prompt:/g)).toHaveLength(1);
    const expandedResult = plain(renderSubagentMessage({ details: finished }, { expanded: true }, theme), 120);
    expect(expandedResult).toContain("Surface: headless");
    expect(expandedResult.match(/Started:/g)).toHaveLength(1);
    expect(expandedResult).not.toContain("Last activity:");
    expect(expandedResult).not.toContain("Phase:");
  });

  it("retains the active call header through result updates and freezes terminal duration", () => {
    const context: any = { state: {}, executionStarted: true, invalidate: vi.fn() };
    const args = { agent: "explorer", instructions: "requested assignment" };
    const call = renderSubagentCall(args, theme, context);
    const finished = { ...base, status: "settled", outcome: "complete", result: "answer", assignmentFinishedAt: "2026-09-08T00:00:04.000Z" };
    renderSubagentResult({ details: finished }, {}, theme, context);
    expect(plain(call, 120)).toContain("subagent · Clara · explorer");
    expect(plain(call, 120)).toContain("Model: openai-codex/test [low]");
    expect(plain(call, 120)).toContain("Duration: 4s");
    expect(plain(call, 120)).not.toContain("headless");
    const rerender = renderSubagentCall(args, theme, { ...context, lastComponent: call });
    expect(rerender).toBe(call);
    expect(plain(rerender, 120)).toContain("Duration: 4s");
    expect(context.invalidate).not.toHaveBeenCalled();
    const legacy = { ...finished, assignmentFinishedAt: undefined };
    const terminal = plain(renderSubagentResult({ details: legacy }, {}, theme, {}), 120);
    expect(terminal).not.toContain("Duration:");
    expect(terminal).not.toContain("Elapsed:");
  });

  it("expands the full available assignment and bounds Markdown output and errors", () => {
    const assignment = `first line\n${"assignment detail ".repeat(1100)}\nFINAL ASSIGNMENT LINE`;
    const output = `# Result\n${"answer ".repeat(5000)}OUTPUT TAIL`;
    const expanded = plain(renderSubagentMessage({ details: { ...base, assignment, result: output, status: "settled", outcome: "complete", error: "Cleanup failed" } }, { expanded: true }, theme), 80);
    expect(expanded).toContain("FINAL ASSIGNMENT LINE");
    expect(expanded).not.toContain("OUTPUT TAIL");
    expect(expanded).toContain("Cleanup failed");
    expect(plain(result({ assignment }), 80)).not.toContain("FINAL ASSIGNMENT LINE");
  });
});

it("executes registered tools against an inert RPC child and renders their live and final records", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const profile = resolve(here, "..");
  const scratch = mkdtempSync(join(tmpdir(), "subagent-presentation-"));
  const tools: Record<string, any> = {}, handlers: Record<string, Function> = {};
  const messages = vi.fn();
  const ctx: any = { cwd: scratch, hasUI: true, isProjectTrusted: () => true, isIdle: () => false,
    sessionManager: { getSessionId: () => "presentation-origin" }, ui: { setWidget: vi.fn(), notify: vi.fn() } };
  const pi: any = { on: (name: string, handler: Function) => { handlers[name] = handler; },
    registerTool: (tool: any) => { tools[tool.name] = tool; }, registerCommand: vi.fn(), registerMessageRenderer: vi.fn(), sendMessage: messages };
  mkdirSync(join(scratch, ".pi", "agents"), { recursive: true });
  writeFileSync(join(scratch, ".pi", "agents", "probe.md"), "---\nname: probe\ndescription: Inert fixture\ntools: []\nmodel: openai-codex/test\n---\nReport the fixture result.\n");
  vi.stubEnv("PI_CODING_AGENT_DIR", profile);
  vi.stubEnv("PI_SUBAGENT_BIN", process.execPath);
  vi.stubEnv("PI_SUBAGENT_BIN_ARGS", JSON.stringify([join(here, "fixtures/fake-subagent-rpc.mjs")]));
  vi.stubEnv("HERDR_ENV", "0");
  const runtime = await resetSubagentRuntime();
  try {
    // Follow the current origin-session lifecycle rather than the child-authority path.
    vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
    subagents(pi); await handlers.session_start({}, ctx);
    const args = { agent: "probe", instructions: "[activity] [hold]\nInspect all requested files." };
    const context: any = { state: {}, args, executionStarted: true, invalidate: vi.fn() };
    const call = tools.subagent.renderCall(args, theme, context);
    const abort = new AbortController();
    const views: string[] = [];
    const pending = tools.subagent.execute("launch", args, abort.signal, (update: any) => {
      const component = tools.subagent.renderResult(update, { isPartial: true }, theme, context);
      for (const width of [36, 120]) views.push(plain(component, width));
    }, ctx);
    await vi.waitFor(() => expect(views.some(view => view.includes("using bash"))).toBe(true));
    const name = runtime.list("presentation-origin")[0].displayName!;
    expect(plain(call, 120)).toContain(`subagent · ${name} · probe`);
    expect(plain(call, 120)).toContain("Model: openai-codex/test [low]");
    expect(plain(call, 120)).toContain("Started:");
    expect(messages).not.toHaveBeenCalled();
    abort.abort();
    const detached = await pending;
    expect(detached.details.waitState).toBe("detached");
    for (const width of [36, 120]) {
      const text = plain(tools.subagent.renderResult(detached, {}, theme, context), width);
      expect(text.replace(/\s+/g, " ")).toContain("wait detached; child continues");
    }
    const controlArgs = { action: "cancel", id: name };
    const controlContext: any = { state: {}, args: controlArgs };
    const control = tools.subagent_control.renderCall(controlArgs, theme, controlContext);
    const cancelled = await tools.subagent_control.execute("cancel", controlArgs, undefined, undefined, ctx);
    const cancelledView = tools.subagent_control.renderResult(cancelled, {}, theme, controlContext);
    expect(plain(control, 120)).toContain(`subagent control · cancel · ${name} · probe`);
    expect(plain(control, 120)).not.toContain("cancelled");
    expect(plain(cancelledView, 120)).toContain("cancelled");
    expect(plain(cancelledView, 120)).not.toContain("child continues");

    const backgroundArgs = { agent: "probe", instructions: "[hold]", background: true };
    const background = await tools.subagent.execute("background", backgroundArgs, undefined, undefined, ctx);
    expect(plain(tools.subagent.renderResult(background, {}, theme, { state: {} }), 120)).toContain("started in background; child continues");
    await tools.subagent_control.execute("cancel-bg", { action: "cancel", id: background.details.displayName }, undefined, undefined, ctx);
    const approval = await tools.subagent.execute("approval", { agent: "probe", instructions: "[approval]" }, undefined, undefined, ctx);
    expect(plain(tools.subagent.renderResult(approval, {}, theme, {}), 120)).toContain("needs user input");
    await tools.subagent_control.execute("cancel-approval", { action: "cancel", id: approval.details.displayName }, undefined, undefined, ctx);
    const fullAssignment = `Return an answer\n${"full assignment ".repeat(1100)}\nLAST REQUESTED LINE`;
    const complete = await tools.subagent.execute("complete", { agent: "probe", instructions: fullAssignment }, undefined, undefined, ctx);
    const failed = await tools.subagent.execute("failed", { agent: "probe", instructions: "[reject]" }, undefined, undefined, ctx);
    for (const width of [36, 120]) {
      const text = plain(tools.subagent.renderResult(complete, { expanded: true }, theme, {}), width);
      expect(text).toContain("first answer"); expect(text).not.toContain("Duration:");
      expect(plain(tools.subagent.renderResult(failed, {}, theme, {}), width).replace(/\s+/g, " ")).toContain("preflight rejected");
    }
    expect(messages.mock.calls).toHaveLength(3);
    expect(messages.mock.calls.every(([message]: any[]) => message.content.includes("cancelled"))).toBe(true);
  } finally {
    await handlers.session_shutdown?.({ reason: "quit" }, ctx);
    await runtime.shutdown("quit");
    vi.unstubAllEnvs(); rmSync(scratch, { recursive: true, force: true });
  }
}, 20_000);

it("renders coordinator registered delegation and name controls over authenticated transport", async () => {
  const tools: Record<string, any> = {};
  const record = { ...base, status: "waiting", phase: "waiting-parent", result: "Include generated files?", waitState: "attached" as const };
  const requests: any[] = [];
  const transport = new ChildTransport(async (_identity, request) => { requests.push(request); return record; });
  const endpoint = await transport.register({ child: "coordinator", origin: "origin", run: "fixture" });
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ id: endpoint.child, agent: "teamlead", tools: ["subagent", "subagent_control"], delegates: ["explorer"], cwd: process.cwd(), skills: [] }));
  vi.stubEnv("PI_SUBAGENT_ENDPOINT", JSON.stringify(endpoint));
  const pi: any = { registerTool: (tool: any) => { tools[tool.name] = tool; }, registerCommand: vi.fn(), on: vi.fn(), sendMessage: vi.fn() };
  try {
    childAuthority(pi);
    const args = { agent: "explorer", instructions: "Inspect files" };
    const context: any = { state: {}, args };
    const call = tools.subagent.renderCall(args, theme, context);
    const result = await tools.subagent.execute("delegate", args, undefined, (update: any) => tools.subagent.renderResult(update, { isPartial: true }, theme, context));
    expect(result.details.phase).toBe("waiting-parent");
    for (const width of [36, 120]) {
      expect(plain(call, width)).toContain("Clara");
      expect(plain(tools.subagent.renderResult(result, {}, theme, context), width).replace(/\s+/g, " ")).toContain("Question: Include generated files?");
    }
    const controlArgs = { action: "inspect", id: "Clara" };
    const controlContext: any = { state: {}, args: controlArgs };
    const control = tools.subagent_control.renderCall(controlArgs, theme, controlContext);
    const inspected = await tools.subagent_control.execute("inspect", controlArgs);
    tools.subagent_control.renderResult(inspected, {}, theme, controlContext);
    expect(plain(control, 120)).toContain("subagent control · inspect · Clara · explorer");
    expect(requests.at(-1)).toEqual({ type: "control", payload: controlArgs });
    expect(pi.sendMessage).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); await transport.close(); }
});
