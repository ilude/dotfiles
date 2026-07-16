---
date: 2026-07-15
status: applied
---

# Applied Fixes

| Finding | Category | Target sections | Edit intent | Checklist impact |
|---------|----------|-----------------|-------------|------------------|
| Fresh-session runtime packages are undeclared | process defect | Constraints, Automation Plan, Dependency Truth Table, V1, final gates | Run dependency linker once, verify all required package paths, and fail if any package is absent | Add prerequisite checks to T1/V1 and final validation |
| Public action schema is underspecified | substantive defect | MVP Boundary, new Public Action Contract, T3 | Define TypeBox fields, bounds, unknown-property compatibility, per-ID vocabulary, content/details envelopes, order, duplicates, and caller actions | Replace vague T3 criteria with contract tests |
| Wait ownership/state behavior is incomplete | substantive defect | new Wait Truth Table, T3, T4 | Define every task-state/ownership row, repeated wait, races, and normal aborted result | Add unchecked acceptance cases to T3/T4 |
| Workspace execution boundary is missing | substantive defect | Constraints, Public Action Contract, T3 | Require current-workspace IDs for new multi-ID actions and no state changes on rejection | Add workspace isolation test |
| Batch edge ordering and blocker validation are incomplete | substantive defect | T1, V1, Success Criteria | Require all records written before reverse-edge reconciliation; reject missing/tombstoned blockers | Expand T1 tests |
| Public abort and concurrency proof is weak | process defect | T3, T4, V2/V3 | Add unresolved runner barriers, public signal tests, post-abort settlement, exact action sequence, and no polling timer assertions | Expand coordinator/tool tests |
| Multi-task TUI details are not specified | substantive defect | Project Context, T3, targeted lint/tests | Use one typed multi-task details envelope and update renderer if needed | Add task-renderer file/test to T3 and gates |
| Foreign and failed-to-stop execution can be reopened | substantive defect | Wait Truth Table, T3 | Classify external/failed-to-stop as non-startable; require explicit recovery before new execution | Add ownership/lifecycle tests |
| Implementation process is over-fragmented | low-value/theater | Task Breakdown, Execution Checklist, Execution Waves, Dependency Graph | Consolidate coordinator and public action implementation into one integration task/wave while preserving one validator per wave | Renumber T3/T4 and V2/V3; reduce one wave |
| Exact graph shape reads like product contract | low-value/theater | MVP Boundary, T4 | Label graph as representative behavioral fixture proving three outcomes | Clarify T4 acceptance only |
| Batch crash transaction journal | hardening/deferred | Explicit Deferrals, T1 | Keep deterministic validation and successful two-phase publication; explicitly surface non-atomic I/O failure and conservative forward-edge behavior | Add injected I/O-failure test; no journal task |
| Absolute paths and custom cwd | hardening/deferred | Explicit Deferrals, Public Action Contract | Preserve existing behavior; prevent accidental cross-workspace invocation | No new executable task |
| Broad credential-format audit | hardening/deferred | Explicit Deferrals, Telemetry and Evidence | Test only newly exposed fields; retain existing sanitizer boundary | No new executable task |
| External comparison rationale | simplification | Context and Motivation | Remove nonessential product comparisons; rely on repository evidence | No checklist change |

## Post-change fixes

| Finding | Category | Target sections | Applied change | Checklist impact |
|---------|----------|-----------------|----------------|------------------|
| Preflight had no executable owner | process defect | Execution Checklist, Task Breakdown, Execution Waves | Added T0/V0 dependency setup and package verification before source work | Added two unchecked items and dependencies |
| Archive state had no ready transition | process defect | F5, F6, Archive rule, Execution Status | Added explicit complete/ready transition, copy/compare/publish verification, archived transition, and source removal only after verification | Added F6 and updated dependency graph |
| Shared-file preservation conflicted with docs work | process defect | Constraints, T2, T4, Handoff | Authorized only exact task guidance/README/changelog blocks with before/after diff preservation | No new item |
| Graph batch was unbounded | substantive defect | Constraints, Public Action Contract, T3 | Added 16-task schema/runtime limit and 4,096-byte complete alias bound | Expanded T3 checks |
| Batch failure could not locate partial IDs | substantive defect | Graph-aware batch, T1 | Added operation ID, phase, generated/persisted ID recovery envelope and deterministic clear-then-tombstone recovery test | Expanded T1 checks |
| Per-ID start persistence failure had no vocabulary | substantive defect | result vocabulary, truth table, T3 | Added `start_failed`, compensation semantics, and no-runner assertion | Expanded T3 checks |
| Details could not align missing/foreign IDs | substantive defect | Public Action Contract, T3 | Replaced parallel records/results arrays with positional results containing optional authorized record | Mandatory renderer work in T3 |
| Canonical broad gate could test stale links | process defect | T3, Makefile, F2 | Required linker after frozen install in `check-pi-extensions` and package checks afterward | Added Makefile to T3 |
| Exact workflow did not prove aliases are actionable | process defect | T4 | Required all later IDs to come from complete batch alias response with no reads | Expanded T4 test |
| Failed-to-stop could reopen through legacy start | substantive defect | result vocabulary, truth table, T3 | Required shared coordinator rejection and explicit stop/orphan recovery before both execute paths | Expanded lifecycle parity tests |

## Standalone repair passes

| Pass | Applied domains | Result |
|------|-----------------|--------|
| 1 | Reconciled `start_failed`, empty batch compatibility, dependency bounds, complete owned paths, dependency-link recovery, post-checklist archive, required `make check`, host preflight, and required section order | Readiness remained blocked |
| 2 | Added truth-preserving `make test-ci`, exact linker target/tools/order, normalized duplicate rejection, broader ownership matrix, pre-mutation baseline/rollback proof, readiness predicate, per-item archive evidence intent, resume branches, and final required heading order | Readiness remained blocked |

## Unresolved after repair budget

The final readiness artifact identifies three remaining blockers: active plus `failed_to_stop` precedence, deterministic UTF-8 budgeting for eight-result envelopes, and an ID-associated archive ledger parser. They are copied to `standalone-readiness-blockers.md`. No further plan edits were made after the second repair pass.

## Intentional omissions

- No batch transaction journal, cross-process lock, claims, leases, or scheduler is added. The MVP reports non-atomic I/O failure explicitly and never claims that a failed batch left no files.
- No absolute-path hiding or custom working-directory removal is added because those are existing compatibility behaviors.
- No broad sanitizer redesign is added because new actions return compact states and artifact references rather than worker output.

## Section integrity expectations

- Preserve all unchecked checklist items; mark none complete.
- Required headings remain unique and gain an explicit `## Execution Status` section required by the review workflow.
- IDs are renumbered consistently after wave consolidation.
