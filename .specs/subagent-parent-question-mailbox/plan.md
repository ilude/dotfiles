---
created: 2026-09-17
status: ready
completed: null
---

# Make subagent parent questions visible and asynchronously actionable

## Goal and scope

- User requirements and settled decisions:
  - A subagent question must display its complete text in the visible child so the user knows exactly what was asked.
  - The user may converse normally with the child to investigate or supply information. The child decides when its question has been answered and then cancels the pending parent question itself before continuing.
  - Every pending question must enter a process-local, origin-scoped parent mailbox immediately. The parent receives it at the first safe Pi model boundary without aborting active work or waiting for unrelated foreground subagent calls to finish.
  - Parent delivery must not be suppressed merely because the child has an attached foreground wait.
  - Resolution is race-safe: the first valid parent answer or child cancellation resolves the request; undelivered resolved questions are removed, delivered questions receive a concise resolution update, and late answers report the actual prior resolution rather than a generic stale-request error.
- Non-goals:
  - No Onclave source, protocol, broker, service, server, or deployment changes. Onclave was only an example of a client-side delivery pattern.
  - No cross-process or restart durability, user-facing answer command, persistent registry, polling loop, interruption of active parent tools, or change to general subagent wait guidance.
- Authorization: planning only. A later implementation request authorizes local changes in a dedicated task worktree, task commits, archival, and merge into the recorded target. Push and deployment are not authorized.

## Fresh-context handoff

All paths are relative to the dotfiles repository root. Read root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, `pi/profiles/default/skills/pi-extension/SKILL.md`, and the installed Pi `docs/extensions.md` before acting.

- Owning repository and boundary: this dotfiles repository owns the default Pi subagent runtime under `pi/profiles/default/`. Do not modify `modules/onclave/`.
- Required reading:
  - `pi/profiles/default/extensions/subagents.ts`
  - `pi/profiles/default/extensions/subagent-child.ts`
  - `pi/profiles/default/lib/subagents/{runtime,rpc,visible,child-surface,transport,status,presentation}.ts`
  - `pi/profiles/default/tests/subagent-{messaging,child-outcomes,runtime,control-errors,presentation}.test.ts`
  - `pi/profiles/default/docs/subagents.md`
  - `pi/profiles/default/skills/agent-process/references/failure-log.md`, especially APR-052
- Verified starting behavior, 2026-09-17:
  - `RpcChild.parentMessage(question)` records a request ID, changes the child to `waiting-parent`, and resolves attached waiters.
  - `SubagentRuntime.onUpdate` calls automatic delivery for waiting records only when `waitState !== "attached"`. A question from one foreground child can therefore remain hidden while another parallel foreground tool call keeps the parent tool batch open.
  - Parent transcript delivery already uses `pi.sendMessage(..., { deliverAs: current.isIdle() ? "followUp" : "steer", triggerTurn: true })`, which provides the required non-aborting Pi boundary once the runtime actually queues the delivery.
  - The child tool result currently says only that a question was sent. It does not repeat the complete question.
  - Ordinary visible input while `waiting-parent` currently starts replacement work, clears `requestId`, and can let a non-retained child settle and exit. APR-052 records the observed failure and exact parent/child sessions.
- Work to preserve: the existing modification to `pi/profiles/default/skills/agent-process/references/failure-log.md` records APR-052 and must remain. Recheck all other worktree changes before editing.
- Worktree and integration target: originating checkout is the current `main` checkout. During execution, create a dedicated worktree and branch proposed as `.worktrees/subagent-parent-question-mailbox` and `task/subagent-parent-question-mailbox`, then record the actual values.
- Profiles: planning used the repository-owned default profile. Execution and checks must use `pi/profiles/default`; do not inspect or modify legacy.

## Decisions and implementation contract

