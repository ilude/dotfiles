---
created: 2026-05-02
status: completed
completed: 2026-05-03
---

# Plan: Pi Commit Extension Option B

## Context & Motivation

The current `/commit` workflow still depends heavily on markdown instructions and shell commands. During this session it failed once by trying to `git add` a file that had just been ignored and removed from tracking, then later succeeded after adding a deterministic Python helper. We also established a Pi-first policy: future workflow/tooling solutions should default to Pi-native skills/extensions and TypeScript unless explicitly instructed otherwise.

This plan converts `/commit` into a first-class Pi extension using **Option B: tool + command workflow**. The extension should register a user-facing `/commit` command and LLM-callable commit tools. Review found an existing `pi.registerCommand("commit", ...)` in `pi/extensions/workflow-commands.ts`, so this plan now explicitly starts with command ownership/migration before adding any new handler. V1 is intentionally phased: non-mutating plan/message tools first, then mutating tools only after safety contracts and tests are in place.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Pi-first implementation policy: prefer Pi skills/extensions and TypeScript for workflow/tooling work.
- Existing Python helper behavior in `scripts/commit-helper` is a regression/parity reference, not the long-term implementation target.
- Existing Pi command ownership must be resolved first: `pi/extensions/workflow-commands.ts` currently registers `commit`.
- Do not use `git add .` or `git add -A`; stage explicit paths only with `--` pathspec separator.
- Never re-add ignored files that are intentionally staged for removal from tracking.
- Do not force-add ignored files in V1.
- Commit messages must be conventional: `feat|fix|docs|chore|refactor|test|perf|ci|build(scope?): description`.
- Mutating tools require explicit user approval, either via `ctx.ui.confirm` in command flow or a confirmation token generated after showing the exact plan.
- `commit_create` must re-read and verify the staged set immediately before `git commit`.
- `/commit push` must not push unless commits succeeded; push failures must be reported distinctly.
- Generated/runtime Pi expertise under `pi/multi-team/expertise/` should not be committed; `pi/settings.json` remains commit-worthy config.
- Repo-wide validation is currently known to fail on Ruff lint in unrelated files; `/do-it` execution will block until repo-wide validation is fixed.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep markdown-only `/commit` instructions | Lowest implementation effort | Already failed on ignored staged deletion; depends on agent remembering subtle Git state rules | Rejected: insufficiently deterministic |
| Python helper only | Cross-client and already tested | Not Pi-first; not a first-class Pi UX; shell command still mediates the workflow | Rejected as final architecture; keep as temporary parity oracle |
| Pi slash command only | Native user-facing `/commit` UX | Does not give the model structured tools for planning/staging/validation; more logic may leak back into prose | Rejected: less robust than Option B |
| Pi extension with slash command plus tools, phased by mutability | Native Pi UX, deterministic TypeScript core, structured tools, safer staged rollout | More work; must resolve existing command registration and port Git parsing carefully | **Selected** |
| Full automatic committer with no model involvement | Highly deterministic | Logical grouping and message quality still need judgment; greater risk of wrong commits | Rejected: extension should constrain model decisions, not replace all judgment |

## Objective

Implement a Pi-native TypeScript commit extension in phases:

- Resolve existing `/commit` command ownership.
- V1: provide `/commit` plus non-mutating `commit_plan` and `commit_validate_message` tools.
- V2: add mutating `commit_stage` and `commit_create` only after tool-level confirmation and final staged-set revalidation are implemented.
- V3: add `commit_push` only after explicit upstream/ref/rejection semantics are tested.

The end state must preserve ignored staged deletions, block unsafe Git repository states, prevent unapproved staging/commit/push mutation, validate conventional messages before commit, and report Prepared/Committed/Pushed states distinctly.

## Project Context

