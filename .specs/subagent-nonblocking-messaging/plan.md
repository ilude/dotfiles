---
created: 2026-09-17
status: draft
completed: null
---

# Refine delegation activation, make messaging responsive, and preserve results

## Goal, scope, and authorization

The operator explicitly requested reworking this existing plan to address four
related concerns as one lifecycle, not a narrow blocking fix followed by unspecified
future work:

1. Nonblocking message and answer dispatch.
2. Responsive delivery of sibling results, questions, and parent direction.
3. Honest distinctions between dispatch acceptance, pending response, completion,
   and a completed conversation retained for follow-up.
4. Preservation of the original assignment result separately from later replies.

The complete path is **dispatch -> native delivery -> response/outcome -> retained
follow-up -> cleanup**. All four concerns are required for completion of this plan.
Tasks below divide implementation ownership, not the requested scope into optional
phases. Existing mechanisms should be preserved where they already satisfy it.

The operator also requested incorporating the discussed orchestrator delegation
and Strategist activation changes. Contract E and T1b cover this additional
prompt-policy outcome; they do not replace or narrow the four messaging outcomes.

Authorization is plan revision only. Prompt/runtime implementation, commits, merge,
push, deployment, reload, and live-team intervention have not been requested by
this revision. The closeout contract applies after execution is authorized.

Out of scope: Steward guidance changes, pane/tab layout, expanded tool authority,
a new broker or durable workflow engine, new polling loops, generalized request
protocols, model-generated read receipts, and blanket retention bans. The approved
Team Lead startup tool-authority clarification is already implemented separately.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read applicable `AGENTS.md`
files. Implementation belongs to `pi/profiles/default/`; exclude legacy and module
repositories. Verified planning profile and intended execution profile: default.

Revised planning baseline: `main`, `c3fbed9ad8490d5713483febbc2e828a6c8aa2dd`.
The original draft used `ac83ad08`. Layout/naming, startup clarification, feedback,
and the original plan are now committed in the baseline; do not carry old dirty
patches from the previous handoff. At revision start the only reported dirt was
inside `modules/onclave`; preserve it and do not inspect or modify that module.
Recheck status before execution and preserve any subsequent unrelated changes.

Required source reading:
- `pi/profiles/default/extensions/{subagent-child,subagents}.ts`: coordinator/root
  controls, foreground waits, return values, and tool guidance.
- `pi/profiles/default/lib/subagents/{rpc,visible}.ts`: assignment state, question
  answers, follow-up turns, snapshots, and cleanup.
- `pi/profiles/default/lib/subagents/{runtime,child-surface,transport}.ts`: routing,
  mailbox consumption, native delivery, and journal acknowledgement.
- `pi/profiles/default/lib/subagents/{status,presentation}.ts`: model-visible text,
  tool rows, notifications, inspection, and retained-state presentation.
- `pi/profiles/default/lib/subagents/guidance.ts`, `agents/{teamlead,strategist}.md`,
  and the root `before_agent_start` composition in `extensions/subagents.ts`:
  audience-specific activation policy and separately appended caller guidance.
- Existing tests named in the tasks; `pi/profiles/default/docs/subagents.md`;
  APR-057/058/059 and AIF-069/071/072/074 in the agent-process reference logs.
- `pi/profiles/default/skills/planning/{SKILL.md,references/plan-template.md}` and
  `prompts/do-it.md`: preserve intended plan consultation and execution authority.
- Installed Pi documentation for any affected extension/TUI API before changing it;
  use default-profile prompting, TypeScript, and testing skills as applicable.

Proposed execution worktree: `C:/Users/mglenn/.dotfiles-worktrees/subagent-messaging`;
branch: `task/subagent-nonblocking-messaging`; originating integration target:
`C:/Users/mglenn/.dotfiles`, `main`. Record actual values before editing. Carry this
revised task-owned plan into the worktree without deleting its source. Follow the
Git workflow skill for dirty-destination preservation; never commit, stash, or
discard unrelated work without operator authorization.

## Evidence: defects versus existing behavior

**Verified blocking defect.** APR-057 records a coordinator answer blocked for
10m35s and a later notification for about 152 seconds. `subagent-child.ts` still
calls `waitForChild` after `message`/`answer` unless that control call supplies
`background:true`. Root controls do not join. A launch's background flag does not
carry over. `VisibleChild.command` only enqueues, so this wait is in the wrapper.

