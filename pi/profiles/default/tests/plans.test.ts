import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPlanRunRuntime } from "../lib/plan-run-runtime.ts";
import { PlanRunStore } from "../lib/plan-runs.ts";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import plansCommand, { archivePlan, executePlans, openPlanInCode, planSelector } from "../extensions/plans.ts";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import { createHerdrPiTab, HerdrPiTabLaunchError, renameHerdrPiTab } from "../extensions/session-launch.ts";
import { discoverPlans, parsePlan } from "../lib/plans.ts";
import { spawnSync } from "node:child_process";
vi.mock("node:child_process", () => ({ spawnSync: vi.fn(), execFile: vi.fn() }));
vi.mock("../extensions/session-launch.ts", async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), createHerdrPiTab: vi.fn(), renameHerdrPiTab: vi.fn(),
}));
vi.mock("@earendil-works/pi-coding-agent", async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), copyToClipboard: vi.fn(),
}));
const roots: string[] = [];
beforeEach(() => { vi.stubEnv("PI_CODING_AGENT_DIR", root()); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() { const value = mkdtempSync(join(tmpdir(), "plans ")); roots.push(value); return value; }
function add(base: string, stub: string, body: string) { const dir = join(base, ".specs", stub); mkdirSync(dir, { recursive: true }); const file = join(dir, "plan.md"); writeFileSync(file, body); return file; }
const complete = `---\nstatus: completed\ncompleted: 2026-09-09\n---\n# Zebra\n\n## Goal and scope\n\n- Ship the selector.\n\n## Tasks\n- [x] First\n- [x] Second\n\n## Current handoff\nDone.\n`;
const testTheme = (bg = vi.fn((_: string, value: string) => value)) => ({ bold: (x:string)=>x, fg: (_:string,x:string)=>x, bg });
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
type Picker = ReturnType<ReturnType<typeof planSelector>>;

it("discovers direct active plans, parses summaries and sorts by stub", () => {
  const base = root(); add(base, "z", complete.replace("Zebra", "Alpha")); add(base, "a", complete.replace("[x] Second", "[ ] Next"));
  add(base, "archive/old", complete); add(base, "deep/nested", complete);
  const found = discoverPlans(base);
  expect(found.errors).toEqual([]); expect(found.plans.map(p => p.stub)).toEqual(["a", "z"]);
  expect(found.plans.map(p => p.title)).toEqual(["Zebra", "Alpha"]);
  expect(found.plans[0]).toMatchObject({ description: "Ship the selector.", status: "completed", tasks: { total: 2, checked: 1 }, firstUnchecked: "Next" });
});

it("keeps malformed plans visible with bounded warnings", () => {
  const base = root(); const file = add(base, "broken", "---\nstatus: [\n---\ntext\n");
  const plan = parsePlan(file, "broken", base);
  expect(plan.title).toBe("broken"); expect(plan.description).toBe("Description unavailable"); expect(plan.warnings).toContain("malformed frontmatter");
});

it("renders width-safe rows and dispatches only approved keys", () => {
  const base = root(); const plans = [parsePlan(add(base, "a", complete.replace("Zebra", "A".repeat(100))), "a", base), parsePlan(add(base, "b", complete), "b", base)];
  const done = vi.fn(); const render = vi.fn(); const theme = testTheme();
  const component = planSelector(plans, 0, done)({ requestRender: render }, theme);
  component.handleInput("\x1b[B"); component.handleInput("\r");
  expect(component.render(32).every(value => visibleWidth(value) <= 32)).toBe(true);
  for (const key of ["D", "R", "v"]) component.handleInput(key);
  expect(done).not.toHaveBeenCalled();
  component.handleInput("d"); expect(done).toHaveBeenCalledWith({ action: "do-it", index: 1 });
});

it("aligns the list columns and opens the selected plan without entering details", () => {
  const base = root();
  const plans = [parsePlan(add(base, "alpha", complete.replace("Zebra", "Alpha")), "alpha", base), parsePlan(add(base, "beta", complete.replace("Zebra", "Beta")), "beta", base)];
  const bg = vi.fn((_: string, value: string) => value);
  const done = vi.fn();
  const component = planSelector(plans, 1, done)({ requestRender() {}, terminal: { rows: 24 } }, testTheme(bg));
  const rows = component.render(80);
  expect(rows.every(row => visibleWidth(row) === 80)).toBe(true);
  expect(rows.map(stripTerminalSequences).join("\n")).toMatch(/Spec stub\s+Status\s+Tasks/);
  const planRows = rows.filter(row => /(?:alpha|beta)\s+completed/.test(row));
  expect(planRows).toHaveLength(2);
  expect(planRows[0]!.indexOf("completed")).toBe(planRows[1]!.indexOf("completed"));
  expect(bg).toHaveBeenCalledWith("selectedBg", expect.stringContaining("▶ beta"));
  expect(visibleWidth(bg.mock.calls.find(([color]) => color === "selectedBg")![1])).toBe(78);
  component.handleInput("o");
  expect(done).toHaveBeenCalledWith({ action: "open", index: 1 });
});

it.each([["o", "open"], ["c", "copy"], ["r", "run-here"], ["d", "do-it"], ["a", "archive"]])("dispatches %s from both browse and details", (key, action) => {
  const base = root(); const plan = parsePlan(add(base, "selected", complete), "selected", base);
  for (const details of [false, true]) {
    const done = vi.fn();
    const component = planSelector([plan, { ...plan, stub: "second" }], 0, done)({ requestRender() {} }, testTheme());
    component.handleInput("\x1b[B");
    if (details) component.handleInput("\r");
    component.render(100);
    component.handleInput(key);
    expect(done).toHaveBeenCalledExactlyOnceWith({ action, index: 1 });
  }
});

it.each([40, 100])("maps duplicate titles to their directory stubs in a %i-column list", width => {
  const base = root();
  const plans = ["alpha-fix", "beta-fix"].map(stub => parsePlan(add(base, stub, complete), stub, base));
  const done = vi.fn();
  const component = planSelector(plans, 0, done)({ requestRender() {}, terminal: { rows: 35 } }, testTheme());
  const first = component.render(width).join("\n");
  expect(first).toContain("▶ alpha-fix");
  expect(first).toContain("beta-fix");
  expect(first).toContain("Zebra");
  expect(first).toContain(".specs/alpha-fix/");
  expect(first).toContain("Ship the selector.");
  expect(first).not.toContain(".specs/beta-fix/");
  component.handleInput("\x1b[B");
  const second = component.render(width).join("\n");
  expect(second).toContain("▶ beta-fix");
  expect(second).toContain(".specs/beta-fix/");
  expect(second).not.toContain(".specs/alpha-fix/");
  component.handleInput("\r"); component.handleInput("o");
  expect(done).toHaveBeenCalledWith({ action: "open", index: 1 });
});

it("enters details, preserves selection on Esc, and exposes detail actions", () => {
  const base = root();
  const plans = [parsePlan(add(base, "alpha", complete.replace("Zebra", "Alpha")), "alpha", base), parsePlan(add(base, "beta", complete.replace("Zebra", "Beta")), "beta", base)];
  const done = vi.fn();
  const component = planSelector(plans, 0, done)({ requestRender() {}, terminal: { rows: 24 } }, testTheme());
  component.handleInput("\x1b[B"); component.handleInput("\r");
  const details = component.render(64).map(stripTerminalSequences).join("\n");
  expect(details).toContain("Open in VS Code"); expect(details).toContain("Copy command");
  expect(details).toContain("Run here"); expect(details).toContain("Run in new tab"); expect(details).toContain("Archive");
  expect(details).toContain("Beta"); expect(details).not.toContain("Alpha");
  component.handleInput("\x1b");
  expect(done).not.toHaveBeenCalled();
  expect(component.render(64).join("\n")).toContain("▶ beta");
  component.handleInput("d");
  expect(done).toHaveBeenCalledWith({ action: "do-it", index: 1 });
});

it("scrolls details without changing plan selection and remains width safe", () => {
  const base = root(); const plan = parsePlan(add(base, "long", complete), "long", base);
  plan.description = Array.from({ length: 80 }, (_, i) => `description-word-${i}`).join(" ");
  const done = vi.fn(); const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
  const component = planSelector([plan], 0, done)(tui, testTheme()); component.handleInput("\r");
  const before = component.render(36).join("\n"); component.handleInput("\x1b[B"); const after = component.render(36).join("\n");
  expect(after).not.toBe(before); expect(component.render(36).every(row => visibleWidth(row) <= 36)).toBe(true);
  let seen = before + after;
  for (let index = 0; index < 100; index++) { component.handleInput("\x1b[B"); seen += component.render(36).join("\n"); }
  expect(seen).toContain("description-word-79");
  expect(component.render(36).join("\n")).toContain("Open in VS Code");
  expect(component.render(36).join("\n")).toContain("Esc Back");
  expect(component.render(36).length).toBeLessThanOrEqual(19);
  component.handleInput("d"); expect(done).toHaveBeenCalledWith({ action: "do-it", index: 0 });
});

it.each([[24, 18], [40, 18], [100, 35]])("keeps a readable shortcut legend visible at %i columns and %i rows", (width, rows) => {
  const base = root(); const plan = parsePlan(add(base, "example", complete), "example", base);
  const plans = Array.from({ length: 30 }, (_, index) => ({ ...plan, stub: `spec-${index}` }));
  const theme = { ...testTheme(), fg: vi.fn((_: string, value: string) => value) };
  const done = vi.fn();
  const component = planSelector(plans, 29, done)({ requestRender() {}, terminal: { rows } }, theme);
  const rendered = component.render(width);
  const text = rendered.map(line => stripTerminalSequences(line).slice(2, -2).trim()).join(" ");
  expect(text).toContain("▶ spec-29");
  expect(text).toContain("↑↓ Select · Enter Details · Esc/q Close");
  expect(text).toContain("Actions: o VS Code · c Copy command · r Run here · d Run in new tab · a Archive");
  expect(rendered.length).toBeLessThanOrEqual(Math.floor(rows * 0.8));
  expect(rendered.every(line => visibleWidth(line) <= width)).toBe(true);
  expect(theme.fg).toHaveBeenCalledWith("text", expect.stringContaining("Actions:"));
  component.handleInput("d");
  expect(done).toHaveBeenCalledExactlyOnceWith({ action: "do-it", index: 29 });
});

it("keeps the selected plan visible in a short list viewport", () => {
  const base = root(); const plans = Array.from({ length: 12 }, (_, i) => {
    const title = `Plan ${String(i).padStart(2, "0")}`; return parsePlan(add(base, `p${i}`, complete.replace("Zebra", title)), `p${i}`, base);
  });
  const tui = { requestRender() {}, terminal: { rows: 18 } };
  const component = planSelector(plans, 0, vi.fn())(tui, testTheme());
  for (let index = 0; index < 11; index++) { component.handleInput("\x1b[B"); component.render(40); }
  const rendered = component.render(40).map(stripTerminalSequences).join("\n");
  expect(rendered).toContain("▶ p11"); expect(rendered).not.toContain("Plan 00");
  expect(rendered).toContain("Enter Details");
  expect(component.render(40).length).toBeLessThanOrEqual(14);
  tui.terminal.rows = 30;
  expect(component.render(80).join("\n")).toContain("▶ p11");
});

it.each([[24, 18], [32, 24], [80, 35], [20, 10]])("fits a %i-column, %i-row terminal", (width, rows) => {
  const base = root(); const stub = "long-spec-".repeat(8);
  const plan = parsePlan(add(base, stub, complete.replace("Zebra", "界面 ".repeat(40))), stub, base);
  const done = vi.fn();
  const component = planSelector([plan], 0, done)({ requestRender() {}, terminal: { rows } }, testTheme());
  for (let view = 0; view < 2; view++) {
    const rendered = component.render(width);
    expect(rendered.length).toBeLessThanOrEqual(Math.floor(rows * 0.8));
    expect(rendered.every(row => visibleWidth(row) <= width)).toBe(true);
    if (width >= 32 && view === 0) expect(rendered.join("\n")).toContain("Tasks");
    component.handleInput("\r");
  }
  component.handleInput("q"); expect(done).toHaveBeenCalledWith({ action: "close", index: 0 });
});

it.each(["rpc", "json", "print"])("rejects %s mode without opening terminal UI", async mode => {
  const custom = vi.fn();
  await expect(executePlans({ mode, ui: { custom } } as any, { sendUserMessage: vi.fn() })).rejects.toThrow("interactive Pi terminal mode");
  expect(custom).not.toHaveBeenCalled();
});

it("renders an empty closable state", () => {
  const done = vi.fn(); const theme = testTheme();
  const component = planSelector([], 0, done)({ requestRender() {} }, theme);
  expect(component.render(80).join("\n")).toContain("No open plans");
  for (const key of ["o", "c", "r", "d", "a"]) component.handleInput(key);
  expect(done).not.toHaveBeenCalled();
  component.handleInput("q");
  expect(done).toHaveBeenCalledWith({ action: "close", index: 0 });
});

it("refuses do-it outside Herdr without launching a fallback", async () => {
  vi.stubEnv("HERDR_ENV", "0");
  const base = root(); add(base, "ready", complete);
  let component!: Picker;
  const custom = vi.fn((factory: any) => new Promise(resolve => {
    component = factory({ requestRender() {}, terminal: { rows: 24 } }, testTheme(), {}, resolve);
    component.handleInput("d");
  }));
  const execution = executePlans({ mode: "tui", cwd: base, ui: { custom, notify: vi.fn() } } as any, { sendUserMessage: vi.fn() });
  expect(component.render(80).join("\n")).toContain("Launching new tab");
  await nextTurn();
  const failure = component.render(80).join("\n");
  expect(failure).toContain("Browse"); expect(failure).toContain("Safe to retry");
  expect(failure).toContain("requires a Herdr-managed Pi session");
  expect(createHerdrPiTab).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
  component.handleInput("q"); await execution;
  expect(custom).toHaveBeenCalledOnce();
});

it("cancels archive without changing the plan", async () => {
  const base = root(); const file = add(base, "done", complete); let calls = 0;
  const custom = vi.fn(async (factory: any) => {
    let value: any; const component = factory({ requestRender() {}, terminal: { rows: 24 } }, testTheme(), {}, (result:any) => { value = result; });
    if (calls++ === 0) { component.handleInput("\r"); component.handleInput("a"); } else component.handleInput("q");
    return value;
  });
  const confirm = vi.fn(async () => false);
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify: vi.fn(), confirm } } as any, { sendUserMessage: vi.fn() });
  expect(confirm).toHaveBeenCalledOnce();
  expect(readFileSync(file, "utf8")).toContain("status: completed");
});

