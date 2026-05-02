---
date: 2026-05-02
status: synthesis-complete
---

# Plan Review Synthesis: Pi Expertise Memory v2

## Note on methodology

This environment did not surface a parallel subagent-dispatch tool, so the six
reviewer personas were executed in-context by the coordinator rather than as
parallel Task spawns. Each persona's findings were drafted, then every
CRITICAL/HIGH finding was verified against the actual repo (Read/Bash/Grep on
`pi/extensions/agent-chain.ts`, `pi/lib/repo-id.ts`, `pi/docs/expertise-layering.md`,
`pi/justfile`, `pi/tests/package.json`, the JSONL logs, and the existing
mental-model JSON). False positives were dismissed; unverifiable claims were
downgraded to HIGH "needs human confirmation."

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|---|---|---|---|
| R1 Completeness | Staff engineer / explicitness | 8 | 4 |
| R2 Adversarial | Red team / failure modes | 8 | 3 |
| R3 OtB Simplicity | Principal engineer / proportionality | 8 | 3 |
| R4 Data Integrity | Senior data engineer | 8 | 4 |
| R5 Eval Rigor | Applied statistician | 8 | 3 |
| R6 Cross-Platform | DevOps | 8 | 3 |
| Total | | 48 | 20 (after dedupe: 14 bugs + hardening) |

## Outside-the-Box Assessment

The plan is well-grounded -- five research threads converged, a real eval gate
guards the destructive step, and JSONL-as-truth keeps the index throw-away.
However, the proposed system is meaningfully heavier than the corpus warrants:
verified row counts in `pi/multi-team/expertise/**` are dozens, not thousands
(34 lines in the largest log we sampled). At sub-100-row scale, DuckDB + HNSW +
`vss` experimental persistence + transformers.js bundle is over-engineered
relative to a brute-force in-memory cosine scan with the same embedder. The
architecture is correct for "10K-100K rows"; it is premature for "tens of rows."
A two-phase rollout (in-memory first, DuckDB at >2000 rows) would let Memory
Lift be measured against a simpler baseline, and the existing
`expertise-layering.md` already declares "Focused retrieval is private and local
by default" with a JSONL lexical scan path that the plan does not reference.
Strong recommendation: scope-trim before executing T4. See B-01 and H-01.

## Bugs (must fix before executing)

### B-01 [CRITICAL] Plan ignores existing focused-retrieval implementation
- Flagged by: R1, R3, R4
- Verified: `pi/docs/expertise-layering.md` (lines 238-281) already specifies a
  `read_expertise` `query` parameter, lexical scoring, retrieval cache,
  `read-expertise-retrieval.test.ts`, and the privacy policy "External embedding
  providers, vector databases, or network calls are disabled for this feature
  unless a future approved design adds explicit opt-in configuration." The plan
  proposes transformers.js and DuckDB+vss without acknowledging this prior spec
  or its opt-in gate. Git status confirms `pi/tests/read-expertise-retrieval.test.ts`
  is an untracked file in the working tree -- work is already in flight.
- Fix: Add a "Relationship to existing read_expertise retrieval" section.
  Decide explicitly: extend the lexical retrieval already specced, or replace
  it. If replacing, update `expertise-layering.md` privacy clause in the same
  wave, not as an afterthought. Without this, T4-T6 will collide with code
  another agent is currently writing.

### B-02 [CRITICAL] Acceptance-criteria shell commands are not portable to Windows
- Flagged by: R6, R1
- Verified: `pi/justfile` line 4 sets `windows-shell := ["pwsh.exe", "-Command"]`,
  so `just` recipes execute under PowerShell on Windows. The plan's acceptance
  checks use `test -f`, `wc -l`, `grep`, `find ... -name`, `cat ... | jq`,
  `rm`, `2>&1`. None of these are PowerShell builtins. `jq.exe` is installed
  but `wc`, `find` (POSIX), `test`, `grep` are only available in Git Bash, not
  pwsh. The plan's Constraints section says "PowerShell on Windows, bash on
  Linux" yet then writes only POSIX verification commands.