**Existing delivery mechanisms.** Busy steering, idle wakeup, question IDs, matching
answers, first-resolution handling, origin-scoped mailboxes, and journal-based
acknowledgement already exist. Both child surfaces use them. Do not recreate these
features or assume their individual tests establish the combined lifecycle.

**Current status ambiguity.** Control success returns a child snapshot rather than
an explicit dispatch result. The queued-message notice promises application before
the next model response, although transport acceptance is not evidence of model
consumption. Presentation derives completion from current status/outcome, without
clearly labeling completed-but-retained conversations. `interaction:"request"` is
accepted but does not by itself establish a general correlated pending-response
record in `RpcChild.message`; do not present it as such.

**Verified mutable-result behavior.** `RpcChild.startMessage` clears result/outcome
and replaces assignment text and timing; answering a parent question also uses this
path. Visible `operator-input` and intervention paths clear current result fields.
`finishFromTurn` records the latest reply in the same result field. No independent
original-assignment result currently exists. Historical Nora follow-up changed the
latest result, but the Team Lead had already received her substantive result.

**Verified stale-result mismatch.** AIF-070 records a separate layout handoff:
lead transcript `01a0b051-20c1-7681-a1e7-cc553ccfadf9`, record `b238075b`
(2026-09-17, 17:50:54.978Z), reported completed work and validation, but the exited
lead's inspected record and parent notification retained an older partial report
claiming work was active. The [investigation and deterministic reproduction](investigation.md)
established that an explicit partial survives deferred settlement while descendants
are outstanding. On a later settling turn, `RpcChild.finishFromTurn` prefers the
stored report over the newly received final text and retains the partial outcome.
This occurs within one ongoing assignment, before any retained follow-up. The probe
reproduced real selection and formatting behavior; historical wire payloads were not
recorded, so actual final-wire receipt remains inferred rather than directly logged.

**Related mailbox transition.** `runtime.ts` handles idle `operator-input` by
acknowledging pending outcomes for that child and its descendants. This is source
proof of consumption without parent receipt, not proof that the historical incident
lost a result. It must be reconciled with retained-result preservation.

No missing historical result bodies, stale Maya status, or worker crash was
established. Retained workers were deliberately retained. Preserve useful retention
rather than treating an open process or pane as evidence of unfinished work.

**Verified activation mismatch.** AIF-071 records an orchestrator consulting
Strategist before an explicitly requested single Team Lead, duplicating the lead's
own consultation. AIF-074/APR-059 record a UX problem report followed by premature
staffing and implementation without a findings/remedy discussion. Caller guidance
currently requires consultation before every delegation; the extension separately
appends "Use a Team Lead only when coordination helps." Team Lead has its own
Strategist-first workflow. These are activation/authority issues, distinct from
blocking message controls. Advisory recommendations do not authorize fixes.

## Unified implementation contract

### A. Dispatch and delivery

- Coordinator `message`, `message` plus `replyTo`, and `answer` return after the
  existing dispatch/answer operation, not assignment completion. Apply this for
  omitted, true, and false `background`; keep that existing control parameter
  accepted as a compatibility no-op. Launch-level background remains meaningful.
- Root and coordinator control results distinguish **dispatch accepted** from the
  separately reported current child state. Preserve existing top-level snapshot
  fields for consumers; add operation metadata rather than replacing the result
  with an incompatible envelope. Metadata belongs to that call, not permanently
  to the child or every later outcome. A dispatch rejection remains an error.
- Acceptance means the existing native command/queue boundary accepted the input.
  It does not mean a model read it, acted on it, or completed the assignment. A fast
  worker may already be settled when the snapshot is captured; do not falsely
  force a running state to demonstrate nonblocking behavior.
- Preserve queued steering versus intentional immediate redirect, origin/direct-
  child ownership, user intervention, request-ID validation, and normal errors.
  Preserve foreground launches, forced foreground/non-retained Strategist calls,
  and root's explicit wait. No new coordinator wait API is needed.
