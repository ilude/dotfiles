---
created: 2026-05-02
status: draft
completed:
review:
  - review-1/synthesis.md (applied: 5 bugs, 8 hardening)
---

# Plan: Pi Memory Retrieval Follow-ups -- Promotion, Snapshot Retirement, and Backend Decision

## Context & Motivation

The Pi Expertise Memory v2 MVP has been executed and archived at:

```text
.specs/archive/pi-memory-retrieval/plan.md
```

That MVP added opt-in semantic retrieval, deterministic eval scaffolding, an in-memory expertise index, a retrieval API, and agent-chain integration. The eval summary recorded `decision: PROCEED`, but the prior review intentionally deferred three higher-risk follow-ups:

- frequency-threshold promotion candidates
- snapshot archival/deletion
- scalable backend evaluation

They were deferred because promotion can expose cross-repo private facts, snapshot deletion removes live fallback machinery, and scalable backend work is only justified by measured corpus size or latency.

## Objective

Implement and validate the safe follow-up path for Pi expertise memory:

1. A **local-only promotion candidate scanner** that identifies repeated non-procedural claims across repos and emits human-reviewed markdown candidates without mutating procedural memory.
2. A **snapshot archive and retirement workflow** that defaults to dry-run, archives existing `mental-model*.json` files with SHA256 manifests and restore instructions, and deletes live snapshots only after explicit confirmation, restore smoke, and regression gates.
3. A **backend decision record** that measures current in-memory performance and decides whether a separate backend-specific plan is warranted for DuckDB+vss, DuckDB+DuckPGQ, Kùzu, or Graphify-style graph output.

## Constraints

- Promotion candidates are local/private artifacts and must not be committed by default.
- Procedural memory must never be auto-promoted; humans manually move approved policies into procedural files.
- Snapshot deletion must be reversible via an archive and restore recipe.
- No destructive git or filesystem operation without explicit confirmation.
- Do not implement a scalable backend in this plan.
- Keep current in-memory retrieval as the default unless a future backend plan proves a need.
- Preserve Windows/Git Bash compatibility; use `just` wrappers where possible.
- Candidate scanner, archive tooling, and backend decision must not write secrets or fetched private facts to tracked repo files.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Auto-promote repeated claims into global memory | Fast, autonomous | Privacy and correctness risk | Rejected |
| Keep snapshots forever | Lowest deletion risk | Keeps duplicate systems and snapshot churn | Rejected as final state, acceptable fallback until this plan passes |
| Delete snapshots immediately after MVP eval | Simplifies code | Too risky after one eval pass | Rejected |
| Implement DuckDB+vss now | More scalable | Premature; current corpus is small | Rejected |
| Decide backend with measured data only | Avoids premature infra | Requires a decision artifact before implementation | Selected |

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|---|---|---|---|---|---|
| T1 | Implement local-only promotion candidate scanner | 3-5 | feature | medium | typescript-pro | — |
| T2 | Validate promotion scanner privacy and clustering behavior | 1-2 | validation | medium | qa-engineer | T1 |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2 |
| T3 | Implement snapshot archive/restore dry-run workflow | 4-6 | feature | medium | typescript-pro | V1 |
| T4 | Remove live snapshot dependency behind restore/regression gates | 4-8 | architecture | large | engineering-lead | T3 |
| V2 | Validate wave 2 | — | validation | medium | validation-lead | T3, T4 |
| T5 | Backend decision record | 2-3 | research | medium | planning-lead | V2 |
| V3 | Final validation and archive decision | — | validation | medium | validation-lead | T5 |

## Execution Waves

### Wave 1 — Promotion candidates only

**T1: Implement local-only promotion candidate scanner** [medium] — typescript-pro

Implement a scanner based on the deferred promotion concept from the archived MVP plan.

Expected behavior:

