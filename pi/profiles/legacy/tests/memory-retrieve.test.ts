import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

let tmpHome = "";
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

function writeLog(root: string, repo: string, agent: string, rows: any[]) {
  const dir = repo === "__global-layer__" ? root : path.join(root, ...repo.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${agent}-expertise-log.jsonl`), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
}

async function rebuild(root: string) {
  const mod = await import("../lib/memory-index.ts");
  return mod.rebuildMemoryIndex(root);
}

describe("memory retrieval phase 1", () => {
  beforeEach(() => {
    originalHome = process.env.HOME; originalUserProfile = process.env.USERPROFILE;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-memory-test-"));
    process.env.HOME = tmpHome; process.env.USERPROFILE = tmpHome;
  });
  afterEach(() => { if (originalHome) process.env.HOME = originalHome; else delete process.env.HOME; if (originalUserProfile) process.env.USERPROFILE = originalUserProfile; else delete process.env.USERPROFILE; fs.rmSync(tmpHome, { recursive: true, force: true }); });

  it("uses __global-layer__ sentinel distinct from non-git global slug", async () => {
    const root = path.join(tmpHome, "expertise");
    writeLog(root, "__global-layer__", "orchestrator", [{ id: "g1", timestamp: "2026-01-01T00:00:00Z", kind: "policy", entry: { summary: "global policy" } }]);
    writeLog(root, "global", "orchestrator", [{ id: "ng1", timestamp: "2026-01-02T00:00:00Z", entry: { summary: "non git fallback" } }]);
    const idx = await rebuild(root);
    expect(new Set(idx.rows.map(r => r.repo_id))).toEqual(new Set(["__global-layer__", "global"]));
  });

  it("defaults to current repo and excludes global/privacy cross-repo rows", async () => {
    const root = path.join(tmpHome, "expertise");
    writeLog(root, "gh/a/repo", "orchestrator", [{ id: "a", timestamp: "2026-01-01T00:00:00Z", entry: { summary: "postgres migration" } }]);
    writeLog(root, "gh/b/repo", "orchestrator", [{ id: "b", timestamp: "2026-01-02T00:00:00Z", entry: { summary: "postgres secret other repo" } }]);
    writeLog(root, "__global-layer__", "orchestrator", [{ id: "p", timestamp: "2026-01-03T00:00:00Z", kind: "policy", entry: { summary: "postgres policy" } }]);
    await rebuild(root);
    const { retrieve } = await import("../lib/memory-retrieve.ts");
    const results = await retrieve({ task: "postgres", agent: "orchestrator", repoId: "gh/a/repo", k: 10, maxTokens: 1000 });
    expect(new Set(results.map((r: any) => r.repo_id))).toEqual(new Set(["gh/a/repo"]));
    expect(results.every((r: any) => typeof r.lexicalScore === "number" && typeof r.similarity === "number")).toBe(true);
  });

  it("crossRepo policies-only admits global policies but no raw other-repo rows", async () => {
    const root = path.join(tmpHome, "expertise");
    writeLog(root, "gh/a/repo", "orchestrator", [{ id: "a", timestamp: "2026-01-01T00:00:00Z", entry: { summary: "cache" } }]);
    writeLog(root, "gh/b/repo", "orchestrator", [{ id: "b", timestamp: "2026-01-02T00:00:00Z", entry: { summary: "cache raw private" } }]);
    writeLog(root, "__global-layer__", "orchestrator", [{ id: "p", timestamp: "2026-01-03T00:00:00Z", kind: "policy", entry: { summary: "cache policy" } }, { id: "np", timestamp: "2026-01-04T00:00:00Z", entry: { summary: "cache non policy" } }]);
    await rebuild(root);
    const { retrieve } = await import("../lib/memory-retrieve.ts");
    const ids = (await retrieve({ task: "cache", agent: "orchestrator", repoId: "gh/a/repo", k: 10, crossRepo: "policies-only", maxTokens: 1000 })).map((r: any) => r.id);
    expect(ids).toContain("p"); expect(ids).not.toContain("b"); expect(ids).not.toContain("np");
  });

  it("collapses superseded chains to chain tails and enforces maxTokens/k", async () => {
    const root = path.join(tmpHome, "expertise");
    writeLog(root, "gh/a/repo", "orchestrator", [
      { id: "A", timestamp: "2026-01-01T00:00:00Z", superseded_by: "B", entry: { summary: "old chain" } },
      { id: "B", timestamp: "2026-01-02T00:00:00Z", superseded_by: "C", entry: { summary: "middle chain" } },
      { id: "C", timestamp: "2026-01-03T00:00:00Z", entry: { summary: "tail chain" } },
      { id: "long", timestamp: "2026-01-04T00:00:00Z", entry: { summary: "x".repeat(3000) } },
    ]);
    await rebuild(root);
    const { retrieve, renderRelevantPriorExpertise, estimateTokens } = await import("../lib/memory-retrieve.ts");
    const results = await retrieve({ task: "chain", agent: "orchestrator", repoId: "gh/a/repo", k: 2, maxTokens: 512 });
    expect(results.map((r: any) => r.id)).toContain("C");
    expect(results.map((r: any) => r.id)).not.toContain("A"); expect(results.map((r: any) => r.id)).not.toContain("B");
    expect(results.length).toBeLessThanOrEqual(2);
    expect(estimateTokens(renderRelevantPriorExpertise(results, 512))).toBeLessThanOrEqual(512);
  });

  it("serves stable snapshots during concurrent rebuilds", async () => {
    const root = path.join(tmpHome, "expertise");
    writeLog(root, "gh/a/repo", "orchestrator", [{ id: "a", timestamp: "2026-01-01T00:00:00Z", entry: { summary: "first" } }]);
    const first = await rebuild(root);
    const held = first.rows.map(r => r.id).join(",");
    writeLog(root, "gh/a/repo", "orchestrator", [{ id: "b", timestamp: "2026-01-02T00:00:00Z", entry: { summary: "second" } }]);
    await Promise.all([rebuild(root), rebuild(root)]);
    expect(held).toBe("a");
  });
});
