---
created: 2026-09-27
status: completed
completed: 2026-09-27
---

# Keep default Pi responsive without losing useful live status

## Goal and scope

Reduce recurring work in the default Pi profile while preserving the operator-facing reload indicator, conditional `/clear` reload, useful throughput display, subagent delivery, Onclave presence and message delivery, and bounded analytics staging.

Settled outcomes:

1. `[reload]` remains a first-party development aid. Check every 15 seconds without blocking terminal input, and give `/clear` a current answer before its conditional reload. Monitor our Pi extensions and supporting code, first-party prompt templates, skill definitions, settings, context files, and first-party shared adapter inputs actually used by Pi. Do not monitor themes: the operator does not edit them and does not need theme changes reflected in `[reload]`. Do not monitor installed third-party pnpm code merely because Pi reports its source path. Keep content-based change/reversion detection and the existing live-settings exclusions.
2. During assistant streaming, accumulate TPS data on every delta but publish the status only once or twice per second, plus promptly on first token and at completion. Do not refresh the footer on every delta.
3. Replace recurring local parent queries from active subagent applications and visible-child hosts with event-driven two-way local communication. Deliver parent commands and nested outcomes promptly, and retain child activity/results, acknowledgements, intervention, parent-loss, and cleanup behavior. No new authentication layer or unrelated threat-model work.
4. Keep Onclave's existing server-held HTTPS message long poll. Prevent a rapid sequence of empty responses from spinning, and use already recurring message-delivery traffic for liveness where it can preserve current presence semantics instead of adding redundant requests. Do not add a separate push service or change message semantics.
5. Remove the two 25 ms recursive analytics disk-check timers. Retain DuckDB's native spill limit and explicit total-owned-disk checks at large-staging batch and checkpoint boundaries; do not remove the existing 8 GiB staging budget as part of this change.

Non-goals: theme change detection, new telemetry, a Git-based reload detector, a new Onclave transport, arbitrary dependency watching, a general-purpose subagent messaging rewrite, changes under `pi/profiles/legacy/`, or deployment. The Onclave adapter is first-party product code owned by its module, not a pnpm third-party library.

Authorization: this request authorizes **planning only**. Do not implement or run Git solely because this plan exists. Invoking `/do-it` for this plan authorizes implementation, task worktrees, local commits, and local integration unless `--no-merge` is specified. This satisfies the operator's instruction not to run Git without a request. Push and deployment require separate explicit authorization.

## Fresh-context handoff

Fully qualified task paths are relative to `C:/Users/mglenn/.dotfiles/`; bare `lib/`, `extensions/`, `tests/`, and `docs/` paths in default-profile task bullets are relative to `pi/profiles/default/`. `modules/onclave/` paths belong to that independent repository. Read the root and active-profile `AGENTS.md`; for module changes read `modules/onclave/AGENTS.md`. The planning profile was verified as **default** on 2026-09-27. Intended implementation profile is default. No implementation or validation run is claimed by this plan.

- Dotfiles owns `.specs/`, `pi/profiles/default/`, `scripts/pi-subagent-host.mjs`, workstation wiring, and the module gitlink. Onclave owns `modules/onclave/extensions/onclave-pi/` and `modules/onclave/services/core/`. Do not duplicate Onclave implementation in the thin `pi/profiles/default/extensions/onclave-pi.ts` loader. Keep the Onclave checkout attached to `origin/feature/v2-broker-core`; do not switch that checkout to another branch.
- Starting evidence: `lib/profile-reload.ts` runs a 15-second timer; `lib/reload-monitor.ts` synchronously walks/hashes roots. `extensions/profile-reload.ts` passes command/tool/theme source paths without first-party filtering and explicitly notes that gap; theme paths should no longer contribute to the monitor. A representative dotfiles-cwd scope contained 191 files (100 under `lib/`, 53 under `extensions/`), not an inventory of every live tab. Existing snapshots skip credentials, sessions, `node_modules`, and skill support files. `tps-tracker.ts` calls `setStatus()` on every delta and on a 250 ms timer. `lib/subagents/child-surface.ts` sends 200 ms parent requests; `scripts/pi-subagent-host.mjs` also sends 100 ms `host-poll` requests. Both must be considered in the event-driven change. The Onclave server holds an empty delivery poll for up to 25 seconds; its registry uses heartbeat age for presence. Analytics recursively stats its invocation-owned directory at 25 ms intervals during setup and SELECT, in a child process; large staging already has batch and checkpoint checks and DuckDB is separately configured with `max_temp_directory_size`.
- Relevant files and checks: `pi/profiles/default/tests/profile-reload*.test.ts`, `usage-context-tps.test.ts`, `subagent-{transport,runtime,messaging-lifecycle,child-outcomes,host-diagnostic,cleanup}.test.ts`, `log-analytics-{store,boundary}.test.ts`; `modules/onclave/extensions/onclave-pi/tests/{connection,extension,http-client}.test.ts`, `modules/onclave/services/core/tests/registry.test.ts`. Consult `pi/profiles/default/docs/subagents.md` and `docs/onclave.md` for preserved lifecycle behavior.
- Preservation: the planning checkout has pre-existing edits from the previous command-UI work and reload-monitor CPU fix, including `CHANGELOG.md`, `pi/README.md`, command files/tests, `lib/profile-reload.ts`, `lib/reload-monitor.ts`, reload tests, and the first-party note in `extensions/profile-reload.ts`. This list comes from this conversation, not Git verification. Recheck working files before authorized implementation and never discard unrelated changes. Module status is unverified.
- Worktree/integration target: not selected, because Git was not authorized for planning. On `/do-it`, record the actual dotfiles target checkout/branch and a dedicated task worktree. For Onclave use a module task worktree based on `feature/v2-broker-core` without switching its canonical checkout. Respect independent checks, commits, remote, and parent gitlink boundaries.

