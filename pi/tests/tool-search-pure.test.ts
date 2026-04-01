/**
 * Pure function tests for tool-search extension.
 */
import { describe, it, expect } from "vitest";
import { scoreTool, formatToolEntry } from "../extensions/tool-search.ts";

describe("scoreTool", () => {
  it("scores exact name match highest", () => {
    const tool = { name: "bash", description: "Execute commands" };
    expect(scoreTool(tool, ["bash"])).toBe(10); // exact name match only, 'bash' not in description
  });

  it("scores name-contains higher than description-only", () => {
    const nameMatch = { name: "web_search", description: "Other" };
    const descMatch = { name: "other", description: "Search the web" };
    expect(scoreTool(nameMatch, ["search"])).toBeGreaterThan(scoreTool(descMatch, ["search"]));
  });

  it("scores description match", () => {
    const tool = { name: "xyz", description: "Execute PowerShell commands" };
    expect(scoreTool(tool, ["powershell"])).toBe(2);
  });

  it("accumulates scores across multiple terms", () => {
    const tool = { name: "web_fetch", description: "Fetch URL content as markdown" };
    const multi = scoreTool(tool, ["web", "fetch"]);
    const single = scoreTool(tool, ["web"]);
    expect(multi).toBeGreaterThan(single);
  });

  it("returns 0 for no matches", () => {
    const tool = { name: "bash", description: "Execute shell commands" };
    expect(scoreTool(tool, ["python"])).toBe(0);
  });

  it("is case insensitive", () => {
    const tool = { name: "PowerShell", description: "Execute PS commands" };
    expect(scoreTool(tool, ["powershell"])).toBeGreaterThan(0);
  });
});

describe("formatToolEntry", () => {
  it("includes index, name, and description", () => {
    const text = formatToolEntry({ name: "bash", description: "Execute commands" }, 1);
    expect(text).toContain("1. bash");
    expect(text).toContain("Execute commands");
  });

  it("includes source when provided", () => {
    const text = formatToolEntry({ name: "pwsh", description: "PowerShell", source: "extension" }, 2);
    expect(text).toContain("[source: extension]");
  });

  it("truncates long descriptions", () => {
    const long = "A".repeat(200);
    const text = formatToolEntry({ name: "test", description: long }, 1);
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(250);
  });

  it("does not truncate short descriptions", () => {
    const text = formatToolEntry({ name: "test", description: "Short" }, 1);
    expect(text).not.toContain("…");
  });
});
