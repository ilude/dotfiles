You are performing a fast single-commit. Use this when the working tree is one logical change. For dirty trees with multiple unrelated changes, use `commit` instead.

Commit planning should use a small/mini model by default.

## Step 1: State

Run `git status` and `git diff --stat HEAD`. If the tree is clean or merge conflicts exist, exit with a message.

## Step 2: Secret scan

Skip git-crypt encrypted paths (read `.gitattributes`, ignore lines with `filter=git-crypt`).

Scan staged and modified files for:

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

Use a small/mini LLM to triage candidates as real secret / fixture / ambiguous. If real or ambiguous, STOP. Show the file, pattern, and reason.

## Step 3: Stage

If the user named files in args, stage only those.

Otherwise auto-stage everything in the working tree (modified, deleted, AND untracked) EXCEPT files matching industry-standard ignore patterns. Those go into `.gitignore` instead of being committed.

Industry-standard ignore patterns (add to `.gitignore`, do not stage):

- Build/output: `node_modules/`, `dist/`, `build/`, `target/`, `out/`, `.next/`, `.nuxt/`, `.cache/`, `.parcel-cache/`, `coverage/`, `*.pyc`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `.tox/`, `*.class`, `*.o`, `*.obj`, `*.exe`, `*.dll`, `*.so`, `*.dylib`
- Env/IDE: `.env`, `.env.*` (except `.env.example`), `.venv/`, `venv/`, `.idea/`, `.vscode/` (unless project commits it), `*.swp`, `*.swo`, `.DS_Store`, `Thumbs.db`
- Logs/data: `*.log`, `*.csv`, `*.tsv`, `*.db`, `*.sqlite`, `*.sqlite3`, `npm-debug.log*`, `yarn-debug.log*`, `yarn-error.log*`, `pnpm-debug.log*`
- Lock-adjacent noise: `.turbo/`, `.eslintcache`, `.stylelintcache`

Do NOT run `git add .` or `git add -A`. Stage by explicit path list. If you add anything to `.gitignore`, stage `.gitignore` itself with the commit.

If a file is genuinely ambiguous (binary, unfamiliar extension, possible fixture vs. user data), ask the user before staging or ignoring.

## Step 4: Message

Review `git diff --cached`. Build a conventional commit message:

  type(scope): short description

Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`

- Imperative mood, lowercase, no trailing period, under 72 characters
- Scope optional but preferred when localized
- Body paragraph only when the why is non-obvious
- No emojis

## Step 5: Confirm

Show the proposed message and ask: "Confirm? (yes / no / revise)". Do not commit until the user confirms.

## Step 6: Commit

Run `git commit -m "<message>"` (HEREDOC for multi-line bodies). Do NOT pass `--no-verify` -- the commit-guard extension blocks it anyway, and pre-commit hook failures should be fixed at the root.

Report the commit hash and summary line.