- After dispatch returns, siblings and parent direction use the existing native
  delivery path while the target continues. Idle parents wake; busy parents receive
  steering at native boundaries. Do not promise interruption of arbitrary tools or
  provider calls. Progress remains UI-only; no receipt-chatter model turns.

### B. Status and response semantics

Report independent facts rather than collapsing them into one success label:

| Fact | Required meaning |
| --- | --- |
| Dispatch accepted | Native command/queue accepted this input, not a read receipt. |
| Parent reply pending | An existing unresolved question request with its request ID. |
| Working / following up | Current execution is active; earlier completed work remains separate. |
| Completed, retained for follow-up | Work settled successfully; a live retained conversation is available. |
| Follow-up completed | Latest exchange settled; it does not replace the original result. |
| Closed / cleanup unresolved | Resource state, separate from the work's outcome. |

Preserve partial, blocked, failed, cancelled, and user-only-input distinctions.
A retained failed/partial conversation must not be labeled successful completion.
A dead retained process is not available for follow-up. Generic `interaction:request`
can be reported as requesting a response, but must not invent a correlated pending
reply or read receipt. This plan does not add a new general request protocol.

Use existing tool results, `/subagents` inspection, and notifications. No new
persistent status widget or event stream. Keep compact views concise and expose
full bounded details on inspection/expansion. Correct misleading tool-owned wording
at its source rather than adding redundant Team Lead instructions.

### C. Original result versus current conversation

- Select the correct current result before preserving it. An explicit partial/blocked
  report from an earlier deferred settlement turn must not override a later normal
  completion with no renewed report. Preserve explicit partial/blocked reports made
  in the turn that actually settles. Use settlement-cycle identity, not prose
  interpretation or a blanket preference for latest text. Do not reset reports on
  every native tool/model `turn_start`: the report and its final acknowledgement
  can span multiple such turns within one `agent_settled` cycle.
- Preserve original launch instructions and the original assignment's terminal
  outcome/result/error and start/finish times independently of the current exchange.
  A question yield is not a terminal result. Answering questions or redirecting work
  before its first settlement still belongs to that original assignment.
- Capture the original assignment's first terminal outcome once. Subsequent parent
  messages or direct user follow-ups, their answers/errors, and cleanup cannot erase
  it. Partial/blocked/failed/cancelled remain accurately labeled, not promoted to
  success. Do not infer from prose whether a later reply supersedes earlier work.
- Preserve the existing current `assignment`, `result`, `outcome`, and timing fields
  for compatibility; add an original-assignment snapshot and enough explicit
  exchange identity to label later replies as follow-ups. Exact type/field names
  are implementation choices. Snapshots and queued deliveries must not share a
  mutable nested result object.
- Keep one original terminal snapshot plus existing current-exchange state, not an
  unbounded conversation history. Preserve existing text limits. Native transcripts
  remain the full conversation record. No new persistence beyond the current runtime
  and existing transcript lifecycle is required.
- Inspection and expanded details expose both original result and latest follow-up.
  Automatic notifications identify which exchange completed and deliver its result;
  they must not replay the full original result on every follow-up or imply that a
  follow-up answer is the original assignment's conclusion.

### D. Consumption and lifetime

- A follow-up does not count as parent consumption of a previous outcome. Keep
  pending outcome snapshots until journal acknowledgement or an explicit tool read
  that actually supplies that outcome. Preserve the existing duplicate-suppression
  rules, request resolution, and origin isolation.
- Inspect/consume must acknowledge only outcomes represented in the returned data,
  not blindly erase unread exchanges merely because they share a child ID. Original
  result and latest reply need distinguishable identities where consumption depends
  on them; reuse existing delivery IDs/turn information rather than a second broker.
- Preserve non-retained cleanup, explicit finish/cancel, and useful retention.
  Finishing a settled conversation must not replace work output with an exit reply.
  Retained results live for the existing record/transcript lifetime, not forever.
- Keep settled-only reload and existing parent-loss behavior. Carry added result
  fields through current snapshot/delivery paths where applicable; do not introduce
  active-child migration or restart recovery.

### E. Orchestrator delegation and Strategist activation

- Consult Strategist for implementation-plan execution or user-authorized work
  suited to parallel subagents or Team Leads. Preserve plan-specific consultation;
  do not remove it from the planning skill, template, existing plans, or `/do-it`.