## Implementation contract

- **Reload:** Preserve the 15-second indicator and same-session baseline semantics through `/new`, `/clear`, resume, fork, and actual `/reload`. Restrict monitored loaded provenance to first-party Pi source/resources. Preserve first-party command, prompt, skill-definition, settings, and context coverage rather than silently redefining `[reload]` as code-only; exclude theme paths and theme directories from change detection, even when first-party. Include relevant repository-owned shared adapter code without recursively watching the entire Onclave repository. Exclude explicitly supplied third-party pnpm paths, not just `node_modules` found during recursion. Do not blindly remove all `lib/` monitoring and miss imported first-party modules. Routine source-selection mechanics are flexible; prove additions, deletions, content reversions, metadata-only touches, unchanged live settings, and third-party exclusion in focused tests. Avoid synchronous filesystem traversal or hashing on the interactive path; bound in-flight scans and ignore results from a superseded session.
- **TPS:** Maintain measured first-token latency, estimated vs provider-reported token semantics, final throughput, and timer cleanup. Choose a 500 ms or 1-second presentation cadence; deltas can remain frequent internally.
- **Subagents:** Use the existing process-local authority/endpoint contract rather than inventing a security layer. A persistent bidirectional local channel, or equivalent held request with immediate wakeup, must allow parent-to-child commands/outcomes and child-to-parent activity, results, and acknowledgements. Include the visible host's stop/parent-loss path as well as the application heartbeat path; do not replace native Pi editor/PTY input. Keep command IDs, origin ownership, at-most-once handling where presently guaranteed, retry/ack semantics, and user-owned intervention behavior. The temporary 25/50 ms waits around explicit interventions/cleanup are not idle polling and are outside this change unless the new channel directly replaces them. Avoid recurrent short-interval connection churn when no message is pending.
- **Onclave:** Preserve registration, peer presence, session shutdown, reconnect backoff, signed HTTPS requests, and existing delivery/disposition semantics. Empty polls normally wait server-side; only unexpectedly immediate empty responses need pacing. The server currently marks registration stale after 90 seconds without heartbeat. If successful authenticated long polls renew liveness, update server and adapter together so removing a separate heartbeat does not make healthy idle agents stale. Keep the peer-count footer accurate through a proportionate existing request or response path; do not add another periodic scan to replace the old one. Leave transient failure behavior and the shared module boundary intact.
- **Analytics:** The recursive 25 ms guards are custom code, not DuckDB's total disk limit. Remove both timer callbacks without claiming the 8 GiB budget becomes a hard limit. Keep the existing explicit checks after large-mode batches/checkpoints and DuckDB spill configuration; SELECT remains read-only. No broader analytics quota or worker redesign.

## Execution guidance

When `/do-it` is invoked, record the actual target and proposed worktree/branches before editing. Preserve all existing changes; do not use a plan worktree to erase dirty work. Consult Strategist before delegating implementation-plan work unless the operator explicitly requests a single-agent handoff, including a Team Lead. A Team Lead keeps its own Strategist-first workflow. Assign at most one named task per subagent; divide a task further if needed and preserve disjoint write ownership. Continue independent work around blockers. Adapt equivalent implementation details to the code, but ask before changing the settled behavior, safeguards, scope, or acceptance. Do not add a mandatory reviewer sequence or extra tooling.

