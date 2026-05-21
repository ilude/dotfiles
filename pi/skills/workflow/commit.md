Run `git status --short` to check uncommitted files. If the working tree is clean or merge conflicts exist, exit with an appropriate message.

Do not modify files as part of this workflow, except for adding auto-ignore patterns to `.gitignore` when the rules below require it. `/commit` stages, commits, and optionally pushes existing changes; it does not fix, refactor, format, or update code before committing.

Commit all legitimate uncommitted changes in the working tree. Do not skip files because they were changed in a previous task, by the user manually, or by another agent. If a file is uncommitted and matches the auto-stage rules below, it gets committed. The "never revert user changes" rule applies to destructive actions, not to committing via `/commit`.

Anti-patterns -- do not rationalize skipping files:
- "Not my changes" / "I didn't create this file"
- "Created by another agent" / "Created in a previous session"
- "Not part of this task" / "Not related to the current work"
- "Was already there before I started"
- "The user didn't ask me to commit this specific file"

The only valid reasons to skip a file:
- It matches an auto-ignore pattern
- The user explicitly said to skip it when asked
- It contains secrets
- It is in `.gitignore`

If `git status --short` shows untracked source code, documentation, or config files after your commit, the workflow is not finished. Stage and commit them.

Use `detect-secrets-hook` for secret scanning after staging each commit group and before `git commit`:

```bash
git diff --staged --name-only -z | xargs -0 detect-secrets-hook
```

If `.secrets.baseline` exists, include it:

```bash
git diff --staged --name-only -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline
```

If `detect-secrets-hook` is not installed, rely on the repository's existing commit hooks and do not create ad-hoc secret-scanning scripts. If the scanner or hook reports secrets, stop immediately and report the findings. Do not proceed with commits.

Categorize uncommitted files using this approach:
- Auto-ignore and add to `.gitignore`: `*.log`, `*.csv`, `*.tsv`, `*.db`, `*.sqlite`, `*.sqlite3`, large data files (`*.json` over 1 MB, `*.xml` data dumps)
- Auto-stage for commit: source code, documentation, configuration files, small JSON/YAML configs, test files, scripts, lockfiles, and intentional assets
- Ask the user only when: ambiguous data files that could be fixtures or user data, binary files not in `.gitignore`, unclear file types not covered above

When asking about unclear files, use batch prompting if there are multiple files. Show the list and ask "Track these files? (y/n/pattern)" where pattern allows specifying a `.gitignore` rule.

Group files by logical change using commit types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `style`, `chore`, `build`, `ci`, `deps`, `revert`. Related functionality changes go together. Do not mix unrelated changes. Each commit should do one thing.

For each group of related files:
1. Stage that group's files.
2. If staging exits non-zero, stop before creating a commit and report the error.
3. Run the `detect-secrets-hook` scan described above if it is installed.
4. Write a commit message that is human-style with natural grammar.
5. No emojis in commit messages.
6. Brief summary line with optional detailed body.
7. Create the commit.

After each commit, run `git status --short` again. If legitimate files remain, categorize and group them, then commit. Repeat until the working tree is clean or only explicitly skipped/ignored files remain.

Before declaring the workflow done, run a final completion check:

```bash
git status --short
```

If it prints anything, do not say the commit workflow is done. Instead, say outstanding changes remain, summarize each remaining path/category, and either continue committing them or ask the user what to do with ambiguous files.

If `$ARGUMENTS` contains `push`, run `git push` after all commits are complete. If push fails, report the exact error and do not claim completion.

Final reports must explicitly include:

```text
Prepared: yes/no
Committed: yes/no
Pushed: yes/no/not requested
```
