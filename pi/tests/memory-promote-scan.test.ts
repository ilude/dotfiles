import { describe, expect, it } from "vitest";
import type { MemoryRow } from "../lib/memory-index";
import {
  cluster,
  dedupePerRepo,
  repoSpan,
  medoid,
  qualifies,
  formatCandidates,
  type Cluster,
} from "../lib/memory-promote";
import { chainTail } from "../lib/memory-retrieve";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function makeRow(overrides: Partial<MemoryRow> & { embedding: Float32Array }): MemoryRow {
  _seq += 1;
  return {
    id: `row-${_seq}`,
    jsonl_path: "test.jsonl",
    jsonl_offset: 0,
    line: _seq,
    ts: `2026-01-0${(_seq % 9) + 1}T00:00:00Z`,
    agent: "orchestrator",
    repo_id: "gh/a/repo",
    kind: "observation",
    text: "test text",
    meta: {},
    ...overrides,
  };
}

/** 8-dim unit vector along axis i (normalized). */
function axis(i: number, dim = 8): Float32Array {
  const v = new Float32Array(dim);
  v[i] = 1;
  return v;
}

/** Near-duplicate of axis(i) -- slightly perturbed but still > 0.85 cosine. */
function near(i: number, dim = 8, noise = 0.1): Float32Array {
  const v = new Float32Array(dim);
  v[i] = 1;
  v[(i + 1) % dim] = noise;
  const norm = Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));
  for (let j = 0; j < dim; j++) v[j] /= norm;
  return v;
}

