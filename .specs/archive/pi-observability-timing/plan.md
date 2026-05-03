---
created: 2026-05-02
status: completed
completed: 2026-05-02
---

# Plan: Pi Observability Timing Instrumentation

## Context & Motivation

Pi review and workflow runs currently lose timing detail that is needed to understand slow reviews, subagent fan-out cost, recovery overhead, and command/tool latency. The highest-value gaps are reviewer durations, aggregate panel duration, recovery durations, tool/command timings, and review synthesis that explains where time went.

This plan adds **Pi-native timing/observability instrumentation** across applicable Pi extensions and workflow customizations, especially subagent calls and `/review-it`. The work must start by inspecting existing Pi session JSONL/logs to recover any timings already emitted before designing new instrumentation. Runtime timing logs are generated local state and must not be committed.

## Constraints

- Pi-first implementation policy: prefer Pi extensions/runtime code and TypeScript for workflow/tooling changes.
- No code implementation in this planning artifact.
- First implementation step must inspect existing Pi session JSONL/logs for recoverable timings and event shapes, using metadata-only inspection with explicit minimization/redaction rules.
- Runtime timing logs, session JSONL, trace files, caches, and generated observability output are local/generated state and must not be committed.
- Preserve existing review behavior; instrumentation must be low-overhead and must not change review decisions.
- Timing should use monotonic clocks for durations where available; wall-clock timestamps are for correlation only.
- Do not record secrets, prompt bodies, command output bodies, API keys, or private file contents in timing logs. Existing log inspection must document only event names, timestamp fields, span boundaries, and sanitized path patterns; do not copy prompt/output bodies, file contents, raw session IDs, API keys, or secret-like values into notes or artifacts.
- Support degraded behavior: if timing persistence fails, workflows continue and report a warning.
- Keep summaries bounded so review synthesis remains readable.
- T1 must produce the exact targeted Pi test command(s) or an explicit documented fallback/manual-validation status; T1 must write `.specs/pi-observability-timing/test-commands.md` with `OBSERVABILITY_TEST_COMMAND` and `REVIEW_IT_TEST_COMMAND`; if either command cannot be discovered, the file must state `MANUAL_VALIDATION_REQUIRED` and later validation must use that status explicitly.
- Before writing generated timing artifacts, the implementation must name the runtime path and verify it is ignored/untracked with `git check-ignore` or an equivalent tracking check.
- Timing helpers must define a concrete TypeScript clock contract: monotonic API, duration units, wall-clock correlation fields, fallback behavior, and fake-clock injection for deterministic tests.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Parse existing session JSONL only | No runtime changes; quickest | May not contain subagent/recovery/tool timings consistently; synthesis still lacks live summaries | Rejected as complete solution; required as discovery step |
| Add ad-hoc timers directly inside `/review-it` only | Fast and targeted | Misses reusable subagent/tool/command timing; hard to extend to other workflows | Rejected |
| Pi-native shared TypeScript observability helper plus workflow integration | Reusable, testable, aligns with Pi-first policy, can power synthesis | More design/test work | **Selected** |
| External APM/tracing service | Rich dashboards | Adds dependencies, privacy concerns, overkill for local agent workflows | Rejected for V1 |
| Commit timing logs for analysis | Easy sharing | Violates source-vs-runtime policy and may leak local workflow metadata | Rejected |

## Objective

Implement a Pi-native timing/observability layer that:

- Recovers any already-available timings from existing Pi session JSONL/logs.
- Measures subagent call durations, per-reviewer durations, panel duration, recovery durations, tool timings, and command timings.
- Integrates `/review-it` so review synthesis includes concise timing summaries.
- Writes any runtime timing artifacts only to ignored/local runtime locations.
- Provides tests and validation that prove instrumentation is accurate enough, safe, bounded, and non-invasive.

## Project Context

- **Primary implementation area**: `pi/` extensions/runtime/workflow customizations.
- **Likely workflow targets**: Pi subagent tool/runtime, workflow command extensions, `/review-it` skill/command implementation, review synthesis code or prompts.
- **Language**: TypeScript for Pi extension/runtime code.
- **Validation baseline**: discover exact Pi test commands in Wave 1; final validation uses `make check` plus targeted Pi tests.
- **Runtime state policy**: generated logs/traces remain local/uncommitted; source config such as `pi/settings.json` remains trackable when intentionally edited.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Inspect existing Pi session JSONL/logs for recoverable timings | 0 | research | medium | typescript-pro | -- |
| T1 | Map relevant Pi review/subagent/tool command surfaces | 0 | research | medium | engineering-lead | -- |
| T2 | Design timing event schema and local persistence policy | 2 | design | medium | engineering-lead | T0 |
| V1 | Validate discovery/design | -- | validation | medium | validation-lead | T0, T1, T2 |
| T3 | Implement shared TypeScript timing helper and tests | 4 | feature | medium | typescript-pro | V1 |
| T4 | Instrument subagent, tool, and command timing surfaces | 4 | feature | medium | typescript-pro | V1 |
| V2 | Validate core instrumentation | -- | validation | medium | validation-lead | T3, T4 |
| T5 | Instrument `/review-it` reviewer, panel, and recovery timings | 4 | feature | medium | typescript-pro | V2 |
| T6 | Add timing summaries to review synthesis | 3 | feature | medium | planning-lead | V2 |
| V3 | Validate review integration | -- | validation | medium | validation-lead | T5, T6 |
| T7 | Document observability policy and runtime log locations | 3 | docs | medium | engineering-lead | V3 |
| V4 | Final validation and archive readiness | -- | validation | medium | validation-lead | T7 |

