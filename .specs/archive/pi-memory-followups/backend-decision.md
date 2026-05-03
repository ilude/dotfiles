---
date: 2026-05-01
status: decided
---

# Pi Expertise Memory Backend Decision

**Recommendation: Stay in-memory.** Measured retrieval p99 is 5.6 ms against a 100 ms threshold, and the active row count is 47 against a 2000-row threshold. Neither trigger condition for a backend-specific plan is met. The current placeholder embedder is SHA256-hash-based (not semantic), which means measured latency reflects the actual production code path today. A real semantic embedder (e.g., bge-small-en-v1.5 at ~33 MB) will add per-query inference cost, but even a 10x increase from the current 5.6 ms p99 leaves a 43 ms margin before the 100 ms threshold is breached. Backend work is deferred until measured data crosses a threshold or graph traversal becomes a first-class requirement.

---

## Current backend snapshot

| Metric | Value | Source |
|---|---|---|
| Active rows | 47 | `bun pi/scripts/memory-stats.ts` |
| Index file size | 115 KB | `ls -la ~/.pi/agent/index/memory-index.json` |
| Rebuild p50 (3 runs warm) | 1.05 s | `time bun pi/scripts/memory-rebuild.ts` (3 runs: 1.015 s, 0.975 s, 1.157 s) |
| Retrieval p50 | 0.913 ms | benchmark script (100 samples, 4 warm runs x 25 queries) |
| Retrieval p95 | 1.707 ms | benchmark script |
| Retrieval p99 | 5.579 ms | benchmark script |
| Retrieval min | 0.761 ms | benchmark script |
| Retrieval max | 9.117 ms | benchmark script |
| Embedder | placeholder 384-dim (SHA1 hash-based, no model download) | `pi/lib/memory-index.ts` `MODEL_ID = "local-placeholder-384"` |
| Platform | Windows 11 / Bun runtime | -- |

---

## Decision thresholds (from plan)

Verbatim from `.specs/pi-memory-followups/plan.md`:

- Stay in-memory if active rows `<2000` AND retrieval p99 `<100ms`.
- Open backend-specific plan if active rows `>=2000`, retrieval p99 `>=100ms`, OR graph traversal queries become a first-class requirement.
- Prefer Kuzu for graph-native traversal, DuckDB+DuckPGQ for SQL-first analytics over node/edge tables, DuckDB+vss for vector-only scale, and Graphify-style files for architecture orientation.

---

## Candidate comparison

| Candidate | Best fit when | Pros | Cons | Migration cost (LOC est) | Native dep risk on Windows |
|---|---|---|---|---|---|
| **Stay in-memory** | rows < 2000, p99 < 100 ms, no graph traversal needed | Zero deps; rebuild is fast; pure TS; deterministic; already passes eval | Does not scale past ~2000 rows; HNSW locality not available; no persistent index | 0 LOC (current) | None |
| **DuckDB+vss** | rows > 2000 and vector-only similarity is the bottleneck; HNSW recall improvement matters | HNSW ANN queries; SQL interface; well-documented INSTALL vss; pre-built binaries for Windows amd64 | HNSW persistence requires `hnsw_enable_experimental_persistence = true`; WAL recovery unimplemented (crash risk); index must fit in RAM; only FLOAT32 supported; native DuckDB dep | 300-500 LOC + DuckDB native dep; new `@duckdb/node-api` client; embedding pre-computation TS bridge | Medium -- pre-built binaries exist but WAL crash risk is a production concern |
| **DuckDB+DuckPGQ** | node/edge tables and SQL analytics over the graph are needed; SQL-first team | SQL/PGQ standard; community extension; Windows amd64 binaries available; stays in DuckDB ecosystem | Explicitly labeled "research project and work in progress" (v1.2.2); not production-ready; no guarantees on breaking changes; graph query syntax coverage is partial | 400-600 LOC + DuckDB native dep + DuckPGQ community ext; schema migration to edge/node tables | Medium -- binaries available; WIP flag is a real risk for production tooling |
| **Kuzu** | graph-native traversal (multi-hop paths, reachability) is a first-class query pattern | Embedded graph DB with Cypher; vectorized engine; columnar storage; had Node.js sync API and TypeScript defs before archive | Repo archived October 10, 2025 -- read-only, no future patches; last release v0.11.3; no security or bug fixes after archive date | 500-800 LOC; schema migration to Kuzu node/rel tables; Cypher query layer | High -- archived repo; Windows native build support unverified post-archive |
| **Graphify-style (graph.json / NetworkX file)** | architecture orientation -- exploring code/knowledge structure offline; not a runtime retrieval path | No deps; portable JSON or JSONL output; visualizable in Gephi/NetworkX/D3; no runtime risk | Not a query engine; does not replace retrieval; read-back requires parsing the graph file manually; no indexing | 100-200 LOC for export script; retrieval path unchanged | None |

