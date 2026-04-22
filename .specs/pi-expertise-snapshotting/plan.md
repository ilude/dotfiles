---
created: 2026-04-21
status: draft
completed:
---

# Plan: Pi expertise snapshotting

## Context & Motivation

`read_expertise` in `pi/extensions/agent-chain.ts` currently reads the full append-only expertise log (`{agent}-expertise-log.jsonl`) and returns every entry as plain text. That behavior is acceptable for tiny logs, but it scales poorly in token usage and already shows growth in this repo: the orchestrator log is 37 entries and roughly 22 KB, which is already several thousand tokens per read. The current implementation also replays repeated observations and older session noise instead of providing a compact, durable mental model.

The intended direction from the earlier discussion is to keep the raw JSONL log as the source of truth for auditability and concurrency safety, but derive a compact snapshot that consolidates repeated entries and gives `read_expertise` a bounded, cleaner output. Review of the first draft plan found several blocking gaps: the validation waves were internally inconsistent, the snapshot freshness contract was undefined, background rebuild state transitions were underspecified, and the optional Copilot/Raptor Mini similarity path expanded scope without a safe execution contract.

This revised plan fixes those issues by narrowing the MVP to a deterministic snapshot system first, explicitly defining the snapshot/read state machine, requiring TypeScript-specific validation, and turning model-assisted similarity into a documented follow-on rather than part of the first execution pass.

## Constraints

- Platform: Windows 10 / PowerShell (`pwsh`) in the current session
- Shell: pwsh
- Preserve the append-only JSONL log as the source of truth; do not delete or mutate historical expertise records
- `read_expertise` must become token-efficient and return a compact mental model instead of replaying the entire raw history
- The MVP must be deterministic-only; Copilot/Raptor Mini similarity is explicitly deferred to a follow-on plan after the deterministic snapshot path proves useful
- No background AI agent may be used for snapshot maintenance
- Background rebuilds may be best-effort, but `read_expertise` must still return correct data if the last background rebuild did not run or failed
- Snapshot state must be observable and safe under interruption: partial rebuilds must not replace the last known-good snapshot
- Documentation currently says agents read a “mental model,” but the implementation reads raw JSONL; the plan must align docs and behavior
- Verification must include Pi-specific TypeScript checks and Pi extension tests, not only repo-wide Python validation

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep `read_expertise` as full-log replay | Simplest implementation, no migration | Token cost grows forever, repeats redundant observations, mismatches the intended “mental model” concept | Rejected: does not solve the identified cost and readability problem |
| Deterministic snapshot only | Cheap, reproducible, easy to reason about, no provider dependency | Can miss semantically similar entries that are worded differently | **Selected**: this is the MVP and the only in-scope implementation for this plan |
| Background AI agent rebuild after every append | Flexible summarization, strong semantic merging | Expensive, nondeterministic, harder to debug, more orchestration than needed | Rejected: too much complexity for a maintenance path |
| Deterministic snapshot + optional Copilot/Raptor Mini tie-breaker in the same implementation pass | Better semantic merging for ambiguous entries | Adds provider/config/runtime complexity before the deterministic path is proven; review found this underdefined and risky | Rejected for MVP: capture as a follow-on after deterministic snapshotting is stable |
| Synchronous rebuild only on every append | Simplest freshness model | Slows every append and increases lock contention | Rejected: use best-effort background rebuild plus synchronous fallback on read when snapshot is missing/stale |

## Objective

Implement a deterministic expertise snapshot system for Pi that keeps raw expertise JSONL logs intact, derives a compact per-agent snapshot/mental-model file, automatically marks or rebuilds that snapshot after expertise appends, and makes `read_expertise` return a compact snapshot-based view instead of replaying the full raw history. The implementation must define a concrete freshness contract, preserve data integrity under rebuild interruption, and provide observability for stale or failed snapshot generation.

## Project Context

