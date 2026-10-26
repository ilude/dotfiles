import { describe, expect, it, vi } from "vitest";
import { createPaneFocus, currentPaneIdentity, focusedPane } from "../lib/subagents/herdr-layout-api.ts";

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
  area = {x:0,y:0,width:100,height:40};
  panes = new Map<string, any>([
    ["w1:p1", { pane_id: "w1:p1", tab_id: "w1:t1", workspace_id: "w1", terminal_id: "caller-terminal", rect: { x: 0, y: 0, width: 100, height: 40 } }],
    ["w2:p1", { pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2", rect: { x: 0, y: 0, width: 100, height: 40 } }],
  ]);
  focus = "w2:p1";
  nextPane = 2;
  nextTab = 2;
  failRename = false;
  failTabRename = false;
  failCreatedInspect = false;
  failLayout = false;
  failOpen = false;
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
    if (command === "api snapshot") return JSON.stringify({ result: { snapshot: { focused_pane_id: this.focus } } });
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
      return JSON.stringify({ result: { layout: { area:this.area, panes, focused_pane_id: this.focus } } });
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
    if (command === "pane move") {
      const pane = this.panes.get(args[2]);
      const tabId = args.includes("--new-tab") ? `w1:t${this.nextTab++}` : args[args.indexOf("--tab")+1];
      this.tabs.add(tabId);
      if (!this.tabTitles.has(tabId)) this.tabTitles.set(tabId,"New tab");
      pane.tab_id = tabId;
      return JSON.stringify({result:{move_result:{pane}}});
    }
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
      if (this.failOpen) throw new Error("open failed");
      const target = this.panes.get(args[args.indexOf("--target-pane") + 1]);
      const tabId = args.includes("--placement") && args[args.indexOf("--placement") + 1] === "tab" ? `w1:t${this.nextTab++}` : target.tab_id;
      this.tabs.add(tabId);
      if (!this.tabTitles.has(tabId)) this.tabTitles.set(tabId, "New tab");
      const paneId = `w1:p${this.nextPane++}`;
      this.panes.set(paneId, { pane_id: paneId, tab_id: tabId, workspace_id: "w1", terminal_id:`terminal-${paneId}`, label: "Pi", rect: { x: 0, y: 0, width: 50, height: 20 } });
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
  it("resolves a stale inherited caller alias to its current public pane identity", async () => {
    const cli: HerdrCli = async args => {
      expect(args).toEqual(["pane","current","--current"]);
      return JSON.stringify({result:{pane:{pane_id:"w1:p9",tab_id:"w1:t3",workspace_id:"w1",terminal_id:"term-caller"}}});
    };
    await expect(currentPaneIdentity(cli)).resolves.toEqual({pane_id:"w1:p9",tab_id:"w1:t3",workspace_id:"w1",terminal_id:"term-caller"});
  });

  it("rebinds an empty failed layout group only to the same caller terminal", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = { cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi" };
    fixture.failOpen=true;
    await expect(layout.place("origin",{...request,childId:"failed",callerPane:"w1:p1"})).rejects.toThrow("open failed");
    fixture.failOpen=false;
    fixture.panes.set("w1:p9",{pane_id:"w1:p9",tab_id:"w1:t3",workspace_id:"w1",terminal_id:"caller-terminal",rect:{x:0,y:0,width:100,height:40}});
    fixture.tabs.add("w1:t3"); fixture.tabTitles.set("w1:t3","moved");
    await expect(layout.place("origin",{...request,childId:"next",callerPane:"w1:p9"})).resolves.toMatchObject({childId:"next",tabId:"w1:t3"});
  });

  it("rejects rebinding an empty failed layout group to another terminal", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = { cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi" };
    fixture.failOpen=true;
    await expect(layout.place("origin",{...request,childId:"failed",callerPane:"w1:p1"})).rejects.toThrow("open failed");
    fixture.failOpen=false;
    fixture.panes.set("w1:p9",{pane_id:"w1:p9",tab_id:"w1:t3",workspace_id:"w1",terminal_id:"other-terminal",rect:{x:0,y:0,width:100,height:40}});
    await expect(layout.place("origin",{...request,childId:"next",callerPane:"w1:p9"})).rejects.toThrow("caller process identity changed");
  });

  it("launches from the surviving caller after all tracked children disappeared", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = { callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi" };
    const first = await layout.place("origin", { ...request, childId: "first" });
    const second = await layout.place("origin", { ...request, childId: "second" });
    fixture.panes.delete(first.paneId);
    fixture.panes.delete(second.paneId);
    const next = await layout.place("origin", { ...request, childId: "next" });
    expect(layout.snapshot("origin")).toEqual([next]);
    const opens = fixture.calls.filter(args => args.slice(0, 3).join(" ") === "plugin pane open");
    expect(opens.at(-1)).toContain("w1:p1");
    await layout.close("origin", "first", first.paneId);
    expect(fixture.panes.has(next.paneId)).toBe(true);
    expect(fixture.panes.has("w2:p1")).toBe(true);
  });

  it("reconciles missing overflow panes without selecting stale anchors", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    const children: Awaited<ReturnType<SubagentLayout["place"]>>[] = [];
    for (let i=0;i<5;i++) children.push(await layout.place("origin",{...request,childId:String(i)}));
    fixture.panes.delete(children[2].paneId);
    fixture.panes.delete(children[4].paneId);
    const next = await layout.place("origin",{...request,childId:"next"});
    expect(fixture.panes.has(next.paneId)).toBe(true);
    expect(layout.snapshot("origin").some(child => child.paneId === children[4].paneId)).toBe(false);
  });

  it("preserves manual geometry and routes new agents to overflow without splitting the dirty tab", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    const first = await layout.place("origin",{...request,childId:"first"});
    fixture.panes.get(first.paneId).rect.width += 8;
    const calls = fixture.calls.length;
    const second = await layout.place("origin",{...request,childId:"second"});
    expect(second.tabId).not.toBe(first.tabId);
    const subsequent = fixture.calls.slice(calls);
    expect(subsequent.filter(call => call[0] === "plugin" && call[2] === "open").every(call => !call.includes("--target-pane"))).toBe(true);
    expect(subsequent.some(call => call[0] === "pane" && call[1] === "resize" && call.includes(first.paneId))).toBe(false);
    expect(layout.snapshot("origin").find(child => child.childId === first.childId)?.paneId).toBe(first.paneId);
  });

  it("reassesses a whole-window resize without freezing the layout", async () => {
    const fixture = new LayoutFixture();
    const moved: string[] = [];
    const layout = new SubagentLayout(fixture.cli,undefined,id => moved.push(id));
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    const first = await layout.place("origin",{...request,childId:"first"});
    const second = await layout.place("origin",{...request,childId:"second"});
    fixture.area.width = 80;
    fixture.panes.get("w1:p1").rect.width = 80;
    for (const child of [first,second]) fixture.panes.get(child.paneId).rect.width = 40;
    const third = await layout.place("origin",{...request,childId:"third"});
    const current = layout.snapshot("origin");
    expect(current.filter(child => child.tabIndex === 0)).toHaveLength(1);
    expect(current.find(child => child.childId === second.childId)?.tabId).not.toBe(first.tabId);
    expect(third.tabId).not.toBe(first.tabId);
    expect(moved).toContain(second.childId);
  });

  it.each([[80,40,0],[49,40,1],[112,27,1]])("uses readable overflow at %i columns and %i rows", async (width,height,firstTab) => {
    const fixture = new LayoutFixture();
    fixture.area = {x:0,y:0,width,height};
    fixture.panes.get("w1:p1").rect = {...fixture.area};
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    const first = await layout.place("origin",{...request,childId:"first"});
    expect(first.tabIndex).toBe(firstTab);
    const second = await layout.place("origin",{...request,childId:"second"});
    if (width < 100) expect(second.tabId).not.toBe(first.tabId);
  });

  it("settles cleanup when an owned pane has already disappeared", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const child = await layout.place("origin", { childId: "first", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi" });
    fixture.panes.delete(child.paneId);
    await layout.close("origin", "first", child.paneId);
    expect(layout.snapshot("origin")).toEqual([]);
    expect(fixture.calls.some(args => args.slice(0, 3).join(" ") === "plugin pane close")).toBe(false);
  });
  it.each([
    [1,0,0,0], [2,0,0,1], [3,1,0,0], [4,1,0,1], [5,2,0,0], [17,8,0,0],
  ])("allocates child %i at tab %i row %i column %i", (child, tab, row, column) => {
    const slots = allocations(child);
    expect(slots[child - 1]).toEqual({ tabIndex: tab, row, column });
  });

  it("reuses the first vacated slot without renumbering occupied slots", () => {
    expect(layoutSlot([
      { tabIndex: 0, row: 0, column: 0 },
      { tabIndex: 1, row: 0, column: 0 },
    ])).toEqual({ tabIndex: 0, row: 0, column: 1 });
    expect(CHILDREN_PER_TAB).toBe(CHILDREN_PER_ROW);
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

  it("uses the focus snapshot instead of inherited caller context", async () => {
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

  it("keeps all ordinary agents in one row and overflows after two", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    for (let index=1;index<=5;index++) await layout.place("origin",{
      childId:`child-${index}`,callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi",
    });
    expect(layout.snapshot("origin").map(child => [child.tabIndex,child.row,child.column])).toEqual([[0,0,0],[0,0,1],[1,0,0],[1,0,1],[2,0,0]]);
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

  it.each(["w2:p1", "w1:p2"])("preserves changed focus %s from the post-swap snapshot", async focus => {
    const fixture = new LayoutFixture();
    fixture.focusAfterSwap = focus;
    const placed = await new SubagentLayout(fixture.cli).place("origin", {
      childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
    });
    expect(placed.paneId).toBe("w1:p2");
    expect(fixture.focus).toBe(focus);
    expect(fixture.focusRequests).toEqual([]);
  });

  it("keeps placement when the post-swap focus query fails", async () => {
    const fixture = new LayoutFixture();
    let reads = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const layout = new SubagentLayout(async args => {
        if (args.join(" ") === "api snapshot" && ++reads === 2) throw new Error("snapshot unavailable");
        return fixture.cli(args);
      });
      const placed = await layout.place("origin", {
        childId: "child", callerPane: "w1:p1", cwd: "C:/work", title: "Child", plugin: "local.pi", entrypoint: "pi",
      });
      expect(layout.snapshot("origin")).toMatchObject([{ paneId: placed.paneId }]);
      expect(fixture.focusRequests).toEqual([]);
      expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it("reads focus atomically without joining changing workspace/tab lists", async () => {
    const cli = vi.fn<HerdrCli>(async args => {
      expect(args).toEqual(["api", "snapshot"]);
      return JSON.stringify({ result: { snapshot: { focused_pane_id: "w2:p1" } } });
    });
    expect(await focusedPane(cli)).toBe("w2:p1");
    expect(cli).toHaveBeenCalledOnce();
  });

  it("accepts a snapshot with no focused pane", async () => {
    expect(await focusedPane(async () => JSON.stringify({ result: { snapshot: { focused_pane_id: null } } }))).toBeUndefined();
  });

  it("serializes concurrent placement and returns exact IDs without changing focus", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const placements = await Promise.all(Array.from({length:7},(_,index) => layout.place("origin",{
      childId:`child-${index+1}`,callerPane:"w1:p1",cwd:"C:/work",title:`Clara ${index+1}`,plugin:"local.pi",entrypoint:"pi",env:["PI_HERDR_PROFILE_DIR=C:/profile"],
    })));
    expect(new Set(placements.map(placement => placement.paneId)).size).toBe(7);
    expect(placements.at(-1)).toMatchObject({tabIndex:3,row:0,column:0});
    const opens = fixture.calls.filter(call => call[0] === "plugin" && call[2] === "open");
    expect(opens.filter(call => call[call.indexOf("--placement")+1] === "tab")).toHaveLength(3);
    expect(opens.every(call => call.at(-1) === "--no-focus")).toBe(true);
    expect(fixture.focus).toBe("w2:p1");
    expect(fixture.tabTitles.get("w1:t2")).toBe("drift · agents 2");
    expect(fixture.tabTitles.get("w1:t4")).toBe("Clara 7");
  });

  it("uses agent titles for singletons and a cached origin for groups without renaming other tabs", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    await layout.place("origin",{...request,childId:"first",title:"First"});
    fixture.tabTitles.set("w1:t1","Manual origin title");
    for (let i=2;i<=6;i++) {
      await layout.place("origin",{...request,childId:`child-${i}`,title:`Child ${i}`});
      if (i === 3) fixture.tabTitles.set("w1:t1","Updated origin title");
    }
    expect(fixture.tabTitles.get("w1:t1")).toBe("Updated origin title");
    expect(fixture.tabTitles.get("w1:manual")).toBe("Manual tab");
    expect(fixture.tabTitles.get("w1:t2")).toBe("Manual origin title · agents 2");
    expect(fixture.tabTitles.get("w1:t3")).toBe("Manual origin title · agents 3");
    expect(fixture.calls.filter(call => call[0] === "tab" && call[1] === "get" && call[2] === "w1:t1")).toHaveLength(1);
  });

  it("renames shrinking overflow groups and removes their empty owned tabs", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    for (let i=1;i<=2;i++) await layout.place("origin",{...request,childId:`child-${i}`,title:`Child ${i}`});
    const elena = await layout.place("origin",{...request,childId:"elena",title:"Elena · reviewer"});
    expect(fixture.tabTitles.get(elena.tabId)).toBe("Elena · reviewer");
    const maya = await layout.place("origin",{...request,childId:"maya",title:"Maya · developer"});
    expect(maya.tabId).toBe(elena.tabId);
    expect(fixture.tabTitles.get(elena.tabId)).toBe("drift · agents 2");
    await layout.close("origin",elena.childId,elena.paneId);
    expect(fixture.tabTitles.get(maya.tabId)).toBe("Maya · developer");
    const nora = await layout.place("origin",{...request,childId:"nora",title:"Nora · validator"});
    expect(fixture.tabTitles.get(nora.tabId)).toBe("drift · agents 2");
    await layout.close("origin",nora.childId,nora.paneId);
    await layout.close("origin",maya.childId,maya.paneId);
    expect(fixture.tabs.has(maya.tabId)).toBe(false);
    expect(fixture.focus).toBe("w2:p1");
  });

  it("preserves manual overflow titles through joins and departures", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    for (let i=1;i<=3;i++) await layout.place("origin",{...request,childId:`child-${i}`,title:`Child ${i}`});
    const overflow = layout.snapshot("origin").find(child => child.tabIndex === 1)!;
    fixture.tabTitles.set(overflow.tabId,"Manual overflow");
    const newcomer = await layout.place("origin",{...request,childId:"elena",title:"Elena"});
    expect(newcomer.tabId).toBe(overflow.tabId);
    expect(fixture.tabTitles.get(overflow.tabId)).toBe("Manual overflow");
    await layout.close("origin",newcomer.childId,newcomer.paneId);
    expect(fixture.tabTitles.get(overflow.tabId)).toBe("Manual overflow");
    fixture.tabTitles.set(overflow.tabId,"drift · agents 2");
    const next = await layout.place("origin",{...request,childId:"nora",title:"Nora"});
    await layout.close("origin",next.childId,next.paneId);
    expect(fixture.tabTitles.get(overflow.tabId)).toBe("drift · agents 2");
  });

  it("keeps an overflow pane owned when its tab naming polish fails", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    for (let i=1;i<=2;i++) await layout.place("origin",{...request,childId:`child-${i}`,title:`Child ${i}`});
    fixture.failTabRename = true;
    await expect(layout.place("origin",{...request,childId:"third",title:"Third"})).rejects.toMatchObject({placement:{paneId:"w1:p4",tabId:"w1:t2"}});
    expect(layout.snapshot("origin")).toHaveLength(3);
    expect(fixture.panes.has("w1:p4")).toBe(true);
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

  it("migrates a growing team intact and returns it after shrinkage", async () => {
    const fixture = new LayoutFixture();
    const moved: string[] = [];
    const layout = new SubagentLayout(fixture.cli,undefined,id => moved.push(id));
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    const lead = await layout.place("origin",{...request,childId:"lead",title:"Nora · teamlead",role:"teamlead"});
    const first = await layout.place("origin",{...request,childId:"first",title:"First",parentId:"lead",role:"developer"});
    const second = await layout.place("origin",{...request,childId:"second",title:"Second",parentId:"lead",role:"developer"});
    const team = layout.snapshot("origin");
    expect(new Set(team.map(child => child.tabId)).size).toBe(1);
    expect(team[0].tabId).not.toBe(lead.tabId);
    expect(team.find(child => child.childId === "lead")).toMatchObject({row:1,paneId:lead.paneId});
    expect(team.filter(child => child.row === 0)).toHaveLength(2);
    expect(moved).toEqual(["lead","first"]);
    expect(fixture.tabTitles.get(team[0].tabId)).toBe("Nora · teamlead · team");
    await layout.close("origin",second.childId,second.paneId);
    expect(layout.snapshot("origin").every(child => child.tabId === "w1:t1" && child.row === 0)).toBe(true);
    expect(layout.snapshot("origin").find(child => child.childId === "first")?.paneId).toBe(first.paneId);
  });

  it("keeps large teams in readable named team tabs", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    await layout.place("origin",{...request,childId:"lead",title:"Nora",role:"teamlead"});
    for (let i=0;i<5;i++) await layout.place("origin",{...request,childId:`d${i}`,parentId:"lead",title:`Worker ${i}`,role:"developer"});
    const team = layout.snapshot("origin");
    expect(new Set(team.map(child => child.tabId)).size).toBe(3);
    for (const tabId of new Set(team.map(child => child.tabId))) {
      const children = team.filter(child => child.tabId === tabId);
      expect(children.filter(child => child.row === 0).length).toBeLessThanOrEqual(2);
      expect(fixture.tabTitles.get(tabId)).toContain("Nora · team");
    }
  });

  it("does not migrate a manually resized team when another descendant joins", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",plugin:"local.pi",entrypoint:"pi"};
    const lead = await layout.place("origin",{...request,childId:"lead",title:"Nora",role:"teamlead"});
    await layout.place("origin",{...request,childId:"first",title:"First",parentId:"lead",role:"developer"});
    fixture.panes.get(lead.paneId).rect.width += 10;
    const before = fixture.calls.length;
    const next = await layout.place("origin",{...request,childId:"next",title:"Next",parentId:"lead",role:"developer"});
    expect(next.tabId).not.toBe(lead.tabId);
    expect(fixture.calls.slice(before).some(call => call[0] === "pane" && call[1] === "move")).toBe(false);
    expect(fixture.tabTitles.get(next.tabId)).toBe("Nora · team 1");
  });

  it("reuses the origin row after overflow shrinks", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    for (let i=1;i<=3;i++) await layout.place("origin",{...request,childId:`child-${i}`});
    const first = layout.snapshot("origin")[0];
    await layout.close("origin",first.childId,first.paneId);
    expect(layout.snapshot("origin").every(child => child.tabIndex === 0)).toBe(true);
    const replacement = await layout.place("origin",{...request,childId:"replacement"});
    expect(replacement).toMatchObject({tabIndex:1,column:0});
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

  it("compacts a single row after its first pane closes", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    const first = await layout.place("origin",{...request,childId:"first"});
    const second = await layout.place("origin",{...request,childId:"second"});
    await layout.close("origin",first.childId,first.paneId);
    expect(layout.snapshot("origin")).toMatchObject([{childId:"second",column:0}]);
    const next = await layout.place("origin",{...request,childId:"next"});
    expect(next).toMatchObject({tabId:second.tabId,row:0,column:1});
  });

  it("closes only an owned pane and removes an empty owned overflow tab", async () => {
    const fixture = new LayoutFixture();
    const layout = new SubagentLayout(fixture.cli);
    const request = {callerPane:"w1:p1",cwd:"C:/work",title:"Child",plugin:"local.pi",entrypoint:"pi"};
    const first = await layout.place("origin",{...request,childId:"first"});
    await layout.place("origin",{...request,childId:"second"});
    const overflow = await layout.place("origin",{...request,childId:"third"});
    await layout.close("origin",overflow.childId,overflow.paneId);
    expect(fixture.calls).toContainEqual(["tab","close",overflow.tabId]);
    await expect(layout.close("origin","not-owned",first.paneId)).rejects.toThrow(/not owned/);
    expect(fixture.panes.has("w2:p1")).toBe(true);
  });

});
