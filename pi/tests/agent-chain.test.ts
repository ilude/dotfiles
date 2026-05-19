/**
 * Integration tests for the agent-chain command and session-log tool.
 *
 * Expertise tools are intentionally no longer registered; durable instruction
 * files and skills are the supported context surfaces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMockPi, GIT_REMOTE_FIXTURES, WINDOWS_NORMALIZATION_FIXTURES } from "./helpers/mock-pi.js";

describe("agent-chain extension", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let mockPi: ReturnType<typeof createMockPi>;
  let logTool: any;

  const pathsFor = (agent: string) => {
    const expertiseDir = path.join(tmpHome, ".pi", "agent", "multi-team", "expertise");
    return {
      logPath: path.join(expertiseDir, `${agent}-expertise-log.jsonl`),
    };
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-chain-test-"));
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    mockPi = createMockPi();
    const mod = await import("../extensions/agent-chain.ts");
    mod.default(mockPi as any);

    logTool = mockPi._getTool("log_exchange");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("does not register expertise tools", () => {
    expect(mockPi._getTool("append_expertise")).toBeUndefined();
    expect(mockPi._getTool("read_expertise")).toBeUndefined();
    expect(logTool).toBeDefined();
    expect(mockPi._commands.find((c) => c.name === "chain")).toBeDefined();
  });

  describe("layered expertise -- fixture coverage from shared remote table", () => {
    it("GIT_REMOTE_FIXTURES covers all required remote format categories", () => {
      const labels = GIT_REMOTE_FIXTURES.map((f) => f.label);
      const hasHttpsGitHub = labels.some((l) => l.includes("GitHub HTTPS"));
      const hasHttpsGitLab = labels.some((l) => l.includes("GitLab HTTPS"));
      const hasScp = labels.some((l) => l.toLowerCase().includes("scp"));
      const hasSsh = labels.some((l) => l.toLowerCase().includes("ssh"));
      const hasNestedGroup = labels.some((l) => l.includes("nested"));
      const hasMultipleRemotes = labels.some((l) => l.includes("multiple remotes"));

      expect(hasHttpsGitHub, "fixture table missing GitHub HTTPS cases").toBe(true);
      expect(hasHttpsGitLab, "fixture table missing GitLab HTTPS cases").toBe(true);
      expect(hasScp, "fixture table missing SCP-style cases").toBe(true);
      expect(hasSsh, "fixture table missing SSH cases").toBe(true);
      expect(hasNestedGroup, "fixture table missing nested GitLab group cases").toBe(true);
      expect(hasMultipleRemotes, "fixture table missing multiple-remote selection cases").toBe(true);
    });

    it("WINDOWS_NORMALIZATION_FIXTURES covers all required reserved-name variants", () => {
      const labels = WINDOWS_NORMALIZATION_FIXTURES.map((f) => f.label);
      const hasReservedNames = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"].every((name) =>
        labels.some((l) => l.includes(name)),
      );
      const hasTrailingDot = labels.some((l) => l.includes("trailing dot"));
      const hasCaseFolding = labels.some((l) => l.includes("case"));

      expect(hasReservedNames, "fixture table missing reserved name variants").toBe(true);
      expect(hasTrailingDot, "fixture table missing trailing dot case").toBe(true);
      expect(hasCaseFolding, "fixture table missing case-folding case").toBe(true);
    });
  });

});
