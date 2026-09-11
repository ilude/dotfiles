---
created: 2026-09-10
status: completed
completed: 2026-09-11
---

# Remove unnecessary subagent workflow gates

## Goal and scope

The operator reports custom safety gates interrupting ordinary subagent work and requested a plan for the four recommended improvements:

1. Allow coordinators to launch workers in other working directories.
2. Allow direct operator `!` shell commands in children.
3. Let a child recover from calling a tool outside its role instead of terminating the turn.
4. Treat ordinary direct messages to visible children as native input/steering, not persistent ownership takeover.

Preserve role tool permissions, Damage Control for model-issued calls, explicit takeover and handback, origin-bound routing, reply correlation, process identity, and cleanup correctness. Native file-path confinement was already removed and must not return.

Non-goals: mutable role permissions or broader tool activation, nested coordinators, model/effort policy changes, active-child reload support, headless fallback, new approval prompts, allowlists, or a general subagent audit. Do not change Onclave, legacy, or unrelated `/plans` and Herdr work.

Authorization: planning only now. A later execution request authorizes the local worktree, task commits, archival, and merge described below. Push and deployment require separate permission.

## Fresh-context handoff

All paths below are relative to `C:/Users/mglenn/.dotfiles` unless absolute. Read applicable `AGENTS.md` instructions before execution.

- Owner: dotfiles, default Pi profile only.
- Planning profile verified on 2026-09-10 through `PI_CODING_AGENT_DIR`: `C:/Users/mglenn/.dotfiles/pi/profiles/default`.
- Intended execution profile: default. No implementation or model trial has run for this plan.
- Integration target: originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`.
- Task branch: `feature/subagent-workflow-gate-removal`; sibling worktree: `C:/Users/mglenn/.dotfiles-subagent-workflow-gate-removal`. Integration target remains originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`.
- Preserve currently modified `CHANGELOG.md`, `pi/profiles/default/docs/herdr.md`, `pi/profiles/default/lib/plan-run-runtime.ts`, and `pi/profiles/default/tests/plan-run-runtime.test.ts`. Recheck current state; this list is a snapshot, not permission to discard later work.

Required source reading:

- `pi/README.md` and `pi/profiles/default/docs/subagents.md`.
- `pi/profiles/default/extensions/subagent-child.ts`, `extensions/subagents.ts`.
- `pi/profiles/default/lib/subagents/runtime.ts`, `workspace.ts`, `rpc.ts`, `visible.ts`, `child-surface.ts`.
- Existing `pi/profiles/default/tests/subagent-workspace.test.ts`, `subagent-loader.test.ts`, `subagent-child-outcomes.test.ts`, `subagent-runtime.test.ts`, and related messaging/terminal-outcome tests.
- Installed Pi extension documentation for `input`, `user_bash`, and recoverable `tool_call` blocking. Consult the active `pi-extension` and `testing` skills when implementing, not historical profiles.

### Verified starting behavior, 2026-09-10

- Commit `842a0e5d` removed native-path confinement. The role tool-call hook still returns `block:true, terminate:true` for an unavailable tool.
- `runtime.ts` combines origin equality and coordinator-cwd containment in one launch rejection. Other delegation/parent checks are separate.
- `subagent-child.ts` intercepts all `user_bash` events with a disabled-shell response.
- `child-surface.ts` calls `intervene()` on interactive input outside permission prompts. That marks the child user-owned, stops parent control, and requires `/subagent-return`.
- Visible explicit escalation already uses `VisibleChild.intervene()`. It must continue to provide persistent takeover.
- `visible.ts` takeover handling also resets assignment state and clears queued commands. Removing automatic takeover must not accidentally lose the state updates needed when ordinary input starts a new turn in an idle retained child.

These are source findings, not live acceptance results. Earlier passing tests concern the already-completed path-confinement removal, not this plan.

## Decisions and implementation contract

### Working directories

Permit any otherwise valid explicit worker cwd, including sibling worktrees and repositories outside the coordinator cwd. Preserve same-origin validation, valid existing-directory checks, allowed delegates, live-parent checks, and the no-nested-coordinator rule. Do not replace containment with prompts or path registration. Remove containment-only helpers if unused after the change.

### Operator shell

Remove the child-specific prohibition on direct `!`/`!!` execution. Use native Pi operator-shell behavior, including its normal output and cancellation handling, even for roles without a model-callable shell tool. Operator shell does not add `bash` to the model's role. Preserve Damage Control on model-issued tools; do not disable its extension or introduce a separate shell executor. Verify the existing operator-shell exemption rather than inventing a new approval policy.

