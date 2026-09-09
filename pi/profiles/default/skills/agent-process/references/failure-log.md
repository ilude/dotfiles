# Agent process failure log

## APR-018 - External pipeline monitoring was delegated to tool-less subagents

- **Reference:** Monorepo CAC redirect push and GitLab/EKS deployment monitoring, 2026-09-09.
- **Observed:** After pushing to `dev`, the orchestrator launched an explorer and then a team lead to monitor the GitLab pipeline. Neither had shell, GitLab, or Kubernetes authority, so both failed while the external pipeline continued. The orchestrator then inaccurately described scheduler guidance as prohibiting this use.
- **Finding:** The scheduler wording required a “known future time” and prohibited waiting for “normal tool or agent work” without naming CI/CD as an external wait. That ambiguity contributed to misclassification, but it did not justify team-lead coordination for a simple timed check.
- **Remediation:** Name GitLab/GitHub pipelines, deployment rollouts, and cloud operations as intended scheduler uses; allow a reasonable check time when completion is unknown; distinguish them from work that can continue now; and explicitly avoid subagent delegation for the wait.
- **Related:** AIF-025, AIF-018, APR-009, APR-003.
- **Status:** Instruction correction implemented. Future adherence remains unverified.

## APR-017 - Subagent outcomes arrived as repetitive post-closeout follow-ups

- **Reference:** Operator's two screenshots of planning and implementation closeout, 2026-09-09.
- **Observed:** Completion cards appeared after the orchestrator's final summary, followed by repeated statements that the findings were already incorporated. One sequence replayed an initial review finding and its later withdrawal after final validation had already been reported.
- **Finding:** Current root delivery explicitly refuses delivery while the parent is busy, flushes on `agent_settled`, and uses turn-triggering `followUp` messages. Coordinator reception also requires idle and uses `followUp`. The installed Pi runtime supports steering delivery at model-loop boundaries instead. Explicit inspection does not acknowledge pending automatic outcomes, providing another route for already-read results to appear later; the exact read path in these screenshots has not been reconstructed from session logs.
- **Direction:** Deliver substantive outcomes during active work through native steering, preserve idle wakeup for genuinely new results, and avoid automatically redelivering the same outcome already supplied through a tool result. Integrate evidence without ritual acknowledgement chatter. Keep routing origin-scoped and progress UI-only; add no completion gates or reminder loop.
- **Related:** APR-016, AIF-024, AIF-020.
- **Status:** Screenshot/source investigation and proposed direction only. No runtime edits or live delivery test performed.

## APR-016 - Orchestrator closeout left children waiting for parent answers

- **Reference:** Operator screenshot and default session `01a08798-ea1f-715c-829f-acec8f9c4dd8`, 2026-09-09.
- **Observed:** Clara's second parent question returned through a foreground wait. The orchestrator tried `message` instead of `answer`, received a non-retained-conversation error, and launched another worker without resolving or cancelling Clara. Maya later asked for help after a denied deletion prompt. Her record had `userOwned: true`; the orchestrator's answer was rejected because intervention suspended parent control. The orchestrator completed the remaining repository work itself and reported implementation/check completion without settling either child.
- **Finding:** `subagent_parent` questions poll until answered or aborted; ending the orchestrator turn does not cancel them. Visible prompt input marks a child user-owned and prompt closure does not hand it back. The screenshot's generic Working spinners obscure these waits. Source also permits delayed tool activity to overwrite `waiting-parent` phase, as shown in an earlier question's recorded answer snapshot. No process crash or lost question delivery is established by this evidence.
- **Recommended direction:** Make pending parent/user waits explicit in the child UI and give control errors the applicable recovery action. Review approval-prompt ownership separately from deliberate direct intervention. Closeout should resolve or explicitly report remaining children, not silently abandon them. Preserve genuine background work and user-owned panes rather than auto-cancelling on every parent turn end.
- **Related:** APR-008, APR-011, AIF-010, AIF-020. This is an ordinary question/intervention lifecycle issue, not active-child reload recovery.
- **Status:** Investigation only. Default-profile exact-session queries verified the sequence; no live child controls, runtime changes, or instruction changes performed. Recurrence beyond this reported example is not independently counted.

