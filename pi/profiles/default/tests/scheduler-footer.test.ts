import { afterEach, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn((..._args: any[]) => ({ status: 0, stdout: "0.85.0" })) }));
vi.mock("node:child_process", () => ({ spawnSync: spawnSyncMock }));
vi.mock("node:fs", () => ({ readFileSync: () => { throw new Error("no local state"); } }));
vi.mock("../lib/reload-monitor.ts", () => ({ ReloadMonitor: class {
  needed = false;
  error = undefined;
  reset() {}
  check() {}
} }));
vi.mock("../lib/release-indicators.ts", () => ({
  RELEASE_CHECK_INTERVAL: 4 * 60 * 60 * 1000,
  cachedReleases: async () => ({ fresh: true }),
  checkReleases: async () => ({ pi: [], herdr: [] }),
  releaseLag: () => undefined,
  releaseUrl: (_product: string, version: string) => `https://example.test/${version}`,
}));

import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import registerFooter from "../extensions/operator-footer.ts";
import { visibleWidth, type Component, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { CODEX_QUOTA_LOGIN_REQUEST } from "../lib/codex-auth.ts";
import { formatQuota } from "../lib/codex-usage.ts";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); spawnSyncMock.mockReset(); spawnSyncMock.mockReturnValue({ status: 0, stdout: "0.85.0" }); });

it.each([
  { linked: true, branch: "611-activity-approve-unlock-title", label: "worktree[611]" },
  { linked: true, branch: "podman-pipline", label: "worktree[podman-pipline]" },
  { linked: false, branch: "611-activity-approve-unlock-title", label: "repo[611-activity-approve-unlock-title]" },
])("formats checkout location: $label", async ({ linked, branch, label }) => {
  vi.stubEnv("HERDR_ENV", "0");
  const cwd = `/footer-fixture/${branch}/${linked}`;
  spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: linked ? `${cwd}/.git/worktrees/topic` : `${cwd}/.git` })
    .mockReturnValueOnce({ status: 0, stdout: `${cwd}/.git` })
    .mockReturnValueOnce({ status: 0, stdout: "/footer-fixture/repo" });
  const hooks = new Map<string, (...args: any[]) => any>();
  let footer: { render(width: number): string[] } | undefined;
  const statuses = new Map([["codex", "codex: wk 2%"]]);
  const pi = { events: createEventBus(), on: (name: string, hook: (...args: any[]) => any) => hooks.set(name, hook), getCommands: () => [], getAllTools: () => [] };
  registerFooter(pi);
  await hooks.get("session_start")!({}, {
    cwd, model: { id: "test-model", provider: "openai" }, sessionManager: { getEntries: () => [] },
    getContextUsage: () => ({ tokens: 0, contextWindow: 272000, percent: 0 }),
    ui: { setStatus: vi.fn(), setFooter: (factory: any) => { footer = factory({ requestRender: vi.fn() }, {}, { getGitBranch: () => branch, getExtensionStatuses: () => statuses }); } },
  });
  const calls = spawnSyncMock.mock.calls.length;
  const plain = (width: number) => footer!.render(width)[0].replace(/\x1b\[[0-9;]*m/g, "");
  expect(plain(240)).toContain(label);
  if (linked) {
    expect(footer!.render(240)[0]).toContain("\x1b[38;5;205mworktree");
    expect(footer!.render(240)[0]).toContain(`\x1b[36m${branch.startsWith("611-") ? "611" : branch}`);
    expect(plain(240).split("[")).toHaveLength(3); // Location and thinking level only.
  } else {
    expect(plain(85)).toContain("repo[611]");
    expect(plain(85)).toContain("test-model");
    expect(plain(85)).toContain("codex: wk 2%");
  }
  for (const width of [1, 30, 85, 240]) expect(visibleWidth(footer!.render(width)[0])).toBeLessThanOrEqual(width);
  expect(spawnSyncMock).toHaveBeenCalledTimes(calls);
  await hooks.get("session_shutdown")!({}, {});
});

