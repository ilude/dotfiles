---
date: 2026-07-10
status: synthesis-complete
---

# Review: Pi Orchestration Telemetry (follow-up #9)

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| Completeness | reviewer | Fresh-session execution reviewer | Tests standalone assumptions and task/checklist integrity | Hidden prerequisites, invalid dependencies, weak verification | `reviewer.md` |
| Safety | security-reviewer | Local telemetry privacy reviewer | Metrics persist local metadata and parse untrusted JSONL | Disclosure, permissions, unbounded input, rollback limits | `security-reviewer.md` |
| Scope | product-manager | Telemetry decision-product reviewer | Tests whether the MVP answers the stated decision | Outcome mismatch, scope inflation, duplicated infrastructure | `product-manager.md` |
| Runtime | typescript-pro | TypeScript and Pi lifecycle reviewer | Changes extension types, lifecycle state, and event handling | Compile failures, invalid APIs, module-state leaks | `typescript-runtime.md` |
| Execution | backend-dev | Orchestration state-transition reviewer | Foreground/background ownership and retries differ | Missing/double terminal events, lost IDs, async races | `execution-state.md` |
| Validation | qa-engineer | Verification-realism reviewer | Exact workflow and test isolation are load-bearing | Mock-only confidence, real-home writes, non-runnable gates | `verification-realism.md` |

## Standard Reviewer Findings
### reviewer
- T1 and T2 cannot be parallel while T2 must import T1's new canonical usage type.
- Orphan reconciliation lacks durable orchestration correlation and defined unknown-field semantics.
- Live smoke isolation does not cover operator/friction storage.
- Legacy TaskUsage compatibility policy is contradictory.
- Parent usage must be captured before the existing text guard.

### security-reviewer
- Existing metrics permissions and rollback do not remove already-written metadata.
- Free-form retained identifiers need a stricter metadata boundary than secret-pattern redaction alone.
- The multi-day reader requires deterministic file/line/total-byte limits.
- Archive evidence and real-home isolation checks are underspecified.

### product-manager
- The opening rationale implies a causal savings decision while the MVP is observational.
- T6 can be reduced unless each report dimension supports spend, context, latency, or quality assessment.
- Richer TaskUsage persistence may duplicate metrics, but the confirmed durable-record defects justify retaining the compatibility repair.
- Friction classification and task-execute counting were challenged as ancillary; quality comparison makes the classification useful, and the counting repair is required for accurate existing metadata.

## Additional Expert Findings
### typescript-pro
- Making `UsageStats.cost` nullable breaks aggregate arithmetic and formatting unless all consumers get an explicit nullable policy.
- `TaskExecutionRunResult` discards worker usage/model/timing, so the coordinator cannot emit the required event.
- Usage-bearing textless assistant messages are currently dropped.
- Telemetry finalization must consume a closed metadata object, never user-visible error/output text.
- Module-level registration needs an explicit activate/register/settle/reset lifecycle bridge.

### backend-dev
- Background orchestration IDs must be persisted before launch so crash reconciliation can reuse them.
- The runner result contract must carry normalized content-free telemetry.
- The active-interaction owner and bridge are undefined.
- stop timeout followed by late completion can cause missing or duplicate terminal events without idempotent settlement ownership.
- Parent usage must be recorded before text handling.

### qa-engineer
- The live smoke has no exact Pi startup/invocation/capture command and incorrectly says no credentials are needed.
- Existing subagent/task tests do not redirect `PI_METRICS_DIR`.
- The runtime-smoke criterion claims a lib default-export invariant the test does not check.
- F5 and evidence recording are not executable.
- T6 needs a command-registration/dispatch test, not only aggregation helpers.

## Suggested Additional Reviewers
- data-engineer -- useful after implementation if aggregation formulas or cohort exports expand.
- privacy-engineer -- useful if telemetry adds user/repository identifiers beyond the current closed schema.
- performance-engineer -- useful only if bounded multi-day scans become measurably slow.