## Execution Waves

### Wave 1 (parallel)

**T0: Inspect existing Pi session JSONL/logs for recoverable timings** [medium] -- typescript-pro
- Description: Before adding instrumentation, inspect existing Pi session JSONL/logs and local runtime files to identify recoverable event timestamps, subagent boundaries, tool call boundaries, recovery markers, command names, and review synthesis markers. Do not modify or commit logs.
- Files: read-only inspection of `.pi/`, `pi/`, and user-local Pi runtime/session locations as applicable.
- Acceptance Criteria:
  1. [ ] Existing log/session sources and event shapes are documented with metadata-only minimization.
     - Verify: notes include sanitized file/path patterns, event names, timestamp fields, and gaps; notes do not include prompt bodies, command/tool output bodies, private file contents, raw session IDs, API keys, or secret-like values.
     - Pass: implementers know exactly what can be recovered from current JSONL/logs.
     - Fail: instrumentation starts without checking existing data.
  2. [ ] Privacy and commit-safety implications are documented.
     - Verify: notes identify generated/local paths that must remain ignored/uncommitted.
     - Pass: no runtime timing artifacts are proposed as source files.
     - Fail: plan risks committing session traces.

**T1: Map relevant Pi review/subagent/tool command surfaces** [medium] -- engineering-lead
- Description: Locate the current implementations for subagent calls, tool invocation wrappers, command execution, workflow commands, `/review-it`, recovery behavior, and review synthesis.
- Files: `pi/`, `.pi/APPEND_SYSTEM.md`, applicable workflow skill files.
- Acceptance Criteria:
  1. [ ] Surface map identifies each instrumentation hook point and owner.
     - Verify: `grep -R "subagent\|review-it\|registerCommand\|registerTool\|recovery\|synthesis" pi .pi 2>/dev/null | head -80` plus written surface-map notes.
     - Pass: each required timing category has a proposed hook point and compatibility notes for preserving existing tool/subagent contracts.
     - Fail: reviewer/panel/recovery/tool timing cannot be traced to code or workflow locations.
  2. [ ] Exact targeted Pi test commands are discovered or a fallback is documented.
     - Verify: T1 notes include concrete commands for observability and review-it tests, or explicitly state no automated command exists and manual validation is required.
     - Pass: later tasks use the commands recorded in `.specs/pi-observability-timing/test-commands.md` or explicitly carry `MANUAL_VALIDATION_REQUIRED`.
     - Fail: validation remains non-executable or placeholder-based.

**T2: Design timing event schema and local persistence policy** [medium] -- engineering-lead
- Description: Define event schema, correlation IDs, run/review/panel/reviewer spans, parent-child relationships, monotonic duration fields, wall-clock fields, status/error classification, redaction rules, and local persistence location.
- Files: design docs or proposed `pi/lib/observability/*` docs/types.
- Acceptance Criteria:
  1. [ ] Schema covers command, tool, subagent, reviewer, panel, recovery, and synthesis timing.
     - Verify: `grep -R "reviewer\|panel\|subagent\|recovery\|tool\|command\|duration" pi docs .specs/pi-observability-timing`
     - Pass: all required timing categories have fields and correlation strategy.
     - Fail: one or more required durations cannot be represented.
  2. [ ] Persistence policy keeps timing logs generated/local and ignored.
     - Verify: design names runtime path and required `.gitignore`/source-vs-runtime behavior; before any test writes timing artifacts, run `git check-ignore -v <runtime-timing-path>` or an equivalent check proving the path is ignored/untracked.
     - Pass: no generated timing logs are committed or accidentally written to a trackable source path.
     - Fail: generated observability files could be tracked by default.
  3. [ ] Design includes a post-discovery scope checkpoint.
     - Verify: design states which timings are recovered from existing logs and which gaps require new instrumentation.
     - Pass: implementation instruments only proven gaps for V1 scope.
     - Fail: plan builds broad instrumentation without using T0 findings.

### Wave 1 -- Validation Gate

