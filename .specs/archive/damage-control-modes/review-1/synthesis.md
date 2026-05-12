---
date: 2026-05-12
status: synthesis-complete
---

# Review: Pi Damage-Control Session Modes

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer for hidden assumptions and execution gaps | Assume a fresh `/do-it` session lacks all conversation context | `.specs/damage-control-modes/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Safety and red-team reviewer | Mandatory standard reviewer for realistic failure modes and safety risks | Assume mode changes can weaken guardrails or hide destructive intent | `.specs/damage-control-modes/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope and simplicity reviewer | Mandatory standard reviewer for overbuilding and scope mismatch | Assume the plan is larger than needed for a mode toggle | `.specs/damage-control-modes/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript extension API and runtime-state reviewer | The plan changes Pi extension command registration, module state, and TS tests | Assume code compiles but leaks state across repeated registrations | `.specs/damage-control-modes/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Damage-control regression and automation-readiness reviewer | The plan relies on Vitest tests to prove safety behavior | Assume pure helper tests pass while registered handlers are broken | `.specs/damage-control-modes/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Local automation and evidence-archive reviewer | The plan must be runnable by `/do-it` with evidence and rollback | Assume dirty working tree and literal shell execution | `.specs/damage-control-modes/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- Missing Pi `registerCommand` API references and handler shape make the command task less standalone.
- Whitelist semantics are underspecified: examples exist, but not a complete initial allowlist or matching mode.
- PowerShell rule categories need exact pattern/test expectations.
- Unscoped dangerous-command rule behavior is not specified.
- Initial artifact write failed for this reviewer; coordinator persisted recovery findings via constrained artifact write.

### security-reviewer
- Module-level mode state can violate instance-local behavior across repeated extension registrations.
- Mode blocks may hide baseline dangerous/no-delete classifications from audit trails.
- Relaxing from `whitelist`/`noshell` to `default` has no explicit transition audit requirement.
- PowerShell coverage lacks tests for common evasions and direct `pwsh` tool `-EncodedCommand` style input.
- Evidence archival lacks redaction/secret-scan guidance.

### product-manager
- PowerShell dangerous-rule expansion and broad whitelist taxonomy may exceed the minimal toggle scope.
- Repo-wide `make check` may add ceremony or conflict with the handoff note allowing unrelated failures.
- Status output says it includes health but tests do not verify rule-load health fields.
- Wave 2 splits two tasks across the same files, inviting merge churn.

## Additional Expert Findings
### typescript-pro
- The current plan explicitly suggests module-level `activeDamageControlMode`; that can leak/reset across registrations. Use per-registration closure state.
- Command parsing must reject extra tokens such as `/damage-control mode whitelist extra`.

### qa-engineer
- Handler-level tests are missing for mode state plus real mocked `bash`/`pwsh` tool calls.
- `pwsh` dangerous-rule tests must go through the registered handler, not only the pure evaluator.
- File-tool protections should be tested after switching to `whitelist`/`noshell` in the same extension instance.
- State reset/no-leak tests should be explicit rather than inferred from test order.
- Compound operator coverage needs representative bash and PowerShell cases.

### devops-pro
- Evidence directory creation is missing before commands redirect into it.
- Rollback with `git checkout -- <paths>` can discard pre-existing user edits on planned paths.
- `make check` is both required and conditionally excused; archive criteria conflict.
- Baseline diffs for planned paths are not captured before edits.
- Non-empty implementation diff is not a reliable completion gate when implementation already exists.

## Suggested Additional Reviewers
- typescript-pro -- relevant because the plan changes TypeScript Pi extension runtime state, command handlers, and typechecking.
- qa-engineer -- relevant because the plan depends on automated tests proving safety and no-regression behavior.
- devops-pro -- relevant because `/do-it` needs repeatable evidence, rollback, and archive gates on Windows/Git Bash.

## Bugs (must fix before execution)
1. Per-session mode state is incorrectly specified as module-level state. The plan must require closure/per-registration state and explicit multi-instance tests.
2. Automation is not safe for dirty working trees: no evidence directory creation, no planned-path baseline snapshot, and rollback can discard pre-existing user edits.
3. Test requirements permit pure-helper verification where handler-level behavior is required, especially for `/dc` mode changes and `pwsh` dangerous rules.
4. Wave 2 is not truly parallel because T3 and T4 touch the same files; combine or serialize them.
5. The plan lacks `## Execution Status`, which the review command's section integrity contract requires.

