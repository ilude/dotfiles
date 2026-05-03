import * as crypto from "node:crypto";
import { cosine } from "./memory-retrieve";
import type { MemoryRow } from "./memory-index";

export interface Cluster { rows: MemoryRow[] }

/**
 * Greedy single-link agglomerative clustering on cosine similarity.
 * Two existing clusters merge when any cross-cluster pair has cosine >= threshold.
 * Returns only clusters with >= 2 members; singletons are dropped.
 */
export function cluster(rows: MemoryRow[], threshold = 0.85): Cluster[] {
  // Start with one cluster per row.
  const clusters: MemoryRow[][] = rows.map(r => [r]);

  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Single-link: any pair across i and j with cosine >= threshold.
        for (const a of clusters[i]) {
          for (const b of clusters[j]) {
            if (cosine(a.embedding, b.embedding) >= threshold) {
              // Merge j into i.
              clusters[i] = clusters[i].concat(clusters[j]);
              clusters.splice(j, 1);
              merged = true;
              break outer;
            }
          }
        }
      }
    }
  }

  return clusters.filter(c => c.length >= 2).map(c => ({ rows: c }));
}

/**
 * Within a cluster, keep at most one row per repo_id -- the earliest by ts.
 */
export function dedupePerRepo(c: Cluster): Cluster {
  const byRepo = new Map<string, MemoryRow>();
  for (const row of c.rows) {
    const existing = byRepo.get(row.repo_id);
    if (!existing || String(row.ts) < String(existing.ts)) {
      byRepo.set(row.repo_id, row);
    }
  }
  return { rows: Array.from(byRepo.values()) };
}

/** Distinct repo_id values in the cluster. */
export function repoSpan(c: Cluster): Set<string> {
  return new Set(c.rows.map(r => r.repo_id));
}

/**
 * Row with highest mean cosine similarity to all others.
 * Tiebreak: earliest ts (lexicographic ISO string comparison).
 */
export function medoid(c: Cluster): MemoryRow {
  const { rows } = c;
  if (rows.length === 1) return rows[0];

  let bestRow = rows[0];
  let bestScore = -Infinity;

  for (const candidate of rows) {
    let sum = 0;
    for (const other of rows) {
      if (other !== candidate) sum += cosine(candidate.embedding, other.embedding);
    }
    const mean = sum / (rows.length - 1);
    if (
      mean > bestScore ||
      (mean === bestScore && String(candidate.ts) < String(bestRow.ts))
    ) {
      bestScore = mean;
      bestRow = candidate;
    }
  }

  return bestRow;
}

/** A cluster qualifies when its post-dedup repo span is >= minRepos. */
export function qualifies(c: Cluster, minRepos = 3): boolean {
  return repoSpan(dedupePerRepo(c)).size >= minRepos;
}

function clusterId(c: Cluster): string {
  const sorted = [...c.rows.map(r => r.id)].sort();
  return crypto.createHash("sha1").update(sorted.join("\0")).digest("hex").slice(0, 12);
}

/** Produce the full Markdown body including the LOCAL PRIVATE header. */
export function formatCandidates(clusters: Cluster[], scanIso: string, activeRows: number): string {
  const lines: string[] = [];
  lines.push("> LOCAL PRIVATE -- DO NOT COMMIT WITHOUT REVIEW");
  lines.push("");
  lines.push("# Promotion Candidates");
  lines.push("");
  lines.push(`Scan time: ${scanIso}  Active rows scanned: ${activeRows}`);
  lines.push("");

  const qualifying = clusters.filter(c => qualifies(c));

  if (qualifying.length === 0) {
    lines.push("## No qualifying candidates");
    lines.push("");
    lines.push(`No clusters span >= 3 distinct repos. Scan time: ${scanIso}. Active rows: ${activeRows}.`);
    return lines.join("\n");
  }

  for (const c of qualifying) {
    const deduped = dedupePerRepo(c);
    const repos = repoSpan(deduped);
    const canonical = medoid(deduped);
    const cid = clusterId(c);

    lines.push(`## Candidate ${cid}`);
    lines.push("");
    lines.push(`**Canonical text:** ${canonical.text}`);
    lines.push("");
    lines.push(`**Spanning repos (${repos.size}):** ${[...repos].sort().join(", ")}`);
    lines.push("");
    lines.push(`**Contributing entry ids:** ${c.rows.map(r => r.id).sort().join(", ")}`);
    lines.push("");
  }

  return lines.join("\n");
}