**V1: Validate discovery/design** [medium] -- validation-lead
- Blocked by: T0, T1, T2
- Checks:
  1. Run all T0-T2 acceptance criteria.
  2. Confirm implementation tasks use Pi-native TypeScript extension/runtime code.
  3. Confirm no code implementation has begun before existing logs were inspected.
- On failure: create a fix task and re-run V1.

### Wave 2 (parallel after V1)

**T3: Implement shared TypeScript timing helper and tests** [medium] -- typescript-pro
- Description: Add reusable timing helpers for span start/finish, nested spans, safe serialization, bounded summaries, and persistence failure tolerance.
- Acceptance Criteria:
  1. [ ] Tests prove positive durations, nested correlation, status capture, redaction, deterministic fake-clock behavior, and retention/rotation or explicitly deferred retention behavior.
     - Verify: the `OBSERVABILITY_TEST_COMMAND` recorded in `.specs/pi-observability-timing/test-commands.md`
     - Pass: helper tests pass without writing committed artifacts.
     - Fail: timing helper is untested or leaks sensitive fields.

**T4: Instrument subagent, tool, and command timing surfaces** [medium] -- typescript-pro
- Description: Wrap applicable Pi subagent calls, tool invocations, and command execution paths with timing spans while preserving behavior and errors.
- Acceptance Criteria:
  1. [ ] Tests prove timings are emitted for success, failure, and cancellation paths without changing returned results or thrown errors.
     - Verify: the `OBSERVABILITY_TEST_COMMAND` recorded in `.specs/pi-observability-timing/test-commands.md`
     - Pass: each path emits bounded timing metadata and preserves original result/error.
     - Fail: instrumentation changes behavior or misses failure timings.

### Wave 2 -- Validation Gate

**V2: Validate core instrumentation** [medium] -- validation-lead
- Blocked by: T3, T4
- Checks:
  1. Run T3-T4 acceptance criteria.
  2. Run `make test-quick`.
  3. Run `make lint`.
  4. Confirm generated timing files are absent from `git status --short` or are ignored local state.
- On failure: fix and re-run V2.

### Wave 3 (parallel after V2)

**T5: Instrument `/review-it` reviewer, panel, and recovery timings** [medium] -- typescript-pro
- Description: Add review-specific spans for per-reviewer duration, whole panel duration, retry/recovery duration, and recovery outcome.
- Acceptance Criteria:
  1. [ ] `/review-it` tests or fixtures prove per-reviewer, panel, and recovery durations are captured.
     - Verify: the `REVIEW_IT_TEST_COMMAND` recorded in `.specs/pi-observability-timing/test-commands.md`
     - Pass: timings exist for normal and recovery scenarios.
     - Fail: review timing remains inferential or missing.

**T6: Add timing summaries to review synthesis** [medium] -- planning-lead
- Description: Update review synthesis to include concise timing summaries: total panel time, reviewer durations, slowest reviewer/tool/command, recovery time, and caveat when timings are partially unavailable.
- Acceptance Criteria:
  1. [ ] Review synthesis includes bounded timing summary when timing data exists.
     - Verify: the `REVIEW_IT_TEST_COMMAND` recorded in `.specs/pi-observability-timing/test-commands.md`
     - Pass: summary is present, concise, and stable in tests.
     - Fail: synthesis omits timing or becomes noisy.

### Wave 3 -- Validation Gate

**V3: Validate review integration** [medium] -- validation-lead
- Blocked by: T5, T6
- Checks:
  1. Run T5-T6 acceptance criteria.
  2. Run `make test-quick` and `make lint`.
  3. Manually run a disposable `/review-it` flow if test harness cannot fully simulate panel/recovery timing.
- On failure: fix and re-run V3.

### Wave 4

**T7: Document observability policy and runtime log locations** [medium] -- engineering-lead
- Description: Document timing categories, local runtime paths, redaction policy, summary semantics, and troubleshooting guidance.
- Acceptance Criteria:
  1. [ ] Docs explain where timing data is generated and that it must not be committed.
     - Verify: `grep -R "timing\|observability\|runtime\|generated\|review" docs pi .specs/pi-observability-timing`
     - Pass: future agents can use and preserve the policy.
     - Fail: runtime/source boundary remains ambiguous.

### Wave 4 -- Validation Gate

**V4: Final validation and archive readiness** [medium] -- validation-lead
- Blocked by: T7
- Checks:
  1. Run all acceptance criteria.
  2. Run the full Validation Contract below.
  3. Confirm `git status --short` contains no generated timing logs.
- On failure: update execution status and do not archive.

## Dependency Graph

```text
Wave 1: T0, T1, T2 -> V1
Wave 2: T3, T4 -> V2
Wave 3: T5, T6 -> V3
Wave 4: T7 -> V4
```

## Success Criteria

