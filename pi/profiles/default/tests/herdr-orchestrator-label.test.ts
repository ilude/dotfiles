import { afterEach, beforeEach, expect, it, vi } from "vitest";
import register from "../extensions/herdr-orchestrator-label.ts";

beforeEach(() => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_PANE_ID", "w1:p1"); vi.stubEnv("HERDR_TAB_ID", "w1:t1");
  vi.stubEnv("HERDR_WORKSPACE_ID", "w1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_BIN_PATH", "fixture-herdr");
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", ""); vi.stubEnv("PI_HERDR_SUBAGENT", ""); vi.stubEnv("PI_HERDR_TAB_LABEL", "");
  vi.stubEnv("PI_HERDR_TAB_TITLE", ""); vi.stubEnv("PI_HERDR_TAB_TITLE_EXPLICIT", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function fixture(cwd = "/work/.dotfiles/") {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const busHandlers: Record<string, (data: unknown) => void> = {};
  const exec = vi.fn().mockImplementation(async (_bin, args: string[]) => {
    if (args[0] === "tab" && args[1] === "get") return { code: 0, killed: false, stdout: JSON.stringify({ result: { tab: { tab_id: "w1:t1", workspace_id: "w1", label: ".dotfiles" } } }), stderr: "" };
    if (args[0] === "pane" && args[1] === "get") return { code: 0, killed: false, stdout: JSON.stringify({ result: { pane: { pane_id: "w1:p1", tab_id: "w1:t1", workspace_id: "w1" } } }), stderr: "" };
    return { code: 0, killed: false, stdout: "", stderr: "" };
  });
  const entries: unknown[] = [];
  const ctx = { mode: "tui", cwd, ui: { notify: vi.fn() }, sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" } };
  register({ on(name: string, handler: any) { handlers[name] = handler; }, exec, events: { on(name: string, handler: any) { busHandlers[name] = handler; }, emit(name: string, data: unknown) { busHandlers[name]?.(data); } } } as any);
  return { exec, handlers, ctx, entries, start: (reason = "startup", mode = "tui") => handlers.session_start({ reason }, { ...ctx, mode }) };
}

it("labels the startup pane and establishes the child-owned base title", async () => {
  const f = fixture(); await f.start();
  expect(f.exec.mock.calls.slice(0, 2).map(call => call[1])).toEqual([
    ["pane", "rename", "w1:p1", "Orchestrator"], ["tab", "rename", "w1:t1", ".dotfiles"],
  ]);
});

it("preserves an explicit launch title literally and performs no naming request", async () => {
  vi.stubEnv("PI_HERDR_TAB_TITLE", "My Plan"); vi.stubEnv("PI_HERDR_TAB_TITLE_EXPLICIT", "1");
  const f = fixture(); f.entries.push({ type: "message", message: { role: "user", content: "restored task" } });
  await f.start();
  expect(f.exec).toHaveBeenCalledWith("fixture-herdr", ["tab", "rename", "w1:t1", "My Plan"], expect.anything());
  expect(f.exec.mock.calls.some(call => call[1]?.[0] === "tab" && call[1]?.[1] === "get")).toBe(false);
});

it("preserves the plan child pane label", async () => {
  vi.stubEnv("PI_HERDR_TAB_LABEL", "my-plan"); vi.stubEnv("PI_HERDR_TAB_TITLE", "my-plan"); vi.stubEnv("PI_HERDR_TAB_TITLE_EXPLICIT", "1");
  const f = fixture(); await f.start();
  expect(f.exec).not.toHaveBeenCalled();
});

it("resets inherited explicit metadata on a new session", async () => {
  vi.stubEnv("PI_HERDR_TAB_TITLE", "My Plan"); vi.stubEnv("PI_HERDR_TAB_TITLE_EXPLICIT", "1");
  const f = fixture(); await f.start("new");
  expect(f.exec).toHaveBeenCalledWith("fixture-herdr", ["tab", "rename", "w1:t1", ".dotfiles"], expect.anything());
});

it.each(["rpc", "json", "print"])("does nothing for %s helpers", async mode => {
  const f = fixture(); await f.start("startup", mode); expect(f.exec).not.toHaveBeenCalled();
});

it.each([["PI_SUBAGENT_AUTHORITY", "restricted"], ["PI_HERDR_SUBAGENT", "child"], ["HERDR_ENV", ""], ["HERDR_SOCKET_PATH", ""]])("skips excluded context %s", async (key, value) => {
  vi.stubEnv(key, value); const f = fixture(); await f.start(); expect(f.exec).not.toHaveBeenCalled();
});

it("keeps routine label failures silent", async () => {
  const f = fixture(); f.exec.mockRejectedValue(new Error("unavailable"));
  await expect(f.start()).resolves.toBeUndefined(); expect(f.ctx.ui.notify).not.toHaveBeenCalled();
});

it("invalidates naming work on tree navigation and shutdown", async () => {
  const f = fixture(); await f.start();
  await f.handlers.session_tree({}, f.ctx); await f.handlers.session_shutdown({ reason: "quit" }, f.ctx);
  expect(f.ctx.ui.notify).not.toHaveBeenCalled();
});