## APR-015 - Blocked `/do-it` integration was easy to mistake for completion

- **Reference:** Bedrock baseline create-once plan execution and operator follow-up, 2026-09-09.
- **Expected:** A fully closed plan is unmistakably complete; a task that passed checks but did not merge clearly demands operator action.
- **Observed:** Implementation, checks, archival, and the task commit succeeded, but dirty target `CHANGELOG.md` state blocked the merge. The final answer led with "Implemented and validated" and placed "Integration: Pending" later, without an explicit overall outcome or required next action. The worktree was correctly retained under the existing contract, but the operator had to ask why it remained.
- **Correction:** A retry after the target became clean produced one narrow changelog conflict. Both entries were preserved, merge commit `94502cc5` and completion metadata commit `cfd46adf` were created, and the worktree was removed. Initial Git cleanup left an unregistered directory because of a Windows long-path error; task-owned remnants were then removed with Node filesystem cleanup.
- **Approved remediation:** `/do-it`, the planning skill, and its template now require outcome-first reporting with colored symbols plus explicit text: green COMPLETED, red NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED, blue IMPLEMENTED: MERGE SKIPPED AS REQUESTED, and yellow CLEANUP PENDING. Blocked/cleanup-pending results foreground Reason and Action needed, including who must act. Routine problems remain agent-owned; intentional no-merge is not a failure. Integration/cleanup checkboxes must remain accurate. No new state registry or renderer.
- **Related:** AIF-016, AIF-023, AIF-010.
- **Status:** Operator approved and instruction changes implemented on 2026-09-09. Scoped wording/contract and whitespace checks passed; live rendering and future model adherence remain unverified.

## APR-014 - Reopened the settled active-subagent reload assumption

- **Reference:** Extension-refactor review and planning discussion, 2026-09-09.
- **Observed:** The assistant treated active-child reload as required functionality, investigated teardown/recovery, and asked the operator to choose its behavior again. It also recommended finish-first command queuing rather than preserving active interaction.
- **Evidence:** APR-011 already says the operator will not reload during running subagent work. Current runtime documentation was interpreted as requiring active teardown instead of reconciling it with that recorded decision. The operator reaffirmed the assumption and explicitly selected interactive steering.
- **Correction:** Exclude active-child reload handling from the plans. Keep ordinary failed-termination cleanup separate. Preserve steering while binding command authority to the relevant invocation. See AIF-022.
- **Related:** AIF-021, APR-011, APR-007.
- **Status:** Scope corrected and decisions recorded. No runtime changes; future adherence unverified.

## APR-013 - Commit reviewer invented an invalid status flag

- **Reference:** Default `/commit` after the Herdr pane-order correction, 2026-09-09.
- **Observed:** Luna ran `git status --short --submodules=short`; Git rejected the unsupported option. The runner stopped as designed, created no commits, and preserved pending changes.
- **Finding:** Initial status was already supplied and `commit_git_review` supported status refreshes, but the prompt emphasized that tool for diffs and left ordinary Git commands to Bash. The whitespace utility instruction also suggested a `--` separator that the utility does not accept.
- **Remediation:** Operator approved a more explicit command-owned workflow. Added tool-selection rules and examples, exact runtime-supplied root/utility paths, staging/commit/push templates, quoting and pagination guidance, and the correct utility arguments. Preserve automatic grouping, deepest-first submodules, quiet output, normal hooks, and existing failure/retry policy. No Git-flag blacklist or general recovery executor.
- **Related:** AIF-004, AIF-009, AIF-010, APR-012. Unlike APR-012, this was a deterministic command error, not a transient provider failure.
- **Status:** Implemented; focused offline checks are recorded in the task result. No live Luna commit retry performed; future adherence remains unverified.

## APR-012 - Commit workflow stopped on a transient WebSocket failure

