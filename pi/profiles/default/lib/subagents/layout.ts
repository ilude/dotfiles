import type { HerdrCli } from "../herdr-cli.ts";
import { compactPane, inspectLayout, inspectPane, result } from "../herdr-cli.ts";
import { createPaneFocus, focusedPane, inspectTab, tabTitle, type FocusPane } from "./herdr-layout-api.ts";
import { desiredLayout, layoutCapacity, PANES_PER_ROW, type DesiredLayoutSlot, type LayoutMember, type LayoutTab } from "./layout-model.ts";

export const CHILDREN_PER_ROW = PANES_PER_ROW;
export const ROWS_PER_TAB = 1;
export const CHILDREN_PER_TAB = CHILDREN_PER_ROW;

export interface LayoutChild {
  childId: string;
  paneId: string;
  tabId: string;
  workspaceId: string;
  tabIndex: number;
  row: number;
  column: number;
}
export interface LayoutPlacementRequest {
  childId: string;
  callerPane: string;
  cwd: string;
  title: string;
  plugin: string;
  entrypoint: string;
  env?: string[];
  parentId?: string;
  role?: string;
}
export interface LayoutPlacement extends LayoutChild {}
export class LayoutPlacementError extends Error {
  readonly placement?: LayoutPlacement;
  constructor(message: string, placement?: LayoutPlacement) {
    super(message);
    this.name = "LayoutPlacementError";
    this.placement = placement;
  }
}
/** The owned pane was closed; only subsequent layout reconciliation failed. */
export class LayoutReconciliationError extends Error {
  constructor(error: unknown) {
    super(`Pane closed, but layout reconciliation failed: ${String(error)}`);
    this.name = "LayoutReconciliationError";
  }
}
interface Rect { x: number; y: number; width: number; height: number }
interface Geometry { area: Rect; panes: Map<string, Rect> }
interface ManagedTab { id: string; index: number; dirty: boolean; geometry?: Geometry; title?: string }
type OwnedChild = LayoutChild & LayoutMember & {title: string; tabKey: LayoutTab; anchor: boolean};
interface Group {
  callerPane: string;
  callerTerminalId?: string;
  workspaceId: string;
  children: Map<string, OwnedChild>;
  disappeared: Map<string, string>;
  tabs: Map<LayoutTab, ManagedTab>;
  nextOrder: number;
  nextTeamIndex: number;
  originTitle?: string;
  fallbackTitle: string;
  tail: Promise<unknown>;
}

function publicChild(child: LayoutChild): LayoutChild {
  return {childId:child.childId,paneId:child.paneId,tabId:child.tabId,workspaceId:child.workspaceId,tabIndex:child.tabIndex,row:child.row,column:child.column};
}
function rect(value: unknown): Rect | undefined {
  if (!value || typeof value !== "object") return;
  const candidate = value as Record<string, unknown>;
  const {x,y,width,height} = candidate;
  if (typeof x === "number" && typeof y === "number" && typeof width === "number" && typeof height === "number"
    && [x,y,width,height].every(Number.isFinite)) return {x,y,width,height};
}
function bounds(rects: Rect[]): Rect {
  if (!rects.length) throw new Error("Herdr omitted pane geometry");
  const x = Math.min(...rects.map(value => value.x)), y = Math.min(...rects.map(value => value.y));
  return {x,y,width:Math.max(...rects.map(value => value.x+value.width))-x,height:Math.max(...rects.map(value => value.y+value.height))-y};
}
function paneIdentity(value: unknown): {paneId:string;tabId:string} {
  if (value && typeof value === "object" && "pane_id" in value && "tab_id" in value
    && typeof value.pane_id === "string" && typeof value.tab_id === "string") return {paneId:value.pane_id,tabId:value.tab_id};
  throw new Error("Herdr did not return a complete pane identity");
}

/** One readable row above an unchanged caller process. Overflow never recreates live panes. */
export class SubagentLayout {
  private groups = new Map<string, Group>();
  private readonly cli: HerdrCli;
  private readonly focusPane: FocusPane;
  private readonly paneMoved?: (childId:string,paneId:string) => void;
  constructor(cli: HerdrCli, focusPane: FocusPane = createPaneFocus(), paneMoved?: (childId:string,paneId:string) => void) {
    this.cli = cli;
    this.focusPane = focusPane;
    this.paneMoved = paneMoved;
  }

