/**
 * Fixture-backed tests for layered expertise storage and read behavior.
 *
 * These tests are intentionally failing until pi/lib/repo-id.ts and the layered
 * storage path in agent-chain.ts are implemented (T3). They encode the required
 * behavior from the normative contract in pi/docs/expertise-layering.md.
 *
 * Coverage:
 *   - project-local default writes inside a git repo
 *   - global writes outside a git repo
 *   - mixed legacy-global + new project-local reads (backward compat)
 *   - stale snapshot rebuild on repo-id cutover
 *   - drift-safe coexistence when repo identity changes
 *   - dedupe/conflict resolution per documented precedence
 *   - dual-read: both layers remain readable
 *   - read order: project-local knowledge surfaced first
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMockPi } from "./helpers/mock-pi.js";

vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-ai")>();
  return { ...actual, completeSimple: vi.fn() };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function globalExpertiseDir(home: string): string {
  return path.join(home, ".pi", "agent", "multi-team", "expertise");
}

function projectExpertiseDir(home: string, repoId: string): string {
  return path.join(home, ".pi", "agent", "multi-team", "expertise", repoId);
}

function logPath(dir: string, agent: string): string {
  return path.join(dir, `${agent}-expertise-log.jsonl`);
}

function snapshotPath(dir: string, agent: string): string {
  return path.join(dir, `${agent}-mental-model.json`);
}

function statePath(dir: string, agent: string): string {
  return path.join(dir, `${agent}-mental-model.state.json`);
}

function writeLegacyGlobalLog(home: string, agent: string, entries: object[]): void {
  const dir = globalExpertiseDir(home);
  fs.mkdirSync(dir, { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(logPath(dir, agent), content, "utf-8");
}

function writeProjectLocalLog(home: string, repoId: string, agent: string, entries: object[]): void {
  const dir = projectExpertiseDir(home, repoId);
  fs.mkdirSync(dir, { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(logPath(dir, agent), content, "utf-8");
}

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
}

// ---------------------------------------------------------------------------
// Fixture: a minimal git repo root with a remote
// ---------------------------------------------------------------------------

function makeGitRepo(dir: string, remoteUrl: string): void {
  fs.mkdirSync(path.join(dir, ".git", "refs"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n", "utf-8");
  const configContent = [
    "[core]",
    "  repositoryformatversion = 0",
    "[remote \"origin\"]",
    `  url = ${remoteUrl}`,
    "  fetch = +refs/heads/*:refs/remotes/origin/*",
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(dir, ".git", "config"), configContent, "utf-8");
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("expertise layering -- project-local vs global writes", () => {
  let tmpHome: string;
  let tmpRepo: string;
  let tmpNonRepo: string;
  let mockPi: ReturnType<typeof createMockPi>;
  let appendTool: any;
  let readTool: any;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-layering-test-"));
    tmpRepo = path.join(tmpHome, "myproject");
    tmpNonRepo = path.join(tmpHome, "outside");
    fs.mkdirSync(tmpRepo, { recursive: true });
    fs.mkdirSync(tmpNonRepo, { recursive: true });

    // Create a git repo with a GitHub remote
    makeGitRepo(tmpRepo, "https://github.com/testorg/testrepo.git");

    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    mockPi = createMockPi();
    const mod = await import("../extensions/agent-chain.ts");
    mod.default(mockPi as any);

    appendTool = mockPi._getTool("append_expertise");
    readTool = mockPi._getTool("read_expertise");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.HOME = undefined;
    process.env.USERPROFILE = undefined;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // project-local default writes inside a git repo
  // -------------------------------------------------------------------------

  it("project-local: append_expertise writes to project-local dir when cwd is inside a git repo", async () => {
    await appendTool.execute(
      "id",
      {
        agent: "backend-dev",
        category: "observation",
        entry: { project: "testrepo", note: "uses postgres" },
        session_id: "s1",
      },
      undefined,
      undefined,
      // Pass the git repo cwd to the tool context so it can detect the repo
      { cwd: tmpRepo },
    );

    // Expected project-local slug for github.com/testorg/testrepo
    const repoId = "gh/testorg/testrepo";
    const projectDir = projectExpertiseDir(tmpHome, repoId);
    const projectLog = logPath(projectDir, "backend-dev");

    expect(
      fs.existsSync(projectLog),
      `Expected project-local log at ${projectLog} but file does not exist`,
    ).toBe(true);

    const lines = readLines(projectLog);
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.entry.note).toBe("uses postgres");
  });

  // -------------------------------------------------------------------------
  // global writes outside a git repo
  // -------------------------------------------------------------------------

  it("global: append_expertise writes to global dir when cwd is outside any git repo", async () => {
    await appendTool.execute(
      "id",
      {
        agent: "backend-dev",
        category: "observation",
        entry: { project: "general", note: "prefer snake_case" },
        session_id: "s1",
      },
      undefined,
      undefined,
      { cwd: tmpNonRepo },
    );

    const globalDir = globalExpertiseDir(tmpHome);
    const globalLog = logPath(globalDir, "backend-dev");

    expect(
      fs.existsSync(globalLog),
      `Expected global log at ${globalLog} but file does not exist`,
    ).toBe(true);

    const lines = readLines(globalLog);
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.entry.note).toBe("prefer snake_case");
  });

  // -------------------------------------------------------------------------
  // read order: project-local first, then global
  // -------------------------------------------------------------------------

  it("read order: project-local entries appear before global entries in read_expertise output", async () => {
    const repoId = "gh/testorg/testrepo";
    const now = new Date().toISOString();

    // Seed global log with an older entry
    writeLegacyGlobalLog(tmpHome, "reader-agent", [
      { timestamp: "2024-01-01T00:00:00.000Z", session_id: "g1", category: "observation", entry: { project: "global", note: "global knowledge" } },
    ]);

    // Seed project-local log with a newer entry
    writeProjectLocalLog(tmpHome, repoId, "reader-agent", [
      { timestamp: now, session_id: "p1", category: "observation", entry: { project: "testrepo", note: "project-local knowledge" } },
    ]);

    const result = await readTool.execute(
      "id",
      { agent: "reader-agent" },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const text: string = result.content[0].text;
    const projectPos = text.indexOf("project-local knowledge");
    const globalPos = text.indexOf("global knowledge");

    expect(projectPos).toBeGreaterThanOrEqual(0);
    expect(globalPos).toBeGreaterThanOrEqual(0);
    // project-local must appear before global in the output
    expect(projectPos).toBeLessThan(globalPos);
  });

  // -------------------------------------------------------------------------
  // mixed legacy global + new project-local reads (backward compat)
  // -------------------------------------------------------------------------

  it("mixed state: legacy global logs remain readable alongside project-local logs", async () => {
    const repoId = "gh/testorg/testrepo";

    writeLegacyGlobalLog(tmpHome, "mixed-agent", [
      { timestamp: "2024-01-01T00:00:00.000Z", session_id: "g1", category: "strong_decision", entry: { decision: "legacy global decision", why_good: "cross-project" } },
    ]);

    writeProjectLocalLog(tmpHome, repoId, "mixed-agent", [
      { timestamp: "2024-06-01T00:00:00.000Z", session_id: "p1", category: "strong_decision", entry: { decision: "project-local decision", why_good: "repo-specific" } },
    ]);

    const result = await readTool.execute(
      "id",
      { agent: "mixed-agent" },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const text: string = result.content[0].text;
    expect(text, "Expected legacy global decision in output").toContain("legacy global decision");
    expect(text, "Expected project-local decision in output").toContain("project-local decision");
    expect(result.details.layerSources).toContain("global");
    expect(result.details.layerSources).toContain("project-local");
  });

  // -------------------------------------------------------------------------
  // stale snapshot rebuild on cutover
  // -------------------------------------------------------------------------

  it("stale snapshot: snapshot is rebuilt when the stored repo-id diverges from detected repo-id", async () => {
    const oldRepoId = "gh/old-org/testrepo";
    const newRepoId = "gh/testorg/testrepo";

    // Seed a snapshot that was built under a different repo-id
    const snapshotDir = projectExpertiseDir(tmpHome, oldRepoId);
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.writeFileSync(
      snapshotPath(snapshotDir, "drift-agent"),
      JSON.stringify({
        schema_version: 1,
        agent: "drift-agent",
        repo_id: oldRepoId,
        rebuilt_at: "2024-01-01T00:00:00.000Z",
        covers_through_timestamp: "2024-01-01T00:00:00.000Z",
        source_entry_count: 1,
        categories: { strong_decision: [], key_file: [], pattern: [], observation: [{ summary: "old snapshot fact", evidence_count: 1, first_seen: "2024-01-01T00:00:00.000Z", last_seen: "2024-01-01T00:00:00.000Z" }], open_question: [], system_overview: [] },
      }),
      "utf-8",
    );

    // Now write a new log entry under the current (correct) repo-id
    writeProjectLocalLog(tmpHome, newRepoId, "drift-agent", [
      { timestamp: "2025-01-01T00:00:00.000Z", session_id: "p1", category: "observation", entry: { project: "testrepo", note: "new fact after remote change" } },
    ]);

    const result = await readTool.execute(
      "id",
      { agent: "drift-agent" },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    // The stale snapshot under old-org should not dominate; the current layer should be used
    expect(result.details.rebuildStatus).toBe("ready");
    expect(result.content[0].text).toContain("new fact after remote change");
  });

  // -------------------------------------------------------------------------
  // L8: drift-safe dual-read when repo identity changes
  // When the current slug differs from the stored repo-id.json slug, the
  // implementation must dual-read both paths and flag drift in result details.
  // The old path must NOT be deleted or silently abandoned.
  // -------------------------------------------------------------------------

  it("drift (L8): both old and new slug paths appear in read output and drift is flagged", async () => {
    const oldRepoId = "gh/old-org/testrepo";
    const newRepoId = "gh/testorg/testrepo";

    // Simulate pre-drift state: old project-local entries with stored repo-id metadata
    writeProjectLocalLog(tmpHome, oldRepoId, "drift-agent", [
      { timestamp: "2024-01-01T00:00:00.000Z", session_id: "p0", category: "observation", entry: { project: "testrepo", note: "pre-drift knowledge" } },
    ]);
    const oldDir = projectExpertiseDir(tmpHome, oldRepoId);
    fs.writeFileSync(
      path.join(oldDir, "repo-id.json"),
      JSON.stringify({ schema_version: 1, slug: oldRepoId, remoteUrl: "https://github.com/old-org/testrepo.git", created_at: "2024-01-01T00:00:00.000Z", last_verified_at: "2024-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    // New log entry under the current (drifted) repo-id
    writeProjectLocalLog(tmpHome, newRepoId, "drift-agent", [
      { timestamp: "2025-01-01T00:00:00.000Z", session_id: "p1", category: "observation", entry: { project: "testrepo", note: "post-drift knowledge" } },
    ]);

    const result = await readTool.execute(
      "id",
      { agent: "drift-agent" },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const text: string = result.content[0].text;
    // Both old and new slug data must be visible (dual-read)
    expect(text, "pre-drift knowledge must still be readable from old slug path").toContain("pre-drift knowledge");
    expect(text, "post-drift knowledge must be readable from new slug path").toContain("post-drift knowledge");
    // Drift must be flagged in result details so the caller can inform the user
    expect(result.details.driftDetected, "driftDetected must be true when slug changed").toBe(true);
    // The old directory must still exist (not deleted)
    expect(fs.existsSync(oldDir), "old project-local dir must not be deleted on drift").toBe(true);
  });

  // -------------------------------------------------------------------------
  // dedupe/conflict resolution: project-local takes precedence over global
  // -------------------------------------------------------------------------

  it("dedupe: project-local entry with same summary as global entry is not duplicated", async () => {
    const repoId = "gh/testorg/testrepo";
    const sharedSummary = "prefer snake_case for variables";

    writeLegacyGlobalLog(tmpHome, "dedupe-agent", [
      { timestamp: "2024-01-01T00:00:00.000Z", session_id: "g1", category: "observation", entry: { project: "global", note: sharedSummary } },
    ]);

    writeProjectLocalLog(tmpHome, repoId, "dedupe-agent", [
      { timestamp: "2025-01-01T00:00:00.000Z", session_id: "p1", category: "observation", entry: { project: "testrepo", note: sharedSummary } },
    ]);

    const result = await readTool.execute(
      "id",
      { agent: "dedupe-agent" },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const text: string = result.content[0].text;

    // The fact should appear at least once
    expect(text).toContain(sharedSummary);

    // It should NOT appear twice (dedupe rule: project-local wins over global on same summary)
    const occurrences = (text.match(new RegExp(sharedSummary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // dual-read: global remains accessible even when project-local layer exists
  // -------------------------------------------------------------------------

  it("dual-read: global Pi/tooling knowledge remains in read output even when project-local layer exists", async () => {
    const repoId = "gh/testorg/testrepo";

    writeLegacyGlobalLog(tmpHome, "dual-agent", [
      { timestamp: "2024-01-01T00:00:00.000Z", session_id: "g1", category: "strong_decision", entry: { decision: "use bun for linux bootstrapping", why_good: "global Pi tooling knowledge" } },
    ]);

    writeProjectLocalLog(tmpHome, repoId, "dual-agent", [
      { timestamp: "2025-01-01T00:00:00.000Z", session_id: "p1", category: "observation", entry: { project: "testrepo", note: "repo-specific detail only relevant here" } },
    ]);

    const result = await readTool.execute(
      "id",
      { agent: "dual-agent" },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const text: string = result.content[0].text;
    expect(text, "Global Pi/tooling knowledge should still appear in dual-read output").toContain("use bun for linux bootstrapping");
    expect(text, "Project-local detail should appear in dual-read output").toContain("repo-specific detail");
  });
});

// ---------------------------------------------------------------------------
// Layering tests that do not require a live git repo (unit-level)
// ---------------------------------------------------------------------------

describe("expertise layering -- storage path unit tests", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-layering-unit-"));
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
  });

  afterEach(() => {
    process.env.HOME = undefined;
    process.env.USERPROFILE = undefined;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("project-local dir is a child of global expertise dir, keyed by repo slug", () => {
    const repoId = "gh/owner/repo";
    const globalDir = globalExpertiseDir(tmpHome);
    const projectDir = projectExpertiseDir(tmpHome, repoId);
    // The project-local dir should be a subdirectory of the global expertise dir
    expect(projectDir.startsWith(globalDir)).toBe(true);
    expect(projectDir).toBe(path.join(globalDir, repoId));
  });

  it("global log and project-local log have non-overlapping file paths", () => {
    const repoId = "gh/owner/repo";
    const agent = "orchestrator";
    const globalLog = logPath(globalExpertiseDir(tmpHome), agent);
    const projectLog = logPath(projectExpertiseDir(tmpHome, repoId), agent);
    expect(globalLog).not.toBe(projectLog);
  });
});

// ---------------------------------------------------------------------------
// Sensitive repo safety -- L10
// When sensitive_repo is flagged, project-local writes are blocked entirely.
// ---------------------------------------------------------------------------

describe("expertise layering -- sensitive_repo safety (L10)", () => {
  let tmpHome: string;
  let tmpRepo: string;
  let mockPi: ReturnType<typeof createMockPi>;
  let appendTool: any;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sensitive-test-"));
    tmpRepo = path.join(tmpHome, "sensitiveproject");
    fs.mkdirSync(tmpRepo, { recursive: true });
    makeGitRepo(tmpRepo, "https://github.com/testorg/testrepo.git");

    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    mockPi = createMockPi();
    const mod = await import("../extensions/agent-chain.ts");
    mod.default(mockPi as any);

    appendTool = mockPi._getTool("append_expertise");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.HOME = undefined;
    process.env.USERPROFILE = undefined;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("sensitive_repo: append_expertise writes go to global only when sensitive_repo is set in repo config", async () => {
    // Write .pi/settings.json that marks this repo as sensitive (per normative contract L10)
    const piRepoConfigDir = path.join(tmpRepo, ".pi");
    fs.mkdirSync(piRepoConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(piRepoConfigDir, "settings.json"),
      JSON.stringify({ sensitive_repo: true }),
      "utf-8",
    );

    await appendTool.execute(
      "id",
      {
        agent: "sensitive-agent",
        category: "observation",
        entry: { project: "testrepo", note: "sensitive project detail" },
        session_id: "s1",
      },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const repoId = "gh/testorg/testrepo";
    const projectDir = projectExpertiseDir(tmpHome, repoId);
    const projectLog = logPath(projectDir, "sensitive-agent");
    const globalLog = logPath(globalExpertiseDir(tmpHome), "sensitive-agent");

    // Project-local write must be blocked
    expect(
      fs.existsSync(projectLog),
      `Project-local log should NOT exist when sensitive_repo is set, but found ${projectLog}`,
    ).toBe(false);

    // Entry must still be written, but to global only
    expect(
      fs.existsSync(globalLog),
      `Global log should exist as the fallback when sensitive_repo is set`,
    ).toBe(true);
  });

  it("sensitive_repo: no redaction-free path -- blocked entry does not appear in project-local dir at all", async () => {
    const piRepoConfigDir = path.join(tmpRepo, ".pi");
    fs.mkdirSync(piRepoConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(piRepoConfigDir, "settings.json"),
      JSON.stringify({ sensitive_repo: true }),
      "utf-8",
    );

    await appendTool.execute(
      "id",
      {
        agent: "sensitive-agent2",
        category: "strong_decision",
        entry: { decision: "do not store this locally", why_good: "sensitive repo" },
        session_id: "s1",
      },
      undefined,
      undefined,
      { cwd: tmpRepo },
    );

    const repoId = "gh/testorg/testrepo";
    const projectDir = projectExpertiseDir(tmpHome, repoId);

    // The entire project-local directory for this repo should not exist
    // (or if it exists for other reasons, the log file for this agent must not)
    const projectLog = logPath(projectDir, "sensitive-agent2");
    expect(
      fs.existsSync(projectLog),
      "No project-local log should exist for any category when sensitive_repo is set",
    ).toBe(false);
  });
});
