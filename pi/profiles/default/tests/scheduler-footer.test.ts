import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: () => ({ status: 0, stdout: "0.85.0" }) }));
vi.mock("node:fs", () => ({ readFileSync: () => { throw new Error("no local state"); } }));
vi.mock("../lib/reload-monitor.ts", () => ({ ReloadMonitor: class {
  needed = false;
  error = undefined;
  reset() {}
  check() {}
} }));

import registerFooter from "../extensions/operator-footer.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

afterEach(() => vi.useRealTimers());

it("renders the scheduler status in the actual footer alongside provider usage and clears it", async () => {
  vi.useFakeTimers();
  const hooks = new Map<string, (...args: any[]) => any>();
  const statuses = new Map<string, string>();
  let footer: { render: (width: number) => string[] };
  const pi = {
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
  statuses.set("codex", "codex: 5h 25% | wk 75%");
  statuses.set("bedrock", "bedrock: $0.00");
  const lines = footer!.render(160);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("codex: 5h 25%");
  expect(lines[1]).toContain("~42 tok/s | first 1.2s");
  expect(lines[1]).toContain("sched@");
  expect(lines[1]).toContain("bedrock:");
  statuses.set("unicode", "状态 🟢");
  for (const width of [1, 10, 30, 80, 160]) {
    expect(footer!.render(width).every(line => visibleWidth(line) <= width)).toBe(true);
  }
  expect(footer!.render(160).join("\n")).toContain("sched@ 9:00am");
  expect(footer!.render(160).join("\n")).toContain("bedrock:");
  expect(footer!.render(30).join("\n")).toContain("sched@ 9:00am");
  statuses.delete("schedule");
  expect(footer!.render(160).join("\n")).not.toContain("sched@");
  await hooks.get("session_shutdown")!({}, ctx);
});
