import type { HerdrCli } from "../herdr-cli.ts";
import { createPaneFocus, focusedPane, inspectTab, tabTitle, type FocusPane } from "./herdr-layout-api.ts";
import { compactPane, inspectLayout, inspectPane, result } from "../herdr-cli.ts";
import { desiredLayout, PANES_PER_ROW, type DesiredLayoutSlot } from "./layout-model.ts";

export const CHILDREN_PER_ROW = PANES_PER_ROW;
export const ROWS_PER_TAB = 2;
export const CHILDREN_PER_TAB = CHILDREN_PER_ROW * ROWS_PER_TAB;

type SplitDirection = "right" | "down";
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
type OwnedLayoutChild = LayoutChild & { title: string; parentId?: string; role: string; order: number };
interface Group {
  callerPane: string;
  callerTab: string;
  workspaceId: string;
  children: Map<string, OwnedLayoutChild>;
  disappeared: Map<string, string>;
  nextOrder: number;
  teamTabIndexes: Map<string, number>;
  dirtyTabs: Set<string>;
  controllerRects: Map<string, Map<string, {x:number;y:number;width:number;height:number}>>;
  tabs: Map<number, string>;
  managedTabTitles: Map<string, string>;
  halfVacancies: Map<number, Set<number>>;
  rightSplitLowerSlots: Map<number, Set<number>>;
  originTitle?: string;
  tail: Promise<unknown>;
}

const asResult = (text: string) => result(text) as any;
const paneFromOpen = (value: any) => value?.plugin_pane?.pane ?? value?.pane ?? value?.root_pane;

function fallbackOriginTitle(request: LayoutPlacementRequest): string {
  const cwd = request.cwd.replace(/[\\/]+$/, "");
  const basename = cwd.slice(Math.max(cwd.lastIndexOf("/"), cwd.lastIndexOf("\\")) + 1).trim();
  return basename || request.title.trim() || "agents";
}

/**
 * Children sit above the caller in two rows of four, left to right. The
 * caller remains below both rows. Overflow tabs avoid restructuring live pane
 * trees and repeat the same eight-pane topology. Creation is non-focusing;
 * the initial swap restores observed focus because Herdr's swap focuses its source.
 *
 * This class owns only panes it opened and tabs it created through placement.
 * It never closes a caller, an unrelated pane, or a pre-existing tab.
 */
export class SubagentLayout {
  private groups = new Map<string, Group>();
  private readonly cli: HerdrCli;
  private readonly focusPane: FocusPane;
  private readonly paneMoved?: (childId: string, paneId: string) => void;
  constructor(cli: HerdrCli, focusPane: FocusPane = createPaneFocus(), paneMoved?: (childId: string, paneId: string) => void) { this.cli = cli; this.focusPane = focusPane; this.paneMoved = paneMoved; }

  snapshot(origin: string): LayoutChild[] {
    return [...(this.groups.get(origin)?.children.values() ?? [])].map(({ title: _title, parentId: _parentId, role: _role, order: _order, ...child }) => child);
  }

  async place(origin: string, request: LayoutPlacementRequest): Promise<LayoutPlacement> {
    const group = this.group(origin, request.callerPane);
    return this.serial(group, async () => this.placeLocked(group, request));
  }

