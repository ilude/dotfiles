import { beforeAll, describe, expect, it, vi } from "vitest";
import { getKeybindings, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { adapt } from "../../lib/damage-control/adapters.ts";
import { buildApproval, type ApprovalDecision } from "../../lib/damage-control/approval.ts";
import { createApprovalView } from "../../lib/damage-control/approval-view.ts";
import { promptDecision, type PromptContext } from "../../lib/damage-control/prompt.ts";
import { analyzeShell } from "../../lib/damage-control/shell.ts";
import type { Analysis, ToolRequest } from "../../lib/damage-control/types.ts";

const decision: ApprovalDecision = { outcome: "user", reason: "rm with recursive or force flags" };
function request(command: string): ToolRequest {
  const result = adapt("bash", "fixture", { command }, "/project");
  if (result.status !== "adapted") throw new Error("Invalid fixture");
  return result.request;
}
const operation = request(`cat > /tmp/pi-rebase-todo.py <<'PY'\n${"# inert script text\n".repeat(200)}PY\ngit rebase -i origin/main\nrm -f /tmp/pi-rebase-todo.py\ngit status --short`);
let analysis: Analysis;
beforeAll(async () => {
  analysis = await analyzeShell(operation, {
    now: () => 0,
    rules: ["filesystem-rm-recursive-or-force", "filesystem-rm-recursive-or-force-short"].map(id => ({ id, action: "user", reason: decision.reason, regex: "\\brm\\s+-[rRf]", compiled: /\brm\s+-[rRf]/, languages: ["bash"] })),
  });
  expect(analysis.health.status).toBe("ready");
  expect(analysis.matches).toHaveLength(2);
});
const theme = {
  fg: vi.fn((color: string, text: string) => `\x1b[${color === "warning" ? 33 : color === "accent" ? 36 : color === "muted" ? 90 : 37}m${text}\x1b[39m`),
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};
const context = (mode: PromptContext["mode"] = "rpc"): PromptContext => ({
  mode, hasUI: mode === "tui" || mode === "rpc", signal: undefined,
  ui: { select: vi.fn<PromptContext["ui"]["select"]>(async () => "Allow once"), custom: vi.fn(async () => { throw new Error("Unexpected custom UI"); }) },
});
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));

