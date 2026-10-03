---
created: 2026-10-02
status: completed
completed: 2026-10-03
---

# Simplify /commit around Git staging

## Goal and scope

Make default Pi `/commit` follow the operator's normal Git workflow: stage everything, review the index, then unstage and selectively restage to exclude files or form sensible commits. The index is the proposed commit, not a separate candidate inventory or custom inspection system.

Settled user decisions:

- Include the current repository and all initialized submodules. Process children before parents.
- In each repository, run `git add -A` before reviewing and shaping the commits. New-file ignore decisions and commit grouping happen after staging, not before it.
- Ask when exclusion is uncertain. Adjust `.gitignore`, unstage exclusions, and stage ignore changes as appropriate.
- Correct routine inspection mistakes and continue. Stop on failed Git mutations, hooks, cancellation, or workflow deadline without undoing completed work.
- Push only when requested. Publish submodules before their parents, including relevant outgoing commits in otherwise-clean children. Bare `/commit` may complete child commits and parent gitlink commits locally without requiring publication.
- Remove the blanket discovery termination gate and mandatory custom Git-review tool. Use ordinary Git inspection and staging operations.
- Keep normal hooks and concise, factual reporting. No added tests, lint, builds, secret scans, group approvals, or validation phase inside `/commit`.

Non-goals: other Damage Control proposals, general subagent lifecycle fixes, other clients, legacy Pi, new staging frameworks, partial-hunk grouping, or changes to ordinary conversational Git requests. Whole-file selective staging is sufficient. No automatic rollback, reset of worktree contents, history rewriting, branch switching, merge/rebase, force push, or new approval gates.

Authorization: this request authorizes planning only. `/do-it` for this plan authorizes implementation, a dedicated worktree, local commits, and integration unless `--no-merge` is specified. No push or deployment of this implementation is authorized. The command's future `/commit push` behavior is not authorization to push this task.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read current root and default-profile `AGENTS.md` instructions before acting. This repository owns all changes; do not modify module repositories or legacy.

Required implementation reading:

- `pi/README.md`, `pi/profiles/default/docs/commit.md`.
- `pi/profiles/default/commands/commit/{reviewer.ts,reviewer.md,tools.ts}`.
- `pi/profiles/default/extensions/commands.ts` for command/UI boundaries.
- `pi/profiles/default/tests/{commit-reviewer,commit-retry,commit-git-review}.test.ts` and relevant existing command lifecycle tests.
- Applicable `pi-extension`, `typescript`, `testing`, and `prompting` skills; installed Pi docs/examples for APIs actually changed.

Verified planning baseline on 2026-10-02: `main`, commit `5369c67a881196661795943368801f25f1624c69`. The runner currently supplies repository/status/instruction inventories, requires `commit_git_review` for status/diffs, forbids unstaging pre-existing changes, asks about ignore candidates before staging, terminates on discovery syntax and every tool error, and already commits/publishes submodules deepest-first. The custom helper pages diffs at 12,000 characters. Removing it must not replace that paging scheme with another mandatory inspection wrapper.

Preserve all existing local changes. At planning time these include root `CHANGELOG.md`, `claude/settings.json`, visible subagent readiness changes and their new test, agent-process and tool-call-analysis history logs, and `.specs/usage-ranked-command-autocomplete/.pi-plan-run.json`. None belongs to this implementation. Recheck before execution; never stage the lasting checkout's unrelated work as part of task closeout. The *implemented command* intentionally stages its caller's working tree; that is separate from the executor's own Git workflow.

Integration target: `C:/Users/mglenn/.dotfiles`, branch `main`. Proposed task branch `feature/stage-first-commit-workflow`, proposed task worktree `.worktrees/stage-first-commit-workflow`; record actual coordinates at execution. Honor runtime-prepared coordinates instead of creating another worktree or replacing the originating target.

Planning profile: default, read-only implementation inspection on 2026-10-02. Intended implementation/check profile: the task worktree's `pi/profiles/default/`. No implementation or validation of this plan has run.

## Implementation contract

### Staging and review

Keep the initialized repository inventory for boundaries and child-first ordering, not as a second list of proposed files. Retain instruction discovery, actual result baselines, and required push metadata where useful.

For each repository, stage all eligible tracked/untracked changes with ordinary `git add -A` (respect normal ignores; never force-add). Review staged changes, including newly added contents. Read relevant instructions as needed. Use normal status/diff/read/search operations; supplied inventory is a useful starting point, not a prohibition on focused discovery.

