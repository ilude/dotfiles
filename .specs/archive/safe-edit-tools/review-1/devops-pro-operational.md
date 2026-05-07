---
reviewer: devops-pro-operational
status: changes_requested
---

## Finding 1

severity: high  
evidence: Rollback command includes `.specs/safe-edit-tools/plan.md` but omits newly created reviewer/archive artifacts and any registration files outside the named directories. It also uses `git restore`, which cannot remove untracked files created during implementation/tests.  
required_fix: Add explicit rollback for tracked and untracked intended paths, including `git restore -- <tracked paths>` plus safe removal of only known generated/untracked files, and require `git status --short` evidence after rollback.

## Finding 2

severity: high  
evidence: Preflight only records status; it does not define a dirty-worktree policy. A partial implementation could mix plan changes with pre-existing user edits, then rollback or validation could overwrite/confuse unrelated work.  
required_fix: Require `/do-it` to capture `git status --short` before edits, abort or get confirmation if relevant files are dirty, and preserve/report any pre-existing unrelated changes separately.

## Finding 3

severity: medium  
evidence: Safety requirements mention ignored paths, tracked files, secrets, `.env`, and broad globs, but acceptance criteria only verify `.env` and directory rejection. No check proves ignored/untracked/tracked behavior or path traversal safety.  
required_fix: Add acceptance criteria and tests for ignored paths via `git check-ignore`, untracked/tracked policy, path traversal/outside-repo rejection, and broad glob refusal or explicit dry-run requirement.

## Finding 4

severity: medium  
evidence: Validation commands run `pnpm install --frozen-lockfile` in `pi/extensions` and `pi/tests` without stating lockfile mutation checks or dependency-install side effects. Failed installs can leave `node_modules` state changes or unexpected lockfile diffs.  
required_fix: Require post-install `git status --short` checks proving lockfiles/package manifests were not modified, and document that `node_modules`/cache changes are ignored operational state not plan artifacts.

## Finding 5

severity: medium  
evidence: Evidence capture is mostly “in `/do-it` transcript”; final gates ask for evidence paths or summaries but no durable location/format is defined. After partial validation failure, resume state may lack exact commands, exits, and changed-file evidence.  
required_fix: Require an execution log section or artifact under the spec directory recording command, exit code, summary, and timestamp for each gate, plus final `git diff --stat` and `git status --short`.