---

## Recommendation

**Stay in-memory.**

Measured numbers vs. thresholds:

| Threshold | Limit | Measured | Margin |
|---|---|---|---|
| Active rows | < 2000 | 47 | 1953 rows headroom (97.6% unused) |
| Retrieval p99 | < 100 ms | 5.579 ms | 94.4 ms margin (~17x under limit) |

Both thresholds are comfortably clear. The placeholder embedder (hash-based) is already the production code path; even if a real semantic embedder adds 10x p99 overhead the result (~56 ms) stays under 100 ms. No graph traversal queries exist today.

Additionally:

- The Kuzu repo was archived on 2025-10-10 and receives no patches -- disqualifying it as a new dependency.
- DuckPGQ is self-described as a "research project and work in progress" -- not suitable for production tooling.
- DuckDB+vss requires an experimental persistence flag with unimplemented WAL recovery -- an unacceptable crash-corruption risk for an index that is otherwise rebuildable but whose corruption would silently degrade retrieval.
- Graphify-style export is an analysis/visualization aid, not a retrieval backend.

**Trigger conditions for revisiting** (check at next significant corpus growth):

1. Active rows reach 500 -- measure rebuild time and p99 under load.
2. Active rows reach 2000 -- open a DuckDB+vss backend plan if p99 is still within threshold; otherwise open it immediately.
3. Retrieval p99 reaches 100 ms at any row count -- open a DuckDB+vss backend plan.
4. A real semantic embedder (bge-small-en-v1.5 or equivalent) is adopted -- re-measure p99 immediately after adoption; embedder inference dominates at small corpus sizes.
5. Graph traversal queries (multi-hop, reachability, path enumeration) become a first-class feature request -- open a Kuzu or DuckPGQ plan contingent on their maintenance status at that time.

---

## Commands used

```bash
# Active rows
cd C:/Users/mglenn/.dotfiles-worktrees/pi-memory-followups
bun pi/scripts/memory-stats.ts

# Index file size (PowerShell)
(Get-Item "$HOME/.pi/agent/index/memory-index.json").Length

# Rebuild timing (3 warm runs, PowerShell)
Measure-Command { bun pi/scripts/memory-rebuild.ts } | Select-Object TotalSeconds
# Run 1: 1.015 s  Run 2: 0.975 s  Run 3: 1.157 s  Mean: 1.049 s

# Retrieval latency benchmark
bun .specs/pi-memory-followups/spikes/retrieval-bench.ts
# Output: p50=0.913 ms  p95=1.707 ms  p99=5.579 ms  (100 samples)
```

---

## Sources cited

- DuckDB vss extension documentation (persistence requirements, HNSW syntax, Windows support not explicitly confirmed, FLOAT32-only): https://duckdb.org/docs/current/core_extensions/vss.html
- DuckPGQ GitHub repository (WIP label, Windows amd64 binaries, community extension install): https://github.com/cwida/duckpgq-extension
- Kuzu GitHub releases (archived 2025-10-10, last release v0.11.3, Node.js sync API available before archive): https://github.com/kuzudb/kuzu/releases
- Prior MVP plan (Phase 2 DuckDB+vss deferred threshold >2000 rows OR p99 > 100 ms, LOC budget for Phase 1 under 200 TS lines): `.specs/archive/pi-memory-retrieval/plan.md` lines 80-91
- Embedder decision spike (placeholder SHA256 artifact; real embedder ~33 MB bge-small-en-v1.5 pending approval): `.specs/archive/pi-memory-retrieval/embedder.md`

**Unverified claims:**

- DuckDB+vss Windows native build status: the vss documentation page does not explicitly list Windows as supported or unsupported; pre-built community binaries exist for Windows amd64 for DuckPGQ, but this was not verified for the core vss extension beyond what the docs page states.
- Kuzu Windows native build status post-archive: the archived repo lists Windows releases up to v0.11.3 but post-archive binary availability and build toolchain on Windows 11 was not verified in this session.
- DuckDB+vss inference cost with a real embedder: the 10x overhead estimate above is a rough bound, not a measured value. Measure after any real embedder adoption.
