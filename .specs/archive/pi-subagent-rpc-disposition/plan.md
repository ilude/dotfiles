---
created: 2026-09-30
status: in-progress
completed: null
---

# Report native RPC input disposition accurately

## Goal and scope

Make default-profile subagent dispatch distinguish native RPC input that started work, was queued, or was consumed by an extension. Do not fabricate queue acceptance, assignment completion, or a run that will never settle.

- User requirements: plan the RPC disposition compatibility work discussed in this session.
- Preserved behavior: native lifecycle events determine actual completion; queued acceptance is not consumption; original-assignment evidence survives follow-ups; cancellation, retained conversations, user-only approvals, and visible Herdr application transport retain their existing contracts.
- Non-goals: transport replacement, codemode adoption, exposure migration, ModelRuntime/Jev changes, legacy-profile changes, new assignment timeouts, push, or deployment.
- Authorization: the user's execution invocation authorizes implementation, dedicated task worktrees, local commits, and integration into the recorded target. The subsequent request authorizes this plan correction. Push and deployment remain unauthorized.

## Fresh-context handoff

All repository paths are relative to `C:/Users/mglenn/.dotfiles`.

- Owner: dotfiles repository, default Pi profile. No module changes are planned.
- Read applicable `AGENTS.md` files and the default profile's `pi-extension` and `testing` skills before implementation or test changes.
- Required implementation reading:
  - `pi/profiles/default/lib/subagents/rpc.ts`
  - `pi/profiles/default/lib/subagents/visible.ts`
  - `pi/profiles/default/lib/subagents/control-result.ts`
  - `pi/profiles/default/lib/subagents/runtime.ts`
  - `pi/profiles/default/extensions/subagents.ts` and `subagent-child.ts`
  - `pi/profiles/default/tests/subagent-rpc.test.ts`, `subagent-messaging.test.ts`, `subagent-messaging-lifecycle.test.ts`
  - `pi/profiles/default/tests/fixtures/fake-subagent-rpc.mjs`
  - Installed Pi 0.99.1 `docs/rpc.md`, `docs/rpc-commands.md`, and exported RPC types. Resolve the installed package from default-profile dependencies; do not depend on this machine's pnpm store hash.
- Verified on 2026-09-30 at `1348344c`, branch `main`:
  - `RpcChild.start()` checks initial prompt response success but ignores response data.
  - `RpcChild.command()` already returns successful response data.
  - Busy-child messaging discards steering response data and always reports a queued-message notice.
  - `startMessage()` clears prior result/state and marks running before awaiting the prompt response.
  - `DispatchMetadata` reports dispatch acceptance separately from completion, but contains no disposition.
  - `VisibleChild.command()` overrides prompt/steer with application queueing and returns no native disposition. Shared changes must not misinterpret that as malformed RPC.
  - Installed docs define prompt dispositions `started | queued | handled` and steer/follow_up dispositions `queued | handled`. They explicitly say `handled` describes this input, not independent extension-started work.