## Bugs (must fix before execution)
1. Serialize T1 before T2 or extract the canonical usage contract first; the current parallel wave is internally inconsistent.
2. Define one canonical nullable usage type and update every subagent aggregation/formatting consumer, not only persistence paths.
3. Extend the background runner result with normalized usage/model/timing/byte data; coordinator emission cannot reconstruct it.
4. Persist background `orchestrationId`, `interactionId`, and attempt start time before launch; define nullable unknown fields for orphan reconciliation.
5. Make terminal background settlement idempotent across success, stop timeout, shutdown, orphan reconciliation, and late completion.
6. Define a lib-owned interaction lifecycle bridge: activate, register, record parent usage, settle/consume, and reset on session replacement/shutdown.
7. Capture assistant usage independently of text, including usage-only tool-call messages.
8. Resolve the TaskUsage compatibility contradiction with an exact write policy and legacy-transition fixtures.
9. Make test/live isolation cover metrics, operator tasks, and workflow-friction storage through resolved roots; do not hardcode the home path in the report.
10. Replace the aspirational live smoke with exact executable Pi commands, existing-auth expectations, bounded provider use, settlement wait, and captured evidence.
11. Add executable evidence/archive gates and the required `## Execution Status` section.
12. Narrow the objective from determining causal savings to producing descriptive evidence; matched-corpus conclusions remain explicitly deferred.

## Hardening
1. Bound reader files, line bytes, total bytes, and malformed records; report truncation diagnostics.
2. Validate retained provider/model/agent values as identifiers in addition to sanitization; add representative credential-shaped cases.
3. Add a slash-command registration/dispatch test for `/orchestration-stats`.
4. Document that rollback does not erase existing metrics, include a purge command, and warn against shared/synced metrics directories. Permission changes to the shared metrics writer are outside this telemetry-specific plan unless handled as a separate cross-cutting task.
5. Remove the unsupported `pi/lib` default-export runtime-smoke claim rather than adding a repository rule that does not exist.

## Simpler Alternatives / Scope Reductions
1. Keep the friction join because the user goal includes quality, but omit concurrency-overlap as an MVP headline unless its formula is directly tested and documented; wall duration and child-work duration are sufficient.
2. Keep normalized TaskUsage persistence because it repairs confirmed durable-record defects, but share one type/normalizer with event emission and do not add report-only fields twice.
3. Keep per-model grouping because parent model switching is real; do not add effort attribution or historical backfill.

## Automation Readiness
- Agent-runnable operational steps: not ready before fixes; exact live Pi invocation and isolation commands are missing.
- Credential/auth flow clarity: current plan incorrectly says none; live model smoke must use existing Pi provider auth without reading or copying secrets.
- Evidence and archive gates: incomplete; F5 has no command and `## Execution Status` is absent.
- Manual-only steps and justification: no user manual gate is necessary if `/do-it` uses one bounded invocation with already-configured Pi auth, but inability to authenticate blocks exact workflow validation and archive.

## Contested or Dismissed Findings
1. Changing shared metrics directory/file permissions was not accepted as a must-fix for this plan. The stream already stores comparable metadata, the target platform is Windows, and changing shared writer semantics is cross-cutting. Documentation, purge semantics, and isolated paths are retained as hardening.
2. Removing friction classifications was rejected: the stated goal includes avoiding quality/validation regression, and the existing friction store is the designated evidence source. The report should keep the join but avoid unrelated analytics.
3. Removing normalized TaskUsage persistence was rejected: the three durable usage defects were independently confirmed and background orchestration needs a content-free result contract. The fix must remain additive and share the canonical type.
4. Adding a new test that bans default exports from `pi/lib` was dismissed as a false-positive requirement; no such discovery invariant exists. The plan should test only the basename collision and extension factory rules that runtime-smoke actually owns.