- The mailbox is runtime-owned local state, not a server or transport service. It remains process-local and keyed by the originating parent session ID.
- A question has an explicit lifecycle distinguishable from ordinary completion/failure delivery: pending, delivered, and resolved by either parent answer or child cancellation. Preserve enough resolution metadata to reject races accurately while the runtime and child record remain alive.
- Question creation queues mailbox delivery independently of attached/background wait state. Existing foreground wait results may still expose the same question, but delivery acknowledgement and request identity must prevent duplicate model-visible notifications.
- Parent mailbox delivery uses Pi's existing queued `steer` behavior while busy and `followUp` while idle. It must not call `abort`, inject into another origin, or wait for `agent_settled` when a safe steering boundary is already available.
- The visible child tool result shows the complete question and request ID. Ordinary user conversation does not itself clear the pending request.
- After conversation answers the issue, the child model invokes a child-owned cancellation action on `subagent_parent`. Cancellation resolves only that child's current pending question and lets the same conversation continue. It is not a user slash command and does not cancel the assignment.
- The first resolution wins atomically within the process-local runtime. A losing parent answer or child cancellation returns a specific resolution result. If a parent notification was already model-visible, queue one concise resolution update; if not yet delivered, remove it without waking the parent.
- Non-retained children remain alive while a question is pending. They follow existing cleanup behavior only after the request is resolved and the assignment later reaches a terminal outcome.
- Keep result and context text bounded by existing subagent limits. Do not introduce a new arbitrary question-size limit below the existing application-frame and result bounds.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Preserve unrelated work and carry this plan plus APR-052 into the task worktree without deleting their source.

Before delegating plan work, consult `strategist`. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt internal type names and file placement when repository evidence requires it, but do not change the interaction contract, add Onclave dependencies, or introduce user ceremony. Continue independent tasks around blockers and ask only before changing scope, settled behavior, or acceptance.

Keep checkbox state, concise evidence, current blockers, and the next action accurate. Do not stop at an implementation phase boundary. Fix demonstrated task-relevant failures and stop testing when the finite checks pass.

## Tasks

- [ ] **T1: Define a race-safe parent-question lifecycle in the subagent runtime**
  - Depends on: none.
  - Files/inputs: `pi/profiles/default/lib/subagents/{rpc,runtime,transport}.ts` and focused runtime/messaging tests.
  - Change: represent question identity and resolution separately from generic assignment outcomes; add the child-owned cancellation request; make parent answer and child cancellation contend for one first-resolution result; retain clear resolution metadata for late replies; keep non-retained children alive while pending.
  - Complexity / split hints: the difficult seam is preserving current child turn settlement and cleanup while separating question resolution from assignment completion. The runtime must not confuse user-only UI prompts, coordinator outcomes, or generic `cancel` with question cancellation.
  - Verify: focused tests prove parent-answer wins, child-cancel wins, both race orders, accurate late-resolution errors, pending lifetime, and unchanged ordinary completion/cancellation behavior.
  - Done when: one authenticated child can create and resolve exactly one current question without silently clearing it or settling its assignment.
  - If blocked: document the exact lifecycle conflict and continue mailbox or presentation work that consumes the agreed interface.
  - Evidence: Not started.

- [ ] **T2: Deliver questions through an origin-scoped local parent mailbox**
  - Depends on: T1's question identity and resolution interface, not T1's remaining presentation work.
  - Parallel with: T3 after the T1 interface is established.
  - Files/inputs: `pi/profiles/default/lib/subagents/runtime.ts`, `pi/profiles/default/extensions/subagents.ts`, `pi/profiles/default/lib/subagents/{status,presentation}.ts`, and focused delivery/presentation tests.
  - Change: enqueue every new question independently of attached wait state; route it only to its originating parent; deliver through existing Pi `steer`/`followUp` boundaries; acknowledge/deduplicate it against attached wait results; remove undelivered resolved items; and deliver a concise resolution update only when the question was already exposed to the parent model.
  - Complexity / split hints: test parallel foreground tool calls explicitly. The mailbox must distinguish queued, delivered/journaled, and resolved states without becoming a durable registry or replaying ordinary outcomes.
  - Verify: tests cover idle and busy parents, two parallel foreground children where one remains running, attached and detached waits, inactive/wrong origins, delivery acknowledgement, duplicate suppression, and resolution before versus after delivery.
  - Done when: a question becomes parent-model-visible at the first native safe boundary even while unrelated foreground waits remain unresolved, with no duplicate question or unnecessary wake-up.
  - If blocked: preserve origin isolation and report the exact unavailable Pi delivery boundary rather than substituting interruption or polling.
  - Evidence: Not started.