  snapshot(origin: string): LayoutChild[] {
    return [...(this.groups.get(origin)?.children.values() ?? [])].map(publicChild);
  }

  async place(origin: string, request: LayoutPlacementRequest): Promise<LayoutPlacement> {
    let group = this.groups.get(origin);
    if (!group) {
      const cwd = request.cwd.replace(/[\\/]+$/, "");
      group = {callerPane:request.callerPane,workspaceId:"",children:new Map(),disappeared:new Map(),tabs:new Map(),
        nextOrder:0,nextTeamIndex:1000,fallbackTitle:cwd.slice(Math.max(cwd.lastIndexOf("/"),cwd.lastIndexOf("\\"))+1) || "agents",tail:Promise.resolve()};
      this.groups.set(origin,group);
    }
    const owner = group;
    return this.serial(owner, async () => {
      if (owner.children.has(request.childId)) throw new Error("Visible child already has a layout slot");
      await this.bindCaller(owner,request.callerPane);
      await this.observe(owner);
      const member: LayoutMember = {childId:request.childId,parentId:request.parentId,role:request.role ?? "agent",order:owner.nextOrder++};
      const plan = await this.reconcile(owner,member);
      const wanted = plan.find(slot => slot.childId === request.childId);
      if (!wanted) throw new Error("Desired layout omitted the visible child");
      const destination = this.destination(owner,wanted);
      const args = ["plugin","pane","open","--plugin",request.plugin,"--entrypoint",request.entrypoint];
      if (destination.target) args.push("--placement","split","--direction",destination.direction,"--target-pane",destination.target);
      else args.push("--placement","tab","--workspace",owner.workspaceId);
      args.push("--cwd",request.cwd);
      for (const env of request.env ?? []) args.push("--env",env);
      args.push("--no-focus");
      const response = result(await this.cli(args));
      const identity = paneIdentity(response.plugin_pane?.pane ?? response.pane ?? response.root_pane);
      const tab = this.registerTab(owner,wanted.tab,identity.tabId);
      const child: OwnedChild = {...member,...identity,workspaceId:owner.workspaceId,tabIndex:tab.index,
        row:wanted.row,column:wanted.column,anchor:wanted.anchor,tabKey:wanted.tab,title:request.title.slice(0,160).trim()};
      // Register before identity checks and polish so failure cleanup owns this exact returned pane.
      owner.children.set(child.childId,child);
      try {
        if (destination.swap) await this.swapPreservingFocus(destination.target!,child.paneId);
        const pane = await inspectPane(this.cli,child.paneId);
        if (pane.workspace_id !== owner.workspaceId || pane.tab_id !== child.tabId) throw new Error("Created pane identity changed");
        await this.cli(["pane","rename",child.paneId,child.title]);
        await this.polish(owner);
      } catch (error) {
        throw new LayoutPlacementError(String(error),publicChild(child));
      }
      return publicChild(child);
    });
  }

  async close(origin: string, childId: string, paneId: string): Promise<void> {
    const group = this.groups.get(origin);
    if (!group) return;
    await this.serial(group,async () => {
      const owned = group.children.get(childId);
      if (!owned && group.disappeared.get(childId) === paneId) return;
      if (!owned || owned.paneId !== paneId) throw new Error("Visible child pane is not owned by this layout");
      // Geometry diagnosis must not prevent owned-process cleanup. A failed
      // live-list check below still fails normally rather than forgetting ownership.
      await this.observe(group).catch(() => undefined);
      if ((await this.livePanes(group)).has(paneId)) await this.cli(["plugin","pane","close",paneId]);
      group.children.delete(childId);
      try {
        await this.reconcile(group);
        await this.polish(group);
      } catch (error) {
        throw new LayoutReconciliationError(error);
      } finally {
        if (!group.children.size) this.groups.delete(origin);
      }
    });
  }

  private serial<T>(group: Group, operation: () => Promise<T>): Promise<T> {
    const run = group.tail.then(operation,operation);
    group.tail = run.then(() => undefined,() => undefined);
    return run;
  }

