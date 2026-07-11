# Workflow Eval Operations

This document explains what was added for Pi workflow eval telemetry, what data
is expected from future `/plan-it`, `/review-it`, and `/do-it` runs, and how to
use that data to improve the workflow system.

See also: `pi/docs/workflow-eval-telemetry.md` for the field-level schema.

---

## Ownership Boundary

Workflow telemetry owns command-lifecycle episodes, phases, and workflow evidence. Orchestration telemetry owns delegation topology, worker and parent usage, cost, output-byte handling, and run status. Correlate the two only through explicit IDs: workflow records use their episode and artifact identifiers, while orchestration records use `interactionId`, `orchestrationId`, `runId`, and optional `taskId`. Neither stream infers ownership or joins from timestamps, names, or paths.

## Current State

The current implementation has three layers.

1. Runtime dispatch telemetry
   - `pi/lib/workflow-telemetry.ts` records workflow command episodes.
   - `/plan-it`, `/prd-it`, `/review-it`, and `/do-it` dispatches write JSONL
     records under `~/.pi/workflow-telemetry/`.
2. Prompt contracts
   - `/plan-it` requires plan profile and review-panel decision data.
   - `/review-it` requires review yield and per-reviewer yield data.
   - `/do-it` requires execution outcome, post-run eval, and panel quality data.
3. Analysis documentation
   - JSONL is the source of truth.
   - DuckDB is the recommended analysis engine and optional rebuildable cache.
   - DuckDB is not required for normal workflow completion.

The runtime currently captures dispatch-level data. Detailed plan, review,
validation, archive, and post-run eval data are prompt-contracted and should be
recorded in plans, review artifacts, or telemetry artifacts until runtime tools
append those records directly.

## Why We Are Collecting This

The target outcome is to reduce manual command steps over time. In particular,
we want enough evidence to decide when `/review-it` can be embedded into
`/plan-it` and how many reviewers a plan needs based on complexity, risk, and
scale.

The data must answer three linked questions:

1. What did the system predict the plan needed?
2. What did review actually find?
3. What happened when the plan was executed?

If any one of those is missing, we can audit a single run but cannot learn a
reviewer sizing policy.

## Records Needed Per Plan Lifecycle

### 1. Plan profile

Captured by `/plan-it`.

Purpose: describe plan complexity and risk before review.

Key fields:

- domains
- estimated file count
- task count
- wave count
- dependency depth
- validation command count
- external system count
- deployment required
- manual gate required
- credentials required
- risk level
- blast radius
- rollback clarity
- destructive potential
- paid or quota resource use
- secret exposure risk
- shared-user impact

### 2. Review panel decision

Captured by `/review-it` today and future embedded plan review later.

Purpose: explain why a reviewer count and reviewer mix were selected.

Key fields:

- review strategy: `manual-review-it` or `embedded-plan-review`
- complexity score
- risk score
- recommended reviewer count
- selected reviewers
- selection reason for each reviewer
- expected value for each reviewer
- expected high-risk areas

### 3. Review yield

Captured after review synthesis and plan edits.

Purpose: measure whether review produced useful signal or noise.

Key fields:

- total findings
- must-fix findings
- hardening findings
- duplicates
- low-value/theater findings
- false positives
- findings applied
- findings rejected
- whether execution readiness changed
- per-reviewer findings, applied count, false positives, and low-value findings

### 4. Execution outcome

Captured by `/do-it` after a terminal state.

Purpose: connect review quality to actual execution results.

Key fields:

- completion classification
- completed boolean
- blocked by plan gap boolean
- validation failures after review
- manual gate ambiguity
- archive issue
- issues missed by review

### 5. Panel quality label

Captured by `/do-it` after execution outcome is known.

Purpose: label whether the panel was under-sized, right-sized, or over-sized.

Key fields:

- sizing: `under_reviewed`, `right_sized`, `over_reviewed`, or `unknown`
- reason
- confidence

## How To Use The Data

Use this sequence for periodic evals.

1. Gather records
   - Read `~/.pi/workflow-telemetry/episodes.jsonl`.
   - Read `~/.pi/workflow-telemetry/**/events.jsonl`.
   - Read matching archived plans and review artifacts when detailed runtime
     events are not available.
