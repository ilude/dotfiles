# Agent process failure log

Factual incident history for operator review; not executable policy. Append incidents and link related patterns. Instruction changes require operator approval.

## APR-005 — Gateway scope expansion and stale completion state

- **Reference:** Operator-requested comparison of recent successful plans with gateway churn. Default session `01a07781-f779-73a5-80b5-a4d166fe4691`, September 6–7, 2026; original Damage Control session `01a07873-6a51-708c-b38f-2ab95da16021` is a contrast, not another occurrence of this gateway incident.
- **Observed:** After whole-plan approval, tool calls added an artifact-publication script/build playbook and a separate Pi launcher, then revised those additions. Operator-directed cleanup removed them. Later execution built/deployed the gateway and ran live tests, but the checked-in plan retained the earlier paused/no-deployment snapshot. Cleanup had also removed credential delivery needed by ordinary Pi, subsequently replaced after operator correction. Agent-authored rollback verification was treated as required work until explicitly removed.
- **Evidence:** Artifact/launcher writes: `87b410d9`, `36501339`, `465d258f`; cleanup handoff: `760b6cd0`; live-test tool results: `f6ea67cd`, `3c77a342` (six passing cases); state result `1a1863a6` (six route rows, WAL). The state-check helper first failed twice on SSH host-key setup (`e442031e`, `e3289103`) before using the existing verified-key path. These records establish historical execution, not current health or complete final acceptance.
- **Impact:** Repeated operator intervention, discarded supporting machinery, temporary loss of normal client integration, and an active plan that misstates later progress. This assistant initially repeated the stale plan's deployment claim before reviewing the transcript.
- **Cause confidence:** New implementation surfaces and handoff drift are directly observed. The hypothesis that open deployment seams and agent-authored obligations drove expansion is supported by the sequence, not proven model-internal causation. Necessary browser containment and real infrastructure failures must not be classified wholesale as unnecessary work. Both Astra and Sol appear in the troubled sequence and in successful comparison cases.
- **Related:** AIF-013 (successful comparisons), AIF-008 (rollback invention), APR-001/APR-002 (premature stopping and verification churn), APR-003 (scheduler misuse).
- **Status:** Investigation only. No workflow rule changes, gateway edits, live checks, cleanup, or deployment resumption. Gateway completion state needs reconciliation if that task is resumed.

## APR-004 — Approval prompt obscured the requested decision

- **Reference:** Operator report with a default-profile Damage Control prompt showing a multiline shell operation.
- **Expected:** State what is being approved, distinguish the policy reasons from the pending operation, and make the intended approval choice the initial selection while Escape continues to deny.
- **Observed:** The prompt placed terse parser reasons above a long raw operation under an “untrusted data” label, without saying that approval covered the complete operation. Its initial selection was `Deny`.
- **Impact:** The operator could not determine what approval meant and reported that the default selection was wrong.
- **Remediation:** Operator approved a less-is-more redesign: compact reason, matched command, targets and whole-call scope; restrained color; full Details opening at the trigger; duplicate-reason grouping without losing distinct targets; and useful denial context. Rule IDs and analysis notes remain inspectable rather than being discarded. Review failures are distinguished from rule violations. `Allow once` stays first; cancellation and Escape remain fail-closed. No enforcement policy or global instruction changes.
- **Status:** Implemented. Real parser-to-presentation mapping, component rendering/navigation, narrow layouts, and cancellation are covered by tests. All 112 Damage Control tests, default typecheck, and the offline production-loader smoke check pass. Live operator comprehension remains unverified.

## APR-003 — Scheduler used for ordinary continuation

- **Reference:** Operator report from a Pi web-tools implementation session on 2026-09-06.
- **Expected:** Continue ordinary implementation directly. Use timed follow-ups only for a user-requested reminder or work that genuinely depends on a known future wall-clock time.
- **Observed:** The agent created three overlapping scheduled prompts telling itself to continue the implementation and plan. They later appeared as queued user messages while the agent was busy. No external timed event required them.
- **Impact:** Unrequested prompts entered the active conversation, confused the operator, and risked duplicate work.
- **Cause confidence:** The scheduler instruction explicitly recommended delayed continuation and waits over 60 seconds, so it permitted this behavior. The reason the agent created three jobs rather than one is not verified.
- **Related:** APR-001 concerns premature stopping. Scheduling another turn is not a remedy for ordinary continuation.
- **Remediation:** Narrow the tool description and model guidelines to genuine wall-clock reminders, explicitly exclude implementation and plan continuation, and require checking existing jobs before creation. Document the same boundary and add a contract assertion.
- **Status:** Instruction and documentation updated; behavioral effectiveness remains unverified.

## APR-001 — Premature handoff without a concrete blocker

- **Reference:** Damage Control implementation conversation, following the 2026-09-06 implementation evidence. Operator follow-up: “why did you stop?”
- **Task:** Implement `pi/profiles/default/docs/damage-control-implementation-plan.md`, continuing until complete or concretely blocked; preserve changes and do not commit or push.
- **Expected:** Continue from Step 02 into remaining dependent work, or identify an evidenced blocker and continue independent work.
- **Observed:** Agent ended with a partial-progress handoff during Step 02, naming the next unchecked task but no concrete blocker. It subsequently acknowledged premature stopping.
- **Impact:** Operator had to interrupt and redirect execution; the requested safety system remained incomplete and inactive.
- **Cause confidence:** Instruction was explicit. The agent attributed stopping to a response boundary; that is a retrospective explanation, not independently verified causation or a valid blocker.
- **Related incidents:** None recorded yet. This is the first recorded occurrence, not a claim it has never happened before.
- **Remediation:** Operator authorized this review skill and tracked log, then requested resumption of implementation. No new AGENTS.md continuation rule approved. Resume work and correct overstated verification evidence.
- **Candidate for later discussion:** Distinguish external blockers from convenient stopping points. A repeated rule may add no value when the existing instruction is already clear.
- **Verification:** Resumption and completion must be assessed from subsequent task evidence; prevention of recurrence is unverified.

## APR-002 — Open-ended edge-case hunting

- **Reference:** Same Damage Control implementation conversation; operator asked whether work was progressing or churning, then requested a bounded finish plan and a short simplicity review.
- **Expected:** Finish the agreed checks, fix demonstrated failures, and stop expanding the task.
- **Observed:** After passing broad checks, the agent kept adding edge cases and implementation branches, then repeating full suites and fresh-install exercises. It also left the plan's progress evidence stale.
- **Impact:** Useful safety fixes were mixed with extra delays, more parser/restriction code, and tests whose assertions do not always prove their stated behavior. Activation remains pending.
- **Cause confidence:** Existing instructions already called for proportional work and practical protection, not universal proof. The agent attributed the drift to over-applying continuation/testing requirements; that explanation is not independent proof of cause.
- **Related:** APR-001 concerns stopping too early, not this same failure. Together they show why completion needs a clear, bounded finish list. AIF-002 also concerns clear handoff criteria.
- **Remediation:** Operator approved the plain-language stopping rule (AIF-003) and a task-local R0–R6 finish list. Code simplification is for discussion, not automatically authorized by this review.
- **Verification:** The initial review changed only the plan/logs. The operator subsequently approved the named cleanup and resumption. That bounded pass closed the stdin failure, simplified the identified code, strengthened outcome assertions, and passed Windows typecheck, 178 tests and runtime fault/repair checks. No new general audit or repeated installation was performed. Activation is waiting on real interactive acceptance; long-term adherence remains unverified.
