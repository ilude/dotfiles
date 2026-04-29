You are performing a smart git commit. This path handles dirty trees with multiple unrelated changes by splitting them into atomic conventional commits. For a single logical change, prefer `commit-fast`.

When commit planning uses an LLM, prefer a small/mini model by default. Commit planning should stay cheap and deterministic unless there is a concrete reason to escalate.

## Step 1: Understand the current state

Run `git status` to see what is staged, unstaged, and untracked.
Run `git diff --stat HEAD` to understand the scope of changes.

If the working tree is clean or merge conflicts exist, exit with an appropriate message.

## Step 2: Secret scan

Skip git-crypt encrypted paths: read `.gitattributes` if it exists and ignore any path whose pattern carries `filter=git-crypt`. Those files are encrypted before push.

two-step secret review on the remaining staged and modified files:

1. deterministic pattern matching to extract candidate findings.
2. A small/mini LLM evaluates each candidate in context and classifies it as: likely real secret / example or fixture / ambiguous.

Patterns to match:

- Secret files: `.env`, `credentials.json`, `secrets.yaml`, `*.pem`, `*.key`, `*.p12`, `*.pfx`
- AWS keys: `AKIA`, `ABIA`, `ACCA`, `ASIA`
- GitHub tokens: `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`
- Anthropic keys: `sk-ant-`
- OpenAI keys: `sk-proj-`, `sk-`
- Slack tokens: `xoxb-`, `xoxp-`
- npm tokens: `npm_`
- JWTs: `eyJ`
- Generic: `API_KEY=`, `TOKEN=`, `PASSWORD=`, `Bearer`
- Private keys: `-----BEGIN`
- Connection strings: `mongodb://`, `postgres://`, `mysql://`

If the LLM classifies a candidate as a likely real secret, or it remains ambiguous, STOP immediately. Warn the user with file name, matched pattern, and short reason. Do not proceed until the user explicitly resolves the finding.

## Step 3: Categorize uncommitted files

Commit ALL uncommitted changes in the working tree. Do not skip files because they were changed by the user manually, by another agent, or in a previous session. If a file is uncommitted and matches the auto-stage rules below, it gets committed.

### Anti-patterns -- DO NOT rationalize skipping files

These are INVALID reasons to skip a file:

- "Not my changes" / "I didn't create this file"
- "Created by another agent" / "Created in a previous session"
- "Not part of this task" / "Not related to the current work"
- "Was already there before I started"
- "The user didn't ask me to commit this specific file"

The ONLY valid reasons to skip a file:

- Matches an auto-ignore pattern below
- User explicitly said to skip it when asked
- Contains secrets (detected in Step 2)
- Listed in `.gitignore`

If `git status` after this command shows untracked source code, docs, or config still present, the workflow is NOT finished.

### Categorization rules

- **Auto-ignore and add to `.gitignore`:** `*.log`, `*.csv`, `*.tsv`, `*.db`, `*.sqlite`, `*.sqlite3`, large data files (`*.json` over 1 MB, `*.xml` data dumps).
- **Auto-stage:** source files (`*.py`, `*.js`, `*.ts`, etc.), docs (`*.md`, `*.rst`, `*.txt`), config (`pyproject.toml`, `package.json`, `Dockerfile`, `docker-compose.yml`), small JSON/YAML configs, test files.
- **Ask the user:** ambiguous data files that could be fixtures or user data, binary files not in `.gitignore`, unclear file types.

When asking, batch-prompt: list the files and ask "Track these files? (y/n/pattern)" where pattern is a `.gitignore` rule.

## Step 4: Group into atomic commits

Group related files by logical change using conventional commit types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`. Related functionality changes go together. Do not mix unrelated changes. Each commit should do ONE thing.

For each group:

1. Stage only that group's files with `git add <files>` (no `git add .` / `git add -A`).
2. Review `git diff --cached`.
3. Build a conventional commit message:
   ```
   type(scope): short description

   <optional body>
   ```
   - Imperative mood, lowercase, no trailing period, under 72 characters
   - Scope optional but preferred when localized
   - Body when the why is non-obvious
   - No emojis
4. Show the proposed message to the user. Ask: "Confirm? (yes / no / revise / skip)".
5. On `yes`, run `git commit -m "<message>"` (HEREDOC for multi-line bodies). Do NOT pass `--no-verify` -- the commit-guard extension blocks it. If a pre-commit hook fails, fix the root cause and retry.
6. Report the commit hash.

## Step 5: Loop until clean

After each commit, run `git status` again. If legitimate files remain (not matching auto-ignore patterns), repeat from Step 3 for the remainder.

Exit when:

- Working tree is clean
- Only files matching `.gitignore` patterns remain
- User said `skip` or `stop` for the remaining unclear files

## Step 6: Summary

Show a brief list of commits created with their hashes and summary lines.

If args contain `push`, run `git push` after all commits succeed. Otherwise stop without pushing.