### Recoverable role rejection

An out-of-role model tool call remains blocked with an informative reason but does not request early termination. The model can choose an allowed tool, explain a limitation, or ask its parent using already-permitted capabilities. Do not add automatic role elevation, retries, or tools. Keep genuine terminating outcomes, cancellation, and parent-question yielding unchanged.

### Ordinary input versus explicit takeover

Ordinary direct messages stay in native Pi input handling: idle input starts work; busy input follows the user's native steering/follow-up selection. Do not intercept, duplicate, convert, or requeue the message merely to remove takeover.

Ordinary input must not set `userOwned`, clear queued parent messages, suppress parent outcomes, or require `/subagent-return`. Parent steering and cancellation remain available. Notify/update the parent through the existing transport as needed so an idle retained child's new turn becomes running, clears stale assignment outcome, and settles/delivers normally. Use the existing state model rather than a new ownership registry.

Explicit `subagent_control escalate` retains persistent user takeover, suspended parent controls, `/subagent-return`, and user-owned parent-loss/pane-survival behavior. Ordinary steering does not acquire those lifetime privileges: normal retention and parent-loss cleanup remain in force. Permission-dialog input continues to resolve only the prompt. No new takeover command or automatic timeout is required.

## Execution guidance

Create or resume the dedicated task worktree and branch. Record the actual path, branch, and integration target before editing. Carry this task-owned uncommitted plan into the worktree without deleting its source or disturbing unrelated changes.

Implement only settled scope. Adapt equivalent technical details directly. Ask before changing behavior, scope, or acceptance; continue independent tasks around a concrete blocker. Keep task checkboxes, evidence, blocker, next action, and action owner accurate. Do not stop at task boundaries when authorized work can continue. Fix demonstrated task-related defects, then stop once the finite checks pass.

## Tasks

- [x] **T1: Remove coordinator directory confinement**
  - Depends on: none.
  - Update `lib/subagents/runtime.ts` to separate and preserve origin validation while dropping cwd containment. Remove now-unused containment code in `workspace.ts` if appropriate.
  - Extend existing runtime tests to allow a permitted leaf in an existing sibling directory, while still rejecting origin mismatch and invalid delegation.
  - Done when outside-cwd launch is permitted without weakening routing or delegate checks.
  - Evidence: `runtime.ts` now preserves origin validation without coordinator-cwd containment; workspace/runtime tests cover an existing sibling directory, origin mismatch, and delegation rejection.

- [x] **T2: Restore native operator shell and recoverable role errors**
  - Depends on: none; independent of T1.
  - Update `extensions/subagent-child.ts` to remove `user_bash` denial and omit termination on role-tool rejection.
  - Update the existing CLI-loader shell probe to verify harmless native shell execution for a child without model shell permission. Keep active-tool ceiling assertions.
  - Update workspace/authority assertions for recoverable rejection. Add a bounded offline extension/runtime test showing a blocked call carries the reason without terminating and a subsequent permitted action remains possible. Use existing installed-runtime test infrastructure; no provider call is required.
  - Verify child launch still loads Damage Control for model tools using the existing launch checks.
  - Done when operator shell works through native Pi while model role limits remain enforced and recoverable.
  - Evidence: removed the child `user_bash` interceptor; role-tool rejection remains blocked without `terminate`; loader/outcome/workspace tests cover native shell, active-tool ceilings, Damage Control loading, and recoverability.

- [x] **T3: Keep ordinary child input under parent coordination**
  - Depends on: none; integrate after T1/T2 if working sequentially.
  - Update `lib/subagents/child-surface.ts` and only necessary visible/runtime transport handling. Remove automatic takeover from ordinary interactive input, retaining native message delivery.
  - Preserve correct active/settled state for ordinary input during active work and in idle retained children. Preserve queued parent messages and subsequent result delivery.
  - Adapt existing child-outcome/messaging tests to prove ordinary input leaves parent control available; explicit escalation still marks ownership and handback restores control; permission prompts do not take over.
  - Exercise idle-retained new-turn state and active ordinary input through existing visible lifecycle tests/harnesses. Verify non-retained cleanup and explicit takeover parent-loss behavior remain unchanged in the existing automated cases.
  - Done when direct steering needs no handback, explicit takeover still does, and parent lifecycle/outcomes remain accurate.
  - Evidence: ordinary visible input reports native operator activity without takeover; runtime handling resets idle retained assignment state and retires stale pending outcomes. Messaging/runtime/outcome tests preserve parent controls, queued messages, explicit escalation/handback, and permission prompts.

