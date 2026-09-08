import { describe, expect, it } from "vitest";
import type { HerdrCli } from "../lib/herdr-cli.ts";
import { CHILDREN_PER_ROW, CHILDREN_PER_TAB, SubagentLayout, layoutSlot } from "../lib/subagents/layout.ts";

class LayoutFixture {
  calls: string[][] = [];
  panes = new Map<string, any>([
    ["w1:p1", { pane_id: "w1:p1", tab_id: "w1:t1", workspace_id: "w1", rect: { x: 0, y: 0, width: 100, height: 40 } }],
    ["w2:p1", { pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2", rect: { x: 0, y: 0, width: 100, height: 40 } }],
  ]);
  focus = "w2:p1";
  nextPane = 2;
  nextTab = 2;
  failRename = false;
  tabs = new Set(["w1:t1", "w2:t1"]);
  constructor() {
    this.cli = this.run.bind(this);
  }
  readonly cli: HerdrCli;
  private async run(args: string[]): Promise<string> {
    this.calls.push(args);
    const command = args.slice(0, 2).join(" ");
    if (command === "pane get") {
      const pane = this.panes.get(args[2]);
      if (!pane) throw new Error("unknown pane");
      return JSON.stringify({ result: { pane } });
    }
    // This fixture models the production caller-context behavior: `pane
    // current` resolves HERDR_PANE_ID, while list records expose actual UI
    // focus independently.
    if (command === "pane current") return JSON.stringify({ result: { pane: this.panes.get("w1:p1") } });
    if (command === "workspace list") {
      const workspaces = [...new Set([...this.panes.values()].map(pane => pane.workspace_id))].map(workspace_id => ({
        workspace_id,
        focused: [...this.panes.values()].some(pane => pane.workspace_id === workspace_id && pane.pane_id === this.focus),
      }));
      return JSON.stringify({ result: { workspaces } });
    }
    if (command === "tab list") {
      const workspaceId = args[3];
      const tabs = [...this.tabs].filter(tab_id => tab_id.startsWith(`${workspaceId}:`)).map(tab_id => ({
        tab_id,
        workspace_id: workspaceId,
        focused: [...this.panes.values()].some(pane => pane.pane_id === this.focus && pane.tab_id === tab_id),
        pane_count: [...this.panes.values()].filter(pane => pane.tab_id === tab_id).length,
      }));
      return JSON.stringify({ result: { tabs } });
    }
    if (command === "pane list") {
      const workspaceId = args[3];
      const panes = [...this.panes.values()].filter(pane => pane.workspace_id === workspaceId).map(pane => ({ ...pane, focused: pane.pane_id === this.focus }));
      return JSON.stringify({ result: { panes } });
    }
    if (command === "pane layout") {
      const pane = this.panes.get(args[3]);
      const panes = [...this.panes.values()].filter(candidate => candidate.tab_id === pane?.tab_id);
      return JSON.stringify({ result: { layout: { panes, focused_pane_id: this.focus } } });
    }
    if (command === "pane neighbor") {
      const source = this.panes.get(args[5]);
      const peers = [...this.panes.values()].filter(pane => pane.tab_id === source?.tab_id);
      const neighbor = peers.find(pane => pane.pane_id !== source?.pane_id);
      if (!neighbor) throw new Error("edge");
      return JSON.stringify({ result: { neighbor: { neighbor_pane_id: neighbor.pane_id } } });
    }
    if (command === "pane focus") {
      this.focus = args[5];
      return "";
    }
    if (command === "workspace focus") {
      this.focus = [...this.panes.values()].find(pane => pane.workspace_id === args[2])?.pane_id ?? this.focus;
      return "";
    }
    if (command === "tab focus") {
      this.focus = [...this.panes.values()].find(pane => pane.tab_id === args[2])?.pane_id ?? this.focus;
      return "";
    }
    if (command === "pane rename") { if (this.failRename) throw new Error("rename failed"); return ""; }
    if (command === "pane resize") return "";
    if (command === "pane swap") {
      this.focus = args[3];
      return "";
    }
    if (command === "plugin pane") {
      if (args[2] === "close") {
        this.panes.delete(args[3]);
        return "";
      }
      const tabId = args.includes("--placement") && args[args.indexOf("--placement") + 1] === "tab" ? `w1:t${this.nextTab++}` : "w1:t1";
      this.tabs.add(tabId);
      const paneId = `w1:p${this.nextPane++}`;
      this.panes.set(paneId, { pane_id: paneId, tab_id: tabId, workspace_id: "w1", label: "Pi", rect: { x: 0, y: 0, width: 50, height: 20 } });
      return JSON.stringify({ result: { plugin_pane: { pane: this.panes.get(paneId) } } });
    }
    if (command === "tab close") {
      this.tabs.delete(args[2]);
      return "";
    }
    throw new Error(`unhandled ${args.join(" ")}`);
  }
}

function allocations(count: number) {
  const occupied: Array<{ tabIndex: number; row: number; column: number }> = [];
  for (let i = 0; i < count; i++) occupied.push(layoutSlot(occupied));
  return occupied;
}

describe("subagent layout contract", () => {
  it.each([
    [1, 0, 0, 0], [4, 0, 0, 3], [5, 0, 1, 0], [8, 0, 1, 3],
    [9, 1, 0, 0], [17, 2, 0, 0],
  ])("allocates child %i at tab %i row %i column %i", (child, tab, row, column) => {
    const slots = allocations(child);
    expect(slots[child - 1]).toEqual({ tabIndex: tab, row, column });
  });

  it("reuses the first vacated slot without renumbering occupied slots", () => {
    expect(layoutSlot([
      { tabIndex: 0, row: 0, column: 0 },
      { tabIndex: 0, row: 0, column: 2 },
      { tabIndex: 0, row: 0, column: 3 },
    ])).toEqual({ tabIndex: 0, row: 0, column: 1 });
    expect(CHILDREN_PER_ROW * 2).toBe(CHILDREN_PER_TAB);
  });

  it("uses focused list records instead of inherited caller context", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    expect((JSON.parse(await fixture.cli(["pane", "current"]))).result.pane.pane_id).toBe("w1:p1");
    const placement = await layout.place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    });
    expect(placement.paneId).toBe("w1:p2");
    expect(fixture.focus).toBe("w2:p1");
  });