The tasks below have independent owners unless a dependency is named. T1, T2, T3, T5 and T6 can begin independently after authorization; T4 consumes T3's channel contract. T5 belongs in the Onclave repository. Reserve shared docs and root changelog changes for T7 to avoid overlapping writes.

## Tasks

- [x] **T1: Focus and unblock first-party reload detection**
  - Depends on: none. Parallel with: T2, T3, T5, T6.
  - Files: `pi/profiles/default/extensions/profile-reload.ts`, `lib/{profile-reload,reload-monitor}.ts`, `extensions/clear.ts` if required, and `tests/profile-reload*.test.ts`.
  - Change: select first-party Pi reload inputs rather than arbitrary absolute loaded paths; retain owned imported code and first-party resource coverage other than themes, including known shared adapter inputs. Remove theme paths from the monitored inputs. Make baseline and recurring checks non-blocking with a single in-flight scan and session-generation protection. Keep the 15-second cadence, prompt footer updates on changed state, and let `/clear` obtain a current answer before deciding whether to reload. Preserve normal reload lifecycle and error reporting.
  - Verify: `cd pi/profiles/default && pnpm test profile-reload.test.ts profile-reload-integration.test.ts`; add focused fixtures for explicit third-party package paths, first-party adapter paths, ignored theme edits, change during an in-flight scan, shutdown/rebind, and an immediate `/clear` after an edit. Observe an interactive-path responsiveness bound in an offline fixture or measured local run without turning a live manual check into a gate.
  - Done when monitored first-party edits/reversions produce the right indicator and `/clear` decision, theme and third-party pnpm edits do not, and filesystem scanning does not synchronously monopolize the Pi event loop.
  - Evidence: Implemented asynchronous, serialized, session-cancelled scans with owned-path filtering and fresh `/clear` checks. Focused reload suite passed: 2 files, 18 tests. Final combined suite also passed.

- [x] **T2: Coalesce throughput display updates**
  - Depends on: none. Parallel with: T1, T3, T5, T6.
  - Files: `pi/profiles/default/extensions/tps-tracker.ts`, `tests/usage-context-tps.test.ts`.
  - Change: collect each delta without rendering each one; publish at most once or twice per second while streaming, with prompt first-token and final updates. Stop the timer on message end, cancellation, session switch, and shutdown.
  - Verify: `cd pi/profiles/default && pnpm test usage-context-tps.test.ts`; assert `setStatus` call cadence as well as displayed calculations and cleanup.
  - Done when rapid deltas do not produce a render request per delta and display semantics remain intact.
  - Evidence: Implemented 500 ms streaming presentation with first-token/final updates and cleanup. `usage-context-tps.test.ts` passed: 12 tests.

- [x] **T3: Provide parent-driven local subagent delivery**
  - Depends on: none. Parallel with: T1, T2, T5, T6.
  - Files: `pi/profiles/default/lib/subagents/{transport,runtime,visible,rpc}.ts` as needed and `tests/{subagent-transport,subagent-runtime,subagent-messaging}.test.ts`.
  - Change: establish a bounded bidirectional channel or held-request contract through which the parent signals pending child commands, nested outcomes, and host stop; preserve child reports/acknowledgements and existing ownership. Supply a clear channel API for T4 rather than adding a second broker or authorization layer. Distinguish visible app, visible host, and headless app endpoints.
  - Complexity: transport, session lifetime, and parent/host/child ownership interact. Split internal contract and runtime wiring if one assignment becomes too large.
  - Verify: focused transport/runtime tests for idle wakeup, multiple queued commands, acknowledgement, disconnect, cancellation, parent loss, and no duplicate outcome delivery.
  - Done when T4 can subscribe to parent events without sending periodic heartbeat/app/host polls.
  - Evidence: Added held parent-event channels for headless app, visible app, and visible host consumers with wakeups, acknowledgements, disconnect handling, and activity reports. Focused transport/runtime/messaging suite passed: 3 files, 50 tests.