it.each([false, true])("copies without executing and preserves the originating view (details=%s)", async details => {
  vi.stubEnv("HERDR_ENV", "0");
  const base = root(); add(base, "copy-this", complete); let calls = 0;
  const notify = vi.fn(); const sendUserMessage = vi.fn();
  vi.mocked(copyToClipboard).mockResolvedValue(undefined);
  const custom = vi.fn(async (factory: any) => {
    let value: any;
    const component = factory({ requestRender() {}, terminal: { rows: 35 } }, testTheme(), {}, (result: any) => { value = result; });
    if (calls++ === 0) { if (details) component.handleInput("\r"); component.handleInput("c"); }
    else { expect(component.render(100).join("\n")).toContain(`Plans · ${details ? "Details" : "Browse"}`); component.handleInput("q"); }
    return value;
  });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify } } as any, { sendUserMessage });
  expect(copyToClipboard).toHaveBeenCalledExactlyOnceWith("/do-it .specs/copy-this/plan.md");
  expect(notify).toHaveBeenCalledWith("Copied /do-it command for copy-this.", "info");
  expect(sendUserMessage).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
});

it("reports a clipboard failure without claiming success or executing", async () => {
  const base = root(); add(base, "copy-this", complete); let calls = 0;
  const notify = vi.fn(); const sendUserMessage = vi.fn();
  vi.mocked(copyToClipboard).mockRejectedValue(new Error("Clipboard unavailable"));
  const custom = vi.fn(async (factory: any) => {
    let value: any;
    const component = factory({ requestRender() {} }, testTheme(), {}, (result: any) => { value = result; });
    if (calls++ === 0) { component.handleInput("\r"); component.handleInput("c"); } else component.handleInput("q");
    return value;
  });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify } } as any, { sendUserMessage, appendEntry: vi.fn() });
  expect(notify).toHaveBeenCalledExactlyOnceWith("Clipboard unavailable", "error");
  expect(sendUserMessage).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
});

