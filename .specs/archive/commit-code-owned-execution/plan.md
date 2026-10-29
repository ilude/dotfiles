---
created: 2026-10-28
status: completed
completed: 2026-10-28
---

# Make `/commit` execute reviewed commits in code

## Goal and scope

- User requirements and settled decisions:
  - `/commit` and `/commit push` must either finish the requested commits (and push, when requested) or stop with a clear reason. They must never report success while eligible changes remain uncommitted.
  - The AI helper keeps the judgment work: reviewing staged changes, grouping whole files into commits, writing commit subjects, and naming exclusions with reasons. It no longer controls whether Git commit or push commands run.
  - The runner code performs staging, unstaging, exclusions, commits, parent gitlink staging, and publication, then verifies each result against Git.
  - Keep the current model selection (latest Luna, Anthropic Haiku fallback) and response retries. Switching models is not the fix.
  - If the AI returns an incomplete or invalid plan, the runner returns the exact validation errors for a bounded correction. If the plan is still invalid, it stops before committing anything from that repository and never commits unreviewed changes.
  - Preserve current user-visible behavior unless listed here: ignore-file questions, deepest-first submodule order, child-before-parent publication, pull-before-push integration, detached-repository skipping, no force-push, preservation of working and index-only content, and actual-Git result reporting.
- Non-goals: partial-hunk commits, new validation/lint/test phases, secret scanning, approval steps for groups or messages, history rewriting, model changes, rollback mechanisms, and changes to the legacy profile.
- Authorization: planning alone permits no implementation or Git operations. `/do-it` authorizes this plan's implementation, local worktree, local commits, and merge into the recorded target unless `--no-merge` is specified. **Push is not authorized.**

The user's request and subsequent changes are authoritative. Keep unapproved recommendations and optional work outside tasks and completion criteria.

## Fresh-context handoff

All paths are relative to the dotfiles repository root (`C:/Users/Mike/.dotfiles`) unless stated otherwise. Read `AGENTS.md`, `pi/profiles/default/AGENTS.md`, and the `pi-extension`, `typescript`, and `testing` skills under `pi/profiles/default/skills/` before acting.

- Owning repository and boundaries: dotfiles only, under `pi/profiles/default/`. No module changes. Never use `bun`; use pnpm commands from `pi/profiles/default/`.
- Required reading:
  - `pi/profiles/default/commands/commit/reviewer.ts`: the runner. It builds inventory, runs one private `Agent`, sequences repositories deepest-first, stages child gitlinks (`stageParentGitlinks`), publishes (`publishRepository`), and collects results.
  - `pi/profiles/default/commands/commit/reviewer.md`: the private model's system prompt.
  - `pi/profiles/default/commands/commit/tools.ts`: the mutation-shell Git wrapper (`commitShellCommand`) and status formatting.
  - `pi/profiles/default/extensions/commands.ts`: calls `runCommitReviewer()` and presents its result.
  - `pi/profiles/default/docs/commit.md`: documented contract.
  - Tests: `pi/profiles/default/tests/commit-retry.test.ts` (real Agent, mocked provider/shell/Git), `commit-staging.test.ts` (real Agent and real temporary Git repositories), `commit-reviewer.test.ts`.
  - Incident records in `pi/profiles/default/skills/agent-process/references/failure-log.md`: `APR-commit-unfinished-success`, `APR-commit-parent-gitlink`, `APR-commit-empty-index`.
- Verified starting behavior (2026-10-28, `main` at `6c1a79ce`, equal to `origin/main`):
  - The private model receives `inspect` (read-only shell), `bash` (mutation shell), `read`, `ask_ignore`, and, in push mode, `publish_repository`. It runs `git add`, unstage/restage, and `git commit` itself.
  - In the reported incident, the run ended with no new commits and staged changes remaining, then reported `Pushed` after pushing the unchanged HEAD. Why the model stopped was not recorded.
  - Runner code already owns repository ordering, parent gitlink staging, pull/push, and Git-derived result reporting. An earlier incident in the same class (omitted parent gitlink) was fixed by runner enforcement.
