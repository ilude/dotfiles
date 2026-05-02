Run git status to check uncommitted files. If working tree is clean or merge conflicts exist, exit with appropriate message.

## Pre-commit Hook Optimization

Before creating any commits, check if a pre-commit hook exists and will run tests:
1. Check if `git config core.hooksPath` is set, or if `.git/hooks/pre-commit` exists
2. If a hook exists, run the test suite ONCE now (e.g., `make test-quick` or the project's test command)
3. If tests fail, stop and report the failure - do not proceed with commits
4. If tests pass, use `--no-verify` flag on all subsequent git commit commands to skip redundant hook runs

This ensures tests run exactly once for multi-commit operations instead of once per commit.

Check for git-crypt encrypted files by reading .gitattributes if it exists. Parse lines with "filter=git-crypt" to identify encrypted file patterns. These files will be skipped during security scanning since they're encrypted before pushing.

Scan all non-encrypted modified and untracked files for secrets. Look for:
- Secret files: .env, credentials.json, secrets.yaml, *.pem, *.key, *.p12, *.pfx
- AWS keys: AKIA, ABIA, ACCA, ASIA prefixes
- GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_
- Anthropic keys: sk-ant-
- OpenAI keys: sk-proj-, sk-
- Generic API keys: API_KEY=, APIKEY=, api_key=
- Tokens: TOKEN=, ACCESS_TOKEN=, Bearer
- Passwords: PASSWORD=, pwd=, passwd=, secret=
- Private keys: -----BEGIN PRIVATE KEY-----, -----BEGIN RSA, -----BEGIN OPENSSH
- Connection strings: mongodb://, postgres://, mysql://

If secrets are found, STOP immediately. Show details and suggest adding files to .gitignore. Do not proceed with commits.

Commit ALL uncommitted changes in the working tree. Do not skip files because they were changed in a previous task, by the user manually, or by another agent. If a file is uncommitted and matches the auto-stage rules below, it gets committed. The "never revert user changes" rule applies to destructive actions (restore, checkout, discard) — not to committing via /commit.

## Anti-patterns — DO NOT rationalize skipping files

These are INVALID reasons to skip an untracked or modified file:
- "Not my changes" / "I didn't create this file"
- "Created by another agent" / "Created in a previous session"
- "Not part of this task" / "Not related to the current work"
- "Was already there before I started"
- "The user didn't ask me to commit this specific file"

The ONLY valid reasons to skip a file:
- It matches an auto-ignore pattern (*.log, *.csv, *.db, etc.)
- The user explicitly said to skip it when asked
- It contains secrets (detected by the security scan)
- It's in .gitignore

If git status shows untracked source code, documentation, or config files after
your commit, you have NOT finished the /commit workflow. Stage and commit them.

Categorize uncommitted files using this approach:
- Auto-ignore and add to .gitignore: *.log, *.csv, *.tsv, *.db, *.sqlite, *.sqlite3, large data files (*.json over 1MB, *.xml data dumps)
- Auto-stage for commit: Source code files (*.py, *.js, *.ts, etc.), documentation (*.md, *.rst, *.txt), configuration files (pyproject.toml, package.json, Dockerfile, docker-compose.yml), small JSON/YAML configs, test files
- Ask the user only when: Ambiguous data files that could be fixtures or user data, binary files not in .gitignore, unclear file types not covered above

When asking about unclear files, use batch prompting if there are multiple files. Show the list and ask "Track these files? (y/n/pattern)" where pattern allows specifying a .gitignore rule.

Group files by logical change using commit types: feat (new features), fix (bug fixes), docs (documentation), test (tests), refactor (code improvements), perf (performance), style (formatting), chore (maintenance), build (build system), ci (CI/CD), deps (dependencies), revert (undo previous). Related functionality changes go together. Don't mix unrelated changes. Each commit should do ONE thing (atomic commits).

For each group of related files:
1. Stage the files with git add
2. If `git add` exits non-zero, follow **Staging Failure Handling** below immediately. Do not run `git commit` after a non-zero `git add` unless the user explicitly resolves the failure and chooses to retry or skip-and-continue.
3. Write a commit message that is human-style with natural grammar
4. NO emojis in commit messages
5. Brief summary line with optional detailed body
6. Use HEREDOC format for multi-line messages: git commit --no-verify -m "$(cat <<'EOF'\ntype: summary\n\nOptional details\nEOF\n)"
7. Create the commit (use --no-verify since tests already ran in the pre-commit optimization step)
8. For intermediate commits (more groups remain after this one), prefix with `COMMIT_GUARD_BATCH=1` to suppress the commit-guard hook. Only the FINAL commit should run without this prefix so the guard can verify no files were missed.

## Staging Failure Handling

If any `git add` command exits non-zero, stop the commit workflow before creating a commit. Do not commit whatever subset may already be staged from the failed command unless the user explicitly chooses to skip-and-continue or otherwise approves continuing with the partial staged state.

When staging fails:
1. Capture and show the `git add` error.
2. Run and summarize:
   - `git status --short`
   - `git diff --cached --name-status`
   - `git log -1 --oneline`
3. If the error mentions an ignored path or ignored file, explain that force-adding ignored files with `git add -f` may commit generated, private, or intentionally excluded files.
4. Ask the user to choose exactly one recovery action:
   - force-add the listed paths with `git add -f` and retry staging
   - skip the listed paths and skip-and-continue with the remaining intended files
   - abort and leave the staged/working-tree state unchanged
5. Do not run `git reset`, `git restore`, checkout, unstage, or cleanup commands unless the user explicitly asks for that destructive or state-mutating recovery.

Use this failure report template for staging failures:

```text
Committed: no
Pushed: no
Staged changes remain: yes/no — summarize `git diff --cached --name-status`
Blocked by: <git add error, ignored path, or other staging failure>
Next choices: force-add listed paths / skip-and-continue / abort and leave state unchanged
```

Example ignored-path failure:

```text
Committed: no
Pushed: no
Staged changes remain: yes — some files were staged before git rejected an ignored path
Blocked by: git add refused ignored path claude/commands/yt/ingest_video.py
Next choices: force-add listed paths with git add -f after confirmation / skip-and-continue without that ignored path / abort and leave state unchanged
```

## Outcome Reporting

Distinguish prepared/staged, committed, and pushed states in the final report:
- `prepared` or `staged` means files are in the index only; it does not mean they were committed.
- `committed` means `git commit` succeeded and a commit hash was produced or verified with `git log -1 --oneline`.
- `pushed` means `git push` succeeded after the commits were created.

Report commit hashes only for commits that actually succeeded. If commit succeeds but push fails, list the commit hashes and report the push status separately as failed. If staging or preparation fails before any commit, say that no commit or push occurred unless command output proves otherwise.

After each commit, run git status again. If legitimate files remain (not matching the auto-ignore patterns), categorize and group them, then commit. Repeat this loop until git status shows only ignored files or working tree is clean.

Exit the loop when:
- Working tree is clean
- Only files matching .gitignore patterns remain
- User says to stop when prompted about unclear files

Show a brief summary of commits created with commit hashes and messages.

If $ARGUMENTS contains "push", run git push after all commits are complete. Otherwise, stop after creating commits without pushing.