- **Reference:** Default-profile `/commit` invocation on 2026-09-09.
- **Expected:** A transient provider transport disconnect should recover without operator intervention.
- **Observed:** The single Luna request returned `WebSocket error`; no commit was created and all five intended files remained changed. Historical session records contain similar Codex WebSocket failures.
- **Finding:** The commit runner safely reported actual Git state after failure but configured no provider retry budget, making one transient disconnect fatal.
- **Remediation:** The operator required three retries for this error class before hard failure. The commit runner now forwards a three-retry provider budget; deterministic Git, hook, cancellation, and timeout failures remain terminal.
- **Related:** AIF-010.
- **Status:** Implemented; focused reviewer/shortcut tests and default-profile typecheck pass. Runtime recovery effectiveness remains unverified.

## APR-011 - Subagent UX completion did not establish active-session behavior

- **Reference:** Operator's three-child live test and screenshot following integration of the subagent transcript/pane UX plan, 2026-09-08.
- **Expected:** Human names, readable transcript rows, children in an upper grid, unchanged bottom orchestrator, and no focus theft from another tab after reload.
- **Observed:** Launch responses lacked new display metadata; the screenshot showed generic titles, UUID widget rows, and vertically stacked children below the orchestrator. The operator reported repeated focus theft and confirmed a reload. The assistant had declared completion based on source tests and isolated runs without verifying the active owner.
- **Findings:** The process-global runtime survives reload, and its compatibility check only tests for a method already present in the old owner. Separately, the new layout code explicitly restores earlier focus snapshots after asynchronous operations, so stale code is not a sufficient explanation for every failure. Geometry tests assert logical slots and weak rectangle relationships rather than the full requested grid.
- **Correction:** The operator will not reload during running subagent work. The follow-up plan proposes fresh executable runtime ownership on reload, non-focusing layout operations, physical geometry assertions, completed transcript details, and bounded reload-to-live acceptance. Residual retained-process policy remains a proposal requiring agreement.
- **Related:** AIF-019, AIF-020, APR-008, APR-002. Repository-root-relative plan: `.specs/archive/subagent-reload-and-live-ux/plan.md`.
- **Status:** Planning only. Historical passing checks remain valid for what they exercised; successful operator acceptance was not established. No runtime or global instruction changes made by this entry.

## APR-010 - Temporary Herdr smoke test reached the operator approval UI

- **Reference:** Operator report of an isolated Herdr focus-context smoke test on 2026-09-08.
- **Expected:** Routine creation and cleanup of a fresh temporary test directory and temporary log should proceed without operator interruption when the complete call establishes their lifecycle.
- **Observed:** Damage Control requested whole-call approval for `rm -rf "$scratch"` and displayed unresolved temporary variables. The issue is authority, not a missing special-case parser: confirmed generic deletion `user` rules return before Luna can review the same-call `mktemp` pattern.
- **Follow-up:** The operator clarified that the existing shadow judge should recognize the pattern, and rejected migration-order IDs as active policy names. The selected risk-alignment plan was authorized for execution, including semantic identities and real policy-to-judge routing checks. No new diagnostic judge or temporary-directory recognizer is intended.
- **Evidence:** The original submitted command was recovered as inert regression data. Running real baseline `main` analysis without executing the command returned `user` with confirmed `legacy-007`/`legacy-008`. The task implementation now routes it to review. No actual Luna verdict is verified because the task profile has no configured authentication/model catalog.
- **Related:** AIF-015, APR-004; repository-root-relative `.specs/archive/damage-control-risk-alignment-and-preapproval/plan.md`.
- **Status:** Implementation and offline checks in the task worktree; live acceptance and integration remain pending. The original report was not a captured runtime judge trace, and the baseline probe did not execute the operation.

## APR-009 - Long shell sleep used for deployment monitoring

- **Reference:** Monorepo CPAM deployment monitoring on 2026-09-08.
- **Expected:** Use the operator-requested scheduling workflow for a real external pipeline/deployment wait.
- **Observed:** After pushing the change, the agent attempted a blocking `sleep 120` Bash command instead of scheduling the next check. The command was aborted, and the operator had to correct the tool choice.
- **Impact:** The turn was occupied by an opaque wait and monitoring did not follow the requested workflow.
- **Remediation:** Operator approved a scheduler-owned instruction treating Bash or PowerShell sleeps over 15 seconds as an anti-pattern for genuine external waits and user-requested monitoring. Ordinary implementation continuation remains excluded from scheduling.
- **Related:** AIF-018, APR-003.
- **Status:** Instruction updated; effectiveness remains unverified.