- **Language**: TypeScript/Pi extension code plus Python repo tooling
- **Test command**: `make test-quick`; Pi-specific tests must be discovered in Wave 1 and then used consistently
- **Lint command**: `make lint`; final validation uses the repo-wide validation contract below

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Resolve existing `/commit` command ownership | 2 | feature | medium | typescript-pro | -- |
| T1 | Research Pi extension APIs and exact test commands | 2 | feature | medium | typescript-pro | -- |
| T2 | Design TypeScript commit core and safety contract | 4 | feature | medium | engineering-lead | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T0, T1, T2 |
| T3 | Implement non-mutating TypeScript Git planning core | 4 | feature | medium | typescript-pro | V1 |
| T4 | Add real Git planning and edge-case tests | 3 | feature | medium | qa-engineer | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T3, T4 |
| T5 | Implement `/commit` UX plus non-mutating tools | 3 | feature | medium | typescript-pro | V2 |
| T6 | Add mutating tool safety contracts and tests | 4 | feature | medium | devops-pro | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation-lead | T5, T6 |
| T7 | Implement guarded `commit_stage` and `commit_create` | 4 | feature | medium | typescript-pro | V3 |
| T8 | Document policies and Python helper transition | 4 | feature | medium | engineering-lead | V3 |
| V4 | Final validation and archive readiness | -- | validation | medium | validation-lead | T7, T8 |

## Execution Waves

### Wave 1 (parallel)

**T0: Resolve existing `/commit` command ownership** [medium] -- typescript-pro
- Description: Inspect `pi/extensions/workflow-commands.ts` existing `pi.registerCommand("commit", ...)` behavior. Decide whether the new extension replaces it, the old command delegates to the new extension, or the new implementation is added inside `workflow-commands.ts`. Do not create a second competing `/commit` registration.
- Files: `pi/extensions/workflow-commands.ts`, `pi/extensions/commit.ts` or design note
- Acceptance Criteria:
  1. [ ] Existing command ownership is documented and no duplicate `/commit` registration can occur.
     - Verify: `grep -R "registerCommand(\"commit" pi/extensions | wc -l`
     - Pass: The intended final count is documented and implementation path prevents competing handlers.
     - Fail: Two extensions could register `/commit` concurrently.

**T1: Research Pi extension APIs and exact test commands** [medium] -- typescript-pro
- Description: Inspect existing Pi extensions/tests to identify correct patterns for commands, tools, TypeBox schemas, `ctx.ui`, subprocess execution, and runtime/mock tests. Determine exact Pi test command(s), replacing all “likely” wording.
- Files: `pi/extensions/*.ts`, `pi/tests/*.test.ts`
- Acceptance Criteria:
  1. [ ] Notes identify exact examples to copy for `registerCommand`, `registerTool`, TypeBox schemas, UI confirmation, and tests.
     - Verify: `grep -R "registerCommand\|registerTool\|Type\.Object\|ctx.ui" pi/extensions pi/tests | head -60`
     - Pass: Notes map each needed API to an existing file/example.
     - Fail: Plan proceeds on assumed Pi APIs.
  2. [ ] Exact Pi test commands are recorded.
     - Verify: `grep -R "pnpm test\|bun test\|vitest\|tsx" pi/tests/package.json pi/extensions/package.json pi/tests 2>/dev/null | head -40`
     - Pass: Later tasks use concrete commands.
     - Fail: Validation remains ambiguous.

**T2: Design TypeScript commit core and safety contract** [medium] -- engineering-lead
- Description: Define TypeScript interfaces, TypeBox tool schemas, Git state preflight, path entry fields, actions, confirmation-token model, error shapes, and non-goals before implementation.
- Files: `pi/lib/commit/types.ts`, `pi/lib/commit/README.md`, `pi/extensions/commit.ts` stub/design note, `pi/tests/fixtures/commit/README.md`
- Acceptance Criteria:
  1. [ ] Contract defines entries with `path`, `index`, `worktree`, `classification`, `ignored`, `safeToGitAdd`, `recommendedAction`, and `reason`.
     - Verify: `grep -R "safeToGitAdd\|recommendedAction\|classification" pi/lib/commit pi/extensions/commit.ts pi/tests/fixtures/commit`
     - Pass: Required fields exist in TypeScript types or design docs.
     - Fail: TS implementation can drift from proven helper behavior.
  2. [ ] Contract defines Git state preflight outcomes for merge, rebase, cherry-pick, bisect, detached HEAD, submodules, worktrees, sparse checkout, partial index, and unmerged paths.
     - Verify: `grep -R "merge\|rebase\|cherry-pick\|detached\|submodule\|worktree\|sparse\|partial index\|unmerged" pi/lib/commit pi/tests/fixtures/commit`
     - Pass: Each state is either supported or explicitly blocked with user-facing guidance.
     - Fail: Edge cases are left to accidental behavior.
  3. [ ] Contract defines confirmation boundaries for mutating tools.
     - Verify: `grep -R "confirmation token\|ctx.ui.confirm\|commit_stage\|commit_create\|commit_push" pi/lib/commit pi/extensions/commit.ts`
     - Pass: Direct model tool calls cannot mutate Git state without prior approval.
     - Fail: Tool-level safety relies only on prompt discipline.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T0, T1, T2
