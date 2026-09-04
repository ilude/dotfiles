/**
 * Pure function tests for pwsh extension — no mocking needed.
 */
import { describe, it, expect } from "vitest";
import {
  appendBoundedOutput,
  buildTruncationNotice,
  classifyOutputLine,
  isWindows11Check,
} from "../extensions/pwsh.ts";

describe("isWindows11Check", () => {
  it("returns true for Windows 11 (build 22621)", () => {
    expect(isWindows11Check("win32", "10.0.22621")).toBe(true);
  });

  it("returns true for exact boundary (build 22000)", () => {
    expect(isWindows11Check("win32", "10.0.22000")).toBe(true);
  });

  it("returns false for Windows 10 (build 19045)", () => {
    expect(isWindows11Check("win32", "10.0.19045")).toBe(false);
  });

  it("returns false for Linux", () => {
    expect(isWindows11Check("linux", "5.15.0-1")).toBe(false);
  });

  it("returns false for macOS", () => {
    expect(isWindows11Check("darwin", "23.1.0")).toBe(false);
  });

  it("handles missing build number gracefully", () => {
    expect(isWindows11Check("win32", "10.0")).toBe(false);
  });

  it("handles empty string", () => {
    expect(isWindows11Check("win32", "")).toBe(false);
  });
});

describe("classifyOutputLine", () => {
  it("classifies VERBOSE: lines", () => {
    expect(classifyOutputLine("VERBOSE: Loading module")).toBe("verbose");
  });

  it("classifies DEBUG: lines", () => {
    expect(classifyOutputLine("DEBUG: Variable $x = 5")).toBe("debug");
  });

  it("classifies WARNING: lines", () => {
    expect(classifyOutputLine("WARNING: Deprecated cmdlet")).toBe("warning");
  });

  it("classifies ERROR: lines", () => {
    expect(classifyOutputLine("ERROR: File not found")).toBe("error");
  });

  it("classifies normal lines", () => {
    expect(classifyOutputLine("Hello World")).toBe("normal");
    expect(classifyOutputLine("")).toBe("normal");
  });

  it("matches substring (not just prefix)", () => {
    expect(classifyOutputLine("  WARNING: indented")).toBe("warning");
    expect(classifyOutputLine("PS C:\\> ERROR: bad")).toBe("error");
  });
});

describe("appendBoundedOutput", () => {
  it("keeps only a bounded tail while output is streaming", () => {
    const first = appendBoundedOutput("", `${"a".repeat(40_000)}\n`);
    const second = appendBoundedOutput(first.output, `${"b".repeat(40_000)}\n`);
    const third = appendBoundedOutput(second.output, `${"c".repeat(40_000)}\n`);

    expect(second.truncated).toBe(true);
    expect(third.truncated).toBe(true);
    expect(Buffer.byteLength(third.output, "utf8")).toBeLessThanOrEqual(50 * 1024);
    expect(third.output).not.toContain("a".repeat(1_000));
    expect(third.output).toContain("c".repeat(1_000));
  });
});

describe("buildTruncationNotice", () => {
  it("includes line counts and file path", () => {
    const notice = buildTruncationNotice(
      { outputLines: 2000, totalLines: 5000, outputBytes: 51200, totalBytes: 150000 },
      "/tmp/pi-pwsh-abc.txt"
    );
    expect(notice).toContain("Showing lines 3001-5000 of 5000");
    expect(notice).toContain("50.0KB limit");
    expect(notice).toContain("Full output: /tmp/pi-pwsh-abc.txt");
  });

});
