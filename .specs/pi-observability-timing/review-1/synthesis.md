---
date: 2026-05-02
status: synthesis-complete
---

# Review: Pi Observability Timing Instrumentation

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | Assume implementers lack conversation context and weak criteria will pass falsely |
| security-reviewer | security-reviewer | Failure-mode/privacy reviewer | Mandatory standard reviewer | Assume local/session inspection can leak or mishandle sensitive metadata |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer | Assume the plan overbuilds before proving existing logs are insufficient |
| typescript-pro | typescript-pro | TypeScript runtime instrumentation and build/toolchain reviewer | Primary implementation is Pi-native TypeScript runtime/extension code | Assume async wrappers alter behavior/errors or create brittle tests |
| devops-pro | devops-pro | Local runtime persistence, CI, and generated-artifact safety reviewer | Plan adds local generated observability state and repo validation | Assume generated files become tracked or tests depend on machine-local state |
| qa-engineer | qa-engineer | Observability verification realism and regression-test reviewer | Success depends on accurate, deterministic tests and review-flow validation | Assume tests pass while timing remains missing, flaky, or non-representative |

## Standard Reviewer Findings
### reviewer
- HIGH: placeholder validation commands (`{exact Pi test command from T1}`) appear in implementation and final validation, so execution can finish with unresolved verification steps.
- MEDIUM: hook-point discovery says to map surfaces, but does not require an explicit compatibility strategy for existing tool/subagent contracts.
- MEDIUM: acceptance criteria rely on grep matches in several places, which can pass without proving functional behavior.

### security-reviewer
- HIGH: T0 permits broad inspection of `.pi/` and user-local runtime/session locations without a concrete minimization/redaction protocol for private session metadata.
- MEDIUM: rollback says disable/remove wrappers, but does not define a safe emergency disable path or how partial persisted traces are purged.
- MEDIUM: failure persistence warnings are required, but the plan does not bound warning content to avoid leaking paths/session identifiers.

### product-manager
- MEDIUM: the selected shared observability helper may be premature before T0 proves existing session timestamps cannot provide enough review timing for V1.
- MEDIUM: V1 does not force an explicit “reuse existing logs vs build new instrumentation” decision checkpoint.
- LOW: summary scope includes slowest reviewer/tool/command; V1 should constrain the initial UX to avoid dashboard creep.

## Additional Expert Findings
### typescript-pro
- HIGH: monotonic timing is stated as a constraint but no concrete TypeScript clock API/fallback contract is required, risking inconsistent duration semantics across runtimes.
- MEDIUM: async span lifecycle requirements do not explicitly cover concurrent subagents, thrown errors, cancellations, and finally-block completion semantics.
- MEDIUM: safe serialization/redaction is required, but tests need fixtures proving prompt/tool output bodies cannot enter timing payloads.

### devops-pro
- HIGH: persistence policy requires a runtime path and ignore behavior but does not require validation that the chosen path is actually ignored before writing artifacts.
- MEDIUM: retention/rotation is only a risk mitigation, not an acceptance criterion, so log growth can be left unimplemented.
- MEDIUM: validation uses `git status --short`, which catches visible untracked files but not necessarily accidentally tracked generated paths added earlier.

### qa-engineer
- HIGH: unresolved placeholder test commands make the validation contract non-executable until T1 replaces them with exact commands.
- MEDIUM: duration accuracy is underspecified; tests can prove only positive durations without checking clock injection/tolerance or deterministic fake timers.
- MEDIUM: manual validation requires “at least two reviewers,” but the production `/review-it` contract uses six reviewers, so it may miss panel fan-out timing issues.

## Suggested Additional Reviewers
- typescript-pro -- Relevant because instrumentation helpers/wrappers are TypeScript runtime code; focus on clock API, async spans, serialization, and build/test integration.
- devops-pro -- Relevant because timing artifacts are generated local state; focus on ignore policy, retention, CI reproducibility, and rollback safety.
- qa-engineer -- Relevant because the plan’s value depends on tests that prove timing accuracy and non-invasive behavior; focus on deterministic verification and false-positive acceptance criteria.