it("runs here through the registered command with template expansion and closes the picker", async () => {
  vi.stubEnv("HERDR_ENV", "0");
  const base = root(); add(base, "run-this", complete);
  const sendUserMessage = vi.fn(); const registerCommand = vi.fn();
  plansCommand({ registerCommand, sendUserMessage, on: vi.fn() } as any);
  const custom = vi.fn(async (factory: any) => {
    let value: any;
    const component = factory({ requestRender() {} }, testTheme(), {}, (result: any) => { value = result; });
    component.handleInput("\r"); component.handleInput("r"); return value;
  });
  await registerCommand.mock.calls[0]![1].handler("", { mode: "tui", cwd: base, ui: { custom, notify: vi.fn() } });
  expect(sendUserMessage).toHaveBeenCalledExactlyOnceWith("/do-it .specs/run-this/plan.md", { expandPromptTemplates: true, deliverAs: "followUp" });
  expect(custom).toHaveBeenCalledOnce();
  expect(copyToClipboard).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
});

it("renames the inherited Herdr tab by exact stub and records a successful current submission once", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_TAB_ID", "origin-tab");
  const base = root(); add(base, "stub-name", complete);
  const appendEntry = vi.fn(); const sendUserMessage = vi.fn(); const notify = vi.fn();
  vi.mocked(renameHerdrPiTab).mockResolvedValue(undefined);
  let value: any;
  const custom = vi.fn(async (factory: any) => {
    const component = factory({ requestRender() {} }, testTheme(), {}, (result: any) => { value = result; });
    component.handleInput("r"); return value;
  });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify }, sessionManager: { getSessionId: () => "session" } } as any, { sendUserMessage, appendEntry });
  expect(renameHerdrPiTab).toHaveBeenCalledExactlyOnceWith("origin-tab", "stub-name", base);
  expect(sendUserMessage).toHaveBeenCalledExactlyOnceWith("/do-it .specs/stub-name/plan.md", { expandPromptTemplates: true, deliverAs: "followUp" });
  const events = appendEntry.mock.calls.filter(([type]) => type === "plan-action-event").map(([, data]) => data);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "plans", phase: "invocation", outcome: "started" }),
    expect.objectContaining({ action: "run-here", phase: "naming", outcome: "success", target: { tabId: "origin-tab" } }),
    expect.objectContaining({ action: "run-here", phase: "submission", outcome: "requested" }),
    expect.objectContaining({ action: "run-here", phase: "outcome", outcome: "success", plan: expect.objectContaining({ stub: "stub-name" }) }),
  ]));
  expect(notify).not.toHaveBeenCalledWith(expect.stringContaining("rename"), "warning");
});

