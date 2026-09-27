import { describe, expect, it } from "vitest";
import { desiredLayout, PANES_PER_ROW } from "../lib/subagents/layout-model.ts";

const members = (count: number) => Array.from({length: count}, (_, order) => ({childId: `c${order}`, role: "developer", order}));

describe("desired subagent layout", () => {
  it.each([1, 5, 6, 10, 11, 12])("compacts %i ordinary agents through five-wide rows", count => {
    const result = desiredLayout(members(count));
    expect(PANES_PER_ROW).toBe(5);
    expect(result.slots.map(slot => [slot.tab, slot.row, slot.column])).toEqual(
      Array.from({length: count}, (_, index) => index < 10
        ? ["origin", Math.floor(index / 5), index % 5]
        : ["overflow:1", Math.floor((index - 10) / 5), (index - 10) % 5]),
    );
  });

  it("reserves a whole row for a team before ordinary agents", () => {
    const result = desiredLayout([
      {childId:"ordinary",role:"developer",order:0},
      {childId:"lead",role:"teamlead",order:1},
      {childId:"worker",parentId:"lead",role:"developer",order:2},
    ]);
    expect(result.slots.find(slot => slot.childId === "lead")).toMatchObject({tab:"origin",row:1,column:0,kind:"team-leader"});
    expect(result.slots.find(slot => slot.childId === "worker")).toMatchObject({tab:"origin",row:1,column:1});
    expect(result.slots.find(slot => slot.childId === "ordinary")).toMatchObject({tab:"origin",row:0,column:0});
  });

  it.each([0, 1, 4])("keeps a lead and %i descendants in one shared row", descendantCount => {
    const input = [{childId:"lead",role:"teamlead",order:0}, ...Array.from({length: descendantCount}, (_, i) => ({childId:`d${i}`,parentId:"lead",role:"developer",order:i+1}))];
    expect(desiredLayout(input).dedicatedTeams).toEqual([]);
    expect(desiredLayout(input).slots.every(slot => slot.tab === "origin" && slot.row === 0)).toBe(true);
  });

  it("uses both shared rows for five through nine descendants", () => {
    const input = [{childId:"lead",role:"teamlead",order:0}, ...Array.from({length: 9}, (_, i) => ({childId:`d${i}`,parentId:"lead",role:"developer",order:i+1}))];
    const result = desiredLayout(input);
    expect(result.dedicatedTeams).toEqual([]);
    expect(new Set(result.slots.map(slot => slot.row))).toEqual(new Set([0, 1]));
  });

  it("moves a team to a dedicated tab when a second row is unavailable", () => {
    const input = [
      {childId:"first",role:"teamlead",order:0},
      {childId:"second",role:"teamlead",order:1},
      ...Array.from({length: 5}, (_, i) => ({childId:`d${i}`,parentId:"second",role:"developer",order:i+2})),
    ];
    const result = desiredLayout(input);
    expect(result.dedicatedTeams).toEqual(["second"]);
    expect(result.slots.find(slot => slot.childId === "second")).toMatchObject({tab:"team:second",anchor:true,row:2});
    expect(result.slots.filter(slot => slot.groupId === "second" && !slot.anchor).map(slot => slot.column)).toEqual([0,1,2,3,4]);
  });

  it("gives a nested team its own group", () => {
    const result = desiredLayout([
      {childId:"outer",role:"teamlead",order:0},
      {childId:"outer-worker",parentId:"outer",role:"developer",order:1},
      {childId:"inner",parentId:"outer",role:"teamlead",order:2},
      {childId:"inner-worker",parentId:"inner",role:"developer",order:3},
    ]);
    expect(result.slots.find(slot => slot.childId === "outer-worker")?.groupId).toBe("outer");
    expect(result.slots.find(slot => slot.childId === "inner")?.groupId).toBe("inner");
    expect(result.slots.find(slot => slot.childId === "inner-worker")?.groupId).toBe("inner");
  });

  it("returns a shrunken team to the origin deterministically", () => {
    const crowded = [
      {childId:"first",role:"teamlead",order:0},
      {childId:"second",role:"teamlead",order:1},
      ...Array.from({length: 5}, (_, i) => ({childId:`d${i}`,parentId:"second",role:"developer",order:i+2})),
    ];
    expect(desiredLayout(crowded).dedicatedTeams).toEqual(["second"]);
    expect(desiredLayout(crowded.filter(member => member.childId === "second" || member.childId.startsWith("d"))).dedicatedTeams).toEqual([]);
  });
});