- [x] **T4: Migrate child and visible host to event delivery**
  - Depends on: T3's channel contract and parent signal delivery; can proceed alongside T1, T2, T5 and T6 after that prerequisite.
  - Files: `pi/profiles/default/lib/subagents/child-surface.ts`, `scripts/pi-subagent-host.mjs`, `lib/subagents/visible.ts` if necessary, and `tests/{subagent-messaging-lifecycle,subagent-child-outcomes,subagent-host-diagnostic,subagent-cleanup}.test.ts`.
  - Change: eliminate the active child application's 200 ms and visible host's 100 ms parent-query loops. Keep native visible user input, parent command/redirect/handback behavior, headless and coordinator nested outcomes, host stop, user-owned survival on parent loss, and deterministic cleanup. Avoid losing a pending event across initial registration or session replacement.
  - Verify: named focused tests plus the existing `pnpm test subagent` filter from `pi/profiles/default/`. Opt-in model/Herdr live suites remain non-blocking verification limits unless specifically authorized and provisioned.
  - Done when idle children and their hosts no longer generate short-interval parent requests, while command/result delivery and failure behavior still pass the focused lifecycle suite.
  - Evidence: Replaced the 200 ms app and 100 ms host query loops with cancellable parent-event waits. Four named focused files passed: 19 tests. The broad `pnpm test subagent` filter retained 7 failures that reproduce on the recorded target checkout; 24 task-worktree files passed and 3 skipped.

- [x] **T5: Keep Onclave delivery reactive without redundant heartbeats**
  - Depends on: none. Parallel with: T1, T2, T3, T6. Owns only `modules/onclave/` files.
  - Files: `modules/onclave/extensions/onclave-pi/src/{onclave-pi.ts,lib/connection.ts,lib/http-client.ts}` and `modules/onclave/services/core/src/{registry.ts,vault/agent-routes.ts}` as needed, with corresponding adapter/core tests and relevant module documentation.
  - Change: pace unexpectedly immediate empty long-poll responses while retaining normal 25-second server-held delivery and reconnect backoff. Renew the 90-second presence lease from authenticated message polls, remove the separate heartbeat interval, and return the current live-peer count along that same request/response path so the footer does not require a replacement poll. The existing route response helpers support headers on both an empty 204 and a delivered response; use a comparably small wire change rather than a new service or transport.
  - Verify: from `modules/onclave/`, run focused `pnpm exec vitest run extensions/onclave-pi/tests/connection.test.ts extensions/onclave-pi/tests/extension.test.ts extensions/onclave-pi/tests/http-client.test.ts services/core/tests/registry.test.ts`, then `just check`. Test idle presence beyond 90 seconds, quick empty responses, real waits, delivered messages, disconnection, and shutdown without live credentials. Broker-backed integration is a non-blocking limit if prerequisites are absent.
  - Done when ordinary idle message delivery does not busy-loop, healthy idle instances stay live, footer presence remains accurate, and no independent heartbeat interval remains when the message channel suffices.
  - Evidence: Implemented in independent Onclave branch `task/lean-pi-runtime-onclave`, commit `ceab7fb`, published as `origin/task/lean-pi-runtime-onclave`; focused Vitest passed 5 files/42 tests and `just check` passed 50 files/391 tests with 1 skipped. Broker-backed integration was not run. The commit is remotely reachable and the dotfiles gitlink is updated for integration.

- [x] **T6: Remove aggressive analytics disk timers**
  - Depends on: none. Parallel with: T1, T2, T3, T5.
  - Files: `pi/profiles/default/lib/log-analytics/store.ts`, `tests/{log-analytics-store,log-analytics-boundary}.test.ts`.
  - Change: remove the setup and query 25 ms `treeBytes` intervals and their interrupt plumbing. Preserve native `max_temp_directory_size`, the total-owned-disk checks at staging batches/checkpoints, cleanup, and truthful peak/budget reporting. Do not add a slower replacement directory-walk timer without evidence.
  - Verify: `cd pi/profiles/default && pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts`; use existing tiny-budget tests to demonstrate that explicit staging checks still reject oversized owned data and that SELECT/cleanup behavior remains correct.
  - Done when no periodic recursive directory checks remain during analytics, and the existing bounded staging behavior and report still work.
  - Evidence: Removed both recursive timers while retaining staging/checkpoint checks and DuckDB spill limits. Focused analytics suite passed: 2 files, 22 tests.