describe("approval presentation", () => {
  it("connects the real matched command to its target without displaying the script", () => {
    const approval = buildApproval(decision, operation, analysis);
    const summary = approval.summary.map(line => line.text).join("\n");
    expect(summary).toContain("File deletion using rm -f requires approval.");
    expect(summary).toContain("rm -f /tmp/pi-rebase-todo.py");
    expect(summary).toContain("Target: /tmp/pi-rebase-todo.py");
    expect(summary).toContain("In: /project");
    expect(summary).toContain("Approves the whole shell call");
    expect(summary).toContain("Git state change");
    expect(summary).not.toContain("inert script text");
    expect(summary).not.toContain("legacy-");
    expect(approval.summary.filter(line => line.emphasis === "reason")).toHaveLength(1);
    const details = approval.details.map(line => line.text).join("\n");
    expect(details).toContain("filesystem-rm-recursive-or-force");
    expect(details).toContain("filesystem-rm-recursive-or-force-short");
    expect(details).toContain("cat is missing a required operand");
    expect(approval.details.find(line => line.trigger)?.text).toContain("rm -f");
  });
  it("keeps submitted terminal formatting inert in both views", () => {
    const call = request("echo '\u001b[31mnot a warning\u001b[0m \u202ehidden'");
    const approval = buildApproval(decision, call, { effects: [], matches: [], uncertainties: [], health: { status: "ready" } });
    const content = approval.details.map(line => line.text).join("\n");
    expect(content).not.toContain("\u001b");
    expect(content).not.toContain("\u202e");
    expect(content).toContain("\\u202ehidden");
  });
  it("does not collapse distinct targets under duplicate rule reasons", async () => {
    const call = request("rm -f /tmp/first /tmp/second");
    const result = await analyzeShell(call, { now: () => 0, rules: [{ id: "rm", action: "user", reason: decision.reason, regex: "rm", compiled: /rm/, languages: ["bash"] }] });
    const text = buildApproval(decision, call, result).summary.map(line => line.text).join("\n");
    expect(text).toContain("Target: /tmp/first");
    expect(text).toContain("Target: /tmp/second");
  });
  it("distinguishes review failure and native file targets", () => {
    const file = adapt("write", "write", { path: "settings.json", content: "{}" }, "/project");
    if (file.status !== "adapted") throw new Error("Invalid fixture");
    const approval = buildApproval({ outcome: "user", origin: "review", reason: "Review timeout: deadline exceeded" }, file.request, { effects: [], matches: [], uncertainties: [], health: { status: "ready" } });
    expect(approval.title).toBe("Safety review needs a decision");
    expect(approval.summary.map(line => line.text).join("\n")).toContain("write settings.json");
    expect(approval.summary.map(line => line.text).join("\n")).not.toContain("Safety rule");
  });
  it.each([[80, 24], [60, 20], [40, 16]])("keeps controls visible at %i columns / %i rows", (width, rows) => {
    const view = createApprovalView(buildApproval(decision, operation, analysis), theme, getKeybindings(), vi.fn(), () => rows);
    const rendered = view.render(width);
    expect(rendered.length).toBeLessThanOrEqual(rows);
    expect(rendered.every(line => visibleWidth(line) <= width)).toBe(true);
    expect(plain(rendered)).toContain("Allow once");
    expect(plain(rendered)).toContain("D details");
  });
  it("uses amber reasons/flags/scope, accent selection, and usable color-free text", () => {
    const view = createApprovalView(buildApproval(decision, operation, analysis), theme, getKeybindings(), vi.fn(), () => 30);
    const rendered = view.render(100).join("\n");
    expect(rendered).toContain("\x1b[33mFile deletion using rm -f");
    expect(rendered).toContain("\x1b[33m\x1b[1m-f");
    expect(rendered).toContain("\x1b[33m\x1b[1mApproves the whole");
    expect(rendered).toContain("\x1b[36m→ Allow once");
    expect(stripTerminalSequences(rendered)).toContain("Git state change");
  });
  it("opens Details at the trigger, supports full navigation, and never approves while browsing", () => {
    const done = vi.fn();
    const view = createApprovalView(buildApproval(decision, operation, analysis), theme, getKeybindings(), done, () => 24);
    view.render(80);
    view.handleInput?.("d");
    expect(plain(view.render(80))).toContain("rm -f /tmp/pi-rebase-todo.py");
    view.handleInput?.("\x1b[H");
    expect(plain(view.render(80))).toContain("filesystem-rm-recursive-or-force");
    view.handleInput?.("\x1b[F");
    expect(plain(view.render(80))).toContain("git status --short");
    view.handleInput?.("\r");
    expect(done).not.toHaveBeenCalled();
    expect(plain(view.render(80))).toContain("Allow once");
    view.handleInput?.("\r");
    expect(done).toHaveBeenCalledWith("allow");
  });
  it("preserves Deny selection when returning from Details and reflows after resize", () => {
    const done = vi.fn();
    const view = createApprovalView(buildApproval(decision, operation, analysis), theme, getKeybindings(), done, () => 24);
    view.handleInput?.("\x1b[B");
    view.handleInput?.("d");
    view.render(100);
    view.invalidate();
    expect(view.render(40).every(line => visibleWidth(line) <= 40)).toBe(true);
    view.handleInput?.("d");
    expect(plain(view.render(80))).toContain("→ Deny");
    view.handleInput?.("\r");
    expect(done).toHaveBeenCalledWith("deny");
  });
  it.each([false, true])("Escape denies from summary or Details (expanded=%s)", expanded => {
    const done = vi.fn();
    const view = createApprovalView(buildApproval(decision, operation, analysis), theme, getKeybindings(), done, () => 24);
    if (expanded) view.handleInput?.("d");
    view.handleInput?.("\x1b");
    expect(done).toHaveBeenCalledWith("deny");
  });
});