- [x] **T4: Document and validate the bounded changes**
  - Depends on: T1-T3.
  - Update `pi/profiles/default/docs/subagents.md` and relevant default-profile summaries in `pi/README.md` to distinguish role limits, ordinary operator input, and explicit takeover. Remove obsolete descriptions without rewriting unrelated documentation.
  - Add a root `CHANGELOG.md` entry explaining removal of workflow gates, why, and the preserved controls. Preserve concurrent entries.
  - Run the finite validation below and record actual results and limitations.
  - Done when checks pass and current documentation matches the implemented contract.
  - Evidence: documentation and changelog updated. Final offline validation on 2026-09-11: `pnpm test subagent` passed 135 tests with 5 skipped after one transient failed run was rerun; `pnpm run typecheck`, `pnpm run check:runtime` (321 rules, 8 schemas), and root `git diff --check` passed. No live/model-backed flags were enabled.

- [x] **T5: Archive, commit, integrate, and clean up**
  - Depends on: T4 and later execution authorization.
  - Follow the closeout contract below. Leave unfinished integration or cleanup items unchecked.
  - [x] Archive the complete implemented spec and commit task-owned changes on the task branch.
  - [x] Merge into the recorded originating checkout/branch, unless explicitly `--no-merge`.
  - [x] Verify integration and commit completed plan metadata on the target.
  - [x] Remove the integrated, clean task worktree and verify cleanup.
  - Evidence: task commits `4f55c058`, `fb1f0f80`, and `54ace0a7` merged into `main` as `5d14e417` on 2026-09-11. The routine `CHANGELOG.md` conflict preserved both entries. Target verification found this archive and no active plan copy; completion metadata was committed as `89760045`. The clean task worktree was removed and its absence verified.

## Agreed validation and current handoff

From `pi/profiles/default/`, run focused affected test files during implementation, then this final offline subagent check once:

```sh
pnpm test subagent
pnpm run typecheck
pnpm run check:runtime
```

From the repository root, run `git diff --check`. Do not enable model-backed/Herdr live-test environment flags as a completion prerequisite. Existing opt-in tests can remain skipped; report that limit honestly. The regressions for changed behavior must run offline, not be hidden behind opt-in flags. Rerun only when task changes or stale results justify it.

- Status: completed on 2026-09-11.
- Completed work: T1-T5, documentation, finite offline validation, archival, task commits, merge to recorded `main`, completion metadata, and verified worktree cleanup.
- Integration: task commits `4f55c058`, `fb1f0f80`, and `54ace0a7` merged as `5d14e417`; the `CHANGELOG.md` conflict preserved both independent entries.
- Next: none for authorized closeout.
- Open decisions: none within the four scoped improvements. Mutable role permissions are excluded, not implicitly approved.
- Verification limits: no live/model-backed operator trial was run. Operator testing occurs after completion and does not block archival, commit, or authorized merge.

## Closeout contract

After implementation and agreed checks pass, record integration pending. Confirm `.specs/archive/subagent-workflow-gate-removal/` does not conflict with another plan; move this entire spec there in the task worktree and repair affected links. Commit implementation and archived spec together on the task branch. Do not archive unfinished implementation.

Merge the task branch into the recorded originating checkout/branch without stashing, discarding, or committing unrelated changes. Resolve routine task conflicts directly. If integration is blocked, retain the worktree, report the concrete blocker, next action, and action owner. With explicit `--no-merge`, retain the committed worktree and report integration intentionally skipped.

After merge, verify the target contains the changes and archive and no active copy of this plan remains. Account for the original task-owned uncommitted plan without deleting unrelated content. Set archived metadata to `status: completed` and the actual completion date, record integration evidence, and commit that metadata on the target. Remove the worktree only after integration and confirmation it has no uncommitted or unmerged work. Do not mark cleanup done before it succeeds. Rerun checks after conflict resolution only if checked content changed. No push or deployment without separate authorization.

Final response starts with one explicit outcome:

- 🟢 **COMPLETED**: checks, integration, completion metadata, and cleanup finished.
- 🔴 **NOT COMPLETE: MERGE BLOCKED** or **NOT COMPLETE: USER INPUT REQUIRED**: foreground Reason and Action needed, including who must act.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: explicit no-merge respected; retained worktree is intentional.
- 🟡 **CLEANUP PENDING**: integrated, but cleanup remains; foreground Reason and Action needed.

Then report concise checks, archive path, commits/integration, and any retained worktree. Manual operator testing is a non-blocking verification limit, not unfinished implementation.
