---
date: 2026-05-02
status: synthesis-complete
---

# Review: Pi Commit Extension Option B

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Standard completeness | reviewer | Completeness & explicitness reviewer | Required standard reviewer | Assume the plan will be executed without conversation context and find missing/untestable requirements |
| Standard security | security-reviewer | Git mutation and secret-safety reviewer | Required standard reviewer | Assume tools can mutate real repos in unsafe order or without sufficient confirmation |
| Standard simplicity | product-manager | Scope and UX proportionality reviewer | Required standard reviewer | Challenge whether Option B is overbuilt or phased poorly |
| Git edge cases | devops-pro | Git workflow edge-case expert | User explicitly requested Git workflow edge-case coverage | Assume implementers only handle happy-path porcelain and corrupt/misreport messy repos |
| Pi TypeScript | typescript-pro | Pi extension API and TypeScript runtime reviewer | Target implementation is a Pi TypeScript extension | Assume command/tool API assumptions and runtime tests are incomplete |
| QA realism | qa-engineer | Real Git regression and validation reviewer | Success depends on tests around Git mutation safety | Assume tests pass while dangerous edge cases remain untested |

## Standard Reviewer Findings
### reviewer
- The plan names likely Pi test commands rather than requiring discovery of the actual command, which can make validation ambiguous.
- The plan does not define enough concrete preconditions for when commit tools may mutate state.
- Several acceptance checks rely on grepping for registration strings, which can pass while runtime registration or behavior is broken.

### security-reviewer
- Mutating tools (`commit_stage`, `commit_create`, `commit_push`) lack an explicit confirmation/permission boundary independent of the `/commit` slash command.
- The plan mentions secret safety mostly indirectly; it does not require a concrete secret scan/redaction gate before staging/commit.
- Push behavior needs stronger safety semantics around remote/upstream/ref, rejected pushes, and no-success reporting.

### product-manager
- Option B is valuable, but the scope is large: slash command, five tools, core port, docs, tests, and Python transition. The plan should define a minimal safe V1 inside Option B.
- The plan should avoid trying to solve grouped multi-commit automation too early; fast/single-commit and planning-only flows can prove the extension first.

## Additional Expert Findings
### devops-pro as Git workflow edge-case expert
- The plan under-specifies partial-index behavior: a user may already have staged changes that should be preserved or excluded.
- It lacks explicit handling for merge, rebase, cherry-pick, bisect, detached HEAD, worktree, sparse checkout, and submodule states.
- It does not require re-reading the staged set immediately before `git commit`, leaving a race between planning/staging and commit.
- Push semantics need explicit handling of no upstream, protected branch rejection, non-fast-forward rejection, network failure, and detached HEAD.
- Tests should include renames/copies, binary files, LFS-like pointer files, CRLF/path quoting, and filenames beginning with dash or containing spaces.

### typescript-pro
- A real conflict exists: `pi/extensions/workflow-commands.ts` already registers `pi.registerCommand("commit", ...)`, so a new `pi/extensions/commit.ts` registering `/commit` may collide or shadow behavior.
- The plan should specify TypeBox schemas and exact tool input/output contracts for every LLM-callable tool.
- Runtime tests should exercise command/tool registration through the Pi mock/runtime pattern, not only grep source text.

### qa-engineer
- Real Git repo tests are required for planning, but mutating paths (`commit_stage`, `commit_create`, `commit_push`) also need disposable-repo integration tests.
- The validation contract currently depends on `make check`, but repo-wide lint is known to fail at the time of review; execution will block unless that is fixed first or explicitly planned as a prerequisite.
- Manual validation should include cancel/revise/deny paths, not only the happy-path confirmation flow.

## Suggested Additional Reviewers
- `devops-pro` -- selected as Git workflow edge-case expert for partial index, submodules, merge/rebase states, push behavior, and hooks.
- `typescript-pro` -- selected for Pi extension API, TypeBox schemas, async subprocess/runtime behavior, and test harness fit.
- `qa-engineer` -- selected for real Git integration coverage and preventing false-positive acceptance criteria.

## Bugs (must fix before execution)
1. **Existing `/commit` command registration conflict.**
   - Evidence: verified with a targeted scan; `pi/extensions/workflow-commands.ts:775` already calls `pi.registerCommand("commit", { ... })`.
   - Required fix: add a task before implementing the new extension to inspect the existing command, decide whether to replace, delegate, rename during transition, or migrate it. The plan must prevent two extensions from registering competing `/commit` handlers.
