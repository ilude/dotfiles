# Agent process failure log

Factual incident history for operator review; not executable policy. Append incidents and link related patterns. Instruction changes require operator approval.

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