it("records missing Herdr tab identity as a naming failure and still submits once", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_TAB_ID", "");
  const base = root(); add(base, "missing-tab", complete);
  const sendUserMessage = vi.fn(); const notify = vi.fn(); const appendEntry = vi.fn();
  const custom = vi.fn(async (factory: any) => {
    let value: any;
    const component = factory({ requestRender() {} }, testTheme(), {}, (result: any) => { value = result; });
    component.handleInput("r"); return value;
  });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify }, sessionManager: { getSessionId: () => "session" } } as any, { sendUserMessage, appendEntry });
  expect(sendUserMessage).toHaveBeenCalledOnce();
  expect(appendEntry.mock.calls.map(([, data]) => data)).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "run-here", phase: "naming", outcome: "failed", error: expect.objectContaining({ stage: "identity" }) }),
    expect.objectContaining({ action: "run-here", phase: "outcome", outcome: "success" }),
  ]));
});

it("records one terminal failure when Run here submission throws", async () => {
  vi.stubEnv("HERDR_ENV", "0");
  const base = root(); add(base, "send-failure", complete);
  const sendUserMessage = vi.fn(() => { throw new Error("send unavailable"); }); const notify = vi.fn(); const appendEntry = vi.fn();
  let calls = 0;
  const custom = vi.fn(async (factory: any) => {
    let value: any;
    const component = factory({ requestRender() {} }, testTheme(), {}, (result: any) => { value = result; });
    if (calls++ === 0) component.handleInput("r"); else component.handleInput("q");
    return value;
  });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify }, sessionManager: { getSessionId: () => "session" } } as any, { sendUserMessage, appendEntry });
  const failures = appendEntry.mock.calls.map(([, data]) => data).filter((data: any) => data.action === "run-here" && data.outcome === "failed");
  expect(sendUserMessage).toHaveBeenCalledOnce();
  expect(failures).toHaveLength(1);
  expect(failures[0]).toMatchObject({ phase: "outcome", error: { stage: "submission", message: "send unavailable" } });
});