- Reads expertise JSONL logs and/or current memory index rows.
- Uses the same local scoring backend as current retrieval; if using placeholder embeddings, clearly labels output as provisional.
- Normalizes text before similarity comparison: trim, collapse whitespace, lowercase for comparison, preserve original canonical text for output.
- Clusters similar non-policy claims with greedy single-link similarity threshold `0.85`.
- Deduplicates per repo before counting repo span.
- Emits candidates only when a cluster spans `>=3` distinct repos.
- Uses medoid as canonical text, earliest timestamp as tiebreak.
- Excludes existing `kind='policy'` rows.
- Writes only to:

```text
~/.pi/agent/index/policy-candidates.md
```

Potential files:

- `pi/scripts/memory-promote-scan.ts`
- `pi/tests/memory-promote-scan.test.ts`
- `pi/justfile`

Acceptance criteria:

1. Duplicate claim across 3 repos emits one candidate.
2. Two duplicates in repo A plus one each in B/C counts as 3 repos, not 4 entries.
3. Single-repo and two-repo claims do not emit candidates.
4. Existing `kind='policy'` rows are excluded from candidate output.
5. Output contains `cluster_id`, canonical text, contributing ids, spanning repos, and a `LOCAL PRIVATE -- DO NOT COMMIT WITHOUT REVIEW` warning.

**T2: Validate promotion scanner privacy and clustering behavior** [medium] — qa-engineer

Create adversarial tests for privacy and false positives.

Acceptance criteria:

1. Candidate file is written only under `~/.pi/agent/index/`, not `.specs/` or tracked repo paths.
2. `git status --short` does not show `policy-candidates.md` or any generated candidate output.
3. If a repo-local ignore rule is needed, add it before scanner output can be generated in the repo.
4. Tests cover near-duplicate, unrelated, same-repo-only, two-repo-only, per-repo dedup, and existing-policy cases.
5. Running scanner on current corpus either emits candidates or writes an explicit “no qualifying candidates” section.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead

Checks:

```bash
cd pi/tests && bun vitest run memory-promote-scan.test.ts
cd pi && just memory-promote-scan
git status --short | grep -E 'policy-candidates|agent/index' && exit 1 || true
```

Pass conditions:

- Tests green.
- Candidate output is local-only.
- No procedural memory file is modified.
- No generated candidate output is tracked or staged.

### Wave 2 — Snapshot archive and retirement

**T3: Implement snapshot archive/restore dry-run workflow** [medium] — typescript-pro

Implement archive tooling that defaults to dry-run. Prefer separate recipes over ambiguous argument forwarding:

```text
just memory-snapshot-archive-dry-run
just memory-snapshot-archive-confirm
```

Confirm mode must also require an explicit script flag such as `--confirm`; the just recipe alone is not sufficient.

Archive target:

```text
~/.pi/agent/index/archive/{ISO-ts}/
```

Archive must include:

- mirrored `*-mental-model*.json` files
- `restore.md`
- `manifest.json` containing archived file paths and SHA256s
- command transcript or log

Acceptance criteria:

1. Dry-run prints exact files that would be archived and later deleted.
2. Confirm mode requires explicit `--confirm` and never runs by default.
3. Archive manifest SHA256s match source files.
4. Archive path collision is handled by timestamp suffix or refusal; no overwrite.
5. Failed archive attempts clean up partial temp directories or clearly mark them incomplete.
6. Restore instructions copy archived files into a temp directory and parse every JSON file.
7. Archive retention policy is documented: keep for at least 30 days unless user explicitly deletes it.

**T4: Remove live snapshot dependency behind restore/regression gates** [large] — engineering-lead

Only after T3 archive restore smoke passes, remove live snapshot dependence.

Expected behavior:

- Remove snapshot loader/regenerator paths from `agent-chain.ts` and supporting libs.
- Keep JSONL logs as source of truth.
- Ensure startup uses procedural files + retrieval block.
- Delete live `*-mental-model*.json` files only after archive exists, SHA256s match, restore smoke passes, and explicit confirmation is supplied.
- Produce `.specs/pi-memory-followups/test-delta.md` for any changed/deleted tests.