- Delegate standalone jobs to a single subagent or Team Lead only when explicitly
  requested or to conserve context. Explain context-conservation delegation and
  skip the orchestrator's Strategist consultation in either case. Otherwise do
  standalone single-worker work directly, including when Strategist recommends
  one worker without an exception. Individual assignments or temporarily serial
  stages within an authorized multi-agent decomposition may still use subagents.
  This restriction concerns work assignments, not advisory consultations such as
  Strategist and Steward, which retain their own activation rules.
- An explicit single-agent handoff also bypasses the orchestrator's consultation
  when handing off plan work. It does not change the Team Lead's own workflow.
- When the user requests delegation while continuing another discussion, launch
  the requested agent in the background and continue the discussion. Background
  launch already exists; this is caller guidance, not a new runtime mechanism.
  Nonblocking subsequent controls remain contract A's separate responsibility.
- Replace the caller's opening paragraph in `lib/subagents/guidance.ts`, rather
  than appending exceptions to its blanket trigger. Remove "reuse its advice for
  related assignments." In `extensions/subagents.ts`, qualify the separate Team
  Lead sentence as "When choosing a Team Lead yourself, use one only when
  coordination helps," and add the requested background/discussion behavior there.
  Preserve the remaining caller guidance, catalogs, and tool descriptions.
- Keep Team Lead's Strategist-first workflow, Steward policy, role permissions,
  tool schemas, and foreground/non-retained Strategist execution unchanged. No
  runtime authorization gate, consultation receipt, or global AGENTS.md change.
  A problem report or discussion does not automatically authorize implementation;
  existing scope/approval instructions remain applicable.

**Settled decision E1:** The operator selected standalone jobs. The restriction
is not a limit on each assignment or stage of an authorized multi-agent
decomposition; T2b may use a subagent even if it is temporarily the only ready task.
The messaging scope, dependencies, and acceptance remain unchanged.

## Execution guidance and task boundaries

This is one combined change. On execution authorization, create/resume the recorded
worktree and consult Strategist before delegation. An explicit request to hand
work to a single Team Lead/subagent follows contract E's direct-dispatch exception.
Assign at most one named task
per subagent; split further when needed and use only the active catalog. Consult
Steward after review findings or unexpected agreed checks before follow-up fixes,
subject to the evidence-proved correction exception.

T1 and T2a are independent and should run concurrently with the write ownership
below. Integrate T2a's stale-result fix before T2b changes the shared result state.
T1b follows T1 solely to avoid simultaneous edits to `extensions/subagents.ts`;
it can run alongside T2a/T2b or T3/T4. After T1 and T2b are
integrated, T3 and T4 can run concurrently. T5 verifies the combined messaging
lifecycle independently of T1b's prompt checks. T6 closes out both guidance and
messaging. These boundaries do not authorize dropping any required outcome.

Continue independent work around blockers. Adapt mechanisms within settled intent;
ask before changing behavior, scope, or acceptance. Keep evidence, blockers, next
action, and action owner accurate. Do not add mandatory review cycles, speculative
safeguards, or live-model acceptance gates. Stop when agreed checks pass and evidenced
task-related defects are resolved.

## Tasks

- [ ] **T1: Make message controls nonblocking and report dispatch honestly**
  - Depends on: execution authorization; no task prerequisite. Parallel with T2a.
  - Owns: `pi/profiles/default/extensions/{subagent-child,subagents}.ts`, proposed
    `lib/subagents/control-result.ts` if a shared result builder is useful, and
    proposed `tests/subagent-coordinator-control.test.ts`. Existing control-error
    and Strategist tests may be extended here.
  - Implement contract A and dispatch metadata from B. Return existing snapshot
    fields plus per-call acceptance metadata on both root and coordinator paths.
    Keep errors native and launch/wait behavior unchanged. Publish the actual
    metadata type and examples for T4/T5; do not change `ChildRecord` in parallel.
  - Verify from default: `pnpm test subagent-coordinator-control.test.ts subagent-control-errors.test.ts subagent-strategist-foreground.test.ts`.
    Exercise plain message, replyTo message, answer, all background values, queued
    and immediate modes, rejected dispatch, and a held-running child. Do not mock
    away the coordinator handler's return/wait boundary. Hold the worker running
    until explicitly released and assert the control resolves first; a mock that
    automatically returns running then settled can let the old blocking code pass.
  - Done: calls resolve before the held child settles; acceptance is explicit and
    not called completion; old behavior fails the regression; Strategist still waits.
  - Evidence: Not started.