it.each(["1", "0"])("shows the connected Herdr server version only inside Herdr (%s)", async (enabled) => {
  vi.stubEnv("HERDR_ENV", enabled);
  spawnSyncMock.mockImplementation((command: string) => ({ status: 0, stdout: command === "herdr"
    ? JSON.stringify({ client: { version: "9.9.9" }, server: { running: true, version: "0.9.3-preview.2026-10-12-6d697e1e75ff" } })
    : "/footer-fixture/repo" }));
  const hooks = new Map<string, (...args: any[]) => any>();
  let footer: { render(width: number): string[] };
  registerFooter({ events: createEventBus(), on: (name, hook) => { hooks.set(name, hook); }, getCommands: () => [], getAllTools: () => [] });
  await hooks.get("session_start")!({}, {
    cwd: "/footer-herdr", sessionManager: { getEntries: () => [] },
    ui: { setStatus: vi.fn(), setFooter: (factory: any) => {
      footer = factory({ requestRender: vi.fn() }, {}, { getGitBranch: () => null, getExtensionStatuses: () => new Map() });
    } },
  });
  const calls = spawnSyncMock.mock.calls.length;
  const line = footer!.render(240)[0].replace(/\x1b\[[0-9;]*m/g, "");
  if (enabled === "1") expect(line).toMatch(/η v0\.9\.3-preview \| π v/);
  else expect(line).not.toContain("η");
  expect(line).not.toContain("9.9.9");
  expect(line).not.toContain("2026-10-12");
  expect(line).not.toContain("6d697e1e75ff");
  expect(spawnSyncMock).toHaveBeenCalledTimes(calls);
  await hooks.get("session_shutdown")!({}, {});
});

it("makes only the visible login label clickable and removes the action when quota returns", async () => {
  const hooks = new Map<string, (...args: any[]) => any>();
  const events = createEventBus();
  const login = vi.fn();
  events.on(CODEX_QUOTA_LOGIN_REQUEST, login);
  const statuses = new Map([["codex", "codex: login needed"]]);
  let footer: Component;
  registerFooter({ events, on: (name, hook) => { hooks.set(name, hook); }, getCommands: () => [], getAllTools: () => [] });
  await hooks.get("session_start")!({}, {
    cwd: "/footer-login-状态", sessionManager: { getEntries: () => [] },
    ui: { setStatus: vi.fn(), setFooter: (factory: any) => {
      footer = factory({ requestRender: vi.fn() }, {}, { getGitBranch: () => "状态", getExtensionStatuses: () => statuses });
    } },
  });
  const line = footer!.render(240)[0];
  expect(line).toContain("\x1b[4mlogin needed\x1b[24m");
  const start = visibleWidth(line.slice(0, line.indexOf("login needed")));
  const click = (x: number, overrides: Partial<TuiMouseEvent> = {}) => footer!.handleMouse!({
    type: "click", button: "left", x, y: 0, screenX: x, screenY: 0, width: 240, height: 1,
    shift: false, alt: false, ctrl: false, ...overrides,
  });
  expect(click(start - 1)).toBeUndefined();
  expect(click(start, { y: 1 })).toBeUndefined();
  expect(click(start, { button: "right" })).toBeUndefined();
  expect(click(start, { type: "press" })).toBeUndefined();
  expect(click(start)).toEqual({ handled: true });
  expect(click(start + visibleWidth("login needed") - 1)).toEqual({ handled: true });
  expect(click(start + visibleWidth("login needed"))).toBeUndefined();
  expect(login).toHaveBeenCalledTimes(2);
  footer!.render(8);
  expect(click(start)).toBeUndefined();
  footer!.render(240);
  statuses.set("codex", "codex: wk 2%");
  expect(click(start)).toBeUndefined(); // No stale hit target before the next redraw, either.
  expect(footer!.render(240)[0]).not.toContain("login needed");
  expect(click(start)).toBeUndefined();
  await hooks.get("session_shutdown")!({}, {});
});

it("renders the scheduler status in the actual footer alongside provider usage and clears it", async () => {
  vi.useFakeTimers();
  spawnSyncMock.mockClear();
  const hooks = new Map<string, (...args: any[]) => any>();
  const statuses = new Map<string, string>();
  let footer: { render: (width: number) => string[] };
  const pi = {
    events: createEventBus(),
    on: (name: string, hook: (...args: any[]) => any) => hooks.set(name, hook),
    getCommands: () => [], getAllTools: () => [],
  };
  const ctx = {
    cwd: process.cwd(), isProjectTrusted: () => false,
    sessionManager: { getEntries: () => [] },
    ui: {
      getAllThemes: () => [], notify: vi.fn(),
      setStatus: (key: string, text: string | undefined) => text ? statuses.set(key, text) : statuses.delete(key),
      setFooter: (factory: any) => { footer = factory({ requestRender: vi.fn() }, {}, {
        getGitBranch: () => null, getExtensionStatuses: () => statuses,
      }); },
    },
  };
  registerFooter(pi);
  await hooks.get("session_start")!({}, ctx);
  statuses.set("schedule", "sched@ 9:00am");
  statuses.set("tps", "~42 tok/s | first 1.2s | ~84 tok / 2.0s streaming");
  statuses.set("onclave-v2", "Onclave[4]: pi-01a082");
  statuses.set("codex", "codex: 5h 25% | wk 75%");
  statuses.set("bedrock", "bedrock: $0.00");
  const subprocessCountAfterInstall = spawnSyncMock.mock.calls.length;
  const lines = footer!.render(160);
  expect(spawnSyncMock).toHaveBeenCalled();
  expect(spawnSyncMock).toHaveBeenCalledTimes(subprocessCountAfterInstall);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("codex: 5h 25%");
  expect(lines[1]).toContain("~42 tok/s | first 1.2s");
  expect(lines[1]).toContain("sched@");
  expect(lines[1]).toMatch(/^Onclave\[4\]: pi-01a082 \| sched@/);
  expect(lines[1]).toContain("bedrock:");
  statuses.set("unicode", "状态 🟢");
  for (const width of [1, 10, 30, 80, 160]) {
    expect(footer!.render(width).every(line => visibleWidth(line) <= width)).toBe(true);
  }
  expect(footer!.render(160).join("\n")).toContain("sched@ 9:00am");
  expect(footer!.render(160).join("\n")).toContain("bedrock:");
  expect(footer!.render(30)[1]).toContain("Onclave[4]: pi-01a082");
  const quota = formatQuota({ rate_limit: { primary_window: { limit_window_seconds: 604800, used_percent: 2 } } });
  statuses.set("codex", quota);
  const weeklyFooter = footer!.render(160);
  expect(weeklyFooter[0]).toContain("codex: wk 2%");
  expect(weeklyFooter[0]).not.toContain("5h");
  expect(weeklyFooter[0]).not.toContain("cache-read");
  statuses.delete("schedule");
  expect(footer!.render(160).join("\n")).not.toContain("sched@");
  await hooks.get("session_shutdown")!({}, ctx);
});
