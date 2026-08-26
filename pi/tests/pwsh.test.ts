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

vi.mock("node:fs/promises", () => ({ writeFile: vi.fn(async () => {}) }));

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

    it("should render single-line command", () => {
      const result = tool.renderCall({ command: "Get-Date" }, theme, renderContext());
      expect(result).toBeDefined();
    });

    it("should show timeout when specified", () => {
      tool.renderCall({ command: "test", timeout: 30 }, theme, renderContext());
      expect(theme.fg).toHaveBeenCalledWith("dim", expect.stringContaining("30s"));
    });

    it("should show the effective default timeout when unspecified", () => {
      tool.renderCall({ command: "test" }, theme, renderContext());
      expect(theme.fg).toHaveBeenCalledWith("dim", expect.stringContaining("timeout 120s"));
    });

    it("should render the local start time and timeout deadline", () => {
      const startedAt = new Date(2026, 7, 19, 11, 29, 30).getTime();
      tool.renderCall(
        { command: "test", timeout: 90 },
        theme,
        renderContext({ transcriptStartedAt: startedAt }, true),
      );

      expect(theme.fg).toHaveBeenCalledWith(
        "dim",
        expect.stringContaining(
          "started 11:29:30 local, timeout 90s at 11:31:00 local",
        ),
      );
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

    it("should render running and settled transcript timing", () => {
      const startedAt = new Date(2026, 7, 19, 11, 29, 30).getTime();
      const result = tool.renderResult(
        makeResult("output", { elapsed: "2.0" }),
        { expanded: true, isPartial: false },
        theme,
        { state: { transcriptStartedAt: startedAt } },
      );
      expect(result.render(300).join("\\n")).toContain("started 11:29:30 local | duration 2s");
      const partial = tool.renderResult(
        makeResult("partial", { elapsed: "2.0" }),
        { expanded: true, isPartial: true },
        theme,
        { state: { transcriptStartedAt: startedAt } },
      );
      expect(partial.render(300).join("\\n")).toContain("started 11:29:30 local");
      expect(partial.render(300).join("\\n")).not.toContain("2.0s");
      expect(partial.render(300).join("\\n")).not.toContain("duration");
    });

    it("should color WARNING lines", () => {
      tool.renderResult(makeResult("WARNING: low disk"), { expanded: true, isPartial: false }, theme, {});
      expect(theme.fg).toHaveBeenCalledWith("warning", expect.stringContaining("WARNING"));
    });

    it("should color ERROR lines", () => {
      tool.renderResult(makeResult("ERROR: failed"), { expanded: true, isPartial: false }, theme, {});
      expect(theme.fg).toHaveBeenCalledWith("error", expect.stringContaining("ERROR"));
    });

    it("should dim VERBOSE and DEBUG lines", () => {
      tool.renderResult(makeResult("VERBOSE: info\nDEBUG: trace"), { expanded: true, isPartial: false }, theme, {});
      const dimTexts = theme.fg.mock.calls.filter((c: any) => c[0] === "dim").map((c: any) => c[1]);
      expect(dimTexts.some((t: string) => t.includes("VERBOSE"))).toBe(true);
      expect(dimTexts.some((t: string) => t.includes("DEBUG"))).toBe(true);
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

    it("should handle empty output", () => {
      const result = tool.renderResult(makeResult(""), { expanded: false, isPartial: false }, theme, {});
      expect(result).toBeDefined();
    });
  });
});
