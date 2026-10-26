export const PANES_PER_ROW = 2;
export const ROWS_PER_TAB = 1;
export const MIN_PANE_COLUMNS = 50;
export const MIN_PANE_ROWS = 14;

export interface LayoutMember {
  childId: string;
  parentId?: string;
  role: string;
  order: number;
}

export type DesiredLayoutKind = "ordinary" | "team-leader" | "team-descendant";
export type LayoutTab = "origin" | `team:${string}` | `overflow:${number}`;
export interface DesiredLayoutSlot {
  childId: string;
  groupId: string;
  kind: DesiredLayoutKind;
  tab: LayoutTab;
  row: number;
  column: number;
  anchor: boolean;
}
export interface DesiredLayout {
  slots: DesiredLayoutSlot[];
  dedicatedTeams: string[];
}
export interface LayoutCapacity {
  origin: number;
  overflow: number;
  team: number;
}

/** An unsplit overflow pane is still available when the window itself is small. */
export function layoutCapacity(width: number, height: number): LayoutCapacity {
  const columns = Math.max(0, Math.min(PANES_PER_ROW, Math.floor(width / MIN_PANE_COLUMNS)));
  const halfFits = Math.floor(height / 2) >= MIN_PANE_ROWS;
  return {
    origin: halfFits ? columns : 0,
    overflow: height >= MIN_PANE_ROWS ? Math.max(1, columns) : 1,
    team: halfFits ? columns : 0,
  };
}

/** Derive placement from ancestry and readable capacity, not physical split history. */
export function desiredLayout(members: readonly LayoutMember[], capacity: LayoutCapacity = {origin:2,overflow:2,team:2}): DesiredLayout {
  const ordered = [...members].sort((a, b) => a.order - b.order || a.childId.localeCompare(b.childId));
  const byId = new Map(ordered.map(member => [member.childId, member]));
  const leaders = ordered.filter(member => member.role === "teamlead");
  const teams = new Map(leaders.map(member => [member.childId, [member]]));
  const ordinary: LayoutMember[] = [];
  for (const member of ordered) {
    if (member.role === "teamlead") continue;
    const seen = new Set<string>();
    let parent = member.parentId ? byId.get(member.parentId) : undefined;
    while (parent && !seen.has(parent.childId) && parent.role !== "teamlead") {
      seen.add(parent.childId);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    if (parent?.role === "teamlead") teams.get(parent.childId)!.push(member);
    else ordinary.push(member);
  }

  const slots: DesiredLayoutSlot[] = [];
  const dedicatedTeams: string[] = [];
  // One group owns the origin row. A Team Lead never shares it with unrelated agents.
  const firstGroup = capacity.origin > 0 ? ordered.find(member => ordinary.includes(member)
    || (member.role === "teamlead" && teams.get(member.childId)!.length <= capacity.origin)) : undefined;
  const ordinaryAtOrigin = firstGroup !== undefined && ordinary.includes(firstGroup);
  for (const leader of leaders) {
    const team = teams.get(leader.childId)!;
    const shared = firstGroup === leader && team.length <= capacity.origin;
    if (!shared) dedicatedTeams.push(leader.childId);
    for (let index = 0; index < team.length; index++) {
      const member = team[index];
      const descendant = index - 1;
      const primary = descendant < capacity.team;
      const overflow = Math.max(0, descendant - capacity.team);
      slots.push({
        childId: member.childId, groupId: leader.childId,
        kind: index === 0 ? "team-leader" : "team-descendant",
        tab: shared ? "origin" : index === 0 || primary ? `team:${leader.childId}`
          : `team:${leader.childId}:overflow:${Math.floor(overflow / capacity.overflow) + 1}`,
        row: !shared && index === 0 ? 1 : 0,
        column: shared ? index : index === 0 ? 0 : primary ? descendant : overflow % capacity.overflow,
        anchor: !shared && index === 0,
      });
    }
  }
  const originCount = ordinaryAtOrigin ? capacity.origin : 0;
  ordinary.forEach((member, index) => {
    const overflow = index - originCount;
    slots.push({
      childId: member.childId, groupId: "ordinary", kind: "ordinary",
      tab: index < originCount ? "origin" : `overflow:${Math.floor(overflow / capacity.overflow) + 1}`,
      row: 0, column: index < originCount ? index : overflow % capacity.overflow, anchor: false,
    });
  });
  return {slots, dedicatedTeams};
}