- **Language**: Mixed repo; target implementation is TypeScript in `pi/extensions/`, with supporting Markdown docs and Vitest tests
- **Test command**: `make test-pytest` (repo-wide) and `cd pi/tests && bun vitest run` (Pi extension tests)
- **Lint command**: `make lint-python` (repo-wide Python lint detected); Pi-specific type validation uses `python pi/extensions/tsc-check.py`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Define the snapshot contract, freshness rules, and merge policy | 3 | feature | medium | planning-lead | — |
| T2 | Add deterministic snapshot test matrix and TypeScript validation wiring | 3 | feature | medium | qa-engineer | — |
| T3 | Implement deterministic snapshot rebuild, snapshot-first reads, and observability | 4 | architecture | large | engineering-lead | V1 |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2 |
| V2 | Validate wave 2 | — | validation | large | validation-lead | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: Define the snapshot contract, freshness rules, and merge policy** [medium] — planning-lead
- Description: Document the exact runtime contract before implementation. This task defines: raw-log/source-of-truth behavior; snapshot file purpose and metadata; when a snapshot is considered fresh or stale; what `read_expertise` must do when the snapshot is fresh, stale, missing, or rebuild has failed; and exact category-aware merge rules for `strong_decision`, `key_file`, `pattern`, `observation`, `open_question`, and `system_overview`.
- Files: `pi/README.md`, `pi/multi-team/skills/mental-model.md`, `pi/extensions/agent-chain.ts` (tool description/comments only if needed to keep runtime docs aligned)
- Acceptance Criteria:
  1. [ ] The docs explicitly distinguish raw expertise history from the derived snapshot/mental model and name raw JSONL as the source of truth.
     - Verify: `rg -n "source of truth|raw expertise|snapshot|mental model" pi/README.md pi/multi-team/skills/mental-model.md pi/extensions/agent-chain.ts`
     - Pass: The search shows explicit language that JSONL remains append-only history and snapshots are the compact read path.
     - Fail: The docs still imply that `read_expertise` reads raw history directly or leave raw-vs-snapshot semantics ambiguous.
  2. [ ] The read contract is explicit for all four states: fresh snapshot, stale snapshot, missing snapshot, and failed prior rebuild.
     - Verify: `rg -n "fresh|stale|missing|failed rebuild|covers_through|dirty" pi/README.md pi/multi-team/skills/mental-model.md`
     - Pass: The docs define what `read_expertise` must return in each state, including synchronous fallback behavior when correctness would otherwise be lost.
     - Fail: Snapshot freshness is described loosely or leaves multiple plausible implementations.
  3. [ ] The merge policy is category-specific and guards against over-merging durable entries.
     - Verify: `rg -n "strong_decision|key_file|pattern|observation|open_question|system_overview" pi/README.md pi/multi-team/skills/mental-model.md`
     - Pass: Every category is covered with at least one explicit preserve/merge rule.
     - Fail: “Consolidation” remains generic and does not tell implementers how to avoid corrupting durable knowledge.

**T2: Add deterministic snapshot test matrix and TypeScript validation wiring** [medium] — qa-engineer
- Description: Add the Pi-side test and validation scaffolding for the deterministic MVP. Tests should encode the required behavior without deadlocking the wave: they may use `it.skip`/`it.todo` or equivalent for not-yet-implemented cases, but the full regression matrix must be present and named. Add or update the TypeScript validation path so the future implementation can be gated by both Vitest and `tsc-check`.
- Files: `pi/tests/agent-chain.test.ts` (new or expanded), `pi/tests/vitest.config.ts` (if include/coverage needs updating), `pi/README.md` or `pi/justfile` (only if needed to document the Pi validation commands)
- Acceptance Criteria:
  1. [ ] A deterministic snapshot regression matrix exists for raw-log preservation, fresh snapshot reads, stale snapshot fallback, missing snapshot rebuild, failed rebuild recovery, and category-aware deduplication.
     - Verify: `rg -n "raw log|fresh snapshot|stale snapshot|missing snapshot|failed rebuild|dedup|strong_decision|key_file" pi/tests/agent-chain.test.ts`
     - Pass: The test file contains named cases or TODO/skipped placeholders for each required scenario.
     - Fail: The test file only covers happy-path reads or omits failure-state scenarios.
  2. [ ] Wave 1 Pi tests pass while still encoding the future deterministic behavior to be activated in Wave 2.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts`
     - Pass: The targeted Pi tests run successfully, with pending/skipped future-behavior cases clearly labeled instead of failing the wave.
     - Fail: The wave requires failing tests to pass, or the suite is broken by missing harness/config.
  3. [ ] Pi-specific TypeScript validation is wired into the plan’s verification path.
     - Verify: `python pi/extensions/tsc-check.py`
     - Pass: The command completes successfully in the current repo state and is referenced by the updated plan as a required gate.
     - Fail: The command is not runnable, not documented, or not included in the validation path for TS changes.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `cd pi/tests && bun vitest run agent-chain.test.ts` — the deterministic snapshot regression matrix exists and the wave-1 suite passes
  3. `python pi/extensions/tsc-check.py` — Pi extension TypeScript validation passes
  4. `make lint-python` — no unrelated Python lint regressions from repo edits
  5. Cross-task integration: verify the docs and the test matrix encode the same runtime contract (raw JSONL preserved, deterministic snapshot MVP only, explicit freshness states, category-aware merge policy)
- On failure: create a fix task, re-validate after fix

### Wave 2

**T3: Implement deterministic snapshot rebuild, snapshot-first reads, and observability** [large] — engineering-lead
- Blocked by: V1
- Description: Implement the deterministic MVP in Pi. Add snapshot storage and metadata, deterministic category-aware consolidation, explicit state handling for dirty/stale/missing snapshots, safe rebuild logic, and snapshot-first `read_expertise`. Background rebuild may be best-effort after append, but correctness must not depend on it: if a snapshot is missing or stale at read time, `read_expertise` must synchronously rebuild or otherwise produce the documented correct fallback. Add observability for rebuild status/failure and keep provider-assisted similarity out of scope for this implementation pass.
- Files: `pi/extensions/agent-chain.ts`, `pi/lib/expertise-snapshot.ts` (new helper if it improves testability), `pi/tests/agent-chain.test.ts`, `pi/README.md`
- Acceptance Criteria:
  1. [ ] `append_expertise` appends to raw JSONL without mutating history and marks snapshot state in a way that is safe under interruption.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts --reporter=verbose`
     - Pass: Tests confirm raw entries remain append-only and partial rebuild failure does not destroy the last known-good snapshot.
     - Fail: Tests show raw history rewrite, missing entries, or snapshot corruption after interrupted rebuild paths.
  2. [ ] `read_expertise` no longer replays the full raw log when a fresh snapshot exists.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts --reporter=verbose`
     - Pass: Tests assert that snapshot-backed output is returned and full-history replay is not used in the fresh-snapshot path.
     - Fail: The implementation still concatenates every raw entry or uses snapshot output without bounding the returned content.
  3. [ ] Missing or stale snapshots produce correct behavior according to the documented contract.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts --reporter=verbose`
     - Pass: Tests cover missing snapshot, stale snapshot, and prior rebuild failure, proving the user receives correct expertise output rather than silently stale data.
     - Fail: The implementation returns stale snapshots without signal, or crashes/falls back to incorrect output when rebuild state is dirty.
  4. [ ] Category-aware consolidation deduplicates noisy observations while preserving durable knowledge like `strong_decision` and `key_file` entries.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts --reporter=verbose`
     - Pass: Tests show repeated observations consolidated and durable categories retained without over-merging.
     - Fail: Distinct durable entries collapse together, or repeated noisy entries remain duplicated in the snapshot.
  5. [ ] Rebuild status is observable and idempotent.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts --reporter=verbose`
     - Pass: Tests confirm repeated rebuild on unchanged input is stable and a failed rebuild leaves a detectable stale/dirty state rather than silent corruption.
     - Fail: Rebuild output changes across identical inputs or failed rebuilds leave no detectable status for reads/debugging.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [large] — validation-lead