- [ ] **T3: Make the visible child question self-explanatory and conversationally resolvable**
  - Depends on: T1's child cancellation interface.
  - Parallel with: T2.
  - Files/inputs: `pi/profiles/default/extensions/subagent-child.ts`, `pi/profiles/default/lib/subagents/{visible,child-surface,presentation}.ts`, and focused child outcome/messaging tests.
  - Change: render the full question and request ID in the `subagent_parent` result; update child-facing tool guidance so the model keeps the request pending during ordinary discussion and invokes its cancellation action when it determines the question is answered; ensure ordinary visible input starts or steers that conversation without clearing the request; continue the assignment after cancellation.
  - Complexity / split hints: keep model judgment separate from runtime authority. The model decides when it has enough information, but the runtime owns request identity, first-resolution semantics, and cleanup.
  - Verify: tests demonstrate full visible text, multi-turn discussion with the request still pending, model cancellation followed by continued work, parent-answer continuation, and no premature non-retained exit.
  - Done when: the user can read, discuss, and help resolve the question naturally in the child without a special user command.
  - If blocked: do not reinterpret arbitrary user text as a final answer; retain the pending request and report the missing child/runtime signal.
  - Evidence: Not started.

- [ ] **T4: Integrate the behavior contract, regression suite, and operator documentation**
  - Depends on: T1, T2, and T3 complete.
  - Files/inputs: affected default-profile tests, `pi/profiles/default/docs/subagents.md`, `CHANGELOG.md`, and this plan.
  - Change: reconcile the runtime, mailbox, and child surfaces; update documentation with the process-local scope, first-safe-boundary delivery, child-decided cancellation, race behavior, and explicit Onclave non-dependency; record APR-052 remediation status only after checks establish it.
  - Verify from `pi/profiles/default`: run the focused subagent test files changed by T1-T3, `pnpm run typecheck`, and `pnpm run check:runtime`. Run broader default subagent tests only if focused results or shared-runtime edits establish a relevant regression surface.
  - Done when: finite checks pass and docs describe the same behavior implemented by code and tests without claiming live attached-client acceptance.
  - If blocked: identify the failing contract and owner; do not weaken race, routing, or non-interruption requirements to make tests pass.
  - Evidence: Not started.

- [ ] **T5: Archive, commit, merge, and clean up**
  - Depends on: T4 checks passing.
  - Files/inputs: task-owned implementation, test, documentation, feedback-log, changelog, and spec changes.
  - Change: update task evidence, archive the whole spec directory, commit on the task branch, merge into the recorded originating `main` checkout, commit completion metadata on the target, and remove the clean task worktree.
  - Verify: target `main` contains the implementation and `.specs/archive/subagent-parent-question-mailbox/plan.md`; no active spec copy or task-owned worktree remains; unrelated target changes are untouched.
  - Done when: integration and cleanup are complete. Push remains unperformed.
  - If blocked: retain the worktree and report the exact merge or cleanup blocker and next agent-owned action.
  - Evidence: Not started.

## Agreed validation and current handoff

- Focused tests must exercise the real runtime and visible-child boundaries rather than only isolated formatting helpers.
- Required final checks from `pi/profiles/default`: affected Vitest files, `pnpm run typecheck`, and `pnpm run check:runtime`.
- A live attached-client run is not required for completion and is a non-blocking verification limit. Do not claim it occurred unless separately recorded with date and result.
- Status: ready.
- Completed work and evidence: planning investigation confirmed the failure path from exact parent/child session records and current source; no implementation has been authorized or performed.
- Next: on a later execution request, create the task worktree, record it here, and implement T1.
- Blockers/open decisions: none.
- Verification limits: no implementation or live behavior has been tested from this plan.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/subagent-parent-question-mailbox/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together on the task branch. Do not archive unfinished implementation.

Merge the task branch into the recorded originating `main` checkout without stashing, discarding, or committing unrelated target changes. Resolve routine merge conflicts within settled intent. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery.

After a successful merge, verify the target contains the changes and archive and no active plan copy remains. Then set the archived plan's `status: completed` and `completed: YYYY-MM-DD`, record integration evidence, and commit that metadata update on the target. Rerun affected checks only if conflict resolution changed checked content. Remove the task worktree only when integration succeeded and it has no uncommitted or unmerged work. Push requires separate authorization. Operator manual testing does not block closeout.

### Final response

Start with one overall outcome:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: only when explicitly requested.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on the target but worktree cleanup remains.

For blocked or cleanup-pending outcomes, immediately state **Reason** and **Action needed**. Then report checks, spec location, branch/commits, merge result, and any retained worktree. Never imply completion from passing tests or archival alone.
