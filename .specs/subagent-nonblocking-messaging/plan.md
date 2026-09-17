---
created: 2026-09-17
status: draft
completed: null
---

# Keep subagent messaging responsive

## Goal and authorization

The operator requested implementation of the concise Team Lead tool-authority
clarification, then a plan for subagent messaging. The clarification is implemented
separately. This document authorizes no messaging implementation yet.

Requested outcome: improve subagent communication without blocking coordination.
Keep pane/tab work separate and preserve existing role permissions.

**Recommended first scope, pending approval:** remove the coordinator's implicit
join after a message or answer, with regression coverage for sibling outcomes and
parent steering. Reuse existing native delivery and request correlation.

Non-goals for this first scope: new brokers, durable workflow engines, additional
polling loops, permission expansion, blanket retention bans, pane/layout changes,
or redesign of the question protocol. Push, deployment, live-team intervention,
and reload are not authorized by this plan.

## Fresh-context handoff

Paths are relative to `C:/Users/mglenn/.dotfiles`. Read applicable `AGENTS.md` files.
All implementation belongs to this repository's `pi/profiles/default/`; exclude
legacy and module repositories.

Planning baseline: `main` at `ac83ad0817f2251558ba4497d16cc1493ced5628`, plus dirty
working-tree changes. Verified planning profile: default. Intended execution and
validation profile: default.

Read:
- `pi/profiles/default/extensions/subagent-child.ts`: coordinator tool registration,
  foreground launch wait, and implicit message/answer wait.
- `pi/profiles/default/extensions/subagents.ts`: root control and explicit wait.
- `pi/profiles/default/lib/subagents/{runtime,child-surface,rpc,visible,transport}.ts`:
  ownership, delivery, request correlation, and lifecycle.
- `pi/profiles/default/tests/{subagent-child-outcomes,subagent-messaging}.test.ts`:
  existing extension-boundary and transport fixtures.
- `pi/profiles/default/docs/subagents.md` and failure-log entries APR-057/058 in
  `pi/profiles/default/skills/agent-process/references/failure-log.md`.

Preserve existing uncommitted layout/naming changes in `CHANGELOG.md`,
`pi/README.md`, default `docs/{herdr,subagents}.md`,
`lib/subagents/{herdr-layout-api,layout}.ts`, and layout/UX-live tests. Preserve
feedback logs and the separately implemented startup clarification in
`extensions/subagent-child.ts` and `tests/subagent-loader.test.ts`. Recheck status
before work. Do not bundle unrelated work into task commits.

Proposed execution worktree: `C:/Users/mglenn/.dotfiles-worktrees/subagent-messaging`;
branch: `task/subagent-nonblocking-messaging`; integration target: originating
`C:/Users/mglenn/.dotfiles`, `main`. Record actual values on execution. Carry the
task-owned plan without deleting its source. If the clarification is still
uncommitted, preserve it in the originating checkout and carry only its approved
patch as a prerequisite, recording its provenance. Follow the Git workflow skill
for a dirty destination; do not stash or commit unrelated changes without approval.

## Verified behavior and evidence limits

- APR-057: on 2026-09-17, Team Lead Clara answered Iris at 14:44:18Z; the tool
  returned at 14:54:53Z. Root steering sent at 14:47:36Z entered Clara's transcript
  at 14:54:58Z. A later progress message also waited about 152 seconds.
- `subagent-child.ts` calls `waitForChild` after `message` and `answer` unless that
  control call supplies `background:true`. Launch-level background does not carry
  over. Root control dispatches and returns a snapshot without that join.
- `VisibleChild.command` enqueues rather than waiting for assignment completion.
  The verified blocker is the coordinator wrapper, not transport result loss.
- Question IDs, matching answers, first-resolution handling, busy steering, idle
  wakeup, and journal-based outcome acknowledgement already exist. Implementing
  them again would duplicate behavior rather than repair the demonstrated defect.
- Nora's substantive result was delivered. Developers were deliberately retained.
  No stale Maya status, missing result bodies, or worker crash was established.
- Existing transport tests do not exercise the coordinator's implicit control wait.
  Test names and source are not evidence of live model responsiveness.

## Proposed contract and open decision

Approve this bounded first scope before executing tasks:

1. Coordinator `message`, `message` with `replyTo`, and `answer` return after the
   existing dispatch/answer operation, not after child completion. This applies
   with omitted, true, or false `background`. Keep the existing parameter accepted
   as a compatibility no-op and describe the new behavior in tool-owned guidance.
2. A returned running snapshot means dispatch was accepted, not that the model
   read, acted on, or completed it. Do not invent read receipts or a new status API.
3. Preserve queued versus immediate delivery, ownership checks, request matching,
   error propagation, useful retention, and automatic outcomes. No extra turns
   should be generated merely to acknowledge notification delivery.
4. Preserve foreground launch semantics, including forced foreground/non-retained
   Strategist consultation. Keep root's explicit `wait` unchanged; do not add a
   coordinator wait API in this first scope.
5. After a control call returns, the lead can process sibling outcomes and root
   steering through existing native delivery. This is not a guarantee that steering
   interrupts arbitrary unrelated long-running tools or provider calls.

**Decision needed:** approve this narrow first scope, or include broader messaging
changes now? Recommendation: approve the narrow fix first. It addresses a measured
10-minute coordination block without changing the protocol or lifecycle.

Separate proposals, not tasks or acceptance criteria: new delivery-state UI,
generalized correlated request/response exchanges beyond the existing question
protocol, preservation of substantive results across retained follow-up turns,
and Steward guidance parity/removal of approval-style framing. Each needs its own
behavior decision and evidence. Existing fixes must not be reimplemented.

