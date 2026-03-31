You are performing a smart git commit. Follow these steps exactly.

## Step 1: Understand the current state

Run `git status` to see what is staged, unstaged, and untracked.
Run `git diff --stat HEAD` to understand the scope of changes.

## Step 2: Secret scan

Before staging or committing anything, scan all staged and modified files for these patterns:

- `sk-` (OpenAI API keys)
- `AKIA` (AWS access key IDs)
- `-----BEGIN` (private keys / certificates)
- `ghp_` (GitHub personal access tokens)
- `github_pat_` (GitHub fine-grained PATs)
- `npm_` (npm tokens)
- `xoxb-` (Slack bot tokens)
- `xoxp-` (Slack user tokens)
- `eyJ` (base64-encoded JWTs — common credential carrier)
- `PASSWORD=` (hardcoded passwords)
- `TOKEN=` (hardcoded tokens)

If ANY of these patterns are found in files that would be included in the commit, STOP immediately.
Warn the user with the file name and matched pattern. Do not proceed until the user explicitly
resolves the finding and confirms it is safe to continue.

## Step 3: Stage changes carefully

Do NOT run `git add .` or `git add -A` blindly.

Instead:
- Use `git add -p` to interactively review and stage hunks, OR
- Use `git add <specific files>` for files you have already reviewed

If the user has specified particular files in their args, stage only those files.

## Step 4: Generate a conventional commit message

Review the staged diff with `git diff --cached` to understand exactly what is being committed.

Construct a commit message using conventional commit format:

  type(scope): short description

Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`

Rules:
- `type` must be one of the valid types above
- `scope` is optional but recommended when the change is localized (e.g., `api`, `auth`, `cli`)
- Description is imperative mood, lowercase, no trailing period, under 72 characters
- Add a body paragraph if the change is non-obvious or the "why" needs explanation

## Step 5: Confirm before committing

Show the proposed commit message to the user:

```
Proposed commit message:

  <type>(<scope>): <description>

  <optional body>
```

Ask: "Confirm this commit message? (yes to commit, no to revise)"

Do NOT run `git commit` until the user confirms.

## Step 6: Commit

Once confirmed, run:

  git commit -m "<message>"

If there is a body, use a heredoc or multiline -m to preserve formatting.

Report the resulting commit hash and summary line from git's output.