it("records discovery and UI boundary failures", async () => {
  const base = root(); writeFileSync(join(base, ".specs"), "not a directory");
  const appendEntry = vi.fn(); const notify = vi.fn();
  const custom = vi.fn(async () => { throw new Error("overlay unavailable"); });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify } } as any, { sendUserMessage: vi.fn(), appendEntry });
  const events = appendEntry.mock.calls.map(([, data]) => data);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "plans", phase: "outcome", outcome: "failed", error: expect.objectContaining({ stage: "discovery" }) }),
    expect.objectContaining({ action: "plans", phase: "outcome", outcome: "failed", error: expect.objectContaining({ stage: "ui" }) }),
  ]));
  expect(notify).toHaveBeenCalledWith("overlay unavailable", "error");
});

it("submits Run here once when Herdr tab naming fails", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_TAB_ID", "origin-tab");
  const base = root(); add(base, "rename-failure", complete);
  const sendUserMessage = vi.fn(); const notify = vi.fn(); const appendEntry = vi.fn();
  vi.mocked(renameHerdrPiTab).mockRejectedValue(new Error("rename unavailable"));
  const custom = vi.fn(async (factory: any) => {
    let value: any;
    const component = factory({ requestRender() {} }, testTheme(), {}, (result: any) => { value = result; });
    component.handleInput("r"); return value;
  });
  await executePlans({ mode: "tui", cwd: base, ui: { custom, notify }, sessionManager: { getSessionId: () => "session" } } as any, { sendUserMessage, appendEntry });
  expect(sendUserMessage).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("rename unavailable"), "warning");
  expect(appendEntry.mock.calls.map(([, data]) => data)).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "run-here", phase: "naming", outcome: "failed" }),
    expect.objectContaining({ action: "run-here", phase: "outcome", outcome: "success" }),
  ]));
});