- Blocked by: T3
- Checks:
  1. Run acceptance criteria for T3
  2. `cd pi/tests && bun vitest run` — all Pi extension tests pass
  3. `python pi/extensions/tsc-check.py` — Pi extension TypeScript validation passes after implementation
  4. `make test-pytest` — no repo-wide Python test regressions from surrounding changes
  5. `make lint-python` — no new Python lint warnings
  6. Cross-task integration: verify the implemented runtime matches the documented contract from wave 1, including raw-log preservation, deterministic-only MVP scope, explicit freshness/read behavior, idempotent rebuilds, and observable rebuild failure state
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

1. [ ] Pi expertise reads are compact and snapshot-based instead of full-history replays.
   - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts`
   - Pass: Tests confirm `read_expertise` uses a compact snapshot path for fresh snapshots and does not replay the full raw JSONL history in that state.
2. [ ] Expertise history remains auditable while repetitive entries are consolidated in the read path.
   - Verify: `rg -n "source of truth|snapshot|covers_through|dirty|failed rebuild" pi/README.md && cd pi/tests && bun vitest run`
   - Pass: Docs and tests both show that raw JSONL remains intact, snapshot state is explicit, and repeated entries are consolidated for cleaner reads.
3. [ ] The deterministic MVP is shippable without any Copilot/Raptor Mini dependency.
   - Verify: `rg -n "follow-on|out of scope|deterministic" .specs/pi-expertise-snapshotting/plan.md pi/README.md`
   - Pass: The plan/docs clearly state that provider-assisted similarity is deferred and the implemented system stands on deterministic logic alone.

## Handoff Notes

- Snapshot storage should use an explicit metadata contract, e.g. `rebuilt_at`, `covers_through_timestamp`, `source_entry_count`, and a detectable dirty/stale status. The exact file format can be JSON or YAML, but it must be atomically replaceable and easy to test.
- Best-effort background rebuild after `append_expertise` is allowed, but correctness may not depend on background success. `read_expertise` must synchronously repair missing/stale state or produce the documented safe fallback.
- Do not include Copilot/Raptor Mini integration in this execution pass. Capture it as a follow-on after the deterministic snapshot MVP is proven useful with real logs.
- The current repo test surface for Pi lives under `pi/tests/` with `bun vitest run`. Repo-wide Make targets focus mostly on Python/shell validation, so always use the Pi tests plus `python pi/extensions/tsc-check.py` for feature-level verification.
- If `pi/lib/expertise-snapshot.ts` is created, keep the compaction logic pure and deterministic so Vitest can exercise it without depending on live Pi runtime hooks.