- Fix: For each acceptance criterion, provide both a pwsh and a bash form, or
  wrap verification in a `just verify-*` recipe that hides shell differences.
  At minimum: `Test-Path`, `Get-Content | Measure-Object -Line`,
  `Select-String`, `Get-ChildItem -Recurse -Filter`, `Remove-Item`.

### B-03 [HIGH] `repo_id = 'global'` is not how the existing system stores global entries
- Flagged by: R4
- Verified: `pi/docs/expertise-layering.md` lines 36-52 and lines 191-195 define
  the global layer as the **flat path** at `pi/multi-team/expertise/{agent}-expertise-log.jsonl`
  -- i.e., entries with no `repo-id` directory in the path. The slug `global`
  is reserved (per `lib/repo-id.ts` line 303 and the layering spec) for the
  non-git fallback. The plan's T5 SQL (`repo_id = $repoId OR repo_id = 'global'`)
  conflates "global layer entries" with "the literal slug `global`." During
  ingest, entries from the flat directory must be tagged with a sentinel
  (`global-layer` or similar) that does not collide with the non-git fallback.
- Fix: Define a distinct `repo_id` value for the global-layer flat-path entries
  in T4 ingest, and update the T5 WHERE clause and tests accordingly. Add an
  acceptance criterion that verifies the two cases (non-git cwd vs. flat-path
  global-layer entries) do not co-mingle in retrieval.

### B-04 [HIGH] No row-uniqueness key; rebuild row count cannot equal JSONL line count after corrections
- Flagged by: R4
- Verified: T4 acceptance criterion #2 says "Row count in `memory` table equals
  the line count of all source JSONL files." But the plan's `superseded_by`
  semantics (Handoff Notes lines 489-492) require appending a *new* JSONL line
  whose body corrects an earlier one. Both the original and the correction are
  JSONL lines. After ingest, both rows exist; one is marked superseded. Row
  count == line count only if `superseded_by` data is stored elsewhere (not in
  JSONL) -- which contradicts the "JSONL is truth" invariant. Either way, the
  acceptance criterion is unstable: any agent writing a correction breaks the
  invariant for that JSONL file pair.
- Fix: Reword the acceptance criterion to "ingested-row count equals JSONL line
  count for files unchanged during rebuild" (i.e., file mtime-stable), OR
  define `superseded_by` as a separate sidecar JSONL (e.g., `*-supersedes.jsonl`)
  and assert each file's count independently. Also specify how `superseded_by`
  flows into the index given JSONL-as-truth -- a writer cannot mutate prior
  lines.

### B-05 [HIGH] Embedding parameter binding `embed($task)` is ambiguous in retrieval pseudocode
- Flagged by: R1, R4
- Verified: T5 description says "ORDER BY `array_inner_product(embedding, embed($task)) DESC`
  -- but note T3: pre-compute `embed($task)` in TS first, bind as parameter."
  The pseudocode contradicts itself within one sentence. An executor following
  the SQL literally will try to call a SQL function `embed()` that does not
  exist in `@duckdb/node-api` (Handoff Notes confirm no UDFs). The intent is
  "bind a TS-precomputed `FLOAT[384]` literal" but the SQL written shows the
  wrong form.
- Fix: Replace the pseudocode with the actual binding pattern, e.g.,
  `ORDER BY array_inner_product(embedding, $1::FLOAT[384]) DESC` and note
  that `$1` is bound from `await embedder.embed(task)` in TS. Remove the word
  `embed(` from the SQL fragment to prevent literal copy-paste.

### B-06 [HIGH] Bootstrap CI on N=30-50 paired tasks gives wide CIs; "lower bound >= 0" is a coin flip
- Flagged by: R5
- Verified: Sample size adequacy for paired bootstrap with 95% CI on a binary
  outcome and an effect size that is plausibly +0.05 to +0.15 success-rate
  delta is roughly 100-300 paired tasks before the CI lower bound clears zero
  with reasonable power. At N=30-50, the plan's PROCEED gate (CI lower >= 0)
  will reject most truly-positive lifts, producing many false-HALT runs and
  driving the team to widen criteria post-hoc.
