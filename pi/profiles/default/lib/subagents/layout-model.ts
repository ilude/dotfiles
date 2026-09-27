export const PANES_PER_ROW = 5;
export const ROWS_PER_TAB = 2;

export interface LayoutMember {
  childId: string;
  parentId?: string;
  role: string;
  order: number;
}

export type DesiredLayoutKind = "ordinary" | "team-leader" | "team-descendant";

export interface DesiredLayoutSlot {
  childId: string;
  groupId: string;
  kind: DesiredLayoutKind;
  tab: "origin" | `team:${string}` | `overflow:${number}`;
  row: number;
  column: number;
  anchor: boolean;
}

export interface DesiredLayout {
  slots: DesiredLayoutSlot[];
  dedicatedTeams: string[];
}

/**
 * Derive logical placement from current live ancestry. Physical split history is
 * deliberately absent so reconciliation is deterministic and repeatable.
 */
export function desiredLayout(members: readonly LayoutMember[]): DesiredLayout {
  const ordered = [...members].sort((a, b) => a.order - b.order || a.childId.localeCompare(b.childId));
  const byId = new Map(ordered.map(member => [member.childId, member]));
  const leaders = ordered.filter(member => member.role === "teamlead");
  const nearestLeader = (member: LayoutMember): LayoutMember | undefined => {
    const seen = new Set<string>();
    let parent = member.parentId ? byId.get(member.parentId) : undefined;
    while (parent && !seen.has(parent.childId)) {
      seen.add(parent.childId);
      if (parent.role === "teamlead") return parent;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return undefined;
  };
  const teamMembers = new Map<string, LayoutMember[]>();
  for (const leader of leaders) teamMembers.set(leader.childId, [leader]);
  const ordinary: LayoutMember[] = [];
  for (const member of ordered) {
    if (member.role === "teamlead") continue;
    const leader = nearestLeader(member);
    if (leader) teamMembers.get(leader.childId)?.push(member);
    else ordinary.push(member);
  }

  // Allocate row owners by first appearance. A late Team Lead never shares an
  // occupied ordinary row: it takes the next wholly free row or starts a
  // dedicated tab. This avoids moving unrelated live processes merely to put a
  // newer group above an older one.
  const ordinaryRows = Math.min(ROWS_PER_TAB, Math.ceil(ordinary.length / PANES_PER_ROW));
  const groups: Array<{id:string; order:number; rows:number}> = leaders.map(leader => ({
    id: leader.childId, order: leader.order,
    rows: Math.ceil((teamMembers.get(leader.childId)?.length ?? 1) / PANES_PER_ROW),
  }));
  if (ordinary.length) groups.push({id:"ordinary", order:ordinary[0].order, rows:ordinaryRows});
  groups.sort((a,b) => a.order-b.order || a.id.localeCompare(b.id));
  const originStart = new Map<string,number>();
  const originRows = new Map<string,number>();
  const dedicated = new Set<string>();
  let freeRows = ROWS_PER_TAB;
  for (const group of groups) {
    const allocated = group.id === "ordinary" ? Math.min(group.rows,freeRows) : group.rows <= freeRows ? group.rows : 0;
    if (allocated) {
      originStart.set(group.id, ROWS_PER_TAB-freeRows);
      originRows.set(group.id,allocated);
      freeRows -= allocated;
    } else if (group.id !== "ordinary") dedicated.add(group.id);
  }

  const slots: DesiredLayoutSlot[] = [];
  for (const leader of leaders) {
    const group = teamMembers.get(leader.childId) ?? [leader];
    const start = originStart.get(leader.childId);
    if (start !== undefined) {
      group.forEach((member, index) => slots.push({
        childId: member.childId, groupId: leader.childId,
        kind: index === 0 ? "team-leader" : "team-descendant",
        tab: "origin", row: start + Math.floor(index / PANES_PER_ROW),
        column: index % PANES_PER_ROW, anchor: false,
      }));
    } else {
      const [lead, ...descendants] = group;
      slots.push({childId: lead.childId, groupId: leader.childId, kind: "team-leader", tab: `team:${leader.childId}`, row: ROWS_PER_TAB, column: 0, anchor: true});
      descendants.forEach((member, index) => slots.push({
        childId: member.childId, groupId: leader.childId, kind: "team-descendant",
        tab: `team:${leader.childId}`, row: Math.floor(index / PANES_PER_ROW),
        column: index % PANES_PER_ROW, anchor: false,
      }));
    }
  }

  const ordinaryStart = originStart.get("ordinary");
  ordinary.forEach((member, index) => {
    const availableOrigin = (originRows.get("ordinary") ?? 0) * PANES_PER_ROW;
    if (index < availableOrigin) {
      slots.push({childId: member.childId, groupId: "ordinary", kind: "ordinary", tab: "origin", row: ordinaryStart! + Math.floor(index / PANES_PER_ROW), column: index % PANES_PER_ROW, anchor: false});
      return;
    }
    const overflowIndex = index - availableOrigin;
    const tabNumber = Math.floor(overflowIndex / (ROWS_PER_TAB * PANES_PER_ROW)) + 1;
    const local = overflowIndex % (ROWS_PER_TAB * PANES_PER_ROW);
    slots.push({childId: member.childId, groupId: "ordinary", kind: "ordinary", tab: `overflow:${tabNumber}`, row: Math.floor(local / PANES_PER_ROW), column: local % PANES_PER_ROW, anchor: false});
  });
  return {slots, dedicatedTeams: [...dedicated]};
}