  async close(origin: string, childId: string, paneId: string): Promise<void> {
    const group = this.groups.get(origin);
    if (!group) return;
    await this.serial(group, async () => {
      const owned = group.children.get(childId);
      if (!owned && group.disappeared.get(childId) === paneId) return;
      if (!owned || owned.paneId !== paneId) throw new Error("Visible child pane is not owned by this layout");
      const partnerSurvives = [...group.children.values()].some(candidate => candidate.childId !== childId
        && candidate.tabIndex === owned.tabIndex && candidate.column === owned.column && candidate.row !== owned.row);
      await this.detectDirty(group, owned.tabId, owned.paneId);
      // An operator or exited host may already have removed this exact pane.
      const live = await this.livePanes(group);
      if (live.has(paneId)) await this.cli(["plugin", "pane", "close", paneId]);
      group.children.delete(childId);
      try {
        const halfVacancies = this.slotSet(group.halfVacancies, owned.tabIndex);
        const completedColumnVacancy = !partnerSurvives && halfVacancies.delete(owned.column);
        if (partnerSurvives) halfVacancies.add(owned.column);
        const appendedColumn = this.compactColumns(group, owned);
        const tabStillOccupied = [...group.children.values()].some(child => child.tabIndex === owned.tabIndex);
        if (completedColumnVacancy && appendedColumn !== undefined && tabStillOccupied) {
          this.slotSet(group.rightSplitLowerSlots, owned.tabIndex).add(appendedColumn);
        } else if (!tabStillOccupied) {
          group.halfVacancies.delete(owned.tabIndex);
          group.rightSplitLowerSlots.delete(owned.tabIndex);
        }
        await this.removeEmptyTab(group, owned);
        if (!group.dirtyTabs.has(owned.tabId)) await this.returnEligibleTeams(group);
        await this.updateTabTitle(group, owned.tabIndex);
        if (!group.dirtyTabs.has(owned.tabId)) {
          await this.balance(group, owned.tabIndex, owned.row);
          await this.balanceHeight(group);
          const survivor = [...group.children.values()].find(child => child.tabId === owned.tabId)?.paneId;
          if (survivor) await this.rememberGeometry(group, owned.tabId, survivor);
        }
      } catch (error) {
        throw new LayoutReconciliationError(error);
      } finally {
        if (!group.children.size) this.groups.delete(this.originFor(group));
      }
    });
  }

  private originFor(group: Group): string {
    for (const [origin, candidate] of this.groups) if (candidate === group) return origin;
    return "";
  }

  private group(origin: string, callerPane: string): Group {
    const existing = this.groups.get(origin);
    if (existing) {
      if (existing.callerPane !== callerPane) throw new Error("Visible child caller changed within an origin");
      return existing;
    }
    const group: Group = {
      callerPane, callerTab: "", workspaceId: "", children: new Map(), tabs: new Map(), managedTabTitles: new Map(),
      disappeared: new Map(), nextOrder: 0, teamTabIndexes: new Map(), dirtyTabs: new Set(), controllerRects: new Map(), halfVacancies: new Map(), rightSplitLowerSlots: new Map(), tail: Promise.resolve(),
    };
    this.groups.set(origin, group);
    return group;
  }

