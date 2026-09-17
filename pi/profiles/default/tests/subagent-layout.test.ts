import { describe, expect, it, vi } from "vitest";
import { createPaneFocus } from "../lib/subagents/herdr-layout-api.ts";

vi.mock("../lib/subagents/herdr-layout-api.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/subagents/herdr-layout-api.ts")>(),
  createPaneFocus: vi.fn(),
}));
import type { HerdrCli } from "../lib/herdr-cli.ts";
import { CHILDREN_PER_ROW, CHILDREN_PER_TAB, LayoutReconciliationError, SubagentLayout, layoutSlot } from "../lib/subagents/layout.ts";

class LayoutFixture {
  calls: string[][] = [];
  focusRequests: string[] = [];
  focusAfterOpen?: string;
  focusAfterSwap?: string;
  panes = new Map<string, any>([
    ["w1:p1", { pane_id: "w1:p1", tab_id: "w1:t1", workspace_id: "w1", rect: { x: 0, y: 0, width: 100, height: 40 } }],
    ["w2:p1", { pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2", rect: { x: 0, y: 0, width: 100, height: 40 } }],
  ]);
  focus = "w2:p1";
  nextPane = 2;
  nextTab = 2;
  failRename = false;
  failTabRename = false;
  failCreatedInspect = false;
  failLayout = false;
  tabs = new Set(["w1:t1", "w2:t1", "w1:manual"]);
  tabTitles = new Map([["w1:t1", "drift"], ["w2:t1", "unrelated"], ["w1:manual", "Manual tab"]]);
  constructor() {
    this.cli = this.run.bind(this);
    vi.mocked(createPaneFocus).mockReturnValue(async paneId => { this.focusRequests.push(paneId); this.focus = paneId; });
  }
  readonly cli: HerdrCli;
  private async run(args: string[]): Promise<string> {
    this.calls.push(args);
    const command = args.slice(0, 2).join(" ");
    if (command === "pane get") {
      if (this.failCreatedInspect && args[2] !== "w1:p1") throw new Error("created pane inspection failed");
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
    if (command === "tab get") {
      const tabId = args[2];
      const title = this.tabTitles.get(tabId);
      if (!this.tabs.has(tabId) || !title) throw new Error("unknown tab");
      return JSON.stringify({ result: { tab: { tab_id: tabId, workspace_id: tabId.startsWith("w1:") ? "w1" : "w2", label: title } } });
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
      if (this.failLayout) throw new Error('{"error":{"code":"pane_not_found","message":"pane not found"},"id":"cli:pane:layout"}');
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
    if (command === "tab rename") { if (this.failTabRename) throw new Error("tab rename failed"); this.tabTitles.set(args[2], args.slice(3).join(" ")); return ""; }
    if (command === "pane resize") return "";
    if (command === "pane swap") {
      this.focus = this.focusAfterSwap ?? args[3];
      return "";
    }
    if (command === "plugin pane") {
      if (args[2] === "close") {
        const wasFocused = this.focus === args[3];
        this.panes.delete(args[3]);
        if (wasFocused) this.focus = "w1:p1";
        return "";
      }
      const target = this.panes.get(args[args.indexOf("--target-pane") + 1]);
      const tabId = args.includes("--placement") && args[args.indexOf("--placement") + 1] === "tab" ? `w1:t${this.nextTab++}` : target.tab_id;
      this.tabs.add(tabId);
      if (!this.tabTitles.has(tabId)) this.tabTitles.set(tabId, "New tab");
      const paneId = `w1:p${this.nextPane++}`;
      this.panes.set(paneId, { pane_id: paneId, tab_id: tabId, workspace_id: "w1", label: "Pi", rect: { x: 0, y: 0, width: 50, height: 20 } });
      if (this.focusAfterOpen) this.focus = this.focusAfterOpen;
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
    expect(CHILDREN_PER_TAB).toBe(CHILDREN_PER_ROW * 2);
  });

  it("distinguishes successful pane closure from a subsequent reconciliation failure", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = { callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi" };
    const first = await layout.place("origin", { ...request, childId: "first" });
    const second = await layout.place("origin", { ...request, childId: "second" });
    fixture.failLayout = true;
    const closed = layout.close("origin", "first", first.paneId);
    await expect(closed).rejects.toBeInstanceOf(LayoutReconciliationError);
    await expect(closed).rejects.toThrow("pane_not_found");
    expect(fixture.panes.has(first.paneId)).toBe(false);
    expect(layout.snapshot("origin")).toMatchObject([{ childId: "second", paneId: second.paneId }]);
    fixture.failLayout = false;
    await layout.close("origin", "second", second.paneId);
    expect(layout.snapshot("origin")).toEqual([]);
  });

  it("uses focused list records instead of inherited caller context", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    expect((JSON.parse(await fixture.cli(["pane", "current"]))).result.pane.pane_id).toBe("w1:p1");
    const placement = await layout.place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    });
    expect(placement.paneId).toBe("w1:p2");
    // The first downward split is swapped above the caller. Restore the actual
    // viewed pane, not the inherited caller context.
    expect(fixture.calls).toContainEqual(["pane", "swap", "--source-pane", "w1:p1", "--target-pane", placement.paneId]);
    expect(fixture.focusRequests).toEqual(["w2:p1"]);
    expect(fixture.focus).toBe("w2:p1");
    expect(fixture.calls.some(call => call[0] === "workspace" && call[1] === "focus")).toBe(false);
    expect(fixture.calls.some(call => call[0] === "pane" && call[1] === "focus")).toBe(false);
  });

  it("observes a user focus change after opening and does not restore an older snapshot", async () => {
    const fixture = new LayoutFixture();
    fixture.focus = "w1:p1";
    fixture.focusAfterOpen = "w2:p1";
    await new SubagentLayout(fixture.cli).place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    });
    expect(fixture.focus).toBe("w2:p1");
    expect(fixture.focusRequests).toEqual(["w2:p1"]);
  });

  it("does not restore focus if the user moved away after the swap", async () => {
    const fixture = new LayoutFixture();
    fixture.focusAfterSwap = "w1:p2";
    await new SubagentLayout(fixture.cli).place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    });
    expect(fixture.focus).toBe("w1:p2");
    expect(fixture.focusRequests).toEqual([]);
  });

  it("serializes concurrent placement and returns exact IDs", async () => {
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
    expect(fixture.calls.filter(call => call[0] === "plugin" && call[2] === "open" && call.includes("--placement") && call[call.indexOf("--placement") + 1] === "tab")).toHaveLength(2);
    expect(fixture.calls.some(call => call[0] === "pane" && call[1] === "resize" && call.includes("--direction") && ["left", "right"].includes(call[call.indexOf("--direction") + 1]!))).toBe(true);
    expect(fixture.focus).toBe("w2:p1");
    expect(fixture.calls.filter(call => call[0] === "plugin" && call[2] === "open").every(call => call.at(-1) === "--no-focus")).toBe(true);
    expect(fixture.calls.some(call => call[0] === "workspace" && call[1] === "focus")).toBe(false);
    expect(fixture.calls.some(call => call[0] === "tab" && call[1] === "focus")).toBe(false);
    expect(fixture.calls.some(call => call[0] === "pane" && call[1] === "focus")).toBe(false);
    expect(fixture.calls.filter(call => call[0] === "pane" && call[1] === "rename")).toHaveLength(17);
    expect(fixture.calls.filter(call => call[0] === "tab" && call[1] === "rename").map(call => call.slice(2))).toEqual([
      ["w1:t2", "Clara · explorer 9"], ["w1:t2", "drift · agents 2"],
      ["w1:t3", "Clara · explorer 17"],
    ]);
  });

  it("uses agent titles for singletons and a cached origin for groups without renaming other tabs", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    await layout.place("origin", {
      childId: "first", callerPane: "w1:p1", cwd: "C:/work", title: "First", plugin: "local.pi", entrypoint: "pi",
    });
    fixture.tabTitles.set("w1:t1", "Manual origin title");
    for (let i = 2; i <= 18; i++) {
      await layout.place("origin", {
        childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
      });
      if (i === 9) fixture.tabTitles.set("w1:t1", "Updated origin title");
    }
    expect(fixture.tabTitles.get("w1:t1")).toBe("Updated origin title");
    expect(fixture.tabTitles.get("w1:manual")).toBe("Manual tab");
    expect(fixture.calls.filter(call => call[0] === "tab" && call[1] === "get" && call[2] === "w1:t1")).toHaveLength(1);
    expect(fixture.calls.filter(call => call[0] === "tab" && call[1] === "rename").map(call => call.slice(2))).toEqual([
      ["w1:t2", "Child 9"], ["w1:t2", "Manual origin title · agents 2"],
      ["w1:t3", "Child 17"], ["w1:t3", "Manual origin title · agents 3"],
    ]);
    expect(fixture.focusRequests).toEqual(["w2:p1"]);
  });

  it("renames a shrinking group to its remaining agent and a refilled group back to its origin", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = { callerPane: "w1:p1", cwd: "C:/work", plugin: "local.pi", entrypoint: "pi" };
    for (let i = 1; i <= 8; i++) await layout.place("origin", { ...request, childId: `child-${i}`, title: `Child ${i}` });
    const elena = await layout.place("origin", { ...request, childId: "elena", title: "Elena · reviewer" });
    expect(fixture.tabTitles.get(elena.tabId)).toBe("Elena · reviewer");
    const maya = await layout.place("origin", { ...request, childId: "maya", title: "Maya · developer" });
    expect(maya.tabId).toBe(elena.tabId);
    expect(fixture.tabTitles.get(elena.tabId)).toBe("drift · agents 2");
    await layout.close("origin", elena.childId, elena.paneId);
    expect(fixture.tabTitles.get(maya.tabId)).toBe("Maya · developer");
    const nora = await layout.place("origin", { ...request, childId: "nora", title: "Nora · validator" });
    expect(fixture.tabTitles.get(nora.tabId)).toBe("drift · agents 2");
    await layout.close("origin", nora.childId, nora.paneId);
    expect(fixture.tabTitles.get(maya.tabId)).toBe("Maya · developer");
    await layout.close("origin", maya.childId, maya.paneId);
    expect(fixture.tabs.has(maya.tabId)).toBe(false);
    const iris = await layout.place("origin", { ...request, childId: "iris", title: "Iris · explorer" });
    expect(iris.tabId).not.toBe(maya.tabId);
    expect(fixture.tabTitles.get(iris.tabId)).toBe("Iris · explorer");
    expect(fixture.focus).toBe("w2:p1");
  });

  it.each([9, 12])("preserves manual overflow titles through joins and departures from %i children", async count => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = { callerPane: "w1:p1", cwd: "C:/work", plugin: "local.pi", entrypoint: "pi" };
    for (let i = 1; i <= count; i++) await layout.place("origin", { ...request, childId: `child-${i}`, title: `Child ${i}` });
    const overflow = layout.snapshot("origin").find(child => child.tabIndex === 1)!;
    fixture.tabTitles.set(overflow.tabId, "Manual overflow");
    const newcomer = await layout.place("origin", { ...request, childId: "elena", title: "Elena · reviewer" });
    expect(fixture.tabTitles.get(overflow.tabId)).toBe("Manual overflow");
    // Keep departures within the owned overflow group while exercising its
    // manually protected title across a later vacancy replacement.
    for (const child of layout.snapshot("origin").filter(child => child.tabIndex === 1 && child.childId !== newcomer.childId).slice(0, 3)) {
      await layout.close("origin", child.childId, child.paneId);
    }
    expect(fixture.tabTitles.get(overflow.tabId)).toBe("Manual overflow");
    // A detected manual owner stays protected even if its later title matches a generated title.
    fixture.tabTitles.set(overflow.tabId, "drift · agents 2");
    const nora = await layout.place("origin", { ...request, childId: "nora", title: "Nora · validator" });
    await layout.close("origin", newcomer.childId, newcomer.paneId);
    expect(fixture.tabTitles.get(nora.tabId)).toBe("drift · agents 2");
  });

  it("keeps an overflow pane owned when its tab naming polish fails", async () => {
    const fixture = new LayoutFixture();
    fixture.failTabRename = true;
    const layout = new SubagentLayout(fixture.cli);
    for (let i = 1; i <= 8; i++) await layout.place("origin", {
      childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
    });
    await expect(layout.place("origin", {
      childId: "child-9", callerPane: "w1:p1", cwd: "C:/work", title: "Child 9", plugin: "local.pi", entrypoint: "pi",
    })).rejects.toMatchObject({ placement: { paneId: "w1:p10", tabId: "w1:t2" } });
    expect(layout.snapshot("origin")).toHaveLength(9);
    expect(fixture.panes.has("w1:p10")).toBe(true);
  });

  it("does not overwrite a focus switch during later placement or close", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const first = await layout.place("origin", {
      childId: "first", callerPane: "w1:p1", cwd: "C:/work", title: "First", plugin: "local.pi", entrypoint: "pi",
    });
    fixture.focus = "w2:p1";
    const second = await layout.place("origin", {
      childId: "second", callerPane: "w1:p1", cwd: "C:/work", title: "Second", plugin: "local.pi", entrypoint: "pi",
    });
    expect(fixture.focus).toBe("w2:p1");
    await layout.close("origin", second.childId, second.paneId);
    expect(fixture.focus).toBe("w2:p1");
    await layout.close("origin", first.childId, first.paneId);
  });

  it("replaces an upper-row vacancy above its surviving lower pane without renumbering either row", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    for (let i = 1; i <= 8; i++) await layout.place("origin", {
      childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
    });
    const removed = layout.snapshot("origin").find(child => child.childId === "child-2")!;
    const lower = layout.snapshot("origin").find(child => child.childId === "child-6")!;
    await layout.close("origin", removed.childId, removed.paneId);
    expect(layout.snapshot("origin").find(child => child.childId === lower.childId)).toMatchObject({ paneId: lower.paneId, row: 1, column: 1 });
    expect(layout.snapshot("origin").find(child => child.childId === "child-3")).toMatchObject({ row: 0, column: 2 });

    const replacement = await layout.place("origin", {
      childId: "replacement", callerPane: "w1:p1", cwd: "C:/work", title: "Replacement", plugin: "local.pi", entrypoint: "pi",
    });
    expect(replacement).toMatchObject({ row: 0, column: 1, tabId: lower.tabId });
    const open = fixture.calls.filter(call => call[0] === "plugin" && call[2] === "open").at(-1)!;
    expect(open.slice(open.indexOf("--direction"), open.indexOf("--direction") + 4)).toEqual(["--direction", "down", "--target-pane", lower.paneId]);
    expect(fixture.calls).toContainEqual(["pane", "swap", "--source-pane", lower.paneId, "--target-pane", replacement.paneId]);
  });

  it("refills both halves of a compacted full column from the matching row tails", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    for (let i = 1; i <= 8; i++) await layout.place("origin", {
      childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
    });
    const upper = layout.snapshot("origin").find(child => child.childId === "child-2")!;
    const lower = layout.snapshot("origin").find(child => child.childId === "child-6")!;
    await layout.close("origin", upper.childId, upper.paneId);
    await layout.close("origin", lower.childId, lower.paneId);
    expect(layout.snapshot("origin").filter(child => child.tabIndex === 0).map(child => [child.row, child.column])).toEqual([
      [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2],
    ]);

    const upperRefill = await layout.place("origin", {
      childId: "upper-refill", callerPane: "w1:p1", cwd: "C:/work", title: "Upper refill", plugin: "local.pi", entrypoint: "pi",
    });
    const lowerRefill = await layout.place("origin", {
      childId: "lower-refill", callerPane: "w1:p1", cwd: "C:/work", title: "Lower refill", plugin: "local.pi", entrypoint: "pi",
    });
    expect(upperRefill).toMatchObject({ row: 0, column: 3 });
    expect(lowerRefill).toMatchObject({ row: 1, column: 3 });
    const refillOpens = fixture.calls.filter(call => call[0] === "plugin" && call[2] === "open").slice(-2);
    expect(refillOpens.map(open => [
      open[open.indexOf("--direction") + 1],
      open[open.indexOf("--target-pane") + 1],
    ])).toEqual([
      ["right", layout.snapshot("origin").find(child => child.childId === "child-4")!.paneId],
      ["right", layout.snapshot("origin").find(child => child.childId === "child-8")!.paneId],
    ]);
  });

  it("targets the original caller at one third of the combined main layout height", async () => {
    const fixture = new LayoutFixture();
    await new SubagentLayout(fixture.cli).place("origin", {
      childId: "first", callerPane: "w1:p1", cwd: "C:/work", title: "First", plugin: "local.pi", entrypoint: "pi",
    });
    expect(fixture.calls).toContainEqual(["pane", "resize", "--direction", "down", "--amount", "0.666667", "--pane", "w1:p1"]);
  });

  it("recreates the upper row when only overflow children remain", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    for (let i = 1; i <= 9; i++) await layout.place("origin", {
      childId: `child-${i}`, callerPane: "w1:p1", cwd: "C:/work", title: `Child ${i}`, plugin: "local.pi", entrypoint: "pi",
    });
    for (const child of layout.snapshot("origin").filter(child => child.tabIndex === 0)) await layout.close("origin", child.childId, child.paneId);
    const replacement = await layout.place("origin", {
      childId: "replacement", callerPane: "w1:p1", cwd: "C:/work", title: "Replacement", plugin: "local.pi", entrypoint: "pi",
    });
    expect(replacement).toMatchObject({ tabIndex: 0, column: 0 });
    expect(fixture.calls).toContainEqual(["pane", "swap", "--source-pane", "w1:p1", "--target-pane", replacement.paneId]);
    expect(layout.snapshot("origin").find(child => child.childId === "child-9")).toMatchObject({ tabIndex: 1 });
  });

  it("keeps the exact created pane owned when identity inspection fails", async () => {
    const fixture = new LayoutFixture();
    fixture.failCreatedInspect = true;
    const layout = new SubagentLayout(fixture.cli);
    await expect(layout.place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    })).rejects.toMatchObject({ placement: { paneId: "w1:p2" } });
    expect(layout.snapshot("origin")).toMatchObject([{ childId: "child", paneId: "w1:p2" }]);
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
      childId: "first", callerPane: "w1:p1", cwd: "C:/work", title: "Maya · reviewer", plugin: "local.pi", entrypoint: "pi",
    });
    // Fill the caller tab, then create one pane in an owned overflow tab.
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
