/**
 * Integration tests for todo extension execute function.
 * Uses a temp directory for file I/O — no heavy mocking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockPi, createMockCtx, createMockTheme } from "./helpers/mock-pi.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("todo extension", () => {
  let mockPi: ReturnType<typeof createMockPi>;
  let tool: any;
  let tmpDir: string;
  let ctx: any;

  beforeEach(async () => {
    mockPi = createMockPi();
    const mod = await import("../extensions/todo.ts");
    mod.default(mockPi as any);
    tool = mockPi._getTool("todo");

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-todo-test-"));
    ctx = createMockCtx({ cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should register todo tool", () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe("todo");
  });

  describe("add", () => {
    it("should add a task and persist to file", async () => {
      const result = await tool.execute("id", { action: "add", title: "Build feature" }, undefined, undefined, ctx);

      expect(result.content[0].text).toContain("Added");
      expect(result.content[0].text).toContain("Build feature");
      expect(result.details.id).toBeDefined();

      // Verify file exists
      const filePath = path.join(tmpDir, ".pi", "todo.json");
      expect(fs.existsSync(filePath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("Build feature");
    });

    it("should error without title", async () => {
      const result = await tool.execute("id", { action: "add" }, undefined, undefined, ctx);
      expect(result.isError).toBe(true);
    });

    it("should add with dependencies", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "First" }, undefined, undefined, ctx);
      const id1 = r1.details.id;

      const r2 = await tool.execute("id", { action: "add", title: "Second", depends_on: [id1] }, undefined, undefined, ctx);
      expect(r2.content[0].text).toContain("Second");
      expect(r2.content[0].text).toContain(id1);
    });

    it("should reject invalid dependency ID", async () => {
      const result = await tool.execute("id", { action: "add", title: "Bad", depends_on: ["fake"] }, undefined, undefined, ctx);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should add with notes", async () => {
      const result = await tool.execute("id", { action: "add", title: "Task", notes: "context here" }, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("context here");
    });
  });

  describe("update", () => {
    it("should update status", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "Task" }, undefined, undefined, ctx);
      const id = r1.details.id;

      const r2 = await tool.execute("id", { action: "update", id, status: "in_progress" }, undefined, undefined, ctx);
      expect(r2.content[0].text).toContain("in_progress");
    });

    it("should update title", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "Old" }, undefined, undefined, ctx);
      const id = r1.details.id;

      const r2 = await tool.execute("id", { action: "update", id, title: "New" }, undefined, undefined, ctx);
      expect(r2.content[0].text).toContain("New");
    });

    it("should reject self-dependency", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "Task" }, undefined, undefined, ctx);
      const id = r1.details.id;

      const r2 = await tool.execute("id", { action: "update", id, depends_on: [id] }, undefined, undefined, ctx);
      expect(r2.isError).toBe(true);
      expect(r2.content[0].text).toContain("itself");
    });

    it("should reject circular dependency", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "A" }, undefined, undefined, ctx);
      const idA = r1.details.id;
      const r2 = await tool.execute("id", { action: "add", title: "B", depends_on: [idA] }, undefined, undefined, ctx);
      const idB = r2.details.id;

      // Try to make A depend on B (creates A→B→A cycle)
      const r3 = await tool.execute("id", { action: "update", id: idA, depends_on: [idB] }, undefined, undefined, ctx);
      expect(r3.isError).toBe(true);
      expect(r3.content[0].text).toContain("circular");
    });

    it("should error for unknown ID", async () => {
      const result = await tool.execute("id", { action: "update", id: "fake", status: "done" }, undefined, undefined, ctx);
      expect(result.isError).toBe(true);
    });

    it("should error without ID", async () => {
      const result = await tool.execute("id", { action: "update", status: "done" }, undefined, undefined, ctx);
      expect(result.isError).toBe(true);
    });
  });

  describe("remove", () => {
    it("should remove a task", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "Doomed" }, undefined, undefined, ctx);
      const id = r1.details.id;

      const r2 = await tool.execute("id", { action: "remove", id }, undefined, undefined, ctx);
      expect(r2.content[0].text).toContain("Removed");

      const r3 = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
      expect(r3.content[0].text).toContain("No todos");
    });

    it("should clean up dangling dependencies on remove", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "Dep" }, undefined, undefined, ctx);
      const depId = r1.details.id;
      await tool.execute("id", { action: "add", title: "Dependent", depends_on: [depId] }, undefined, undefined, ctx);

      await tool.execute("id", { action: "remove", id: depId }, undefined, undefined, ctx);

      // Remaining task should have no deps (cleaned up)
      const r3 = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
      expect(r3.content[0].text).not.toContain("deps:");
    });

    it("should error for unknown ID", async () => {
      const result = await tool.execute("id", { action: "remove", id: "fake" }, undefined, undefined, ctx);
      expect(result.isError).toBe(true);
    });
  });

  describe("list", () => {
    it("should return 'No todos.' for empty list", async () => {
      const result = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
      expect(result.content[0].text).toBe("No todos.");
    });

    it("should list all tasks grouped by status", async () => {
      await tool.execute("id", { action: "add", title: "Ready task" }, undefined, undefined, ctx);
      const r2 = await tool.execute("id", { action: "add", title: "Done task" }, undefined, undefined, ctx);
      await tool.execute("id", { action: "update", id: r2.details.id, status: "done" }, undefined, undefined, ctx);

      const result = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("Ready (1)");
      expect(result.content[0].text).toContain("Done (1)");
    });
  });

  describe("ready", () => {
    it("should find parallelizable tasks", async () => {
      await tool.execute("id", { action: "add", title: "Task A" }, undefined, undefined, ctx);
      await tool.execute("id", { action: "add", title: "Task B" }, undefined, undefined, ctx);

      const result = await tool.execute("id", { action: "ready" }, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("2 task(s) ready");
      expect(result.content[0].text).toContain("Task A");
      expect(result.content[0].text).toContain("Task B");
    });

    it("should report all complete", async () => {
      const r1 = await tool.execute("id", { action: "add", title: "Only" }, undefined, undefined, ctx);
      await tool.execute("id", { action: "update", id: r1.details.id, status: "done" }, undefined, undefined, ctx);

      const result = await tool.execute("id", { action: "ready" }, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("All tasks complete");
    });
  });

  describe("renderCall", () => {
    it("should show action and title", () => {
      const theme = createMockTheme();
      const result = tool.renderCall({ action: "add", title: "New task" }, theme, {});
      expect(result).toBeDefined();
      expect(theme.fg).toHaveBeenCalledWith("toolTitle", "add");
    });
  });
});