  private async bindCaller(group: Group, paneId: string) {
    const caller = await inspectPane(this.cli,paneId);
    const origin = group.tabs.get("origin");
    if (origin && paneId !== group.callerPane) {
      if (group.children.size) throw new Error("Visible child caller changed while owned panes are active");
      if (group.callerTerminalId && caller.terminal_id !== group.callerTerminalId) throw new Error("Visible child caller process identity changed");
      group.tabs.clear();
    } else if (origin && (caller.tab_id !== origin.id || caller.workspace_id !== group.workspaceId)) {
      throw new Error("Visible child caller workspace changed");
    }
    group.callerPane = paneId;
    group.callerTerminalId = typeof caller.terminal_id === "string" ? caller.terminal_id : group.callerTerminalId;
    group.workspaceId = String(caller.workspace_id);
    this.registerTab(group,"origin",String(caller.tab_id));
  }

  private registerTab(group: Group, key: LayoutTab, id: string): ManagedTab {
    const existing = group.tabs.get(key);
    if (existing) {
      if (existing.id !== id) throw new Error("Layout tab identity changed");
      return existing;
    }
    const tab: ManagedTab = {id,index:key === "origin" ? 0 : key.startsWith("overflow:") ? Number(key.slice(9)) : group.nextTeamIndex++,dirty:false};
    group.tabs.set(key,tab);
    return tab;
  }

  private async livePanes(group: Group): Promise<Set<string>> {
    const response = result(await this.cli(["pane","list","--workspace",group.workspaceId]));
    if (!Array.isArray(response.panes) || response.panes.some((pane: {pane_id?:unknown}) => typeof pane?.pane_id !== "string")) throw new Error("Herdr did not return a complete pane list");
    return new Set(response.panes.map((pane: {pane_id:string}) => pane.pane_id));
  }

  private async geometry(paneId: string): Promise<Geometry> {
    const layout = await inspectLayout(this.cli,paneId);
    const panes = new Map<string,Rect>();
    for (const pane of layout.panes) {
      const value = rect(pane.rect);
      if (typeof pane.pane_id === "string" && value) panes.set(pane.pane_id,value);
    }
    return {area:rect(layout.area) ?? bounds([...panes.values()]),panes};
  }

  private async observe(group: Group) {
    const live = await this.livePanes(group);
    const missingTabs = new Set<string>();
    for (const child of group.children.values()) if (!live.has(child.paneId)) {
      missingTabs.add(child.tabId);
      group.children.delete(child.childId);
      group.disappeared.set(child.childId,child.paneId);
    }
    for (const [key,tab] of group.tabs) {
      const representative = key === "origin" ? group.callerPane : [...group.children.values()].find(child => child.tabKey === key)?.paneId;
      if (!representative) continue;
      const current = await this.geometry(representative);
      const previous = tab.geometry;
      // Herdr recomputes split rectangles when the terminal area changes, including
      // minimum-size clamping. That is not evidence of a manual divider edit.
      const resized = previous && (previous.area.width !== current.area.width || previous.area.height !== current.area.height);
      if (previous && !resized && !missingTabs.has(tab.id)) {
        if (previous.panes.size !== current.panes.size || [...previous.panes].some(([id,value]) => {
          const observed = current.panes.get(id);
          return !observed || (Object.keys(value) as Array<keyof Rect>).some(field => Math.abs(value[field]-observed[field]) > 1);
        })) tab.dirty = true;
      }
      tab.geometry = current;
    }
  }