- Checks:
  1. Run acceptance criteria for T0, T1, and T2
  2. `make test-quick` -- all tests pass
  3. `make lint` -- no new warnings; if repo-wide lint is still red, stop and record blocker before implementation proceeds
  4. Cross-task integration: ownership decision, API patterns, and safety contract are mutually consistent
- On failure: create a fix task, re-validate after fix

### Wave 2 (parallel after V1)

**T3: Implement non-mutating TypeScript Git planning core** [medium] -- typescript-pro
- Blocked by: V1
- Description: Implement TypeScript modules for Git subprocess calls, porcelain v1 `-z` parsing, ignore checks, repository state preflight, stage planning, path normalization, and conventional message validation. This wave must not stage, commit, or push.
- Files: `pi/lib/commit/git.ts`, `pi/lib/commit/plan.ts`, `pi/lib/commit/message.ts`, `pi/lib/commit/types.ts`
- Acceptance Criteria:
  1. [ ] Stage planning emits documented fields and never recommends adding `safeToGitAdd: false` entries.
     - Verify: `{exact Pi test command from T1} -- commit-planning`
     - Pass: Commit planning tests pass.
     - Fail: Missing fields or unsafe recommendations.
  2. [ ] Conventional message validation rejects `Ignore generated menos status` and accepts `docs(workflow): harden pi workflow validation`.
     - Verify: `{exact Pi test command from T1} -- commit-message`
     - Pass: Invalid message rejected; valid message accepted.
     - Fail: Validation still relies on Git hook failure.

**T4: Add real Git planning and edge-case tests** [medium] -- qa-engineer
- Blocked by: V1
- Description: Add tests using temporary real Git repositories where possible. Cover ignored staged deletion, ignored untracked file, modified tracked file, renames/copies, file with spaces, file beginning with dash, CRLF, binary file, unmerged paths, merge/rebase/cherry-pick detection, detached HEAD, submodule detection, worktree detection, sparse checkout if feasible, and parity with `scripts/commit-helper` for representative statuses.
- Files: `pi/tests/commit-planning.test.ts`, `pi/tests/helpers/git-fixtures.ts`, optional fixtures under `pi/tests/fixtures/commit/`
- Acceptance Criteria:
  1. [ ] Test reproduces tracked file → ignored → `git rm --cached` → staged deletion preserved.
     - Verify: `{exact Pi test command from T1} -- commit-planning`
     - Pass: Entry is `staged_deletion`, `safeToGitAdd: false`, `recommendedAction: keep_staged`.
     - Fail: Test mocks away real Git behavior or does not assert action fields.
  2. [ ] Tests cover repository states that must block mutation.
     - Verify: `{exact Pi test command from T1} -- commit-planning`
     - Pass: merge/rebase/cherry-pick/unmerged/detached/submodule/worktree cases are supported or blocked exactly as contracted.
     - Fail: Edge states fall through to normal planning.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T3, T4
- Checks:
  1. Run acceptance criteria for T3 and T4
  2. `make test-quick` -- all tests pass
  3. `make lint` -- no new warnings
  4. Cross-task integration: TypeScript core behavior matches documented contract and Python-helper parity cases
- On failure: create a fix task, re-validate after fix

### Wave 3 (parallel after V2)