it.each([false, true])( "acknowledges a delayed launch, ignores repeats, and dismisses without reopening (details=%s)", async details => {
  vi.stubEnv("HERDR_ENV", "1");
  const base = root(); add(base, "aaa-other", complete); add(base, "new-tab", complete);
  let completeLaunch!: (value: { tabId: string }) => void;
  vi.mocked(createHerdrPiTab).mockReturnValue(new Promise(resolve => { completeLaunch = resolve; }));
  const sendUserMessage = vi.fn(); const notify = vi.fn(); const requestRender = vi.fn();
  let component!: Picker;
  const custom = vi.fn((factory: any) => new Promise(resolve => {
    component = factory({ requestRender }, testTheme(), {}, resolve);
    component.handleInput("\x1b[B"); if (details) component.handleInput("\r"); component.handleInput("d");
  }));
  const execution = executePlans({ mode: "tui", cwd: base, ui: { custom, notify } } as any, { sendUserMessage, appendEntry: vi.fn() });
  expect(component.render(100).join("\n")).toContain("Launching new tab...");
  expect(component.render(100).join("\n")).toContain(`Plans · ${details ? "Details" : "Browse"}`);
  expect(requestRender).toHaveBeenCalledWith(true);
  expect(createHerdrPiTab).not.toHaveBeenCalled();
  for (const key of ["d", "d", "\r", "r", "c", "o", "a", "q", "\x1b"]) component.handleInput(key);
  await nextTurn();
  expect(createHerdrPiTab).toHaveBeenCalledExactlyOnceWith(base, "new-tab", undefined, ".specs/new-tab/plan.md", expect.any(String));
  component.handleInput("d");
  expect(custom).toHaveBeenCalledOnce(); expect(notify).not.toHaveBeenCalled();
  completeLaunch({ tabId: "tab-test" }); await execution;
  expect(custom).toHaveBeenCalledOnce();
  component.handleInput("d"); expect(createHerdrPiTab).toHaveBeenCalledOnce();
  expect(sendUserMessage).not.toHaveBeenCalled(); expect(copyToClipboard).not.toHaveBeenCalled();
});

it.each([false, true])("preserves view and selection on a safe launch failure and allows one retry (details=%s)", async details => {
  const base = root(); const plan = parsePlan(add(base, "selected", complete), "selected", base);
  const launch = vi.fn().mockRejectedValueOnce(new HerdrPiTabLaunchError("Launcher unavailable", { mayHaveLaunched: false })).mockResolvedValueOnce({ tabId: "new-tab" });
  const done = vi.fn();
  const component = planSelector([plan, { ...plan, stub: "second" }], 1, done, { details, launch })({ requestRender() {} }, testTheme());
  component.handleInput("d"); await nextTurn();
  const failure = component.render(100).join("\n");
  expect(failure).toContain(`Plans · ${details ? "Details" : "Browse"} · 2/2`);
  expect(failure).toContain("Safe to retry"); expect(failure).toContain("Launcher unavailable");
  expect(done).not.toHaveBeenCalled();
  component.handleInput("d"); component.handleInput("d"); await nextTurn();
  expect(launch).toHaveBeenCalledTimes(2);
  expect(done).toHaveBeenCalledExactlyOnceWith({ action: "close", index: 1 });
});

it("blocks repeat execution after an uncertain result, including after another action reopens the picker", async () => {
  const base = root(); const plan = parsePlan(add(base, "selected", complete), "selected", base);
  const blockedLaunches = new Map<string, string>();
  const launch = vi.fn().mockRejectedValue(new HerdrPiTabLaunchError("Tab w1:t8 exists; focus failed", { mayHaveLaunched: true, tabId: "w1:t8" }));
  const done = vi.fn();
  const options = { launch, blockedLaunches };
  const component = planSelector([plan], 0, done, options)({ requestRender() {} }, testTheme());
  component.handleInput("d"); await nextTurn();
  expect(component.render(100).join("\n")).toContain("Do not retry");
  expect(component.render(100).join("\n")).toContain("w1:t8");
  component.handleInput("d"); component.handleInput("r");
  expect(done).not.toHaveBeenCalled(); expect(launch).toHaveBeenCalledOnce();
  component.handleInput("c"); expect(done).toHaveBeenCalledWith({ action: "copy", index: 0 });
  const reopenedDone = vi.fn();
  const reopened = planSelector([plan], 0, reopenedDone, options)({ requestRender() {} }, testTheme());
  reopened.handleInput("d"); reopened.handleInput("r");
  expect(reopenedDone).not.toHaveBeenCalled(); expect(launch).toHaveBeenCalledOnce();
  reopened.handleInput("q"); expect(reopenedDone).toHaveBeenCalledWith({ action: "close", index: 0 });
});

