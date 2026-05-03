---
date: 2026-05-03
status: synthesis-complete
---

# Review: Pi auto-resume watchdog for transient WebSocket interruptions

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | Assume executor lacks conversation context and will follow ambiguous plan text literally |
| security-reviewer | security-reviewer | Safety and failure-mode reviewer | Mandatory standard reviewer | Assume auto-resume can cause prompt loops, hide outages, or repeat unsafe operations |
| product-manager | product-manager | Simplicity and scope-fit reviewer | Mandatory standard reviewer | Assume the plan overbuilds before proving the minimal recovery path |
| typescript-pro | typescript-pro | Pi TypeScript extension type/build/toolchain reviewer | Plan adds Pi TypeScript extension under `pi/extensions` with pnpm-only validation | Assume implementers use undocumented events/APIs and create type-passing but runtime-broken code |
| qa-engineer | qa-engineer | Watchdog verification realism reviewer | Plan depends on tests/simulation to prove stalled-run recovery and loop protection | Assume greps and typechecks pass while behavior remains unproven |
| devops-pro | devops-pro | Operational reliability and rollout safety reviewer | Plan changes runtime liveness behavior affecting Pi sessions | Assume always-on watchdog can spam prompts or mask provider/client outages |

## Standard Reviewer Findings
### reviewer
- High: T1 decides whether extension-level implementation is possible, but T2/T3 run in parallel and may build against an invalid assumption.
- Medium: Several acceptance criteria are grep-based and can pass without proving behavior.
- Medium: The plan does not define what “stalled” means precisely enough to implement consistently.

### security-reviewer
- High: Automatic `pi.sendUserMessage` can create unintended autonomous continuation loops if outage detection is wrong or provider state is degraded.
- Medium: Rollback/disable behavior is underspecified for a runtime-affecting extension.
- Medium: The plan relies on the agent to self-verify last operations, which is safer than replay but still not a hard safety boundary.

### product-manager
- High: Capability mapping should not be parallel with implementation; this is a dependency, not an optional research task.
- Medium: A smaller first step may be better: observe/log interruptions and provide a manual `/resume-safe` command before enabling automatic continuation.
- Medium: “Configurable defaults” risks unnecessary scope unless the concrete configuration surface is specified.

## Additional Expert Findings
### typescript-pro
- High: The plan assumes lifecycle event names and message APIs are usable from extensions, but the event/error path for literal `WebSocket error` is not proven before implementation.
- Medium: Test placement is vague (`pi/extensions`, `pi/tests`, or script), which may lead to tooling that is not run by the validation contract.
- Medium: Typecheck alone cannot verify extension runtime binding or event handler semantics.

### qa-engineer
- High: T3 allows a simulation harness but the success criteria require recovering a transient interruption; a unit simulation may not prove actual Pi session behavior.
- Medium: Grep acceptance criteria can pass because strings exist in comments rather than code paths.
- Medium: Missing explicit negative cases: normal long-running tool, provider outage, auto-retry already in progress, user actively steering.

### devops-pro
- High: The plan requires configurable defaults but does not specify default enabled state, timeout, max attempts, cooldown, or logging/notification behavior.
- Medium: Rollout is not staged; an always-on extension in dotfiles could affect every Pi session immediately.
- Medium: No explicit rollback command or disable procedure is required before execution.

## Suggested Additional Reviewers
- `typescript-pro` -- relevant because the implementation is a Pi TypeScript extension; focus on ExtensionAPI typing, event names, module/runtime behavior, and pnpm validation.
- `qa-engineer` -- relevant because behavioral correctness depends on realistic stall simulation and loop-protection tests; focus on false-positive validation.
- `devops-pro` -- relevant because this changes runtime session behavior; focus on rollout, observability, rollback, and operational failure modes.

## Bugs (must fix before execution)
1. T1 is incorrectly parallel with T2/T3 even though it determines whether the selected implementation layer is valid.
   - Required fix: Move T1 into its own Wave 1 validation gate. Make T2 and T3 depend on that gate, or split T1 into a required preflight task whose output chooses extension-only vs runtime patch.

