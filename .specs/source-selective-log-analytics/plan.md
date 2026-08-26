---
created: 2026-08-25
status: ready
---

# Restore source-selective Pi log analytics

## Objective

Replace the eager global Pi analytics refresh with one source-selective, invocation-local `@duckdb/node-api` execution path that supports bounded read-only SQL and existing typed operations, streams bounded results, isolates source failures and concurrent calls, returns a machine-readable `complete | partial | failed` coverage state, and preserves the structural-data safety boundary.

## Completion Evidence

- Evidence: Focused tests show that a dated orchestration query discovers and scans only declared orchestration inputs, two simultaneous read-only calls complete independently and cancellation of one does not interrupt the other, an oversized or malformed unrelated session record is never opened, selected-source failures and truncation produce a machine-readable partial or failed state, bounded SQL and typed select/aggregate use the same execution engine without changing existing typed return shapes, and valid junction-backed runtime paths remain accepted while path escapes are rejected.
- Fails when: Any query refreshes an undeclared source, shares mutable connection or transaction lifetime with another invocation, accumulates the full selected corpus or full result in JavaScript, accepts mutation/external-access/content-bearing SQL, hides incomplete coverage, or fails because of an unrelated source record.

## Boundaries

- In scope: `pi/extensions/log-analytics-tool.ts`, `pi/lib/log-analytics/{api,store,registry,readers,session-analytics,orchestration-analytics}.ts`, their existing typed callers, focused analytics tests, `pi/README.md`, and the observability/tool contract needed to describe the changed operator-facing behavior.
- Out of scope: Replacing `@duckdb/node-api`, changing append-only JSONL producers, redesigning domain-owned reports such as `/find-fails`, adding Arrow, worker pools, schedulers, retries, or restoring the removed Python environment.
- Preserve: Structural/content separation, canonical-root and link safety after trusted root canonicalization, disabled DuckDB external access, bounded rows/bytes/time, cancellation, JSONL authority, disposable database state, existing typed `catalog`, `select`, and `aggregate` callers, and unrelated working-tree changes.
- Assumptions: The model-facing SQL surface is limited to one read-only `SELECT` or `WITH ... SELECT` over explicitly declared structural sources; content-bearing session or trace fields remain unavailable. `/do-it` must create and own the implementation worktree before changing files, then archive, commit, merge with `--no-ff`, verify merged HEAD, and remove only its owned worktree and branch.

## Tasks

- [ ] **T1: Prove a source-selective DuckDB execution slice**
  - Files: `pi/lib/log-analytics/api.ts`, `pi/lib/log-analytics/store.ts`, `pi/lib/log-analytics/registry.ts`, `pi/tests/log-analytics-store.test.ts`, `pi/tests/log-analytics-tool.test.ts`, `pi/tests/log-analytics-boundary.test.ts`
  - Change: Add the smallest invocation-local, in-memory path with separate source-scan and result budgets. It must canonicalize each trusted root and candidate immediately before opening, reject traversal or links escaping the canonical root, discover only explicitly declared structural sources within an explicit optional `timeWindow`, create connection-local temporary relations, and give each call its own connection and cancellation boundary. Disable and verify DuckDB external access before creating relations or processing caller SQL. Stream result chunks while enforcing row and encoded-byte budgets without full-result JavaScript materialization. Return deterministic diagnostics plus `complete | partial | failed`; define malformed, oversized, unreadable, scan-limit, result-limit, and cancellation outcomes so incomplete rows are never indistinguishable from complete results. Use DuckDB parsing/planning to require exactly one read-only statement, then authorize every referenced relation, table function, and projected column against the declared structural-source schemas; regex must not be the sole authority. Run the extension typecheck before expanding beyond this slice.
  - Done when: A focused test simultaneously queries selected orchestration fixtures through separate calls; cancelling or closing one call does not affect the other; an undeclared oversized session fixture is never opened; valid in-root junctions pass while traversal and escaping links fail; rows stay within result budgets; source work stays within scan budgets; and diagnostics distinguish complete, partial, and failed outcomes.
  - Verify: `cd pi && pnpm run typecheck && pnpm test log-analytics-store.test.ts log-analytics-tool.test.ts log-analytics-boundary.test.ts`

- [ ] **T2: Consolidate the public tool and remove eager ingestion**
  - Files: `pi/extensions/log-analytics-tool.ts`, `pi/lib/log-analytics/api.ts`, `pi/lib/log-analytics/store.ts`, `pi/lib/log-analytics/registry.ts`, `pi/lib/log-analytics/readers.ts`, `pi/lib/log-analytics/session-analytics.ts`, `pi/lib/log-analytics/orchestration-analytics.ts`, affected typed caller tests, `pi/tests/log-analytics-parity.test.ts`, `pi/tests/log-analytics-boundary.test.ts`, `pi/README.md`, `pi/skills/pi-extension/references/contracts/observability.md`
  - Depends on: T1
  - Change: Route bounded SQL plus existing typed `select` and `aggregate` requests through the proven selected-source engine while preserving catalog and typed caller return compatibility through the existing adapter boundary. Classify and update or preserve every current custom store caller before removing its mechanism. Delete global all-source refresh, shared mutable connection lifetime, row-by-row full-corpus projection ingestion, and regex-only query enforcement that the new path supersedes. Document declared-source execution, explicit time-window pruning, separate scan/result budgets, and coverage status without changing domain-owned command contracts.
  - Done when: Existing typed callers and custom session/orchestration readers retain their public result shapes and tests; bounded SQL cannot mutate state, access metadata tables, undeclared relations, content-bearing columns, filesystem/glob/URL/network functions, extension loading, or secrets; incomplete coverage is machine-visible; and no superseded global refresh or shared connection cache remains.
  - Verify: `cd pi && pnpm test log-analytics-parity.test.ts log-analytics-store.test.ts log-analytics-tool.test.ts log-analytics-boundary.test.ts && pnpm run typecheck`

## Validation

- [ ] A focused fixture query limited to June-August orchestration data reports only orchestration inputs scanned and succeeds with `complete` coverage while an unrelated May session fixture contains an oversized line; T1 and T2 verification commands pass all specified safety, compatibility, concurrency, budget, and partial-coverage cases.

## Retention

Keep incomplete work at `.specs/source-selective-log-analytics/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/source-selective-log-analytics/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/source-selective-log-analytics/plan.md`