- Work to preserve:
  - **Uncommitted interim fix (task-owned, superseded by this plan):** the origin checkout contains uncommitted changes from 2026-10-28 that detect unfinished files, resume review, and fail instead of reporting success. Files: `pi/profiles/default/commands/commit/reviewer.ts`, `pi/profiles/default/docs/commit.md`, `pi/profiles/default/tests/commit-retry.test.ts`, `pi/profiles/default/tests/commit-staging.test.ts`, the `## 2026-10-28: Refuse false commit-and-push completion` entry at the top of `CHANGELOG.md`, and the `APR-commit-unfinished-success` entry at the top of the failure log. Carry these into the task worktree as the starting point without deleting the origin copies. Their tests encode required outcomes; keep those outcomes even where the mechanism changes.
  - **Unrelated work in the origin checkout:** Bedrock billing changes (staged and unstaged) in `CHANGELOG.md`, `pi/README.md`, `pi/profiles/default/.gitignore`, `pi/profiles/default/docs/bedrock.md`, `pi/profiles/default/extensions/bedrock/index.ts`, `pi/profiles/default/extensions/codex-status.ts`, `pi/profiles/default/lib/bedrock/*`, and Bedrock tests, plus a staged runtime data file `pi/profiles/default/bedrock-cur-snapshot.json`. Do not carry, edit, stage, or commit any of it. Recheck `git status` before editing; ownership above may have changed.
- Worktree and integration target: originating checkout `C:/Users/Mike/.dotfiles` on `main`. Proposed task worktree `.worktrees/commit-code-owned-execution` on branch `task/commit-code-owned-execution`. Record actual values before editing.
- Profiles: planned in `default` (`pi/profiles/default`). Implement and validate with the default profile's pnpm scripts. No live Pi model or attached-UI run is part of this plan.

## Decisions and implementation contract

**Responsibility split**

| Step | Owner |
| --- | --- |
| Inventory, repository order, `git add -A` staging, index-only content preservation | Runner code |
| Reading staged diffs and repository instructions | AI (`inspect`, `read`) |
| Ignore-file question for uncertain new files | AI asks through `ask_ignore`; code applies the answer |
| Commit groups, subjects, exclusions with reasons | AI, returned as one structured plan |
| Plan validation, unstage/restage, commits, verification | Runner code |
| Child gitlink staging and inclusion in the parent plan | Runner stages; AI groups it in the parent plan |
| Pull, push, outgoing-commit detection, publication result | Runner code |
| Merge-conflict resolution after a publication pull | AI, unchanged existing path (see below) |

**Plan contract (proposed tool `submit_commit_plan`)**

- One call per repository pass: `{ repo, commits: [{ subject, paths: string[] }], exclusions: [{ path, reason }] }`. Paths are repository-relative, matching `git status --porcelain=v1 -z` records after staging.
- Validation rules, all enforced in code:
  - Every changed path after staging, including staged gitlinks, appears exactly once: in one commit or in exclusions.
  - No unknown, duplicate, empty, absolute, or `..` paths. Both sides of a rename stay in the same commit.
  - Subjects are non-empty, single-line, and trimmed.
  - Exclusions have non-empty reasons. Excluded paths end up unstaged, with working contents preserved.
  - An empty `commits` list is valid only when every changed path is excluded or the repository has no changes.
- On invalid input, return the specific errors to the same agent for correction. Allow two correction attempts (adaptable), then stop with the last errors. Do not commit any part of an invalid plan.

**Execution rules**

