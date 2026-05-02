---
created: 2026-05-02
status: completed
completed: 2026-05-02
review:
  - review-1/synthesis.md (applied: 4 bugs, 5 hardening)
---

# Plan: Commit Workflow Error Handling for Ignored Paths and Partial Staging

## Context & Motivation

The `/commit push` workflow failed during its preparing phase after running a long `git add -- ...` command. Git reported that `claude/commands/yt` is ignored and suggested `git add -f` if the path should be tracked. The status bar showed `task 10 (10 failed)`, and inspection confirmed that no new commit or push happened: the latest commit remained `5ee7dfc`, while many files were left staged in the index.

The current commit workflow is driven by `claude/commands/commit.md`, `claude/agents/committer.md`, and the canonical instructions in `claude/shared/commit-instructions.md`. The instructions say ignored files are a valid reason to skip files, but they do not tell the committer how to recover when `git add` fails partway through a batch. This can leave the repo in a confusing partially staged state and make users unsure whether anything was committed.

This plan fixes the commit-agent instructions and final report semantics. It does **not** change the Pi status-bar/task display itself; improving status-bar wording such as `task 10 (10 failed)` is explicitly out of scope and can be handled by a separate UI/runtime plan if needed.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`, shell `/usr/bin/bash`).
- Shell: Bash, but instructions should remain portable and avoid Unix-only assumptions where possible.
- Do not destructively reset, checkout, restore, or unstage files without explicit user confirmation.
- The fix should update commit workflow instructions, not force-add ignored files automatically.
- The workflow must distinguish between staged/prepared, committed, and pushed states.
- Existing dirty/staged changes are present; this plan must not require cleaning or reverting them.
- Validation must be scoped to this plan’s intended files because the repository is already dirty.
- Commit command should remain concise for normal success paths.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Force-add ignored paths automatically with `git add -f` | Completes staging without interruption | Can accidentally commit ignored/generated/private files, violating repo safety rules | Rejected: user must explicitly approve force-adding ignored files |
| Ignore `git add` errors and continue committing staged subset | Minimizes interruptions | Creates misleading partial commits and hides missing files | Rejected: this is the failure mode to prevent |
| Abort on any `git add` failure and leave the index untouched | Simple and safe | The index may already be partially staged by Git before the error; user still needs clear recovery guidance | Partially selected: stop immediately, then report exact staged/unstaged state |
| Add explicit `git add` error handling and status verification to commit instructions | Preserves safety, explains partial state, prompts only when needed | Slightly more instruction complexity | **Selected** |
| Convert commit workflow into a dedicated script with structured errors | More testable and deterministic | Larger change, risks disrupting agent workflow during an already dirty session | Rejected for now; possible future hardening |
| Change status-bar/task runtime wording now | Directly addresses `task 10 failed` display | Separate UI/runtime concern, larger surface area than the immediate commit ambiguity | Rejected for this plan; document as out of scope |

## Objective

Harden the `/commit` workflow so that when staging fails because paths are ignored or otherwise rejected by Git, the committer stops before committing, reports what happened, shows current staged/uncommitted state, and asks the user whether to force-add, skip-and-continue, or abort. Successful commit runs must clearly report commit hashes and push status; failed preparing runs must clearly say no commit/push occurred unless verified otherwise.

## Project Context

- **Language**: Mixed dotfiles repo; relevant change is Markdown workflow instructions. Python/TypeScript files exist but are not part of this plan.
- **Test command**: `make test-quick` is the repo quick validation command; for this docs/instructions change, syntax/grep checks are sufficient unless executor chooses broader validation.
- **Lint command**: `make lint` exists; Markdown-only instruction edits can be validated by direct inspection and targeted grep.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add staging failure and outcome reporting instructions | 1 | mechanical | small | planner | -- |
| V1 | Validate wave 1 | -- | validation | small | validation-lead | T1 |

## Execution Waves

### Wave 1

**T1: Add staging failure and outcome reporting instructions** [small] -- planner
- Description: Update `claude/shared/commit-instructions.md` with one coherent instruction update covering staging failures, ignored paths, partial staging visibility, and final outcome reporting. Add a dedicated section, preferably titled `## Staging Failure Handling`, plus a reporting subsection or equivalent text. Do not change the status-bar/task runtime.
- Files: `claude/shared/commit-instructions.md`
- Acceptance Criteria:
  1. [ ] Dedicated staging failure instructions exist.
     - Verify: `grep -n "Staging Failure Handling\|staging failure handling" claude/shared/commit-instructions.md`
     - Pass: A dedicated heading or clearly labeled section exists.
     - Fail: Instructions are scattered across generic text; add a dedicated section.
  2. [ ] Non-zero `git add` stops the workflow before `git commit` unless the user explicitly resolves and retries/continues.
     - Verify: `grep -n "non-zero.*git add\|git add.*non-zero\|do not.*git commit\|must not.*commit" claude/shared/commit-instructions.md`
     - Pass: Text explicitly says not to commit a partial staged subset after `git add` failure unless the user chooses skip-and-continue or otherwise explicitly approves.
     - Fail: The committer could still continue silently with a partial staged subset.
  3. [ ] Ignored paths are handled by explicit user choice, not automatic force-add.
     - Verify: `grep -n "git add -f\|force-add\|ignored path\|ignored file" claude/shared/commit-instructions.md`
     - Pass: Text says force-add requires explicit user confirmation and warns that ignored files may be generated, private, or intentionally excluded.
     - Fail: Text permits automatic force-add or omits ignored-path handling.
  4. [ ] Failure reporting requires current state checks.
     - Verify: `grep -n "git status --short\|git diff --cached --name-status\|git log -1 --oneline" claude/shared/commit-instructions.md`
     - Pass: All three commands are named as checks before reporting failure state.
     - Fail: User would still be unclear whether files were staged, committed, or pushed.
  5. [ ] Failure report template is required.
     - Verify: `grep -n "Committed:\|Pushed:\|Staged changes remain:\|Blocked by:\|Next choices:" claude/shared/commit-instructions.md`
     - Pass: A template or required fields include all five labels.
     - Fail: Failure output may remain vague like `task failed`.
  6. [ ] User choices after ignored-path failure are explicit.
     - Verify: `grep -n "force-add.*skip.*abort\|skip-and-continue\|abort and leave" claude/shared/commit-instructions.md`
     - Pass: Text lists choices equivalent to force-add listed paths, skip listed paths and continue, or abort and leave state unchanged.
     - Fail: The committer still has to infer recovery behavior.
  7. [ ] A micro-scenario transcript exists for ignored-path failure.
     - Verify: `grep -n "Example.*ignored\|ignored-path.*example\|Committed: no" claude/shared/commit-instructions.md`
     - Pass: The instructions include a short example showing no commit/no push and the recovery choices.
     - Fail: Future agents lack a concrete pattern to follow.
  8. [ ] Successful and failed outcomes distinguish prepared/staged, committed, and pushed.
     - Verify: `grep -n "prepared\|staged\|committed\|pushed\|push status" claude/shared/commit-instructions.md`
     - Pass: Reporting guidance defines or clearly distinguishes these states.
     - Fail: Reporting can imply staged files were committed or pushed.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [small] -- validation-lead
