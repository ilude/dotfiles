/**
 * Integration tests for agent-chain expertise tools.
 * Uses a temp home directory so expertise files are isolated per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completeSimple } from "@mariozechner/pi-ai";
import { createMockPi, GIT_REMOTE_FIXTURES, WINDOWS_NORMALIZATION_FIXTURES } from "./helpers/mock-pi.js";

vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-ai")>();
  return {
    ...actual,
    completeSimple: vi.fn(),
  };
});

const mockCompleteSimple = completeSimple as ReturnType<typeof vi.fn>;

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
      snapshotPath: path.join(expertiseDir, `${agent}-mental-model.json`),
      statePath: path.join(expertiseDir, `${agent}-mental-model.state.json`),
    };
  };

  const appendExpertise = async (
    agent: string,
    category: string,
    entry: Record<string, unknown>,
    sessionId: string,
  ) =>
    appendTool.execute(
      "id",
      { agent, category, entry, session_id: sessionId },
      undefined,
      undefined,
      {},
    );

  const readSnapshot = (agent: string) => {
    const { snapshotPath } = pathsFor(agent);
    return JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
  };

  const writeAgentSettings = (settings: Record<string, unknown>) => {
    const settingsPath = path.join(tmpHome, ".pi", "agent", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  };

  const providerContext = (overrides: Record<string, unknown> = {}) => {
    const model = { provider: "github-copilot", id: "raptor-mini", name: "Raptor Mini" };
    return {
      modelRegistry: {
        find: vi.fn(() => model),
        getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: "test-key", headers: { "x-test": "1" } })),
      },
      getSystemPrompt: vi.fn(() => "test system prompt"),
      signal: undefined,
      ...overrides,
    };
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockCompleteSimple.mockReset();

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

  it("append_expertise writes raw history and marks snapshot state stale", async () => {
    const result = await appendTool.execute(
      "id",
      {
        agent: "backend-dev",
        category: "observation",
        entry: { project: "dotfiles", note: "snapshot planning in progress" },
        session_id: "test-session",
      },
      undefined,
      undefined,
      {},
    );

    const { logPath, statePath } = pathsFor("backend-dev");
    expect(result.content[0].text).toContain("marked the mental model stale");
    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);

    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]);
    expect(record.session_id).toBe("test-session");
    expect(record.category).toBe("observation");
    expect(record.entry.note).toBe("snapshot planning in progress");

    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(state.dirty).toBe(true);
    expect(state.rebuild_status).toBe("stale");
  });

  it("read_expertise reports first session when no expertise exists", async () => {
    const result = await readTool.execute("id", { agent: "frontend-dev" }, undefined, undefined, {});

    expect(result.content[0].text).toContain("No expertise recorded yet for frontend-dev");
    expect(result.details.entryCount).toBe(0);
  });

  it("rebuilds a missing snapshot synchronously on read", async () => {
    await appendTool.execute(
      "id",
      {
        agent: "orchestrator",
        category: "strong_decision",
        entry: { decision: "prefer snapshot reads", why_good: "reduces token use" },
        session_id: "session-a",
      },
      undefined,
      undefined,
      {},
    );

    const result = await readTool.execute("id", { agent: "orchestrator" }, undefined, undefined, {});
    const { snapshotPath, statePath } = pathsFor("orchestrator");

    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(result.content[0].text).toContain("Strong decisions:");
    expect(result.content[0].text).toContain("prefer snapshot reads");
    expect(result.details.rebuildStatus).toBe("ready");
    expect(result.details.dirty).toBe(false);
    expect(result.details.usedRawFallback).toBe(false);
  });

  it("preserves raw-log history while reading from a fresh mental-model snapshot", async () => {
    await appendTool.execute(
      "id",
      { agent: "planner", category: "observation", entry: { note: "same fact" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "planner", category: "observation", entry: { note: "same fact" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );

    await readTool.execute("id", { agent: "planner" }, undefined, undefined, {});

    const { logPath, snapshotPath } = pathsFor("planner");
    expect(fs.readFileSync(logPath, "utf-8").trim().split("\n")).toHaveLength(2);
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  it("does not replay the full raw log when a fresh snapshot exists", async () => {
    await appendTool.execute(
      "id",
      {
        agent: "reviewer",
        category: "strong_decision",
        entry: { decision: "prefer bounded reads", why_good: "cheaper prompts" },
        session_id: "session-a",
      },
      undefined,
      undefined,
      {},
    );

    await readTool.execute("id", { agent: "reviewer" }, undefined, undefined, {});
    const secondRead = await readTool.execute("id", { agent: "reviewer" }, undefined, undefined, {});

    expect(secondRead.content[0].text).toContain("Strong decisions:");
    expect(secondRead.content[0].text).not.toContain('{"decision":"prefer bounded reads"');
    expect(secondRead.details.rebuildStatus).toBe("ready");
    expect(secondRead.details.dirty).toBe(false);
  });

  it("rebuilds stale snapshots to include new entries", async () => {
    await appendTool.execute(
      "id",
      { agent: "qa-engineer", category: "observation", entry: { note: "first observation" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await readTool.execute("id", { agent: "qa-engineer" }, undefined, undefined, {});

    await appendTool.execute(
      "id",
      { agent: "qa-engineer", category: "observation", entry: { note: "second observation" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );

    const result = await readTool.execute("id", { agent: "qa-engineer", mode: "full" }, undefined, undefined, {});
    expect(result.content[0].text).toContain("first observation");
    expect(result.content[0].text).toContain("second observation");
    expect(result.details.rebuildStatus).toBe("ready");
    expect(result.details.dirty).toBe(false);
  });

  it("surfaces safe fallback behavior when the last rebuild fails", async () => {
    await appendTool.execute(
      "id",
      { agent: "builder", category: "observation", entry: { note: "stable fact" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await readTool.execute("id", { agent: "builder" }, undefined, undefined, {});
    await appendTool.execute(
      "id",
      { agent: "builder", category: "observation", entry: { note: "new fact" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );

    const renameSpy = vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("rename blocked"));
    const result = await readTool.execute("id", { agent: "builder" }, undefined, undefined, {});
    renameSpy.mockRestore();

    expect(result.content[0].text).toContain("Warning: stale snapshot retained because rebuild failed");
    expect(result.details.rebuildStatus).toBe("failed");
    expect(result.details.dirty).toBe(true);
    expect(result.details.usedRawFallback).toBe(false);
  });

  it("defaults read_expertise to concise output while full mode keeps task-specific history", async () => {
    await appendTool.execute(
      "id",
      { agent: "concise-agent", category: "observation", entry: { project: "dotfiles", note: "Added temporary debug logging for issue 123" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "concise-agent", category: "strong_decision", entry: { decision: "Prefer durable expertise over changelog entries", why_good: "reduces noise" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );

    const concise = await readTool.execute("id", { agent: "concise-agent" }, undefined, undefined, {});
    const full = await readTool.execute("id", { agent: "concise-agent", mode: "full" }, undefined, undefined, {});

    expect(concise.details.mode).toBe("concise");
    expect(concise.content[0].text).toContain("Prefer durable expertise over changelog entries");
    expect(concise.content[0].text).not.toContain("temporary debug logging");
    expect(full.details.mode).toBe("full");
    expect(full.content[0].text).toContain("temporary debug logging");
  });

  it("concise mode hides observations from other projects", async () => {
    await appendTool.execute(
      "id",
      { agent: "project-filter-agent", category: "observation", entry: { project: "eisa-playwright-e2e", note: "Prefer the explicit three-step validation strategy for Playwright drives" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "project-filter-agent", category: "observation", entry: { project: "dotfiles", note: "Prefer concise expertise reads for agent startup" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );

    const concise = await readTool.execute("id", { agent: "project-filter-agent" }, undefined, undefined, { cwd: path.join(tmpHome, "dotfiles") });
    const full = await readTool.execute("id", { agent: "project-filter-agent", mode: "full" }, undefined, undefined, { cwd: path.join(tmpHome, "dotfiles") });

    expect(concise.content[0].text).toContain("Prefer concise expertise reads");
    expect(concise.content[0].text).not.toContain("Playwright drives");
    expect(full.content[0].text).toContain("Playwright drives");
  });

  it("concise mode hides domain-specific strong decisions", async () => {
    await appendTool.execute(
      "id",
      { agent: "decision-filter-agent", category: "strong_decision", entry: { decision: "Change the durable Playwright drive from a one-time snapshotted ordered target list to dynamic discovery plus a persisted completed-target set.", why_good: "project-specific" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "decision-filter-agent", category: "strong_decision", entry: { decision: "Prefer deterministic snapshot rebuilds over mutable raw history rewrites.", why_good: "general agent behavior" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );

    const concise = await readTool.execute("id", { agent: "decision-filter-agent" }, undefined, undefined, { cwd: path.join(tmpHome, "dotfiles") });
    const full = await readTool.execute("id", { agent: "decision-filter-agent", mode: "full" }, undefined, undefined, { cwd: path.join(tmpHome, "dotfiles") });

    expect(concise.content[0].text).toContain("Prefer deterministic snapshot rebuilds");
    expect(concise.content[0].text).not.toContain("Playwright drive");
    expect(full.content[0].text).toContain("Playwright drive");
  });

  it("deduplicates repeated observations while preserving strong_decision and key_file entries", async () => {
    await appendTool.execute(
      "id",
      { agent: "orchestrator", category: "observation", entry: { project: "dotfiles", note: "same noisy fact" }, session_id: "s1" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "orchestrator", category: "observation", entry: { project: "dotfiles", note: "same noisy fact" }, session_id: "s2" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "orchestrator", category: "strong_decision", entry: { decision: "keep npm on Windows", why_good: "latest Pi" }, session_id: "s3" },
      undefined,
      undefined,
      {},
    );
    await appendTool.execute(
      "id",
      { agent: "orchestrator", category: "key_file", entry: { path: "pi/extensions/agent-chain.ts", role: "expertise tools" }, session_id: "s4" },
      undefined,
      undefined,
      {},
    );

    const result = await readTool.execute("id", { agent: "orchestrator", mode: "full" }, undefined, undefined, {});

    expect(result.content[0].text).toContain("dotfiles: same noisy fact");
    expect(result.content[0].text).not.toContain("evidence:");
    expect(result.content[0].text).toContain("keep npm on Windows");
    expect(result.content[0].text).toContain("pi/extensions/agent-chain.ts -- expertise tools");
  });

  describe("provider-assisted similarity matrix", () => {
    it("uses the deterministic-only baseline when provider-assisted similarity is disabled or unavailable", async () => {
      await appendExpertise(
        "similarity-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "similarity-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      const result = await readTool.execute("id", { agent: "similarity-tester" }, undefined, undefined, {});
      const snapshot = readSnapshot("similarity-tester");

      expect(result.details.usedRawFallback).toBe(false);
      expect(result.details.similarity).toMatchObject({
        active: false,
        reason: "disabled",
        attempted: 0,
        merged: 0,
      });
      expect(snapshot.categories.observation).toHaveLength(2);
      expect(snapshot.similarity).toMatchObject({
        active: false,
        reason: "disabled",
      });
      expect(mockCompleteSimple).not.toHaveBeenCalled();
      expect(snapshot.categories.observation.map((item: any) => item.summary)).toEqual(
        expect.arrayContaining([
          "dotfiles: Windows Pi install uses npm for the global package",
          "dotfiles: Windows Pi global install prefers npm over Bun",
        ]),
      );
    });

    it("provider-enabled ambiguous merge approval merges borderline observations after deterministic pre-grouping", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 50,
          min_confidence: 0.75,
        },
      });
      mockCompleteSimple.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ decision: "merge", confidence: 0.93, merged_summary: "dotfiles: Windows Pi global install uses npm instead of Bun" }) }],
      });

      await appendExpertise(
        "approval-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "approval-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      const result = await readTool.execute("id", { agent: "approval-tester" }, undefined, undefined, providerContext());
      const snapshot = readSnapshot("approval-tester");

      expect(result.content[0].text).toContain("Expertise for approval-tester");
      expect(result.content[0].text).not.toContain("Similarity:");
      expect(result.details.usedRawFallback).toBe(false);
      expect(result.details.similarity).toMatchObject({
        active: true,
        reason: "ready",
        attempted: 1,
        merged: 1,
      });
      expect(snapshot.categories.observation).toHaveLength(1);
      expect(snapshot.categories.observation[0].summary).toBe("dotfiles: Windows Pi global install uses npm instead of Bun");
      expect(snapshot.categories.observation[0].evidence_count).toBe(2);
      expect(snapshot.categories.observation[0].merge_metadata).toMatchObject({
        method: "provider",
        confidence: 0.93,
        merged_from_count: 2,
      });
      expect(snapshot.similarity).toMatchObject({
        active: true,
        reason: "ready",
        attempted: 1,
        merged: 1,
        kept_separate: 0,
      });
      expect(mockCompleteSimple).toHaveBeenCalledTimes(1);
    });

    it("provider-enabled ambiguous merge rejection keeps borderline observations separate", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 50,
          min_confidence: 0.75,
        },
      });
      mockCompleteSimple.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ decision: "keep_separate", confidence: 0.91 }) }],
      });

      await appendExpertise(
        "rejection-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "rejection-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      const result = await readTool.execute("id", { agent: "rejection-tester" }, undefined, undefined, providerContext());
      const snapshot = readSnapshot("rejection-tester");

      expect(result.details.usedRawFallback).toBe(false);
      expect(result.details.similarity).toMatchObject({
        active: true,
        reason: "ready",
        attempted: 1,
        kept_separate: 1,
      });
      expect(snapshot.categories.observation).toHaveLength(2);
      expect(mockCompleteSimple).toHaveBeenCalledTimes(1);
    });

    it("falls back to deterministic compaction on low confidence provider responses", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 50,
          min_confidence: 0.8,
        },
      });
      mockCompleteSimple.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ decision: "merge", confidence: 0.41, merged_summary: "dotfiles: merged summary that should be ignored" }) }],
      });

      await appendExpertise(
        "low-confidence-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "low-confidence-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      const result = await readTool.execute("id", { agent: "low-confidence-tester" }, undefined, undefined, providerContext());
      const snapshot = readSnapshot("low-confidence-tester");

      expect(result.details.rebuildStatus).toBe("ready");
      expect(result.details.similarity).toMatchObject({
        active: true,
        reason: "ready",
        attempted: 1,
        skipped_for_low_confidence: 1,
      });
      expect(snapshot.categories.observation).toHaveLength(2);
      expect(snapshot.categories.observation.map((item: any) => item.summary)).not.toContain(
        "dotfiles: merged summary that should be ignored",
      );
      expect(mockCompleteSimple).toHaveBeenCalledTimes(1);
    });

    it("falls back to deterministic compaction when the provider times out or fails", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 5,
          min_confidence: 0.75,
        },
      });

      await appendExpertise(
        "timeout-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "timeout-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      mockCompleteSimple.mockRejectedValueOnce(new Error("similarity timeout after 5ms"));
      const timeoutResult = await readTool.execute("id", { agent: "timeout-tester" }, undefined, undefined, providerContext());
      const timeoutSnapshot = readSnapshot("timeout-tester");

      expect(timeoutResult.details.rebuildStatus).toBe("ready");
      expect(timeoutResult.details.similarity).toMatchObject({
        active: true,
        reason: "ready",
        attempted: 1,
        failed: 1,
      });
      expect(timeoutSnapshot.categories.observation).toHaveLength(2);

      await appendExpertise(
        "failure-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "failure-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );
      mockCompleteSimple.mockRejectedValueOnce(new Error("provider unavailable"));

      const failureResult = await readTool.execute("id", { agent: "failure-tester" }, undefined, undefined, providerContext());
      const failureSnapshot = readSnapshot("failure-tester");

      expect(failureResult.details.rebuildStatus).toBe("ready");
      expect(failureResult.details.similarity).toMatchObject({
        active: true,
        reason: "ready",
        attempted: 1,
        failed: 1,
      });
      expect(failureSnapshot.categories.observation).toHaveLength(2);
    });

    it("falls back to deterministic compaction on malformed provider responses", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 50,
          min_confidence: 0.75,
        },
      });
      await appendExpertise(
        "malformed-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "malformed-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      mockCompleteSimple.mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }] });
      const invalidJsonResult = await readTool.execute("id", { agent: "malformed-tester" }, undefined, undefined, providerContext());
      const invalidJsonSnapshot = readSnapshot("malformed-tester");
      expect(invalidJsonResult.details.similarity).toMatchObject({ attempted: 1, failed: 1 });
      expect(invalidJsonSnapshot.categories.observation).toHaveLength(2);

      await appendExpertise(
        "missing-summary-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "missing-summary-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );
      mockCompleteSimple.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ decision: "merge", confidence: 0.91 }) }],
      });

      const missingSummaryResult = await readTool.execute("id", { agent: "missing-summary-tester" }, undefined, undefined, providerContext());
      const missingSummarySnapshot = readSnapshot("missing-summary-tester");
      expect(missingSummaryResult.details.similarity).toMatchObject({ attempted: 1, malformed: 1 });
      expect(missingSummarySnapshot.categories.observation).toHaveLength(2);
    });

    it("reports why enabled similarity is inactive when provider setup is unavailable", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 50,
          min_confidence: 0.75,
        },
      });
      await appendExpertise(
        "inactive-provider-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi install uses npm for the global package" },
        "s1",
      );
      await appendExpertise(
        "inactive-provider-tester",
        "observation",
        { project: "dotfiles", note: "Windows Pi global install prefers npm over Bun" },
        "s2",
      );

      const result = await readTool.execute(
        "id",
        { agent: "inactive-provider-tester" },
        undefined,
        undefined,
        { modelRegistry: { find: vi.fn(() => undefined), getApiKeyAndHeaders: vi.fn() } },
      );
      const snapshot = readSnapshot("inactive-provider-tester");

      expect(result.content[0].text).not.toContain("Similarity:");
      expect(result.details.similarity).toMatchObject({
        enabled: true,
        active: false,
        reason: "model_not_found",
        attempted: 0,
      });
      expect(snapshot.similarity).toMatchObject({ active: false, reason: "model_not_found" });
      expect(mockCompleteSimple).not.toHaveBeenCalled();
    });

    it("never sends strong_decision or key_file categories into the provider-assisted path", async () => {
      writeAgentSettings({
        expertise_similarity: {
          enabled: true,
          provider: "github-copilot",
          model: "raptor-mini",
          timeout_ms: 50,
          min_confidence: 0.75,
        },
      });

      await appendExpertise(
        "guardrail-tester",
        "strong_decision",
        { decision: "keep npm on Windows for Pi", why_good: "matches documented package manager choice" },
        "s1",
      );
      await appendExpertise(
        "guardrail-tester",
        "strong_decision",
        { decision: "keep Bun for Linux bootstrap only", why_good: "separate platform decision" },
        "s2",
      );
      await appendExpertise(
        "guardrail-tester",
        "key_file",
        { path: "pi/README.md", role: "Pi install docs", notes: "Windows package-manager guidance" },
        "s3",
      );
      await appendExpertise(
        "guardrail-tester",
        "key_file",
        { path: "pi/extensions/agent-chain.ts", role: "expertise tools", notes: "mental-model read/write path" },
        "s4",
      );

      await readTool.execute("id", { agent: "guardrail-tester" }, undefined, undefined, providerContext());
      const snapshot = readSnapshot("guardrail-tester");

      expect(snapshot.categories.strong_decision).toHaveLength(2);
      expect(snapshot.categories.key_file).toHaveLength(2);
      expect(mockCompleteSimple).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Layered expertise scenarios
  // These tests encode the desired behavior for the two-layer memory model
  // (project-local + global). They will fail until T3 implements the feature.
  // ---------------------------------------------------------------------------

  describe("layered expertise -- fixture coverage from shared remote table", () => {
    it("GIT_REMOTE_FIXTURES covers all required remote format categories", () => {
      // Verify the fixture table includes each mandatory category so future
      // regressions against the normative contract are caught here.
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
        // Pass a cwd that resolves to repoId -- T3 will implement this detection
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

    it("stale snapshot: when repoId changes, snapshot is rebuilt from current layer", async () => {
      const oldRepoId = "gh/old-org/testrepo";
      const newRepoId = "gh/testorg/testrepo";

      // Write a project-local log under the new repoId
      writeProjectLocalEntry(
        newRepoId,
        "snapshot-drift-agent",
        { project: "testrepo", note: "current project knowledge" },
        "p1",
      );

      // Write a stale snapshot that records a different repoId
      const oldProjectDir = path.join(tmpHome, ".pi", "agent", "multi-team", "expertise", oldRepoId);
      fs.mkdirSync(oldProjectDir, { recursive: true });
      fs.writeFileSync(
        path.join(oldProjectDir, "snapshot-drift-agent-mental-model.state.json"),
        JSON.stringify({ schema_version: 1, dirty: false, rebuild_status: "ready", repo_id: oldRepoId }),
        "utf-8",
      );

      const result = await readTool.execute(
        "id",
        { agent: "snapshot-drift-agent", mode: "full" },
        undefined,
        undefined,
        { cwd: path.join(tmpHome, "testrepo"), repoId: newRepoId },
      );

      // The result should reflect the current layer, not the stale snapshot
      expect(result.details.rebuildStatus).toBe("ready");
      expect(result.content[0].text).toContain("current project knowledge");
    });
  });
});