All initial staged changes are within `/commit`'s scope. The operator explicitly authorizes reshaping the index: unstaging and selectively restaging to build whole-file commit groups is allowed. Preserve working-tree contents, including any index-only content where staging would otherwise overwrite the sole copy; use a simple normal Git mechanism if repository evidence establishes that case, not a new persistence/recovery system. Do not discard content to simplify grouping. If grouping is unclear, one sensible commit is preferable to speculative splitting. Refresh staged/remaining state as needed, not on a prescribed redundant sequence.

An ignore decision may concern an already-staged new file. `Add to .gitignore` must update the applicable repository's ignore file, remove that candidate from the index without deleting its working copy, and include the ignore change appropriately. `Leave untracked` must actually unstage the candidate; reporting alone is insufficient. `Include in commit` keeps it eligible. Ask based on meaningful uncertainty, not the substring `.local` alone. Preserve the existing fixed `.pi/settings.json` policy outside dotfiles, applying it during staged review rather than as a pre-staging phase.

No extra approval for groups/messages. No custom Git inspection tool or replacement candidate registry. Retire unused custom inspection code/tests, retaining small existing utility functions only if still genuinely used.

### Errors and publication

Remove `isBroadDiscoveryCommand` and its fatal dispatch gate. Focused inspection remains permitted. Do not convert every read/search/nonzero inspection outcome into termination; pass recoverable inspection errors back to the agent so it can correct them. A meaningful no-match outcome is not a mutation failure.

Failed staging, unstaging, ignore-file mutation, commit/hook, or push stops dependent mutations. Cancellation/deadline also stops work. Keep this distinction small and grounded in the actual tools used; do not build a general shell-language permission classifier. Preserve the existing provider retry/fallback mechanism and completed tool history. No automatic mutation retry, bypassing hooks, or continuing queued mutations after a failed mutation. Report actual Git state after failure.

Local mode performs no publication-related checks. In push mode retain current attached-branch publication behavior, detached publication handling, recursion override, and prohibition on force-push/tags/other branches/automatic merge or rebase. Commit children before their parent gitlinks; publish children before parents. If a child push fails, do not publish a parent depending on it. Distinguish local child-first commit ordering from child-first publication in root instructions, removing the conflicting requirement to push/pull merely to create a local parent pin commit. Do not weaken unrelated bans on rewriting published module history or change module branches.

### Preserve the command surface

Keep `/commit`, `/commit push`, F10/F9, private in-memory execution, current model selection, normal hooks, progress/ignore UI, idle boundary, cancellation, response retry/fallback behavior, three-minute active-work budget paused during questions, and existing command timeouts. No main-conversation dispatch tool, extra review stage, durable session/report files, or requirement for operator live testing.

## Execution guidance

Create/resume the dedicated task worktree and record actual coordinates before editing. Consume matching runtime-prepared coordinates without duplication. Consult `strategist` before delegation unless the user explicitly requests a single-agent handoff; a Team Lead retains its own Strategist-first workflow. Assign at most one named task per subagent, splitting further only when needed, using active catalog roles.

Continue independent work around blockers. Adapt ordinary implementation mechanisms within settled behavior; ask before changing scope, decisions, or acceptance. Keep task evidence and blockers current. Do not manufacture parallel work: runtime behavior, prompt changes, and their tests are tightly coupled.

## Tasks

- [x] **T1: Implement the stage-first private commit runner**
  - Depends on: none.
  - Owns: `commands/commit/` runtime/prompt/helper files and relevant commit/command tests under `pi/profiles/default/`.
  - Replace pre-staging candidate selection with stage-first index review, whole-file grouping/restaging, and post-stage ignore decisions. Remove mandatory custom Git inspection and discovery termination. Separate recoverable inspection errors from terminal mutation failures. Preserve command surface, retries, publication behavior, and truthful result collection.
  - Complexity: stage/ignore transitions, pre-existing index content, and stop behavior must agree between the actual Agent execution and its prompt. Keep any failure distinction local rather than introducing a new command-analysis framework.
  - Add/update bounded tests using the existing real Agent lifecycle with deterministic provider fixtures. Use temporary real Git repositories for staging semantics rather than mocking the index. No live model/network calls.
  - Done when stage-first behavior and error recovery are exercised and obsolete gate/custom-tool expectations are removed.
  - Evidence: Implemented 2026-10-03 in prepared task branch `task/stage-first-commit-workflow`. Stage-first ordinary Git review and selective staging replace custom inspection and discovery gates. Deterministic Agent and real Git tests cover staging, ignore decisions, preservation, ordering, recovery, terminal failures, cancellation, and retries.