## APR-008 - Invisible delegation appeared hung

- **Reference:** Default session `01a0818c-e3ed-7513-b01d-1df64d202704`, 2026-09-08; operator investigation of three development workers.
- **Expected:** Visible Herdr children by default and enough information to distinguish activity, waiting, and failure.
- **Observed:** The orchestrator explicitly supplied headless overrides. Interrupted foreground waits returned opaque running snapshots; two children later completed and one failed on the RPC frame-size limit. Later completion did not resolve the user-facing hang experience.
- **Remediation:** Operator approved clarifying root/coordinator tool instructions to preserve default visibility (AIF-017). No surface enforcement or headless UX changes are included. Visible panes alone are not proof of progress; headless observability, detached-wait feedback, and transport failure handling remain for a separate discussion.
- **Related:** AIF-010 (diagnostic clarity), AIF-004 (bounded correction).
- **Status:** Instruction correction implemented; effectiveness unverified. UX and transport failures remain unresolved.

## APR-007 - Script-preapproval discussion expanded into unnecessary safety machinery

- **Reference:** Operator discussion of Damage Control preapproval and `/dc scan`, 2026-09-08.
- **Expected:** Reduce repeat analysis/approval for low-risk scripts while preventing meaningful unrecoverable harm; use the requested one-choice approval-and-review flow.
- **Observed:** Assistant proposed a second confirmation, a broad mandatory safety checklist, and dependency-tree handling before establishing their need. It then recommended continuing body analysis despite the operator's scan-skipping objective, and later suggested excluding all helper-using scripts. The operator corrected each direction. Earlier explanations also overstated direct rm prompting without first checking the scoped-delete exemption.
- **Impact:** Repeated clarification and design drift in the conversation. No proposed trust store, extra gate, or dependency framework was implemented.
- **Remediation:** Recorded the governing purpose in the owning default Damage Control contract, completed a bounded current-policy review, and separated agreed feature direction from unresolved implementation details. Helper complexity alone is not a reason to reject preapproval. Existing runtime semantics remain explicit until changed by scoped implementation.
- **Related:** AIF-015, AIF-004, APR-002. This incident concerns proposal scope and inaccurate explanation, not evidence of executed data loss or a new measured failure rate.
- **Status:** Documentation/review complete; effectiveness of the future implementation remains unverified.

## APR-006 — Default subagent plan stopped without a blocker

- **Reference:** Operator-directed execution of `.specs/default-subagents-and-council/plan.md` in `feature/default-subagents`, followed by operator questions about the premature stop.
- **Expected:** Complete the ordered plan in its worktree, validate, archive, commit, and merge, stopping only for a genuine blocker.
- **Observed:** The agent created a cross-cutting prototype spanning several tasks, found major required paths unfinished, then ended with a partial handoff despite explicitly acknowledging no external blocker or unresolved user decision.
- **Impact:** The requested implementation was not delivered; the operator had to ask why execution stopped. Uncommitted prototype work remains isolated in the task worktree.
- **Cause confidence:** The plan explicitly authorized and required continued execution. The agent's stated reasons were task size and implementation mismanagement, which are retrospective explanations rather than blockers. The agent also did not follow the plan's ordered task structure, making progress harder to bound. No evidence shows that a missing plan instruction caused the stop.
- **Related:** APR-001 (same premature-handoff pattern), APR-002 (why merely demanding unlimited continuation can create churn), AIF-003 (bounded finish criteria), AIF-014 (execution and integration guidance).
- **Remediation:** Resume from the recorded worktree and follow task dependencies and done conditions. Do not add a redundant general continuation rule unless further evidence shows the existing explicit instructions are ineffective across agents; consider a task-local architecture probe only if it resolves the authenticated visible-transport seam before more implementation.
- **Status:** Recorded. No instruction change approved; completion and prevention remain unverified.

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