// ---------------------------------------------------------------------------
// 1. Duplicate claim across 3 repos emits exactly one candidate
// ---------------------------------------------------------------------------
describe("cross-repo clustering -- basic", () => {
  it("duplicate claim across 3 repos emits exactly one candidate", () => {
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(0), repo_id: "gh/a/repo", id: "a1" }),
      makeRow({ embedding: near(0), repo_id: "gh/b/repo", id: "b1" }),
      makeRow({ embedding: near(0), repo_id: "gh/c/repo", id: "c1" }),
    ];
    const clusters = cluster(rows).filter(c => qualifies(c));
    expect(clusters).toHaveLength(1);
  });

  it("two near-duplicates in repo A plus one each in B and C spans 3 repos, not 4", () => {
    // Two rows with the same embedding in repo A -- these are near-duplicates.
    // After dedup they count as 1 repo, so total span = 3.
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(0), repo_id: "gh/a/repo", id: "a1" }),
      makeRow({ embedding: near(0), repo_id: "gh/a/repo", id: "a2" }),
      makeRow({ embedding: near(0), repo_id: "gh/b/repo", id: "b1" }),
      makeRow({ embedding: near(0), repo_id: "gh/c/repo", id: "c1" }),
    ];
    const clusters = cluster(rows).filter(c => qualifies(c));
    expect(clusters).toHaveLength(1);
    const deduped = dedupePerRepo(clusters[0]);
    expect(repoSpan(deduped).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Single-repo and two-repo recurrences do not qualify
// ---------------------------------------------------------------------------
describe("cross-repo clustering -- non-qualifying", () => {
  it("single-repo recurrence with 3 entries does not emit a candidate", () => {
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(1), repo_id: "gh/a/repo", id: "a1" }),
      makeRow({ embedding: near(1), repo_id: "gh/a/repo", id: "a2" }),
      makeRow({ embedding: near(1), repo_id: "gh/a/repo", id: "a3" }),
    ];
    const candidates = cluster(rows).filter(c => qualifies(c));
    expect(candidates).toHaveLength(0);
  });

  it("two-repo recurrence does not emit a candidate", () => {
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(2), repo_id: "gh/a/repo", id: "a1" }),
      makeRow({ embedding: near(2), repo_id: "gh/b/repo", id: "b1" }),
    ];
    const candidates = cluster(rows).filter(c => qualifies(c));
    expect(candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Policy rows are excluded from inputs
// ---------------------------------------------------------------------------
describe("policy row exclusion", () => {
  it("kind=policy rows are excluded before clustering", () => {
    // Three repos but one row is policy -- should NOT cluster as qualifying after exclusion.
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(3), repo_id: "gh/a/repo", id: "a1", kind: "observation" }),
      makeRow({ embedding: near(3), repo_id: "gh/b/repo", id: "b1", kind: "policy" }),
      makeRow({ embedding: near(3), repo_id: "gh/c/repo", id: "c1", kind: "observation" }),
    ];
    const eligible = rows.filter(r => r.kind !== "policy");
    const candidates = cluster(eligible).filter(c => qualifies(c));
    expect(candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Superseded chain collapse
// ---------------------------------------------------------------------------
describe("chain tail collapse", () => {
  it("superseded rows collapse to chain-tail before clustering", () => {
    // Chain A -> B -> C in repo A, plus one each in B and C repos.
    // Only C is the tail; A and B are superseded.
    // After chainTail, only C from gh/a/repo participates.
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(4), repo_id: "gh/a/repo", id: "A", superseded_by: "B", ts: "2026-01-01T00:00:00Z" }),
      makeRow({ embedding: near(4), repo_id: "gh/a/repo", id: "B", superseded_by: "C", ts: "2026-01-02T00:00:00Z" }),
      makeRow({ embedding: near(4), repo_id: "gh/a/repo", id: "C", ts: "2026-01-03T00:00:00Z" }),
      makeRow({ embedding: near(4), repo_id: "gh/b/repo", id: "b1", ts: "2026-01-04T00:00:00Z" }),
      makeRow({ embedding: near(4), repo_id: "gh/c/repo", id: "c1", ts: "2026-01-05T00:00:00Z" }),
    ];
    const tailed = chainTail(rows);
    // A and B must be gone.
    const ids = tailed.map(r => r.id);
    expect(ids).not.toContain("A");
    expect(ids).not.toContain("B");
    expect(ids).toContain("C");

    const candidates = cluster(tailed).filter(c => qualifies(c));
    // C + b1 + c1 span 3 repos -- exactly one candidate.
    expect(candidates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Medoid selection
// ---------------------------------------------------------------------------
describe("medoid selection", () => {
  it("row closest to all others is selected as canonical", () => {
    // Three rows: A and C are orthogonal; B is close to both.
    // B should have highest mean cosine to the other two.
    const a = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const c = new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]);
    // B has components along both A and C axes.
    const bRaw = new Float32Array([0.9, 0.9, 0, 0, 0, 0, 0, 0]);
    const bNorm = Math.sqrt(bRaw.reduce((s, x) => s + x * x, 0));
    const b = bRaw.map(x => x / bNorm) as unknown as Float32Array;

    const rowA = makeRow({ embedding: a, repo_id: "gh/a/repo", id: "mA", ts: "2026-01-01T00:00:00Z", text: "A text" });
    const rowB = makeRow({ embedding: b, repo_id: "gh/b/repo", id: "mB", ts: "2026-01-02T00:00:00Z", text: "B text" });
    const rowC = makeRow({ embedding: c, repo_id: "gh/c/repo", id: "mC", ts: "2026-01-03T00:00:00Z", text: "C text" });

    const c1: Cluster = { rows: [rowA, rowB, rowC] };
    const m = medoid(c1);
    expect(m.id).toBe("mB");
  });

  it("tiebreaks medoid selection by earliest ts", () => {
    // All rows have identical embeddings -- mean cosine ties -- earliest ts wins.
    const v = axis(5);
    const r1 = makeRow({ embedding: v, id: "t1", ts: "2026-03-01T00:00:00Z", repo_id: "gh/a/repo" });
    const r2 = makeRow({ embedding: v, id: "t2", ts: "2026-01-01T00:00:00Z", repo_id: "gh/b/repo" });
    const r3 = makeRow({ embedding: v, id: "t3", ts: "2026-02-01T00:00:00Z", repo_id: "gh/c/repo" });
    const m = medoid({ rows: [r1, r2, r3] });
    expect(m.id).toBe("t2");
  });
});

// ---------------------------------------------------------------------------
// 6. formatCandidates output format
// ---------------------------------------------------------------------------
describe("formatCandidates output", () => {
  it("qualifying cluster produces cluster_id, canonical text, contributing ids, spanning repos", () => {
    const rows: MemoryRow[] = [
      makeRow({ embedding: near(6), repo_id: "gh/a/repo", id: "qa1", text: "shared pattern A" }),
      makeRow({ embedding: near(6), repo_id: "gh/b/repo", id: "qb1", text: "shared pattern B" }),
      makeRow({ embedding: near(6), repo_id: "gh/c/repo", id: "qc1", text: "shared pattern C" }),
    ];
    const clusters = cluster(rows);
    const output = formatCandidates(clusters, "2026-01-01T00:00:00Z", rows.length);
    expect(output).toContain("## Candidate");
    expect(output).toContain("Canonical text:");
    expect(output).toContain("Spanning repos");
    expect(output).toContain("Contributing entry ids:");
    // All three ids must appear.
    expect(output).toContain("qa1");
    expect(output).toContain("qb1");
    expect(output).toContain("qc1");
  });
});

// ---------------------------------------------------------------------------
// 7. dedupePerRepo keeps earliest ts per repo
// ---------------------------------------------------------------------------
describe("dedupePerRepo", () => {
  it("keeps only the earliest row per repo_id", () => {
    const rows: MemoryRow[] = [
      makeRow({ embedding: axis(0), repo_id: "gh/a/repo", id: "early", ts: "2026-01-01T00:00:00Z" }),
      makeRow({ embedding: axis(0), repo_id: "gh/a/repo", id: "late", ts: "2026-06-01T00:00:00Z" }),
      makeRow({ embedding: axis(0), repo_id: "gh/b/repo", id: "b1", ts: "2026-01-01T00:00:00Z" }),
    ];
    const deduped = dedupePerRepo({ rows });
    const ids = deduped.rows.map(r => r.id);
    expect(ids).toContain("early");
    expect(ids).not.toContain("late");
    expect(ids).toContain("b1");
    expect(deduped.rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 8. Unrelated rows do not form clusters
// ---------------------------------------------------------------------------
describe("unrelated rows", () => {
  it("orthogonal embeddings across repos do not cluster", () => {
    const rows: MemoryRow[] = [
      makeRow({ embedding: axis(0), repo_id: "gh/a/repo", id: "u1" }),
      makeRow({ embedding: axis(1), repo_id: "gh/b/repo", id: "u2" }),
      makeRow({ embedding: axis(2), repo_id: "gh/c/repo", id: "u3" }),
    ];
    const clusters = cluster(rows).filter(c => qualifies(c));
    expect(clusters).toHaveLength(0);
  });
});