it.each([[24, 18], [40, 18], [100, 35]])("keeps pending and failure feedback within %i columns and %i rows", async (width, rows) => {
  const base = root(); const plan = parsePlan(add(base, "selected", complete), "selected", base);
  const launch = vi.fn().mockRejectedValue(new HerdrPiTabLaunchError("Focus failed for existing tab w1:t8", { mayHaveLaunched: true, tabId: "w1:t8" }));
  for (const details of [false, true]) {
    const component = planSelector([plan], 0, vi.fn(), { launch, details })({ requestRender() {}, terminal: { rows } }, testTheme());
    component.handleInput("d");
    for (let phase = 0; phase < 2; phase++) {
      const lines = component.render(width);
      expect(lines.length).toBeLessThanOrEqual(Math.floor(rows * 0.8));
      expect(lines.every(line => visibleWidth(line) <= width)).toBe(true);
      await nextTurn();
    }
  }
});

it("does not finish or redraw a disposed picker when a launch settles", async () => {
  const base = root(); const plan = parsePlan(add(base, "selected", complete), "selected", base);
  let resolveLaunch!: () => void;
  const launch = vi.fn(() => new Promise<void>(resolve => { resolveLaunch = resolve; }));
  const done = vi.fn(); const requestRender = vi.fn();
  const component = planSelector([plan], 0, done, { launch })({ requestRender }, testTheme());
  component.handleInput("d"); await nextTurn(); component.dispose(); requestRender.mockClear();
  resolveLaunch(); await nextTurn();
  expect(done).not.toHaveBeenCalled(); expect(requestRender).not.toHaveBeenCalled();
});

it.each([false, true])("shows live state without changing frontmatter while allowing explicit execution shortcuts (details=%s)", details => {
  const base = root(); const file = add(base, "active", complete);
  const plan = parsePlan(file, "active", base); const store = new PlanRunStore(join(root(), "runs"));
  const run = store.claim(file, { pid: process.pid, state: "running", tabId: "w1:t9" });
  const done = vi.fn(); const launch = vi.fn();
  const component = planSelector([plan], 0, done, { details, launch, getRun: p => store.get(p.path) })({ requestRender() {} }, testTheme());
  for (const state of ["running", "waiting", "blocked", "launching", "unknown"] as const) {
    store.update(file, run.token, { state });
    const output = component.render(100).join("\n");
    expect(output).toContain(state); expect(output).toContain("w1:t9"); expect(output).not.toContain("Disabled");
    component.handleInput("r"); component.handleInput("d");
    expect(done).toHaveBeenCalledWith({ action: "run-here", index: 0 }); expect(launch).not.toHaveBeenCalled();
  }
  expect(plan.status).toBe("completed"); expect(readFileSync(file, "utf8")).toBe(complete);
  component.handleInput("c"); expect(done).toHaveBeenCalledWith({ action: "run-here", index: 0 });
});

it("keeps ownership informational at keypress and allows execution shortcuts", () => {
  const base = root(); const file = add(base, "active", complete); const plan = parsePlan(file, "active", base);
  const store = new PlanRunStore(join(root(), "runs")); const done = vi.fn();
  const component = planSelector([plan], 0, done, { getRun: p => store.get(p.path) })({ requestRender() {} }, testTheme());
  component.render(100);
  const run = store.claim(file, { pid: process.pid, state: "running", tabId: "other-tab" });
  component.handleInput("r"); expect(done).toHaveBeenCalledWith({ action: "run-here", index: 0 });
  store.release(file, run.token);
});

it.each([[24, 18], [40, 18], [100, 35]])("keeps live status and action legends bounded at %i columns/%i rows", (width, rows) => {
  const base = root(); const file = add(base, "active", complete); const plan = parsePlan(file, "active", base);
  const store = new PlanRunStore(join(root(), "runs")); store.claim(file, { pid: process.pid, state: "running", tabId: "other-tab" });
  for (const details of [false, true]) {
    const component = planSelector([plan], 0, vi.fn(), { details, getRun: p => store.get(p.path) })({ requestRender() {}, terminal: { rows } }, testTheme());
    const lines = component.render(width);
    expect(lines.length).toBeLessThanOrEqual(Math.floor(rows * 0.8)); expect(lines.every(line => visibleWidth(line) <= width)).toBe(true);
    expect(lines.join("\n")).not.toContain("Disabled"); expect(lines.join("\n")).toContain("Run here"); component.dispose();
  }
});