- [ ] **T1b: Refine orchestrator activation and explicit handoffs**
  - Depends on: execution authorization and integrated T1 extension edits. The T1 dependency is write ownership, not runtime behavior.
    Parallel with ready T2a/T2b or T3/T4 work; no dependency on result preservation.
  - Owns: `pi/profiles/default/lib/subagents/guidance.ts`, the caller prompt suffix
    in `extensions/subagents.ts`, and `tests/subagent-guidance.test.ts`. Extend the
    existing root-extension composition test if needed to exercise the real suffix;
    keep checks together with the owning test surface, not a new test framework.
  - Implement contract E and the settled standalone-job boundary in E1. Replace conflicting
    caller wording, rather than layering duplicate rules. Do not change T1's
    controls, Team Lead/Strategist/Steward workflows, or plan-specific consultation.
  - Render the full affected caller composition: inherited instructions, injected
    guidance, catalog, suffix, and relevant tool guidance. Identify dynamic
    project/assignment sections. Check the preserved plan and Team Lead prompts
    for conflicts without copying orchestrator policy into those audiences.
  - Verify from default: `pnpm test subagent-guidance.test.ts subagent-loader.test.ts subagent-launch-prompt.test.ts`.
    Assert activation conditions, explicit/context handoffs, advisory exclusion,
    background discussion guidance, the standalone-job boundary, unchanged Team Lead
    workflow, and absence of the old blanket caller trigger. Include any extended
    root-composition test in the final focused batch. Compare composed byte counts
    and deterministic output; justify any changed size ceiling rather than silently
    relaxing it. Static tests establish prompt composition, not model adherence or
    actual provider cache performance.
  - Done: composed caller guidance expresses the agreed policy without conflicting
    suffixes; unaffected audiences and runtime contracts remain unchanged; focused
    checks pass. Supply wording, size comparison, and evidence to T6.
  - Evidence: Not started; E1 resolved by the operator as standalone jobs.

- [ ] **T2a: Correct deferred-turn result selection and add its regression**
  - Depends on: execution authorization; causal investigation is complete. Parallel
    with T1; no implementation-task prerequisite.
  - Owns: shared report/settlement handling in
    `pi/profiles/default/lib/subagents/rpc.ts`, necessary visible-turn integration
    in `visible.ts`, and focused regressions in existing
    `tests/{subagent-terminal-outcomes,subagent-rpc}.test.ts`.
    No writes to T1's extension files or downstream presentation/mailbox files.
  - Implement contract C's settlement-turn report lifetime using the established
    trace in `investigation.md`. Correct both stale text selection and the stale
    outcome. This task owns the fix and permanent regression, not original-result
    preservation. No prose inference, success-reporting tool, approval gate, or
    cleanup gate; the model judges work sufficiency, runtime reports its evidence.
  - Regression: submit an explicit partial, defer settlement with descendants
    outstanding, continue through ordinary input/turns, then release descendants
    and submit the later normal final. Assert the final text and complete outcome
    replace the earlier deferred report. Drive the actual selection path, not a
    pre-corrected snapshot. Retain controls for normal completion without a report
    and explicit partial/blocked reporting in the same settling cycle, including
    its tool/model-turn continuation. Share the corrected sequence with T2b/T5.
  - Verify from default: `pnpm test subagent-terminal-outcomes.test.ts subagent-rpc.test.ts`.
  - Done: the deferred-report regression fails on old code and passes with the fix;
    same-settling-cycle partial/blocked reports remain accurate on both child paths.
  - Evidence: Investigation completed 2026-09-17; see [causal trace and deterministic reproduction](investigation.md).
    An earlier explicit partial survives deferred settlement and overrides a later
    final in `RpcChild.finishFromTurn`. Reuse this evidence rather than repeating
    discovery. Correction and permanent regression are not implemented; task remains
    unchecked. The probe reproduced current faulty behavior, not a passing fix.

