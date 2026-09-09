import type { HerdrCli } from "../herdr-cli.ts";
import { compactPane, inspectLayout, inspectPane, result } from "../herdr-cli.ts";

export const CHILDREN_PER_TAB = 4;
export const CHILDREN_PER_ROW = 4;

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
interface Group {
  callerPane: string;
  callerTab: string;
  workspaceId: string;
  children: Map<string, LayoutChild>;
  tabs: Map<number, string>;
  tail: Promise<unknown>;
}

const asResult = (text: string) => result(text) as any;
const paneFromOpen = (value: any) => value?.plugin_pane?.pane ?? value?.pane ?? value?.root_pane;

/**
 * Children sit above the caller, left to right, with four children per tab.
 * Overflow tabs avoid restructuring live pane trees and every creation uses
 * Herdr's non-focusing operations.
 *
 * This class owns only panes it opened and tabs it created through placement.
 * It never closes a caller, an unrelated pane, or a pre-existing tab.
 */
export class SubagentLayout {
  private groups = new Map<string, Group>();
  private readonly cli: HerdrCli;
  constructor(cli: HerdrCli) { this.cli = cli; }

  snapshot(origin: string): LayoutChild[] {
    return [...(this.groups.get(origin)?.children.values() ?? [])].map(child => ({ ...child }));
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
      if (!owned || owned.paneId !== paneId) throw new Error("Visible child pane is not owned by this layout");
      await this.cli(["plugin", "pane", "close", paneId]);
      group.children.delete(childId);
      this.compactRow(group, owned);
      await this.removeEmptyTab(group, owned);
      await this.balance(group, owned.tabIndex, owned.row);
      await this.balanceHeight(group);
      if (!group.children.size) this.groups.delete(this.originFor(group));
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
    const group: Group = { callerPane, callerTab: "", workspaceId: "", children: new Map(), tabs: new Map(), tail: Promise.resolve() };
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
    const slot = this.nextSlot(group);
    let paneId: string | undefined;
    let tabId: string | undefined;
    if (slot.tabIndex === 0 && slot.column === 0) {
        const opened = await this.openSplit(request, request.callerPane, "down");
        paneId = opened.paneId; tabId = opened.tabId;
      } else if (slot.column === 0 && slot.tabIndex > 0) {
        const opened = await this.openTab(request);
        paneId = opened.paneId; tabId = opened.tabId;
      } else {
        const target = this.targetFor(group, slot.tabIndex, slot.row, slot.column);
        if (!target) throw new Error("No owned pane available for a new layout slot");
        const opened = await this.openSplit(request, target.paneId, "right");
        paneId = opened.paneId; tabId = opened.tabId;
      }
      if (!paneId || !tabId) throw new Error("Herdr did not return the created pane identity");
      const owned: LayoutChild = { childId: request.childId, paneId, tabId, workspaceId: group.workspaceId, ...slot };
      // Register immediately after creation. If identity verification or polish
      // fails, the visible child can settle this exact returned pane before it
      // is closed.
      group.children.set(request.childId, owned);
      if (!group.tabs.has(slot.tabIndex)) group.tabs.set(slot.tabIndex, tabId);
      try {
        if (slot.tabIndex === 0 && slot.column === 0) {
          // Plugin splits only support right/down. Move the existing caller
          // below the new child without replacing its process or taking focus.
          await this.cli(["pane", "move", group.callerPane, "--target-pane", paneId, "--split", "down", "--no-focus"]);
        }
        const pane = await inspectPane(this.cli, paneId);
        if (pane.workspace_id !== group.workspaceId || pane.tab_id !== tabId) throw new Error("Created pane identity changed");
        await this.cli(["pane", "rename", paneId, request.title.slice(0, 160)]);
        await this.balance(group, slot.tabIndex, slot.row);
        await this.balanceHeight(group);
      } catch (error) {
        throw new LayoutPlacementError(String(error), { ...owned });
      }
      return { ...owned };
  }

  private nextSlot(group: Group): { tabIndex: number; row: number; column: number } {
    const used = new Set([...group.children.values()].map(child => child.tabIndex * CHILDREN_PER_TAB + child.row * CHILDREN_PER_ROW + child.column));
    for (let ordinal = 0; ; ordinal++) if (!used.has(ordinal)) return {
      tabIndex: Math.floor(ordinal / CHILDREN_PER_TAB),
      row: 0,
      column: ordinal % CHILDREN_PER_ROW,
    };
  }

  private targetFor(group: Group, tabIndex: number, row: number, column: number): LayoutChild | undefined {
    const rowChildren = [...group.children.values()].filter(child => child.tabIndex === tabIndex && child.row === row);
    if (column === 0) return undefined;
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

  private compactRow(group: Group, removed: LayoutChild) {
    const row = [...group.children.values()]
      .filter(child => child.tabIndex === removed.tabIndex && child.row === removed.row)
      .sort((a, b) => a.column - b.column);
    row.forEach((child, column) => { child.column = column; });
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
    const desiredCaller = (2 / 3) * total;
    const delta = (desiredCaller - caller.rect.height) / total;
    if (Math.abs(delta) >= 0.005) await this.cli(["pane", "resize", "--direction", delta > 0 ? "up" : "down", "--amount", Math.abs(delta).toFixed(6), "--pane", group.callerPane]);
  }

  private async removeEmptyTab(group: Group, child: LayoutChild) {
    if (child.tabIndex === 0 || [...group.children.values()].some(candidate => candidate.tabIndex === child.tabIndex)) return;
    group.tabs.delete(child.tabIndex);
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
    row: 0,
    column: ordinal % CHILDREN_PER_ROW,
  };
}

export function compactLayoutChild(child: LayoutChild) {
  return { ...compactPane({ pane_id: child.paneId, tab_id: child.tabId, workspace_id: child.workspaceId }), childId: child.childId, tabIndex: child.tabIndex, row: child.row, column: child.column };
}
