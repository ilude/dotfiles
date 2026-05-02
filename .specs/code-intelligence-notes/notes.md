---
created: 2026-05-02
status: notes
---

# Code Intelligence Notes

## Purpose

Capture ideas around SCIP and broader language-aware code intelligence for Pi. This is intentionally separate from an implementation plan so future work can explore a more generic language solution instead of prematurely adopting one index format.

## Trigger

During review of Pi ecosystem repos, `qualisero/pi-agent-scip` surfaced as a possible way to add semantic code navigation to Pi. The review recommendation was: useful as an opt-in pilot, but avoid making SCIP a core dependency until we understand the generic abstraction we want.

## Candidate Sources

- `https://github.com/qualisero/pi-agent-scip` — SCIP code intelligence tools for Pi agent.
- `https://github.com/safishamsi/graphify` — Graphify knowledge-graph skill for code, docs, SQL, YAML, PDFs, images, video/audio, and design rationale.
- Related general concept: use prebuilt indexes/graphs to answer navigation and architecture questions better than grep alone.

## Current Repo Baseline

Current Pi setup mostly uses:

- `read` for exact files
- `bash` / `grep` / `rg` for lexical search
- subagents for parallel exploration
- TypeScript/Python validation commands for feedback
- no persistent semantic symbol index

This is simple and robust, but weak for:

- finding definitions/references across large repos
- understanding call graphs
- language-aware rename/refactor planning
- cross-file impact analysis
- navigating unfamiliar codebases quickly

## SCIP Notes

SCIP can provide language-aware symbol graphs when an index exists. Potential benefits:

- jump to definition
- find references
- list symbols by file/package
- answer “what calls this?” more directly
- reduce expensive broad grep/read exploration

Concerns:

- index generation is language/toolchain-specific
- adds dependencies and setup friction
- may be overkill for small dotfiles tasks
- stale indexes can mislead agents if freshness is unclear
- not every language/repo has a good SCIP indexer available

## Graphify Notes

Graphify is aligned with this effort but sits at a different layer than SCIP.

SCIP is a precise symbol/navigation index. Graphify is a broader architecture and knowledge graph. It combines deterministic AST extraction, LLM concept extraction, document/media processing, NetworkX graph merging, Leiden community detection, and provenance labels such as `EXTRACTED`, `INFERRED`, and `AMBIGUOUS`.

Graphify is likely more immediately useful for this dotfiles repo because the repo is mixed-content:

- shell and PowerShell scripts
- Python tests/hooks
- TypeScript Pi extensions
- markdown workflow skills and specs
- YAML config
- submodules and docs
- local research artifacts and notes

SCIP is strongest for precise code-symbol questions. Graphify is stronger for repo-level orientation and cross-domain questions such as:

- What are the major subsystems?
- What connects Pi extensions, workflow skills, AGENTS.md rules, and install scripts?
- What architectural rationale is spread across docs, comments, and plans?
- Which “god nodes” or communities should an agent read before touching a subsystem?

Graphify outputs of interest:

```text
graphify-out/GRAPH_REPORT.md
graphify-out/graph.json
graphify-out/graph.html
```

Potential `.graphifyignore` entries before a pilot:

```text
.git/
dotbot/
menos/
plugins/
pi/history/
pi/multi-team/expertise/
yt/
node_modules/
```

Possible pilot command:

```bash
uv tool install graphifyy
graphify install --platform pi
```

If useful, do not wire Graphify directly into all workflows at first. Prefer an opt-in `/code-intel graph` wrapper or guidance that reads `graphify-out/GRAPH_REPORT.md` when present.

## Generic Language-Intelligence Direction

Instead of hard-coding SCIP or Graphify as the only solution, consider a provider abstraction:

```text
code_intel.status
code_intel.symbols(file_or_query)
code_intel.definition(symbol_or_location)
code_intel.references(symbol_or_location)
code_intel.diagnostics(scope)
code_intel.callers(symbol_or_location)
code_intel.graph_report()
code_intel.graph_query(question)
code_intel.graph_path(source, target)
```

Possible backends:

- SCIP index, when available, for precise symbol/reference navigation
- Graphify graph, when available, for architecture/rationale/community navigation
- Kùzu, as the strongest embedded graph database candidate if graph querying becomes central
- DuckDB + DuckPGQ, if we want SQL-first analytics over node/edge tables with SQL/PGQ graph syntax
- LSP server, on-demand
- tree-sitter tags for lightweight local indexing
- language-specific CLI tools such as `tsserver`, `pyright`, `ruff`, `go list`, `cargo metadata`
- fallback lexical `rg`

The agent-facing contract should expose freshness and confidence:

```text
backend: scip | graphify | lsp | tree-sitter | lexical
freshness: fresh | stale | missing | unknown
scope: repo | package | file | graph | community
confidence: high | medium | low
provenance: extracted | inferred | ambiguous | unknown
```

## Embedded Graph Storage Candidates

If the code-intelligence layer needs a local persistent graph store rather than only files like `graph.json`, two candidates stand out:

1. **Kùzu** — best embedded graph DB candidate. It is graph-native, runs in-process, supports Cypher, and fits local knowledge-graph use cases better than a server-backed graph database.
2. **DuckDB + DuckPGQ** — good if we want SQL-first analytics and already store nodes/edges as relational tables. DuckPGQ adds SQL/PGQ property graph syntax on top of DuckDB tables, but it is a community extension and should be treated as less graph-native than Kùzu.

Current leaning: start with simple file/JSON or table-backed prototypes, then use Kùzu if graph traversal becomes central. Use DuckDB + DuckPGQ when the graph is one analytical view over tabular run receipts, code-intel facts, or pipeline ledgers.

## Potential Pi Integration

Start as opt-in commands/tools, not default workflow behavior:

- `/code-intel status`
- `/code-intel index` or `/code-intel refresh`
- tool: `code_symbols`
- tool: `code_definition`
- tool: `code_references`
- tool: `code_diagnostics`
- tool: `code_graph_report`
- tool: `code_graph_query`

Use in workflows only when available:

- `/do-it` project scan can ask `code-intel status` before choosing lexical vs semantic exploration.
- `/review-it` can use references/callers for impact checks.
- `/plan-it` can read a graph report for architecture orientation when present.
- validation gates can run diagnostics on demand.

## Open Questions

- Should the first backend be Graphify, SCIP, LSP, or tree-sitter?
- Should Graphify be piloted on this dotfiles repo before symbol-only indexing?
- What languages and content types matter most for this dotfiles repo and client repos?
- How do we mark indexes stale after file edits?
- Should indexing be per repo, per worktree, or global cache?
- How do we avoid leaking private code into generated artifacts?
- Can this be packaged as a Pi extension without burdening machines that lack language toolchains?

## Current Recommendation

Do not adopt SCIP as a core dependency yet. Plan a small opt-in code-intelligence layer with a backend interface. For this mixed-content dotfiles repo, pilot Graphify first for architecture orientation and keep SCIP as a future precise-symbol backend, likely starting with TypeScript-heavy Pi extensions.
