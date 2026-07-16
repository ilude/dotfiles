---
date: 2026-07-15
status: blocked
---

# Review: Durable mixed task DAG runner

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| Completeness | reviewer | Standalone completeness and automation reviewer | Fresh-session execution and contract integrity | Hidden prerequisites, ambiguous commands, weak acceptance | `reviewer.md` |
| Security | security-reviewer | Registry and execution safety reviewer | Durable state, workspace execution, rollback, evidence | Partial writes, cross-workspace execution, path and evidence exposure | `security-reviewer.md` |
| Scope | product-manager | MVP scope and simplicity reviewer | Challenge orchestration complexity and user value | Over-engineering, duplicate gates, unclear outcomes | `product-manager.md` |
| Type/API | typescript-pro | TypeScript extension and provider-schema reviewer | TypeBox, result envelopes, signals, renderer behavior | Schema drift, completion races, abort semantics | `typescript-api-reviewer.md` |
| Durable state | backend-dev | Filesystem DAG state-transition reviewer | Multi-file records and reverse-edge invariants | Write ordering, dangling edges, ownership races | `durable-state-reviewer.md` |
| Validation | qa-engineer | Behavioral concurrency and regression reviewer | Exact mixed workflow and lifecycle parity | False-positive tests, hidden polling, weak barriers | `workflow-validation-reviewer.md` |

## Standard Reviewer Findings
### reviewer
- Fresh-session validation omits the required runtime-package linker and deterministic package existence check.
- Public schemas and per-ID result contracts are underspecified.
- Wait behavior lacks a complete ownership/state truth table.
- Public AbortSignal propagation is inspected rather than behaviorally tested.

### security-reviewer
- Same-batch multi-file publication can leave partial durable state after I/O failure or interruption.
- New multi-ID actions lack current-workspace authorization.
- Absolute artifact paths and caller-supplied working directories need an explicit compatibility and exposure decision.
- Evidence redaction claims exceed the focused validation currently planned.

### product-manager
- Four implementation waves plus repeated gates create avoidable coordination overhead.
- Multi-classification action outcomes lack caller-next-action semantics.
- Guidance checks are repeated across surfaces.
- The representative four-node graph should be identified as a test fixture, not the product contract.

## Additional Expert Findings
### typescript-pro
- The TypeBox action/input contract, unknown-property policy, bounds, and runtime validation are not specified.
- The coordinator already routes through registry `startTask`; the claim that fan-out necessarily bypasses readiness is incorrect, but the public layer still needs explicit blocked classification.
- Wait needs deterministic deduplication, request ordering, race-safe promise capture, and durable rereads.
- Abort needs an optional signal contract and a normal compact aborted result without worker cancellation.
- New multi-task details will not render usefully unless they use the current `records` shape or extend `task-renderer.ts`.

### backend-dev
- Reverse declaration order can omit derived `blocks` edges unless batch writes and edge reconciliation are explicitly two-phase.
- Existing UUID blockers need explicit existence and tombstone validation.
- Batch I/O failure needs an honest non-atomic contract or a recoverable publication mechanism.
- Duplicate/concurrent starts and metadata-write failure need explicit ownership and partial-result semantics.
- `failed_to_stop` and external-running records need stale-settlement protection or a recovery-only classification.

### qa-engineer
- The exact action sequence and absence of public polling need instrumentation.
- Wait abort must occur while controlled workers remain active, then workers must settle normally.
- Concurrent start needs a barrier proving all runner entries occur before any release.
- External-running results need a stable immediate classification.
- Every new model-visible action needs measurable field and byte bounds.

## Suggested Additional Reviewers
- task-renderer specialist -- useful if implementation chooses a new details envelope rather than reusing `records`
- filesystem recovery specialist -- useful before promoting batch publication to crash-recoverable semantics
- operator UX reviewer -- useful after the MVP has measured usage of manual-ready and externally-running classifications

## Bugs (must fix before execution)
1. Add a fresh-session dependency setup step that runs `scripts/pi-deps-link-setup`, verifies every required linked package exists, and fails when the script silently skips unavailable global packages.
2. Define the complete public TypeBox input contract and compact content/details envelopes for graph-aware batch, `execute_many`, and `await`, including bounds, unknown-property policy, deterministic order, duplicate handling, stable classifications, error truncation, and caller next actions.
3. Define a race-safe wait truth table for missing, blocked, pending manual, pending executable, same-coordinator active, terminal, external-running, `failed_to_stop`, duplicate, already-aborted, and mid-wait-aborted inputs.
4. Enforce current-workspace ownership for `execute_many` and `await`; preserve legacy single-ID compatibility only if explicitly documented and tested.
5. Make graph creation two-phase so all new records exist before reverse-edge reconciliation; reject missing and tombstoned existing blockers before writes.
6. Add public-handler abort tests, barrier-based concurrent start tests, external ownership tests, exact action-sequence/no-public-poll tests, and measurable context bounds.
7. Preserve TUI details by selecting the existing `records` envelope or adding a typed renderer branch plus renderer tests.
8. Prevent fan-out from reopening or overwriting live foreign or `failed_to_stop` executions; define the recovery transition required before a new run.