- Preservation: originating checkout was clean during planning. Recheck before editing; preserve unrelated changes.
- Recorded integration target: `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `1348344ca478a078a4b4ff6bce3d782551d33315`. Actual task branch: `task/pi-subagent-rpc-disposition`; current worktree: `C:/Users/mglenn/.dotfiles/.worktrees/pi-subagent-rpc-disposition`. Created 2026-09-30 from that target at the proposed sibling path, then relocated with `git worktree move` because the Integrator runtime requires an exact child of repository `.worktrees/`. Recorded target is unchanged; check evidence below retains the paths where checks actually ran. The originating checkout contains only the untracked task spec; its source copy is preserved until closeout.
- Planning profile verified by `pi_session`: `default`. Intended execution and validation profile: `pi/profiles/default`. No checks were run during planning; do not count documentation/code inspection as runtime validation.

## Settled scope: disposition reporting, not a new failure policy

The user rejected speculative safeguards and approval gates. No consumed-assignment policy approval is required. Inspection found one default-profile consuming input hook: `extensions/exit.ts` handles the exact text `exit` and shuts down Pi. The subagent input hook continues input; damage control observes it. No ordinary assignment-consuming extension or corresponding runtime failure was established.

Implement the native disposition compatibility fix. Report `handled` as extension consumption, not queue acceptance or model completion. Do not invent an assignment-not-started failure, add idle detection, or require a new lifecycle reconciliation system for hypothetical extension behavior. A handled input alone must not create a new pending model run or erase an existing result. Actual lifecycle events remain authoritative, including independently started work and events preceding the response. Use normal existing state transitions to keep per-dispatch reporting separate from assignment results.

## Implementation contract

- Decode native response dispositions using the installed public types where practical. Keep native RPC response handling distinct from visible application-transport acceptance.
- Report disposition as a per-dispatch fact, not a permanent assignment outcome. Extend the existing dispatch metadata only as needed; preserve `accepted`, operation, and `completion: not-reported` semantics.
- For native steering, `queued` means accepted into the queue, not confirmed consumption. `handled` means consumed by an input handler, not queued and not completed by the model.
- For native prompt, `started` and `queued` continue to rely on lifecycle events for actual results. Report `handled` without claiming work started or waiting for a model result solely because the input was accepted. Preserve prior results without presenting them as completion of this input; preserve actual intervening lifecycle events.
- Cover initial assignment, retained follow-up, factual-answer dispatch, and immediate redirect paths that share prompt handling. Preserve question resolution and original exchange evidence.
- Do not synthesize native dispositions for visible children. Preserve their application-transport behavior and honest dispatch-acceptance reporting.
- No new assignment deadline, polling loop, broad state restoration, or backward-version support is part of this work. Use existing normal state transitions; resolve response/event races without rolling back legitimate intervening events.

## Execution guidance

Create the dedicated worktree and record its path/branch and target before editing. Preserve task-owned uncommitted plan content without deleting its source.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead follows its own Strategist-first workflow. Assign at most one named task per subagent and use active catalog roles. These tightly coupled changes do not need manufactured parallel assignments.

Adapt routine mechanisms within approved intent. Ask before changing scope, decisions, or acceptance. Continue independent available work around blockers. Keep task evidence and blocker/next-action/owner records accurate. Fix demonstrated task-related defects and stop when the finite checks pass.

## Tasks

- [x] **T1: Reconcile native input dispositions with subagent lifecycle and dispatch reporting**
  - Depends on: none; the disposition-reporting scope is settled.
  - Files: `lib/subagents/rpc.ts`, `control-result.ts`, callers in `extensions/subagents.ts`, `extensions/subagent-child.ts`, and `lib/subagents/runtime.ts`, all under `pi/profiles/default`. Touch visible transport only if necessary to preserve its existing contract.
  - Change: consume disposition for initial prompt, steering, and follow-up prompt paths; expose accurate per-call reporting; avoid fabricated queue acceptance, completion, or a pending run for handled input, using existing lifecycle transitions. Preserve lifecycle events, original outcomes, factual question semantics, and cancellation.
  - Complexity: prompt state is currently reset before response arrival; events can arrive before acknowledgments; visible children share methods without native responses. Keep these boundaries explicit rather than assuming every successful command starts work.
  - Verify: focused tests in T2 must demonstrate response-first and event-first behavior without fake completion or stale results.
  - Done when: all native dispatch paths distinguish the documented dispositions and visible acceptance remains unchanged.
  - Evidence: Implemented 2026-09-30 in `C:/Users/mglenn/.dotfiles-worktrees/pi-subagent-rpc-disposition`, branch `task/pi-subagent-rpc-disposition`, base `1348344ca478a078a4b4ff6bce3d782551d33315`. Initial inspection found no tracked changes; only this task spec was untracked. Read default instructions, `pi-extension`/`testing` skills, required implementation/tests/fixture, and installed 0.99.1 RPC docs/public response types via default-profile dependency links.
  - Production paths: `rpc.ts`, `control-result.ts`, `runtime.ts`, `extensions/subagents.ts`, `extensions/subagent-child.ts`, plus `presentation.ts` for truthful compact/expanded disposition reporting. Visible transport source is unchanged. Native response data is validated against the public response disposition union; visible queue acceptance omits native disposition. Message/answer return per-call disposition; runtime attaches metadata before the coordinator application response, so child authority no longer overwrites it. Initial launch exposes operation `assignment` and waits for native acceptance, not completion, for background dispatch; foreground interruption remains available while acceptance is outstanding.
  - State contract: native follow-up state activates on run activity or a non-handled response, once per dispatch. Handled input does not clear prior terminal evidence or create a new exchange/pending run. An initially handled assignment becomes `waiting` with phase `settled`, no outcome/result, and a consumption notice; it remains owned and cancellable. Actual events before the response remain authoritative. Later independent `agent_start` can activate a waiting consumed-input conversation or a live retained conversation. Factual answers resolve the request and clear the resolved question text; handled answers do not invent model work. No timeout, idle detection, synthetic assignment failure, or transport replacement was added.
  - Checks (2026-09-30, default profile): dependency setup `cd pi/profiles/default && pnpm install --frozen-lockfile`, then repository-root `bash scripts/pi-deps-link-setup --profile default`, succeeded. `pnpm run typecheck` passed. An inline `pnpm exec tsx -e` in-memory smoke passed handled retained-result preservation, queued prompt activation, handled steering notice, event-before-handled-response settlement, and visible acceptance without native disposition. `git diff --check` passed. This smoke used an overridden command boundary, not a wire fixture or installed CLI, and is not T2 coverage.

- [x] **T2: Prove disposition handling and document the compatibility change**
  - Depends on: T1's implemented reporting/lifecycle contract.
  - Files: existing RPC fixture and subagent RPC/messaging tests; `CHANGELOG.md`. Add a focused test file only if it improves isolation.
  - Tests: started prompt normal completion; queued prompt acceptance; queued versus handled steering; handled prompt reporting without fabricated pending work or completion; retained follow-up preserving prior results; lifecycle events before response remaining authoritative; answer/immediate-redirect paths; rejection/provider-error/cancellation regressions; unchanged visible application acceptance. Do not add a synthetic assignment-failure policy or an exhaustive hypothetical extension lifecycle matrix.
  - Prefer the existing fake child boundary for deterministic wire sequencing. Exercise at least one handled-input path using the installed bundled Pi CLI with a small fixture input extension and no paid model request, if the existing harness supports it. Do not add dependencies or use unsupported internal CLI entrypoints.
  - Update fixture success responses to reflect current native disposition fields where they model native RPC.
  - Verify from `pi/profiles/default`: `pnpm run typecheck` and `pnpm test subagent-rpc.test.ts subagent-messaging.test.ts subagent-messaging-lifecycle.test.ts subagent-runtime.test.ts subagent-child-outcomes.test.ts`. Include any new focused test file explicitly.
  - Record actual date, profile/path, command, and result. No live provider or manual Herdr session is required.
  - Done when: agreed cases pass, task-related regressions are resolved, and the changelog explains acceptance versus consumption/completion and preserved visible behavior.
  - Evidence: Completed 2026-09-30 in `C:/Users/mglenn/.dotfiles-worktrees/pi-subagent-rpc-disposition` on `task/pi-subagent-rpc-disposition`. Updated `tests/fixtures/fake-subagent-rpc.mjs` with native started/queued/handled success data and event-first handled sequencing. RPC and messaging tests cover initial handled versus queued dispatch, no fabricated handled result/run, event-first lifecycle result authority, handled retained follow-up preserving prior result/original exchange, queued versus handled steering, answer disposition, and existing redirect/cancel/provider rejection/error regressions. Lifecycle integration asserts initial assignment and native answer/steer dispositions. Installed bundled Pi CLI test uses a temporary input-consuming extension and verifies handled response with no model request. Visible application queue behavior remains covered and native disposition is omitted for that surface. Added changelog explanation of accepted/queued/consumed versus completion and preserved visible behavior.
  - Checks (2026-09-30, default profile at `pi/profiles/default`): `pnpm run typecheck` passed; `pnpm test subagent-rpc.test.ts subagent-messaging.test.ts subagent-messaging-lifecycle.test.ts subagent-runtime.test.ts subagent-child-outcomes.test.ts subagent-loader.test.ts` passed (6 files, 64 tests, including installed bundled CLI case); repository-root `git diff --check` passed. An earlier focused run exposed a stale test assertion expecting `answer()` to return `undefined` and an incorrectly escaped newline in the new CLI test; both test-only defects were corrected and the complete checks above passed. No production defect was established by test results, so no additional production correction was made.

- [ ] **T3: Archive, commit, integrate, and clean up authorized work**
  - Depends on: T1 and T2 complete with checks passing.
  - Confirm `.specs/archive/pi-subagent-rpc-disposition/` is unoccupied. Archive this entire spec directory in the task worktree and commit it with implementation changes. Record integration pending until delivered.
  - For `/do-it`, dispatch `integrator` from the recorded target checkout after the task commit, supplying the closeout manifest and this plan. Integrator owns local merge, completion metadata commit, and clean worktree removal. Under `--no-merge`, retain the committed worktree and skip mutation by Integrator.
  - Done when: authorized local integration and completion metadata are committed and cleanup verified, or the intentional no-merge exception is accurately recorded.
  - Evidence: 2026-09-30: archive destination confirmed unoccupied; whole spec archived under `.specs/archive/pi-subagent-rpc-disposition/` for task commit. Local integration, completion metadata, and task worktree cleanup remain pending, owned by Integrator after task commit. Source plan in target checkout is a preserved task-owned copy; remove it only after the canonical archive is verified during closeout.

## Validation and current handoff

- Status: T1 and T2 complete; T3 remains pending. Speculative handled-assignment failure policy and its approval gate remain excluded.
- Completed: T1 implementation and T2 fixture/tests/changelog with finite checks passing. Evidence and exact checks are recorded under each task. No provider or live Herdr session was required.
- Next owner: Integrator for authorized local merge, completion metadata commit, and cleanup after the parent's archive/task commit. T3 remains unchecked until integration and cleanup finish.
- Blocker: none. Integration and cleanup pending; no push or deployment authorized.
- Verification limits: automated fixture tests and installed bundled CLI handled-input case passed. No paid model request, provider integration, or live Herdr session was run.

## Closeout and final report

Do not archive unfinished implementation. After checks pass, archive and commit on the task branch before authorized integration. Leave incomplete integration/cleanup checkboxes unchecked. If blocked, retain the worktree and record reason, next action, and action owner. Routine merge conflicts remain agent-owned. Push/deployment require separate authorization.

The Integrator verifies target/archive, records actual completion date/status/evidence, commits metadata, and removes the clean task worktree. Report cleanup pending if metadata/integration succeeds but cleanup does not.

Final response begins with one explicit outcome:
- 🟢 **COMPLETED**: checks, integration, completion metadata, and cleanup finished.
- 🔴 **NOT COMPLETE: MERGE BLOCKED** or **NOT COMPLETE: USER INPUT REQUIRED**.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED** under `--no-merge`.
- 🟡 **CLEANUP PENDING**.

For blocked outcomes give Reason and Action needed, with owner, before passed checks. Then summarize checks, archived spec path, branch/commits, merge result, and any retained worktree. Do not imply automatic resumption.
