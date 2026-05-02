---
created: 2026-05-02
status: draft
completed:
review:
  - review-1/synthesis.md (applied: 14 bugs, 8 hardening)
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
  retrieved. Anthropic's `CLAUDE.md` + `MEMORY.md`, OpenAI's saved-memories,
  LangMem's procedural tier (LangMem
  [conceptual guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)).
- **Hat 2 -- semantic + episodic memory:** retrieved by similarity to the current
  task. Vector store, append-only source of truth.

No paper found shows pure unified retrieval beating the two-tier baseline on
benchmarks that include adversarial rule-violation cases (CoALA arXiv:2309.02427,
Constitutional AI arXiv:2212.08073, mem0 production failure mode in
[Issue #4573](https://github.com/mem0ai/mem0/issues/4573)). Voyager (arXiv:2305.16291)
is the only credible counter-example, and only because each entry is executable
and self-verifiable. JSONL learnings are not.

This plan replaces the snapshot with vector retrieval over the existing JSONL logs,
adds within-repo recall (cross-repo gated to promoted policies only), adds a
frequency-threshold promotion mechanism (project-specific -- candidate global
policy), and ships an eval harness that measures **Memory Lift** (success rate
with memory on minus success rate with memory off) on a stratified task set.
JSONL stays the source of truth; the index is derived, deletable, and
rebuildable.

## Relationship to Existing `read_expertise` Retrieval (B-01)

`pi/docs/expertise-layering.md` (lines 238-281) already specifies a `read_expertise`
`query` parameter with lexical scoring, retrieval cache, and an explicit privacy
clause: "External embedding providers, vector databases, or network calls are
disabled for this feature unless a future approved design adds explicit opt-in
configuration." The in-flight (untracked) `pi/tests/read-expertise-retrieval.test.ts`
is the test surface for that work.

**This plan extends, does not replace, that lexical retrieval.** Specifically:

- The lexical scorer remains the default retrieval path. It runs entirely
  locally on the JSONL truth and stays within the existing privacy clause.
- An **opt-in** semantic-retrieval layer (this plan's contribution) augments the
  lexical scorer with a local embedding model (transformers.js, no network at
  runtime) feeding a local index. The privacy clause is updated **in the same
  wave that lands the embedder** (T0a) to add the opt-in configuration. The
  retrieval API contract from `read_expertise` (parameter shape, response
  shape) is preserved; this plan adds an internal scoring layer behind it.
- T0a is a prerequisite gate: until `expertise-layering.md` is updated and the
  in-flight `read-expertise-retrieval.test.ts` is committed or rebased on top
  of this plan, T1-T8 do not start.

If the user later decides the lexical scorer is sufficient, this plan's Phase 1
(in-memory cosine) can be deleted and the lexical scorer kept. The eval gate
in V3 is the deciding signal.

## Two-Phase Strategy (H-01)

The verified expertise corpus is currently dozens of rows total
(34 lines in the largest log sampled). DuckDB+vss+HNSW with experimental
persistence is over-engineered for that scale. The plan ships in two phases:

- **Phase 1 (this plan, T0a-T10):** in-memory cosine over a `Float32Array`
  buffer, rebuilt on agent startup from JSONL. ~30 LOC of retrieval. Same
  `retrieve()` interface as Phase 2 will use. Eval-gates the architecture
  before adding any new infra.
- **Phase 2 (deferred, T11):** swap the in-memory backend for DuckDB+vss when
  the corpus crosses a measured threshold (>2000 rows OR retrieval p99 > 100ms
  on the eval). `retrieve()` interface unchanged. T11 is documented but not
  scheduled in this plan; it is triggered by metrics, not calendar.

If Phase 1 fails the eval (HALT), Phase 2 is moot.

## Constraints

- Platform: Windows 11 (primary), with WSL/Linux mirroring required by repo policy.
- Shell: PowerShell on Windows, bash on Linux. `pi/justfile` line 4 sets
  `windows-shell := ["pwsh.exe", "-Command"]`. **All acceptance commands must be
  given in both pwsh and bash forms** (B-02), or wrapped in a `just verify-*`
  recipe that hides the difference.
- Language: TypeScript + Bun runtime (`bun.exe` verified on Windows). Tests use
  vitest in `pi/tests/`.
- Procedural memory **must never** be auto-promoted. Frequency detector emits
  candidates to a markdown file; humans review and move into procedural tier.
- JSONL logs are authoritative and append-only. Snapshots are deletable; logs
  are not.
- Embedding model + dtype + chunker + schema + model-file SHA256 + DuckDB +
  vss versions are all fingerprinted (H-05, H-06); mismatch triggers full
  rebuild (no schema migrations; index is throw-away).
- No per-write LLM judge (mem0's documented failure mode -- see Context).
- LOC budget: Phase 1 retrieval + ingest + rebuild path under 200 lines TS.
  Phase 2 (deferred) under an additional 200 lines.
- No DuckDB UDFs in `@duckdb/node-api` (Neo client) when Phase 2 lands --
  pre-compute embeddings in TS and bind as `FLOAT[384]` parameters using
  positional binding (e.g., `$1::FLOAT[384]`). The plan never writes
  `embed($task)` literally in SQL. (B-05)
- DuckDB `vss` HNSW persistence (Phase 2 only) requires
  `SET hnsw_enable_experimental_persistence = true` and the index must fit in
  RAM. A reopen-and-query smoke test on Windows + Linux is mandatory before
  Phase 2 is accepted (B-09).
- Eval must be stratified: control (no memory needed), positive (needs a stored
  fact), negative (memory should not fire). Without negative slice, retrieval
  precision regressions are invisible. Per-stratum lift is reported and gated
  separately (H-03).
- **Default retrieval scope is current-repo only** (B-14). Cross-repo retrieval
  surfaces only entries with `kind = 'policy'` (the post-promotion output of
  T9) -- raw cross-repo similarity is not exposed to agents. Success Criterion
  #3 (cross-repo recall) operates on policies, not raw entries.
- Snapshot deletion only after the eval shows non-negative Memory Lift overall
  AND `negative_lift >= -0.05` (H-03) AND the T1 audit-manifest dispositions
  have been executed (B-08).
- Retrieved-block injection must enforce a `maxTokens` cap (B-10) -- top-K
  alone is insufficient, since JSONL entries vary in length.
- Eval determinism: LLM endpoints do not honor `seed=0` reliably (B-07).
  Choose ONE strategy and document it in T2: (a) record-and-replay cassette
  layer for LLM calls, (b) average K=3 runs per task with variance reported,
  or (c) restrict scoring to deterministic outputs only (file-diff, exit code,
  test pass/fail) and exclude any LLM-judged "good answer" scoring.
- Sample-size adequacy: 30-50 paired tasks is too few for a 95% bootstrap CI
  whose lower bound clears zero on a +0.05-+0.15 effect (B-06). Choose ONE:
  (a) raise N to >=100 paired tasks (cost: harness time), (b) loosen the
  PROCEED gate to "point estimate >= 0 AND CI lower >= -0.05" with
  documented rationale, or (c) one-sided test rather than CI inclusion of
  zero. T8 records the chosen power calculation.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep snapshots; add retrieval as supplement | No deletion risk; preserves config | Two systems; layered merge code stays; doesn't solve token bloat | Rejected |
| Pure unified retrieval (one store, no procedural tier) | One pipeline | No literature support for adversarial rule-following; mem0 Issue #4573 documents production failure | Rejected -- evidence against |
| Knowledge graph (Zep/Graphiti or Cognee) | Bi-temporal contradictions; multi-hop | 14+ retrieval modes; heavy infra; overkill | Rejected |
| Per-write LLM judge (mem0 ADD/UPDATE/DELETE/NOOP) | Coherent store | 97.8% junk in 10K-entry production audit | Rejected -- failure mode known |
| DuckDB+vss from day one | Scales to 100K+ rows | Over-engineered for current ~30-row corpus; experimental persistence flag; native dep build complexity | Rejected -- premature; deferred to Phase 2 |
| Lexical-only (existing `read_expertise`) | Already specced; no new deps; respects current privacy clause | Cannot do semantic recall; brittle on synonym/phrasing variation | Rejected as sole path -- kept as default fallback |
| **Two-tier: procedural files + in-memory cosine over JSONL (Phase 1), DuckDB+vss when needed (Phase 2)** | Matches Anthropic/OpenAI/LangMem patterns; KISS; JSONL stays truth; rebuildable; eval-gated upgrade path | Two phases to maintain; embedder still required (offline-pinned) | **Selected** |

## Objective

When complete, pi has:

1. An **in-memory cosine retrieval index** (Phase 1) over all expertise JSONL
   logs for the current repo, rebuilt at agent startup from JSONL truth.
2. A retrieval API (`retrieve({task, agent, repoId, k, maxTokens})`) that:
   - defaults to current-repo entries plus `kind='policy'` global-tier entries,
   - excludes superseded chains (returns only chain-tail rows -- H-08),
   - caps the rendered block at a token budget,
   - exposes a `crossRepo: 'policies-only'` flag (no raw-similarity cross-repo).
3. A frequency-threshold detector that emits global-policy candidates to a
   human-reviewed markdown file when a claim recurs across N>=3 distinct repos
   with cosine similarity >= 0.85 under a documented clustering algorithm
   (greedy single-link with medoid as canonical text, earliest `ts` tiebreak).
4. An eval harness with paired tasks (>=100 if Constraint B-06 path (a) is
   chosen; otherwise N=30-50 with the loosened gate documented), reporting
   Memory Lift overall AND per-stratum, plus cost-adjusted lift, runnable via
   `just eval-memory`.
5. The `mental-model.json` and `mental-model.state.json` snapshot machinery
   archived to `~/.pi/agent/index/archive/{ts}/` (H-04) and removed from the
   live tree -- but only after the eval shows the retrieval system non-regresses
   AND the T1 audit-manifest dispositions are executed AND the
   `pi/tests/expertise-layering.test.ts` test deltas are explicit (B-11).

## Project Context

- **Language**: TypeScript (Bun runtime; verified `bun.exe` on Windows host).
- **Test command (bash)**: `cd pi/tests && bun vitest run`
- **Test command (pwsh)**: `Set-Location pi/tests; bun vitest run`
- **Or via just**: `cd pi && just test`
- **Lint command**: none detected at repo root; rely on TypeScript compiler via
  vitest type-check. Tasks define their own verification.
- **Existing extensions**: `pi/extensions/agent-chain.ts` is the integration
  point for agent-startup memory loading.
- **Existing storage**: `pi/multi-team/expertise/gh/{owner}/{repo}/` per repo;
  flat `pi/multi-team/expertise/` for the global layer (verified).
- **In-flight work**: `pi/tests/read-expertise-retrieval.test.ts` (untracked).
  T0a coordinates with this.

## Task Breakdown

| #   | Task | Files | Type | Model | Agent | Depends On |
|-----|------|-------|------|-------|-------|------------|
| T0a | Reconcile with `read_expertise`; update `expertise-layering.md` privacy clause for opt-in semantic retrieval | 2-3 | feature | sonnet | builder | -- |
| T1  | Audit `mental-model.json` fields; emit structured `audit-manifest.json` | 2-3 | research | sonnet | Explore | -- |
| T2  | Eval harness scaffold + stratified fixtures + determinism strategy + power calc | 5-7 | feature | sonnet | builder | -- |
| T3  | Embedding model decision; pin model artifact + SHA256 to `~/.pi/agent/models/` | 2-3 | feature | sonnet | builder | -- |
| V1  | Validate wave 1 | -- | validation | sonnet | validator-heavy | T0a, T1, T2, T3 |
| T4  | Phase 1 in-memory index: ingest JSONL with global-layer sentinel, build buffer, fingerprint | 3-4 | feature | sonnet | builder | V1 |
| T5  | Phase 1 retrieval API: cosine top-K with `maxTokens` cap, supersede chain-tail filter, default-current-repo + policies-only cross-repo | 2-3 | feature | sonnet | builder | V1 |
| T6  | Wire retrieval into `agent-chain.ts` (no-task warm-start = recency fallback) | 1-2 | feature | sonnet | builder | V1 |
| V2  | Validate wave 2 | -- | validation | sonnet | validator-heavy | T4, T5, T6 |
| T7  | Baseline eval (snapshot system + lexical `read_expertise`) | 1 | feature | sonnet | builder | V2 |
| T8  | Retrieval eval; compute overall + per-stratum Memory Lift with chosen power-calc strategy | 1 | feature | sonnet | builder | V2 |
| V3  | Validate wave 3 (decision: PROCEED or HALT) | -- | validation | sonnet | validator-heavy | T7, T8 |
| T9  | Frequency-threshold promotion detector with greedy single-link clustering, medoid canonical | 2-3 | feature | sonnet | builder | V3 |
| T10 | Snapshot archival + deletion (conditional); enumerate test deltas in `expertise-layering.test.ts` | 6-8 | architecture | opus | builder-heavy | V3 |
| V4  | Validate wave 4 | -- | validation | sonnet | validator-heavy | T9, T10 |
| T11 | (Deferred) Phase 2 -- DuckDB+vss backend swap; same `retrieve()` interface | -- | architecture | opus | builder-heavy | corpus > 2000 rows OR retrieval p99 > 100ms |

## Execution Waves

### Wave 1 (parallel)

**T0a: Reconcile with existing `read_expertise`** [sonnet] -- builder
- Description: Update `pi/docs/expertise-layering.md` `read_expertise` section
  to document an **opt-in** semantic-retrieval layer behind the existing
  lexical scorer. The opt-in is configured via
  `~/.pi/agent/settings.json` `expertise.semanticRetrieval = true`. When false,
  retrieval falls back to lexical-only (current behavior). When true, the
  lexical and semantic scorers are blended (lexical primary; semantic boosts
  ties and surfaces synonym/phrasing variants). Confirm whether the in-flight
  `pi/tests/read-expertise-retrieval.test.ts` should be committed first or
  rebased on top of this work; if first, gate this plan's V1 on its commit.
- Files: `pi/docs/expertise-layering.md` (privacy clause + retrieval section),
  potentially `pi/tests/read-expertise-retrieval.test.ts` coordination.
- Acceptance Criteria:
  1. [ ] `expertise-layering.md` privacy clause updated to add explicit opt-in
        for local-only semantic retrieval; no network at runtime
     - Verify (bash): `grep -n 'semanticRetrieval' pi/docs/expertise-layering.md`
     - Verify (pwsh): `Select-String -Path pi/docs/expertise-layering.md -Pattern 'semanticRetrieval'`
     - Pass: at least one match including the opt-in description
     - Fail: zero matches -- privacy clause not updated
  2. [ ] In-flight test status documented (committed | rebased | pending) and
        a follow-up note added to `expertise-layering.md` explaining how the
        two scorers compose
     - Verify: `git status` for `pi/tests/read-expertise-retrieval.test.ts` and
        a `## Composition with semantic retrieval` heading in `expertise-layering.md`
     - Pass: heading present; status note in commit message or plan handoff
     - Fail: no heading -- composition not specified
  3. [ ] No code changes to `pi/extensions/` in this task (T0a is doc + alignment only)
     - Verify (bash): `git diff --name-only pi/extensions/ | wc -l`
     - Verify (pwsh): `(git diff --name-only pi/extensions/ | Measure-Object -Line).Lines`
     - Pass: 0
     - Fail: > 0 -- code change leaked from T0a; revert and move into T4-T6

**T1: Audit + structured manifest** [sonnet] -- Explore
- Description: Read `pi/multi-team/expertise/gh/ilude/dotfiles/orchestrator-mental-model.json`
  and `*-mental-model.state.json`. For each top-level field, classify as
  **learned** (replaceable by retrieval) or **config** (must move to agent
  `.md` definition before snapshot deletion) or **unused**. **Emit a
  structured `audit-manifest.json`** (B-08) at
  `.specs/pi-memory-retrieval/audit-manifest.json` with one entry per field:
  `{field: string, source_file: string, disposition: "learned"|"config"|"unused",
  target_file: string|null, target_anchor: string|null, notes: string}`. The
  manifest is the input to T10's deletion guard -- T10 reads JSON, not greps
  markdown.
- Files: read existing snapshots; write
  `.specs/pi-memory-retrieval/audit-manifest.json` AND
  `.specs/pi-memory-retrieval/audit.md` (human-readable companion).
- Acceptance Criteria:
  1. [ ] `audit-manifest.json` parses as valid JSON with one entry per top-level
        field across both snapshot files
     - Verify (bash): `jq '. | length' .specs/pi-memory-retrieval/audit-manifest.json`
     - Verify (pwsh): `(Get-Content .specs/pi-memory-retrieval/audit-manifest.json | ConvertFrom-Json).Count`
     - Pass: count >= number of fields in source JSON
     - Fail: invalid JSON or count too low
  2. [ ] Every entry has a non-null `disposition` from the enum
     - Verify (bash): `jq 'map(select(.disposition | test("learned|config|unused"))) | length' audit-manifest.json`
     - Pass: equals total entry count
     - Fail: some entry has `null` or invalid disposition
  3. [ ] Every `disposition: "config"` entry has both `target_file` and
        `target_anchor` set
     - Verify (bash): `jq 'map(select(.disposition == "config" and (.target_file == null or .target_anchor == null))) | length'`
     - Pass: 0
     - Fail: > 0 -- config entries without target are blocked from T10

**T2: Eval harness + determinism + power calc** [sonnet] -- builder
- Description: Create `pi/tests/memory-eval/` containing:
  - `fixtures.json` with stratified tasks. Strata ratio: control / positive /
    negative = 30 / 50 / 20. **Sample size N is determined by the chosen
    power-calc strategy from B-06**: if (a), N >= 100; if (b), N may be 30-50
    with the loosened gate; if (c), one-sided test. T2 records the chosen
    strategy in `power-calc.md` with rationale. **At least 30% of fixtures
    must be seeded from `pi/sessions/` or `pi/history/` real session
    transcripts** (H-07).
  - `runner.ts` with the **chosen determinism strategy** (B-07):
    cassette/replay, K-run averaging, or deterministic-only scoring. The
    chosen strategy is documented in `determinism.md`.
  - `score.ts` with deterministic scoring functions only (file-diff match,
    test pass/fail, exit code) -- NO LLM-judged grading.
  - `bootstrap.ts` paired-difference bootstrap with 95% CI. Per-stratum
    bootstrap output as well as aggregate (H-03).
  - `pi/justfile` recipe `eval-memory` (must work under both pwsh and bash;
    `set windows-shell` already configured).
- Files: above plus `pi/justfile`,
  `.specs/pi-memory-retrieval/determinism.md`,
  `.specs/pi-memory-retrieval/power-calc.md`.
- Acceptance Criteria:
  1. [ ] `just eval-memory` runs end-to-end with memory disabled and produces
        a results JSON file containing per-task and per-stratum success rates
     - Verify (bash): `cd pi && just eval-memory && jq '.summary.per_stratum' tests/memory-eval/results-baseline.json`
     - Verify (pwsh): `Set-Location pi; just eval-memory; (Get-Content tests/memory-eval/results-baseline.json | ConvertFrom-Json).summary.per_stratum`
     - Pass: shows all three strata with success rates
     - Fail: missing strata -- check stratification
  2. [ ] Fixtures meet stratification AND provenance criteria
     - Verify: jq pipeline asserting control >= 30%, positive >= 50%, negative
        >= 20% AND `provenance == "session"` count >= 30% of total
     - Pass: all conditions
     - Fail: any condition unmet
  3. [ ] vitest unit tests cover scoring + bootstrap + per-stratum aggregation
        (>= 8 tests)
     - Verify (bash): `cd pi/tests && bun vitest run memory-eval | tee /tmp/v.txt && grep -E 'Tests +[0-9]+ passed' /tmp/v.txt`
     - Verify (pwsh): `Set-Location pi/tests; bun vitest run memory-eval *>&1 | Select-String 'Tests \d+ passed'`
     - Pass: passed count >= 8
     - Fail: red or insufficient
  4. [ ] `determinism.md` exists, names ONE chosen strategy with justification
     - Verify (bash): `grep -E '^Strategy: (cassette|k-run|deterministic-only)' .specs/pi-memory-retrieval/determinism.md`
     - Pass: exactly one strategy line
     - Fail: missing or multiple
  5. [ ] `power-calc.md` exists with the chosen N, gate definition, and rationale
     - Verify (bash): `grep -E '^N = [0-9]+|^Gate: ' .specs/pi-memory-retrieval/power-calc.md`
     - Pass: both lines present
     - Fail: missing -- author must record

**T3: Embedding model decision + airgap** [sonnet] -- builder
- Description: Spike both options to a temporary script: (a) transformers.js
  with `Xenova/bge-small-en-v1.5` at `dtype: 'q8'` (384-dim, ~33MB), and
  (b) Ollama embeddings via HTTP if Ollama is installed. Time the embed of
  100 sample log entries on the user's machine, **including first-run
  download time**. Pin the chosen model artifact to
  `~/.pi/agent/models/{model-id}/{file}` and verify SHA256 on every load
  (H-02). Choose the winner on cold-start latency + bundle size + offline
  reliability (H-02).
- Files: `.specs/pi-memory-retrieval/embedder.md` (decision + numbers + SHA256),
  `.specs/pi-memory-retrieval/spikes/embed-smoke.ts`, possibly
  `pi/extensions/package.json` for the chosen lib dep.
- Acceptance Criteria:
  1. [ ] `embedder.md` records the choice, cold-start latency (first-run
        download + first-embed), warm-start latency (subsequent embeds),
        bundle size, AND model file SHA256
     - Verify (bash): `grep -E 'choice:|first-run:|warm:|MB|SHA256:' .specs/pi-memory-retrieval/embedder.md | wc -l`
     - Verify (pwsh): `(Select-String -Path .specs/pi-memory-retrieval/embedder.md -Pattern 'choice:|first-run:|warm:|MB|SHA256:' | Measure-Object -Line).Lines`
     - Pass: count >= 5 (one line per element)
     - Fail: missing fields
  2. [ ] Smoke script outputs `dim=384` AND verifies the SHA256 of the loaded
        model file matches `embedder.md`
     - Verify (bash): `bun .specs/pi-memory-retrieval/spikes/embed-smoke.ts | grep -E 'dim=384.*sha256-ok'`
     - Verify (pwsh): `bun .specs/pi-memory-retrieval/spikes/embed-smoke.ts | Select-String 'dim=384.*sha256-ok'`
     - Pass: line present
     - Fail: dim wrong or SHA256 mismatch -- pin a different version
  3. [ ] Model file is present at `~/.pi/agent/models/` after the smoke run;
        running the smoke a second time uses the local copy and does NOT
        download
     - Verify: `Test-Path ~/.pi/agent/models/...` then re-run smoke and
        confirm cold-start equals warm-start latency (no network)
     - Pass: second run is offline
     - Fail: still downloads -- fix model resolution path

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [sonnet] -- validator-heavy
- Blocked by: T0a, T1, T2, T3
- Checks:
  1. T0a: `expertise-layering.md` has the opt-in semantic-retrieval clause and
     composition heading; no `pi/extensions/` diff from T0a
  2. T1: `audit-manifest.json` parses; every field has a disposition; every
     `config` entry has `target_file` + `target_anchor`
  3. T2: `just eval-memory` runs cleanly with per-stratum output; fixtures
     meet stratification AND provenance criteria; `determinism.md` and
     `power-calc.md` are explicit
  4. T3: `embedder.md` complete; smoke script offline on second run; SHA256
     verified
  5. Cross-task: T2 fixtures and T3 embedder agree on max-input-token assumptions
- On failure: Create fix task, re-validate after fix.

### Wave 2 (parallel) -- Phase 1 in-memory

**T4: Phase 1 in-memory index** [sonnet] -- builder
- Blocked by: V1
- Description: Implement `pi/extensions/memory-index.ts`. Phase 1 is in-memory:
  walk `pi/multi-team/expertise/**/*-expertise-log.jsonl` (using a glob library
  available under both bash and pwsh -- e.g., Bun's built-in glob), parse each
  line, embed `text` with the T3 embedder, build an in-process
  `Float32Array[]` keyed by stable id (`jsonl_path` + line offset SHA-1).
  **Tag global-layer entries with a sentinel** distinct from the non-git
  fallback slug `global` (B-03): use `__global-layer__` for entries from the
  flat path; the slug `global` remains reserved for non-git fallback. Build
  a fingerprint with `model_id`, `dtype`, `model_sha256`, `chunker_v`,
  `schema_v`, `embedder_lib_v`. Store the fingerprint to
  `~/.pi/agent/index/fingerprint.json`. **Mismatch** (compared to disk-state
  on next start) **triggers full rebuild** before retrieval is served.
- Files: `pi/extensions/memory-index.ts`,
  `pi/scripts/memory-rebuild.ts`,
  `pi/justfile` (add `memory-rebuild` recipe).
- Acceptance Criteria:
  1. [ ] `just memory-rebuild` builds the index and writes
        `~/.pi/agent/index/fingerprint.json`; index size in entries matches the
        count of **active** JSONL lines (i.e., excluding entries already pointed
        to by a `superseded_by` field) (B-04)
     - Verify (bash): `cd pi && just memory-rebuild && bun pi/scripts/memory-stats.ts | grep 'active='`
     - Verify (pwsh): `Set-Location pi; just memory-rebuild; bun pi/scripts/memory-stats.ts | Select-String 'active='`
     - Pass: `active=N` where N == jsonl_total - superseded_count
     - Fail: counts mismatch -- check supersede filter or ingest
  2. [ ] Fingerprint mismatch (manually edit `model_id` in
        `~/.pi/agent/index/fingerprint.json`) triggers full rebuild on next
        retrieval
     - Verify: edit, then call retrieve(), confirm rebuild log line and that
        the new fingerprint matches the embedder
     - Pass: log says "fingerprint mismatch -- rebuilding"
     - Fail: silent no-op
  3. [ ] Global-layer entries (from the flat path) are stored with
        `repo_id = '__global-layer__'`, NOT `'global'`; non-git-cwd entries
        with `'global'` (when the user runs pi outside a git repo) coexist
        without collision
     - Verify: vitest fixture with both kinds; assert `repo_id` values are
        distinct
     - Pass: green
     - Fail: red -- fix sentinel
  4. [ ] Concurrent-rebuild test: while a reader holds the index buffer,
        rebuild completes and the reader's outstanding query returns
        consistent results (the in-memory pattern means rebuild builds a new
        buffer atomically and swaps; readers hold a snapshot reference)
     - Verify: vitest concurrency test
     - Pass: green; no torn reads
     - Fail: red -- fix swap semantics (B-13)

**T5: Phase 1 retrieval API** [sonnet] -- builder
- Blocked by: V1
- Description: Implement `pi/extensions/memory-retrieve.ts` exposing
  `retrieve({task, agent, repoId, k, maxTokens, crossRepo})`. **Default
  scope** (B-14): `repo_id == repoId` only. **Cross-repo** flag values:
  `'off'` (default), `'policies-only'` (adds rows where `kind == 'policy'`
  AND `repo_id == '__global-layer__'`). Raw cross-repo similarity is never
  exposed. Compute cosine similarity in TS over the in-memory buffer; sort
  desc by similarity; recency tiebreak by `ts` desc. **Filter superseded
  chains to chain-tail rows only** (H-08): walk `superseded_by` pointers and
  return only the latest in each chain. **Apply `maxTokens` cap** (B-10): use
  the embedder's tokenizer (or a coarse char/4 estimate) to drop trailing
  results until the rendered block fits the cap; never return more than `k`.
  Return `{id, text, ts, repo_id, agent, similarity}[]`. Every retrieved
  result must include both lexical and semantic scores in the response so
  callers can blend (per T0a composition).
- Files: `pi/extensions/memory-retrieve.ts`,
  `pi/tests/memory-retrieve.test.ts`.
- Acceptance Criteria:
  1. [ ] Default-scope query for a `repoId` returns only that repo's entries;
        `__global-layer__` entries are NOT included by default
     - Verify: vitest seeded with multi-repo fixture
     - Pass: result `repo_id` set == `{repoId}`
     - Fail: leak -- fix WHERE
  2. [ ] `crossRepo: 'policies-only'` returns the repo's entries plus
        `kind=='policy'` global entries; never raw cross-repo similarity
     - Verify: vitest with mixed `kind` fixture
     - Pass: cross-repo rows have `kind == 'policy'` only
     - Fail: any non-policy cross-repo row -- fix filter
  3. [ ] Superseded chains collapse to chain-tail (A->B->C returns only C)
     - Verify: vitest with three-link chain
     - Pass: only C in result
     - Fail: A or B present -- fix chain walk
  4. [ ] `maxTokens` cap truncates the result list when total tokens of
        rendered block exceeds budget; never returns more than `k`
     - Verify: vitest with long-text entries and `maxTokens=512`
     - Pass: result rendered block <= 512 tokens; `result.length <= k`
     - Fail: over budget -- enforce truncation
  5. [ ] Each result includes both `lexicalScore` and `similarity`
        (semantic) so the caller's blend can be tested independently
     - Verify: vitest schema check
     - Pass: every result has both numeric fields
     - Fail: missing -- update return shape

**T6: Wire into agent startup** [sonnet] -- builder
- Blocked by: V1
- Description: Modify `pi/extensions/agent-chain.ts` to call the retrieval API
  at agent startup with the first user task as seed query. **No-task warm
  start** (B-test): fall back to recency `ORDER BY ts DESC LIMIT 20` for
  `(agent, repoId)` -- explicitly NOT similarity (semantic on a no-task seed
  is meaningless). Inject results into the agent's context as a clearly-
  labeled "Relevant prior expertise" block (Hat 2) under a `maxTokens` cap
  inherited from settings (default 1500 tokens for the block). **Procedural
  memory** (Hat 1, the existing `CLAUDE.md` / agent `.md` files) is unaffected
  and continues to load unconditionally.
- Files: `pi/extensions/agent-chain.ts`,
  `pi/tests/agent-chain.test.ts`.
- Acceptance Criteria:
  1. [ ] Agent receives a "Relevant prior expertise" block when a task seed
        is present
     - Verify: vitest with mocked retrieval returning 3 entries; assert
        block contains all 3 ids
     - Pass: green
     - Fail: red -- check injection
  2. [ ] No-task warm start uses recency, not similarity
     - Verify: vitest with no seed; assert retrieval was called with
        `mode: 'recency'` (or equivalent flag); assert SQL/cosine path NOT
        invoked
     - Pass: trace matches
     - Fail: similarity invoked -- branch on seed presence
  3. [ ] Procedural files (`CLAUDE.md`, agent `.md`) still load and the
        retrieval block is **additive**, not a replacement
     - Verify: vitest snapshot of full prompt; assert procedural sections
        present AND retrieval block present
     - Pass: both present
     - Fail: missing procedural -- restore injection path
  4. [ ] Block respects the inherited `maxTokens` cap end-to-end
     - Verify: vitest with `maxTokens=200` and long entries; assert rendered
        block <= 200 tokens
     - Pass: under cap
     - Fail: over cap -- fix truncation propagation

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T4, T5, T6
- Checks:
  1. T4: rebuild produces fingerprint; active-row count matches
     `jsonl_total - superseded_count`; mismatch triggers rebuild;
     `__global-layer__` sentinel does not collide with `'global'`;
     concurrent-rebuild test green
  2. T5: default-scope, cross-repo policies-only, supersede chain-tail,
     maxTokens cap, and dual-score return all green
  3. T6: agent startup injects retrieval block, retains procedural files,
     warm-start uses recency, maxTokens propagated
  4. Cross-task: a sample query through T6 returns rows that exist in the
     T4 index; lexical + semantic scores composable per T0a
  5. `cd pi/tests && bun vitest run` -- full suite green (bash and pwsh)
- On failure: Create fix task, re-validate after fix.

### Wave 3 (parallel)

**T7: Baseline eval** [sonnet] -- builder
- Blocked by: V2
- Description: Run the T2 eval harness with the **existing snapshot system +
  lexical `read_expertise`** as the baseline (no semantic retrieval).
  Determinism strategy from T2 applied. Results recorded to
  `.specs/pi-memory-retrieval/eval-baseline.json` -- per-task outcome,
  per-stratum success rate, total tokens, wall-clock per task.
- Files: `.specs/pi-memory-retrieval/eval-baseline.json`, runner flag for
  memory mode.
- Acceptance Criteria:
  1. [ ] eval-baseline.json contains one entry per fixture task AND
        per-stratum aggregates
     - Verify (bash): `jq '{tasks: (.tasks|length), strata: (.summary.per_stratum|keys|length)}' .specs/pi-memory-retrieval/eval-baseline.json`
     - Pass: tasks == fixture count, strata == 3
     - Fail: missing -- check runner
  2. [ ] Aggregate AND per-stratum success rates each carry 95% bootstrap CI
     - Verify (bash): `jq '.summary | {success_rate, ci_lower, ci_upper, per_stratum}' eval-baseline.json`
     - Pass: all numeric, per_stratum has 3 keys each with the CI triple
     - Fail: missing -- compute via T2 utility

**T8: Retrieval eval + Memory Lift** [sonnet] -- builder
- Blocked by: V2
- Description: Run the eval with retrieval enabled. Compute paired
  differences against T7's baseline.
  - **Primary**: Memory Lift = success_rate(retrieval) - success_rate(baseline),
    with 95% bootstrap CI on paired differences AND per-stratum lift.
  - **Negative-stratum gate** (H-03): `negative_lift >= -0.05` is required
    for PROCEED, in addition to the overall gate.
  - **Secondary**: `cost_adjusted_lift = MemoryLift / token_ratio` where
    `token_ratio = mean(tokens_retrieval) / mean(tokens_baseline)`.
  - **Power-calc strategy**: per T2 `power-calc.md` -- the gate uses the
    chosen formulation (raised N, loosened gate, or one-sided test).
  - **Retrieval traces**: which memory ids fired per task, for post-hoc
    eRAG-style diagnosis.
  - Output: `.specs/pi-memory-retrieval/eval-retrieval.json` and
    `eval-summary.md`.
- Files: as above.
- Acceptance Criteria:
  1. [ ] eval-summary.md reports overall lift, per-stratum lift,
        cost-adjusted lift, AND the gate decision
     - Verify (bash): `grep -E 'Overall Lift|Negative Lift|Positive Lift|Control Lift|Cost-Adjusted|decision: (PROCEED|HALT)' .specs/pi-memory-retrieval/eval-summary.md | wc -l`
     - Pass: count >= 6
     - Fail: missing rows -- regenerate
  2. [ ] Retrieval traces stored per task (`retrieved_ids` non-empty for
        positive stratum, may be empty for negative stratum where retrieval
        should not fire)
     - Verify (bash): `jq '.tasks | map(select(.stratum=="positive" and (.retrieved_ids|length)==0)) | length' eval-retrieval.json`
     - Pass: 0 (no positive task with empty trace)
     - Fail: > 0 -- positive tasks should have retrieved something
  3. [ ] Decision matches data:
        PROCEED requires (overall CI per power-calc gate) AND
        `negative_lift >= -0.05`
     - Verify (bash): script parses summary and re-verifies the decision
     - Pass: matches
     - Fail: decision inconsistent -- block V3

### Wave 3 -- Validation Gate

**V3: Validate wave 3 (PROCEED / HALT)** [sonnet] -- validator-heavy
- Blocked by: T7, T8
- Checks:
  1. Both eval JSON files exist and parse cleanly
  2. eval-summary.md contains all required metrics + decision
  3. Decision is consistent with data per the T2 power-calc gate AND H-03
     negative-stratum gate
  4. If HALT: T9 and T10 are explicitly blocked; plan is updated to add a
     fix task or roll back
- On failure: Create fix task, re-validate after fix.

### Wave 4 (parallel, conditional on V3 = PROCEED)

**T9: Frequency-threshold promotion detector** [sonnet] -- builder
- Blocked by: V3 with decision = PROCEED
- Description: Implement `pi/scripts/memory-promote-scan.ts`. **Clustering
  algorithm** (B-12): greedy single-link agglomerative clustering with cosine
  similarity threshold 0.85. Per-repo dedup is performed BEFORE counting
  spanning repos (so two near-duplicates within repo A count as one repo).
  Cluster qualifies if: spans >= 3 distinct `repo_id` values
  (excluding `__global-layer__`) AND no member has `kind == 'policy'`.
  **Canonical text**: medoid (the cluster member with the highest mean
  similarity to all others). **Tiebreak**: earliest `ts`. Emit each
  qualifying cluster to `~/.pi/agent/index/policy-candidates.md` with
  `cluster_id`, canonical text, contributing entry ids, spanning repo ids.
  Add `just memory-promote-scan` recipe. **No automatic write to procedural
  tier.**
- Files: `pi/scripts/memory-promote-scan.ts`,
  `pi/tests/memory-promote-scan.test.ts`, `pi/justfile`.
- Acceptance Criteria:
  1. [ ] Test fixture: claim duplicated across 3 repos surfaces; the medoid is
        the canonical text; ties broken by earliest `ts`
     - Verify (bash): `cd pi/tests && bun vitest run memory-promote-scan`
     - Pass: green; candidate file contains medoid text from earliest `ts`
     - Fail: red
  2. [ ] Per-repo dedup: 2 near-duplicates in repo A + 1 each in B, C =>
        spans 3 repos (passes), NOT 4 (would fail bar)
     - Verify: vitest negative-positive case
     - Pass: counts repo_ids, not entries
     - Fail: counts entries -- fix dedup-then-count order
  3. [ ] Single-repo claim does NOT surface
     - Verify: vitest negative case
     - Pass: candidate file does not contain it
     - Fail: present -- enforce repo-count gate
  4. [ ] Output file is human-friendly markdown with
        `cluster_id`, canonical text, contributing ids, spanning repos
     - Verify: cat the file under both shells
     - Pass: each candidate has all four fields
     - Fail: malformed -- fix template

**T10: Snapshot archival + deletion (conditional)** [opus] -- builder-heavy
- Blocked by: V3 with decision = PROCEED, AND every T1 manifest entry with
  `disposition == "config"` has been executed (target file contains the
  `target_anchor`)
- Description: **Phase A (archive, H-04)**: copy
  `pi/multi-team/expertise/**/*-mental-model*.json` to
  `~/.pi/agent/index/archive/{ISO-ts}/...` preserving relative paths. Write
  a `restore.md` recipe to the archive root. The archive is kept for at
  least 30 days; document this in `expertise-layering.md`.
  **Phase B (test deltas, B-11)**: enumerate which tests in
  `pi/tests/expertise-layering.test.ts` are deleted, rewritten, or kept.
  Produce `.specs/pi-memory-retrieval/test-delta.md` with each test name and
  a disposition (`delete`, `rewrite-as-X`, `keep`). Apply the deltas. The
  test count delta must match this manifest.
  **Phase C (deletion)**: remove the `*-mental-model*.json` files from the
  live tree. Remove snapshot-regeneration code paths and the layered global+
  project merge code (now replaced by the retrieval scope rules). Update
  `pi/docs/expertise-layering.md` to reflect retrieval model + archive policy.
  **Phase D (smoke)**: full vitest green; agent startup loads procedural
  files + retrieval block; no snapshot reference remains.
  **Critical**: Phase C only proceeds if the manifest-based pre-deletion
  guard passes. **Add a `--dry-run` flag** that prints the exact set of
  files that would be deleted; require human confirmation before non-dry
  runs.
- Files: deletes across `pi/multi-team/expertise/**/*-mental-model*.json`;
  modifies `pi/extensions/agent-chain.ts` (remove snapshot loader);
  `pi/lib/repo-id.ts` (remove merge code if dedicated); updates
  `pi/docs/expertise-layering.md`; new
  `~/.pi/agent/index/archive/{ts}/restore.md`;
  new `.specs/pi-memory-retrieval/test-delta.md`.
- Acceptance Criteria:
  1. [ ] Pre-deletion guard: every `disposition: "config"` entry in
        `audit-manifest.json` has been verified to exist at
        `target_file` under `target_anchor`
     - Verify: script reads manifest, parses target file headings, checks
        anchor presence (markdown heading or section parse)
     - Pass: 100% verified; emits report
     - Fail: any missing -- block deletion; relocate first
  2. [ ] Archive exists at `~/.pi/agent/index/archive/{ts}/` mirroring the
        original tree, with `restore.md`
     - Verify (bash): `find ~/.pi/agent/index/archive -name 'restore.md' | head -1`
     - Verify (pwsh): `Get-ChildItem ~/.pi/agent/index/archive -Filter restore.md -Recurse | Select-Object -First 1`
     - Pass: file exists; archive contents match the to-be-deleted set
     - Fail: missing -- redo Phase A
  3. [ ] No `*mental-model*.json` files remain under `pi/multi-team/expertise/`
     - Verify (bash): `find pi/multi-team/expertise -name '*mental-model*' | wc -l`
     - Verify (pwsh): `(Get-ChildItem pi/multi-team/expertise -Recurse -Filter '*mental-model*' | Measure-Object).Count`
     - Pass: 0
     - Fail: > 0 -- remove remaining
  4. [ ] `test-delta.md` enumerates every test in the original
        `expertise-layering.test.ts`; the post-Phase-B test count equals
        kept + rewrite count; deleted tests appear in the manifest
     - Verify: script diffs the original test list (from git HEAD) against
        the current; delta matches the manifest
     - Pass: matches
     - Fail: mismatch -- update manifest or restore tests
  5. [ ] Full vitest suite green (no new skips, no missing fixtures)
     - Verify (bash): `cd pi/tests && bun vitest run | tee /tmp/v.txt && grep -E 'Tests +[0-9]+ passed.*0 skipped' /tmp/v.txt`
     - Pass: green AND skipped count == 0 (or matches the pre-T10 baseline)
     - Fail: red OR new skips appeared -- diagnose
  6. [ ] `expertise-layering.md` updated; no `mental-model` references remain;
        archive policy section added
     - Verify (bash): `grep -E 'mental-model|layered.merge' pi/docs/expertise-layering.md`
     - Pass: empty
     - Fail: stale references -- update doc

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [sonnet] -- validator-heavy
- Blocked by: T9, T10
- Checks:
  1. T9 promotion-scan tests green; positive + negative + per-repo-dedup
     cases distinguish; medoid + earliest-ts tiebreak verified
  2. If T10 ran: archive present with restore.md; full vitest suite green;
     no mental-model files under live expertise tree; docs updated; no new
     skips
  3. If T10 was blocked (HALT, unrelocated config, or test-delta mismatch):
     plan reflects the block with a follow-up task list
  4. Re-run the eval harness end-to-end one more time: Memory Lift remains
     non-negative AND `negative_lift >= -0.05`
- On failure: Create fix task, re-validate after fix.

### Phase 2 (deferred -- T11)

**T11: DuckDB+vss backend swap** [opus] -- builder-heavy
- **Trigger**: corpus > 2000 active rows OR retrieval p99 > 100ms on the
  weekly-eval re-run. Until triggered, T11 is documented but not scheduled.
- Description (sketch only; full plan when triggered): replace the in-memory
  cosine backend with DuckDB+vss. Same `retrieve()` interface. Schema:

  ```sql
  CREATE TABLE memory (
    id           UBIGINT PRIMARY KEY,
    jsonl_path   VARCHAR NOT NULL,
    jsonl_offset UBIGINT NOT NULL,
    ts           TIMESTAMP NOT NULL,
    agent        VARCHAR NOT NULL,
    repo_id      VARCHAR NOT NULL,         -- '__global-layer__' or repo slug
    kind         VARCHAR NOT NULL,
    text         VARCHAR NOT NULL,
    meta         JSON,
    embedding    FLOAT[384] NOT NULL,
    superseded_by UBIGINT
  );
  CREATE INDEX memory_hnsw ON memory USING HNSW (embedding) WITH (metric = 'cosine');
  CREATE TABLE memory_meta (key VARCHAR PRIMARY KEY, value VARCHAR);
  ```

  SQL retrieval uses `array_inner_product(embedding, $1::FLOAT[384])` --
  the vector is pre-computed in TS and bound positionally; `embed()` is
  never written in SQL (B-05).
  HNSW persistence requires `SET hnsw_enable_experimental_persistence = true`;
  add a **reopen-and-query smoke test** on Windows + Linux to T11's
  acceptance (B-09); if it fails on Windows, fall back to non-persistent
  HNSW (rebuild on every process start).
  Build-to-tmp-then-rename for rebuild atomicity (B-13); close existing
  reader connections before rename on Windows.
  Fingerprint additionally records DuckDB version + vss version (H-05).

## Dependency Graph

```
Wave 1: T0a, T1, T2, T3 (parallel) -> V1
Wave 2: T4, T5, T6 (parallel) -> V2
Wave 3: T7, T8 (parallel) -> V3
Wave 4: T9, T10 (parallel, conditional on V3 = PROCEED) -> V4
T11: deferred; trigger on metrics, not calendar
```

## Success Criteria

1. [ ] Memory Lift gate per T2 `power-calc.md` is met AND
      `negative_lift >= -0.05`
   - Verify (bash): `jq '.summary | {gate_strategy, overall_decision, negative_lift}' .specs/pi-memory-retrieval/eval-retrieval.json`
   - Pass: `overall_decision == "PROCEED"` AND `negative_lift >= -0.05`
2. [ ] `just memory-rebuild` rebuilds the entire index from JSONL truth in a
      single command on Windows AND Linux
   - Verify: remove `~/.pi/agent/index/`; run rebuild on each platform;
     assert fingerprint exists with non-zero active-row count
   - Pass: command succeeds on both
3. [ ] Cross-repo recall surfaces a **promoted policy** made in repo A when
      working in repo B (not raw cross-repo similarity, per B-14)
   - Verify: seed a synthetic `kind='policy'` global entry; from a
     different repo, query with `crossRepo: 'policies-only'`; confirm
     the entry appears in the top-K
   - Pass: entry appears
4. [ ] Promotion candidates file accumulates at least one real candidate
      after running scan against the current corpus, OR the corpus
      genuinely has no cross-repo recurrence (document either way in the
      candidates file)
   - Verify: `wc -l ~/.pi/agent/index/policy-candidates.md` (bash) or
     `(Get-Content ... | Measure-Object -Line).Lines` (pwsh) and read content
   - Pass: file exists and content matches one of the two cases
5. [ ] Procedural tier (`CLAUDE.md`, `MEMORY.md`, agent `.md` files) still
      loads unconditionally; retrieval block is additive, not a replacement
   - Verify: agent prompt snapshot test from T6
   - Pass: both blocks present
6. [ ] Snapshot archive is preserved at `~/.pi/agent/index/archive/{ts}/`
      with a working `restore.md` recipe (H-04)
   - Verify: smoke-restore one archived snapshot to a tmp dir using the
     restore.md instructions; assert it parses
   - Pass: round-trip succeeds

## Handoff Notes

- **Phase 1 vs Phase 2**: this plan ships Phase 1 (in-memory cosine). Phase 2
  (DuckDB+vss) is documented in T11 and triggered by metrics (>2000 rows OR
  p99 > 100ms). Do not pre-build Phase 2; it is a measured upgrade, not a
  scheduled one.
- **Existing in-flight work**: `pi/tests/read-expertise-retrieval.test.ts` is
  untracked. T0a coordinates with this; either commit/rebase before V1 or
  document the rebase plan in T0a's deliverable.
- **Privacy clause**: the local-only opt-in is added to
  `pi/docs/expertise-layering.md` in T0a; do not skip it -- the embedder is
  local but the clause must be explicit per the existing spec.
- **`@duckdb/node-api`** (when Phase 2 lands) does NOT support scalar UDFs.
  The brunk.io blog's `create_function("embed", ...)` pattern is Python-only.
  Pre-compute embeddings in TS, bind as `FLOAT[384]` parameters using
  positional binding (`$1::FLOAT[384]`). Never write `embed(...)` in SQL.
- **`superseded_by`** is an append-only correction mechanism. Writers append a
  new JSONL entry that points back to the corrected id via `superseded_by`.
  Retrieval returns chain-tail rows only (H-08). The active-row count is
  `total_jsonl_lines - superseded_count`, NOT `total_jsonl_lines`.
- **Global-layer sentinel**: entries from the flat
  `pi/multi-team/expertise/*-expertise-log.jsonl` path are stored with
  `repo_id = '__global-layer__'`. The slug `global` remains reserved for the
  non-git fallback. Do not conflate them.
- **Cross-repo retrieval is gated**: default scope is current-repo-only. The
  `crossRepo: 'policies-only'` flag adds `kind='policy'` global entries.
  Raw cross-repo similarity is intentionally not exposed.
- **Determinism**: T2 records the chosen strategy (cassette / k-run / det-only).
  Stick to it across T7/T8/V4 re-runs; switching strategies invalidates
  paired comparisons.
- **Power calculation**: T2 records the chosen strategy (raised N / loosened
  gate / one-sided). The V3 gate uses that strategy. Do not change mid-run.
- **Per-stratum gate**: the negative slice is the most important signal for
  over-retrieval. `negative_lift >= -0.05` is a hard gate, not a guideline.
- **Audit-manifest is structured**: T1 emits `audit-manifest.json` with
  `{field, source_file, disposition, target_file, target_anchor}`. T10's
  pre-deletion guard parses JSON, not greps markdown.
- **T10 archive**: deleted snapshots are kept at
  `~/.pi/agent/index/archive/{ts}/` for >=30 days with a `restore.md` recipe
  (H-04).
- **Test deltas in T10**: every test in the original
  `pi/tests/expertise-layering.test.ts` is enumerated in `test-delta.md`
  with a disposition. New skips after T10 fail V4.
- **Frequency-threshold parameters** (N=3 repos, cosine=0.85) are starting
  points. Tune from observed promotion candidate quality after a few scans,
  not from theory. The clustering algorithm (greedy single-link, medoid
  canonical, earliest-ts tiebreak, per-repo-dedup-then-count) IS specified
  and not negotiable mid-run.
- **Embedder pinning + airgap** (H-02): the model artifact is pinned to
  `~/.pi/agent/models/{model-id}/` with SHA256 verified on every load.
  First-run download time is included in cold-start measurements; second
  run is offline. Fingerprint includes `model_sha256` (H-06).
- **DuckDB / vss versioning** (Phase 2; H-05): when T11 lands, the
  fingerprint includes both versions; mismatch triggers full rebuild.
- **Confidence**:
  - HIGH on architecture (5 independent research threads converged; Anthropic
    ships this exact pattern).
  - MEDIUM on whether Memory Lift will be positive (depends on the corpus's
    semantic density; the eval gates this; do not pre-celebrate).
  - LOW on the frequency-threshold parameters being right on first run.
  - LOW on Phase 2 HNSW persistence behaving identically on Windows vs.
    Linux (the reopen smoke test is a hard prerequisite for accepting T11).
