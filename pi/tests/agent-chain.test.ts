/**
 * Integration tests for agent-chain expertise tools.
 *
 * The legacy mental-model snapshot loader/regenerator has been retired; these
 * tests now exercise the JSONL-as-truth read path. Snapshot/similarity test
 * coverage was removed together with the underlying machinery; remaining tests
 * focus on append/log behavior, the category-grouped raw read view, and
 * layered (project-local + global) coexistence.
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
  let appendTool: any;
  let readTool: any;
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

    appendTool = mockPi._getTool("append_expertise");
    readTool = mockPi._getTool("read_expertise");
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

  it("registers expertise and session-log tools", () => {
    expect(appendTool).toBeDefined();
    expect(readTool).toBeDefined();
    expect(logTool).toBeDefined();
    expect(mockPi._commands.find((c) => c.name === "chain")).toBeDefined();
  });

  it("append_expertise writes a raw JSONL record without a sidecar state file", async () => {
    const result = await appendTool.execute(
      "id",
      {
        agent: "backend-dev",
        category: "observation",
        entry: { project: "dotfiles", note: "JSONL is the source of truth" },
        session_id: "test-session",
      },
      undefined,
      undefined,
      {},
    );

    const { logPath } = pathsFor("backend-dev");
    expect(result.content[0].text).toContain("Appended observation entry");
    expect(fs.existsSync(logPath)).toBe(true);

    // No mental-model.state.json sidecar should exist anywhere under the
    // expertise dir; the snapshot machinery has been retired.
    const statePath = path.join(path.dirname(logPath), "backend-dev-mental-model.state.json");
    expect(fs.existsSync(statePath)).toBe(false);

    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]);
    expect(record.session_id).toBe("test-session");
    expect(record.category).toBe("observation");
    expect(record.entry.note).toBe("JSONL is the source of truth");
  });

  it("read_expertise reports first session when no expertise exists", async () => {
    const result = await readTool.execute("id", { agent: "frontend-dev" }, undefined, undefined, {});

    expect(result.content[0].text).toContain("No expertise recorded yet for frontend-dev");
    expect(result.details.entryCount).toBe(0);
  });

  it("renders category-grouped output and dedupes repeated observations", async () => {
    const append = (agent: string, category: string, entry: Record<string, unknown>, sid: string) =>
      appendTool.execute("id", { agent, category, entry, session_id: sid }, undefined, undefined, {});

    await append("orchestrator", "observation", { project: "dotfiles", note: "same noisy fact" }, "s1");
    await append("orchestrator", "observation", { project: "dotfiles", note: "same noisy fact" }, "s2");
    await append("orchestrator", "strong_decision", { decision: "keep npm on Windows", why_good: "latest Pi" }, "s3");
    await append("orchestrator", "key_file", { path: "pi/extensions/agent-chain.ts", role: "expertise tools" }, "s4");

    const result = await readTool.execute("id", { agent: "orchestrator", mode: "full" }, undefined, undefined, {});

    expect(result.content[0].text).toContain("dotfiles: same noisy fact");
    expect(result.content[0].text).not.toContain("evidence:");
    expect(result.content[0].text).toContain("keep npm on Windows");
    expect(result.content[0].text).toContain("pi/extensions/agent-chain.ts -- expertise tools");

    // Dedupe: only one occurrence of the repeated observation
    const occurrences = (result.content[0].text.match(/dotfiles: same noisy fact/g) ?? []).length;
    expect(occurrences).toBe(1);
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

  describe("layered expertise -- legacy global + project-local coexistence", () => {
    // Helper: write a raw JSONL log directly to the global expertise dir
    const writeLegacyEntry = (agent: string, entry: Record<string, unknown>, sessionId: string) => {
      const expertiseDir = path.join(tmpHome, ".pi", "agent", "multi-team", "expertise");
      fs.mkdirSync(expertiseDir, { recursive: true });
      const logFile = path.join(expertiseDir, `${agent}-expertise-log.jsonl`);
      const record = JSON.stringify({ timestamp: new Date().toISOString(), session_id: sessionId, category: "strong_decision", entry });
      fs.appendFileSync(logFile, record + "\n", "utf-8");
    };

    // Helper: write project-local entry for a given repoId
    const writeProjectLocalEntry = (repoId: string, agent: string, entry: Record<string, unknown>, sessionId: string) => {
      const projectDir = path.join(tmpHome, ".pi", "agent", "multi-team", "expertise", repoId);
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, `${agent}-expertise-log.jsonl`);
      const record = JSON.stringify({ timestamp: new Date().toISOString(), session_id: sessionId, category: "observation", entry });
      fs.appendFileSync(logFile, record + "\n", "utf-8");
    };

    it("mixed state: read_expertise returns entries from both global and project-local layers", async () => {
      const repoId = "gh/testorg/testrepo";

      writeLegacyEntry(
        "layered-agent",
        { decision: "legacy global cross-project decision", why_good: "applies everywhere" },
        "g1",
      );
      writeProjectLocalEntry(
        repoId,
        "layered-agent",
        { project: "testrepo", note: "project-specific observation" },
        "p1",
      );

      const result = await readTool.execute(
        "id",
        { agent: "layered-agent", mode: "full" },
        undefined,
        undefined,
        { cwd: path.join(tmpHome, "testrepo"), repoId },
      );

      const text: string = result.content[0].text;
      expect(text, "Expected legacy global decision in layered read").toContain("legacy global cross-project decision");
      expect(text, "Expected project-local observation in layered read").toContain("project-specific observation");
    });

    it("read order: project-local entries are surfaced before global entries", async () => {
      const repoId = "gh/testorg/testrepo";

      writeLegacyEntry(
        "order-agent",
        { decision: "global decision comes second", why_good: "cross-project" },
        "g1",
      );
      writeProjectLocalEntry(
        repoId,
        "order-agent",
        { project: "testrepo", note: "project fact comes first" },
        "p1",
      );

      const result = await readTool.execute(
        "id",
        { agent: "order-agent", mode: "full" },
        undefined,
        undefined,
        { cwd: path.join(tmpHome, "testrepo"), repoId },
      );

      const text: string = result.content[0].text;
      const projectPos = text.indexOf("project fact comes first");
      const globalPos = text.indexOf("global decision comes second");

      expect(projectPos, "project-local entry not found in output").toBeGreaterThanOrEqual(0);
      expect(globalPos, "global entry not found in output").toBeGreaterThanOrEqual(0);
      expect(projectPos, "project-local entry must appear before global entry").toBeLessThan(globalPos);
    });

    it("dedupe: overlapping summaries from global and project-local layers appear only once", async () => {
      const repoId = "gh/testorg/testrepo";
      const sharedDecision = "use explicit types everywhere";

      writeLegacyEntry("dedupe-layered-agent", { decision: sharedDecision, why_good: "global" }, "g1");
      writeProjectLocalEntry(
        repoId,
        "dedupe-layered-agent",
        { project: "testrepo", note: sharedDecision },
        "p1",
      );

      const result = await readTool.execute(
        "id",
        { agent: "dedupe-layered-agent" },
        undefined,
        undefined,
        { cwd: path.join(tmpHome, "testrepo"), repoId },
      );

      const text: string = result.content[0].text;
      const occurrences = (text.match(new RegExp(sharedDecision.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
      expect(occurrences, `"${sharedDecision}" should appear at most once (dedupe rule)`).toBeLessThanOrEqual(1);
    });
  });
});