- [x] **T7: Reconcile docs, run final checks, and record closeout**
  - Depends on: T1, T2, T4, T5, T6. Owns shared dotfiles docs/changelog and the coordinating spec state.
  - Files: `pi/README.md`, `pi/profiles/default/docs/{subagents,onclave}.md`, `CHANGELOG.md`, this plan; Onclave-owned documentation belongs in its own repository. Keep the scope note at the owning reload code path, not an intent log in the README.
  - Change: update current behavior and limitations, preserving unrelated edits. Run each affected suite after code integration once; rerun only when fixes change checked content. Record any offline/live verification limit accurately.
  - Verify from `pi/profiles/default`: `pnpm run typecheck`; `pnpm test profile-reload.test.ts profile-reload-integration.test.ts usage-context-tps.test.ts subagent-transport.test.ts subagent-runtime.test.ts subagent-messaging-lifecycle.test.ts subagent-child-outcomes.test.ts subagent-host-diagnostic.test.ts subagent-cleanup.test.ts log-analytics-store.test.ts log-analytics-boundary.test.ts onclave-pi.test.ts`; `pnpm run check:runtime`; `node scripts/onclave-smoke.mjs`. Use the T5 Onclave checks for that repository. No file-filter `--` after `pnpm test`.
  - Done when documentation matches validated behavior and all agreed agent-owned checks pass or have a precise task-related defect fixed. Local Git integration is authorized by `/do-it` unless `--no-merge` is specified; push remains separately authorized.
  - Evidence: Updated root changelog and Pi runtime/subagent/Onclave docs. Final dotfiles checks passed: typecheck; 12 files/110 tests in the agreed suite; `check:runtime`; and offline Onclave smoke. Broad `pnpm test subagent` has 7 target-baseline failures (unauthenticated Sol registry plus pre-existing session/record assertions), reproduced unchanged in the target checkout.

## Agreed validation and current handoff

- Status: **implementation and agreed agent-owned checks complete; archived for authorized integration**.
- Completed work: T1 through T7 are implemented and validated in dotfiles worktree `C:/Users/mglenn/.dotfiles/.worktrees/lean-pi-runtime`, branch `task/lean-pi-runtime`, based on recorded target `main` at `677dcc442f96fd60518b30be9aa3b5f91b410cdb`. Onclave T5 is committed in worktree `C:/Users/mglenn/.dotfiles/.worktrees/lean-pi-runtime-onclave`, branch `task/lean-pi-runtime-onclave`, commit `ceab7fb`.
- Next: dispatch Integrator from the recorded target checkout for local merge, completion metadata, and worktree cleanup.
- Open behavior decisions: none. Onclave push was explicitly authorized and completed; deployment remains unauthorized.
- Verification limits: attached-client typing, live Herdr child control, broker-backed/deployed Onclave presence, and deployment are not proven. They are non-blocking manual/live limits. The Onclave task branch was pushed with explicit authorization. No deployment was performed.

## Closeout on `/do-it`

On `/do-it` execution, use dedicated task worktrees and local task commits while preserving the current checkouts. The Onclave module is an independent repository: commit its work there, and follow the repository requirement to push module changes **only with separate push permission** before updating or committing the dotfiles gitlink. Never include module files directly in a dotfiles commit or switch the module checkout off `feature/v2-broker-core`. Without that permission, report module/dotfiles integration as pending instead of publishing a local-only parent gitlink.

After implementation and checks, confirm `.specs/archive/lean-pi-runtime/` is unused, archive the whole spec on the authorized dotfiles task branch, and commit it with its implementation. For authorized `/do-it` integration, dispatch Integrator from the recorded dotfiles target checkout after the task commit; it owns the local merge, completion metadata, and worktree cleanup. Honor an explicit `--no-merge` request. An unresolved module publication or local merge blocks the respective integration; keep worktrees and accurate pending checkboxes/evidence instead of claiming completion. Do not deploy without separate permission. Manual/live operator testing remains a non-blocking verification limit.

Final response must lead with the actual outcome and explicit text: 🟢 **COMPLETED** only after checks, authorized integration, metadata, and cleanup; 🔴 **NOT COMPLETE: MERGE BLOCKED** or **USER INPUT REQUIRED** with reason and action owner when blocked; 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED** only for authorized `--no-merge`; 🟡 **CLEANUP PENDING** when integrated but cleanup remains. Report checked results and the exact repository/branch/worktree state without implying that planning or passing tests alone completed delivery.

## Integration evidence

Dotfiles typecheck, agreed 110-test suite, runtime check, and offline Onclave smoke passed. Onclave focused 42 tests and just check 391 passed with 1 skipped. Visible host/cleanup regression suite passed 13 tests and a live visible subagent launch passed after fixing the undeclared waitForParentEvents binding. Onclave commit ceab7fbb573b02e14559ea9163c4586851231dae was explicitly authorized and pushed to origin/task/lean-pi-runtime-onclave. Seven broad subagent-filter failures reproduce unchanged on the target checkout.