1. [ ] Existing Pi session JSONL/logs were inspected before implementation.
   - Verify: T0 notes exist and identify recoverable timings/gaps.
   - Pass: implementation decisions reference existing event shapes.
   - Fail: new instrumentation ignores available runtime data.
2. [ ] Required timing categories are captured.
   - Verify: targeted Pi observability and `/review-it` tests.
   - Pass: per-reviewer, panel, recovery, subagent, tool, and command durations are available.
   - Fail: any required category is missing.
3. [ ] Review synthesis includes timing summaries.
   - Verify: targeted `/review-it` synthesis test or manual run.
   - Pass: concise timing summary appears with caveats for partial data.
   - Fail: synthesis does not report timing.
4. [ ] Runtime timing artifacts are local/generated and uncommitted.
   - Verify: `git status --short` and ignore checks.
   - Pass: no generated timing logs are staged/tracked.
   - Fail: generated observability output appears as source.

## Risk & Rollback

- **Risk: instrumentation changes workflow behavior.** Mitigation: wrappers must preserve results/errors; tests cover success/failure/cancel paths. Rollback: disable instrumentation feature flag or remove wrapper calls.
- **Risk: sensitive data leakage.** Mitigation: schema stores metadata only; redaction tests; no prompt/output bodies. Rollback: stop persistence and purge local generated traces.
- **Risk: noisy synthesis.** Mitigation: bounded summaries and top-N slow items. Rollback: keep timing capture but hide synthesis section.
- **Risk: runtime log growth.** Mitigation: local retention/rotation policy included in T3 acceptance criteria, or an explicit V1 deferral with rationale. Rollback: reduce retention or disable persistence while keeping in-memory summaries.

## Out of Scope

- External dashboards, SaaS APM, or distributed tracing backends.
- Persisting prompt bodies, tool outputs, file contents, or secrets.
- Committing runtime timing logs or session traces.
- Rewriting review decision logic or changing reviewer responsibilities.
- Non-Pi client instrumentation unless explicitly added in a future plan.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Required automated validation

0. [ ] Discovery gate: inspect existing Pi session JSONL/logs before implementation.
   - Command: document inspected paths/event shapes from `.pi/`, `pi/`, and local Pi runtime/session locations.
   - Pass: T0 acceptance criteria pass.
   - Fail: do not implement instrumentation until this is complete.

1. [ ] Run strongest repo-wide validation.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update execution status with failing command and next fix.

2. [ ] Run targeted Pi observability/review tests.
   - Command: run the `OBSERVABILITY_TEST_COMMAND` and `REVIEW_IT_TEST_COMMAND` recorded in `.specs/pi-observability-timing/test-commands.md`; if either is marked `MANUAL_VALIDATION_REQUIRED`, complete the Manual validation section and do not archive until it passes
   - Pass: all timing and synthesis tests pass.
   - Fail: fix instrumentation/tests, then rerun targeted tests and `make check`.

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task and rerun affected checks.

4. [ ] Verify generated runtime timing logs are not committed.
   - Command: `git status --short`
   - Pass: no generated timing/session/trace artifacts are staged or tracked.
   - Fail: remove from source control, update ignore/local policy, and rerun validation.

### Manual validation

- Required: yes, unless automated Pi integration tests fully simulate a multi-reviewer `/review-it` run including recovery.
- Steps:
  1. Run a disposable `/review-it` flow with the standard six-reviewer panel, or document why an automated fixture fully covers six-reviewer fan-out timing.
  2. Trigger or simulate one recovery/retry path.
  3. Confirm review synthesis reports panel duration, per-reviewer durations, recovery duration, and slowest relevant tool/command when available.
  4. Confirm generated timing files remain local and are not shown as committable source.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update execution status, and must not archive the plan.

### Deployment validation

- Required: no.
- Procedure: None.

If deployment becomes required and is skipped, cancelled, or fails, `/do-it` must not archive this plan.

### Archive rule

`/do-it` may archive this plan only after discovery, automated validation, task-specific verification, required manual validation, deployment validation, and generated-file checks all pass.

## Handoff Notes

- Start with log/session inspection; do not skip T0.
- Prefer TypeScript in Pi extension/runtime code.
- Treat timing logs as generated local runtime state, never source.
- Keep review synthesis timing concise and caveated when data is partial.

## Execution Status

- **Classification:** completed-and-archived
- **Date:** 2026-05-02
- **Last completed wave/gate:** V4 final validation and archive readiness.
- **Manual validation:** confirmed passed by user on 2026-05-02, including six-reviewer `/review-it`/equivalent validation, recovery/retry path, timing summary confirmation, and generated artifact check.
- **Automated validation:** targeted observability/review prompt tests, extension typecheck, and `make check` passed.
- **Archive status:** ready; this plan is archived under `.specs/archive/pi-observability-timing/plan.md`.