## Hardening
1. Define exact whitelist matching semantics and initial allowlist entries.
2. Specify behavior for dangerous-command rules with no `tools` metadata.
3. Add mode-transition audit/status requirements and reject extra slash-command arguments.
4. Add evidence redaction/secret-scan or explicit no-secret evidence check before archive.
5. Add representative PowerShell evasion/operator tests or document non-goals.
6. Clarify `make check` archive behavior with a baseline exception process, or make it strictly required.

## Simpler Alternatives / Scope Reductions
1. Keep PowerShell dangerous-rule expansion only because it was explicitly discussed before planning; otherwise it would be a good follow-up split.
2. Use a minimal v1 whitelist with exact regex entries and tests rather than attempting a complete safe-command taxonomy.
3. Collapse Wave 2 command registration and handler wiring into one integration task to avoid parallel edits to the same files.

## Automation Readiness
- Agent-runnable operational steps: not ready before fixes because evidence directory creation and dirty-path preflight are missing.
- Credential/auth flow clarity: no credentials required.
- Evidence and archive gates: need baseline planned-path status/diff, redaction/no-secret check, and unambiguous `make check` handling.
- Manual-only steps and justification: no manual gate required; low-risk local repo classification is acceptable.
- Execution checklist: present, but needs task/gate alignment updates after collapsing Wave 2 and adding `Execution Status`.

## Contested or Dismissed Findings
1. Product-manager suggested splitting all PowerShell dangerous-rule work into a separate follow-up. Dismissed as a must-fix because the conversation explicitly expanded scope to improve `pwsh` coverage; kept as a scope-control hardening note.
2. Security-reviewer suggested evaluating baseline classifications even when mode blocks. Kept as hardening/audit guidance, not a must-fix, because generic mode blocking still prevents execution and does not break core safety.
3. Repo-wide `make check` ceremony concern is not dismissed; it is converted into a precise baseline exception process rather than removing repo-wide validation.

## Verification Notes
1. Module-level state risk verified in plan section `T3`, which says `activeDamageControlMode` is initialized/reset in `pi/extensions/damage-control.ts`; current code also has module-level `let activeDamageControlMode`.
2. Missing evidence directory verified in Automation Plan: commands redirect to `.specs/damage-control-modes/evidence/*.txt` but no `mkdir -p` step exists.
3. Rollback risk verified in Automation Plan: rollback uses `git checkout --` over planned paths with no dirty-path gate.
4. Handler-level testing gap verified in T4 AC2: it permits “a handler-level or pure evaluator test.”
5. Missing `Execution Status` verified by heading scan: plan has no `## Execution Status` heading.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/damage-control-modes/review-1/reviewer.md` | read | initial subagent could not write; recovery findings persisted by coordinator with `review_artifact_write` |
| security-reviewer | `.specs/damage-control-modes/review-1/security-reviewer.md` | read | artifact usable |
| product-manager | `.specs/damage-control-modes/review-1/product-manager.md` | read | artifact usable |
| typescript-pro | `.specs/damage-control-modes/review-1/typescript-pro.md` | read | artifact usable |
| qa-engineer | `.specs/damage-control-modes/review-1/qa-engineer.md` | read | artifact usable |
| devops-pro | `.specs/damage-control-modes/review-1/devops-pro.md` | read | artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers launched; 5 wrote artifacts, 1 artifact-write failure |
| Artifact reads | unknown | all expected artifacts read after recovery |
| Recovery calls | unknown | one `reviewer` retry failed to write; coordinator persisted inline findings |
| Verification | unknown | plan/code grep and artifact reads used; per-reviewer timing unavailable |
| Synthesis | unknown | `.specs/damage-control-modes/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/damage-control-modes/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed after plan edits
- Standalone-readiness result: blocked; remaining blockers written to `.specs/damage-control-modes/review-1/standalone-readiness-blockers.md`
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/damage-control-modes/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Fix the remaining standalone-readiness blocker in `.specs/damage-control-modes/review-1/standalone-readiness-blockers.md`, then rerun `/review-it .specs/damage-control-modes/plan.md` or apply that single plan fix before `/do-it`.