## Hardening
1. Batch publication is not crash-atomic today. For this local MVP, narrow the guarantee to deterministic validation before writes, successful two-phase publication, and explicit surfaced I/O failure with conservative forward-edge readiness. Defer a transaction journal until interrupted batch recovery is an observed requirement.
2. Keep absolute artifact-path and custom execution-cwd behavior compatible in this MVP, but ensure cross-workspace IDs cannot trigger it accidentally. Record opaque artifact references as a later compatibility project rather than silently changing current paths.
3. Treat task artifact sanitization as the existing best-effort boundary. Add only regression cases for fields newly returned by `await`; defer a broad credential-format audit.

## Simpler Alternatives / Scope Reductions
1. Consolidate coordinator and public action implementation into one integration wave after registry graph creation, followed by one exact workflow/docs wave.
2. Retain the template-required final gates but remove redundant implementation-wave command repetition where one focused gate proves the same contract.
3. Use one documented per-ID result vocabulary across `execute_many` and `await`; avoid a second scheduler or queue state model.
4. Remove nonessential external product comparisons from the executable plan; repository evidence owns implementation decisions.

## Automation Readiness
- Agent-runnable operational steps: not ready until dependency linking, package existence checks, exact action contracts, and race-safe tests are added.
- Credential/auth flow clarity: no credentials are required; global runtime packages are a prerequisite, not a credential gate.
- Evidence and archive gates: checklist/archive structure is usable, but task output artifacts must remain outside archive evidence and current unrelated edits must be preserved.
- Manual-only steps and justification: none required for this local reversible change.

## Contested or Dismissed Findings
1. Crash-atomic batch publication was contested. Security and scope reviewers required a journal; the durable-state reviewer showed that forward `blockedBy` drives readiness and reverse `blocks` is derived. Verified repository evidence confirms no automatic scheduler exists and single-record operations are already non-transactional across reverse-edge writes. The journal is downgraded to deferred hardening; the plan must state explicit I/O-failure semantics and conservative readiness tests.
2. The claim that coordinator fan-out inherently bypasses readiness is false: `TaskExecutionCoordinator.start` calls registry `startTask`, which checks unmet blockers. Public per-ID blocked outcomes still need contract tests.
3. Hiding absolute artifact paths and forbidding custom working directories would change existing supported behavior and is not required by the objective. Current-workspace execution authorization is required instead.
4. A broad secret-format audit is outside this plan because worker output sanitization already exists and new actions should return references, not output. New envelope fields still need absence/redaction assertions.
5. The representative two-worker graph is retained as one behavioral fixture, not a required graph shape.

## Verification Notes
1. `Makefile` runs `scripts/pi-deps-link-setup` in `check-pi-ci` but not `check-pi-extensions`; `pi/tests/vitest.config.ts` fails when linked runtime packages are absent.
2. `TaskExecutionCoordinator.start` calls `startTask`, confirming readiness remains registry-owned.
3. Tool `list` and `ready` are workspace-scoped, while `get`, `execute`, `stop`, and `output` accept an ID without a workspace check.
4. `formatTaskToolResult` understands `record`, `records`, and `output`, but no proposed per-task results envelope.
5. Registry task writes and reverse-edge rewrites are separate file replacements; forward `blockedBy` drives readiness.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `reviewer.md` | read | usable constrained artifact |
| security-reviewer | `security-reviewer.md` | read | usable; category labels were domain-specific |
| product-manager | `product-manager.md` | read | usable exact-schema artifact |
| typescript-pro | `typescript-api-reviewer.md` | recovered and read | initial artifact lacked required structure; one targeted retry succeeded |
| backend-dev | `durable-state-reviewer.md` | read | usable despite abbreviated metadata fields |
| qa-engineer | `workflow-validation-reviewer.md` | read | usable despite abbreviated metadata fields |
| security rebuttal | `rebuttal-security-batch-atomicity.md` | read | argued for journal or removal of batch |
| durable-state rebuttal | `rebuttal-durable-batch-atomicity.md` | read | supported explicit non-atomic MVP contract |
| scope rebuttal | `rebuttal-product-batch-scope.md` | read | argued that durable promise requires local recovery |
| post-change reviewer | `post-change-reviewer.md` | read | archive transition and prerequisite findings applied |
| post-change security | `post-change-security-reviewer.md` | read | workspace/cwd finding narrowed; recovery envelope applied |
| post-change scope | `post-change-product-manager.md` | read | batch bound and alias-driven workflow applied |
| post-change TypeScript | `post-change-typescript-api.md` | read | start failure and positional details applied |
| post-change durable state | `post-change-durable-state.md` | read | failed-to-stop and recovery semantics applied |
| post-change validation | `post-change-workflow-validation.md` | read | linker, renderer, workspace, abort, and archive fixes applied |
| standalone readiness | `standalone-readiness.md` | read | blocked after initial run and two repair passes |
| standalone blockers | `standalone-readiness-blockers.md` | written | three unresolved domains preserved after budget exhaustion |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | 5m03s | wall clock 19:06:44Z to 19:11:47Z; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected reviewer artifacts read; preview text was not used |
| Recovery calls | 2m16s | TypeScript artifact recovery completed by 19:14:03Z |
| Rebuttal | 2m18s | targeted three-reviewer batch durability rebuttal completed by 19:16:21Z |
| Verification | unknown | static repository evidence checked after rebuttal |
| Synthesis | unknown | per-step timing unavailable |
| Post-change panel | unknown | six medium reviewers; completed 19:28:33Z; per-reviewer timing unavailable |
| Pre-readiness audit | unknown | prerequisites, commands, exact workflow, mutation/rollback, archive, and checklist checks passed after one deterministic repair cycle |
| Standalone readiness | unknown | initial large review plus two large retries; final retry completed 20:57:46Z |