**T5: Implement `/commit` UX plus non-mutating tools** [medium] -- typescript-pro
- Blocked by: V2
- Description: Implement the command ownership decision from T0. Register or migrate `/commit` plus non-mutating tools `commit_plan` and `commit_validate_message`. `/commit` should show plan output, state preflight, and message validation without mutating unless later V2 tools are available and explicitly confirmed.
- Files: `pi/extensions/commit.ts` or `pi/extensions/workflow-commands.ts`, `pi/tests/commit-extension.test.ts`, `pi/extensions/README.md`
- Acceptance Criteria:
  1. [ ] Runtime/mock tests prove command and non-mutating tool registration.
     - Verify: `{exact Pi test command from T1} -- commit-extension`
     - Pass: Tests exercise Pi registration path, not only grep source text.
     - Fail: Workflow remains markdown-only or registration is untested.
  2. [ ] `/commit fast` in this phase refuses to mutate and points to the planned mutating phase unless `commit_create` is implemented.
     - Verify: `{exact Pi test command from T1} -- commit-extension`
     - Pass: No commit can be created before mutating safety contracts are implemented.
     - Fail: Early phase can make unguarded commits.

**T6: Add mutating tool safety contracts and tests** [medium] -- devops-pro
- Blocked by: V2
- Description: Add tests and contracts for `commit_stage`, `commit_create`, and future `commit_push` before implementation. Require confirmation token, exact staged-set revalidation, hook failure reporting, final status reporting, and push preflight semantics.
- Files: `pi/tests/commit-mutation.test.ts`, `pi/lib/commit/README.md`, `pi/tests/fixtures/commit/README.md`, `pi/extensions/commit.ts` schemas
- Acceptance Criteria:
  1. [ ] Tests define confirmation-token requirement for all mutating tools.
     - Verify: `{exact Pi test command from T1} -- commit-mutation`
     - Pass: Direct calls without token are rejected.
     - Fail: Model can call mutating tools directly.
  2. [ ] Tests require final staged-set revalidation immediately before commit.
     - Verify: `{exact Pi test command from T1} -- commit-mutation`
     - Pass: Commit aborts if staged set differs from confirmed plan.
     - Fail: Commit can proceed after index drift.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation-lead
- Blocked by: T5, T6
- Checks:
  1. Run acceptance criteria for T5 and T6
  2. `make test-quick` -- all tests pass
  3. `make lint` -- no new warnings
  4. Cross-task integration: non-mutating UX and mutating safety tests agree on future state transitions
- On failure: create a fix task, re-validate after fix

### Wave 4 (parallel after V3)

**T7: Implement guarded `commit_stage` and `commit_create`** [medium] -- typescript-pro
- Blocked by: V3
- Description: Implement explicit-path staging and commit creation behind confirmation-token checks. `commit_create` must re-read staged state immediately before commit, validate the message, run normal hooks, report hook/commit failures, and never push.
- Files: `pi/extensions/commit.ts`, `pi/lib/commit/stage.ts`, `pi/lib/commit/create.ts`, `pi/tests/commit-mutation.test.ts`
- Acceptance Criteria:
  1. [ ] `commit_stage` rejects missing/invalid confirmation token and never stages unsafe paths.
     - Verify: `{exact Pi test command from T1} -- commit-mutation`
     - Pass: Unsafe paths and missing token are rejected.
     - Fail: Mutating tool can stage without approval.
  2. [ ] `commit_create` revalidates staged set and message immediately before commit.
     - Verify: `{exact Pi test command from T1} -- commit-mutation`
     - Pass: Index drift aborts; valid confirmed commit succeeds in disposable repo.
     - Fail: Commit can proceed on stale plan.

**T8: Document policies and Python helper transition** [medium] -- engineering-lead
- Blocked by: V3
- Description: Document Pi `/commit` ownership, source-vs-runtime policy, Python helper status, and deferred push/grouped-commit scope. Keep cross-client docs accurate, but Pi behavior is canonical going forward.
- Files: `docs/agent-command-surfaces.md`, `pi/PI-INSTRUCTIONS.md`, `pi/extensions/README.md`, `docs/commit-helper-contract.md`, `claude/shared/commit-instructions.md`
- Acceptance Criteria:
  1. [ ] Docs identify Pi `/commit` extension as primary Pi workflow and clarify non-Pi shims.
     - Verify: `grep -R "Pi.*commit\|/commit" docs/agent-command-surfaces.md pi/PI-INSTRUCTIONS.md pi/extensions/README.md`
     - Pass: Pi-first behavior is documented.
     - Fail: Future agents still assume Claude markdown is canonical.
  2. [ ] Docs state Python helper transition status and current consumers.
     - Verify: `grep -R "commit-helper\|Pi commit extension\|compatibility\|deprecated" docs scripts claude/shared/commit-instructions.md pi/extensions/README.md`
     - Pass: Two implementations cannot silently drift.
     - Fail: Python helper and Pi extension have unclear precedence.

