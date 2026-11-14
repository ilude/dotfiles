---
created: 2026-11-13
status: completed
completed: 2026-11-13
---

# Make `/commit` report completed work correctly when later edits arrive

## Goal and selected scope

Make `/commit` and `/commit push` finish successfully when their repository passes succeeded, without declaring those commits and pushes failed because another edit arrived afterward.

The recommended completion boundary is **one completed pass per repository**, not a promise that every working tree stays clean until the whole multi-repository run returns. The command includes eligible changes discovered during that repository's pass. Later work remains untouched and is reported explicitly as not included. There is no global catch-up loop or extra sweep.

Preserve the existing review, ignore/exclusion, normal-hook, staged-content preservation, child-before-parent ordering, cancellation and publication behavior. Actual failures still fail. Keep the published directory-to-gitlink, index stat-cache, stash-preservation and status-diagnostic fixes.

**Authorization:** the user authorized execution of this selected plan with “make it so.” Execution used the plan's direct/run-here route for implementation and local closeout. Publication of this task is not authorized.

## Fresh-context handoff

Paths below are relative to the dotfiles root. Read applicable root and default-profile instructions first. All implementation belongs to `pi/profiles/default/`, not the legacy profile or infrastructure/product submodules.

Required reading:
- `pi/profiles/default/commands/commit/reviewer.ts`: repository loop, `reviewAndExecute`, publication and final result collection.
- `pi/profiles/default/commands/commit/plan.ts`: execution's existing unfinished-path check.
- `pi/profiles/default/tests/commit-staging.test.ts`: real Git child/parent and bare-remote fixtures.
- `pi/profiles/default/docs/commit.md`.

Planning inspection: default Pi profile (`pi/profiles/default/`) in T3, baseline `b42bf0ae53056eec37eff9062ffbf53960912cf9`, branch `main`. Intended execution profile is also default. Opus high and a fresh-context Sol xhigh independently inspected the source and exchanged objections; no new behavior has been implemented or tested by this planning pass.

Execution record, 2026-11-13: default profile; direct/run-here in `C:/Users/mglenn/.dotfiles` on `main`, starting at `393b928a8eae1a00162abe5ee743fcbda2219765`. Strategist recommended the orchestrator execute this small change directly. No additional worker, task branch, worktree, merge or cleanup was needed.

Originating integration target: `C:/Users/mglenn/.dotfiles`, branch `main`. Record actual task branch/worktree coordinates when execution starts; use runtime-prepared coordinates if supplied. Preserve unrelated edits. At planning time these include `CHANGELOG.md`, the Hatchery and homelab-infra submodules, and default-profile dev-setup-testing guidance. Recheck before editing; do not stage or modify other repositories to manufacture a clean workspace.

## Verified cause and evidence limits

- `reviewAndExecute` already restages and re-reviews unfinished eligible changes within a repository's pass. `executeCommitPlan` verifies the actual committed path set and remaining changes. Publication also checks unfinished work before pushing.
- The outer repository loop visits each repository once, deepest first. Final result collection subsequently calls `unfinishedPaths()` again for every repository and sets global failure if a previously completed child has become dirty (`reviewer.ts`, currently around lines 682–704).
- Reported incidents created and pushed child and parent commits, then failed that final check. One inspected remaining change was YAML folded-string line wrapping with a modification time about two minutes after the child commit. The actor responsible was not established. This is not evidence that the runner or a hook caused the edit.
- Successful focused tests and manual Git closeout did not establish that the operator's full `/commit push` succeeded. Keep that distinction in completion reporting.

## Implementation contract

1. A repository pass owns the eligible changes staged/reviewed during that pass, including changes its existing within-pass loop rediscovers. Do not weaken those checks or change that loop.
2. Once the repository pass and its requested publication finish, later changes in that repository are outside the completed pass. Preserve and list them, without another commit, push or model review and without converting the successful run into failure.
3. Keep the existing `Remaining changes` output. Add one concise heading for eligible changes observed after a repository completed, for example `Changed after repository pass; not included:` followed by repository-relative status entries. Wording must also fit a clean/no-commit pass, not imply every repository created a commit.
4. Existing intentional unstaged exclusions retain their reasons and remain distinct from late eligible changes. Use the existing `unfinishedPaths()` filtering unchanged for the additional report list.
5. A successful run may therefore report commit hashes, `Pushed.` and late changes together. Bare `/commit` must still avoid publication-related checks and operations.
6. Keep actual failures, blockers, cancellation, status-reporting failures and unknown push outcomes as failures, with already completed work retained in the report. Do not report success just because some earlier pushes succeeded.

## Tasks

