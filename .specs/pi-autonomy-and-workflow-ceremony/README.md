# Pi autonomy and workflow ceremony investigation

Status: Broadened investigation complete. The operator has clarified the direction as radical simplification, not incremental trimming; the main proposal now reflects removal of whole procedural subsystems. No implementation or runtime verification performed.

## Executable plan

[The archived development-flow reset plan](../archive/pi-development-flow-reset/plan.md) passed adversarial/subtractive review disposition and deterministic readiness validation before it was cancelled at the operator's request. It preserves the user's existing flags/defaults, damage control and commit behavior, adds default worktree planning, and removes procedural controllers. Its accepted decisions supersede earlier proposals below. Implementation has not started.

## Read first

1. [System-wide diagnosis and proposal](system-wide-proposal.md): how requirements and procedure accumulate, why simplification regenerates machinery, minimal operating model, and removal/retention decisions.
2. [Current-session evidence](current-session-evidence.md): benchmark and subagent execution churn under current rules, necessary browser protections, and this investigation's own premature completion.
3. [Contrasting cases and history](system-evidence.md): direct successful work, explicitly requested complexity, requirement expansion, and policy changes over time.

The initial failure-centered pass was insufficient. The documents above supersede its narrow organizing conclusion; they do not erase its useful source evidence.

## Preservation and replacement boundary

Leave damage control and `/commit` unchanged. Retain only useful subagent capabilities. Remove or replace `/do-it` and the managed workflow architecture, and replace development-flow instructions/skills rather than preserving their current structure. Preserve real partial work and explicit in-flight obligations, not the rejected workflow design.

## Main finding

The system gives procedure stronger authority than it should, while implementation and test suggestions can acquire the status of user requirements. Plans, review/readiness rules, delegation, deferred validation, and completion records then preserve those choices. When partial work fails to compose, another repair, review, handoff, or operator interruption follows.

Current sessions demonstrate churn before the final tests, not just excessive test execution. Historical changes show validation control moving between automatic repair and instruction-level scheduling. Shortening or consolidating rules does not necessarily remove the obligations.

Recommend a substantial reset: remove the managed development procedure, mandatory planning/review lifecycle, universal validation schedule and repair budget, and compulsory completion mappings. Default to direct work, relevant testing, diagnosis-led repair, and completion. Retain useful optional planning/delegation, minimal continuation, and concrete safety at actual operations. Commands remain conveniences with shared agent-callable capabilities. Add ceremony back only when demonstrated need warrants it, not preemptively. Do not add an anti-ceremony framework or reinterpret real user constraints as optional.

## Supporting first-pass notes

- [Findings](findings.md): specific source-established failures and qualifications.
- [Runtime, instructions, and tests](runtime-and-tests.md): detailed path map and protection inventory.
- [Implementation detail inputs](solution-inputs.md): provisional technical slices, host checks, and unfinished-state risks; subordinate to the system-wide proposal.
- [Installed mechanisms and history](upstream-and-history.md): Pi 0.84.4 APIs and targeted history.
- [Continuation](continuation.md): preservation boundary, retrieval limits, and subsequent work.

## Scope and evidence

Question: How does ordinary work accumulate extra requirements, procedures, reviews, state, tools, and tests, and why do simplification attempts regenerate them?

Evidence consists of selected exact transcripts, current source, installed documentation, targeted Git history, and the initial three read-only inspections. Cases establish mechanisms and concrete effects, not prevalence, model-internal causes, or guaranteed improvement from the proposal. Recent active work was observed without contacting or controlling other instances. Its later outcomes remain outside this snapshot.

Only this investigation directory was authorized for writes. No runtime, instruction, skill, test, existing-plan, live-system, or Git mutation was performed by this investigation. No benchmark or development validation was run; no repair allowance was consumed.

Initial source baseline: `4549dca9545c38d460719a69698a75da9091b51d`. Later observed main HEAD: `4aa7c2b6d82059412bdb6e25c7a443d4711e7b6b`. The checkout is shared and contains unrelated background-delivery changes. Initial pre-existing benchmark files and `pi/browser-profiles.json` remain outside this investigation's mutation boundary.

Prior task reference: `470fdcf6-c1be-4cca-ad59-67319baaa8ee`. It was prematurely completed during the first pass; a later update returned task-not-found in the current workspace. No replacement task was created and no new tracker completion is claimed. The broader deliverable and its evidence are these notes.
