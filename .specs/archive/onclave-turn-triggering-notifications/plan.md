---
created: 2026-09-17
status: ready
completed: null
---

# Add turn-triggering Onclave notifications for asynchronous vault completion

## Goal and scope

- Add a channel message kind named `notification` for one-way, turn-triggering delivery with no response expectation.
- Initially reserve notification publication for trusted Onclave application services. Do not expose `notification` as an orchestrator-originated `onclave_message` kind.
- Use notifications for completed and failed asynchronous vault jobs so `/yt` can resume and report directly to the operator without replying to Onclave Core.
- Preserve current semantics: `request` triggers a turn and expects a response, `response` answers a request, and `note` is display-only.
- Preserve channel history, at-least-once delivery, message-ID deduplication, and idempotent publication. Notifications create no request-satisfaction state.
- Improve adapter HTTP errors so structured server validation details are visible instead of collapsing to a bare status such as HTTP 422.
- Non-goals: model-originated notifications, a second communication adapter, changes to local-only `/yt-local`, repository modification based on video content, infrastructure inventory changes, deployment, or changes to ordinary task-status delivery.
- Authorization: planning only. A later execution request authorizes local implementation, tests, task commits, and merge under the closeout contract. Push and deployment are not authorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles` unless prefixed with `modules/onclave/`. Read the root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, and `modules/onclave/AGENTS.md` before acting.

- Owning repositories and boundaries:
  - `modules/onclave/` owns the envelope protocol, Core channel and vault services, Pi adapter behavior, Onclave tests, and Onclave protocol documentation. Keep this checkout on `feature/v2-broker-core` and never force-push it.
  - The dotfiles parent owns `pi/profiles/default/prompts/yt.md`, `pi/profiles/default/skills/youtube/SKILL.md`, the root `CHANGELOG.md`, the coordinating spec, and the Onclave gitlink.
  - `modules/homelab-infra/` owns deployment but is outside implementation scope because deployment is not authorized.
- Required reading:
  - `modules/onclave/packages/envelope/src/a2a.ts`
  - `modules/onclave/packages/envelope/src/protocol.ts`
  - `modules/onclave/services/core/src/channel-store.ts`
  - `modules/onclave/services/core/src/service.ts`
  - `modules/onclave/services/core/src/vault/jobs.ts`
  - `modules/onclave/services/core/src/vault/recommendation-contract.ts`
  - `modules/onclave/extensions/onclave-pi/src/lib/delivery.ts`
  - `modules/onclave/extensions/onclave-pi/src/lib/framing.ts`
  - `modules/onclave/extensions/onclave-pi/src/lib/http-client.ts`
  - `modules/onclave/docs/extensions/onclave-pi/PRD.md` and linked status documentation
  - `pi/profiles/default/prompts/yt.md`
  - `pi/profiles/default/skills/youtube/SKILL.md`
- Verified starting behavior at Onclave commit `3fecffd` on 2026-09-17:
  - Channel protocol version 2 recognizes only `request`, `response`, and `note`.
  - Only a request naming the current instance starts a Pi turn; it also registers active response correlation.
  - Notes and task-status events are inert/display-only.
  - Successful vault jobs are converted to `onclave.recommendation.request.v1` requests; failed jobs use terminal notes. This forces successful `/yt` callbacks into request/response semantics.
  - `/yt` prohibits sending recommendations through Onclave messaging.
  - The HTTP client includes response detail only when `detail` is a string, while Core validation commonly returns structured detail arrays, obscuring the reason for HTTP 422.
- Work to preserve: the Onclave module was clean when planned. The parent checkout contained unrelated active changes in subagent runtime, tests, logs, and `CHANGELOG.md`; recheck and do not overwrite, stash, discard, or commit them. The new spec itself is task-owned work.
- Worktree and integration target: create dedicated task worktrees. Integrate the Onclave task branch into `modules/onclave` branch `feature/v2-broker-core` first, then integrate the parent task branch into dotfiles `main` with the updated gitlink. Record actual worktree paths and branch names before editing.
- Profiles: planning used the repository-owned default Pi profile on 2026-09-17. Execution should use the default profile for dotfiles checks. No live adapter, deployed Core, or mixed-version rollout was tested during planning.

## Decisions and implementation contract

1. `notification` is a fourth channel message kind. It has explicit recipients and may carry `channel_id` and `schema`, but it cannot carry `in_reply_to`, `response_policy`, or response expectations.
2. A recipient adapter delivers each accepted notification as a turn-triggering follow-up framed as untrusted input. The framing explicitly says no response is expected and not to call `onclave_message` for that delivery.
3. Notification delivery never registers inbound correlation and never creates or advances `ChannelRequestState` or `ChannelSatisfaction`.
4. `note` remains display-only. Do not broaden its behavior.
5. Orchestrators cannot publish notifications in this iteration. Keep the model-facing `onclave_message` enum and validation limited to `request`, `response`, and `note`; Core service code may publish `notification` through its internal channel API.
6. Increment the channel/agent protocol from version 2 to version 3 because older adapters reject the new kind. Preserve existing version-2 channel history through an explicit validated migration to version 3 rather than discarding stored channels. New wire traffic and newly persisted state use version 3 only.
7. Replace both successful and failed vault terminal delivery branches with notifications. Preserve the terminal payload fields and trust marker needed by `/yt`. Replace the recommendation-request schema with a terminal notification schema that does not instruct the recipient to respond through Onclave.
8. Keep delivery at-least-once. Existing message-ID deduplication must prevent duplicate Pi turns after a notification has been completed; publication idempotency must retain existing behavior.
9. Render structured HTTP error details deterministically and concisely, including Core validation arrays, without exposing response headers, credentials, or unrelated response data.
10. Protocol and adapter source changes must be deployed together later. Local completion must report deployment as not performed, not silently activate or claim the deployed system is compatible.

## Execution guidance

Create or resume the recorded dedicated task worktrees and branches. Record the actual paths, branches, and originating integration targets before editing. Preserve unrelated work and carry task-owned uncommitted plan content without deleting its source.

Before delegating plan work, consult `strategist`. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog. T2 and T3 may proceed concurrently after T1 establishes the shared contract, with disjoint Core and adapter ownership. T4 may proceed once T1 fixes schema and framing language.

Implement the settled intent through the agreed checks. Adapt routine mechanisms to repository evidence, but do not change message semantics, exposure policy, migration behavior, scope, or acceptance without approval. Continue independent tasks around blockers. Keep checkbox evidence and the current next action accurate.

## Tasks

- [x] **T1: Define notification protocol v3 and preserve protocol-v2 channel state**
  - Depends on: none.
  - Files/inputs: `modules/onclave/packages/envelope/src/a2a.ts`, `modules/onclave/packages/envelope/src/protocol.ts`, envelope tests, `modules/onclave/services/core/src/channel-store.ts`, focused channel-store migration tests.
  - Change: add `notification` to the shared channel contract; enforce its forbidden response fields and required recipient semantics; increment the channel/agent protocol to 3; add a bounded, validated load migration for existing version-2 persisted channels and messages, then persist version 3. Do not accept version-2 live wire registrations or new messages.
  - Complexity / split hints: wire validation and persisted-state migration interact but can be split if one subtask first publishes the exact v3 contract consumed by the migration work.
  - Verify: from `modules/onclave/`, run focused envelope protocol/A2A/AMQP tests and channel-store tests through existing pnpm scripts.
  - Done when: v3 accepts valid notifications, rejects response-only fields, old live protocol registration is rejected, existing valid v2 channel state loads without history loss, and subsequent persistence is v3.
  - If blocked: report the exact stored-state shape that cannot be migrated; do not delete or ignore state.
  - Evidence: Implemented and verified by focused tests.

- [x] **T2: Publish vault terminal notifications without request state**
  - Depends on: T1’s exported v3 notification contract.
  - Parallel with: T3.
  - Files/inputs: `modules/onclave/services/core/src/service.ts`, `modules/onclave/services/core/src/vault/jobs.ts`, `modules/onclave/services/core/src/vault/recommendation-contract.ts` or its replacement, `modules/onclave/services/core/tests/vault-pipeline.test.ts`, Core channel/RPC tests.
  - Change: replace the `requestTurn` boolean notification boundary with an explicit internal delivery kind or equivalent typed contract; publish completed and failed terminal jobs as service-originated notifications; define the terminal notification schema and payload with job/content IDs, status, timing, summary when available, and `trust: "untrusted_data"`; remove recommendation request and response-expectation construction. Ensure Core creates no channel request/satisfaction record for notifications.
  - Complexity / split hints: avoid another ambiguous boolean where delivery kind carries the semantics. Preserve subscriber routing and terminal-job authority when publication fails.
  - Verify: focused vault-pipeline, channel-store, RPC, and agent-route tests from `modules/onclave/`.
  - Done when: every subscribed terminal job publishes one idempotent notification, no request state is created, and failed notification delivery still does not change authoritative job terminal state.
  - Evidence: Core tests passed: 165 passed, 1 skipped; notification state assertions passed.

- [x] **T3: Deliver and frame notifications as one-way Pi turns and expose useful HTTP errors**
  - Depends on: T1’s exported v3 notification contract.
  - Parallel with: T2.
  - Files/inputs: `modules/onclave/extensions/onclave-pi/src/lib/delivery.ts`, `modules/onclave/extensions/onclave-pi/src/lib/framing.ts`, `modules/onclave/extensions/onclave-pi/src/lib/http-client.ts`, `modules/onclave/extensions/onclave-pi/src/onclave-pi.ts`, adapter communication, delivery, extension, and HTTP-client tests.
  - Change: route recipient notifications to `deliverTurn` without `registerInbound`; frame them as untrusted, one-way deliveries with an explicit no-response instruction; keep notes inert and requests correlated; keep `notification` unavailable in the model-facing tool schema and outbound validator; format structured Core error detail in adapter errors so validation failures identify the rejected field or rule.
  - Verify: focused adapter communication/delivery/framing/extension/HTTP-client tests from `modules/onclave/`.
  - Done when: a notification triggers one follow-up turn, duplicate completed delivery triggers no second turn, no active inbound request exists, `onclave_message` cannot originate it, and structured 422 fixtures produce actionable errors.
  - Evidence: Adapter tests passed: 76 tests across 9 files; structured 422 fixtures passed.

- [x] **T4: Align `/yt` completion behavior and operator-facing documentation**
  - Depends on: T1’s settled notification name and T2’s terminal schema.
  - Parallel with: remaining implementation in T3 after its framing contract is known.
  - Files/inputs: `pi/profiles/default/prompts/yt.md`, `pi/profiles/default/skills/youtube/SKILL.md`, relevant default-profile tests, root `CHANGELOG.md`; Onclave `README.md`, `docs/extensions/onclave-pi/PRD.md`, and linked status documentation belong to the module side of this task if splitting write ownership.
  - Change: tell `/yt` to treat terminal notifications as callback data, fetch stored content only as needed, and return the completed report directly to the operator without calling `onclave_message`; document the four message kinds, service-only publication restriction, delivery behavior, protocol-v3 compatibility boundary, and preserved note/request behavior. Update changelog text without overwriting unrelated entries.
  - Verify: run any focused prompt/skill tests that own `/yt`, plus documentation/source searches proving stale recommendation-request behavior is absent outside migration/history context.
  - Done when: model-facing workflow and product documentation describe one consistent no-response callback path and no active instruction asks `/yt` to answer Core.
  - Evidence: Workflow and product docs aligned; stale active recommendation-request language search passed.

- [x] **T5: Integrate the protocol, Core, adapter, and workflow checks**
  - Depends on: T1, T2, T3, and T4 complete.
  - Files/inputs: all task changes; no new feature scope.
  - Change: resolve integration defects only. Confirm protocol-v3 registration and notification flow across shared contracts, Core publication, broker delivery parsing, adapter turn delivery, and `/yt` framing. Add or adjust only missing regression coverage demonstrated by integration results.
  - Verify: from `modules/onclave/`, run `just check`; run the repository’s focused broker-backed integration command for channel delivery if its prerequisites are available. From the dotfiles root, run `make check-pi-default` without reinstalling dependencies. If broker prerequisites are unavailable, record that integration check as an environment limitation while still running all available deterministic checks.
  - Done when: finite checks pass; the completed-job path has no response expectation; requests, responses, and notes retain prior behavior; and test evidence distinguishes local checks from unperformed live/deployed validation.
  - If blocked: consult `steward` before any follow-up source fix prompted by an unexpected agreed-check result.
  - Evidence: `just check` passed (272 passed, 1 skipped); `just test-integration` passed (3 tests); static assertions passed. `make check-pi-default` reached 833 passed and 19 skipped but retained three unrelated baseline/environment failures in profile and loopback web-tools tests.

- [ ] **T6: Commit and integrate module-first, then close out the parent spec**
  - Depends on: T5 passes.
  - Files/inputs: Onclave task branch/worktree, dotfiles task branch/worktree, parent gitlink, this spec.
  - Change: commit and merge Onclave into local `feature/v2-broker-core` first; update and commit the Onclave gitlink plus dotfiles-owned workflow/docs and archived spec on the parent task branch; merge into local dotfiles `main`. Do not push or deploy. Preserve all unrelated parent changes.
  - Verify: both target branches contain their intended commits; parent points to the integrated Onclave commit; no active spec copy remains; task worktrees are clean before removal.
  - Done when: local module and parent integration, archive metadata, and cleanup are complete, with push/deployment explicitly reported as not performed.
  - Evidence: Not started.

## Agreed validation and current handoff

- Onclave focused contract, Core, vault, adapter, and migration tests as named per task.
- `just check` in `modules/onclave/`.
- Focused broker-backed integration test when its documented prerequisites are available.
- `make check-pi-default` in the dotfiles root.
- Static verification that orchestrator-facing `onclave_message` still exposes only `request`, `response`, and `note`.
- Static and test verification that vault terminal notifications create no request-satisfaction record or inbound response correlation.
- Status: implementation and checks complete; local parent integration pending.
- Completed work and evidence: protocol v3, persisted v2 migration, Core terminal notifications, adapter delivery/error handling, `/yt` workflow, and documentation implemented. Onclave checks and broker integration passed; dotfiles check had only unrelated baseline/environment failures after 833 tests passed.
- Next: commit the archived parent task changes, merge them into recorded target `main`, then record completion metadata and clean worktrees.
- Blockers/open decisions: none. Parent integration and cleanup remain agent-owned. Push and deployment remain unauthorized and outside local completion.
- Verification limits: no live Pi callback, deployed Core, mixed-version rollout, broker integration, or provider behavior has been tested during planning.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/onclave-turn-triggering-notifications/` does not contain another plan, then move this entire spec directory there in the parent task worktree and repair affected links. Commit Onclave implementation on its task branch and merge it into local `feature/v2-broker-core` before committing the updated gitlink, dotfiles workflow changes, changelog, and archived spec on the parent task branch.

Merge the parent task branch into its recorded originating `main` checkout without stashing, discarding, or committing unrelated target changes. Resolve routine conflicts within settled intent. If dirty-target integration cannot preserve unrelated work through the repository’s approved Git workflow, retain the worktree and report integration pending rather than constructing a low-level merge.

After successful parent merge, verify the target contains the changes and archive and no active plan copy remains. Set the archived plan’s `status: completed` and `completed` date, record integration evidence, and commit that metadata update on the target. Remove task worktrees only when they contain no uncommitted or unmerged work. Do not push or deploy without separate authorization. A live deployed compatibility check is a non-blocking verification limit, not permission to roll out.

### Final response

Start with one overall outcome:

- 🟢 **COMPLETED**: checks passed, both repositories integrated locally, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed but module or parent integration is blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing; state the precise question and recommendation.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes were committed under an explicit no-merge instruction.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on the targets, but worktree cleanup remains unfinished.

For blocked or cleanup-pending outcomes, immediately state the reason, action owner, and exact next action before successes. Then report checks, archived spec path, branches/commits, module-first merge result, parent gitlink result, retained worktrees, and that push/deployment were not performed.
