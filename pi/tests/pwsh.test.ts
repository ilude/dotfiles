/**
 * Tests for the pwsh extension (~/.pi/agent/extensions/pwsh.ts)
 *
 * Focuses on renderCall/renderResult logic — the pure functions
 * that don't require heavy mocking of spawn, os, or platform.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPi, createMockTheme } from "./helpers/mock-pi.js";

// Mock os.release to return Windows 11 build so tool registers
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, release: () => "10.0.22621" };
});

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const { EventEmitter } = require("node:events");
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.pid = 1;
    return p;
  }),
}));

vi.mock("node:fs/promises", () => ({ rm: vi.fn(async () => {}) }));

const originalPlatform = process.platform;

async function getRegisteredTool() {
  Object.defineProperty(process, "platform", { value: "win32", writable: true, configurable: true });
  const mockPi = createMockPi();
  mockPi.exec.mockResolvedValue({ code: 0, stdout: "PowerShell 7.4.1", stderr: "" });
  const mod = await import("../extensions/pwsh.ts");
  mod.default(mockPi as any);
  Object.defineProperty(process, "platform", { value: originalPlatform, writable: true, configurable: true });
  return mockPi._getTool("pwsh")!;
}

describe("pwsh extension", () => {
  let tool: any;
  let theme: ReturnType<typeof createMockTheme>;

  beforeEach(async () => {
    tool = await getRegisteredTool();
    theme = createMockTheme();
  });

  describe("tool metadata", () => {
    it("keeps provider-visible metadata compact", () => {
      expect(
        JSON.stringify({
          description: tool.description,
          parameters: tool.parameters,
          promptGuidelines: tool.promptGuidelines,
        }).length,
      ).toBeLessThan(850);
    });

    it("registers PowerShell as active without spawning a version probe", async () => {
      Object.defineProperty(process, "platform", { value: "win32", writable: true, configurable: true });
      try {
        const mockPi = createMockPi();
        const mod = await import("../extensions/pwsh.ts");
        mod.default(mockPi as any);
        expect(mockPi.getActiveTools()).toContain("pwsh");
        expect(mockPi.exec).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, writable: true, configurable: true });
      }
    });
  });

  describe("renderCall", () => {
    const renderContext = (state: Record<string, unknown> = {}, executionStarted = false) => ({
      executionStarted,
      state,
    });

    it("should show timeout when specified", () => {
      tool.renderCall({ command: "test", timeout: 30 }, theme, renderContext());
      expect(theme.fg).toHaveBeenCalledWith("dim", expect.stringContaining("30s"));
    });

    it("should show the effective default timeout when unspecified", () => {
      tool.renderCall({ command: "test" }, theme, renderContext());
      expect(theme.fg).toHaveBeenCalledWith("dim", expect.stringContaining("timeout 120s"));
    });

  });

  describe("normalizeTerminalOutput", () => {
    it("collapses carriage-return spinner frames to the final line", async () => {
      const { normalizeTerminalOutput } = await import("../extensions/pwsh.ts");

      expect(normalizeTerminalOutput("-\r\\\r|\rFound uv\nDone")).toBe("Found uv\nDone");
    });

    it("preserves PowerShell CRLF line endings", async () => {
      const { normalizeTerminalOutput } = await import("../extensions/pwsh.ts");

      expect(normalizeTerminalOutput("hello\r\nworld\r\n")).toBe("hello\nworld");
    });

    it("strips ANSI escape sequences", async () => {
      const { normalizeTerminalOutput } = await import("../extensions/pwsh.ts");

      expect(normalizeTerminalOutput("\u001b[32mName\u001b[0m\nuv")).toBe("Name\nuv");
    });
  });

  describe("renderResult", () => {
    const makeResult = (text: string, details = {}) => ({
      content: [{ type: "text", text }],
      details: { elapsed: "0.1", ...details },
    });

    it("should show truncation notice when truncated", () => {
      tool.renderResult(
        makeResult("output", { truncated: true, full_output_path: "/tmp/out.txt" }),
        { expanded: true, isPartial: false }, theme, {}
      );
      expect(theme.fg).toHaveBeenCalledWith("dim", expect.stringContaining("truncated"));
    });

    it("should not show truncation notice when not truncated", () => {
      tool.renderResult(makeResult("output"), { expanded: true, isPartial: false }, theme, {});
      const dimCalls = theme.fg.mock.calls.filter((c: any) => c[0] === "dim").map((c: any) => c[1]);
      expect(dimCalls.some((t: string) => t.includes("truncated"))).toBe(false);
    });

    it("should normalize carriage-return progress before rendering", () => {
      const result = tool.renderResult(makeResult("-\r\\\r|\rFound uv\nDone"), { expanded: true, isPartial: false }, theme, {});

      expect(String(result)).not.toContain("-\n\\\n|");
    });
  });
});
