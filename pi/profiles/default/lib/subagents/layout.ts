import type { HerdrCli } from "../herdr-cli.ts";
import { compactPane, inspectPane, result } from "../herdr-cli.ts";

export const CHILDREN_PER_TAB = 8;
export const CHILDREN_PER_ROW = 4;

type SplitDirection = "right" | "down";
type FocusDirection = "left" | "right" | "up" | "down";
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
export interface LayoutFocus {
  paneId: string;
  tabId: string;
  workspaceId: string;
}
interface Group {
  callerPane: string;
  callerTab: string;
  workspaceId: string;
  children: Map<string, LayoutChild>;
  tabs: Map<number, string>;
  tail: Promise<unknown>;
}

const directions: FocusDirection[] = ["left", "right", "up", "down"];
const asResult = (text: string) => result(text) as any;
const paneFromOpen = (value: any) => value?.plugin_pane?.pane ?? value?.pane ?? value?.root_pane;

/**
 * Herdr has no split-up operation. A down split followed by an exact pane swap
 * is the smallest composition that puts the first pane above the caller.
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

  async captureFocus(): Promise<LayoutFocus> {
    return this.focus();
  }

  async close(origin: string, childId: string, paneId: string, preservedFocus?: LayoutFocus): Promise<void> {
    const group = this.groups.get(origin);
    if (!group) return;
    await this.serial(group, async () => {
      const owned = group.children.get(childId);
      if (!owned || owned.paneId !== paneId) throw new Error("Visible child pane is not owned by this layout");
      const focus = preservedFocus ?? await this.focus();
      try {
        await this.cli(["plugin", "pane", "close", paneId]);
        group.children.delete(childId);
        this.compactRow(group, owned);
        await this.removeEmptyTab(group, owned);
        await this.balance(group, owned.tabIndex, owned.row);
        await this.balanceHeight(group);
      } finally {
        await this.restoreFocus(focus, paneId === focus.paneId ? group.callerPane : undefined);
      }
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
    const focus = await this.focus();
    let paneId: string | undefined;
    let tabId: string | undefined;
    try {
      if (slot.tabIndex === 0 && slot.row === 0 && slot.column === 0 && !group.children.size) {
        const opened = await this.openSplit(request, request.callerPane, "down");
        paneId = opened.paneId; tabId = opened.tabId;
        await this.swap(opened.paneId, request.callerPane);
      } else if (slot.tabIndex === 0 && slot.column === 0) {
        const target = this.targetFor(group, slot.tabIndex, slot.row, slot.column);
        if (!target) throw new Error("No owned pane available for a new layout row");
        const opened = await this.openSplit(request, target.paneId, "down");
        paneId = opened.paneId; tabId = opened.tabId;
      } else if (slot.column === 0 && slot.tabIndex > 0 && slot.row === 0) {
        const opened = await this.openTab(request);
        paneId = opened.paneId; tabId = opened.tabId;
      } else {
        const target = this.targetFor(group, slot.tabIndex, slot.row, slot.column);
        if (!target) throw new Error("No owned pane available for a new layout slot");
        const opened = await this.openSplit(request, target.paneId, slot.column === 0 ? "down" : "right");
        paneId = opened.paneId; tabId = opened.tabId;
      }
      if (!paneId || !tabId) throw new Error("Herdr did not return the created pane identity");
      const pane = await inspectPane(this.cli, paneId);
      if (pane.workspace_id !== group.workspaceId || pane.tab_id !== tabId) throw new Error("Created pane identity changed");
      const owned: LayoutChild = { childId: request.childId, paneId, tabId, workspaceId: group.workspaceId, ...slot };
      // Register the pane before the rename/layout polish. If polish fails, the
      // visible child must settle its process before this pane is closed.
      group.children.set(request.childId, owned);
      if (!group.tabs.has(slot.tabIndex)) group.tabs.set(slot.tabIndex, tabId);
      try {
        await this.cli(["pane", "rename", paneId, request.title.slice(0, 160)]);
        await this.balance(group, slot.tabIndex, slot.row);
        await this.balanceHeight(group);
      } catch (error) {
        throw new LayoutPlacementError(String(error), { ...owned });
      }
      return { ...owned };
    } finally {
      await this.restoreFocus(focus);
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
    if (column === 0) {
      if (row === 1) return rowChildren.length
        ? rowChildren[0]
        : [...group.children.values()].find(child => child.tabIndex === tabIndex && child.row === 0 && child.column === 0);
      return undefined;
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

  private async swap(sourcePane: string, targetPane: string) {
    await this.cli(["pane", "swap", "--source-pane", sourcePane, "--target-pane", targetPane]);
  }

  private async focus(): Promise<LayoutFocus> {
    // `pane current` reports the pane from the calling process context when
    // HERDR_PANE_ID is set. That is the orchestrator, not necessarily the
    // pane the operator is currently viewing. Resolve focus from the server's
    // focused workspace, tab, and pane records instead.
    const workspaces = asResult(await this.cli(["workspace", "list"])).workspaces;
    const workspace = Array.isArray(workspaces) ? workspaces.find((candidate: any) => candidate?.focused === true) : undefined;
    if (!workspace || typeof workspace.workspace_id !== "string") throw new Error("Herdr did not return focused workspace identity");
    const workspaceId = workspace.workspace_id;
    const tabs = asResult(await this.cli(["tab", "list", "--workspace", workspaceId])).tabs;
    const tab = Array.isArray(tabs) ? tabs.find((candidate: any) => candidate?.focused === true && candidate.workspace_id === workspaceId) : undefined;
    if (!tab || typeof tab.tab_id !== "string") throw new Error("Herdr did not return focused tab identity");
    const tabId = tab.tab_id;
    const panes = asResult(await this.cli(["pane", "list", "--workspace", workspaceId])).panes;
    const pane = Array.isArray(panes) ? panes.find((candidate: any) => candidate?.focused === true && candidate.tab_id === tabId && candidate.workspace_id === workspaceId) : undefined;
    if (!pane || typeof pane.pane_id !== "string") throw new Error("Herdr did not return focused pane identity");
    return { paneId: pane.pane_id, tabId, workspaceId };
  }

  private async restoreFocus(focus: LayoutFocus, fallback?: string): Promise<void> {
    const target = fallback ?? focus.paneId;
    // A focused pane may be the last pane in an overflow tab. Closing it can
    // retire that tab before this finally block runs, so never focus a stale
    // tab id. Resolve the surviving target first when a fallback is supplied.
    const targetInfo = fallback ? await inspectPane(this.cli, target) : undefined;
    await this.cli(["workspace", "focus", targetInfo?.workspace_id ?? focus.workspaceId]);
    await this.cli(["tab", "focus", targetInfo?.tab_id ?? focus.tabId]);
    let current = await this.focus();
    if (current.paneId === target) return;
    const layout = asResult(await this.cli(["pane", "layout", "--pane", target])).layout;
    const available = new Set((layout?.panes ?? []).map((pane: any) => pane.pane_id));
    if (!available.has(target) || !current.paneId || !available.has(current.paneId)) throw new Error("Unable to restore Herdr focus identity");
    const queue = [current.paneId];
    const seen = new Set(queue);
    const routes = new Map<string, { from: string; direction: FocusDirection }>();
    while (queue.length) {
      const from = queue.shift()!;
      if (from === target) break;
      for (const direction of directions) {
        try {
          const neighbor = asResult(await this.cli(["pane", "neighbor", "--direction", direction, "--pane", from])).neighbor?.neighbor_pane_id;
          if (typeof neighbor === "string" && available.has(neighbor) && !seen.has(neighbor)) {
            seen.add(neighbor); routes.set(neighbor, { from, direction }); queue.push(neighbor);
          }
        } catch { /* Edge panes have no neighbor in this direction. */ }
      }
    }
    if (!seen.has(target)) throw new Error("Unable to route Herdr focus to the previous pane");
    const path: Array<{ from: string; direction: FocusDirection }> = [];
    for (let at = target; at !== current.paneId;) { const route = routes.get(at); if (!route) throw new Error("Incomplete Herdr focus route"); path.unshift(route); at = route.from; }
    for (const route of path) await this.cli(["pane", "focus", "--direction", route.direction, "--pane", route.from]);
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
    const panes = await Promise.all(members.map(child => inspectPane(this.cli, child.paneId)));
    const rects = panes.map(pane => pane.rect).filter((rect: any) => rect && Number.isFinite(rect.x) && Number.isFinite(rect.width));
    if (rects.length !== members.length) return;
    const left = Math.min(...rects.map((rect: any) => rect.x));
    const right = Math.max(...rects.map((rect: any) => rect.x + rect.width));
    const total = right - left;
    if (!(total > 0)) return;
    const desired = total / members.length;
    // Herdr's resize amount is a fraction of the available layout. One
    // adjustment per divider avoids the geometric drift of repeated splits.
    for (let index = 0; index < members.length - 1; index++) {
      const current = (await inspectPane(this.cli, members[index].paneId)).rect;
      if (!current || !Number.isFinite(current.width)) continue;
      const delta = (desired - current.width) / total;
      if (Math.abs(delta) < 0.005) continue;
      await this.cli(["pane", "resize", "--direction", "right", "--amount", delta.toFixed(6), "--pane", members[index].paneId]);
    }
  }

  private async balanceHeight(group: Group) {
    const mainTab = [...group.children.values()].filter(child => child.tabIndex === 0);
    if (!mainTab.length) return;
    const children = await Promise.all(mainTab.map(child => inspectPane(this.cli, child.paneId)));
    const caller = await inspectPane(this.cli, group.callerPane);
    const rects = [...children, caller].map(pane => pane.rect).filter((rect: any) => rect && Number.isFinite(rect.y) && Number.isFinite(rect.height));
    if (rects.length !== children.length + 1) return;
    const top = Math.min(...rects.map((rect: any) => rect.y));
    const bottom = Math.max(...rects.map((rect: any) => rect.y + rect.height));
    const total = bottom - top;
    if (!(total > 0)) return;
    const rows = Math.max(...mainTab.map(child => child.row)) + 1;
    const desiredCaller = (rows === 1 ? 2 / 3 : 1 / 3) * total;
    const delta = (desiredCaller - caller.rect.height) / total;
    if (Math.abs(delta) >= 0.005) await this.cli(["pane", "resize", "--direction", "up", "--amount", delta.toFixed(6), "--pane", group.callerPane]);
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
    row: Math.floor((ordinal % CHILDREN_PER_TAB) / CHILDREN_PER_ROW),
    column: ordinal % CHILDREN_PER_ROW,
  };
}

export function compactLayoutChild(child: LayoutChild) {
  return { ...compactPane({ pane_id: child.paneId, tab_id: child.tabId, workspace_id: child.workspaceId }), childId: child.childId, tabIndex: child.tabIndex, row: child.row, column: child.column };
}
