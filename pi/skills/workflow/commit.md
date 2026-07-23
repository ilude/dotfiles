Run `git status --short` to check uncommitted files. If the working tree is clean or merge conflicts exist, exit with an appropriate message.

Do not modify files as part of this workflow, except for adding auto-ignore patterns to `.gitignore` when the rules below require it. `/commit` stages, commits, and optionally pushes existing changes; it does not fix, refactor, format, or update code before committing. Formatting fixes never touch migration files or other declared immutable paths; report those findings without rewriting the artifact.

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
- It contains secrets and its resolved `commit-secrets` Git attribute is not `allow`
- It is in `.gitignore`

If `git status --short` shows untracked source code, documentation, or config files after your commit, the workflow is not finished. Stage and commit them.

Resolve the `commit-secrets` Git attribute for candidate paths before secret review:

```bash
git check-attr -z commit-secrets -- <candidate-paths>
```

The exact value `allow` exempts that path from secret blocking. Missing, unset, bare-set, and other values do not. Do not add or change this attribute inside `/commit`; honor the repository policy already present in `.gitattributes` or Git's other attributes files.

Use `detect-secrets-hook` for paths without `commit-secrets=allow` after staging each commit group and before `git commit`. Disable Yelp detect-secrets `KeywordDetector` so the scan targets actual secret-shaped values instead of blocking on fixture words like `secret`, `key`, or `token`.

```bash
detect-secrets-hook --disable-plugin KeywordDetector <paths-without-commit-secrets-allow>
```

If `.secrets.baseline` exists, include it while keeping the same ruleset override:

```bash
detect-secrets-hook --baseline .secrets.baseline --disable-plugin KeywordDetector <paths-without-commit-secrets-allow>
```

If `detect-secrets-hook` is not installed, rely on the repository's existing commit hooks and do not create ad-hoc secret-scanning scripts.

If the scanner or hook reports findings after `KeywordDetector` is disabled, review each finding before stopping:
- Treat documented hashes, checksums, prompt hashes, model hashes, fixture/example values, redacted values, and clearly non-credential test data as false positives when the surrounding context proves they are not usable secrets.
- Prefer a repository baseline for stable false positives in generated or tracked data artifacts when comments are not legal for the file type, especially JSON. If `.secrets.baseline` exists, update it with the reviewed false positives and rerun the scan with `--baseline .secrets.baseline`. If no baseline exists and the false positives are clearly stable tracked artifacts, create one using `detect-secrets scan --disable-plugin KeywordDetector --baseline .secrets.baseline <affected paths>` and stage it with the commit group.
- Prefer inline allowlist comments only for source or documentation formats where comments are valid and the comment will not corrupt generated data.
- Stop immediately if any finding on a path without `commit-secrets=allow` is likely a real secret or remains ambiguous after context review. Report the path, line, detector, and reason.

Do not ask the user for false-positive approval when the context is clear and the baseline or allowlist update is the standard deterministic fix. After updating the baseline or allowlist, rerun the required scan and proceed only if it passes.

Categorize uncommitted files using this approach:
- Auto-ignore and add to `.gitignore`: `*.log`, `*.csv`, `*.tsv`, `*.db`, `*.sqlite`, `*.sqlite3`, large data files (`*.json` over 1 MB, `*.xml` data dumps)
- Auto-stage for commit: source code, documentation, configuration files, small JSON/YAML configs, test files, scripts, lockfiles, and intentional assets
- Ask the user only when: ambiguous data files that could be fixtures or user data, binary files not in `.gitignore`, unclear file types not covered above

When asking about unclear files, use batch prompting if there are multiple files. Show the list and ask "Track these files? (y/n/pattern)" where pattern allows specifying a `.gitignore` rule.

Group files by logical change using commit types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `style`, `chore`, `build`, `ci`, `deps`, `revert`. Related functionality changes go together. Do not mix unrelated changes. Each commit should do one thing.

Use a `wip: ...` save-point commit when preserving work before switching branches, syncing, rebasing, or other cross-branch work. Treat WIP commits as local and temporary unless the user explicitly asks to push them.

For each group of related files:
1. Stage that group's files.
2. If staging exits non-zero, stop before creating a commit and report the error.
3. Run the `detect-secrets-hook` scan described above on paths without `commit-secrets=allow` if it is installed.
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