describe("per-call prompts", () => {
  it("RPC retains compact choices and full paged details without custom TUI", async () => {
    const ctx = context();
    const select = vi.mocked(ctx.ui.select);
    select.mockResolvedValueOnce("Details").mockResolvedValueOnce("Previous page").mockResolvedValueOnce("Back").mockResolvedValueOnce("Allow once");
    expect(await promptDecision(decision, operation, analysis, ctx)).toEqual({ status: "approved" });
    expect(select.mock.calls[0][1]).toEqual(["Allow once", "Deny", "Details"]);
    expect(select.mock.calls[0][0]).not.toContain("inert script text");
    expect(select.mock.calls[1][0]).toContain("rm -f /tmp/pi-rebase-todo.py");
    expect(select.mock.calls[1][1]).not.toContain("Allow once");
    expect(select.mock.calls.every(call => call[0].length < 3200)).toBe(true);
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });
  it("offers conditional future review without delaying the one-time approval", async () => {
    const ctx = context();
    ctx.allowReview = true;
    vi.mocked(ctx.ui.select).mockResolvedValueOnce("Allow once and review for future use");
    const result = await promptDecision(decision, operation, analysis, ctx);
    expect(result).toEqual({ status: "approved", review: true });
    expect(vi.mocked(ctx.ui.select).mock.calls[0][1]).toEqual(["Allow once", "Allow once and review for future use", "Deny", "Details"]);
  });
  it("returns useful denial context without inviting the same operation again", async () => {
    const ctx = context();
    vi.mocked(ctx.ui.select).mockResolvedValueOnce("Deny");
    const answer = await promptDecision(decision, operation, analysis, ctx);
    expect(answer).toMatchObject({ status: "denied", reason: expect.stringContaining("rm -f /tmp/pi-rebase-todo.py") });
    expect(answer).toMatchObject({ reason: expect.stringContaining("Do not retry the same operation or disguise it") });
  });
  it.each(["print", "json"] as const)("%s reports needs_approval without pretending the user denied", async mode => {
    const ctx = context(mode);
    const answer = await promptDecision(decision, operation, analysis, ctx);
    expect(answer).toMatchObject({ status: "denied", reason: expect.stringContaining("needs_approval") });
    expect(JSON.stringify(answer)).not.toContain("Operator denied");
    expect(ctx.ui.select).not.toHaveBeenCalled();
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });
  it("RPC UI failure, Escape, or late cancellation never allow", async () => {
    const ctx = context();
    vi.mocked(ctx.ui.select).mockRejectedValueOnce(new Error("UI failed"));
    expect((await promptDecision(decision, operation, analysis, ctx)).status).toBe("denied");
    vi.mocked(ctx.ui.select).mockResolvedValueOnce(undefined);
    expect((await promptDecision(decision, operation, analysis, ctx)).status).toBe("denied");
    const abort = new AbortController();
    vi.mocked(ctx.ui.select).mockImplementationOnce(async () => { abort.abort(); return "Allow once"; });
    expect((await promptDecision(decision, operation, analysis, { ...ctx, signal: abort.signal })).status).toBe("denied");
  });
  it("returns an actual custom-component Allow once selection as approved", async () => {
    const ctx = context("tui");
    ctx.ui.custom = async <T>(factory: Parameters<PromptContext["ui"]["custom"]>[0]): Promise<T> => {
      let resolve!: (value: T) => void;
      const answer = new Promise<T>(done => { resolve = done; });
      const view = await factory({ terminal: { rows: 24 }, requestRender: vi.fn() } as never, theme as never, getKeybindings() as never, value => resolve(value as T));
      view.render(80);
      view.handleInput?.("\r");
      const result = await answer;
      view.dispose?.();
      return result;
    };
    expect(await promptDecision(decision, operation, analysis, ctx)).toEqual({ status: "approved" });
  });
  it("cancels the actual custom component and removes its abort listener", async () => {
    const ctx = context("tui");
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, "removeEventListener");
    ctx.signal = abort.signal;
    ctx.ui.custom = async <T>(factory: Parameters<PromptContext["ui"]["custom"]>[0]): Promise<T> => {
      let resolve!: (value: T) => void;
      const answer = new Promise<T>(done => { resolve = done; });
      const view = await factory({ terminal: { rows: 24 }, requestRender: vi.fn() } as never, theme as never, getKeybindings() as never, value => resolve(value as T));
      view.render(80);
      view.handleInput?.("d");
      abort.abort();
      const result = await answer;
      view.dispose?.();
      return result;
    };
    expect((await promptDecision(decision, operation, analysis, ctx)).status).toBe("denied");
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