## Review Panel Decision
- `plan_profile`: architectural-workflow
- `review_panel_decision`: six reviewers selected; targeted rebuttal required for batch durability scope
- Complexity: 7/10
- Risk: 5/10
- Expected high-risk areas: filesystem publication, completion races, abort ownership, workspace authorization, compact provider envelopes, renderer parity

## Review Yield
- Raw findings: 27
- Merged must-fix domains: 8
- Merged hardening domains: 3
- Duplicates: 1
- Low-value/theater: 2
- False positives: 1 confirmed readiness-bypass claim
- Applied: 8 merged initial must-fix domains, 10 post-change contract/readiness fixes, and 2 required scope reductions
- Rejected or deferred: transaction journal, cross-process claims, absolute-path redesign, broad sanitizer audit, and unsupported readiness-bypass claim
- Readiness change: not ready -> pre-readiness audit passed -> still not ready after two standalone repair passes
- Per-reviewer yield: reviewer 4; security-reviewer 4; product-manager 4; typescript-pro 5; backend-dev 5; qa-engineer 5

## Panel Quality Inputs
- Changed task structure: recommended wave consolidation and explicit batch publication ordering.
- Changed validation commands: required dependency linking, public abort tests, barriers, exact action sequence, renderer tests, and byte bounds.
- Changed manual-gate decision: no change; automated validation remains sufficient.
- Changed archive rules: task outputs remain excluded from review/archive evidence.
- Changed automation readiness: package and workflow contracts improved materially, but final execution remains blocked by three unresolved standalone defects.

## Pre-Readiness Audit

- Repository prerequisites: passed. Required host commands and every named repository file exist; T0/V0 own frozen setup, linking, and package checks.
- Command truth tables: passed after repairing independent archive status assertions and post-install linker checks.
- Exact workflow boundary: passed. Commands run from repository root or `pi/` exactly as documented; no alternate runtime was introduced.
- Mutation and rollback: passed. Shared files use targeted edits; batch I/O failure has a bounded recovery envelope; archive copy is verified before active removal.
- Archive before/after: passed after adding complete/ready/archived transitions, temporary target checks, copy comparison, independent status checks, final presence checks, and failure preservation.
- Checklist/schema integrity: passed after archive relocation became a post-checklist state. Required headings occur once in required order; 14 executable items map one-to-one across checklist, table, details, and dependencies; all remain unchecked.
- Audit repair cycles used: 1 of 2.

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-task-dag-runner/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed after every plan edit
- Standalone-readiness result: `BLOCKED`
- Repair passes used: 2 of 2
- Remaining blocker artifact: `.specs/pi-task-dag-runner/review-1/standalone-readiness-blockers.md`

## Review Artifact
Wrote full synthesis to: `.specs/pi-task-dag-runner/review-1/synthesis.md`

## Final Standalone Blockers

1. Active-map precedence conflicts with the `failed_to_stop` row for a representable timed-out runner state.
2. Eight-result model-visible envelopes lack a deterministic UTF-8 overflow budget for Unicode errors and long output paths.
3. Archive ledger verification counts fields independently instead of validating one complete record per exact checklist ID.

These are detailed in `.specs/pi-task-dag-runner/review-1/standalone-readiness-blockers.md`. The plan remains active, unchecked, and unarchived.

## Overall Verdict
**Review blocked by exhausted repair budget**

## Recommended Next Step
- Repair the three standalone blockers, then run `/review-it .specs/pi-task-dag-runner/plan.md` again. Do not run `/do-it` yet.