- [x] **T1: Make final late-change collection informational, with one real-Git regression**
  - Depends on: none.
  - Files: `commands/commit/reviewer.ts` and `tests/commit-staging.test.ts` under `pi/profiles/default/`.
  - Extend the existing child/parent and local bare-remote fixtures. Begin with a child edit; inject a second child working edit from the test harness after child publication and before the parent plan (for example, at the parent's staging progress callback). Do not make the read-only `inspect` tool perform the concurrent write. Finish the reviewed parent pin and publication using the existing deterministic provider and real Git, not a live model or infrastructure service.
  - First establish that the regression fails because of the current final global cleanliness check. Then replace that check's failure assignment with collection of late eligible changes and include the list in the final report. No repository revisit, new timeout, mutation retry or framework is needed.
  - Assertions: the run resolves successfully; output contains `Pushed.` and the late child path; the late edit remains in the working file; the child remote tip equals the child's completed HEAD and the gitlink in the parent's remote tip. There is no extra commit/push to include the late edit.
  - Verify: from `pi/profiles/default/`, `pnpm test commit-staging.test.ts -t "reports late child edits without failing completed publication"` (use that name for the new test).
  - Done when the old behavior is reproduced and the targeted test passes with the small reporting change.
  - Evidence: regression reproduced the old `Uncommitted changes remain in modules/child` error after two successful pushes; it then passed with the reporting-only change. The late working edit stays uncommitted, child/parent remote OIDs match, and only the original child/parent pushes occur. An initial Windows fixture deadline was exceeded; the red/green runs used the same installed Git's native binary on the test process's PATH, with no runtime launch change or timeout increase.

- [x] **T2: Document the completion boundary and run the finite check**
  - Depends on: T1's implemented reporting boundary.
  - Files: `pi/profiles/default/docs/commit.md`, root `CHANGELOG.md`.
  - Replace the global final-cleanliness promise with the per-repository boundary, including the distinction between within-pass unfinished work, exclusions and later edits. Do not append a contradictory account. `reviewer.md` needs no change because final collection is runner-owned.
  - Record preserved behavior and the need for an idle runtime reload (`/reload-runtime` in T3, `/reload` in the terminal).
  - Verify: `pnpm run typecheck` from `pi/profiles/default/`, plus inspection that documentation matches the implemented boundary and existing publication behavior is not overstated.
  - Done when the targeted regression and typecheck pass and the docs accurately describe the result.
  - Evidence: updated `docs/commit.md` and the task-specific changelog entry; left the reviewer prompt and deferred OID races unchanged. `pnpm run typecheck` passed. No broad suite or live command workflow was run.

- [x] **T3: Close out the authorized implementation without a new acceptance ceremony**
  - Depends on: T1 and T2 passing their checks; implementation must first be authorized.
  - Update task evidence, archive this complete spec to `.specs/archive/commit-completion-boundary/`, and commit it with the task changes on the task branch. Do not archive unfinished work or overwrite another archived plan.
  - For `/do-it`, dispatch the Integrator from the recorded original target after the task commit. Record integration, completion metadata and cleanup accurately. Under `--no-merge`, retain the committed task worktree and report the intentional skip. Direct/run-here execution keeps ordinary orchestrator-owned closeout.
  - Done when authorized local integration and cleanup are complete, or their concrete blocker/intentional skip is recorded. Push only when authorized.
  - Evidence: this completed spec is archived and included in the local task commit on the original `main` checkout. No worktree/merge cleanup applies to the direct route. Unrelated edits remain outside the commit; no push was performed.

## Execution guidance and finite validation

This is a small, tightly coupled change, not a reason to create a team or a new execution system. If delegating authorized execution, consult Strategist first and assign at most one named task per agent. Continue independent work around blockers; choose routine mechanisms directly, asking only before changing scope, settled decisions or acceptance.

The agreed agent-owned checks are **the one targeted real-Git regression and default-profile typecheck**. Do not run the same tests twice through overlapping filters, the whole default suite, a broad audit or repeated live commit workflows. Expand a check only if a demonstrated task-related failure requires it, fix that failure and stop when the finite checks pass.

The deterministic test is the acceptance evidence for this defect. The operator's loaded runtime and live model judgment are separate verification limits, not implementation/archival gates. After an idle reload, the next ordinary `/commit push` can supply real-session evidence; report its actual outcome without claiming it already happened or substituting manual Git for command acceptance.

## Separate proposal, not part of these tasks

Concurrent **commits**, unlike the observed late working-file edit, expose two source-level publication races: `stageParentGitlinks` reads a live child HEAD after that child's publication, and push captures `intendedHead` but sends `HEAD:<ref>` rather than that exact OID. Neither caused the reported formatting incident. Addressing immutable publication objects and moved child HEADs needs a separately scoped decision; do not add a guard, pinning redesign or refspec change to T1–T3. This plan preserves child-before-parent operation order but does not claim protection against another process committing in a child during the run.

## Current handoff

- Status: completed locally through the direct/run-here route.
- Completed: T1–T3. Opus high and fresh-context Sol xhigh converged on the implemented per-repository boundary. The targeted real-Git regression and default-profile typecheck passed; the reviewer prompt and deferred publication races are unchanged.
- Next: reload the operator's idle runtime before the next ordinary use. Push only if separately authorized.
- Blockers/open decisions within the selected scope: none.
- Verification limits: the deterministic test uses the real Agent/Git and local bare remotes. The operator's loaded runtime and a live `/commit push` were not exercised; no end-to-end live success is claimed.

## Completion response

For later authorized execution, lead with the actual outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED / USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. A blocked response must name the reason, action owner and next action before listing passed checks. Include concise check evidence, archived spec location, commits/integration result and any retained worktree. Do not call archival alone completion, and do not make operator live testing a completion gate.