- Fix: Either (a) raise N to >=100 paired tasks for the gating eval (hardware
  cost), or (b) loosen the gate to "point estimate >= 0 AND CI lower >= -0.05"
  with a documented rationale, or (c) run a one-sided test instead of CI
  inclusion of zero. Document the chosen power calculation in T8.

### B-07 [HIGH] Eval determinism claim is unsupported -- LLM calls are non-deterministic
- Flagged by: R5, R2
- Verified: Handoff Notes line 493 states "The eval harness in T2 must be
  deterministic across runs (same model, same seed, same fixtures)." Real LLM
  endpoints (Anthropic, OpenAI, OpenRouter) do not honor `seed=0` strictly
  even when accepted; some models do not accept it at all. Without a recorded-
  response replay layer or temperature-0 + seed (and provider that honors it),
  Memory Lift on N=30-50 will swing across re-runs by more than the effect
  being measured.
- Fix: Add an explicit determinism strategy to T2: either (a) cassette/replay
  layer for LLM calls (record once, replay deterministically), (b) average
  K runs per task with the variance reported as part of the CI, or (c) restrict
  scoring to deterministic outputs (file-diff, exit code) and exclude any
  "did the agent produce a good answer" judging. Update the success criteria
  to reflect inter-run variance.

### B-08 [HIGH] T10 deletion guard reads audit.md by grep -- fragile against editor reformatting
- Flagged by: R2, R1
- Verified: T10 acceptance criterion #1 says "script reads audit.md, greps
  each field name in target file." Markdown tables are easily reformatted
  (column widths, escaped pipes). A grep-for-field-name will produce false
  positives (the field name appears in unrelated prose) and false negatives
  (the field is renamed in the agent .md file). This guards an irreversible
  destructive step.
- Fix: Mandate a structured manifest (`audit-manifest.json`) emitted by T1
  with `{field, source_file, disposition, target_file, target_anchor}`. T10
  reads the JSON and verifies each `target_anchor` exists in `target_file`
  via AST/markdown-heading parse, not grep. Also require a dry-run mode that
  prints what would be deleted with a confirmation prompt.

### B-09 [HIGH] HNSW experimental-persistence flag + DuckDB Neo client is unverified working combination
- Flagged by: R4, R6
- Unverified -- needs human confirmation. The plan correctly notes the
  experimental flag, but does not include a smoke test that the precise
  combination (`@duckdb/node-api` + `vss` + `hnsw_enable_experimental_persistence`
  + `FLOAT[384]` + cosine) actually persists across reopen on Windows. T3 only
  validates the embedder. T4 asserts file-on-disk but not reopen-and-query.
- Fix: Add an acceptance criterion to T4: "Close the DuckDB connection,
  reopen, run the same retrieval query, get the same top-K." Require this
  on both Windows and Linux. If the combination is broken on Windows, fall
  back to non-persistent HNSW (rebuild on every process start) and re-evaluate
  cost.

### B-10 [HIGH] No mention of how retrieved memory entries are bounded for token budget
- Flagged by: R1, R3
- Verified: T6 says "Inject results into the agent's context as a clearly-labeled
  'Relevant prior expertise' block." Top-K is a parameter but no token cap is
  specified. JSONL entries vary in length (the orchestrator log has multi-line
  entries with embedded JSON). A naive top-20 could blow the system prompt.
  This is the same failure mode (token bloat) the plan claims to be solving.
- Fix: Add an explicit `maxTokens` parameter to `retrieve()` that truncates
  the result list when tokens-of-rendered-block exceeds budget, and add a T6
  acceptance criterion verifying truncation.