  private async reconcile(group: Group, pending?: LayoutMember): Promise<DesiredLayoutSlot[]> {
    const members: LayoutMember[] = [...group.children.values(),...(pending ? [pending] : [])];
    const membership = desiredLayout(members).slots;
    const dirtyChildren = new Set([...group.children.values()].filter(child => group.tabs.get(child.tabKey)?.dirty).map(child => child.childId));
    const frozenTeams = new Set(membership.filter(slot => dirtyChildren.has(slot.childId) && slot.groupId !== "ordinary").map(slot => slot.groupId));
    const frozen = new Set(membership.filter(slot => dirtyChildren.has(slot.childId) || frozenTeams.has(slot.groupId)).map(slot => slot.childId));
    const origin = group.tabs.get("origin")!;
    const originGeometry = origin.geometry ?? await this.geometry(group.callerPane);
    const region = bounds([group.callerPane,...[...group.children.values()].filter(child => child.tabKey === "origin").map(child => child.paneId)]
      .flatMap(id => originGeometry.panes.has(id) ? [originGeometry.panes.get(id)!] : []));
    const capacity = layoutCapacity(region.width,region.height);
    if (origin.dirty) capacity.origin = 0;
    const plan = desiredLayout(members.filter(member => !frozen.has(member.childId)),capacity).slots;
    // Dirty tabs remain owned but cannot be split or used as migration destinations.
    const translated = new Map<LayoutTab,LayoutTab>();
    const used = new Set<LayoutTab>();
    for (const slot of plan) {
      let key = translated.get(slot.tab);
      if (!key) {
        key = slot.tab;
        if (key.startsWith("overflow:")) {
          let ordinal = 1;
          while (group.tabs.get(`overflow:${ordinal}`)?.dirty || used.has(`overflow:${ordinal}`)) ordinal++;
          key = `overflow:${ordinal}`;
        }
        translated.set(slot.tab,key); used.add(key);
      }
      slot.tab = key;
    }
    if (pending && frozen.has(pending.childId)) {
      const member = membership.find(slot => slot.childId === pending.childId)!;
      let ordinal = 1;
      let key: LayoutTab = `team:${member.groupId}:overflow:${ordinal}`;
      while (group.tabs.get(key)?.dirty || [...group.children.values()].filter(child => child.tabKey === key).length >= capacity.overflow) key = `team:${member.groupId}:overflow:${++ordinal}`;
      plan.push({...member,tab:key,row:0,column:[...group.children.values()].filter(child => child.tabKey === key).length,anchor:false});
    }
    // Anchors first: their live processes establish dedicated tabs before descendants move.
    for (const slot of [...plan].sort((a,b) => Number(b.anchor)-Number(a.anchor) || a.row-b.row || a.column-b.column)) {
      const child = group.children.get(slot.childId);
      if (!child) continue;
      if (child.tabKey !== slot.tab) await this.move(group,child,slot);
      child.row = slot.row; child.column = slot.column; child.anchor = slot.anchor;
    }
    return plan;
  }

  private destination(group: Group, slot: DesiredLayoutSlot): {target?:string;direction:"right"|"down";swap:boolean} {
    const row = [...group.children.values()].filter(child => child.tabKey === slot.tab && !child.anchor).sort((a,b) => a.column-b.column);
    if (!slot.anchor && row.length) return {target:row.at(-1)!.paneId,direction:"right",swap:false};
    const anchor = slot.tab === "origin" ? group.callerPane : [...group.children.values()].find(child => child.tabKey === slot.tab && child.anchor)?.paneId;
    return anchor && !slot.anchor ? {target:anchor,direction:"down",swap:true} : {direction:"right",swap:false};
  }

  private async move(group: Group, child: OwnedChild, slot: DesiredLayoutSlot) {
    const before = await inspectPane(this.cli,child.paneId);
    const destination = this.destination(group,slot);
    const tab = group.tabs.get(slot.tab);
    const args = ["pane","move",child.paneId];
    if (destination.target && tab) args.push("--tab",tab.id,"--split",destination.direction,"--target-pane",destination.target);
    else args.push("--new-tab","--workspace",group.workspaceId);
    args.push("--no-focus");
    const response = result(await this.cli(args));
    const identity = paneIdentity(response.move_result?.pane ?? response.pane);
    const managed = this.registerTab(group,slot.tab,identity.tabId);
    Object.assign(child,identity,{tabKey:slot.tab,tabIndex:managed.index,row:slot.row,column:slot.column,anchor:slot.anchor});
    this.paneMoved?.(child.childId,child.paneId);
    const after = await inspectPane(this.cli,child.paneId);
    if (after.workspace_id !== group.workspaceId || after.tab_id !== child.tabId || (before.terminal_id && after.terminal_id !== before.terminal_id)) throw new Error("Child process identity changed during layout migration");
    if (destination.swap) await this.swapPreservingFocus(destination.target!,child.paneId);
  }

  private async swapPreservingFocus(source: string, target: string) {
    const focused = await focusedPane(this.cli);
    try { await this.cli(["pane","swap","--source-pane",source,"--target-pane",target]); }
    finally {
      try {
        if (focused && focused !== source && await focusedPane(this.cli) === source) await this.focusPane(focused);
      } catch { console.warn("Herdr focus restoration failed; pane placement was not rolled back"); }
    }
  }

