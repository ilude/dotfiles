/**
 * Pure function tests for todo extension.
 */
import { describe, it, expect } from "vitest";
import {
  resolveStatus,
  findReady,
  detectCycle,
  formatTodo,
  formatTodoList,
  type TodoItem,
} from "../extensions/todo.ts";

function makeTodo(overrides: Partial<TodoItem> & { id: string; title: string }): TodoItem {
  return {
    status: "pending",
    depends_on: [],
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveStatus", () => {
  it("returns done for done items", () => {
    const item = makeTodo({ id: "a", title: "A", status: "done" });
    expect(resolveStatus(item, [item])).toBe("done");
  });

  it("returns status as-is when no dependencies", () => {
    const item = makeTodo({ id: "a", title: "A", status: "in_progress" });
    expect(resolveStatus(item, [item])).toBe("in_progress");
  });

  it("returns blocked when dependency is not done", () => {
    const dep = makeTodo({ id: "a", title: "A", status: "in_progress" });
    const item = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
    expect(resolveStatus(item, [dep, item])).toBe("blocked");
  });

  it("returns pending when all dependencies are done", () => {
    const dep = makeTodo({ id: "a", title: "A", status: "done" });
    const item = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
    expect(resolveStatus(item, [dep, item])).toBe("pending");
  });

  it("returns pending for a blocked item whose deps are now done", () => {
    const dep = makeTodo({ id: "a", title: "A", status: "done" });
    const item = makeTodo({ id: "b", title: "B", status: "blocked", depends_on: ["a"] });
    expect(resolveStatus(item, [dep, item])).toBe("pending");
  });

  it("handles missing dependency gracefully (treats as met)", () => {
    const item = makeTodo({ id: "a", title: "A", depends_on: ["nonexistent"] });
    expect(resolveStatus(item, [item])).toBe("pending");
  });

  it("blocks if any single dependency is unmet", () => {
    const done = makeTodo({ id: "a", title: "A", status: "done" });
    const notDone = makeTodo({ id: "b", title: "B", status: "pending" });
    const item = makeTodo({ id: "c", title: "C", depends_on: ["a", "b"] });
    expect(resolveStatus(item, [done, notDone, item])).toBe("blocked");
  });
});

describe("findReady", () => {
  it("returns pending items with no deps", () => {
    const items = [
      makeTodo({ id: "a", title: "A" }),
      makeTodo({ id: "b", title: "B" }),
    ];
    expect(findReady(items).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("excludes done items", () => {
    const items = [
      makeTodo({ id: "a", title: "A", status: "done" }),
      makeTodo({ id: "b", title: "B" }),
    ];
    expect(findReady(items).map((i) => i.id)).toEqual(["b"]);
  });

  it("excludes blocked items", () => {
    const dep = makeTodo({ id: "a", title: "A", status: "in_progress" });
    const blocked = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
    expect(findReady([dep, blocked]).map((i) => i.id)).toEqual(["a"]);
  });

  it("includes in_progress items", () => {
    const items = [makeTodo({ id: "a", title: "A", status: "in_progress" })];
    expect(findReady(items).map((i) => i.id)).toEqual(["a"]);
  });

  it("unblocks when dependencies complete", () => {
    const dep = makeTodo({ id: "a", title: "A", status: "done" });
    const waiting = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
    expect(findReady([dep, waiting]).map((i) => i.id)).toEqual(["b"]);
  });

  it("returns empty for all-done list", () => {
    const items = [makeTodo({ id: "a", title: "A", status: "done" })];
    expect(findReady(items)).toEqual([]);
  });
});

describe("detectCycle", () => {
  it("returns null when no path back exists", () => {
    const a = makeTodo({ id: "a", title: "A" });
    const b = makeTodo({ id: "b", title: "B" });
    expect(detectCycle([a, b], "a", "b")).toBeNull();
  });

  it("detects cycle when target already depends on source", () => {
    const a = makeTodo({ id: "a", title: "A" });
    const b = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
    // Adding a dep from A to B would create A→B→A
    expect(detectCycle([a, b], "a", "b")).not.toBeNull();
  });

  it("detects direct cycle (A→B, adding B→A)", () => {
    const a = makeTodo({ id: "a", title: "A", depends_on: ["b"] });
    const b = makeTodo({ id: "b", title: "B" });
    const cycle = detectCycle([a, b], "b", "a");
    expect(cycle).not.toBeNull();
  });

  it("detects transitive cycle (A→B→C, adding C→A)", () => {
    const a = makeTodo({ id: "a", title: "A" });
    const b = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
    const c = makeTodo({ id: "c", title: "C", depends_on: ["b"] });
    const cycle = detectCycle([a, b, c], "a", "c");
    expect(cycle).not.toBeNull();
  });

  it("returns null when no path exists", () => {
    const a = makeTodo({ id: "a", title: "A" });
    const b = makeTodo({ id: "b", title: "B" });
    const c = makeTodo({ id: "c", title: "C" });
    expect(detectCycle([a, b, c], "a", "b")).toBeNull();
  });
});

describe("formatTodo", () => {
  it("shows ✓ for done items", () => {
    const item = makeTodo({ id: "t1", title: "Done task", status: "done" });
    expect(formatTodo(item, [item])).toContain("✓");
  });

  it("shows ▶ for in_progress items", () => {
    const item = makeTodo({ id: "t1", title: "Active task", status: "in_progress" });
    expect(formatTodo(item, [item])).toContain("▶");
  });

  it("shows ⊘ for blocked items", () => {
    const dep = makeTodo({ id: "a", title: "A", status: "pending" });
    const item = makeTodo({ id: "b", title: "Blocked", depends_on: ["a"] });
    expect(formatTodo(item, [dep, item])).toContain("⊘");
  });

  it("shows ○ for pending items", () => {
    const item = makeTodo({ id: "t1", title: "Pending", status: "pending" });
    expect(formatTodo(item, [item])).toContain("○");
  });

  it("includes dependency IDs", () => {
    const item = makeTodo({ id: "t1", title: "Task", depends_on: ["a", "b"] });
    const text = formatTodo(item, [item]);
    expect(text).toContain("[deps: a, b]");
  });

  it("includes notes", () => {
    const item = makeTodo({ id: "t1", title: "Task", notes: "some context" });
    expect(formatTodo(item, [item])).toContain("some context");
  });
});

describe("formatTodoList", () => {
  it("returns 'No todos.' for empty list", () => {
    expect(formatTodoList([])).toBe("No todos.");
  });

  it("groups into Ready/Blocked/Done sections", () => {
    const items = [
      makeTodo({ id: "a", title: "Ready" }),
      makeTodo({ id: "b", title: "Blocked", depends_on: ["a"] }),
      makeTodo({ id: "c", title: "Done", status: "done" }),
    ];
    const text = formatTodoList(items);
    expect(text).toContain("Ready (1)");
    expect(text).toContain("Blocked (1)");
    expect(text).toContain("Done (1)");
  });

  it("includes summary line", () => {
    const items = [
      makeTodo({ id: "a", title: "A", status: "done" }),
      makeTodo({ id: "b", title: "B" }),
    ];
    const text = formatTodoList(items);
    expect(text).toContain("1/2 done");
    expect(text).toContain("1 ready");
    expect(text).toContain("0 blocked");
  });
});
