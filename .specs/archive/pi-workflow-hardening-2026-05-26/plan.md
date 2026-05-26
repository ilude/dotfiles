---
created: 2026-05-26
status: completed
completed: 2026-05-26
---

# Plan: Harden Pi Workflow Prompt Contracts

## Context & Motivation

A local audit of Pi workflow behavior was completed under `.specs/pi-workflow-audit/` and reported in `.specs/pi-workflow-audit/report.md`. The audit found recurring friction across `/plan-it`, `/review-it`, and `/do-it`: execution depends on plan paths, checklist state, review artifacts, validation gates, manual-gate decisions, and archive state all agreeing. When those contracts drift, `/do-it` becomes resume-sensitive and can misclassify completion.

The user selected a focused follow-up: update Pi workflow prompts and prompt-contract tests, while capturing machine-readable telemetry requirements for future runs. The implementation should not build a full runtime telemetry system in this pass unless it is trivial and already aligned with the prompt-only contract. The requested policy decisions are: keep safe downgrading of over-strict manual gates, and archive completed plans by default.

## Constraints

- Platform: Windows checkout under Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`) at `C:/Users/mglenn/.dotfiles`.
- Shell: use bash for git, pnpm, make, and repo commands.
- Pi workflow source ownership: prompt-only workflow guidance lives under `pi/skills/workflow/`; prompt-contract tests live under `pi/tests/`.
- Pi TypeScript/test validation is pnpm-only. Do not use npm or bun for Pi TypeScript/tests.
- File content in `pi/` must use ASCII punctuation only.
- No implementation changes to runtime TypeScript commands are required for the MVP unless prompt-contract tests reveal a tiny existing-contract mismatch.
- Keep safe manual-gate downgrade behavior: `/do-it` may downgrade over-strict manual gates when the operation is local, reversible, non-destructive, and covered by automated validation; it must record the reason.
- Archive completed plans by default unless a plan explicitly opts out with rationale.
- Machine-readable telemetry is required as a workflow contract in this pass; runtime telemetry implementation is deferred unless trivial.
- Do not change `/commit` behavior in this plan. The known `/commit` empty-argument interpolation issue is a separate cleanup.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy through git revert
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This plan edits local prompt/test files and validates through automated prompt-contract tests and repo-wide checks. It does not deploy, mutate external state, spend quota, expose secrets, or affect shared production users.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Prompt-only patch | Smallest change and low risk | Could drift again without tests | Rejected: insufficient durability |
| Prompt patch plus prompt-contract tests | Low risk, locks the new workflow contract, fits one focused session | Telemetry remains a documented requirement rather than full runtime instrumentation | **Selected** |
| Full runtime telemetry and adaptive reviewer fan-out | Strongest future audit data and possible performance improvement | Larger scope, TypeScript changes, higher risk of mixing policy and runtime behavior | Deferred: plan separately after prompt contracts are stable |
| Require user confirmation for every manual validation mention | Conservative and simple | Adds unnecessary burden for safe local reversible work | Rejected: user chose safe downgrade rule |
| Always ask before archiving | Avoids surprise archive moves | Keeps completed plans active and increases resume ambiguity | Rejected: user chose archive by default |

## Objective

Update Pi workflow prompts and prompt-contract tests so fresh `/plan-it`, `/review-it`, and `/do-it` runs produce and enforce clearer executable plan contracts, anti-theater review schemas, machine-readable telemetry requirements, safe manual-gate downgrade behavior, and default archive-on-completion behavior.

## MVP Boundary

The MVP is a prompt/test hardening pass. A user-visible success is: `pi/tests/workflow-prompts.test.ts` verifies the workflow prompt contracts, targeted Pi tests pass, and `make check` passes. This is small enough for one focused session because it touches existing prompt files and tests only.

## Explicit Deferrals

- Full runtime telemetry implementation in `pi/extensions/**`.
- Adaptive reviewer fan-out enforced by TypeScript runtime.
- New structured telemetry storage schema beyond prompt-required artifact fields.
- Refactoring historical workflow commands or agent definitions.
- `/commit` prompt interpolation cleanup.

## Project Context

- **Language**: Markdown prompt files plus TypeScript/Vitest prompt-contract tests. Repo also contains Python, shell, Go, and PowerShell, but those are not primary for this plan.
- **Test command**: `cd pi/tests && pnpm test workflow-prompts.test.ts`
- **Lint command**: no separate prompt-only lint detected; repo-wide validation includes Pi typecheck/tests through `make check`.
- **Repo-wide validation**: `make check`

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && grep -RIn "workflow.hiddenPrompt\|Execution Checklist\|review_artifact_write" pi/skills/workflow pi/tests/workflow-prompts.test.ts` | none | terminal output |
| Implement | edit `pi/skills/workflow/*.md`, `pi/skills/workflow/templates/*.md`, and `pi/tests/workflow-prompts.test.ts` | none | git diff |
| Targeted verify | `cd pi/tests && pnpm test workflow-prompts.test.ts` | none | Vitest exits 0 |
| Repo verify | `make check` | none | exits 0 with all checks passed |
| Rollback | `git diff` to inspect; use a normal git revert after commit if needed | none | clean or reviewed working tree |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Harden `/plan-it` executable plan contract
  - Status: completed
  - Evidence: grep checks passed for Validation Contract, Execution Checklist, Automation Plan, mutation, telemetry, episode ID, phase ID, validation command
- [x] T2: Harden `/review-it` anti-theater review contract
  - Status: completed
  - Evidence: grep checks passed for substantive defect, process defect, duplicate, low-value/theater, false positive, evidence, required fix, confidence, severity rationale
- [x] T3: Harden `/do-it` execution, telemetry, and archive contract
  - Status: completed
  - Evidence: grep checks passed for safe manual-gate downgrade reason, archive by default/opt out, telemetry fields, phase ID, validation command, archive status
- [x] V1: Validate workflow prompt contract edits
  - Status: completed
  - Evidence: all T1/T2/T3 grep checks passed; git diff -- pi/skills/workflow inspected as prompt/template contract text; ASCII check over edited workflow prompt paths passed

### Wave 2

- [x] T4: Update prompt-contract tests
  - Status: completed
  - Evidence: grep found telemetry, archive, manual, duplicate, Validation Contract assertions; cd pi/tests && pnpm test workflow-prompts.test.ts --reporter=dot passed (8 tests)
- [x] V2: Validate tests and integration
  - Status: completed
  - Evidence: cd pi/tests && pnpm test workflow-dispatch.test.ts workflow-prompts.test.ts --reporter=dot passed (2 files, 12 tests); git diff --check passed

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: all task acceptance grep checks passed; targeted workflow-prompts test passed; workflow-dispatch plus workflow-prompts test passed; ASCII check passed
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: make check passed; Pi extension checks passed; All checks passed
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: Validation Contract says manual validation required: no; automated prompt-contract and repo-wide validation passed
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: Validation Contract says deployment validation required: no; no deployment procedure present
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: all implementation, task-specific validation, repo-wide validation, manual/deployment non-applicability, and checklist gates complete; archive target .specs/archive/pi-workflow-hardening existed, so collision-safe archive path selected: .specs/archive/pi-workflow-hardening-2026-05-26/plan.md

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Harden `/plan-it` executable plan contract | 1 | feature | medium | pi-command | -- |
| T2 | Harden `/review-it` anti-theater review contract | 2 | feature | medium | pi-command | -- |
| T3 | Harden `/do-it` execution, telemetry, and archive contract | 1 | feature | medium | pi-command | -- |
| V1 | Validate workflow prompt contract edits | -- | validation | medium | validation-lead | T1, T2, T3 |
| T4 | Update prompt-contract tests | 1 | feature | medium | typescript-pro | V1 |
| V2 | Validate tests and integration | -- | validation | medium | validation-lead | T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Harden `/plan-it` executable plan contract** [medium] -- pi-command
- Description: Update `pi/skills/workflow/plan-it.md` so generated plans require exact validation commands, measurable success criteria, task/checklist one-to-one mapping, explicit mutation boundaries, automation plan coverage, and machine-readable telemetry artifact requirements.
- Files: `pi/skills/workflow/plan-it.md`
- Acceptance Criteria:
  1. [ ] `/plan-it` requires executable plan contracts.
     - Verify: `grep -n "Validation Contract\|Execution Checklist\|Automation Plan\|mutation" pi/skills/workflow/plan-it.md`
     - Pass: all required concepts appear in concrete instructions, not only examples.
     - Fail: add or refine prompt text until each concept is explicit.
  2. [ ] `/plan-it` requires machine-readable telemetry planning fields.
     - Verify: `grep -n "telemetry\|episode ID\|phase ID\|validation command" pi/skills/workflow/plan-it.md`
     - Pass: prompt asks plans to define telemetry or evidence records that future runs can parse.
     - Fail: add a telemetry/evidence requirement without implementing runtime telemetry.

**T2: Harden `/review-it` anti-theater review contract** [medium] -- pi-command
- Description: Update `pi/skills/workflow/review-it.md` and reviewer template so review findings require evidence, required fix, confidence, duplicate/noise/theater classification, and severity rationale. Ensure reviewers distinguish substantive defects, process defects, duplicates, low-value/theater findings, and false positives.
- Files: `pi/skills/workflow/review-it.md`, `pi/skills/workflow/templates/review-it-reviewer-prompts.md`
- Acceptance Criteria:
  1. [ ] Review findings require anti-theater classification.
     - Verify: `grep -RIn "substantive defect\|process defect\|duplicate\|low-value\|false positive" pi/skills/workflow/review-it.md pi/skills/workflow/templates/review-it-reviewer-prompts.md`
     - Pass: both coordinator and reviewer-facing instructions include the classification set or direct equivalent.
     - Fail: add the missing classifications.
  2. [ ] Review findings require evidence, required fix, confidence, and severity rationale.
     - Verify: `grep -RIn "evidence\|required fix\|confidence\|severity rationale" pi/skills/workflow/review-it.md pi/skills/workflow/templates/review-it-reviewer-prompts.md`
     - Pass: reviewer prompt makes each field mandatory for findings.
     - Fail: make the schema mandatory, not advisory.

**T3: Harden `/do-it` execution, telemetry, and archive contract** [medium] -- pi-command
- Description: Update `pi/skills/workflow/do-it.md` so execution uses checklist plus validation contract as source of truth, records failure evidence before repair loops, emits or updates machine-readable telemetry/evidence expectations, downgrades over-strict manual gates only when safe and recorded, and archives completed plans by default unless the plan explicitly opts out with rationale.
- Files: `pi/skills/workflow/do-it.md`
- Acceptance Criteria:
  1. [ ] `/do-it` keeps safe manual-gate downgrade behavior and records rationale.
     - Verify: `grep -n "downgrade\|manual gate\|safe\|reason" pi/skills/workflow/do-it.md`
     - Pass: prompt permits downgrade only for safe local/reversible/non-destructive cases and requires recording evidence/reason.
     - Fail: refine manual gate language.
  2. [ ] `/do-it` archives by default after successful validation.
     - Verify: `grep -n "archive\|opt out\|by default" pi/skills/workflow/do-it.md`
     - Pass: prompt says completed plans archive by default unless an explicit plan opt-out rationale applies.
     - Fail: update archive rule.
  3. [ ] `/do-it` records telemetry/evidence sufficient for follow-up audits.
     - Verify: `grep -n "telemetry\|episode ID\|phase ID\|validation command\|archive status" pi/skills/workflow/do-it.md`
     - Pass: prompt requires machine-readable or structured records for phase, validation, and archive decisions.
     - Fail: add structured evidence/telemetry instructions.

### Wave 1 -- Validation Gate

**V1: Validate workflow prompt contract edits** [medium] -- validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run all T1, T2, and T3 grep acceptance checks.
  2. Inspect `git diff -- pi/skills/workflow` and confirm only prompt/template contract text changed.
  3. Confirm no non-ASCII punctuation was introduced in edited files with `python - <<'PY'` check over the edited paths.
- On failure: create a focused fix for the failing prompt file, then rerun V1.

### Wave 2

**T4: Update prompt-contract tests** [medium] -- typescript-pro
- Blocked by: V1
- Description: Update `pi/tests/workflow-prompts.test.ts` to assert the new workflow contracts without overfitting to long prose. Prefer stable phrases and concepts that represent the durable policy: executable plan contract, anti-theater review schema, telemetry requirements, safe manual-gate downgrade, and archive-by-default behavior.
- Files: `pi/tests/workflow-prompts.test.ts`
- Acceptance Criteria:
  1. [ ] Prompt-contract tests cover the new `/plan-it`, `/review-it`, and `/do-it` expectations.
     - Verify: `grep -n "telemetry\|archive\|manual\|duplicate\|Validation Contract" pi/tests/workflow-prompts.test.ts`
     - Pass: tests assert each policy area at least once.
     - Fail: add or adjust assertions.
  2. [ ] Targeted prompt tests pass.
     - Verify: `cd pi/tests && pnpm test workflow-prompts.test.ts`
     - Pass: Vitest exits 0.
     - Fail: inspect the failing assertion, correct prompt or test contract, and rerun.

### Wave 2 -- Validation Gate

**V2: Validate tests and integration** [medium] -- validation-lead
- Blocked by: T4
- Checks:
  1. `cd pi/tests && pnpm test workflow-prompts.test.ts` -- targeted prompt-contract tests pass.
  2. `cd pi/tests && pnpm test workflow-dispatch.test.ts workflow-prompts.test.ts` -- workflow dispatch and prompt contracts remain compatible.
  3. `git diff --check` -- no whitespace errors.
- On failure: fix the prompt/test mismatch or formatting issue, then rerun V2.

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) -> V1
Wave 2: T4 -> V2
Final: F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] New workflow contracts are present and tested.
   - Verify: `cd pi/tests && pnpm test workflow-prompts.test.ts`
   - Pass: tests exit 0 and cover plan, review, do-it, telemetry, manual-gate, and archive concepts.
2. [ ] Workflow dispatch still works with prompt-contract changes.
   - Verify: `cd pi/tests && pnpm test workflow-dispatch.test.ts workflow-prompts.test.ts`
   - Pass: tests exit 0.
3. [ ] Repo-wide validation passes.
   - Verify: `make check`
   - Pass: exits 0 with all checks passed.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all validation steps through documented commands.
- Credentials are not required.
- Manual-only steps are not required.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command for this project.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update `## Execution Status` with the failing command, failing test names, and next fix.

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes as written.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation.

3. [ ] Run targeted Pi workflow prompt tests.
   - Command: `cd pi/tests && pnpm test workflow-dispatch.test.ts workflow-prompts.test.ts`
   - Pass: exits 0.
   - Fail: correct the prompt/test contract and rerun.

### Manual validation

- Required: no
- Justification: Automated prompt-contract and repo-wide validation are sufficient for local prompt/test changes.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, deployment validation if any, and repo-wide validation pass. Completed plans archive by default. Do not require manual validation merely to increase confidence in this local prompt/test change.

## Handoff Notes

- Read `pi/AGENTS.md` before editing files under `pi/`; it requires ASCII punctuation in file content.
- Pi docs for command authoring indicate prompt-only workflow guidance belongs under `pi/skills/workflow/`, while runtime command changes belong in `pi/extensions/`. This plan intentionally targets prompt files and tests only.
- Existing prompt-contract tests in `pi/tests/workflow-prompts.test.ts` should be extended with stable concept assertions rather than exact long paragraphs.
- If `make check` fails in unrelated areas, follow the validation repair loop and only classify as blocked after confirming the failure is outside this plan's safe edit scope.
