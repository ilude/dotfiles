---
created: 2026-05-02
status: draft
completed:
---

# Plan: Pi Expertise Memory v2 -- Retrieval over JSONL

## Context & Motivation

Pi's existing expertise system stores per-agent JSONL append-only logs plus a derived
`mental-model.json` snapshot and `mental-model.state.json` state file, layered as
global + project-local under `pi/multi-team/expertise/{repo-id}/`. The snapshot is
doing two jobs that should be split:

1. **Token-bounded recall** -- compress N log entries into a digest the agent can load
   on startup without replaying the log.
2. **Stable identity / config** -- structured fields the agent treats as canonical.

Five parallel research agents (academic memory architectures, production thought
leaders, procedural-vs-episodic split, eval metrics, KISS implementation patterns)
converged on the same architecture pattern, here called the "two hats" split:

- **Hat 1 -- procedural memory:** stable rules pinned to the system prompt, never
  retrieved. Anthropic's `CLAUDE.md` + `MEMORY.md`, OpenAI's saved-memories, LangMem's
  procedural tier (LangMem [conceptual guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)).
- **Hat 2 -- semantic + episodic memory:** retrieved by similarity to the current
  task. Vector store, append-only source of truth.

No paper found shows pure unified retrieval beating the two-tier baseline on
benchmarks that include adversarial rule-violation cases (CoALA arXiv:2309.02427,
Constitutional AI arXiv:2212.08073, mem0 production failure mode in
[Issue #4573](https://github.com/mem0ai/mem0/issues/4573)). Voyager (arXiv:2305.16291)
is the only credible counter-example, and only because each entry is executable
and self-verifiable. JSONL learnings are not.

This plan replaces the snapshot with vector retrieval over the existing JSONL logs
using DuckDB + the `vss` extension, adds cross-repo recall, adds a
frequency-threshold promotion mechanism (project-specific -- candidate global policy),
and ships an eval harness that measures **Memory Lift** (success rate with memory
on minus success rate with memory off) on a stratified task set. JSONL stays the
source of truth; the DuckDB file is a derived index, deletable and rebuildable.

## Constraints

- Platform: Windows 11 (primary), with WSL/Linux mirroring required by repo policy.
- Shell: PowerShell on Windows, bash on Linux. Use forward slashes in paths.
- Language: TypeScript + Bun runtime. Tests use vitest in `pi/tests/`.
- Procedural memory **must never** be auto-promoted. Frequency detector emits
  candidates to a markdown file; humans review and move into procedural tier.
- JSONL logs are authoritative and append-only. Snapshots are deletable; logs are not.
- Embedding model + chunker + schema are fingerprinted; mismatch triggers full rebuild
  (no schema migrations; index is throw-away).
- No per-write LLM judge (mem0's documented failure mode -- see Context).
- LOC budget: 250-350 lines TypeScript for the index + retrieval + rebuild path.
- DuckDB `vss` HNSW persistence requires
  `SET hnsw_enable_experimental_persistence = true` and the index must fit in RAM.
  Acceptable for sub-100K-row corpus.
- No DuckDB UDFs in `@duckdb/node-api` (Neo client) -- pre-compute embeddings in TS
  and bind as `FLOAT[384]` parameters.
- Eval must be stratified: control (no memory needed), positive (needs a stored
  fact), negative (memory should not fire). Without negative slice, retrieval
  precision regressions are invisible.
- Snapshot deletion only after the eval shows non-negative Memory Lift vs. baseline.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep snapshots; add retrieval as supplement | No deletion risk; preserves config fields | Two systems to maintain; layered merge code stays; doesn't solve token bloat | Rejected -- doesn't simplify |
| Pure unified retrieval (one store, no procedural tier) | One pipeline; KISS at the schema level | No literature support for adversarial rule-following; mem0 Issue #4573 documents production failure | Rejected -- evidence against |
| Knowledge graph (Zep/Graphiti or Cognee) | Bi-temporal contradictions; multi-hop reasoning | 14+ retrieval modes; heavy infra; overkill at our scale | Rejected -- violates KISS |
| Per-write LLM judge (mem0 ADD/UPDATE/DELETE/NOOP) | Coherent store; in-line dedup | Per-write LLM cost; documented 97.8% junk in 10K-entry production audit | Rejected -- failure mode known |
| **Two-tier: procedural files + DuckDB+vss retrieval over JSONL** | Matches Anthropic/OpenAI/LangMem patterns; KISS; JSONL stays truth; rebuildable index | Requires audit of existing snapshots before deletion | **Selected** |

## Objective

When complete, pi has:

1. A DuckDB-backed retrieval index over all expertise JSONL logs across all repos,
   rebuildable from source via a single command.
2. A cross-repo retrieval API agents call at task start to surface top-K relevant
   episodic + semantic entries given a task seed query.
3. A frequency-threshold detector that emits global policy candidates to a
   human-reviewed markdown file when a claim recurs across N>=3 distinct repos
   with cosine similarity >= 0.85.
4. An eval harness with 30-50 stratified paired tasks that reports Memory Lift
   and cost-adjusted lift, runnable via `just eval-memory`.
5. The `mental-model.json` and `mental-model.state.json` snapshot machinery
   removed -- but only after the eval shows the retrieval system non-regresses.

## Project Context

- **Language**: TypeScript (Bun runtime).
- **Test command**: `cd pi/tests && bun vitest run` (also `just test` from `pi/`).
- **Lint command**: none detected at repo root; rely on TypeScript compiler via
  vitest type-check. Tasks define their own verification.
- **Existing extensions**: `pi/extensions/agent-chain.ts` is the integration point
  for agent-startup memory loading.
- **Existing storage**: `pi/multi-team/expertise/gh/{owner}/{repo}/` per repo,
  flat `pi/multi-team/expertise/` for global layer.

## Task Breakdown

| #  | Task | Files | Type | Model | Agent | Depends On |
|----|------|-------|------|-------|-------|------------|
| T1 | Audit existing mental-model.json fields; classify learned vs. config | 2-3 (read-only + 1 audit doc) | research | sonnet | Explore | -- |
| T2 | Build eval harness scaffold with stratified 30-50 task fixtures | 4-6 | feature | sonnet | builder | -- |
| T3 | Decide embedding model + bundle (transformers.js bge-small-en-v1.5 q8 vs. Ollama) | 1-2 | feature | sonnet | builder | -- |
| V1 | Validate wave 1 (audit complete, harness runs empty, embedder chosen) | -- | validation | sonnet | validator-heavy | T1, T2, T3 |
| T4 | Implement DuckDB index: schema, ingest from JSONL, rebuild command | 3-4 | feature | sonnet | builder | V1 |
| T5 | Implement retrieval API: similarity query with repo + recency filters | 2-3 | feature | sonnet | builder | V1 |
| T6 | Wire retrieval into agent startup via pi/extensions/agent-chain.ts | 1-2 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 (rebuild works, retrieval returns ranked results, agent loads) | -- | validation | sonnet | validator-heavy | T4, T5, T6 |
| T7 | Run baseline eval with snapshot system; record Memory Lift = 0 baseline numbers | 1 (eval results) | feature | sonnet | builder | V2 |
| T8 | Run eval with retrieval enabled; compute Memory Lift + cost ratio with bootstrap CI | 1 (eval results) | feature | sonnet | builder | V2 |
| V3 | Validate wave 3 (eval results recorded, CIs computed, regression decision made) | -- | validation | sonnet | validator-heavy | T7, T8 |
| T9 | Implement frequency-threshold promotion detector; emit policy-candidates.md | 2-3 | feature | sonnet | builder | V3 |
| T10 | Conditional snapshot deletion: only if V3 shows non-negative Memory Lift | 4-6 (deletes) | architecture | opus | builder-heavy | V3 |
| V4 | Validate wave 4 (promotion candidates appear, snapshot machinery cleanly removed if applicable) | -- | validation | sonnet | validator-heavy | T9, T10 |

## Execution Waves

### Wave 1 (parallel)

**T1: Audit mental-model.json fields** [sonnet] -- Explore
- Description: Read existing `pi/multi-team/expertise/gh/ilude/dotfiles/orchestrator-mental-model.json`
  and `backend-dev-mental-model.state.json`. For each top-level field, classify as
  **learned** (replaceable by retrieval) or **config** (must move to agent `.md`
  definition before snapshot deletion). Produce `.specs/pi-memory-retrieval/audit.md`
  with a field-by-field table including disposition.
- Files: read `pi/multi-team/expertise/gh/ilude/dotfiles/*-mental-model*.json`,
  read `pi/agents/*.md`. Write `.specs/pi-memory-retrieval/audit.md`.
- Acceptance Criteria:
  1. [ ] audit.md exists with one row per top-level field across both snapshots
     - Verify: `test -f .specs/pi-memory-retrieval/audit.md && grep -c '^|' .specs/pi-memory-retrieval/audit.md`
     - Pass: count >= number of fields in source JSON + header rows
     - Fail: file missing or rows < fields -- re-audit
  2. [ ] Every row has a disposition: learned, config, or unused
     - Verify: `grep -E 'learned|config|unused' .specs/pi-memory-retrieval/audit.md | wc -l`
     - Pass: matches row count
     - Fail: missing dispositions -- agent must classify all fields
  3. [ ] Config fields list cites a target agent `.md` file for relocation
     - Verify: `grep -A1 '| config' .specs/pi-memory-retrieval/audit.md | grep '\.md'`
     - Pass: each config field has a target file path
     - Fail: config field without target -- requires explicit destination

**T2: Eval harness scaffold** [sonnet] -- builder
- Description: Create `pi/tests/memory-eval/` with: a fixtures file holding 30-50
  stratified tasks (control / positive / negative -- ratio roughly 30/50/20), a
  runner that executes each task twice (memory_on, memory_off) against a fixed
  Pi agent invocation, scoring functions (deterministic: tests pass, file-diff
  match, exit code), bootstrap-CI utility for paired differences. Empty memory
  for now -- T8 fills it in. Add `just eval-memory` recipe.
- Files: `pi/tests/memory-eval/fixtures.json`, `pi/tests/memory-eval/runner.ts`,
  `pi/tests/memory-eval/score.ts`, `pi/tests/memory-eval/bootstrap.ts`,
  `pi/justfile` (add recipe).
- Acceptance Criteria:
  1. [ ] `just eval-memory` runs end to end with memory disabled and produces a
        results JSON file
     - Verify: `cd pi && just eval-memory && test -f tests/memory-eval/results-baseline.json`
     - Pass: file exists with `task_id`, `outcome`, `tokens` fields per task
     - Fail: missing file or fields -- check runner output
  2. [ ] Fixtures file contains >=30 tasks stratified across control/positive/negative
     - Verify: `cat pi/tests/memory-eval/fixtures.json | jq '[.tasks[].kind] | group_by(.) | map({kind: .[0], count: length})'`
     - Pass: three groups with control >= 9, positive >= 15, negative >= 6
     - Fail: missing strata -- add fixtures
  3. [ ] vitest unit tests cover scoring + bootstrap functions
     - Verify: `cd pi/tests && bun vitest run memory-eval`
     - Pass: green; >= 6 tests
     - Fail: red -- fix or add tests

**T3: Embedding model decision** [sonnet] -- builder
- Description: Spike both options to a temporary script: (a) transformers.js with
  `Xenova/bge-small-en-v1.5` at `dtype: 'q8'` (384-dim, ~33MB), and (b) Ollama
  embeddings via HTTP if Ollama is installed. Time the embed of 100 sample log
  entries on the user's machine. Pick the winner on cold-start latency + bundle
  size. Write the decision to `.specs/pi-memory-retrieval/embedder.md` and add the
  chosen lib as a `pi/extensions/` dep.
- Files: `.specs/pi-memory-retrieval/embedder.md`, possibly
  `pi/extensions/package.json` (if local) or root deps. Throwaway spike scripts in
  `.specs/pi-memory-retrieval/spikes/` may be deleted after.
- Acceptance Criteria:
  1. [ ] embedder.md states the choice with timing numbers
     - Verify: `grep -E 'choice|latency|MB' .specs/pi-memory-retrieval/embedder.md`
     - Pass: contains "choice:", a latency number with units, and a bundle size
     - Fail: pure prose -- include measured numbers
  2. [ ] Chosen embedder produces a 384-dim float vector on a sample sentence
     - Verify: spike script in `.specs/pi-memory-retrieval/spikes/embed-smoke.ts`
        prints `dim=384`
     - Pass: stdout contains `dim=384`
     - Fail: wrong dim or crash -- adjust model selection or version pin

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [sonnet] -- validator-heavy
- Blocked by: T1, T2, T3
- Checks:
  1. T1 audit.md exists, dispositions complete, every config field has a target
  2. T2 `just eval-memory` runs cleanly, fixtures stratified, vitest passes
  3. T3 embedder.md has measured numbers, smoke script outputs dim=384
  4. Cross-task: T2 fixtures and T3 embedder agree on text size assumptions
     (no fixture body exceeds the embedder's max input tokens)
- On failure: Create fix task, re-validate after fix.

### Wave 2 (parallel)

**T4: DuckDB index implementation** [sonnet] -- builder
- Blocked by: V1
- Description: Implement `pi/extensions/memory-index.ts`: schema creation (per
  research report), JSONL ingestion (walk
  `pi/multi-team/expertise/**/{agent}-expertise-log.jsonl`, embed each line with
  the chosen embedder, insert with `repo_id`, `agent`, `ts`, `kind`, `text`,
  `meta`, `embedding`, `superseded_by`), HNSW index creation with
  `hnsw_enable_experimental_persistence = true`, `metric = 'cosine'`. Fingerprint
  table (`memory_meta`) holds `model_id`, `dtype`, `chunker_v`, `schema_v`. CLI
  entrypoint: `pi memory rebuild`. Mismatched fingerprint -> drop + rebuild.
- Files: `pi/extensions/memory-index.ts`, `pi/scripts/memory-rebuild.ts`,
  `pi/justfile` (add `memory-rebuild` recipe).
- Acceptance Criteria:
  1. [ ] `just memory-rebuild` builds `~/.pi/agent/index/memory.duckdb` from existing JSONL
     - Verify: `cd pi && just memory-rebuild && test -f ~/.pi/agent/index/memory.duckdb`
     - Pass: file exists, size > 0
     - Fail: command crashes or empty file -- check ingest path glob and embedder
  2. [ ] Row count in `memory` table equals the line count of all source JSONL files
     - Verify: PowerShell or bash -- count JSONL lines, query DuckDB
       `SELECT count(*) FROM memory;`, assert equal
     - Pass: counts match
     - Fail: missing rows -- fix ingest; extra rows -- fix dedup or rebuild semantics
  3. [ ] Fingerprint mismatch (manually corrupt `model_id` in `memory_meta`)
        triggers full rebuild on next run
     - Verify: edit `memory_meta`, run rebuild, confirm log says "fingerprint
       mismatch -- rebuilding" and row count matches expected
     - Pass: rebuild log + correct row count
     - Fail: rebuild silently no-ops -- enforce mismatch check

**T5: Retrieval API** [sonnet] -- builder
- Blocked by: V1
- Description: Implement `pi/extensions/memory-retrieve.ts` exposing
  `retrieve({ task, agent, repoId, k, minSimilarity })`. SQL: filter by `agent`
  AND (`repo_id = $repoId` OR `repo_id = 'global'`), exclude superseded rows,
  ORDER BY `array_inner_product(embedding, embed($task)) DESC` -- but note T3:
  pre-compute `embed($task)` in TS first, bind as parameter. Return `{id, text,
  ts, repo_id, similarity}[]`. Recency tiebreaker via `ORDER BY similarity DESC,
  ts DESC`.
- Files: `pi/extensions/memory-retrieve.ts`, `pi/tests/memory-retrieve.test.ts`.
- Acceptance Criteria:
  1. [ ] Unit test: synthetic 10-entry corpus, query returns the entry with the
        most lexically similar text first
     - Verify: `cd pi/tests && bun vitest run memory-retrieve`
     - Pass: green
     - Fail: red -- check ORDER BY, embedding parameter binding
  2. [ ] Cross-repo query with `repoId = 'gh/ilude/dotfiles'` returns rows from
        that repo plus rows with `repo_id = 'global'`, none from other repos
     - Verify: vitest with seeded multi-repo fixture
     - Pass: row repo_ids subset of {target, global}
     - Fail: leak from other repos -- fix WHERE clause
  3. [ ] Superseded rows are excluded
     - Verify: vitest with one row whose `superseded_by` points to another;
        retrieval returns only the successor
     - Pass: superseded row absent
     - Fail: present -- add `superseded_by IS NULL` filter

**T6: Wire into agent startup** [sonnet] -- builder
- Blocked by: V1
- Description: Modify `pi/extensions/agent-chain.ts` to call the retrieval API at
  agent startup with the first user task as seed query. If no task yet (e.g.,
  warm shell), fall back to recency: top 20 entries for `(agent, repoId)`.
  Inject results into the agent's context as a clearly-labeled "Relevant prior
  expertise" block (Hat 2). Procedural memory (Hat 1, the existing CLAUDE.md /
  agent .md files) is unaffected.
- Files: `pi/extensions/agent-chain.ts`, `pi/tests/agent-chain.test.ts`.
- Acceptance Criteria:
  1. [ ] Agent receives a "Relevant prior expertise" block containing retrieved
        items when a task seed query is present
     - Verify: vitest with mocked retrieval returning 3 entries; assert block
        contains all 3 ids
     - Pass: green
     - Fail: red -- check injection point and template
  2. [ ] No-task warm start uses recency fallback, not similarity
     - Verify: vitest with no seed; assert SQL trace shows ORDER BY ts DESC
        without similarity
     - Pass: trace matches
     - Fail: similarity invoked -- branch on seed presence
  3. [ ] Procedural files (`CLAUDE.md`, agent `.md`) are still loaded into the
        prompt after the change
     - Verify: vitest snapshot of full prompt; assert procedural sections present
     - Pass: snapshot contains CLAUDE.md content
     - Fail: missing -- restore procedural injection path

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T4, T5, T6
- Checks:
  1. T4 rebuild produces an index whose row count matches JSONL lines
  2. T5 retrieval tests green; cross-repo + supersede filters verified
  3. T6 agent startup injects retrieval block AND retains procedural files
  4. Cross-task: a sample query through T6 returns rows that exist in the T4 index
  5. `cd pi/tests && bun vitest run` -- full test suite green
- On failure: Create fix task, re-validate after fix.

### Wave 3 (parallel)

**T7: Baseline eval (snapshot system)** [sonnet] -- builder
- Blocked by: V2
- Description: Run the T2 eval harness with the **existing** snapshot-based
  memory enabled (no retrieval). This is the baseline against which retrieval
  must non-regress. Record results to
  `.specs/pi-memory-retrieval/eval-baseline.json` -- per-task outcome, total tokens,
  wall-clock per task.
- Files: `.specs/pi-memory-retrieval/eval-baseline.json`, possibly a flag in the
  runner to select memory mode.
- Acceptance Criteria:
  1. [ ] eval-baseline.json exists with one entry per fixture task
     - Verify: `jq '.tasks | length' .specs/pi-memory-retrieval/eval-baseline.json`
     - Pass: matches fixture task count
     - Fail: missing entries -- check runner errors
  2. [ ] Aggregate success rate is recorded with 95% bootstrap CI
     - Verify: `jq '.summary | {success_rate, ci_lower, ci_upper}' eval-baseline.json`
     - Pass: all three fields numeric
     - Fail: missing -- compute via T2 bootstrap utility

**T8: Retrieval eval + Memory Lift** [sonnet] -- builder
- Blocked by: V2
- Description: Run the eval harness with the retrieval system from T4-T6
  enabled. Compute paired differences against T7's baseline.
  - **Primary metric**: Memory Lift = success_rate(retrieval) -- success_rate(snapshot)
    with bootstrap 95% CI on the paired differences.
  - **Secondary metric**: cost_adjusted_lift = Memory Lift / token_ratio
    where token_ratio = mean(tokens_retrieval) / mean(tokens_snapshot).
  - Record retrieval traces (which memory ids fired per task) for post-hoc
    eRAG-style diagnosis.
  - Output: `.specs/pi-memory-retrieval/eval-retrieval.json` and
    `.specs/pi-memory-retrieval/eval-summary.md`.
- Files: as above.
- Acceptance Criteria:
  1. [ ] eval-summary.md reports Memory Lift point estimate, CI, and
        cost-adjusted lift
     - Verify: `grep -E 'Memory Lift.*[0-9]' .specs/pi-memory-retrieval/eval-summary.md`
     - Pass: numeric values present with units
     - Fail: missing -- regenerate summary
  2. [ ] Retrieval traces are stored per task
     - Verify: `jq '.tasks[0].retrieved_ids | length' eval-retrieval.json`
     - Pass: array exists for every task
     - Fail: missing -- patch runner to log
  3. [ ] Decision recorded: PROCEED (lift CI lower bound >= 0) or HALT
     - Verify: `grep -E 'decision: (PROCEED|HALT)' eval-summary.md`
     - Pass: one of the two appears
     - Fail: missing decision -- author must record

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [sonnet] -- validator-heavy
- Blocked by: T7, T8
- Checks:
  1. Both eval JSON files exist and parse cleanly
  2. eval-summary.md contains Memory Lift + CI + cost-adjusted lift + decision
  3. The decision is consistent with the data: PROCEED requires CI lower bound
     >= 0; HALT otherwise
  4. If HALT: T9 and T10 are explicitly blocked, plan is updated to add a fix
     task or roll back
- On failure: Create fix task, re-validate after fix.

### Wave 4 (parallel, conditional on V3 = PROCEED)

**T9: Frequency-threshold promotion detector** [sonnet] -- builder
- Blocked by: V3 with decision = PROCEED
- Description: Implement a script that scans the index, finds clusters of rows
  where:
  - cosine similarity between any two rows in the cluster >= 0.85
  - cluster spans >= 3 distinct `repo_id` values (excluding 'global')
  - none of the rows are already marked `kind = 'policy'`
  Emit each cluster as a candidate to
  `~/.pi/agent/index/policy-candidates.md`, with the canonical text, the
  contributing entry ids, and the spanning repos. Add `just memory-promote-scan`
  recipe. **No automatic write to procedural tier.**
- Files: `pi/scripts/memory-promote-scan.ts`,
  `pi/tests/memory-promote-scan.test.ts`, `pi/justfile`.
- Acceptance Criteria:
  1. [ ] Test fixture with a synthetic claim duplicated across 3 repos surfaces
        as a candidate
     - Verify: `cd pi/tests && bun vitest run memory-promote-scan`
     - Pass: green; candidate file contains the synthetic claim
     - Fail: red -- check threshold values and clustering
  2. [ ] Single-repo claim does NOT surface
     - Verify: same test file, negative case
     - Pass: candidate file does not contain the single-repo claim
     - Fail: present -- enforce repo-count gate
  3. [ ] Candidates file is human-friendly markdown with cluster_id, text,
        contributing ids, spanning repos
     - Verify: `cat ~/.pi/agent/index/policy-candidates.md`
     - Pass: each candidate has all four fields under a heading
     - Fail: malformed -- fix template

**T10: Snapshot deletion (conditional)** [opus] -- builder-heavy
- Blocked by: V3 with decision = PROCEED, AND T1 audit shows all config fields
  relocated
- Description: Remove `*-mental-model.json` and `*-mental-model.state.json` files
  and their write paths. Remove the snapshot-regeneration code path and the
  layered global+project merge code (now replaced by SQL WHERE clause). Update
  `pi/docs/expertise-layering.md` to reflect the retrieval model -- procedural
  tier (files), JSONL logs (truth), DuckDB index (derived), promotion via
  candidates file. **Critical:** before any deletion, confirm T1 dispositions for
  every config field have been executed (config moved to agent .md files).
- Files: deletes across `pi/multi-team/expertise/**/*-mental-model*.json`,
  modifies `pi/extensions/agent-chain.ts` (remove snapshot loader),
  `pi/lib/repo-id.ts` (remove merge code if dedicated), updates
  `pi/docs/expertise-layering.md`.
- Acceptance Criteria:
  1. [ ] Pre-deletion guard: every config field from T1 audit appears in its
        target agent `.md` file
     - Verify: script reads audit.md, greps each field name in target file
     - Pass: 100% present
     - Fail: missing -- block deletion; relocate first
  2. [ ] No `*mental-model*.json` files remain under `pi/multi-team/expertise/`
     - Verify: `find pi/multi-team/expertise -name '*mental-model*' 2>&1 | wc -l`
     - Pass: 0
     - Fail: > 0 -- remove remaining
  3. [ ] Full vitest suite green; agent startup still loads procedural files +
        retrieval block, no snapshot reference
     - Verify: `cd pi/tests && bun vitest run`
     - Pass: green
     - Fail: red -- diagnose; do NOT restore deleted files (use git to recover
        if needed)
  4. [ ] expertise-layering.md updated; no references to mental-model or layered
        merge remain
     - Verify: `grep -E 'mental-model|layered.merge' pi/docs/expertise-layering.md`
     - Pass: empty result
     - Fail: stale references -- update doc

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [sonnet] -- validator-heavy
- Blocked by: T9, T10
- Checks:
  1. T9 promotion-scan tests green; positive + negative cases distinguish
  2. If T10 ran: full vitest suite green; no mental-model files under expertise;
     docs updated
  3. If T10 was blocked (HALT or unrelocated config): plan reflects the block
     with a follow-up task list
  4. Re-run the eval harness end-to-end one more time: Memory Lift remains
     non-negative
- On failure: Create fix task, re-validate after fix.

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) -> V1
Wave 2: T4, T5, T6 (parallel) -> V2
Wave 3: T7, T8 (parallel) -> V3
Wave 4: T9, T10 (parallel, conditional on V3 = PROCEED) -> V4
```

## Success Criteria

1. [ ] Memory Lift CI lower bound >= 0 vs. snapshot baseline
   - Verify: `jq '.summary.memory_lift_ci_lower' .specs/pi-memory-retrieval/eval-retrieval.json`
   - Pass: value >= 0
2. [ ] `just memory-rebuild` rebuilds the entire index from JSONL truth in a
      single command on Windows and Linux
   - Verify: rm `~/.pi/agent/index/memory.duckdb`; `just memory-rebuild`; assert
      file exists with non-zero rows
   - Pass: command succeeds on both platforms
3. [ ] Cross-repo retrieval surfaces a learning made in repo A when working in
      repo B (manual smoke test with a seeded entry)
   - Verify: insert synthetic global-tagged entry; from a different repo, ask a
      query whose embedding hits that entry; confirm it appears in retrieval
   - Pass: entry appears in top-K
4. [ ] Promotion candidates file accumulates at least one real candidate after
      running scan against current expertise corpus, OR the corpus genuinely
      has no cross-repo recurrence (document either way)
   - Verify: `wc -l ~/.pi/agent/index/policy-candidates.md` and read content
   - Pass: file exists and content matches one of the two cases
5. [ ] Procedural tier (`CLAUDE.md`, `MEMORY.md`, agent .md files) still loads
      unconditionally; retrieval block is additive, not a replacement
   - Verify: agent prompt snapshot test from T6
   - Pass: both blocks present

## Handoff Notes

- The `@duckdb/node-api` (Neo) client does not support scalar UDFs as of
  research date. The brunk.io blog's `create_function("embed", ...)` pattern is
  Python-only. Pre-compute embeddings in TS and bind as `FLOAT[384]` parameters.
  If UDF support lands later, refactoring is mechanical.
- HNSW index persistence is gated by an experimental flag
  (`SET hnsw_enable_experimental_persistence = true`). Index must fit in RAM.
  Acceptable for sub-100K rows; revisit at scale.
- `superseded_by` is an append-only correction mechanism. Writers append a new
  entry whose body corrects an earlier one and set the earlier entry's
  `superseded_by` to the new id. Retrieval filters out superseded rows. This
  replaces in-place updates and keeps JSONL append-only.
- The eval harness in T2 must be deterministic across runs (same model, same
  seed, same fixtures). Without this, Memory Lift will be swamped by noise.
- T10 is gated behind both V3 = PROCEED and the T1 config-relocation guard.
  If config fields cannot be cleanly relocated, snapshot deletion blocks --
  do not delete by hand to "make progress."
- Frequency-threshold parameters (N=3 repos, cosine=0.85) are starting values
  from research. Tune from observed promotion candidate quality after a few
  scans, not from theory.
- The `negative` slice of the eval (memory should NOT fire) is the most
  important signal -- without it, over-retrieval regressions are invisible.
  Do not let fixture authors skip this stratum.
- Confidence: HIGH on architecture (5 independent research threads converged
  on the same answer; Anthropic ships this exact pattern). MEDIUM on whether
  Memory Lift will be positive (depends on the corpus's semantic density --
  the eval gates this; do not pre-celebrate). LOW on the frequency-threshold
  parameters being right on first run.