  private async polish(group: Group) {
    for (const [key,tab] of group.tabs) {
      const children = [...group.children.values()].filter(child => child.tabKey === key);
      if (key !== "origin" && !children.length) {
        const tabs = result(await this.cli(["tab","list","--workspace",group.workspaceId])).tabs ?? [];
        const existing = tabs.find((value: {tab_id:string}) => value.tab_id === tab.id);
        if (existing && Number(existing.pane_count) === 0) await this.cli(["tab","close",tab.id]);
        group.tabs.delete(key);
        continue;
      }
      await this.updateTitle(group,key,tab,children);
      const representative = key === "origin" ? group.callerPane : children[0]?.paneId;
      if (!representative || tab.dirty) continue;
      const row = children.filter(child => !child.anchor).sort((a,b) => a.column-b.column);
      let geometry = await this.geometry(representative);
      // With at most two siblings there is one horizontal divider, not a nested grid.
      if (row.length === 2) {
        const first = geometry.panes.get(row[0].paneId), second = geometry.panes.get(row[1].paneId);
        if (first && second && first.x > second.x) {
          await this.swapPreservingFocus(row[0].paneId,row[1].paneId);
          geometry = await this.geometry(representative);
        }
        const left = geometry.panes.get(row[0].paneId), right = geometry.panes.get(row[1].paneId);
        if (left && right) {
          const width = left.width+right.width, delta = left.width-width/2;
          if (Math.abs(delta) > 1) await this.cli(["pane","resize","--direction",delta > 0 ? "left" : "right","--amount",(Math.abs(delta)/width).toFixed(6),"--pane",row[1].paneId]);
        }
      }
      const anchor = key === "origin" ? group.callerPane : children.find(child => child.anchor)?.paneId;
      if (anchor && row.length) {
        geometry = await this.geometry(representative);
        const anchorRect = geometry.panes.get(anchor);
        const region = bounds([anchor,...row.map(child => child.paneId)].flatMap(id => geometry.panes.has(id) ? [geometry.panes.get(id)!] : []));
        if (anchorRect) {
          const delta = (region.height/2-anchorRect.height)/region.height;
          if (Math.abs(delta)*region.height > 1) await this.cli(["pane","resize","--direction",delta > 0 ? "up" : "down","--amount",Math.abs(delta).toFixed(6),"--pane",anchor]);
        }
      }
      tab.geometry = await this.geometry(representative);
    }
  }

  private async updateTitle(group: Group, key: LayoutTab, tab: ManagedTab, children: OwnedChild[]) {
    if (key === "origin" || !children.length) return;
    if (tab.title !== undefined) {
      if (tab.title === "" || tabTitle(await inspectTab(this.cli,tab.id,group.workspaceId)) !== tab.title) { tab.title = ""; return; }
    }
    if (!group.originTitle) group.originTitle = tabTitle(await inspectTab(this.cli,group.tabs.get("origin")!.id,group.workspaceId)) ?? group.fallbackTitle;
    const leader = key.startsWith("team:") ? [...group.children.values()].find(child => child.role === "teamlead" && key.startsWith(`team:${child.childId}`)) : undefined;
    const overflow = key.includes(":overflow:") ? ` ${key.slice(key.lastIndexOf(":")+1)}` : "";
    const title = leader ? `${leader.title} · team${overflow}` : children.length === 1 ? children[0].title : `${group.originTitle} · agents ${tab.index+1}`;
    if (title !== tab.title) await this.cli(["tab","rename",tab.id,title]);
    tab.title = title;
  }
}

/** Maximum-capacity allocation for callers inspecting the default contract. */
export function layoutSlot(occupied: Array<Pick<LayoutChild,"tabIndex"|"row"|"column">>) {
  const used = new Set(occupied.map(child => child.tabIndex*CHILDREN_PER_TAB+child.column));
  for (let ordinal = 0; ; ordinal++) if (!used.has(ordinal)) return {tabIndex:Math.floor(ordinal/CHILDREN_PER_TAB),row:0,column:ordinal%CHILDREN_PER_ROW};
}
export function compactLayoutChild(child: LayoutChild) {
  return {...compactPane({pane_id:child.paneId,tab_id:child.tabId,workspace_id:child.workspaceId}),childId:child.childId,tabIndex:child.tabIndex,row:child.row,column:child.column};
}
