/**
 * Behavioral tests for read_expertise focused retrieval.
 *
 * These fixtures encode .specs/read-expertise-vector/retrieval-contract.md.
 * They may fail until T4 implements retrieval, but the harness and expected
 * outputs are concrete so implementation can be driven from this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMockPi } from "./helpers/mock-pi.js";

const mockCompleteSimple = vi.hoisted(() => vi.fn());

vi.mock("@mariozechner/pi-ai", () => ({
  completeSimple: mockCompleteSimple,
  Type: {
    Object: (schema: unknown) => ({ type: "object", properties: schema }),
    String: (options?: unknown) => ({ type: "string", ...options as Record<string, unknown> }),
    Number: (options?: unknown) => ({ type: "number", ...options as Record<string, unknown> }),
    Null: () => ({ type: "null" }),
    Union: (schemas: unknown[], options?: unknown) => ({ anyOf: schemas, ...options as Record<string, unknown> }),
    Optional: (schema: unknown) => schema,
  },
}));

interface FixtureEntry {
  timestamp: string;
  session_id: string;
  category: string;
  entry: Record<string, unknown>;
}

const AGENT = "retrieval-agent";

function expertiseDir(home: string): string {
  return path.join(home, ".pi", "agent", "multi-team", "expertise");
}

function logPath(home: string, agent = AGENT): string {
  return path.join(expertiseDir(home), `${agent}-expertise-log.jsonl`);
}

function retrievalIndexPath(home: string, agent = AGENT): string {
  return path.join(expertiseDir(home), `${agent}-retrieval-index.json`);
}

function writeExpertiseLog(home: string, entries: FixtureEntry[], agent = AGENT): void {
  fs.mkdirSync(expertiseDir(home), { recursive: true });
  fs.writeFileSync(logPath(home, agent), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf-8");
}

function seedRetrievalFixtures(home: string): void {
  writeExpertiseLog(home, [
    {
      timestamp: "2026-01-01T00:00:00.000Z",
      session_id: "s1",
      category: "strong_decision",
      entry: { decision: "Keep npm on Windows for the global Pi install", why_good: "Windows packaging is stable with npm" },
    },
    {
      timestamp: "2026-01-02T00:00:00.000Z",
      session_id: "s2",
      category: "key_file",
      entry: { path: "pi/README.md", role: "Windows package-manager guidance", notes: "Documents npm instead of Bun" },
    },
    {
      timestamp: "2026-01-03T00:00:00.000Z",
      session_id: "s3",
      category: "observation",
      entry: { project: "dotfiles", note: "Playwright traces are unrelated browser evidence" },
    },
    {
      timestamp: "2026-01-04T00:00:00.000Z",
      session_id: "s4",
      category: "observation",
      entry: { project: "dotfiles", note: "Windows Pi global install uses npm instead of Bun" },
    },
    {
      timestamp: "2026-01-05T00:00:00.000Z",
      session_id: "s5",
      category: "observation",
      entry: { project: "dotfiles", note: "Windows Pi global install uses npm instead of Bun" },
    },
  ]);
}

function expectFocusedBullet(text: string, query: string, bullet: string): void {
  const focusedIndex = text.indexOf(`Focused retrieval for: ${query}`);
  expect(focusedIndex, `focused section for ${query} not found`).toBeGreaterThanOrEqual(0);
  const bulletIndex = text.indexOf(bullet, focusedIndex);
  expect(bulletIndex, `${bullet} not found in focused section`).toBeGreaterThan(focusedIndex);
}

describe("read_expertise focused retrieval", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let readTool: any;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockCompleteSimple.mockReset();
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-read-retrieval-test-"));
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    const mockPi = createMockPi();
    const mod = await import("../extensions/agent-chain.ts");
    mod.default(mockPi as any);
    readTool = mockPi._getTool("read_expertise");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("keeps no-query compatibility: unchanged text and no retrieval details", async () => {
    seedRetrievalFixtures(tmpHome);
    const result = await readTool.execute("id", { agent: AGENT }, undefined, undefined, {});

    expect(result.content[0].text).toContain("Expertise for retrieval-agent");
    expect(result.content[0].text).toContain("Keep npm on Windows for the global Pi install");
    expect(result.content[0].text).not.toContain("Focused retrieval for:");
    expect(result.details.retrieval).toBeUndefined();
  });

  it("returns focused query matches after the baseline snapshot with deterministic details", async () => {
    seedRetrievalFixtures(tmpHome);
    const result = await readTool.execute("id", { agent: AGENT, query: "Windows npm install", max_results: 2 }, undefined, undefined, {});
    const text: string = result.content[0].text;

    expect(text).toContain("Expertise for retrieval-agent");
    expect(text).toContain("\n\nFocused retrieval for: Windows npm install\n");
    expect(text).toContain("- Keep npm on Windows for the global Pi install");
    expect(text).toContain("- pi/README.md -- Windows package-manager guidance");
    expect(text).not.toContain("Playwright traces are unrelated browser evidence");
    expectFocusedBullet(text, "Windows npm install", "- Keep npm on Windows for the global Pi install");
    expect(result.details.retrieval).toMatchObject({
      query: "Windows npm install",
      max_results: 2,
      strategy: "lexical",
      entry_count_considered: 5,
      result_count: 2,
      used_index: expect.any(Boolean),
      rebuilt_index: expect.any(Boolean),
      fallback_reason: "missing_index",
    });
  });

  it("enforces max_results after deduplication and ranks exact/category matches first", async () => {
    seedRetrievalFixtures(tmpHome);
    const result = await readTool.execute("id", { agent: AGENT, query: "Windows Pi global install uses npm", max_results: 1 }, undefined, undefined, {});
    const text: string = result.content[0].text;

    expect(text).toContain("Focused retrieval for: Windows Pi global install uses npm");
    expect(text).toContain("- Windows Pi global install uses npm instead of Bun");
    expect((text.match(/Windows Pi global install uses npm instead of Bun/g) ?? [])).toHaveLength(1);
    const focusedSection = text.slice(text.indexOf("Focused retrieval for: Windows Pi global install uses npm"));
    expect(focusedSection).not.toContain("- pi/README.md -- Windows package-manager guidance");
    expect(result.details.retrieval).toMatchObject({ max_results: 1, result_count: 1 });
  });

  it.each([
    ["missing_index", undefined],
    ["stale_index", { index_version: "old", agent: AGENT, entries: [] }],
    ["corrupt_index", "{not json"],
    ["partial_index", { index_version: 1, agent: AGENT }],
  ])("falls back safely for %s cache state", async (reason, cachePayload) => {
    seedRetrievalFixtures(tmpHome);
    const indexPath = retrievalIndexPath(tmpHome);
    if (cachePayload !== undefined) {
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, typeof cachePayload === "string" ? cachePayload : JSON.stringify(cachePayload), "utf-8");
    }

    const result = await readTool.execute("id", { agent: AGENT, query: "Playwright traces", max_results: 3 }, undefined, undefined, {});

    expect(result.content[0].text).toContain("Expertise for retrieval-agent");
    expect(result.content[0].text).toContain("Focused retrieval for: Playwright traces");
    expect(result.content[0].text).toContain("Playwright traces are unrelated browser evidence");
    expect(result.details.retrieval).toMatchObject({ fallback_reason: reason, result_count: 1 });
  });

  it("uses local lexical retrieval and reports provider_disabled without calling providers", async () => {
    seedRetrievalFixtures(tmpHome);
    const result = await readTool.execute(
      "id",
      { agent: AGENT, query: "Windows npm", max_results: 2 },
      undefined,
      undefined,
      { retrievalProviderRequested: true, modelRegistry: { find: vi.fn(), getApiKeyAndHeaders: vi.fn() } },
    );

    expect(result.content[0].text).toContain("Focused retrieval for: Windows npm");
    expect(result.details.retrieval).toMatchObject({ strategy: "lexical", fallback_reason: "provider_disabled" });
    expect(mockCompleteSimple).not.toHaveBeenCalled();
  });

  it("returns a no-match focused line without treating it as an error", async () => {
    seedRetrievalFixtures(tmpHome);
    const result = await readTool.execute("id", { agent: AGENT, query: "Kubernetes service mesh", max_results: 5 }, undefined, undefined, {});

    expect(result.content[0].text).toContain("No focused matches found; using baseline expertise only.");
    expect(result.details.retrieval).toMatchObject({ fallback_reason: "no_matches", result_count: 0 });
  });

  it.each([
    [{ agent: "" }, "agent"],
    [{ agent: "   " }, "agent"],
    [{ agent: AGENT, query: "x".repeat(501) }, "query"],
    [{ agent: AGENT, query: "valid", max_results: 0 }, "max_results"],
    [{ agent: AGENT, query: "valid", max_results: 21 }, "max_results"],
    [{ agent: AGENT, query: "valid", max_results: 1.5 }, "max_results"],
    [{ agent: AGENT, query: "valid", max_results: "5" }, "max_results"],
  ])("rejects invalid input %o before creating retrieval artifacts", async (params, field) => {
    await expect(readTool.execute("id", params, undefined, undefined, {})).rejects.toThrow(field);
    expect(fs.existsSync(retrievalIndexPath(tmpHome, AGENT))).toBe(false);
  });
});
