---
created: {YYYY-MM-DD}
status: draft
completed:
---

# Plan: {title}

## Context & Motivation

{Why this work exists. Summarize the conversation findings -- research results, problem
discovered, user need identified. Be specific enough that someone with zero context can
understand what triggered this plan and why it matters.}

## Constraints

{Hard requirements, platform details, user preferences, and acceptable trade-offs.}

- Platform: {detected}
- Shell: {detected}
- {any additional constraints from conversation}

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** {low/medium/high}
- **Blast radius:** {personal-local-repo/local/home-lab/shared/work-prod/paid-resource}
- **Rollback:** {easy/known/unclear/impossible}
- **Manual approval before action:** {required/not required}
- **Manual validation after action:** {required/not required}
- **Decision reason:** {why this does or does not need a manual gate; if uncertain, ask the user during planning before writing this plan}

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| {approach} | {pros} | {cons} | **Selected** / Rejected: {why} |

## Objective

{What the plan produces when complete. Concrete, verifiable end state.}

## Project Context

- **Language**: {detected from markers}
- **Test command**: {detected or "none detected -- tasks must define their own verification"}
- **Lint command**: {detected or "none detected"}

## Automation Plan

List every operational step required to complete this plan and how it is automated. Prefer scripts, playbooks, wrappers, and repeatable commands over manual steps. Any manual-only step must include why it cannot be safely automated.

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `{command or "none"}` | `{none/local gitignored/vault/user prompt}` | `{artifact or "none"}` |
| Deploy | `{command or "not applicable"}` | `{source}` | `{artifact or "none"}` |
| Verify | `{command}` | `{source}` | `{artifact}` |
| Rollback | `{command/manual step}` | `{source}` | `{artifact}` |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [ ] T1: {task name}
  - Status: pending
  - Evidence: --
- [ ] T2: {task name}
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: {task name}
  - Status: pending
  - Evidence: --
- [ ] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation not required or completed
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | {task name} | {count} | {mechanical/feature/architecture} | {small/medium/large} | {agent} | -- |
| T2 | {task name} | {count} | {type} | {model} | {agent} | -- |
| T3 | {task name} | {count} | {type} | {model} | {agent} | T1, T2 |
| V1 | Validate wave 1 | -- | validation | {model} | {validator agent} | T1, T2 |
| V2 | Validate wave 2 | -- | validation | {model} | {validator agent} | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: {task name}** [{model}] -- {agent}
- Description: {what this task does, with enough detail to execute independently}
- Files: {specific file paths or patterns}
- Acceptance Criteria:
  1. [ ] {specific, measurable outcome}
     - Verify: `{exact command}`
     - Pass: {expected output}
     - Fail: {what failure looks like and what to do}

**T2: {task name}** [{model}] -- {agent}
- Description: {details}
- Files: {paths}
- Acceptance Criteria:
  1. [ ] {criterion}
     - Verify: `{command}`
     - Pass: {expected}
     - Fail: {diagnosis steps}

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [{validator model}] -- {validator agent}
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `{test command}` -- all tests pass
  3. `{lint command}` -- no new warnings
  4. Cross-task integration: {any interactions between T1 and T2 outputs to verify}
- On failure: create a fix task, re-validate after fix

### Wave 2

**T3: {task name}** [{model}] -- {agent}
- Blocked by: V1
- Description: {details}
- Files: {paths}
- Acceptance Criteria:
  1. [ ] {criterion}
     - Verify: `{command}`
     - Pass: {expected}
     - Fail: {diagnosis steps}

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [{validator model}] -- {validator agent}
- Blocked by: T3
- Checks: {same pattern as V1}

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

{How to verify the ENTIRE plan succeeded end-to-end, not just individual tasks.}

1. [ ] {end-to-end verification}
   - Verify: `{command}`
   - Pass: {expected}
2. [ ] {user-facing outcome check}
   - Verify: `{command, scripted check, test, screenshot/log inspection, or "not required"}`
   - Pass: {expected}

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- If credentials are required, the plan must define a gitignored/local credential path or an explicit user-approved auth mode.
- Manual-only steps must be justified and include exact user actions plus expected success signals.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `{repo-wide validation command, e.g. make check; or explicit test/lint/format commands}`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation. Scale matters: personal/local GitHub repos, local/home-lab, and new-backed-up systems are usually agent-runnable; work/shared/multi-user production systems and money/data-costing resources may need user gates when other people, spend, quota, or costly recovery could be affected.

- Required: {yes/no}
- Justification: {If yes, name the destructive/data-loss/irreversible/shared-production/secret-exposure/hardware/subjective reason. If no, write "Automated validation is sufficient."}
- Steps:
  1. {If required, exact user/manual step with expected success signal. If not required, write "None."}

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan. If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: {yes/no}
- Procedure: {If required, reference `## Deployment Procedure`; otherwise write "None."}

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, exceptional manual validation (if required), deployment validation, and repo-wide validation pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover, especially for local/home-lab/new-backed-up systems.

## Handoff Notes

{Anything the executor needs to know that isn't captured above -- environment setup,
credentials needed, sequencing gotchas, known flaky areas. If nothing, write "None."}