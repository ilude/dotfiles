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
  expect(footer!.render(160).join("\n")).toContain("sched@ 9:00am");
  expect(footer!.render(160).join("\n")).toContain("bedrock:");
  expect(footer!.render(30).join("\n")).toContain("sched@ 9:00am");
  statuses.delete("schedule");
  expect(footer!.render(160).join("\n")).not.toContain("sched@");
  await hooks.get("session_shutdown")!({}, ctx);
});