### Wave 4 -- Validation Gate

**V4: Final validation and archive readiness** [medium] -- validation-lead
- Blocked by: T7, T8
- Checks:
  1. Run acceptance criteria for T7 and T8
  2. Run all Pi commit extension tests
  3. Run the full Validation Contract below
  4. Confirm no generated runtime state is staged accidentally
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T0, T1, T2 (parallel) → V1
Wave 2: T3, T4 (parallel after V1) → V2
Wave 3: T5, T6 (parallel after V2) → V3
Wave 4: T7, T8 (parallel after V3) → V4
```

## Success Criteria

1. [ ] Existing `/commit` command ownership is resolved without duplicate registration.
   - Verify: `grep -R "registerCommand(\"commit" pi/extensions | wc -l`
   - Pass: Exactly the intended command owner exists and is documented.
2. [ ] Pi exposes a first-class `/commit` command through the chosen Pi extension location.
   - Verify: runtime/mock Pi extension test from T1 test command
   - Pass: Command is registered and covered by tests.
3. [ ] Pi exposes structured non-mutating commit tools first, and guarded mutating tools only after confirmation-token tests pass.
   - Verify: `{exact Pi test command from T1} -- commit-extension && {exact Pi test command from T1} -- commit-mutation`
   - Pass: Tools are registered, non-mutating tools cannot mutate, mutating tools require confirmation.
4. [ ] Ignored staged deletions are never re-added.
   - Verify: `{exact Pi test command from T1} -- commit-planning`
   - Pass: Regression test proves `staged_deletion` / `keep_staged` / `safeToGitAdd: false`.
5. [ ] Unsafe Git repository states are blocked or handled explicitly.
   - Verify: `{exact Pi test command from T1} -- commit-planning`
   - Pass: merge/rebase/cherry-pick/unmerged/detached/submodule/worktree cases follow the contract.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Required automated validation

0. [ ] Ensure repo-wide validation is green before implementation proceeds.
   - Command: `make lint && make test-quick`
   - Pass: exits 0 with no errors or warnings
   - Fail: fix repo-wide validation first; do not begin mutating implementation waves until this passes

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run Pi commit extension tests.
   - Command: `{exact Pi test command from T1} -- commit`
   - Pass: all commit-related Pi tests pass
   - Fail: fix the Pi extension/core/tests, then rerun this command and `make check`

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

### Manual validation

- Required: no
- Procedure: None.

Plans in this repository should be completed by automated validation and task-specific agent-runnable checks. Do not require manual/live validation steps unless the user explicitly asks for them.

### Deployment validation

- Required: no
- Procedure: None.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, deployment validation, and repo-wide validation pass.

## Execution Status

- **Completion classification:** completed-and-archived
- **Date:** 2026-05-03
- **Last completed wave/gate:** V4 final validation and archive readiness.
- **Next wave/gate to run:** None.
- **Implemented:** Pi-native commit planning/message/stage/create tools, confirmation-token guarded mutation, staged-set revalidation, tests, and docs.
- **Validation:** Required automated validation and task-specific checks passed; deployment/manual validation not required.

## Handoff Notes

- Option B means both a slash command and LLM-callable tools. Do not implement only a command wrapper.
- Prefer TypeScript in `pi/` for new commit workflow logic. Use the Python helper only as a reference/parity oracle unless the plan is explicitly revised.
- Start with non-mutating tools, then add mutating tools only after confirmation-token and staged-set revalidation tests exist.
- Be conservative with actual commits in tests: use disposable temporary Git repositories only.
- Do not force-add ignored files in V1.
- Defer `commit_push` and grouped multi-commit mutation unless this plan is extended with explicit push/grouping tests.
- Keep cross-client docs accurate, but Pi behavior is the default target.
