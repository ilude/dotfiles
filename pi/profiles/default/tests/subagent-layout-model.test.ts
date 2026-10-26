import { describe, expect, it } from "vitest";
import { desiredLayout, layoutCapacity, PANES_PER_ROW } from "../lib/subagents/layout-model.ts";

const members = (count: number) => Array.from({length:count},(_,order) => ({childId:`c${order}`,role:"developer",order}));
const team = (descendants: number) => [{childId:"lead",role:"teamlead",order:0},
  ...Array.from({length:descendants},(_,index) => ({childId:`d${index}`,parentId:"lead",role:"developer",order:index+1}))];

describe("readable subagent layout", () => {
  it.each([
    [112,67,{origin:2,overflow:2,team:2}],
    [99,40,{origin:1,overflow:1,team:1}],
    [49,40,{origin:0,overflow:1,team:0}],
    [112,27,{origin:0,overflow:2,team:0}],
    [112,13,{origin:0,overflow:1,team:0}],
    [300,100,{origin:2,overflow:2,team:2}],
  ])("uses readable capacity at %i columns and %i rows", (width,height,capacity) => {
    expect(layoutCapacity(width,height)).toEqual(capacity);
  });

  it.each([1,2,3,4,5,12])("places %i ordinary agents in one row with early overflow", count => {
    expect(PANES_PER_ROW).toBe(2);
    expect(desiredLayout(members(count)).slots.map(slot => [slot.tab,slot.row,slot.column])).toEqual(
      Array.from({length:count},(_,index) => [index < 2 ? "origin" : `overflow:${Math.floor(index/2)}`,0,index%2]),
    );
  });

  it("routes all children to unsplit overflow when the main window is too narrow", () => {
    expect(desiredLayout(members(3),layoutCapacity(49,40)).slots.map(slot => slot.tab)).toEqual(["overflow:1","overflow:2","overflow:3"]);
  });

  it("does not mix a Team Lead with unrelated ordinary agents", () => {
    const result = desiredLayout([{childId:"ordinary",role:"developer",order:0},{childId:"lead",role:"teamlead",order:1}]);
    expect(result.slots.find(slot => slot.childId === "ordinary")).toMatchObject({tab:"origin"});
    expect(result.slots.find(slot => slot.childId === "lead")).toMatchObject({tab:"team:lead",anchor:true,row:1});
  });

  it.each([0,1])("keeps a lead and %i descendants in the origin row", count => {
    expect(desiredLayout(team(count)).dedicatedTeams).toEqual([]);
    expect(desiredLayout(team(count)).slots.every(slot => slot.tab === "origin" && slot.row === 0)).toBe(true);
  });

  it("gives a growing team a bottom anchor and readable descendant overflow", () => {
    const result = desiredLayout(team(5));
    expect(result.dedicatedTeams).toEqual(["lead"]);
    expect(result.slots.map(slot => [slot.tab,slot.row,slot.column,slot.anchor])).toEqual([
      ["team:lead",1,0,true], ["team:lead",0,0,false], ["team:lead",0,1,false],
      ["team:lead:overflow:1",0,0,false], ["team:lead:overflow:1",0,1,false], ["team:lead:overflow:2",0,0,false],
    ]);
  });

  it("leaves origin capacity available when an older team needs a dedicated tab", () => {
    const result = desiredLayout([...team(2),{childId:"ordinary",role:"developer",order:3}]);
    expect(result.slots.find(slot => slot.childId === "ordinary")).toMatchObject({tab:"origin",column:0});
    expect(result.dedicatedTeams).toEqual(["lead"]);
  });

  it("keeps the leader unsplit when the window is too short for an anchor and row", () => {
    expect(desiredLayout(team(2),layoutCapacity(112,20)).slots.map(slot => slot.tab)).toEqual(["team:lead","team:lead:overflow:1","team:lead:overflow:1"]);
  });

  it("gives a nested Team Lead its own group", () => {
    const result = desiredLayout([...team(1),{childId:"inner",parentId:"lead",role:"teamlead",order:2},
      {childId:"inner-worker",parentId:"inner",role:"developer",order:3}]);
    expect(result.slots.find(slot => slot.childId === "d0")?.groupId).toBe("lead");
    expect(result.slots.find(slot => slot.childId === "inner-worker")?.groupId).toBe("inner");
  });

  it("returns a shrunken clean team to the origin row", () => {
    expect(desiredLayout(team(2)).dedicatedTeams).toEqual(["lead"]);
    expect(desiredLayout(team(1)).dedicatedTeams).toEqual([]);
  });
});