2. Join lifecycle records by `episode_id` and `artifact_path`.
3. Group by plan profile features.
4. Compare review panel decision to review yield.
5. Compare review yield to execution outcome.
6. Label panel quality.
7. Turn repeated gaps into prompt, runtime, test, or docs changes.

Useful questions:

- Which reviewer personas produce applied findings most often?
- Which reviewer personas produce false positives or low-value findings?
- Which plan profiles are over-reviewed?
- Which plan profiles are under-reviewed?
- Which risk signals predict missed execution issues?
- Which validation gaps survive review and appear during `/do-it`?
- Which manual gates are downgraded repeatedly?
- Which archive failures or collisions repeat?

## DuckDB Query Examples

DuckDB should query JSONL directly. Do not make normal workflow commands write
to DuckDB.

Read all events:

```sql
SELECT *
FROM read_ndjson_auto(
  '~/.pi/workflow-telemetry/**/events.jsonl',
  union_by_name = true
);
```

Reviewer yield by persona:

```sql
WITH events AS (
  SELECT *
  FROM read_ndjson_auto(
    '~/.pi/workflow-telemetry/**/events.jsonl',
    union_by_name = true
  )
)
SELECT
  reviewer.persona,
  sum(reviewer.findings) AS findings,
  sum(reviewer.applied) AS applied,
  sum(reviewer.false_positives) AS false_positives,
  sum(reviewer.low_value_theater) AS low_value_theater
FROM events,
UNNEST(review_yield.per_reviewer) AS reviewer
WHERE event_type = 'review_yield'
GROUP BY reviewer.persona
ORDER BY applied DESC;
```

Panel sizing outcomes:

```sql
SELECT
  panel_quality_label.sizing,
  count(*) AS runs
FROM read_ndjson_auto(
  '~/.pi/workflow-telemetry/**/events.jsonl',
  union_by_name = true
)
WHERE event_type = 'panel_quality_label'
GROUP BY panel_quality_label.sizing
ORDER BY runs DESC;
```

Plan profiles with missed review issues:

```sql
SELECT
  artifact_path,
  execution_outcome.classification,
  execution_outcome.validation_failures_after_review,
  execution_outcome.missed_by_review
FROM read_ndjson_auto(
  '~/.pi/workflow-telemetry/**/events.jsonl',
  union_by_name = true
)
WHERE event_type = 'execution_outcome'
  AND (
    execution_outcome.validation_failures_after_review > 0
    OR len(execution_outcome.missed_by_review) > 0
  );
```

## Helper Script

`pi/scripts/workflow-eval-query.py` provides a local summary helper.

Run from the repo root:

```bash
python pi/scripts/workflow-eval-query.py
```

Use a custom telemetry directory:

```bash
python pi/scripts/workflow-eval-query.py --telemetry-dir ~/.pi/workflow-telemetry
```

The script uses DuckDB when the Python `duckdb` package is available. If DuckDB
is not installed, it falls back to a standard-library JSONL summary so the tool
is still useful on a fresh machine.

## What To Commit

Default policy:

- Commit schema docs, prompt contracts, tests, and helper scripts.
- Do not commit raw `~/.pi/workflow-telemetry/` data.
- Do not commit `.duckdb` files.
- Commit derived eval summaries only when they are part of an intentional audit
  or spec artifact.

## Suggested AGENTS Guidance

Add or keep a short Pi-local rule that says:

- Workflow telemetry JSONL is runtime state and should not be committed by
  default.
- DuckDB files are rebuildable analysis caches and should not be committed.
- When changing `/plan-it`, `/review-it`, `/do-it`, or workflow telemetry code,
  update `pi/docs/workflow-eval-telemetry.md`, this operations document, and
  prompt-contract tests when the data contract changes.

## Next Implementation Steps

1. Add a hidden telemetry append tool for prompt-executed workflow phases.
2. Emit detailed `plan_profile`, `review_panel_decision`, `review_yield`,
   `execution_outcome`, and `panel_quality_label` events directly from workflow
   execution when possible.
3. Add validation for required fields by event type.
4. Run several plan-review-execute cycles and inspect reviewer yield.
5. Use the observed data to design adaptive embedded review in `/plan-it`.