2. The plan does not define concrete watchdog defaults or an initial rollout mode.
   - Required fix: Specify default enabled state, timeout/staleness threshold, max auto-resumes per user prompt/session, cooldown/backoff, notification text, and a disable/rollback mechanism before implementation begins.

3. The validation strategy can pass without proving the watchdog actually resumes safely.
   - Required fix: Replace grep-heavy acceptance criteria with executable checks where possible: unit-test state transitions, test negative cases, and require at least one manual/integration validation path that exercises Pi runtime behavior.

4. Literal `WebSocket error` observability is unproven but the objective assumes detection of WebSocket-style failures.
   - Required fix: Make the capability-mapping task produce a hard decision: if transport errors are not exposed to extensions, either implement only idle-stall detection with explicit wording or add a runtime/client patch task.

## Hardening
1. Add a conservative first-release mode: disabled by default or observe-only by default, with an explicit config flag to enable auto-continuation.
2. Add negative test cases for long-running valid tool calls, Pi’s built-in `auto_retry_start`/`auto_retry_end`, provider outages, and active user steering/follow-up queues.
3. Require structured logging or `pi.appendEntry` state for each auto-resume attempt so later sessions can diagnose why continuation occurred.
4. Define exact continuation prompt text in the plan, including last-tool context limits and a reminder not to repeat irreversible operations without verification.
5. Add documentation for rollback: remove/disable the extension, reload Pi, and confirm no watchdog status/notifications remain.

## Simpler Alternatives / Scope Reductions
1. Start with an observe-only interruption detector plus a manual `/resume-safe` command. This validates event visibility and recovery copy before allowing autonomous prompts.
2. Implement a shortcut/command that sends the guarded continuation instead of a timer-based watchdog; add automation only after enough evidence shows the stall detector is reliable.
3. Scope the first implementation to idle-stall detection, not literal WebSocket detection, unless T1 proves transport errors are available to extensions.

## Contested or Dismissed Findings
1. “Patch Pi core immediately” was not promoted to a must-fix. The plan already rejects an immediate core patch; the correct fix is to make the extension feasibility decision explicit before coding.
2. “Direct write retry is required” was dismissed. The reviewed plan correctly avoids blind tool replay; the issue is not that it refuses write retry, but that it must prove safe continuation behavior.
3. No targeted rebuttal was run. Reviewers converged on dependency ordering, weak validation, and rollout/default gaps without outcome-changing disagreement.

## Verification Notes
1. Confirmed T1/T2/T3 dependency bug by reading `## Task Breakdown` and `## Execution Waves`: T1, T2, and T3 all have `Depends On --` and are in the same parallel wave, while T1’s description says it determines whether extension implementation is possible.
2. Confirmed missing defaults by reading T2 and Constraints: the plan says “configurable defaults” and “bounded attempts, backoff/cooldown” but names no concrete values or default enabled/observe-only mode.
3. Confirmed weak validation by reading acceptance criteria: multiple checks use `grep -R` for strings, and T3’s required automated check is `pnpm run typecheck`, which does not prove runtime resume behavior.
4. Confirmed WebSocket observability gap by reading Context, Alternatives, T1, and Handoff Notes: the plan itself says literal WebSocket detection may need runtime/client access but does not make that a blocking decision before T2.

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unavailable | 6 reviewers completed; per-reviewer timing unavailable |
| Recovery calls | not run | Reviewer outputs were partially summarized by tool display but usable; no failed reviewer recovery was run |
| Verification | unavailable | Used plan read/static inspection |
| Synthesis | unavailable | Artifact path: `.specs/pi-auto-resume-watchdog/review-1/synthesis.md` |

## Review Artifact
Wrote full synthesis to: `.specs/pi-auto-resume-watchdog/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the must-fix plan changes before `/do-it`.
- Recommended fixes: make capability mapping a prerequisite gate, specify conservative defaults/rollback, strengthen tests, and clarify whether this is WebSocket-error detection or idle-stall recovery.
