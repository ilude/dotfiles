You are performing `/commit` for Pi. Use the fast, flexible shell-driven workflow below. Arguments: `$ARGUMENTS`

Core contract:
- Commit all legitimate uncommitted changes. Do not skip files because of provenance, task ownership, or because they were changed earlier.
- Never refuse because the worktree is large or mixed. Split into logical commits and continue until clean or explicitly blocked.
- If arguments include `push`, push after all commits succeed.
- If arguments include file/path tokens, limit the first commit pass to those paths, then check status and continue with remaining legitimate changes unless the user explicitly meant only those paths.
- Use normal git commands, not Pi structured commit mutation tools.

Workflow:

1. Inspect state
   - Run `git status --short`.
   - If clean, report clean and stop.
   - If merge conflicts exist, report them and stop.
   - Use direct git commands only. Do not run helper scripts for planning.

2. Classify files
   - Auto-stage source, tests, docs, project config, small JSON/YAML, lockfiles, scripts, and intentional assets.
   - Auto-ignore generated/runtime data such as logs, caches, databases, temporary files, large data dumps, and machine-local state.
   - Ask only for ambiguous files: unclear binary/data files or possible fixtures vs user data.
   - Never force-add ignored files unless the user explicitly approves that exact recovery.

3. Secret scan before committing
   - Check `.gitattributes` for `filter=git-crypt` and skip encrypted paths.
   - Scan all files intended for commit for obvious secret file names and token/key/password/private-key patterns.
   - If a likely or ambiguous secret is found, stop before committing and report path, pattern, and reason.

4. Plan logical commits
   - Group by one coherent change per commit.
   - Prefer one commit when changes are one coherent unit, even if many files are involved.
   - Split unrelated changes by feature/fix/docs/tests/chore or by subsystem.
   - Use conventional commit subjects: `type(scope): description`.
   - Keep messages human, specific, no emojis, no trailing period.

5. Commit loop
   - For each group, stage exact paths with `git add -- <paths>` or `git add -A -- <paths>` when deletions are included. Avoid broad `git add .` unless the group intentionally covers the whole safe worktree.
   - Run `git diff --cached --check` before commit.
   - Ensure the subject matches `type(scope): description` with one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`, or `wip`.
   - Commit with `git commit -m "<subject>"` and `-m "<body>"` when a body helps.
   - Do not use `--no-verify` unless the repo instructions explicitly require it.
   - After each commit, run `git status --short` and continue until clean or only explicitly skipped/ignored files remain.

6. Push and report
   - If args include `push`, run `git push` after all commits succeed.
   - Final report must include:
     - `Prepared: yes/no`
     - `Committed: yes/no`
     - `Pushed: yes/no/not requested`
     - commit hashes and subjects for successful commits
     - final `git status --short` result

If any staging, commit, hook, validation, or push command fails, stop. Report exactly what happened, whether anything is staged, whether any commits were created, and the next safe choices.
