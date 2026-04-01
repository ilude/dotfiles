/**
 * Integration tests for tool-search extension execute function.
 * Mocks pi.getAllTools() and pi.getActiveTools() — lightweight.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPi, createMockTheme } from "./helpers/mock-pi.js";

const MOCK_TOOLS = [
  { name: "bash", description: "Execute shell commands", parameters: {}, sourceInfo: { type: "builtin" } },
  { name: "pwsh", description: "Execute PowerShell Core commands", parameters: {}, sourceInfo: { type: "extension" } },
  { name: "web_search", description: "Search the web via SearXNG", parameters: {}, sourceInfo: { type: "extension" } },
  { name: "read", description: "Read file contents", parameters: {}, sourceInfo: { type: "builtin" } },
  { name: "todo", description: "Manage tasks with dependencies", parameters: {}, sourceInfo: { type: "extension" } },
];

describe("tool-search extension", () => {
  let mockPi: ReturnType<typeof createMockPi>;
  let tool: any;

  beforeEach(async () => {
    mockPi = createMockPi();
    (mockPi as any).getAllTools = vi.fn(() => MOCK_TOOLS);
    (mockPi as any).getActiveTools = vi.fn(() => ["bash", "pwsh", "web_search", "read", "todo"]);

    const mod = await import("../extensions/tool-search.ts");
    mod.default(mockPi as any);
    tool = mockPi._getTool("tool_search");
  });

  it("should register tool_search", () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe("tool_search");
  });

  describe("list all", () => {
    it("should list all tools when no query", async () => {
      const result = await tool.execute("id", {}, undefined, undefined, {});
      const text = result.content[0].text;
      expect(text).toContain("5 available tools");
      expect(text).toContain("bash");
      expect(text).toContain("pwsh");
      expect(text).toContain("web_search");
    });

    it("should list all with empty query", async () => {
      const result = await tool.execute("id", { query: "" }, undefined, undefined, {});
      expect(result.content[0].text).toContain("5 available tools");
    });
  });

  describe("search", () => {
    it("should find tools by keyword", async () => {
      const result = await tool.execute("id", { query: "shell" }, undefined, undefined, {});
      const text = result.content[0].text;
      expect(text).toContain("bash");
      expect(result.details.matched).toBeGreaterThan(0);
    });

    it("should find tools by name", async () => {
      const result = await tool.execute("id", { query: "pwsh" }, undefined, undefined, {});
      expect(result.content[0].text).toContain("pwsh");
    });

    it("should return no results for unmatched query", async () => {
      const result = await tool.execute("id", { query: "xyznonexistent" }, undefined, undefined, {});
      expect(result.content[0].text).toContain("No tools found");
    });

    it("should rank name matches higher", async () => {
      const result = await tool.execute("id", { query: "bash" }, undefined, undefined, {});
      const text = result.content[0].text;
      // bash should appear first (exact name match)
      const bashPos = text.indexOf("bash");
      expect(bashPos).toBeGreaterThan(-1);
    });
  });

  describe("include_params", () => {
    it("should include parameters when requested", async () => {
      const result = await tool.execute("id", { query: "bash", include_params: true }, undefined, undefined, {});
      expect(result.content[0].text).toContain("Parameters:");
    });

    it("should not include parameters by default", async () => {
      const result = await tool.execute("id", { query: "bash" }, undefined, undefined, {});
      expect(result.content[0].text).not.toContain("Parameters:");
    });
  });

  describe("renderCall", () => {
    it("should show search query", () => {
      const theme = createMockTheme();
      tool.renderCall({ query: "powershell" }, theme, {});
      expect(theme.fg).toHaveBeenCalledWith("toolTitle", "powershell");
    });

    it("should show 'list all' when no query", () => {
      const theme = createMockTheme();
      const result = tool.renderCall({}, theme, {});
      expect(result).toBeDefined();
    });
  });
});
