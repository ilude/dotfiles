---
created: 2026-09-09
status: in-progress
completed: null
---

# Deliver subagent messages during work and report outcomes accurately

## Goal and scope

Refactor default-profile subagent messaging so parents and children receive useful information during ongoing work, questions yield cleanly instead of leaving a polling tool running, and deliberate interruption redirects rather than destroys a conversation. Preserve the original plan's real failure reporting, accurate control errors, workspace guidance, and nonduplicated tool presentation.

**User-approved direction, 2026-09-09:** KISS and low ceremony. Provide one straightforward message/reply interface, runtime-managed correlation where possible, `delivery: queued | immediate`, and `interaction: notify | request`. Implement question-answer as the first request protocol. `notify` and `request` are accepted working names, not a reason to defer implementation or build an abstraction framework.

**Exclude** SQLite, new logging stores, durable mailboxes, brokers, actor libraries, restart recovery, reminder loops, automatic retries, automatic urgency classification, parent-completion gates, mandatory acknowledgement chatter, new approval layers, and operator-managed protocol bookkeeping. Exclude new documentation grants, general failure recovery, layout/title changes, legacy/Onclave changes, and unrelated review backlog. The operator will not reload with active subagents; active-child reload teardown/migration/recovery remains excluded under AIF-022.

Authorization: this request authorizes updating the plan only. It does not authorize implementation, commits, merging, pushing, or deployment. Subsequent execution authorization includes the local worktree/commit/integration closeout below unless explicitly restricted. Push and deployment require separate authorization.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles` unless stated otherwise. In implementation sections, `extensions/`, `lib/`, `tests/`, and `docs/` mean paths under `pi/profiles/default/`. Read current root and default-profile instructions before execution. This is dotfiles-owned default Pi work; no module changes.

- Originating checkout/merge target: this repository's `main`.
- Proposed task branch: `fix/subagent-failure-reporting`.
- Proposed task worktree: sibling `../dotfiles-subagent-failure-reporting`; not created by this planning task. Check for an existing task checkout before creating one and record actual values.
- **Cleanup predecessor is complete:** `.specs/archive/default-subagent-cleanup-failures/plan.md`, task commit `c25864f1`, merge `1dff1628`. Planning verified that merge is an ancestor of `main`. Start from updated `main` and preserve its resource-state, retryable explicit cleanup, and outcome/cleanup separation. Do not wait for or reimplement that plan.
- Preserve concurrent work. At revision time, scheduler source/tests and both agent-process reference logs had changes. Recheck before implementation and integration; do not include unrelated changes in task commits.
- This tracked plan is being revised in the originating checkout. Carry its complete revised contents into the task worktree without losing its source or concurrent edits.

Required reading:
- Root `AGENTS.md`, `pi/README.md`, `pi/profiles/default/AGENTS.md`, and default `docs/subagents.md`.
- Default `extensions/{subagents,subagent-child}.ts` and `lib/subagents/{runtime,rpc,visible,child-surface,transport,status,presentation,workspace,launch}.ts`.
- Archived cleanup plan; AIF-020/022/024 and APR-016/017 in the existing agent-process logs. Historical proposals in those logs do not override this plan's settled scope.
- Installed Pi extension documentation, relevant native event/queue implementation, and `examples/extensions/structured-output.ts`. Read installed TUI documentation when changing UI APIs. Resolve the installed package normally, not through a hardcoded pnpm-store hash.
- Existing tests named below and the default `testing` skill before changing tests.

### Verified starting behavior

Bounded source/log investigation on 2026-09-09 established:

1. The original failure-reporting incident ended with a terminating `read` denial, `Native path is outside the assigned workspace`, and no final assistant reply. Child settlement lost the reason and reported blank output instead. Source has the same missing terminal-tool category on visible and headless surfaces. A second helper's underlying failure was not established; do not expand into a historical failure survey.
2. `RpcChild.message()` checks retention/liveness before active/waiting state. The current contract only continues settled retained conversations; it does not steer active work. The new contract below intentionally replaces that restriction for ongoing assignments.
3. APR-016 records delivered questions left unresolved: a parent used `message` instead of `answer`, received a misleading retention error, and moved on. Another child's permission-dialog interaction set `userOwned`, preventing the parent's answer. No lost delivery or process crash was established in that incident.
4. `subagent_parent` polls `poll-answer` until answered or aborted. The tool and Working spinner therefore remain active while waiting. Delayed activity can overwrite `waiting-parent` phase.
5. Root outcome delivery rejects a busy parent, flushes on `agent_settled`, and uses turn-triggering `followUp` messages. Coordinator reception also requires idle and uses `followUp`. APR-017 screenshots show final summaries followed by stale results and repetitive acknowledgements. Inspection does not consume pending automatic outcomes; the screenshots' exact prior read paths were not reconstructed.
6. `presentation.ts` renders state/error/timing in both the combined call header and result. This duplicated-field defect is separate from repeated delivery of an already-read outcome.
7. Rejected controls currently return an extra `isError` property, which does not itself mark native tool execution failed. Pi supports throwing from `execute()` and result changes through `tool_result`.
8. Installed Pi 0.85.0 supports successful `terminate: true` tool returns, demonstrated by its structured-output example. Automatic post-tool continuation stops when every finalized tool result in the batch terminates; mixed batches and queued messages may continue. Earlier discussion that no native successful yield mechanism existed was incomplete.

These are source, documentation, screenshot, and bounded historical-log findings, not executed proof of the new behavior. Do not copy private transcripts or reasoning into fixtures.

### Profiles and evidence

- Planning profile: default, verified from `PI_CODING_AGENT_DIR` pointing to this checkout's `pi/profiles/default`.
- Execution/validation profile: task-worktree default source and dependencies. Fixtures must load that source rather than accidentally loading production code.
- Legacy and other named profiles remain unchanged.

| Date | Actual profile/path | Work | Result |
| --- | --- | --- | --- |
| 2026-09-09 | default in originating checkout | Original failure investigation; subsequent question/delivery investigation; authorized plan revision | Design and source evidence only; no implementation or new runtime acceptance |

## Decisions and implementation contract

### Message interface

Use one message/reply path rather than requiring the model to choose between incompatible `message` and `answer` controls. Prefer extending the existing root/coordinator `subagent_control` message action and child `subagent_parent` surface, backed by the same small runtime handling. Exact internal helper/type names remain implementation choices; do not add a second competing messaging system.

| Field | Contract |
| --- | --- |
| Recipient and text | Preserve existing owned-child addressing and the child's implicit parent route. UUIDs remain canonical; human names remain usable. |
| `delivery` | `queued` by default; `immediate` only when explicitly requested by the sender. |
| `interaction` | `notify` by default, meaning no application reply expected; `request` means a protocol-defined response is expected. |
| `protocol` | Start with `question-answer` for requests. It can be the request default so routine questions do not require ceremony. Add other protocols only for a future agreed use case. |
| Reply correlation | Runtime creates request IDs and carries them through incoming messages. Associate a reply with the addressed peer's pending question where unambiguous; allow a minimal explicit reply reference such as `replyTo` when needed. Do not require users to copy IDs or manually acknowledge receipt. |

Illustrative parent call, adapted to the existing tool's field names:

```ts
subagent_control({
  action: "message",
  id: "Clara",
  message: "Also check Windows compatibility.",
  delivery: "queued",
  interaction: "notify"
});
```

All delivery/interaction combinations are supported: an urgent notification need not demand a response, and a routine request need not interrupt. A protocol reply uses the same message path and resolves its request rather than creating another request or requiring an acknowledgement of the reply. Preserve old question/answer invocation shapes through a small adapter where necessary for saved sessions, without keeping them as competing recommended interfaces.

`notify` is fire-and-forget at the application level, not permission to silently drop results. Keep existing internal delivery acknowledgement/bookkeeping where useful. Acceptance into Pi's conversation is distinct from the model acting on the content. Neither interaction type implies a response timeout, retry, reminder, or new safety approval.

### Delivery and Pi lifecycle

A native Pi turn is one model response plus its tool batch; one assignment can span many turns.

| Recipient state / delivery | Required behavior |
| --- | --- |
| Busy / `queued` | Submit immediately to native `steer`; Pi incorporates it after current tool execution and before the next model response. Do not wait for assignment completion, `agent_end`, or `agent_settled`. |
| Idle / either delivery | Start processing the message without a needless abort. A genuinely new result can wake an idle parent. |
| Busy / `immediate` | Record intentional redirection, request cancellation of the active turn, then resume the same conversation with the urgent message once execution settles. Preserve other pending messages. |
| Waiting for protocol response | A matching reply resumes the ongoing assignment. Waiting is not successful completion and does not require `retain: true`. |
| Completed retained conversation | Ordinary messaging starts another assignment as before. Finished nonretained/dead conversations remain closed; do not implicitly relaunch them. |

Apply these mechanics in both directions along the existing parent/child tree, including coordinators and their leaves, and on both visible and headless child surfaces. Preserve origin scoping when the user switches chats; never deliver an old origin's messages into another active conversation.

Use native queues rather than implementing a second between-turn pump. `message_end` can establish that a delivery entered conversation history, not that it was answered. Use `agent_settled` for actual idle/settlement observation and intentional interrupt handoff, **not as the normal outcome-delivery trigger**. Do not await the current run's own idle transition inside an event/tool handler in a way that deadlocks that run.

`immediate` interrupts current activity, not the assignment, process, pane, or conversation. Mark the intentional interruption before abort so model-aborted events cannot trigger ordinary failure cleanup. Cancellation cannot undo completed effects, and tools that ignore cancellation may not stop instantly; report actual state rather than pretending otherwise. Preserve existing explicit cancel/finish semantics. Do not automatically cancel children when the parent finishes a response.

### Question-answer and clean waiting

A child asking its parent a blocking question records and sends the request, returns from the tool, and yields active execution. Prefer Pi's successful `terminate: true` tool return; verify the complete batch/queue behavior in T1. Remove the long-running `poll-answer` tool loop. The pane/process can remain available and idle in the same conversation with a clear Waiting for parent reply state.

A matching response continues that assignment and clears its pending question. Handle a fast reply arriving while the asking turn is still settling without dropping it or starting overlapping runs. Ordinary stale/unknown replies get a precise control error, not an approval prompt. The parent request tool must not become a long-running response wait: it records the exchange and permits independent parent work.

Do not declare completion from an empty assistant message after an intentional question yield. Preserve tool/model progress separately from pending request state so delayed progress cannot turn a wait back into apparent work. A yielded coordinator can retain its children and receive their outcomes without losing the pending question or incorrectly completing its own assignment.

### Timely outcomes without repeated delivery

Completion/failure outcomes normally use `queued` / `notify`. They are evidence to incorporate, not questions requiring acknowledgement chatter. Deliver through an attached tool result or automatic message without later automatically replaying the same outcome.

- Track delivery identity per outcome, not only per child. A retained follow-up, corrected review, or later failure is a new outcome and must still arrive.
- When a model-facing wait/inspection actually returns that outcome, reconcile its pending automatic delivery. A UI-only inspection or internal coordinator polling must not silently consume a model notification.
- Handle overlap between queued automatic delivery and explicit retrieval without duplicate wakeups. Repeated explicit inspection may still show current state; the requirement is to prevent stale automatic replay.
- Preserve origin-scoped queued work and current internal acknowledgements. Add only the identity/consumption state needed by existing runtime records, not durable receipts or a new event store.

Tool-owned guidance should tell models to incorporate results, answer requests, and report material changes, not narrate receipt of every notification. No global AGENTS.md rule or parent-completion gate. Timely delivery cannot guarantee a model acts on every message; a result arriving after final response streaming starts cannot retroactively change that response.

### Approval ownership, errors, and presentation

- Permission-dialog Allow/Deny input resolves the prompt only. Remove the blanket mapping from terminal keystrokes during a UI prompt to user takeover. Direct user conversation input and explicit escalation still enter intervention; explicit handback remains for genuine takeover. Preserve existing permission decisions and tool authority without adding gates or bypasses.
- Preserve the workspace and selected-skill read boundary. Explain it in owning delegation/child guidance so parents supply required external excerpts in the assignment or answer instead of commissioning inaccessible reads. No documentation-grant system.
- Invalid control operations must be native tool errors with an actionable cause. Inspecting/waiting successfully on a failed assignment still returns that failed outcome as data, not a failure of the inspection itself. Do not label an active nonretained child as dead.
- Combined tool call owns identity/assignment/configuration; result owns state/activity/outcome/error/timing. Keep standalone outcome messages self-contained and useful metadata available in expanded detail. Before a result exists, the call can show requested delivery/wait mode and start timing.
- Show Waiting for parent reply, Waiting for user, or intentional redirection accurately rather than a generic productive Working spinner. Do not add a persistent fleet widget or redesign layout.

Preserve real failure provenance on both transports:

| Evidence | Outcome |
| --- | --- |
| Valid nonblank final reply | Completion, subject to existing partial/blocked contracts and outstanding child work. |
| Successful question yield | Waiting, not blank-output failure or completion. |
| Intentional immediate-delivery abort | Redirection, not assignment failure or resource cleanup. |
| Other model error/abort | Preserve the actual error under existing failure behavior. |
| Terminating tool error that ends execution | Failed, with tool name and bounded actual reason, even if incidental commentary exists. |
| Recoverable tool error followed by valid final reply | Completion, not a sticky failure. |
| Actually blank settlement without a specific cause | Keep blank-output failure. |

Do not equate `terminate: true` with error: successful question yield uses it too. Mixed tool batches can continue; use actual subsequent-turn evidence to clear/supersede terminal-error candidates. Reset assignment-scoped evidence on retained continuation. A small shared reducer is acceptable if it simplifies both transports; a general event framework is not required.

Keep assignment outcomes separate from the integrated cleanup results. Preserve failed cleanup ownership, explicit later cleanup attempts, normal completion cleanup, retention after completion, and genuine user-owned quit behavior. Do not rewrite resource termination.

## Execution guidance

After execution authorization, create/resume the recorded dedicated task worktree from updated `main`, verify it contains `1dff1628`, and record its actual path/branch/target. Preserve unrelated changes and the revised plan. Do not relink production Herdr plugins or launchers to a disposable worktree.

Implement this contract with the smallest useful changes to existing runtime state, native queues, and tool surfaces. Adapt routine mechanisms when tests expose an issue; do not reopen settled names/intent or turn alternatives into new requirements. If the installed SDK cannot support a required outcome, state the exact missing seam before proposing SDK changes. Continue independent work around real blockers.

Keep task checkboxes and concise evidence current. At phase boundaries remove task-created drift, not unrelated work. Do not add repeated full-suite runs, mandatory reviewer sequences, live-provider experiments, or a historical-log census. Operator testing after implementation is not an execution or closeout gate.

## Tasks

- [x] **T1: Establish the native yield, delivery, interruption, and failure boundaries**
  - Depends on: execution authorization and task worktree containing the completed cleanup predecessor.
  - Inputs: installed Pi event/queue implementation and structured-output example; current runtime/child handlers; existing loader/RPC fixtures.
  - Change: add small deterministic fixtures using the installed Pi loop and scripted model/tool boundaries. Establish successful question-tool termination, a mixed tool batch, fast queued response, steering before run settlement, deliberate abort/redirection, and actual terminating workspace denial/native tool-error classification. Proposed files: `tests/subagent-messaging.test.ts` and `tests/subagent-terminal-outcomes.test.ts`; reuse existing fixtures instead when clearer.
  - Verify: observable model inputs and lifecycle outcomes, not just mocked `sendMessage` calls. Show that a valid yield needs no polling tool or provider call after the question. Record the minimal adapter behavior needed for mixed batches without adding a new loop controller.
  - Done when: executable evidence supports the native mechanisms used by T2-T4 and exposes the original lost failure reason. No live provider or production pane required.
  - Evidence: Added `tests/subagent-messaging.test.ts` and `tests/subagent-terminal-outcomes.test.ts`, extended the scripted RPC fixture, and exercised question termination, mixed-batch continuation, queued steering, intentional interruption, and terminating/recoverable tool failures. The installed Pi loader/RPC boundary tests also passed. No provider or production pane was used.

- [x] **T2: Implement the unified message exchanges and recipient lifecycle**
  - Depends on: T1.
  - Files: default `extensions/{subagents,subagent-child}.ts`, `lib/subagents/{runtime,rpc,visible,child-surface,transport}.ts` as needed; T1 fixtures and existing RPC/child-outcome tests.
  - Change: support the agreed delivery/interaction fields, question-answer response correlation, asynchronous sends, and minimal old-call adaptation through existing transport. Replace polling questions with clean waiting/resume; implement queued steering and intentional immediate redirection in both directions, including coordinators. Preserve closed-conversation and explicit cancel/finish behavior.
  - Verify: queued messages reach a busy recipient's next model input; immediate messages cancel current activity without cancelling the assignment; other pending messages survive; a child waiting with `retained: false` resumes in its existing conversation; a fast reply is not lost; stale reply errors do not mutate another request. Exercise the same contract for visible and headless adapters.
  - Done when: the original wrong-action question trap is removed, requests do not leave a running polling tool, and both delivery choices behave as documented.
  - Evidence: `rpc.ts`, `visible.ts`, `child-surface.ts`, `runtime.ts`, `transport.ts`, and both extension handlers now carry `delivery`, `interaction`, `protocol`, and `replyTo`; active children accept native queued steering, immediate redirection, and question answers without requiring retention. Headless and visible adapter boundary tests passed, including retained-false question resume and stale reply rejection.

- [x] **T3: Deliver each outcome during work without stale automatic replay**
  - Depends on: T2.
  - Files: `extensions/{subagents,subagent-child}.ts`, `lib/subagents/{runtime,child-surface,rpc,status}.ts`; existing runtime/child-outcome tests and T1 messaging fixture.
  - Change: remove idle-only normal delivery and use native steering for automatic outcomes. Unify per-outcome consumption across model-facing tool results and automatic delivery while preserving UI-only inspection, internal polling, and origin scoping. Keep progress UI-only.
  - Verify: busy parent and busy coordinator receive a child outcome before their original run settles; tool-result retrieval does not cause a later automatic replay; UI/internal inspection does not lose notification; a later corrected/retained outcome still arrives; a genuinely new idle result starts processing; switching chats does not misroute it.
  - Done when: the APR-017 sequence no longer waits for final closeout and then repeatedly wakes the parent with already-supplied results. No timers for reminders or completion gates added.
  - Evidence: Automatic terminal outcomes are delivered with `steer` while the origin is busy and `followUp` while idle. Progress remains UI-only. Runtime acknowledgement is keyed by delivery identity; model-facing waits/inspect-with-consume reconcile pending deliveries while ordinary inspection and origin changes do not. The child-outcome and status tests cover busy delivery and no replay.

- [x] **T4: Separate approval ownership and preserve real failures/control errors**
  - Depends on: T1/T2; combine overlapping handler edits rather than introducing parallel classifiers.
  - Files: `lib/subagents/{child-surface,rpc,visible,workspace}.ts`, `extensions/{subagents,subagent-child}.ts`, relevant agent guidance if needed; existing loader/workspace tests and proposed `tests/subagent-control-errors.test.ts` where useful.
  - Change: decouple permission prompt input from takeover. Preserve deliberate intervention/handback. Carry terminating tool-error provenance on both surfaces, distinguish successful yield/redirection, fix native error flags, and align access/control descriptions with the new contract.
  - Verify: denied permission does not prevent a subsequent parent reply; genuine takeover remains under user control; denied external read reports `read` plus actual reason on both transports; blank/model errors remain specific; recoverable and mixed-batch errors can recover; a fresh retained assignment has no stale error; native rejected-operation flags are errors while successful inspect/wait calls return failed assignments as data.
  - Done when: the original failure and Maya intervention sequences have accurate outcomes and usable controls without changed workspace permissions or new approval steps.
  - Evidence: Permission prompt input no longer invokes intervention, while direct interactive input and explicit escalation remain intact. Terminating RPC tool errors retain the tool name and actual bounded reason; recoverable errors clear after a valid reply. Control rejection now throws a native tool error, while inspection remains data. Workspace tests and `subagent-control-errors.test.ts` passed.

- [x] **T5: Present clear waits and nonduplicated outcome rows**
  - Depends on: T2-T4.
  - Files: `lib/subagents/{status,presentation,child-surface}.ts`, existing `tests/subagent-{status,presentation}.test.ts`, messaging fixtures.
  - Change: render actual waiting/redirection state; prevent delayed activity from erasing it; separate combined call/result field ownership. Add concise tool-owned message-handling guidance without automatic acknowledgement responses.
  - Verify: combined call plus result renders each status/error/timing field once for progress, success, failure and control rejection; standalone outcomes/expanded details retain useful metadata; waiting question has no active polling spinner; a real takeover prompt is distinct from parent waiting.
  - Done when: original and subsequent screenshot defects are covered by bounded whole-row and lifecycle fixtures, not only isolated renderer tests.
  - Evidence: Waiting and redirecting states are rendered explicitly, activity cannot overwrite a parent wait, and call rows now own identity/assignment/configuration while result rows own state, activity, outcome, error, and timing. Presentation coverage includes whole-row waiting, redirecting, success, failure, cancellation, cleanup, and automatic outcome rendering.

- [x] **T6: Run finite acceptance and document the delivered contract**
  - Depends on: T2-T5.
  - Files: default `docs/subagents.md`, `pi/README.md` if its summary needs updating, root `CHANGELOG.md`, tests and this plan's evidence.
  - Change: document fields/defaults, lifecycle mapping, question/reply use, permissions versus takeover, real failure provenance, and excluded durability/enforcement. Update stale statements about idle-only outcomes and settled-only messages. Run the finite checks below and fix only demonstrated task-relevant failures.
  - Done when: named agent-owned checks pass with actual profile/source evidence and truthful limitations. Attached-client/manual testing remains non-blocking and no live model call is required.
  - Evidence: Updated default subagent documentation, `pi/README.md`, and the root changelog with message defaults, lifecycle behavior, question/reply handling, approval ownership, failure provenance, and explicit exclusions. From the default profile with the repository dependency links active and `PI_SUBAGENT_AUTHORITY`/`PI_SUBAGENT_ENDPOINT` cleared: the named focused suite passed 69 tests across 11 files on 2026-09-09; `pnpm run typecheck` passed; `pnpm run check:runtime` passed; and root `git diff --check` passed. No live model, attached-client, archive, commit, merge, or push was performed. Remaining limit: physical visible-client UX is not claimed from offline tests.

- [ ] **T7: Archive, commit, integrate, and clean the task worktree**
  - Depends on: T6 and execution authorization covering local integration.
  - Change: follow the closeout contract below, preserving unrelated checkout work. Archive and commit implementation on the task branch before merging; record completed metadata only after integration. Keep this task unchecked while required integration or cleanup remains unfinished.
  - Done when: target contains implementation and dated archive, metadata is committed, and integrated task worktree cleanup is verified; otherwise record the exact blocker, next action, action owner, and retained worktree.
  - Evidence: Implementation and agreed checks passed; spec archived on the task branch. Integration, completion metadata, and worktree cleanup remain pending.

## Agreed validation and current handoff

From the task worktree's `pi/profiles/default`:

```sh
pnpm test subagent-messaging.test.ts subagent-terminal-outcomes.test.ts subagent-control-errors.test.ts subagent-runtime.test.ts subagent-rpc.test.ts subagent-child-outcomes.test.ts subagent-loader.test.ts subagent-workspace.test.ts subagent-presentation.test.ts subagent-status.test.ts subagent-cleanup.test.ts
pnpm run typecheck
```

The first three filters are now implemented files. Reuse existing dependencies; the repository Pi dependency-link setup was run once before validation. From the worktree root run `git diff --check`.

The T1/T2 installed-runtime fixture must exercise real message ingestion, tool finalization and settlement with scripted external boundaries. The focused surface tests must cover both child adapters. No new exhaustive fake runtime, production Herdr changes, or layout test campaign. Passing offline tests establishes those paths, not universal model compliance or physical attached-client UX. Operator testing happens after completion and does not block archive/commit/merge.

- Status: T1-T6 implemented and validated; archived and ready for authorized integration. T7 remains pending until merge, completion metadata, and cleanup finish.
- Completed planning: reconciled original failure scope with the agreed messaging design, verified native lifecycle mechanisms in installed source/docs, and verified cleanup integration in `main`.
- Execution profile: default profile in the dedicated `fix/subagent-failure-reporting` checkout. The checkout was clean before implementation; unrelated changes were preserved.
- Open user decisions: none. Working interaction names remain implementation details under the settled contract.
- Validation evidence: 69 focused tests across 11 files, typecheck, runtime smoke, and `git diff --check` passed with the authority/endpoint environment cleared. No live model, production Herdr pane, archive, commit, merge, or push was performed.
- Limits: offline evidence does not claim physical attached-client UX or universal model compliance. T7 remains the explicit archive/integration boundary.

## Closeout

After implementation and agreed checks pass, update task evidence and record integration pending. Check that `.specs/archive/subagent-failure-reporting-and-control-ux/` is unoccupied, move this whole spec directory there in the task worktree, and repair affected links. Commit implementation, documentation and archived spec on the task branch. Do not mark the plan completed before merging.

Unless `--no-merge` was explicitly requested, merge into the recorded originating checkout/`main` without stashing, discarding, or committing unrelated changes. Resolve routine conflicts within scope; ask only for consequential decisions or unavailable prerequisites. If blocked, retain the worktree and report implementation/checks separately from integration, with reason, next action and owner. Under `--no-merge`, keep the committed task worktree and report integration intentionally pending.

After successful merge, verify target implementation/archive and absence of the active plan copy. Set archived `status: completed` and the actual completion date, record integration evidence, and commit that metadata on the target. Remove the task worktree only after integration and absence of uncommitted/unmerged task work. If cleanup is not finished, leave its checkbox accurate and report CLEANUP PENDING rather than COMPLETED. Rerun affected checks only if conflict resolution changed checked content. Do not push or deploy without separate authorization.

Final response must start with explicit overall outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. For blocked/cleanup-pending work lead with **Reason** and **Action needed**, including who acts, before listing successes. Then give concise checks, archive path, commits/integration, and retained worktree or cleanup remnants. Operator manual acceptance is a non-blocking verification limit, never a reason to keep implementation active.