- Blocked by: T1
- Checks:
  1. Run all T1 acceptance verification commands.
  2. Inspect `claude/shared/commit-instructions.md` around `Staging Failure Handling` and reporting guidance to ensure the text is coherent and not contradicted elsewhere.
  3. Confirm intended plan files changed without relying on a clean global worktree:
     - `git diff -- claude/shared/commit-instructions.md .specs/commit-error-handling/plan.md .specs/commit-error-handling/review-1/synthesis.md`
  4. Confirm no destructive index cleanup was performed by this plan:
     - `git status --short`
     - Pass condition is not a clean tree; pass condition is that there was no `git reset`, `git restore`, checkout, or unstage operation performed by the executor.
- On failure: create a fix task, update the instruction text, and re-run this validation gate.

## Dependency Graph

```text
Wave 1: T1 → V1
```

## Success Criteria

1. [ ] `/commit` instructions contain explicit non-zero `git add` handling.
   - Verify: `grep -n "non-zero.*git add\|git add.*non-zero\|must not.*commit" claude/shared/commit-instructions.md`
   - Pass: The staging section explains stop/report/ask behavior for failures.
2. [ ] Ignored files are not force-added automatically.
   - Verify: `grep -n "force-add\|git add -f\|ignored path" claude/shared/commit-instructions.md`
   - Pass: Force-add requires explicit user confirmation and includes a privacy/generated-file warning.
3. [ ] Failed preparing runs will clearly report that no commit/push occurred unless a commit hash proves otherwise.
   - Verify: `grep -n "Committed:\|Pushed:\|git log -1 --oneline\|push status" claude/shared/commit-instructions.md`
   - Pass: Reporting guidance prevents ambiguity like the current `task 10 failed` situation.
4. [ ] Existing staged work is preserved unless the user separately authorizes staging changes, committing, pushing, or cleanup.
   - Verify: `git status --short`
   - Pass: No destructive reset/restore/checkout/unstage was performed by this plan.
5. [ ] Status-bar/task display changes are documented as out of scope.
   - Verify: `grep -n "status-bar\|task 10\|out of scope" .specs/commit-error-handling/plan.md`
   - Pass: The plan explicitly says status-bar wording is not changed here.

## Handoff Notes

- The repo currently has many staged changes from the failed `/commit push` attempt. Do not run `git reset`, `git restore`, or similar cleanup as part of this plan without explicit user confirmation.
- `claude/commands/yt/ingest_video.py` is under an ignored path and caused the observed staging failure. The hardened workflow should ask whether to force-add or skip such paths rather than deciding automatically.
- This plan only improves the commit workflow instructions. After it is executed and validated, the user can retry `/commit push` or manually resolve the staged state.