## Verification Notes
1. Confirmed `TaskExecutionRunResult` contains only output and exitCode (`pi/extensions/tasks/execution.ts:30-43`) and `runTaskSubagent` discards `SingleResult` usage/model before coordinator settlement.
2. Confirmed persisted task execution has runId but no orchestrationId/interactionId/start timestamp (`pi/lib/task-registry.ts:35-57`), so orphan joinability is impossible as written.
3. Confirmed `stop()` times out after seven seconds while the promise remains live and `shutdown()` only awaits `stop()`, creating a late-settlement race.
4. Confirmed workflow-friction active state is extension-closure-local and message_end returns on empty text before any future usage accounting.
5. Confirmed `interactionMetadataFromPacket` still checks the nonexistent `task_execute` name while `isTaskExecutionTrace()` exists elsewhere.
6. Confirmed metrics append uses default directory/file permissions and a soft cap only. Permission hardening is cross-cutting; reader bounds are telemetry-plan scope.
7. Confirmed current subagent/task-execution tests set `PI_OPERATOR_DIR` but not `PI_METRICS_DIR`.
8. Confirmed runtime-smoke does not enforce the plan's claimed lib default-export rule.
9. Confirmed the plan refers to `## Execution Status` but contains no such heading.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `review-1/reviewer.md` | read | usable; category labels normalized during synthesis |
| security-reviewer | `review-1/security-reviewer.md` | read | usable |
| product-manager | `review-1/product-manager.md` | read | usable |
| typescript-pro | `review-1/typescript-runtime.md` | read | usable; used fallback markdown shape rather than constrained frontmatter, findings actionable |
| backend-dev | `review-1/execution-state.md` | read | usable; used fallback markdown shape, findings actionable |
| qa-engineer | `review-1/verification-realism.md` | read | usable; used fallback markdown shape, findings actionable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | 4m43s | wall clock 2026-07-10T23:58:29Z to 2026-07-11T00:03:12Z; per-reviewer timing unavailable |
| Artifact reads | <1m | all six expected artifacts existed, were non-empty, and were read; preview text was not used |
| Recovery calls | 0 | no missing or unusable artifact |
| Verification | ~4m | targeted repository reads; no commands beyond static search were needed |
| Synthesis | unknown | coordinator timing not separately instrumented |

## Review Metrics
- `review_panel_decision`: complexity_score 6; risk_score 2; recommended_count 6; selected reviewers: completeness, safety/privacy, product scope, TypeScript runtime, execution state, and QA realism. Expected high-risk areas were legacy schema compatibility, interaction lifecycle, async background settlement, test isolation, and byte/privacy accounting.
- `review_yield`: 28 raw findings; 12 unique must-fix defects; 5 hardening items; 7 duplicate/overlapping findings merged; 2 low-value/theater scope proposals; 1 false-positive requirement dismissed; 12 bug/readiness fixes and 5 hardening changes applied; 3 proposals rejected/dismissed; readiness improved materially but remains blocked by one rollback defect found after the allowed repair passes.
- `panel_quality_inputs`: findings change Wave 1 dependency structure; expand T1/T4/T5 contracts; add timeout/orphan tests; replace live validation commands and credential assumptions; add evidence/archive mechanics and Execution Status; narrow the objective's causal claim.

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-orchestration-telemetry/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed after each repair set; required headings and checklist IDs are unique, no executable item is checked, dependencies align
- Standalone-readiness result: STANDALONE READY (pass 3, after a user-requested blocker repair; see `standalone-readiness-pass-3.md`)
- Repair passes used: 3 (2 in-review plus 1 user-requested blocker fix, validated against a rollback fixture)

## Review Artifact
Wrote full synthesis to: `.specs/pi-orchestration-telemetry/review-1/synthesis.md`

## Overall Verdict
**Ready to execute; optional hardening remains**

## Recommended Next Step
- Execute via `/do-it .specs/pi-orchestration-telemetry/plan.md`.
- Optional hardening: symlink/empty-directory shape verification in rollback and an executable non-scratch metrics purge command.