Pre-delete checks:

```bash
grep -R "mental-model\|snapshot" pi/extensions pi/lib pi/tests
```

The check must document expected remaining references. Unexpected live snapshot references block deletion.

Acceptance criteria:

1. Archive exists and restore smoke passes before deletion.
2. Restore smoke uses a temp profile or temp `PI_HOME` equivalent and proves restored files parse and can be read by the legacy snapshot loader or restore script.
3. Code-reference grep has no unexpected live snapshot dependencies.
4. No live `*mental-model*.json` files remain under `pi/multi-team/expertise/` after confirm mode.
5. Targeted tests pass:

```bash
cd pi/tests && bun vitest run memory-eval memory-retrieve.test.ts
```

6. No new skipped tests are introduced; compare pre/post Vitest skipped count or parse test output mechanically.
7. Documentation explains restore policy and snapshot retirement.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead

Checks:

```bash
find pi/multi-team/expertise -name '*mental-model*' | wc -l
cd pi/tests && bun vitest run memory-eval memory-retrieve.test.ts
grep -R "mental-model\|snapshot" pi/extensions pi/lib pi/tests
```

Pass conditions:

- Snapshot count is 0 only after archive + restore smoke + confirm mode.
- Retrieval remains functional.
- Unexpected live snapshot references are gone.
- Documentation updated.
- No new skipped tests.

### Wave 3 — Backend decision record

**T5: Backend decision record** [medium] — planning-lead

Do not implement a backend swap. Measure and document whether a new backend-specific plan is warranted.

Evaluate:

- current in-memory retrieval
- DuckDB+vss
- DuckDB+DuckPGQ
- Kùzu
- Graphify-style `graph.json` / NetworkX file graph

Measurement requirements for current in-memory backend:

- active row count
- rebuild time, 3 runs, warm cache
- retrieval p50/p95/p99 over a fixed query set of at least 20 representative tasks
- memory/index file size
- Windows behavior

Decision thresholds:

- Stay in-memory if active rows `<2000` and retrieval p99 `<100ms`.
- Open backend-specific plan if active rows `>=2000`, retrieval p99 `>=100ms`, or graph traversal queries become a first-class requirement.
- Prefer Kùzu for graph-native traversal, DuckDB+DuckPGQ for SQL-first analytics over node/edge tables, DuckDB+vss for vector-only scale, and Graphify-style files for architecture orientation.

Acceptance criteria:

1. Write `.specs/pi-memory-followups/backend-decision.md`.
2. Include measured current in-memory stats and exact commands used.
3. Include comparison table for all candidates.
4. Recommend one of: stay in-memory, create Kùzu plan, create DuckDB+DuckPGQ plan, create DuckDB+vss plan, create Graphify integration plan.
5. If recommending backend work, identify the first backend and why.

### Wave 3 — Validation Gate

**V3: Final validation and archive decision** [medium] — validation-lead

Checks:

1. Promotion scanner tests pass.
2. Snapshot-retirement tests pass if snapshot retirement was confirmed.
3. Backend decision file exists and contains a recommendation.
4. No local-only candidate files are tracked by git.
5. The user explicitly confirms whether to archive this plan after execution.

## Success Criteria

1. Promotion candidates can be generated locally without auto-promoting or committing sensitive cross-repo facts.
2. Snapshot retirement is reversible and verified before live deletion.
3. Retrieval remains functional after snapshot retirement.
4. Backend work is either deferred with measured justification or split into a new backend-specific plan.
5. No generated local-only files under `~/.pi/agent/index/` are tracked or staged.
6. Plan execution leaves a clear backend decision record.

## Deployment Procedure

None. This is local tooling and documentation only.

## Follow-up Items

- If Kùzu or DuckDB+DuckPGQ looks promising, create a separate backend-specific plan.
- If promotion candidates are high quality, consider a human approval workflow for moving policies into procedural memory.
- If snapshot retirement is too risky, keep snapshots archived but live until a later deletion-only plan.