  private serial<T>(group: Group, operation: () => Promise<T>): Promise<T> {
    const run = group.tail.then(operation, operation);
    group.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async placeLocked(group: Group, request: LayoutPlacementRequest): Promise<LayoutPlacement> {
    if (group.children.has(request.childId)) throw new Error("Visible child already has a layout slot");
    const caller = await inspectPane(this.cli, request.callerPane);
    if (!group.callerTab) {
      group.callerTab = String(caller.tab_id);
      group.workspaceId = String(caller.workspace_id);
    } else if (caller.tab_id !== group.callerTab || caller.workspace_id !== group.workspaceId) {
      throw new Error("Visible child caller workspace changed");
    }
    await this.reconcileMissingPanes(group);
    await this.detectDirty(group, group.callerTab, group.callerPane);
    const order = group.nextOrder++;
    const model = desiredLayout([
      ...[...group.children.values()].map(child => ({childId:child.childId,parentId:child.parentId,role:child.role,order:child.order})),
      {childId:request.childId,parentId:request.parentId,role:request.role ?? "agent",order},
    ]);
    const wanted = model.slots.find(candidate => candidate.childId === request.childId);
    if (!wanted) throw new Error("Desired layout omitted the visible child");
    if (wanted.tab.startsWith("team:") && !group.dirtyTabs.has(group.callerTab)) await this.migrateTeam(group, wanted.groupId, model.slots);
    const slot = wanted.kind === "ordinary" ? this.nextSlot(group) : this.physicalSlot(group, wanted);
    const newOverflowTab = slot.tabIndex > 0 && !group.tabs.has(slot.tabIndex);
    const lowerAnchor = slot.row === 0
      ? [...group.children.values()].find(child => child.tabIndex === slot.tabIndex && child.row === 1 && child.column === slot.column)
      : undefined;
    const rightSplitLower = slot.row === 1 && this.slotSet(group.rightSplitLowerSlots, slot.tabIndex).has(slot.column);
    let paneId: string | undefined;
    let tabId: string | undefined;
    if (lowerAnchor) {
      // Closing an upper pane leaves its lower partner occupying the column.
      // Split that exact pane downward and swap identities to restore the
      // vacancy above it without moving or replacing the surviving process.
      const opened = await this.openSplit(request, lowerAnchor.paneId, "down");
      paneId = opened.paneId; tabId = opened.tabId;
    } else if (rightSplitLower) {
      // When both halves of a column were removed, Herdr compacted the whole
      // branch. The upper refill appended its half horizontally; append the
      // lower half from the surviving lower tail instead of nesting downward.
      const target = [...group.children.values()]
        .filter(child => child.tabIndex === slot.tabIndex && child.row === 1 && child.column < slot.column)
        .sort((left, right) => right.column - left.column)[0];
      if (!target) throw new Error("No lower-row tail available for a column refill");
      const opened = await this.openSplit(request, target.paneId, "right");
      paneId = opened.paneId; tabId = opened.tabId;
    } else if (slot.tabIndex === 0 && slot.row === 0 && slot.column === 0) {
      const opened = await this.openSplit(request, request.callerPane, "down");
      paneId = opened.paneId; tabId = opened.tabId;
    } else if (wanted.anchor || (slot.column === 0 && slot.row === 0 && slot.tabIndex > 0 && !group.tabs.has(slot.tabIndex))) {
      const opened = await this.openTab(request);
      paneId = opened.paneId; tabId = opened.tabId;
    } else if (wanted.tab.startsWith("team:") && wanted.row === 0 && wanted.column === 0) {
      const leader = group.children.get(wanted.groupId);
      if (!leader) throw new Error("Dedicated team leader is unavailable");
      const opened = await this.openSplit(request, leader.paneId, "down");
      paneId = opened.paneId; tabId = opened.tabId;
    } else {
      const previousTeamSlot = wanted.kind !== "ordinary" && wanted.tab === "origin" && slot.column > 0
        ? model.slots.find(candidate => candidate.groupId === wanted.groupId && candidate.row === wanted.row && candidate.column === wanted.column-1)
        : undefined;
      const sharedTeamTail = previousTeamSlot ? group.children.get(previousTeamSlot.childId) : undefined;
      const target = sharedTeamTail ?? this.targetFor(group, slot.tabIndex, slot.row, slot.column);
      if (!target) throw new Error("No owned pane available for a new layout slot");
      const direction = sharedTeamTail ? "right" : slot.row === 1 ? "down" : "right";
      const opened = await this.openSplit(request, target.paneId, direction);
      paneId = opened.paneId; tabId = opened.tabId;
    }
      if (!paneId || !tabId) throw new Error("Herdr did not return the created pane identity");
      const owned: LayoutChild = { childId: request.childId, paneId, tabId, workspaceId: group.workspaceId, ...slot };
      // Register immediately after creation. If identity verification or polish
      // fails, the visible child can settle this exact returned pane before it
      // is closed.
      group.children.set(request.childId, { ...owned, title: request.title.slice(0, 160).trim(), parentId: request.parentId, role: request.role ?? "agent", order });
      this.slotSet(group.halfVacancies, slot.tabIndex).delete(slot.column);
      if (rightSplitLower) this.slotSet(group.rightSplitLowerSlots, slot.tabIndex).delete(slot.column);
      if (!group.tabs.has(slot.tabIndex)) group.tabs.set(slot.tabIndex, tabId);
      try {
        if (lowerAnchor) {
          await this.swapPreservingFocus(lowerAnchor.paneId, paneId);
        } else if (wanted.tab.startsWith("team:") && !wanted.anchor && wanted.row === 0 && wanted.column === 0) {
          const leader = [...group.children.values()].find(child => child.childId === wanted.groupId);
          if (leader) await this.swapPreservingFocus(leader.paneId, paneId);
        } else if (slot.tabIndex === 0 && slot.row === 0 && slot.column === 0) {
          // Herdr 0.9 has no upward plugin split or non-focusing swap.
          await this.swapPreservingFocus(group.callerPane, paneId);
        }
        const pane = await inspectPane(this.cli, paneId);
        if (pane.workspace_id !== group.workspaceId || pane.tab_id !== tabId) throw new Error("Created pane identity changed");
        if (slot.tabIndex > 0 && slot.column === 0) {
          if (!group.originTitle) group.originTitle = await this.originatingTitle(group, request);
        }
        await this.updateTabTitle(group, slot.tabIndex, newOverflowTab);
        await this.cli(["pane", "rename", paneId, request.title.slice(0, 160)]);
        if (!group.dirtyTabs.has(tabId)) {
          await this.balance(group, slot.tabIndex, slot.row);
          await this.balanceHeight(group);
          await this.rememberGeometry(group, tabId, paneId);
        }
      } catch (error) {
        throw new LayoutPlacementError(String(error), { ...owned });
      }
      return { ...owned };
  }

  private async livePanes(group: Group): Promise<Set<string>> {
    const response = asResult(await this.cli(["pane", "list", "--workspace", group.workspaceId]));
    if (!Array.isArray(response.panes) || response.panes.some((pane: any) => typeof pane?.pane_id !== "string")) {
      throw new Error("Herdr did not return a complete pane list");
    }
    return new Set(response.panes.map((pane: { pane_id: string }) => pane.pane_id));
  }

  private async reconcileMissingPanes(group: Group): Promise<void> {
    if (!group.children.size) return;
    const live = await this.livePanes(group);
    const missing = [...group.children.values()].filter(child => !live.has(child.paneId))
      .sort((a, b) => b.tabIndex - a.tabIndex || b.column - a.column || b.row - a.row);
    for (const child of missing) {
      group.children.delete(child.childId);
      group.disappeared.set(child.childId, child.paneId);
      const partnerSurvives = [...group.children.values()].some(candidate => candidate.tabIndex === child.tabIndex && candidate.column === child.column);
      const vacancies = this.slotSet(group.halfVacancies, child.tabIndex);
      const completed = !partnerSurvives && vacancies.delete(child.column);
      if (partnerSurvives) vacancies.add(child.column);
      const appended = this.compactColumns(group, child);
      if (![...group.children.values()].some(candidate => candidate.tabIndex === child.tabIndex)) {
        group.halfVacancies.delete(child.tabIndex);
        group.rightSplitLowerSlots.delete(child.tabIndex);
        const tab = group.tabs.get(child.tabIndex);
        if (tab) group.managedTabTitles.delete(tab);
        group.tabs.delete(child.tabIndex);
      } else if (completed && appended !== undefined) {
        this.slotSet(group.rightSplitLowerSlots, child.tabIndex).add(appended);
      }
    }
  }

  private async swapPreservingFocus(sourcePane: string, targetPane: string): Promise<void> {
    // Observe focus immediately before swapping, not before launch. Herdr's
    // swap focuses its source pane even when the split itself was non-focusing.
    const focused = await focusedPane(this.cli);
    try {
      await this.cli(["pane", "swap", "--source-pane", sourcePane, "--target-pane", targetPane]);
    } finally {
      // Do not overwrite a subsequent user focus change to another pane.
      try {
        if (focused && focused !== sourcePane && await focusedPane(this.cli) === sourcePane) await this.focusPane(focused);
      } catch {
        // Placement already happened. A failed focus check/restoration must not
        // discard the child or mask a swap error. Do not retry a stale focus.
        console.warn("Herdr focus restoration failed; pane placement was not rolled back");
      }
    }
  }

  private async originatingTitle(group: Group, request: LayoutPlacementRequest): Promise<string> {
    const tab = await inspectTab(this.cli, group.callerTab, group.workspaceId);
    return tabTitle(tab) ?? fallbackOriginTitle(request);
  }

  private async updateTabTitle(group: Group, tabIndex: number, newlyCreated = false): Promise<void> {
    if (tabIndex === 0) return;
    const tabId = group.tabs.get(tabIndex);
    const members = [...group.children.values()].filter(child => child.tabIndex === tabIndex);
    if (!tabId || !members.length) return;
    const previous = group.managedTabTitles.get(tabId);
    if (!newlyCreated) {
      // Once a manual rename is observed, leave this tab alone for its lifetime.
      if (previous === undefined) return;
      const current = tabTitle(await inspectTab(this.cli, tabId, group.workspaceId));
      if (current !== previous) {
        group.managedTabTitles.delete(tabId);
        return;
      }
    }
    const title = tabIndex >= 1000
      ? `${members.find(member => member.role === "teamlead")?.title ?? members[0].title} · team`
      : members.length === 1 ? members[0].title : `${group.originTitle} · agents ${tabIndex + 1}`;
    if (title === previous) return;
    await this.cli(["tab", "rename", tabId, title]);
    group.managedTabTitles.set(tabId, title);
  }

  private layoutRects(layout: {panes?: unknown}): Map<string,{x:number;y:number;width:number;height:number}> {
    const rects = new Map<string,{x:number;y:number;width:number;height:number}>();
    if (!Array.isArray(layout.panes)) return rects;
    for (const pane of layout.panes as Array<{pane_id?:unknown;rect?:Record<string,unknown>}>) {
      const rect = pane.rect;
      if (typeof pane.pane_id === "string" && rect && [rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)) rects.set(pane.pane_id,{x:Number(rect.x),y:Number(rect.y),width:Number(rect.width),height:Number(rect.height)});
    }
    return rects;
  }

  private async detectDirty(group: Group, tabId: string, paneId: string): Promise<void> {
    const expected = group.controllerRects.get(tabId);
    if (!expected || group.dirtyTabs.has(tabId)) return;
    try {
      const current = this.layoutRects(await inspectLayout(this.cli,paneId));
      for (const [id, rect] of expected) {
        const observed = current.get(id);
        if (!observed) continue;
        if (["x","y","width","height"].some(key => Math.abs(observed[key as keyof typeof observed]-rect[key as keyof typeof rect]) > 1)) {
          group.dirtyTabs.add(tabId); return;
        }
      }
    } catch { /* A diagnostic observation must not replace the owning lifecycle error. */ }
  }

  private async rememberGeometry(group: Group, tabId: string, paneId: string): Promise<void> {
    if (group.dirtyTabs.has(tabId)) return;
    const rects = this.layoutRects(await inspectLayout(this.cli,paneId));
    if (rects.size) group.controllerRects.set(tabId,rects);
  }

  private physicalSlot(group: Group, wanted: DesiredLayoutSlot): {tabIndex:number;row:number;column:number} {
    if (wanted.tab === "origin") return {tabIndex:0,row:wanted.row,column:wanted.column};
    if (wanted.tab.startsWith("overflow:")) return {tabIndex:Number(wanted.tab.slice("overflow:".length)),row:wanted.row,column:wanted.column};
    let tabIndex = group.teamTabIndexes.get(wanted.groupId);
    if (tabIndex === undefined) {
      tabIndex = 1000 + group.teamTabIndexes.size;
      group.teamTabIndexes.set(wanted.groupId, tabIndex);
    }
    return {tabIndex,row:wanted.row,column:wanted.column};
  }

  private async migrateTeam(group: Group, teamId: string, desired: DesiredLayoutSlot[]): Promise<void> {
    const members = desired.filter(slot => slot.groupId === teamId);
    const existing = members.map(slot => ({slot, child:group.children.get(slot.childId)})).filter((value): value is {slot:DesiredLayoutSlot;child:OwnedLayoutChild} => value.child !== undefined);
    if (!existing.length || existing.every(value => value.child.tabIndex >= 1000)) return;
    const leader = existing.find(value => value.slot.childId === teamId);
    if (!leader) throw new Error("Team migration cannot find its owned leader pane");
    const before = await inspectPane(this.cli, leader.child.paneId);
    const leaderResponse = asResult(await this.cli(["pane","move",leader.child.paneId,"--new-tab","--workspace",group.workspaceId,"--label",`${leader.child.title} · team`,"--no-focus"]));
    const identity = this.requirePane(leaderResponse.move_result?.pane ?? leaderResponse.pane);
    const after = await inspectPane(this.cli, identity.paneId);
    if (before.terminal_id && after.terminal_id !== before.terminal_id) throw new Error("Team leader process identity changed during migration");
    const tabIndex = this.physicalSlot(group, leader.slot).tabIndex;
    Object.assign(leader.child,{paneId:identity.paneId,tabId:identity.tabId,tabIndex,row:leader.slot.row,column:leader.slot.column});
    group.tabs.set(tabIndex,identity.tabId); this.paneMoved?.(leader.child.childId,identity.paneId);
    let firstDescendant = true;
    for (const value of existing.filter(candidate => candidate !== leader).sort((a,b)=>a.slot.row-b.slot.row||a.slot.column-b.slot.column)) {
      const target = firstDescendant ? leader.child : existing.find(candidate => candidate.slot.row === value.slot.row && candidate.slot.column === value.slot.column-1)?.child
        ?? existing.find(candidate => candidate.slot.row === value.slot.row-1 && candidate.slot.column === value.slot.column)?.child
        ?? leader.child;
      const direction = firstDescendant || value.slot.row > 0 ? "down" : "right";
      const prior = await inspectPane(this.cli,value.child.paneId);
      const response = asResult(await this.cli(["pane","move",value.child.paneId,"--tab",identity.tabId,"--split",direction,"--target-pane",target.paneId,"--no-focus"]));
      const moved = this.requirePane(response.move_result?.pane ?? response.pane);
      const observed = await inspectPane(this.cli,moved.paneId);
      if (prior.terminal_id && observed.terminal_id !== prior.terminal_id) throw new Error("Team descendant process identity changed during migration");
      Object.assign(value.child,{paneId:moved.paneId,tabId:moved.tabId,tabIndex,row:value.slot.row,column:value.slot.column});
      this.paneMoved?.(value.child.childId,moved.paneId);
      if (firstDescendant) { await this.swapPreservingFocus(leader.child.paneId,value.child.paneId); firstDescendant=false; }
    }
  }

  private currentDesired(group: Group) {
    return desiredLayout([...group.children.values()].map(child => ({childId:child.childId,parentId:child.parentId,role:child.role,order:child.order})));
  }

  private async returnEligibleTeams(group: Group): Promise<void> {
    const model = this.currentDesired(group);
    for (const teamId of new Set(model.slots.filter(slot => slot.kind !== "ordinary" && slot.tab === "origin").map(slot => slot.groupId))) {
      const slots = model.slots.filter(slot => slot.groupId === teamId).sort((a,b)=>a.row-b.row||a.column-b.column);
      const values = slots.map(slot => ({slot,child:group.children.get(slot.childId)})).filter((value): value is {slot:DesiredLayoutSlot;child:OwnedLayoutChild} => value.child !== undefined);
      if (!values.some(value => value.child.tabIndex >= 1000)) continue;
      for (const value of values) {
        let target: OwnedLayoutChild | undefined;
        if (value.slot.column > 0) target = values.find(candidate => candidate.slot.row === value.slot.row && candidate.slot.column === value.slot.column-1)?.child;
        if (!target && value.slot.row > 0) target = [...group.children.values()].find(candidate => candidate.tabIndex === 0 && candidate.row === value.slot.row-1 && candidate.column === value.slot.column);
        const targetPane = target?.paneId ?? group.callerPane;
        const direction = value.slot.column > 0 ? "right" : "down";
        const prior = await inspectPane(this.cli,value.child.paneId);
        const response = asResult(await this.cli(["pane","move",value.child.paneId,"--tab",group.callerTab,"--split",direction,"--target-pane",targetPane,"--no-focus"]));
        const moved = this.requirePane(response.move_result?.pane ?? response.pane);
        const observed = await inspectPane(this.cli,moved.paneId);
        if (prior.terminal_id && observed.terminal_id !== prior.terminal_id) throw new Error("Team process identity changed while returning to the origin tab");
        Object.assign(value.child,{paneId:moved.paneId,tabId:moved.tabId,tabIndex:0,row:value.slot.row,column:value.slot.column});
        this.paneMoved?.(value.child.childId,moved.paneId);
        if (!target && value.slot.row === 0 && value.slot.column === 0) await this.swapPreservingFocus(group.callerPane,value.child.paneId);
      }
    }
  }

  private nextSlot(group: Group): { tabIndex: number; row: number; column: number } {
    const used = new Set([...group.children.values()].map(child => child.tabIndex * CHILDREN_PER_TAB + child.row * CHILDREN_PER_ROW + child.column));
    for (let ordinal = 0; ; ordinal++) if (!used.has(ordinal)) return {
      tabIndex: Math.floor(ordinal / CHILDREN_PER_TAB),
      row: Math.floor((ordinal % CHILDREN_PER_TAB) / CHILDREN_PER_ROW),
      column: ordinal % CHILDREN_PER_ROW,
    };
  }

  private targetFor(group: Group, tabIndex: number, row: number, column: number): LayoutChild | undefined {
    const rowChildren = [...group.children.values()].filter(child => child.tabIndex === tabIndex && child.row === row);
    if (column === 0 && row === 0) return undefined;
    if (row === 1) {
      // Each second-row pane is split downward from its matching first-row
      // pane. Independent vertical splits preserve a full-width two-row tree
      // even after the first row has already been divided horizontally.
      return [...group.children.values()].find(child => child.tabIndex === tabIndex && child.row === 0 && child.column === column);
    }
    // Split the rightmost occupied slot so child identities remain left to
    // right. Herdr's split ratio is a default rather than a stable pixel
    // contract; preserving the operator's assignment order is more important.
    return rowChildren.filter(child => child.column < column).sort((a, b) => b.column - a.column)[0]
      ?? rowChildren.sort((a, b) => a.column - b.column)[0];
  }

  private async openSplit(request: LayoutPlacementRequest, targetPane: string, direction: SplitDirection) {
    const args = ["plugin", "pane", "open", "--plugin", request.plugin, "--entrypoint", request.entrypoint, "--placement", "split", "--direction", direction, "--target-pane", targetPane, "--cwd", request.cwd];
    for (const env of request.env ?? []) args.push("--env", env);
    args.push("--no-focus");
    const pane = paneFromOpen(asResult(await this.cli(args)));
    return this.requirePane(pane);
  }

  private async openTab(request: LayoutPlacementRequest) {
    const args = ["plugin", "pane", "open", "--plugin", request.plugin, "--entrypoint", request.entrypoint, "--placement", "tab", "--workspace", this.groupsWorkspace(request), "--cwd", request.cwd];
    for (const env of request.env ?? []) args.push("--env", env);
    args.push("--no-focus");
    const pane = paneFromOpen(asResult(await this.cli(args)));
    return this.requirePane(pane);
  }

  private groupsWorkspace(request: LayoutPlacementRequest): string {
    for (const group of this.groups.values()) if (group.callerPane === request.callerPane) return group.workspaceId;
    throw new Error("Layout workspace is not initialized");
  }

  private requirePane(pane: any) {
    if (!pane || typeof pane.pane_id !== "string" || typeof pane.tab_id !== "string") throw new Error("Herdr did not return a complete pane identity");
    return { paneId: pane.pane_id as string, tabId: pane.tab_id as string };
  }

  private slotSet(slots: Map<number, Set<number>>, tabIndex: number): Set<number> {
    let values = slots.get(tabIndex);
    if (!values) {
      values = new Set();
      slots.set(tabIndex, values);
    }
    return values;
  }

  private compactColumns(group: Group, removed: LayoutChild): number | undefined {
    const tabChildren = [...group.children.values()].filter(child => child.tabIndex === removed.tabIndex);
    // A surviving partner still occupies the physical column. Preserve its
    // column number so the first vacant slot recreates the missing half there.
    if (tabChildren.some(child => child.column === removed.column)) return undefined;
    // Once both halves are gone, Herdr compacts that branch physically. Keep
    // both rows' metadata and pending lower refills aligned with the columns.
    for (const child of tabChildren) if (child.column > removed.column) child.column--;
    const pending = this.slotSet(group.rightSplitLowerSlots, removed.tabIndex);
    const shifted = [...pending].map(column => column > removed.column ? column - 1 : column);
    pending.clear();
    for (const column of shifted) pending.add(column);
    return tabChildren.length ? Math.max(...tabChildren.map(child => child.column)) + 1 : 0;
  }

  private async balance(group: Group, tabIndex: number, row: number) {
    const members = [...group.children.values()].filter(child => child.tabIndex === tabIndex && child.row === row).sort((a, b) => a.column - b.column);
    if (members.length < 2) return;
    const layout = await inspectLayout(this.cli, members[0].paneId);
    const panes = new Map((layout.panes as any[]).map(pane => [pane.pane_id, pane]));
    const rects = members.map(child => panes.get(child.paneId)?.rect).filter((rect: any) => rect && Number.isFinite(rect.x) && Number.isFinite(rect.width));
    if (rects.length !== members.length) return;
    const left = Math.min(...rects.map((rect: any) => rect.x));
    const right = Math.max(...rects.map((rect: any) => rect.x + rect.width));
    const total = right - left;
    if (!(total > 0)) return;
    const desired = total / members.length;
    // Herdr's resize amount is a fraction of the available layout. Bounded
    // adjustments per divider avoid geometric drift from repeated splits.
    for (let index = 0; index < members.length - 1; index++) {
      // Herdr rounds resize amounts to terminal cells. A bounded second pass
      // removes the remaining one-cell drift without continuously overriding
      // manual resizing outside this placement operation.
      for (let pass = 0; pass < 3; pass++) {
        const current = panes.get(members[index].paneId)?.rect;
        if (!current || !Number.isFinite(current.width)) break;
        const delta = current.width - desired;
        if (Math.abs(delta) / total < 0.005) break;
        const direction: "left" | "right" = delta > 0 ? "left" : "right";
        // Herdr addresses the divider on the selected pane's side. Use the
        // next pane so the adjustment changes this member's right edge rather
        // than a preceding divider.
        await this.cli(["pane", "resize", "--direction", direction, "--amount", (Math.abs(delta) / total).toFixed(6), "--pane", members[index + 1].paneId]);
        const refreshed = await inspectLayout(this.cli, members[0].paneId);
        panes.clear();
        for (const pane of refreshed.panes as any[]) panes.set(pane.pane_id, pane);
      }
    }
  }

  private async balanceHeight(group: Group) {
    const mainTab = [...group.children.values()].filter(child => child.tabIndex === 0);
    if (!mainTab.length) return;
    const layout = await inspectLayout(this.cli, mainTab[0].paneId);
    const panes = new Map((layout.panes as any[]).map(pane => [pane.pane_id, pane]));
    const children = mainTab.map(child => panes.get(child.paneId));
    const caller = panes.get(group.callerPane) ?? (await inspectLayout(this.cli, group.callerPane)).panes.find((pane: any) => pane.pane_id === group.callerPane);
    const rects = [...children, caller].map(pane => pane?.rect).filter((rect: any) => rect && Number.isFinite(rect.y) && Number.isFinite(rect.height));
    if (rects.length !== children.length + 1 || !caller?.rect) return;
    const top = Math.min(...rects.map((rect: any) => rect.y));
    const bottom = Math.max(...rects.map((rect: any) => rect.y + rect.height));
    const total = bottom - top;
    if (!(total > 0)) return;
    const desiredCaller = total * (mainTab.length <= CHILDREN_PER_ROW ? 2 / 3 : 1 / 3);
    const delta = (desiredCaller - caller.rect.height) / total;
    if (Math.abs(delta) >= 0.005) await this.cli(["pane", "resize", "--direction", delta > 0 ? "up" : "down", "--amount", Math.abs(delta).toFixed(6), "--pane", group.callerPane]);
  }

  private async removeEmptyTab(group: Group, child: LayoutChild) {
    if (child.tabIndex === 0 || [...group.children.values()].some(candidate => candidate.tabIndex === child.tabIndex)) return;
    group.tabs.delete(child.tabIndex);
    group.managedTabTitles.delete(child.tabId);
    try {
      const tabs = asResult(await this.cli(["tab", "list", "--workspace", group.workspaceId])).tabs ?? [];
      const tab = tabs.find((candidate: any) => candidate.tab_id === child.tabId);
      if (tab && Number(tab.pane_count) === 0) await this.cli(["tab", "close", child.tabId]);
    } catch { /* Herdr may retire an empty plugin tab as part of pane close. */ }
  }
}

/** Pure slot allocation used by deterministic tests and callers that need to inspect the contract. */
export function layoutSlot(occupied: Array<Pick<LayoutChild, "tabIndex" | "row" | "column">>) {
  const used = new Set(occupied.map(child => child.tabIndex * CHILDREN_PER_TAB + child.row * CHILDREN_PER_ROW + child.column));
  for (let ordinal = 0; ; ordinal++) if (!used.has(ordinal)) return {
    tabIndex: Math.floor(ordinal / CHILDREN_PER_TAB),
    row: Math.floor((ordinal % CHILDREN_PER_TAB) / CHILDREN_PER_ROW),
    column: ordinal % CHILDREN_PER_ROW,
  };
}

export function compactLayoutChild(child: LayoutChild) {
  return { ...compactPane({ pane_id: child.paneId, tab_id: child.tabId, workspace_id: child.workspaceId }), childId: child.childId, tabIndex: child.tabIndex, row: child.row, column: child.column };
}