### B-11 [HIGH] Snapshot deletion (T10) breaks expertise-layering.md tests still on disk
- Flagged by: R1, R2
- Verified: `pi/tests/expertise-layering.test.ts` exists. The layering spec
  defines "rebuild project-local snapshot synchronously," "stale snapshot,"
  "schema_version of an existing snapshot," and decision tables L1-L10 that
  reference snapshot behavior. T10 plans to delete snapshot machinery without
  a parallel update to `expertise-layering.test.ts`. The full vitest suite
  green check (T10 #3) will silently skip cases that no longer have fixtures.
- Fix: T10 must explicitly enumerate which tests in
  `pi/tests/expertise-layering.test.ts` are deleted, which are rewritten, and
  which fixtures are removed. Add a pre-deletion check that the test file's
  test-count delta matches the plan.

### B-12 [HIGH] Frequency-threshold cluster definition is under-specified
- Flagged by: R4, R5
- Verified: T9 says "cosine similarity between any two rows in the cluster
  >= 0.85" and "cluster spans >= 3 distinct repo_ids." "Any two" is not a
  cluster definition -- it permits chains where row A is similar to B, B to C,
  but A and C are dissimilar. With a transitive-closure reading, near-duplicate
  noise across many repos creates spuriously large clusters; with a clique
  reading, real recurring patterns get split. The output (candidate text) is
  ambiguous: which cluster member's text becomes the "canonical" entry?
- Fix: Specify clustering algorithm (e.g., greedy single-link with 0.85
  threshold; report cluster medoid as canonical text). Add a tie-break rule
  for medoid selection (e.g., earliest `ts`). Add a fixture with three repos
  and two near-duplicates in repo A to verify per-repo dedup before counting
  spanning repos.

### B-13 [HIGH] No file-locking story for concurrent rebuild + read
- Flagged by: R6, R2
- Verified: `expertise-layering.md` `Locking and concurrency` section uses
  `withFileMutationQueue` for JSONL/snapshot writes, but DuckDB's default
  single-writer-multiple-reader semantics with HNSW persistence experimental
  flag is unspecified. If `just memory-rebuild` runs while another pi
  process holds the DB open for retrieval (warm shell), Windows file locks
  will fail differently than Linux flock.
- Fix: Specify rebuild strategy as build-to-tmp-then-rename (atomic on Linux,
  best-effort on Windows -- close existing connections first). Add a T4
  acceptance check that simulates a held-open reader during rebuild and
  asserts both the reader and the rebuild complete without corruption.

### B-14 [HIGH] Cross-repo retrieval semantic drift -- learnings from one project bleed into unrelated ones
- Flagged by: R2, R3
- Verified: Success Criterion #3 explicitly wants "a learning made in repo A
  when working in repo B" to surface. But many JSONL entries we sampled in
  `orchestrator-expertise-log.jsonl` are pi-config-specific (`PI_CACHE_RETENTION`,
  `models.json` overrides). Surfacing these into an unrelated project's agent
  context is harmful, not helpful. The plan's only guard is the cosine
  threshold, which is purely lexical-semantic, not project-semantic.
- Fix: Default `retrieve()` to `repo_id = $repoId` only. Cross-repo retrieval
  is opt-in (a separate function or flag), and the "global" tier surfaces
  only entries explicitly marked `kind = 'policy'` (i.e., the post-promotion
  output of T9, not raw cross-repo similarity). Update Success Criterion #3
  to reflect the gated path.

## Hardening Suggestions (optional improvements)

### H-01 [MEDIUM] Start with brute-force cosine in memory; defer DuckDB until corpus warrants it
- Proportionality: Verified corpus is ~tens of rows per agent. A 384-dim
  embedding `Float32Array` for 10K rows is 15MB -- fits in process memory.
  The DuckDB+vss path is 250-350 LOC of new infra plus an experimental
  persistence flag. A naive `Array.sort` over cosines is ~30 LOC.
- Suggestion: Phase 1 ships brute-force in-memory; phase 2 swaps to DuckDB
  if the eval shows latency or RAM pressure. Same `retrieve()` interface,
  same eval, half the surface area.

### H-02 [MEDIUM] Bundle/airgap story for transformers.js model download
- Verified: T3 chooses between transformers.js Xenova model (cold-start
  downloads from HuggingFace CDN) and Ollama (assumes Ollama is running).
  Neither path works in airgapped or first-run-offline scenarios. Cold-start
  measurements should include first-run download time.
- Suggestion: Pin the model artifact under `~/.pi/agent/models/` or commit
  to a private cache, and verify SHA256 on load.

### H-03 [MEDIUM] Memory Lift sign-flip on negative slice is invisible
- The plan's "negative slice" exists but the primary metric is aggregate
  success rate. A negative-slice regression (over-retrieval distraction) +
  positive-slice gain can net to zero or positive overall, hiding harm.
- Suggestion: Report Memory Lift per-stratum and gate PROCEED on
  `negative_lift >= -0.05` separately, not just aggregate.

### H-04 [MEDIUM] No rollback story if T8 PROCEEDS but production reveals regression
- Plan covers HALT before deletion but not "deletion happened, then a
  regression appeared." Snapshots are gone.
- Suggestion: T10 archives deleted snapshots to `~/.pi/agent/index/archive/`
  with a one-command restore recipe, kept for 30 days.

### H-05 [LOW] Explicit DuckDB version pin
- The vss extension and `hnsw_enable_experimental_persistence` flag behavior
  is version-sensitive.
- Suggestion: Pin `@duckdb/node-api` and the vss extension version in the
  fingerprint table; mismatch triggers rebuild.

### H-06 [LOW] Embedding model versioning beyond `model_id` + `dtype`
- A model published with the same name but updated weights breaks comparability.
- Suggestion: Include the model file SHA256 in the fingerprint.

### H-07 [LOW] Eval fixture provenance
- 30-50 hand-authored tasks risk reflecting the author's mental model rather
  than real agent workloads.
- Suggestion: Seed at least 30% of fixtures from real session transcripts
  in `pi/sessions/` or `pi/history/`.

### H-08 [LOW] `superseded_by` chain length is unbounded
- A row corrected three times yields a chain A->B->C->D. The plan filters
  superseded rows but does not collapse chains.
- Suggestion: Add a "latest in chain" view; document that retrieval returns
  only chain-tail rows.

## Dismissed Findings

- "@duckdb/node-api lacks UDF support so the plan is broken" -- Dismissed.
  The plan already calls this out and prescribes pre-computed parameters in
  Handoff Notes; not a bug.
- "Bun is not available on Windows" -- Dismissed. Verified `bun.exe` resolves
  on this Windows host (`C:\Users\mglenn\.local\bin\bun`); the plan's runtime
  assumption holds.
- "transformers.js does not produce 384-dim vectors for bge-small" -- Dismissed.
  The dimensionality is correct for `Xenova/bge-small-en-v1.5`; T3 verifies
  this empirically.
- "JSONL append-only forbids `superseded_by` field" -- Dismissed in current
  form; the plan correctly proposes appending a *new* line that points back.
  However the row-count assertion still has issues (see B-04).
- "DuckDB cannot do 384-dim FLOAT arrays" -- Dismissed. `vss` supports
  fixed-length FLOAT arrays as the standard embedding type.
- "`set windows-shell` in justfile means all `just` recipes break on Linux" --
  Dismissed. The directive is Windows-only and falls back to `sh -c` on
  POSIX. Plan-level justfile recipes will run on both platforms.
- "Plan deletes snapshots before eval validates" -- Dismissed. T10 is gated
  on V3 = PROCEED.

## Positive Notes

- Eval-gated destructive step is the right shape; many plans skip this.
- Procedural / episodic split is well-justified by literature and is the
  industry-converged answer.
- JSONL-as-truth + rebuildable index is exactly the right invariant.
- Fingerprint-driven rebuild eliminates schema-migration risk.
- Frequency-threshold *candidate* file (not auto-promote) respects the
  procedural-tier-must-be-human-curated rule.
- Confidence-calibrated Handoff Notes (HIGH on architecture, MEDIUM on lift,
  LOW on threshold params) is unusually honest and helpful for executors.
- Cross-task validation gates (V1-V4) catch the wave-to-wave consistency
  issues that single-task validation misses.
