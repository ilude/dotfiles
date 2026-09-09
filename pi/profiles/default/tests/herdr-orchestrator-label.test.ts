import { afterEach, beforeEach, expect, it, vi } from "vitest";
import register from "../extensions/herdr-orchestrator-label.ts";

beforeEach(() => {
  vi.stubEnv("HERDR_ENV", "1");
  vi.stubEnv("HERDR_PANE_ID", "w1:p1");
  vi.stubEnv("HERDR_TAB_ID", "w1:t1");
  vi.stubEnv("HERDR_SOCKET_PATH", "fixture-only");
  vi.stubEnv("HERDR_BIN_PATH", "fixture-herdr");
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  vi.stubEnv("PI_HERDR_SUBAGENT", "");
});
afterEach(() => vi.unstubAllEnvs());

function fixture(cwd = "/work/.dotfiles/") {
  const handlers: Record<string, (...args: any[]) => Promise<void>> = {};
  const exec = vi.fn().mockResolvedValue({ code: 0, killed: false, stdout: "", stderr: "" });
  const notify = vi.fn();
  register({ on(name: string, handler: any) { handlers[name] = handler; }, exec } as any);
  return { exec, notify, start: (reason = "startup", mode = "tui") => handlers.session_start({ reason }, { mode, cwd, ui: { notify } }) };
}

it("labels the inherited startup pane and tab without changing focus", async () => {
  const f = fixture();
  expect(f.exec).not.toHaveBeenCalled();
  await f.start();
  expect(f.exec.mock.calls).toEqual([
    ["fixture-herdr", ["pane", "rename", "w1:p1", "Orchestrator"], { timeout: 2000 }],
    ["fixture-herdr", ["tab", "rename", "w1:t1", ".dotfiles"], { timeout: 2000 }],
  ]);
  expect(f.notify).not.toHaveBeenCalled();
});

it("passes directory names with spaces as one literal label argument", async () => {
  const f = fixture("/work/project with spaces/");
  await f.start();
  expect(f.exec).toHaveBeenCalledWith("fixture-herdr", ["tab", "rename", "w1:t1", "project with spaces"], { timeout: 2000 });
});

it("keeps pane labeling when the tab identity is unavailable", async () => {
  vi.stubEnv("HERDR_TAB_ID", "");
  const f = fixture();
  await f.start();
  expect(f.exec).toHaveBeenCalledTimes(1);
  expect(f.exec.mock.calls[0][1]).toEqual(["pane", "rename", "w1:p1", "Orchestrator"]);
});

it.each(["new", "resume", "fork", "reload"])("preserves later pane labels on %s", async reason => {
  const f = fixture();
  await f.start(reason);
  expect(f.exec).not.toHaveBeenCalled();
});

it.each(["rpc", "json", "print"])("does not label a %s helper", async mode => {
  const f = fixture();
  await f.start("startup", mode);
  expect(f.exec).not.toHaveBeenCalled();
});

it.each([
  ["PI_SUBAGENT_AUTHORITY", "restricted"], ["PI_HERDR_SUBAGENT", "child-endpoint"],
  ["HERDR_ENV", ""], ["HERDR_PANE_ID", ""], ["HERDR_SOCKET_PATH", ""],
])("skips child or unavailable Herdr context: %s", async (key, value) => {
  vi.stubEnv(key, value);
  const f = fixture();
  await f.start();
  expect(f.exec).not.toHaveBeenCalled();
});

it.each(["exit", "timeout", "spawn"])("reports %s failure without failing startup or retrying", async failure => {
  const f = fixture();
  if (failure === "spawn") f.exec.mockRejectedValue(new Error("spawn failed"));
  else f.exec.mockResolvedValue({ code: 1, killed: failure === "timeout", stderr: "unavailable" });
  await expect(f.start()).resolves.toBeUndefined();
  expect(f.exec).toHaveBeenCalledTimes(2);
  expect(f.notify).toHaveBeenCalledWith(expect.stringContaining("Herdr pane label unavailable:"), "warning");
  expect(f.notify).toHaveBeenCalledWith(expect.stringContaining("Herdr tab label unavailable:"), "warning");
});