  it("serializes concurrent placement, preserves unrelated focus, and returns exact IDs", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const requests = Array.from({ length: 17 }, (_, index) => layout.place("origin", {
      childId: `child-${index + 1}`, callerPane: "w1:p1", cwd: "C:/work", title: `Clara · explorer ${index + 1}`,
      plugin: "local.pi", entrypoint: "pi", env: ["PI_HERDR_PROFILE_DIR=C:/profile"],
    }));
    const placements = await Promise.all(requests);
    expect(new Set(placements.map(placement => placement.paneId)).size).toBe(17);
    expect(placements.map(placement => [placement.tabIndex, placement.row, placement.column])).toContainEqual([0, 1, 0]);
    expect(placements.map(placement => [placement.tabIndex, placement.row, placement.column])).toContainEqual([1, 0, 0]);
    expect(placements.at(-1)).toMatchObject({ tabIndex: 2, row: 0, column: 0 });
    expect(fixture.calls.some(call => call[0] === "plugin" && call[2] === "open" && call.includes("--direction") && call[call.indexOf("--direction") + 1] === "down" && call[call.indexOf("--target-pane") + 1] === "w1:p2")).toBe(true);
    expect(fixture.calls.some(call => call[0] === "pane" && call[1] === "resize" && call.includes("--direction") && call[call.indexOf("--direction") + 1] === "right")).toBe(true);
    expect(fixture.focus).toBe("w2:p1");
    expect(fixture.calls.filter(call => call[0] === "plugin" && call[2] === "open").every(call => call.at(-1) === "--no-focus")).toBe(true);
    expect(fixture.calls.filter(call => call[0] === "pane" && call[1] === "rename")).toHaveLength(17);
  });

  it("keeps a created pane owned when placement polish fails", async () => {
    const fixture = new LayoutFixture();
    fixture.failRename = true;
    const layout = new SubagentLayout(fixture.cli);
    await expect(layout.place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    })).rejects.toThrow(/rename failed/);
    expect(fixture.calls.some(call => call[0] === "plugin" && call[2] === "close")).toBe(false);
    expect(layout.snapshot("origin")).toHaveLength(1);
  });

  it("compacts a row after its first physical pane closes", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    for (let i = 1; i <= 3; i++) await layout.place("origin", {
      childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
    });
    const first = (await layout.snapshot("origin")).find(child => child.column === 0)!;
    await layout.close("origin", first.childId, first.paneId);
    expect((await layout.snapshot("origin")).map(child => child.column).sort()).toEqual([0, 1]);
    const replacement = await layout.place("origin", {
      childId: "replacement", callerPane: "w1:p1", cwd: "C:/work", title: "Replacement", plugin: "local.pi", entrypoint: "pi",
    });
    expect(replacement).toMatchObject({ row: 0, column: 2 });
  });

  it("closes only an owned pane and removes an empty owned overflow tab", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const placement = await layout.place("origin", {
      childId: "overflow", callerPane: "w1:p1", cwd: "C:/work", title: "Maya · reviewer", plugin: "local.pi", entrypoint: "pi",
    });
    // Fill the first tab so the next placement is an owned overflow tab.
    for (let i = 2; i <= 9; i++) await layout.place("origin", {
      childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
    });
    const overflow = (await layout.snapshot("origin")).find(child => child.tabIndex === 1)!;
    fixture.focus = overflow.paneId;
    await layout.close("origin", overflow.childId, overflow.paneId);
    expect(fixture.focus).toBe("w1:p1");
    expect(fixture.calls).toContainEqual(["tab", "close", overflow.tabId]);
    await expect(layout.close("origin", "not-owned", placement.paneId)).rejects.toThrow(/not owned/);
    expect(fixture.panes.has("w2:p1")).toBe(true);
  });
});