- [ ] **T2b: Preserve original assignment results across follow-ups**
  - Depends on: T2a's integrated selection fix and regression, so preservation is
    built on correct current-result behavior rather than freezing the stale report.
  - Owns: `pi/profiles/default/lib/subagents/{rpc,visible}.ts` and
    `tests/{subagent-rpc,subagent-messaging,subagent-terminal-outcomes}.test.ts`.
    Runs after T2a because these files and result transitions overlap.
  - Implement contract C's state model and snapshot copying in both child surfaces.
    Cover parent follow-up, answers within the original assignment, visible direct
    input, and existing intervention transitions. Publish concrete optional record
    fields and immutable snapshot semantics for T3/T4. Keep old fields compatible.
    Reuse existing mechanisms; add fields only for the original/current distinction.
    Preserve T2a's corrected current-result selection and regression.
    Correct the queued-message notice to describe acceptance without promising
    consumption before the next model response.
  - Complexity: several paths reset current state, and a question yield must not
    prematurely freeze the original result. Centralize shared transitions where
    useful without redesigning the entire child class hierarchy.
  - Verify from default: `pnpm test subagent-rpc.test.ts subagent-messaging.test.ts subagent-terminal-outcomes.test.ts`.
    Cover original completion, pending question/resume, follow-up running/completion/
    failure, snapshot immutability, and finish/cancel preserving original evidence.
    Drive lifecycle events through the real result-selection code; do not install
    the expected final result directly into state and then assert it survived.
  - Done: original instructions/result/outcome/timing survive later exchanges on
    visible and headless children; current replies remain independently available.
  - Evidence: Not started.

- [ ] **T3: Preserve unread outcomes across follow-up transitions**
  - Depends on: T1's returning control path and T2b's original/current identity and
    immutable snapshot contract. Parallel with T4 after T1/T2b integration.
  - Owns: `pi/profiles/default/lib/subagents/{runtime,child-surface}.ts` and
    `tests/{subagent-runtime,subagent-child-outcomes,subagent-session-lifecycle}.test.ts`.
  - Implement contract D using existing delivery IDs and acknowledgement paths.
    Remove implicit consumption caused solely by idle direct input. Ensure explicit
    consume only covers returned outcomes, including when a retained child has
    completed more than one exchange. Keep questions and resolution notices distinct.
    Carry T2b fields through pending/inert snapshots without aliasing or result loss.
  - Verify from default: `pnpm test subagent-runtime.test.ts subagent-child-outcomes.test.ts subagent-session-lifecycle.test.ts`.
    Test an unacknowledged original result followed by direct input and a new reply,
    journal acknowledgement, represented versus unread consume, repeat delivery,
    and unchanged origin/session-switch isolation. Replace the existing runtime
    test `retires a previously pending outcome when an idle visible child accepts
    an operator turn` with the intended preservation assertion; its current
    expectation deliberately conflicts with the new contract.
  - Done: follow-up activity cannot erase unread original/sibling outcomes; actual
    consumption suppresses repeats without fabricating receipt or completion.
  - Evidence: Not started.

- [ ] **T4: Present dispatch, work, retention, and replies as distinct facts**
  - Depends on: T1's dispatch metadata and T2b's original/current result contract.
    Parallel with T3; no writes to its runtime or surface files.
  - Owns: `pi/profiles/default/lib/subagents/{status,presentation}.ts` and
    `tests/{subagent-status,subagent-presentation}.test.ts`.
  - Implement B and C across model-visible text, control rows, inspection/listing,
    and notification details. Label completion-with-retention and follow-up work;
    show original and current results distinctly in full views. Keep historical
    records lacking new fields readable. Do not repeat full original output in
    every follow-up notification or mistake transport acknowledgement for reading.
  - Verify from default: `pnpm test subagent-status.test.ts subagent-presentation.test.ts`.
    Cover accepted-but-running, question pending, completed/live retained, follow-up
    active/completed/failed, closed retained process, and old-format records.
  - Done: humans and parent models can distinguish the lifecycle states and retrieve
    original evidence without confusing it with the latest conversational answer.
  - Evidence: Not started.