## Execution guidance

Planning does not authorize execution. Once approved, create/resume the recorded
worktree and record actual branch/path/target. Consult Strategist before delegating;
assign at most one named task per subagent, splitting further if needed, using only
the active catalog. Consult Steward after review findings or unexpected agreed
checks before follow-up fixes, subject to the evidence-proved correction exception.

Continue independent work around blockers. Adapt mechanisms within settled intent;
ask before changing scope, decisions, or acceptance. Keep task evidence, blockers,
next action, and action owner accurate. Stop after agreed checks pass and evidenced
task defects are resolved. No mandatory review cycle or live-model test is added.

## Proposed tasks, inactive pending scope approval

- [ ] **T1: Remove implicit coordinator control joins**
  - Depends on: scope approval; no task dependency.
  - Owns: `pi/profiles/default/extensions/subagent-child.ts` and proposed
    `pi/profiles/default/tests/subagent-coordinator-control.test.ts`.
  - Change: implement the proposed nonblocking contract and tool description.
    Use existing extension registration fixtures; hold a worker running while
    invoking each message/answer variant and assert return before settlement.
    Cover omitted/true/false background and a rejected dispatch. Preserve and
    check foreground launch and Strategist override behavior.
  - Verify: from default, `pnpm test subagent-coordinator-control.test.ts subagent-strategist-foreground.test.ts`.
  - Done: dispatch returns while the worker remains running; foreground launch
    waits still work; regression would fail against the old implicit join.
  - Evidence: Not started.

- [ ] **T2: Prove sibling delivery remains actionable after an answer**
  - Depends on: T1's nonblocking control behavior.
  - Owns: `pi/profiles/default/tests/subagent-child-outcomes.test.ts`; reuse existing
    fixtures rather than introducing a second runtime or transport abstraction.
  - Change: exercise the real coordinator tool handler and child surface together
    with controlled transport/model boundaries. Answer held worker A, then deliver
    worker B's substantive outcome and root steering while A remains running.
    Assert the control call has resolved, both deliveries reach the native Pi
    message interfaces, B is journal-acknowledged only after `message_end`, and
    notification content is not duplicated on the next delivery tick.
  - Use deterministic event/timer control, not a long wall-clock completion timeout.
    This proves extension responsiveness, not a live model's chosen response.
  - Verify: from default, `pnpm test subagent-child-outcomes.test.ts subagent-messaging.test.ts`.
  - Done: no A settlement is needed for B/root delivery, existing correlation and
    queued/immediate transport checks remain passing.
  - Evidence: Not started.

- [ ] **T3: Document, validate, and integrate the messaging fix**
  - Depends on: T1 and T2 passing evidence. No useful parallel implementation group
    is required for this small shared-boundary fix.
  - Owns: scoped additions in `pi/profiles/default/docs/subagents.md`,
    `CHANGELOG.md`, APR-057's implementation status, and this spec.
  - Document dispatch versus completion, compatibility parameter behavior, and
    preserved explicit foreground waits without duplicating role guidance.
  - Verify from default: `pnpm test subagent-coordinator-control.test.ts subagent-child-outcomes.test.ts subagent-messaging.test.ts subagent-loader.test.ts subagent-launch-prompt.test.ts subagent-guidance.test.ts`,
    `pnpm test subagent-strategist-foreground.test.ts`, and `pnpm typecheck`. Run
    `git diff --check` for task changes. Reuse current results when unchanged.
  - Done: checks pass, accurate verification limits recorded, and closeout below
    completed. Leave unchecked if integration or cleanup remains unfinished.
  - Evidence: Not started.

## Validation and current handoff

- Status: draft; messaging implementation not started.
- Actual run, 2026-09-17, default `pi/profiles/default/`: startup-clarification-only
  loader, launch-prompt, and guidance suites passed, 22 tests; typecheck passed.
  This is not validation of the proposed messaging fix.
- Prompt review: Team Lead startup authority adds 149 fixed bytes; other roles are
  unchanged. Static composition reviewed with dynamic base/context marked. No live
  model or cache-effect measurement was performed.
- Blocker: first messaging scope is unapproved. Owner: operator. Next action:
  choose the bounded first scope or specify broader changes to include.
- Verification limits: no live-team intervention, attached-client test, or claim
  that a model will promptly act on every delivered message.

## Closeout after authorized execution

After implementation and agreed checks pass, record integration pending. Confirm
`.specs/archive/subagent-nonblocking-messaging/` is unoccupied, move the whole spec
there on the task branch, repair links, and commit task changes plus archived plan.
Merge into the recorded originating checkout/branch using the Git workflow skill;
preserve unrelated work and resolve routine task conflicts. If a dirty destination
requires an operator preservation choice, ask with the exact conflicting paths.
Retain the worktree if blocked and record reason, next action, and owner.

After successful integration, verify the target contains the implementation and
archive, remove only the task-owned active plan copy, set completed metadata in the
archived plan, and commit that metadata update on the target. Remove the task
worktree only once clean and fully merged. Do not push or deploy without separate
authorization. Operator manual/live testing is a non-blocking verification limit.

Report one explicit outcome first: 🟢 COMPLETED, 🔴 NOT COMPLETE: MERGE BLOCKED,
🔴 NOT COMPLETE: USER INPUT REQUIRED, 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED,
or 🟡 CLEANUP PENDING. For blockers, lead with reason and exact action/owner before
passed checks. Include concise checks, archive path, commits, integration result,
and retained worktree/cleanup remnants. Never mark unfinished integration complete.
