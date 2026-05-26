---
status: research-note
source: ../../../../../pi/docs/workflow-eval-telemetry.md
---

# Adaptive Plan Review Telemetry

## Why this matters

The current Pi workflow uses separate `/plan-it`, `/review-it`, and `/do-it`
steps. The long-term direction is to reduce command count by letting `/plan-it`
embed the right amount of review automatically, based on plan complexity, risk,
and scale.

That decision should be data-driven. We need to know when review panels are
useful, noisy, under-sized, or over-sized before replacing the manual
`/review-it` step.

## Useful signals

Current implementation in the dotfiles repo:

- Runtime dispatch telemetry records workflow command episodes for `/plan-it`,
  `/prd-it`, `/review-it`, and `/do-it`.
- JSONL is the source of truth under `~/.pi/workflow-telemetry/`.
- DuckDB is the preferred analysis engine and optional rebuildable cache, not a
  hot-path write store.
- `pi/docs/workflow-eval-telemetry.md` defines the field-level schema.
- `pi/docs/workflow-eval-operations.md` explains how to use the data and query
  it.
- `pi/scripts/workflow-eval-query.py` gives a small local summary helper with a
  DuckDB path and a standard-library fallback.

The key lifecycle records are:

1. `plan_profile` -- domains, file/task/wave counts, dependency depth,
   validation count, risk, blast radius, rollback, credentials, deployment, and
   manual-gate signals.
2. `review_panel_decision` -- complexity score, risk score, reviewer count,
   selected reviewer personas, selection reasons, and expected high-risk areas.
3. `review_yield` -- finding counts, applied/rejected findings, duplicates,
   low-value/theater findings, false positives, and per-reviewer yield.
4. `execution_outcome` -- completion classification, validation failures after
   review, plan gaps discovered during execution, manual-gate ambiguity, archive
   issues, and missed reviewer issues.
5. `panel_quality_label` -- whether the panel was `under_reviewed`,
   `right_sized`, `over_reviewed`, or `unknown`, with reason and confidence.

Together these records answer:

- Which reviewer personas produce useful applied findings?
- Which reviewers produce false positives or low-value findings?
- Which plan profiles need more review?
- Which plan profiles can use fewer reviewers?
- Which review misses show up later during `/do-it`?
- When is manual review mostly ceremony?

## Possible Pi fit

The eventual Pi behavior could be:

```text
/plan-it <goal>
  -> generate plan
  -> score complexity/risk/scale
  -> select reviewer count and personas
  -> run embedded review automatically when warranted
  -> write review-yield data
  -> produce a plan ready for /do-it
```

This would reduce the user-facing command surface while preserving the useful
parts of `/review-it`.

The first implementation should not remove `/review-it`. It should gather enough
real run data to decide the embedded-review policy safely.

## Risks / reasons not to build yet

- Review-count policy could be tuned from too few examples.
- Reviewer panels can create process theater if measured only by finding count.
- False precision in complexity/risk scores could hide judgment calls.
- Capturing more data is not useful unless it is queried periodically.
- Moving review into `/plan-it` too early could make planning slower and harder
  to interrupt.
- Runtime detailed telemetry is still incomplete; dispatch events exist, but
  detailed lifecycle events still rely partly on prompt contracts.

## KISS recommendation

Keep this as a thin, data-gathering slice for now:

1. Keep JSONL append-only telemetry as the source of truth.
2. Use DuckDB only for local analysis.
3. Run several real `/plan-it` -> `/review-it` -> `/do-it` cycles.
4. Query reviewer yield and missed execution issues.
5. Only then design adaptive embedded review in `/plan-it`.

Do not remove `/review-it` until the collected data shows which plan profiles can
be safely reviewed automatically and how many reviewers they need.

## Related notes

- [DuckDB for Pi usage analytics](duckdb-for-pi-usage-analytics.md)
- [Pipelines and policies](pipelines-and-policies.md)
- [Specs workflow trajectory](specs-workflow-trajectory.md)
- [Specs-derived roadmap](specs-derived-roadmap.md)
- [Workflow eval telemetry spec](../../../../../pi/docs/workflow-eval-telemetry.md)
- [Workflow eval operations](../../../../../pi/docs/workflow-eval-operations.md)