- [ ] **T5: Prove the combined messaging lifecycle**
  - Depends on: integrated T1, T2a, T2b, T3, and T4 with focused passing evidence.
  - Owns: proposed `pi/profiles/default/tests/subagent-messaging-lifecycle.test.ts`
    and only necessary additions to existing inert fixtures.
  - Exercise the scenario below through real coordinator controls, real runtime
    state/consumption, and native delivery adapters. Replace external model/Herdr
    boundaries with existing deterministic fixtures; do not mock away the wait,
    result transitions, or mailbox being tested. Use controlled events/timers,
    not long wall-clock sleeps. Include visible/headless variants at their actual
    differing boundaries rather than claiming UI coverage from a generic fake.
    Reuse the real runtime and inert child fixtures rather than recreating dispatch,
    settlement, or mailbox logic in a fake runtime. Keep exceptional branches in
    focused tests instead of combining every case into one long scenario.
  - Extend the deferred-partial/later-final sequence from `investigation.md` and
    T2a's regression through current inspection, parent delivery, and process
    exit/cleanup. Verify the later final text and complete outcome survive all
    those boundaries. Do not rediscover the cause, duplicate the focused selection
    regression, or assign the underlying fix to this integration-test task. This is
    reporting validation, not a runtime gate on agents continuing or finishing.
  - Verify from default: `pnpm test subagent-messaging-lifecycle.test.ts`.
  - Done: all four requested outcomes hold together in the scenario, with accurate
    limits on what inert integration evidence proves.
  - Evidence: Not started.

- [ ] **T6: Document, validate, and integrate the whole change**
  - Depends on: T1, T1b, T2a, T2b, T3, T4, and T5 passing evidence.
  - Owner: orchestrator; implementation tasks must supply their completed changes
    and evidence rather than leaving unfinished work for closeout.
  - Owns: scoped updates in `pi/profiles/default/docs/subagents.md`, `CHANGELOG.md`,
    APR-057/059 and AIF-071/074 resolution status in the agent-process reference
    logs, and this spec. Preserve historical facts and other concurrent entries.
  - Document the unified lifecycle, compatibility behavior, original/latest result
    distinction, activation policy, and preserved plan/Team Lead/foreground contracts.
    Reconcile the docs' blanket consultation and single-worker recommendation text
    with E1. Record the policy decision and verification limits without duplicating
    executable guidance in feedback logs. Run the finite checks below, reusing
    still-current focused results. Complete the closeout contract.
  - Done: all four messaging outcomes and contract E documented and tested, implementation and archive
    integrated, completion metadata committed, task worktree cleanup verified.
    Leave unchecked while integration or cleanup is pending.
  - Evidence: Not started.

## Combined acceptance scenario and finite validation

1. A Team Lead coordinates A (waiting on a question) and B (retained worker).
2. The lead answers A using its request ID. The control returns acceptance while
   A is deliberately held running; no completion or read receipt is claimed.
3. B finishes with substantive result R. While A still runs, B's outcome and root
   direction reach the lead's native delivery interfaces. An idle lead wakes and
   a busy lead receives steering at the existing native boundary.
4. Journal acknowledgement consumes B's notification once. B is shown as completed
   and available for follow-up, not still working just because its process is alive.
5. A follow-up to B yields reply F. During and after that exchange, inspection still
   exposes original result R separately from the current exchange and F. Only the
   new exchange is notified as new work. Also cover direct input before R is consumed:
   R must remain pending rather than being silently acknowledged by that input.
6. Finish B after follow-up settlement. Its cleanup does not overwrite R or F with
   an exit acknowledgement. A's eventual result remains independently deliverable.

Boundary checks also cover rejected dispatch, stale question replies, follow-up
failure, no false correlated response status for a plain notification, origin
isolation, and retained-process availability. Existing tests are extended where
needed rather than duplicated into a second test framework.

Test scope: T1, T2a, T2b, T3, and T4 combine focused unit/component tests with existing runtime
integration tests; T5 is integration coverage, not a unit test. Mock external
boundaries when needed, not the behavior being verified. Direct state fixtures are
appropriate for isolated rendering, but do not establish lifecycle correctness.
Assert causal ordering and meaningful output fields rather than tight elapsed-time
thresholds, incidental polling counts, private helper sequences, or broad rendering
snapshots. These tests establish the exercised runtime behavior, not live-model
response time or freedom from every future regression.

After integration, from `pi/profiles/default/` run one focused combined batch:

```bash
pnpm test subagent-coordinator-control.test.ts subagent-control-errors.test.ts subagent-strategist-foreground.test.ts subagent-rpc.test.ts subagent-messaging.test.ts subagent-terminal-outcomes.test.ts subagent-runtime.test.ts subagent-child-outcomes.test.ts subagent-session-lifecycle.test.ts subagent-status.test.ts subagent-presentation.test.ts subagent-messaging-lifecycle.test.ts subagent-cleanup.test.ts subagent-loader.test.ts subagent-launch-prompt.test.ts subagent-guidance.test.ts
pnpm typecheck
```

Run `git diff --check` for task changes. Fix demonstrated task-related failures;
rerun only affected checks when changes make earlier results stale. No mandatory
full-profile, paid-model, attached-client, or production-team test is added.

## Current handoff and evidence

- Status: revised draft covering all four messaging concerns plus orchestrator
  activation/handoff guidance. No implementation has started. E1 is settled as
  standalone jobs. Next action: operator plan review and execution authorization.
  The decision to deliver
  the whole messaging lifecycle remains settled.
- T2a diagnosis is complete: see [investigation.md](investigation.md). Remaining
  T2a work is the deferred-report lifetime fix and permanent regression, followed
  by T2b's original-result preservation. T5 verifies corrected delivery/cleanup;
  T6 is orchestrator-owned closeout. Messaging dependencies remain unchanged;
  T1b adds the separately requested guidance work. Implementation remains unauthorized.
- Investigation run, 2026-09-17, default `pi/profiles/default/`: an inline inert
  Node/tsx probe reproduced stale selection using real child/result code. Controls
  confirmed normal completion and same-cycle partial reporting. These are current-
  behavior reproduction results, not validation of an implemented fix. No runtime
  source or permanent tests changed; this reconciliation is documentation-only.
- No remaining behavior question is identified for the messaging design. Its field
  names, helper placement, and fixture organization are implementation choices.
  The added delegation policy's E1 decision is resolved as standalone jobs; no
  recorded behavior question remains. Preserve the decision to address messaging
  concerns 1-4 together.
- Activation-policy revision, 2026-09-17, default: incorporated the operator's
  requested plan changes after inspecting caller/role composition, planning
  guidance, and prompt tests. Preserved the existing uncommitted plan revision.
  Only this plan changed in this revision; no executable instructions, runtime
  code, or tests changed or ran.
- Planning revision: default profile verified via `pi_session`; current source and
  Git baseline inspected. No runtime tests run for this documentation-only revision.
- Historical actual run, 2026-09-17, default: startup-clarification loader,
  launch-prompt, and guidance suites passed (22 tests), as did typecheck. That was
  validation of the separate clarification, not this messaging plan.
- Limits: deterministic integration establishes extension/runtime behavior, not a
  live model's chosen response time or attached-client UX. No live controls or reload
  performed. Actual execution runs must record date, profile/path, scope, and result.

## Closeout after authorized execution

After implementation and agreed checks pass, record integration pending. Confirm
`.specs/archive/subagent-nonblocking-messaging/` is unoccupied, move this entire spec
there on the task branch, repair links, and commit implementation plus archived plan.
Do not archive unfinished implementation.

Merge into the recorded originating checkout/branch using the Git workflow skill.
Preserve unrelated work and resolve routine task conflicts. If a dirty destination
needs an operator preservation choice, report the exact paths and ask. If blocked,
retain the worktree and record reason, next action, and owner. An explicit no-merge
instruction is an intentional exception, not an implementation failure.

After successful integration, verify the implementation and archive are on target
and remove only the task-owned active plan copy. Set the archived plan's completed
status/date, record integration evidence, and commit that metadata update on target.
Remove the task worktree only when clean and fully merged. Do not push or deploy
without separate authorization. Operator manual/live testing does not block closeout.

Report one explicit outcome first: 🟢 COMPLETED, 🔴 NOT COMPLETE: MERGE BLOCKED,
🔴 NOT COMPLETE: USER INPUT REQUIRED, 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED,
or 🟡 CLEANUP PENDING. For blockers, lead with reason and exact action/owner before
passed checks. Include concise checks, archive path, commits, integration result,
and retained worktree/cleanup remnants. Never mark unfinished integration complete.