2. **Mutating tool confirmation boundary is underspecified.**
   - Evidence: T5 lists `commit_stage`, `commit_create`, and `commit_push`, but explicit confirmation is only described for command UX/manual validation.
   - Required fix: define tool-level safety policy: which tools are non-mutating, which mutate, which require `ctx.ui.confirm` or an explicit confirmation token, and how direct model tool calls are prevented from staging/committing/pushing without approval.
3. **Git edge-case preconditions are missing.**
   - Evidence: plan covers ignored staged deletion, ignored untracked files, modified tracked files, spaces, message validation, and push status, but not merge/rebase/cherry-pick, detached HEAD, submodules, worktrees, sparse checkout, partial index, or unmerged paths.
   - Required fix: add a Git repository state preflight contract and tests. Unsafe states should block with actionable messages unless explicitly supported.
4. **No final staged-set revalidation before commit.**
   - Evidence: T5 goes from planning/staging to commit reporting, but no task requires re-running status/stage-plan immediately before `git commit`.
   - Required fix: require `commit_create` to re-read and verify the exact staged set and message immediately before commit, then abort on drift.
5. **Validation will currently block on known repo-wide lint failures.**
   - Evidence: verified by running `make lint`; it exits 2 with existing Ruff failures in files such as `claude/commands/yt-local/fetch_metadata.py`.
   - Required fix: either add a prerequisite task to fix repo-wide lint before this plan executes, or state that `/do-it` will intentionally block at validation until repo-wide validation is green.

## Hardening
1. Define a minimal Option B V1: register `/commit` plus non-mutating `commit_plan` and `commit_validate_message` first, then add `commit_stage`, `commit_create`, and `commit_push` after safety contracts/tests pass.
2. Add exact TypeBox schemas for each tool input/output, including error shape and state-transition fields.
3. Replace grep-only acceptance criteria with runtime/mock tests proving command and tool registration.
4. Add secret scan requirements before staging/commit, including how examples/fixtures are distinguished from real or ambiguous findings.
5. Add tests for cancel, revise, deny, hook failure, commit failure, push failure, and final status reporting.
6. Clarify whether grouped multi-commit support is in V1 or deferred. If deferred, `/commit` should present planning output and refuse grouped mutation.
7. Specify subprocess/path handling on Windows Git Bash: no shell-string Git commands, pathspec separator `--`, filenames beginning with `-`, CRLF, and non-UTF output.

## Simpler Alternatives / Scope Reductions
1. Keep Option B but phase it: V1 should ship `/commit` + `commit_plan` + `commit_validate_message` only; V2 adds stage/commit; V3 adds push/grouping.
2. Treat the existing Python helper as an oracle during tests, not a runtime dependency, until the TypeScript core reaches parity.
3. Defer grouped multi-commit automation; require explicit paths or `fast` for first mutating release.

## Contested or Dismissed Findings
1. **“Option B is inherently over-engineered”** was dismissed. The user explicitly requested Option B and Pi-first implementation; the right fix is phased scope, not abandoning tool+command architecture.
2. **“Python helper should remain the implementation”** was dismissed. It conflicts with the Pi-first policy, though it remains useful as a parity oracle and fallback during migration.
3. **“No review can proceed until repo lint is fixed”** was downgraded. It is not a plan-design blocker, but it is a `/do-it` execution blocker under the current validation policy.

## Verification Notes
1. Confirmed command conflict with a targeted source scan: `pi/extensions/workflow-commands.ts:775` registers `pi.registerCommand("commit", { ... })`.
2. Confirmed current repo-wide lint failure by running `make lint`; Ruff exits non-zero on existing files including `claude/commands/yt-local/fetch_metadata.py`.
3. Confirmed edge-case omissions by reading the plan: no references to merge, rebase, cherry-pick, detached HEAD, submodule, worktree, sparse checkout, or final staged-set revalidation.
4. Confirmed mutating tool ambiguity by reading T5: `commit_stage`, `commit_create`, and `commit_push` are listed without tool-level confirmation semantics.

## Review Artifact
Wrote full synthesis to: `.specs/pi-commit-extension/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the must-fix plan edits before `/do-it`.
- Start by resolving the existing `/commit` registration conflict and adding a Git state preflight/safety contract.
