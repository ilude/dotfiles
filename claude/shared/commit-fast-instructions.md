Fast single-commit path. Use when the working tree is one logical change and you want minimum ceremony. For dirty trees with multiple unrelated changes, use `/commit` instead.

## Step 1: State

Run `git status` and `git diff --stat HEAD`. If the tree is clean or merge conflicts exist, exit with a message.

## Step 2: Secret scan

Scan staged and modified files (skip git-crypt encrypted paths from `.gitattributes`) for:

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

If a likely real secret is found, STOP. Show file, pattern, and reason. Do not proceed without explicit user resolution.

## Step 3: Stage

If the user named files in $ARGUMENTS, stage only those. Otherwise stage what is already in the index plus the modified-tracked files reviewed in Step 1. Do NOT run `git add .` or `git add -A`. Do NOT auto-stage untracked files in this fast path -- if there are untracked files that should be committed, tell the user and suggest `/commit` instead.

## Step 4: Message

Review `git diff --cached`. Construct a conventional commit message:

  type(scope): short description

Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`

- Imperative mood, lowercase, no trailing period, under 72 characters
- Scope optional but preferred when localized
- Add a body paragraph only if the why is non-obvious
- No emojis, no AI-attribution lines

## Step 5: Confirm

Show the proposed message and ask: "Confirm? (yes / no / revise)". Do not commit until the user confirms.

## Step 6: Commit

Run `git commit -m "<message>"` (use a HEREDOC for multi-line bodies). Do NOT pass `--no-verify` -- if a pre-commit hook fails, fix the root cause and retry.

Report the commit hash and summary.

If $ARGUMENTS contains "push", run `git push` after the commit succeeds.