- For each plan commit, code resets the index to that group's paths, commits with normal hooks, and verifies that HEAD advanced and that the commit contains exactly those paths. Use literal pathspecs, NUL-safe parsing, and the existing 15-second Git timeouts.
- A hook failure, Git error, cancellation, or deadline stops that repository and dependent parents. Report completed commits and actual remaining status, as today.
- After execution, the repository must have no unfinished eligible changes. Allowed leftovers are only excluded paths, which must be unstaged. Files changed by hooks also count as unfinished, which fails with a clear message.
- The success summary and `Pushed.` are produced only when every repository completed and each requested push was confirmed by Git.
- The fixed `.pi/settings.json` policy (outside the dotfiles repository: add that exact path to the repository's `.gitignore`, unstage it, stage `.gitignore`) moves from prompt text into code, applied before the AI reviews.
- Index-only content preservation (`git stash create` + `git stash store`) moves into code before staging, keeping the retained reference in the report.
- The `ask_ignore` behavior and choices are unchanged. Resulting exclusions and `.gitignore` changes feed plan validation.

**Publication**

- `/commit push` publishes, in code, each attached repository that has new commits from this run or existing outgoing commits, deepest-first, after its pass succeeds. Keep the current pull-then-push commands, timeouts, unknown-outcome verification, and detached skipping. The model no longer decides which repositories to publish; `publish_repository` is removed from its tools.
- **Settled preservation:** when the publication pull reports merge conflicts, keep today's recoverable path. The AI may inspect and resolve them with a mutation shell only in that step. The runner then verifies that a merge commit was created and no conflicts remain, then retries publication. If there is no progress, it stops as it does now.
- The mutation `bash` tool is not available in normal review. It may be offered only for that conflict-resolution step.

**Adaptable details:** module layout (for example a proposed `pi/profiles/default/commands/commit/plan.ts` for validation and execution), exact tool description wording, error message text, correction-attempt count, and test fixture shape.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. If runtime-issued prepared-run context matches this plan, use those coordinates without creating a second worktree. Copy the task-owned interim fix listed above into the worktree; preserve unrelated work and do not delete source copies.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt technical mechanisms when repository evidence requires it, but do not change user intent, scope, settled decisions, or acceptance without approval. When blocked, continue independent tasks and ask only for the specific consequential input. Do not add audits, optional improvements, speculative fixes, or acceptance requirements.

Keep checkbox state, concise evidence, current blockers, and the next action accurate. Leave unfinished integration/cleanup checkboxes unchecked. Fix demonstrated task-relevant failures and stop testing when the agreed checks pass.

`commit-staging.test.ts` takes about 2.5 minutes on this Windows host. Give its command a timeout of at least 300 seconds. If a run times out, stop only that test process tree before rerunning.

## Tasks

- [x] **T1: Plan validation and execution module**
  - Depends on: none.
  - Files/inputs: proposed `pi/profiles/default/commands/commit/plan.ts`; proposed focused unit test `pi/profiles/default/tests/commit-plan.test.ts`.
  - Change: implement plan parsing/validation against NUL-separated status records, and a code executor that unstages exclusions, commits each group with verification, and reports commits and remaining state. Export the interface T2 consumes: validate (returns errors or a normalized plan) and execute (given `pi.exec`, repository path, signal, and plan).
  - Complexity / split hints: correctness at Git boundaries (renames, unborn repositories without HEAD, gitlinks, paths with spaces/newlines, Windows path spelling via `lib/path-identity.ts`). Validation and execution are independently testable.
  - Verify: `cd pi/profiles/default && pnpm test commit-plan.test.ts` using real temporary Git repositories for execution cases.
  - Done when: tests cover full coverage, missing/duplicate/unknown paths, split renames, bad subjects, exclusions left unstaged with contents preserved, multi-commit grouping, unborn repository, gitlink inclusion, hook failure stopping later groups, and hook-modified files reported as unfinished.
  - Evidence: In progress. Prepared task checkout verified at `C:/Users/Mike/.dotfiles/.worktrees/commit-code-owned-execution` on `task/commit-code-owned-execution`; target is `C:/Users/Mike/.dotfiles` on `main`, starting at `6c1a79ce17f085bd5c9ff0bb193646829519e420`. Listed interim files and only the interim CHANGELOG entry copied from origin; unrelated Bedrock work remains there. T1 completed: `plan.ts` exports `validateCommitPlan`, `executeCommitPlan`, and `parseCommitStatus`. Focused real-Git/unit coverage passed: `pnpm test commit-plan.test.ts`, 33 tests, 17.53 seconds. Exact coverage includes rename endpoints, exclusions, unborn HEAD, gitlinks, normal hook failure, and hook-generated unfinished work.

- [x] **T2: Rewire the runner and private prompt**
  - Depends on: T1 exported validate/execute interface.
  - Files/inputs: `pi/profiles/default/commands/commit/reviewer.ts`, `pi/profiles/default/commands/commit/reviewer.md`, `pi/profiles/default/commands/commit/tools.ts` only if the conflict-only mutation shell needs it.
  - Change: per repository pass, code stages (`git add -A`), preserves index-only content, applies the `.pi/settings.json` policy, stages child gitlinks, then asks the AI to review and call `submit_commit_plan`. Validate with bounded correction and execute in code. Remove mutation `bash` and `publish_repository` from normal review. Move publication eligibility and invocation into code after each successful pass. Keep the conflict-resolution path with verification. Make final reporting refuse success when any repository is incomplete. Rewrite `reviewer.md` around the new responsibilities and remove instructions for mutations the model no longer performs.
  - Complexity / split hints: many interacting behaviors (gitlinks, deferred parent publication, conflicts, ignore questions, timer pause, cancellation). Keep this in one task; it is tightly coupled.
  - Verify: `cd pi/profiles/default && pnpm run typecheck`.
  - Done when: the runner compiles, the model has no normal-path commit/push ability, and the interim unfinished-work outcomes are enforced through plan validation and post-execution checks.
  - Evidence: `pnpm run typecheck` passed. Runner/prompt now use `submit_commit_plan` with initial submission plus two corrections, code-owned staging/execution/publication, and conflict-only mutation tools. Runtime dependencies linked using explicit-default repository helper. T3 exposed a required preservation regression: Git `stash create` returns empty for a distinct index-only gitlink with only submodule changes. Fixed by retaining an equivalent stash-shaped snapshot using `write-tree`, two `commit-tree` calls, then `stash store`; index/worktree/branch remain unchanged. Affected preservation and conflict-mutation regressions passed (2 tests), and final typecheck passed after correcting the T3 fixture boundary type.

- [x] **T3: Update runner tests to the new contract**
  - Depends on: T2.
  - Files/inputs: `pi/profiles/default/tests/commit-retry.test.ts`, `commit-staging.test.ts`, `commit-reviewer.test.ts`.
  - Change: replace fixtures in which the model runs `git add`, `git commit`, or `publish_repository` with `submit_commit_plan` calls. Preserve the existing behavioral assertions where behavior is unchanged, including retries, Haiku fallback, ignore choices, index preservation, nested gitlinks, publication ordering, divergence merge, conflict resolution, timed-out push verification, and Git-derived reporting. Required new regressions:
    - The model ends without calling `submit_commit_plan` while changes exist: nothing is committed or pushed, the error is explicit, and there is no `Pushed.`
    - An invalid plan is corrected on retry and then committed.
    - An invalid plan that remains invalid is rejected, with no commits and the index unchanged.
    - A plan omitting a staged file is rejected rather than partially committed.
    - Push mode publishes only after code-executed commits and never pushes an unchanged HEAD while changes are unfinished.
  - Verify: `cd pi/profiles/default && pnpm test commit-retry.test.ts commit-reviewer.test.ts commit-plan.test.ts` and, separately with a timeout of at least 300 seconds, `pnpm test commit-staging.test.ts`.
  - Done when: all four files pass.
  - Evidence: Final `pnpm test commit-retry.test.ts commit-reviewer.test.ts commit-plan.test.ts` passed 75 tests in 17.38 seconds. Separate `pnpm test commit-staging.test.ts` passed 43 tests in 195.75 seconds with a 400-second timeout. All 118 tests passed; required missing/invalid/omitted-plan regressions, publication/conflict behavior, and preserved index/gitlink outcomes retained. Final `pnpm run typecheck` passed.

- [x] **T4: Documentation and records**
  - Depends on: T2 interface decisions; parallel with T3.
  - Files/inputs: `pi/profiles/default/docs/commit.md`, the task-owned `CHANGELOG.md` entry, and the task-owned `APR-commit-unfinished-success` failure-log entry.
  - Change: describe in plain language that the AI proposes the commit plan and the code carries it out. Explain what happens when the plan is incomplete, what the result reports, and that `/reload` is needed. Replace the interim CHANGELOG entry with one describing the final behavior. Update the failure-log status with the remedy and test evidence. Do not modify unrelated Bedrock entries.
  - Verify: review statements against the implemented code and test names. Run `git diff --check`.
  - Done when: docs match behavior with no references to removed model mutation responsibilities.
  - Evidence: Updated commit documentation, task CHANGELOG entry, and `APR-commit-unfinished-success` to the code-owned plan contract, correction behavior, conflict tools, actual Git reporting, and `/reload`. Writer checked statements against implemented code and ran clean `git diff --check`. Incident record updated with final 118 passing tests and typecheck evidence.

- [x] **T5: Final checks, archive, and commit**
  - Depends on: T1–T4.
  - Change: run the agreed validation below. Confirm the task diff contains only task-owned files. Archive this spec to `.specs/archive/commit-code-owned-execution/` and commit the implementation and archived spec together on the task branch.
  - Done when: checks pass and the task commit exists with only task-owned files.
  - Evidence: All agreed checks passed: 75 focused tests, 43 staging tests (400-second timeout), typecheck, and final clean `git diff --check`. Task diff contains only plan-owned files. Whole spec directory archived at `.specs/archive/commit-code-owned-execution/`; no affected external Markdown links found. Included with implementation in the task commit; integration remains pending.

- [ ] **T6: Local integration and cleanup**
  - Depends on: T5.
  - Change: dispatch the Integrator from the origin checkout per Closeout. **Settled integration decision:** the origin checkout's uncommitted interim copies of `commands/commit/reviewer.ts`, `docs/commit.md`, `tests/commit-retry.test.ts`, `tests/commit-staging.test.ts`, the interim CHANGELOG entry, and the interim failure-log entry are superseded by the task branch. When restoring origin changes after the merge, keep the task-branch content for those task-owned parts while preserving every unrelated hunk, especially Bedrock entries in `CHANGELOG.md` and all Bedrock files. Report any other overlap as a blocker rather than choosing a side.
  - Done when: `main` contains the task commit and completion metadata, unrelated origin changes are intact, and the task worktree is removed.
  - Evidence: Pending authorized Integrator handoff after task commit. Origin `main` and unrelated changes must be preserved per the settled integration decision above.

## Agreed validation and current handoff

From `pi/profiles/default/`:

- `pnpm test commit-plan.test.ts commit-retry.test.ts commit-reviewer.test.ts`: all pass.
- `pnpm test commit-staging.test.ts`, with a timeout of at least 300 seconds: all pass.
- `pnpm run typecheck`: passes.
- From the repository root, `git diff --check` is clean for task files.

Status:

- Status: implementation and agreed checks passed; archived and committed on task branch, integration pending.
- Completed work and evidence: T1–T4 complete. Final agreed test runs passed 118 tests; typecheck passed. Prepared coordinates verified; task-owned interim fix carried over without deleting origin copies or carrying unrelated Bedrock work.
- Next: authorized T6 local integration and cleanup.
- Blockers/open decisions: none. Demonstrated index-only gitlink retention failure corrected; final agreed tests pass.
- Verification limits: tests use deterministic provider responses and do not prove live Luna planning quality or attached-UI behavior. Operator use of `/commit` after `/reload` is a non-blocking follow-up. Push is not authorized by this plan.

## Closeout

After implementation and agreed checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/commit-code-owned-execution/` does not already exist, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together on the task branch. Do not archive unfinished implementation.

For authorized `/do-it` execution, after the task commit dispatch the Integrator from the recorded target checkout with the closeout manifest and the T6 integration decision. The Integrator owns local integration and cleanup. Ordinary direct/run-here closeout keeps user questions and final reporting with the orchestrator. A runtime-prepared Herdr run uses the same-tab successor, which owns operator questions and final reporting: establish integration readiness, finish explicitly authorized orchestrator-only obligations, release the exact origin for graceful retirement, then clean up from the surviving Integrator pane. Readiness alone is not completion. Keep both panes and the worktree when blocked before retirement; after delivery, report cleanup failures and the exact retained path without rollback. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery. If `--no-merge` applies, do not dispatch the Integrator for mutation; keep the committed worktree and report integration as intentionally pending.

The Integrator verifies the target and archive, records the actual completion date, status, and evidence, commits that metadata, then removes the clean task worktree. It reports CLEANUP PENDING if integration or metadata succeeded but cleanup did not. Push is not authorized. Operator manual testing does not block closeout.

### Final response

Start with one overall outcome, using the colored symbol and explicit text together:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing; state the precise question and recommendation where applicable.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under `--no-merge`; retained worktree is intentional, not a failure or required fix.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are already on the target, but worktree cleanup is unfinished.

For blocked or cleanup-pending outcomes, immediately give **Reason** and **Action needed**, naming the issue, who must act, and the exact next action before successes. Do not imply automatic resumption or hand available agent-owned work to the user. Then give concise checks, spec location, branch/commits, merge result, and retained worktree or cleanup remnants. Never rely on color alone or lead a blocked result with a success summary.

## Integration evidence

118 agreed tests passed: 75 plan/retry/reviewer tests and 43 staging tests (195.75s, 400s timeout); final typecheck passed; git diff --check and staged diff check clean. Task worktree clean after commit. Push not authorized.