## Bugs (must fix before execution)
1. Replace or gate all placeholder test commands before implementation can complete. Evidence: lines 127, 135, 156, 164, and 258 contain `{exact Pi test command from T1}`. Required fix: make T1 produce a named test-command artifact and update later tasks/validation to fail if that artifact is absent; final validation must reference concrete commands or a documented skip with status `implemented-awaiting-manual-validation`.
2. Add an explicit privacy/minimization protocol for inspecting existing local/session logs. Evidence: line 78 allows inspection of `.pi/`, `pi/`, and user-local runtime/session locations; constraints prohibit secrets/private contents but T0 lacks concrete grep/read limits. Required fix: require metadata-only inspection, path allow/deny patterns, no prompt/output body capture, and documentation of inspected fields without copying sensitive values.
3. Require a concrete runtime persistence path plus pre-write ignore/tracking validation. Evidence: T2 only says design a runtime path and required `.gitignore` behavior; current repo ignores `.pi/`, but no future timing path is named or checked. Required fix: T2/T3 must name the generated location and verify `git check-ignore` or equivalent before persistence tests write artifacts.

## Hardening
1. Specify the TypeScript timing clock contract: preferred monotonic API, fallback behavior, units, fake-clock injection for tests, and wall-clock correlation rules.
2. Convert grep-only acceptance checks into functional assertions where possible, especially for emitted timing events, redaction, bounded summaries, and behavior preservation.
3. Promote retention/rotation from risk mitigation into acceptance criteria for the persistence helper or explicitly defer it from V1.
4. Require an explicit post-T0 decision checkpoint: reuse existing session timings where sufficient, instrument only proven gaps.
5. Expand manual `/review-it` validation to the standard six-reviewer panel or document why a smaller fixture covers fan-out behavior.

## Simpler Alternatives / Scope Reductions
1. Treat T0 as a hard design gate: if existing JSONL timestamps can recover panel/reviewer durations, implement synthesis parsing first and postpone generalized tool/command spans.
2. For V1, limit synthesis to panel duration, reviewer durations, and recovery duration; defer slowest arbitrary tool/command summaries until core review timing is stable.
3. Prefer a small local metadata event format over a broad tracing abstraction unless T1 proves multiple Pi surfaces share the same wrapper needs.

## Contested or Dismissed Findings
1. Product concern that the whole shared helper is overbuilt was downgraded from must-fix to hardening/scope control: the objective explicitly includes subagent, tool, and command timings, so some shared helper may be justified after T0/T1.
2. Security concern about warning messages leaking paths was kept as hardening, not a bug, because the plan already prohibits prompt/output/secret capture and the path leak risk is secondary unless persistence warning content is defined unsafely.

## Verification Notes
1. Placeholder command bug confirmed by `grep -n "{exact Pi test command" .specs/pi-observability-timing/plan.md`, matching lines 127, 135, 156, 164, and 258.
2. Log-inspection privacy bug confirmed by plan line 78 and constraints lines 24-27: broad local/session inspection is allowed, but only general secret prohibitions are provided.
3. Persistence/ignore bug confirmed by plan lines 99 and 107 and `git check-ignore -v .pi/`, which shows `.pi/` is ignored now but no named observability path is validated.

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unavailable | 6 reviewers completed; per-reviewer timing unavailable |
| Recovery calls | not run | No reviewer output required recovery |
| Verification | unavailable | Used grep, git check-ignore, and git status |
| Synthesis | unavailable | Artifact path: .specs/pi-observability-timing/review-1/synthesis.md |

## Review Artifact
Wrote full synthesis to: `.specs/pi-observability-timing/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the three must-fix plan edits before execution.
- Then execute via `/do-it .specs/pi-observability-timing/plan.md`.