- [x] **T2: Align documentation and repository publication policy**
  - Depends on: T1's final runtime/prompt contract.
  - Owns: root `AGENTS.md`, `CHANGELOG.md`, default `docs/commit.md`, and directly affected documentation references.
  - Document stage-first review, legitimate unstaging, meaningful ignore questions, recoverable inspections, terminal mutation failures, and normal Git inspection. Clarify local child-first commits versus requested child-first publication. Remove stale custom-tool/discovery-gate directions without weakening repository boundaries or unrelated module invariants.
  - Verify prompt/task/docs/root policy composition has no conflicting pre-staging, no-unstaging, or local-publication requirements. Follow prompting guidance; do not spread the procedure into unrelated always-loaded instructions.
  - Done when operator-facing behavior and applicable policy agree with T1 and settled decisions.
  - Evidence: Updated root policy, changelog, Pi README, commit prompt and operator documentation on 2026-10-03 to distinguish local child-first commits from requested publication and align stage-first/error behavior.

- [ ] **T3: Run agreed checks and close out locally**
  - Depends on: T1 and T2.
  - Run finite checks below; fix demonstrated task defects. Record dates, actual profile, and results. Archive the whole spec and commit task changes, then integrate and clean up under the closeout contract when authorized.
  - Done when checks pass, authorized integration/completion metadata are committed, and task worktree cleanup is verified (or an accurate explicit exception/blocker is reported).
  - Evidence: Automated checks passed 2026-10-03 in the task default profile: `pnpm test commit-reviewer.test.ts commit-retry.test.ts commit-staging.test.ts commands-lifecycle.test.ts` (55 tests); `pnpm run typecheck`; `pnpm run check:runtime`; implementation-only temporary-index `git diff --cached --check`. Retired `commit-git-review.test.ts` replaced by `commit-staging.test.ts`. Parent `git diff --check` also passed. Archive/task commit underway; integration and cleanup remain pending, owned by Integrator after handoff.

## Agreed validation and handoff

From the task worktree's `pi/profiles/default/`:

- Run the focused commit suites (`pnpm test commit-reviewer.test.ts commit-retry.test.ts` plus the actual retained/replacement Git semantics and affected command lifecycle test files). Do not pass `--` before filters. Remove retired test names from the invocation and record replacements.
- Coverage must exercise: stage-before-review; staged new files; grouping by unstage/restage; include/ignore/leave-untracked decisions after staging; preservation of working contents; child commits then parent gitlinks; local mode without remote checks; requested child-first publication including clean outgoing children; a recoverable inspection error followed by correction; terminal mutation/hook/push failure suppressing dependent mutations; cancellation and provider retries retaining completed work. Use existing tests for preserved behavior, do not duplicate them unnecessarily.
- `pnpm run typecheck` and `pnpm run check:runtime`.
- `git diff --check` on the implementation task diff only. This is an agent-owned implementation check, not a gate added to `/commit`.

Status: implementation and agreed automated checks passed on 2026-10-03. Actual task worktree: `C:/Users/mglenn/.dotfiles/.worktrees/stage-first-commit-workflow`; branch: `task/stage-first-commit-workflow`; recorded target: `C:/Users/mglenn/.dotfiles`, `main`, starting commit `5369c67a881196661795943368801f25f1624c69`. Next: archive and commit, then authorized Integrator closeout. Integration/cleanup remain unfinished. Blockers/open decisions: none. Verification limits: automated deterministic-provider and real temporary Git evidence is not a live model/UI acceptance claim; operator manual checks are non-blocking and not a required phase.

## Closeout

After implementation and checks, leave integration/cleanup unfinished until actually completed. Confirm `.specs/archive/stage-first-commit-workflow/` has no conflicting plan, move this entire spec there in the task worktree, and commit implementation plus archive on the task branch. Do not archive unfinished implementation.

For authorized `/do-it`, dispatch the Integrator from the recorded target checkout after the task commit, with the closeout manifest. The Integrator owns integration, completion metadata, and clean task-worktree removal. Prepared Herdr runs use the admitted same-tab successor: integration readiness precedes any explicitly authorized orchestrator-only obligations and exact-origin retirement; the successor then cleans up and reports. Direct/run-here execution keeps ordinary parent-owned communication. Honor `--no-merge` by retaining the committed worktree and skipping integration mutation.

Routine conflicts are agent-owned. If blocked, retain necessary work and report the exact blocker, next action, and owner; passed checks alone are not completion. No implementation push or deployment is authorized. Manual/live checks do not block archival or integration.

Final reporting starts with explicit outcome: 🟢 COMPLETED; 🔴 NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED; 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED; or 🟡 CLEANUP PENDING. For unfinished outcomes, foreground reason and action needed before passed checks. Include concise checks, archive path, commits, integration result, and any retained worktree.

## Integration evidence

55 focused commit/staging/retry/lifecycle tests passed; typecheck and check:runtime passed; task-only diff checks passed; normal commit hook passed. Live model/UI unverified, non-blocking.
