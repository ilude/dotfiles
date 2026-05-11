---
date: 2026-05-11
status: synthesis-complete
---

# Review: Pi Task Ready Dependency UX

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Required standard reviewer | Assume fresh `/do-it` session will hit hidden ambiguity | `.specs/pi-task-ready-deps/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Safety/security reviewer | Required standard reviewer | Look for state damage, leakage, and unsafe recovery gaps | `.specs/pi-task-ready-deps/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity/scope reviewer | Required standard reviewer | Challenge Option 1 scope creep | `.specs/pi-task-ready-deps/review-1/product-manager.md` |
| typescript-pro | typescript-pro | TypeScript task-state and toolchain reviewer | Pi TypeScript libs/extension/tests are primary files | Assume helper APIs or command tests will miss runtime behavior | `.specs/pi-task-ready-deps/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Dependency behavior verification realism reviewer | Plan success depends on tests proving dependency behavior | Assume unit tests pass while slash UX remains wrong | `.specs/pi-task-ready-deps/review-1/qa-engineer.md` |
| ux-researcher | ux-researcher | Operator task workflow UX reviewer | Plan goal is Claude-like operator task usability | Assume correct internals produce confusing output | `.specs/pi-task-ready-deps/review-1/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- Helper API is underspecified because one task only contains dependency IDs, not blocker states.
- Registered command-path tests are not explicit enough.
- Missing/tombstoned blocker recovery is not actionable.
- Explicit `blocked` state policy is undefined when blockers are satisfied.

### security-reviewer
- Ready/blocked/start output must use existing task redaction on all task summaries/context.
- Missing/tombstoned blockers can permanently deny task progression unless recovery is specified.
- Hidden-mode/visibility behavior needs regression protection for ready/blocked output.
- Rejected starts must not mutate timestamps, edges, or files.

### product-manager
- Option 1 may be over-scoped if implemented as helpers + renderer + commands + start enforcement all at once.
- T5 risks turning follow-up architecture into product-doc scope creep.
- Validation commands are repetitive.
- Non-required final gates add process overhead.

## Additional Expert Findings
### typescript-pro
- Readiness helper API must accept an explicit task map/list snapshot and avoid filesystem-coupled or one-argument helpers.
- Tests must invoke the registered `tasks` command handler through a mocked `ExtensionAPI`.
- Dependency ID ordering must be specified at the API boundary.
- `task-security.test.ts` must be included wherever renderer redaction is required.

### qa-engineer
- Registered slash-command surface must be tested, not just parser/helper functions.
- Non-mutation checks must snapshot full records and task directory contents, not just state.
- Tombstoned blocker behavior needs concrete fixtures/tests.
- Command-level ready/blocked ordering needs exact assertions.
- Explicit `blocked` tasks need a defined policy.

### ux-researcher
- `blocked` vs `waiting` vocabulary is overloaded.
- Blocked/start rejection output needs a required actionable template.
- Compact/full/hidden mode recovery paths are underspecified.
- Help text needs operator journey examples.
- Skipped-as-unblocking policy should be visible to operators.

## Suggested Additional Reviewers
- typescript-pro -- TypeScript/task-state API and build/test correctness.
- qa-engineer -- verification realism for registered command and persistence behavior.
- ux-researcher -- operator-facing command vocabulary and blocked-output actionability.

## Bugs (must fix before execution)
1. **Define a concrete pure readiness API.** The plan must require helpers such as `getUnmetBlockers(task, tasksById)` / `partitionReadyTasks(tasks)` that use an already-loaded snapshot, not implicit filesystem reads.
2. **Require registered `/tasks` handler tests.** The plan must require tests that load the extension, capture `pi.registerCommand("tasks")`, invoke `ready`, `blocked`, and `start <id>`, and assert notify output plus persisted state.
3. **Define explicit blocked/waiting vocabulary and blocked-state policy.** The plan must specify how pending waiting tasks, explicit blocked-state tasks, and blocked tasks with satisfied/no blockers appear in ready/blocked views.
4. **Make blocked/start rejection output actionable and redacted.** The plan must require a concrete output template with blocker id/status/summary, next command, missing/tombstoned recovery, and redaction tests.
5. **Strengthen non-mutation and tombstone tests.** The plan must require full persisted-record/directory snapshots for rejected starts and concrete tombstone fixtures.

## Hardening
1. Add exact lexicographic ordering rule for dependency IDs and command outputs.
2. Include `task-security.test.ts` in focused validation commands that cover renderer/start output.
3. Reduce T5 follow-up architecture to a short evidence-only note unless docs are already being edited.
4. Avoid repeated per-task command reruns by defining one focused task test command plus typecheck and final `make check`.

## Simpler Alternatives / Scope Reductions
1. Keep Option 1 implementation, but clarify it as one cohesive small UX slice: helpers, visible ready/blocked queries, and start enforcement. Do not expand into tree rendering or workflow execution.
2. Keep Option 2/3 content as a short out-of-scope/follow-up note, not product documentation that implies commitment.

## Automation Readiness
- Agent-runnable operational steps: mostly clear; needs sharper focused validation command.
- Credential/auth flow clarity: no credentials required.
- Risk/manual-gate decision: clear; no manual gate required for local reversible repo work.
- Exact manual-gate steps: not applicable.
- Evidence and archive gates: present, but archive preflight should include section/evidence checks after plan edits.
- Execution checklist: consistent; no checked items.

## Contested or Dismissed Findings
1. Product-manager suggested splitting `/tasks ready` and `/tasks blocked` into a follow-up. Dismissed as too conservative: these commands are core to Option 1's user-visible dependency UX, but the plan will be tightened to avoid tree/workflow scope.
2. Product-manager suggested removing non-required F3/F4 gates. Dismissed for template consistency; they remain lightweight "not required" gates that `/do-it` can mark with evidence.

## Verification Notes
1. High findings were verified against `.specs/pi-task-ready-deps/plan.md` and current implementation snippets already inspected in `pi/lib/task-registry.ts`, `pi/lib/task-renderer.ts`, and `pi/extensions/tasks.ts` during planning.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-task-ready-deps/review-1/reviewer.md` | read | initial/retry artifact write failed; coordinator wrote constrained artifact from recovery-required completeness review |
| security-reviewer | `.specs/pi-task-ready-deps/review-1/security-reviewer.md` | read | initial artifact missing despite success; targeted recovery succeeded |
| product-manager | `.specs/pi-task-ready-deps/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/pi-task-ready-deps/review-1/typescript-pro.md` | read | usable |
| qa-engineer | `.specs/pi-task-ready-deps/review-1/qa-engineer.md` | read | usable |
| ux-researcher | `.specs/pi-task-ready-deps/review-1/ux-researcher.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | ~49s | 6 reviewers launched; 4 artifacts immediately usable, 2 missing |
| Artifact reads | ~1s | all expected reviewer artifacts eventually read |
| Recovery calls | ~22s | reviewer still lacked write tool; security recovery wrote artifact |
| Verification | ~5m | static synthesis against plan/code context; per-reviewer timing unavailable |
| Synthesis | ~1m | `.specs/pi-task-ready-deps/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-task-ready-deps/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed (`grep -n '^## ' .specs/pi-task-ready-deps/plan.md`)
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/pi-task-ready-deps/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the structured plan fixes, run standalone readiness, then execute via `/do-it .specs/pi-task-ready-deps/plan.md`.
