---
date: 2026-05-02
status: synthesis-complete
---

# Review: Commit Workflow Error Handling for Ignored Paths and Partial Staging

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Completeness reviewer | reviewer | Plan explicitness reviewer | Mandatory reviewer for ambiguous instructions and weak verification | Assume an executor has no conversation context and follows only the plan |
| Security reviewer | security-reviewer | Commit safety and data exposure reviewer | Mandatory reviewer for ignored/private file and destructive git risks | Assume the workflow accidentally commits ignored/private files or hides partial state |
| Simplicity reviewer | product-manager | Scope and user-confusion reviewer | Mandatory reviewer for whether the plan solves the actual user problem simply | Assume the plan over-documents internals but still leaves the user confused |
| Git reliability expert | devops-pro | Git workflow reliability reviewer | Commit/push staging is operational workflow with partial failure states | Assume `git add`, `git commit`, or `git push` fails mid-flow and state reporting is wrong |
| Validation expert | qa-engineer | Acceptance-test realism reviewer | The plan relies mostly on grep checks over Markdown instructions | Assume grep passes on vague text while the committer behavior remains broken |
| UX expert | ux-researcher | User-facing recovery-message reviewer | The original problem was unclear status-bar outcome after failure | Assume technically correct output still fails to answer “was anything committed or pushed?” |

> Note: the subagent panel failed to launch in this session with no reviewer output. This synthesis is based on direct plan/code inspection.

## Standard Reviewer Findings
### reviewer
- T1 and T2 are marked parallel but edit the same file, which invites conflicts and violates the plan’s own same-wave independence requirement.
- The validation gate includes “confirm no unrelated files were edited” even though the repository already has many staged/dirty files; this is not executable as written.
- Grep-based acceptance criteria are too weak to prove the intended workflow behavior.

### security-reviewer
- The plan correctly rejects automatic `git add -f`, but it does not require the user prompt to show why each ignored path is ignored or distinguish ignored generated state from source files.
- The plan says not to destructively reset/unstage, but does not explicitly tell the committer not to clean up partial staging after a failed `git add` unless the user approves.
- The plan should require reporting `git diff --cached --name-status` after failure so staged sensitive/private files are visible before any commit.

### product-manager
- The plan may be heavier than needed for a one-file instruction change, but a small plan is acceptable because the repo is currently partially staged.
- The actual user confusion is the status-bar wording “task 10 failed”; the plan only hardens committer reporting, not the status bar/task layer. That is acceptable only if documented as out of scope.
- A simpler fix is to add one “Staging failures” section plus one “Outcome reporting” section, not redesign `/commit`.

## Additional Expert Findings
### devops-pro
- The plan needs a precise state machine: staging failed before commit, commit succeeded/push failed, commit failed after staging, and push succeeded.
- It should require checking `git status -sb`, `git diff --cached --name-status`, and recent `git log -1` before claiming no commit/push occurred.
- It should specify that non-zero `git add` means no commit should be attempted in that run unless the user explicitly resolves and retries.

### qa-engineer
- Current grep commands can pass if the words exist anywhere, even in examples or rejected alternatives.
- Validation should inspect a dedicated section heading such as `## Staging failure handling` or equivalent in the instruction file.
- A lightweight simulated command transcript in the instructions would improve verifiability without writing a full script.

### ux-researcher
- The failure report should include a short, consistent template: “Committed: no”, “Pushed: no”, “Staged changes remain: yes/no”, “Blocked by: ignored paths”.
- User choices should be explicit: force-add listed paths, skip listed paths and continue, abort and leave state unchanged.
- The plan should require warning language for force-add: ignored files may be generated, private, or intentionally excluded.

## Suggested Additional Reviewers
- `devops-pro` -- relevant for Git staging/commit/push state transitions and partial-failure recovery.
- `qa-engineer` -- relevant because the plan’s acceptance criteria are grep-based and could be false positives.
- `ux-researcher` -- relevant because the user-facing failure report is the actual pain point.

## Bugs (must fix before execution)
1. **T1 and T2 are incorrectly parallel while editing the same file.** Both tasks update `claude/shared/commit-instructions.md`; parallel execution risks conflicting edits and violates the plan’s same-wave independence rule. Make T2 depend on T1 or merge them into one task.
2. **Validation gate is not executable in the current dirty repository.** “Confirm no unrelated files were edited” is ambiguous and likely impossible because the repo already has many staged/dirty files. It should compare the specific plan-intended files or use `git diff -- claude/shared/commit-instructions.md .specs/commit-error-handling/plan.md` rather than global status.
3. **Acceptance criteria can pass without proving behavior.** Grep checks for broad words like `staged`, `pushed`, and `git add` may match existing text or rejected alternatives. Require a dedicated instruction section and specific phrases/state-template checks.
4. **The plan does not explicitly mark status-bar/task failure handling as out of scope.** The triggering user asked what “task 10 failed” means; this plan only fixes commit-agent instructions. Either add an out-of-scope note or include a task for command/status reporting.

## Hardening
1. Add a required failure-report template with fields: `Committed`, `Pushed`, `Staged changes remain`, `Blocked by`, `Next choices`.
2. Require the staging-failure section to mention `git status --short`, `git diff --cached --name-status`, and recent `git log -1 --oneline` checks.
3. Require the prompt for ignored paths to explain that force-adding may commit generated/private files.
4. Add a micro-scenario transcript for ignored path failure to guide future commit-agent behavior.
5. Clarify that after non-zero `git add`, the committer must not continue to commit the partial staged subset unless the user explicitly chooses to skip/continue.

## Simpler Alternatives / Scope Reductions
1. Merge T1 and T2 into one small task: “Add staging failure and outcome reporting sections.”
2. Skip subagent-style parallelism entirely for this one-file Markdown instruction edit.
3. Defer a full scripted commit wrapper; instruction hardening is enough for the immediate problem.

## Contested or Dismissed Findings
1. **Dismissed: implement a dedicated commit script now.** It would be more testable, but it is disproportionate while the immediate failure can be addressed in one instruction file.
2. **Dismissed: force-add ignored paths by default.** This would hide the error but risks committing intentionally ignored or private files.
3. **Downgraded: status bar itself must be fixed now.** The status-bar wording is part of the confusion, but commit-agent reporting can address the immediate ambiguity. The plan should explicitly call status-bar changes out of scope or as a follow-up.

## Verification Notes
1. Same-file parallelism verified in the plan: T1 and T2 both list `claude/shared/commit-instructions.md` under Files and both are in “Wave 1 (parallel)”.
2. Dirty-repo validation issue verified with current `git status -sb`, which shows many staged modifications from the failed commit attempt.
3. Weak grep validation verified in acceptance criteria: checks search broad alternatives such as `prepared\|staged\|committed\|pushed` and `git add`, which can match unrelated or existing text.
4. Status-bar scope gap verified in Context & Motivation: it mentions `task 10 (10 failed)`, but no task or out-of-scope note addresses status-bar behavior.

## Review Artifact
Wrote full synthesis to: `.specs/commit-error-handling/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the review fixes to the plan.
- Then execute via `/do-it .specs/commit-error-handling/plan.md`.

Apply options:

1. Apply bugs only (Recommended — 4 fixes, all mechanical edits to the plan)
2. Apply bugs + selected hardening — pick which
3. Apply everything (bugs + 5 hardening)
4. No changes — review only

Next-step command:
`/do-it .specs/commit-error-handling/plan.md`

How do you want to proceed?