it("refreshes live state while open and stops refreshing on disposal", () => {
  vi.useFakeTimers();
  try {
    const base = root(); const file = add(base, "active", complete); const plan = parsePlan(file, "active", base);
    const requestRender = vi.fn();
    const component = planSelector([plan], 0, vi.fn(), { getRun: () => undefined })({ requestRender }, testTheme());
    vi.advanceTimersByTime(1000); expect(requestRender).toHaveBeenCalledOnce();
    component.dispose(); vi.advanceTimersByTime(3000); expect(requestRender).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it("fails closed when live execution state cannot be read", () => {
  const base = root(); const plan = parsePlan(add(base, "active", complete), "active", base);
  const done = vi.fn(); const component = planSelector([plan], 0, done, {
    getRun() { throw new Error("Registry unreadable"); },
  })({ requestRender() {} }, testTheme());
  expect(component.render(100).join("\n")).toContain("Execution check failed");
  component.handleInput("d"); component.handleInput("r"); expect(done).toHaveBeenCalledWith({ action: "do-it", index: 0 });
  component.handleInput("q");
});

it("shows ownership across fresh picker invocations without disabling explicit actions", async () => {
  const base = root(); const file = add(base, "active", complete);
  getPlanRunRuntime().store.claim(file, { pid: process.pid, state: "running", tabId: "other-tab" });
  const sendUserMessage = vi.fn();
  const custom = vi.fn((factory: any) => new Promise(resolve => {
    const picker = factory({ requestRender() {} }, testTheme(), {}, resolve);
    expect(picker.render(100).join("\n")).toContain("running");
    expect(picker.render(100).join("\n")).not.toContain("Disabled"); picker.handleInput("r"); picker.handleInput("d"); picker.handleInput("q");
  }));
  for (let count = 0; count < 2; count++) await executePlans({ mode: "tui", cwd: base, ui: { custom, notify: vi.fn() } } as any, { sendUserMessage });
  expect(custom).toHaveBeenCalledTimes(2); expect(sendUserMessage).toHaveBeenCalledOnce(); expect(createHerdrPiTab).not.toHaveBeenCalled();
});

it("allows explicit replacement from two open pickers", async () => {
  vi.stubEnv("HERDR_ENV", "1"); const base = root(); add(base, "active", complete);
  vi.mocked(createHerdrPiTab).mockResolvedValue({ tabId: "new-tab" });
  const pickers: Picker[] = []; const sendUserMessage = vi.fn();
  const custom = vi.fn((factory: any) => new Promise(resolve => {
    const picker = factory({ requestRender() {} }, testTheme(), {}, resolve);
    pickers.push(picker); picker.handleInput("d");
  }));
  const ctx = { mode: "tui", cwd: base, ui: { custom, notify: vi.fn() } } as any;
  await Promise.all([executePlans(ctx, { sendUserMessage }), executePlans(ctx, { sendUserMessage })]);
  expect(pickers).toHaveLength(2);
  expect(createHerdrPiTab).toHaveBeenCalledTimes(2); expect(sendUserMessage).not.toHaveBeenCalled();
});

it("opens the exact plan path in VS Code without a shell", () => {
  const base = root(); const plan = parsePlan(add(base, "space plan", complete), "space plan", base);
  vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any); openPlanInCode(plan, base);
  expect(spawnSync).toHaveBeenCalledWith("code", ["-g", plan.path], expect.objectContaining({ cwd: base, shell: false }));
});

it("archives only eligible plans without overwriting", () => {
  const base = root(); const file = add(base, "done", complete); writeFileSync(join(base, ".specs", "done", "notes.md"), "notes");
  const destination = archivePlan(parsePlan(file, "done", base), base);
  expect(readFileSync(join(destination, "notes.md"), "utf8")).toBe("notes");
  expect(() => archivePlan({ ...parsePlan(join(destination, "plan.md"), "done", base), path: join(destination, "plan.md") }, base)).toThrow();
});

it.each([
  ["status", complete.replace("status: completed", "status: blocked"), "status must be completed"],
  ["date", complete.replace("completed: 2026-09-09", "completed: null"), "completion date"],
  ["tasks", complete.replace("[x] Second", "[ ] Second"), "unchecked tasks"],
])("refuses archive with invalid %s", (_name, body, message) => {
  const base = root(); const file = add(base, "bad", body);
  expect(() => archivePlan(parsePlan(file, "bad", base), base)).toThrow(message);
});

it("refuses a symlinked plan source outside .specs", () => {
  const base = root(); const external = join(base, "outside"); mkdirSync(external); writeFileSync(join(external, "plan.md"), complete); mkdirSync(join(base, ".specs"), { recursive: true });
  try { symlinkSync(external, join(base, ".specs", "escape"), "junction"); } catch { return; }
  const plan = parsePlan(join(base, ".specs", "escape", "plan.md"), "escape", base);
  expect(() => archivePlan(plan, base)).toThrow("escapes");
});
