/**
 * Tests for ask-user extension — uses light mocks for UI interaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPi, createMockCtx, createMockTheme } from "./helpers/mock-pi.js";

// Minimal mocks — no heavy child_process or os mocking needed
describe("ask-user extension", () => {
  let mockPi: ReturnType<typeof createMockPi>;

  beforeEach(async () => {
    mockPi = createMockPi();
    const mod = await import("../extensions/ask-user.ts");
    mod.default(mockPi as any);
  });

  it("should register ask_user tool", () => {
    const tool = mockPi._getTool("ask_user");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("ask_user");
    expect(tool!.label).toBe("Ask User");
  });

  describe("execute — text mode", () => {
    it("should call ctx.ui.input and return response", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.input = vi.fn(async () => "user answer");

      const result = await tool.execute("id", { question: "What color?", mode: "text" }, undefined, undefined, ctx);

      expect(ctx.ui.input).toHaveBeenCalledWith("What color?", undefined);
      expect(result.content[0].text).toBe("user answer");
      expect(result.details.dismissed).toBe(false);
    });

    it("should pass placeholder", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.input = vi.fn(async () => "answer");

      await tool.execute("id", { question: "Name?", mode: "text", placeholder: "Enter name" }, undefined, undefined, ctx);

      expect(ctx.ui.input).toHaveBeenCalledWith("Name?", "Enter name");
    });

    it("should default to text mode", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.input = vi.fn(async () => "default mode");

      const result = await tool.execute("id", { question: "Test?" }, undefined, undefined, ctx);
      expect(ctx.ui.input).toHaveBeenCalled();
      expect(result.content[0].text).toBe("default mode");
    });
  });

  describe("execute — select mode", () => {
    it("should call ctx.ui.select with options", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.select = vi.fn(async () => "option B");

      const result = await tool.execute(
        "id",
        { question: "Pick one:", mode: "select", options: ["option A", "option B", "option C"] },
        undefined, undefined, ctx
      );

      expect(ctx.ui.select).toHaveBeenCalledWith("Pick one:", ["option A", "option B", "option C"]);
      expect(result.content[0].text).toBe("option B");
    });

    it("should error when select mode has no options", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();

      const result = await tool.execute(
        "id",
        { question: "Pick:", mode: "select", options: [] },
        undefined, undefined, ctx
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires");
    });
  });

  describe("execute — confirm mode", () => {
    it("should call ctx.ui.confirm and return yes/no", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.confirm = vi.fn(async () => true);

      const result = await tool.execute(
        "id",
        { question: "Continue?", mode: "confirm" },
        undefined, undefined, ctx
      );

      expect(ctx.ui.confirm).toHaveBeenCalledWith("Question", "Continue?");
      expect(result.content[0].text).toBe("yes");
    });

    it("should return 'no' for false confirmation", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.confirm = vi.fn(async () => false);

      const result = await tool.execute(
        "id",
        { question: "Delete?", mode: "confirm" },
        undefined, undefined, ctx
      );
      expect(result.content[0].text).toBe("no");
    });
  });

  describe("execute — dismissal", () => {
    it("should handle user dismissing text prompt", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.input = vi.fn(async () => undefined);

      const result = await tool.execute("id", { question: "Name?" }, undefined, undefined, ctx);

      expect(result.content[0].text).toContain("dismissed");
      expect(result.details.dismissed).toBe(true);
    });

    it("should handle user dismissing select prompt", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx();
      ctx.ui.select = vi.fn(async () => undefined);

      const result = await tool.execute(
        "id",
        { question: "Pick:", mode: "select", options: ["a", "b"] },
        undefined, undefined, ctx
      );

      expect(result.details.dismissed).toBe(true);
    });
  });

  describe("execute — no UI", () => {
    it("should error when UI is not available", async () => {
      const tool = mockPi._getTool("ask_user")!;
      const ctx = createMockCtx({ hasUI: false });

      const result = await tool.execute("id", { question: "Test?" }, undefined, undefined, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("no UI");
    });
  });

  describe("renderCall", () => {
    it("should show question preview", () => {
      const tool = mockPi._getTool("ask_user")!;
      const theme = createMockTheme();
      const result = tool.renderCall({ question: "What color?", mode: "text" }, theme, {});
      expect(result).toBeDefined();
    });

    it("should show option count for select mode", () => {
      const tool = mockPi._getTool("ask_user")!;
      const theme = createMockTheme();
      tool.renderCall({ question: "Pick:", mode: "select", options: ["a", "b", "c"] }, theme, {});
      expect(theme.fg).toHaveBeenCalledWith("dim", expect.stringContaining("3 options"));
    });
  });
});
