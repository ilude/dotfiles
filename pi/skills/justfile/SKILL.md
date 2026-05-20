---
name: justfile
description: "Justfile task-runner workflow patterns. Activate when editing justfile/Justfile files, discussing just recipes, just setup/test/build commands, cross-platform just behavior, Windows Git Bash vs WSL shell issues, dotenv handling, or developer command UX with just."
---

# Justfile Workflow

**Auto-activate when:** Working on `justfile`/`Justfile`, `just` recipes, `just setup`, `just test`, recursive just calls, `.env`/`.env.example` bootstrapping through just, or Windows shell behavior for just.

## Core Principle

A justfile is a developer/operator command surface. It should be predictable from PowerShell, Git Bash, Linux, and CI. Avoid hidden dependencies on the agent's shell environment. Do not use or assume WSL unless the user/repo explicitly states WSL is a requirement.

## Cross-Platform Shell Pattern

For Windows repos with Bash-heavy recipes, prefer explicit Git Bash on Windows and normal Bash elsewhere:

```just
set shell := ["bash", "-c"]
set windows-shell := ["C:/Program Files/Git/bin/bash.exe", "-c"]
```

Why:
- `set shell` covers Linux/macOS/CI.
- `set windows-shell` prevents PowerShell-launched `just` from accidentally using WSL `bash`.
- `-c` avoids loading user `.bash_profile`; use `-lc` only when login-shell behavior is required and tested.

Do **not** assume `bash` on Windows means Git Bash. It may resolve to WSL. Treat WSL as unsupported unless explicitly required; do not silently mix WSL paths, Docker access, permissions, or line-ending behavior into a Windows workflow.

## Recursive Just Calls

Inside recipes, bare `just other-recipe` can fail if the shell PATH differs from the parent process. Use Just's own executable path whenever one recipe invokes another:

```just
some-task:
    '{{just_executable()}}' other-task
```

On Windows with Git Bash, quoting the Windows path works when `windows-shell` is Git Bash:

```text
'C:\Users\...\just.exe' other-task
```

Avoid wrapper scripts unless path conversion is genuinely needed. First try `windows-shell` + `{{just_executable()}}`.

## Dotenv / Setup Pattern

Use `.env.example` as the committed template and `.env` as local ignored state. Do not enable implicit dotenv loading by default; prefer explicit setup/bootstrap scripts and let tools like Docker Compose load `.env` only where expected.

Good `setup` behavior:
- create `.env` from `.env.example` if missing;
- generate values for known `changeme` secrets;
- on existing `.env`, append newly added template keys;
- never overwrite existing developer values;
- never delete removed/renamed keys automatically;
- clearly report generated vs kept values.

This supports:

```text
git pull
just up
```

without forcing developers to delete `.env` when new config keys are added.

## Secrets and Defaults

Keep real secrets out of committed justfiles and `.env.example`.

Allowed in `.env.example`:
- local-only defaults like hostnames;
- documented placeholder URLs;
- non-secret usernames;
- known dev keystore passwords only if they intentionally match baked local test assets.

For secret-like fields:
- use `changeme` plus setup generation; or
- read from existing `.env`/CI variables; or
- use explicit placeholders that fail fast.

If a config payload needs a password, template the payload and render from env at runtime. Do not hardcode the secret in JSON/XML checked into git.

## Recipe Design Guidelines

- Keep top-level recipes stable: `setup`, `build`, `up`, `down`, `test`, `lint`.
- Put complex logic in scripts when recipes exceed a few lines or need tests.
- Use targeted recipes (`test-config-runner`, `test-integration`) and route through `test target="all"`.
- Make `lint` safe and non-mutating.
- Use Docker for tool isolation where possible, but be careful with Windows path conversion.
- Keep public recipes short, stable verbs (`setup`, `up`, `down`, `test`, `lint`, `build`); hide or clearly label helper recipes.
- Use parameterized recipes for simple orchestration; move complex branching, parsing, or testable logic into scripts.
- Recursive calls should usually go through public recipe APIs rather than private implementation helpers.
- For Docker volume mounts under Git Bash/MSYS path-conversion cases, use:

```just
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/path:/mnt/path:ro" ...
```

If Docker needs a Windows-native mount source, prefer an explicit Windows path or `pwd -W`; do not apply `MSYS_NO_PATHCONV=1` blindly to every Windows command.

## CI Checklist

For recipes used in CI:
- no interactive prompts;
- no implicit local `.env` dependency;
- no host-specific absolute paths;
- deterministic exit codes;
- commands work from the repo root;
- Docker/tool availability fails with a clear message.

## Anti-Patterns

- Relying on whatever `bash` happens to be on Windows PATH.
- Using WSL implicitly when the team does not require WSL.
- Requiring developers to delete `.env` for new template keys.
- Overwriting existing `.env` values during setup.
- Moving non-secret local tool paths into `.env` unless explicitly requested and necessary.
- Bundling unrelated command-surface changes into feature commits without calling them out.

## Quick Checks

When editing a justfile on Windows:

```powershell
just --list
just test config-runner
```

Also verify from Bash/Linux if relevant:

```bash
just --list
just test config-runner
```

When setup changes:

```bash
# temp-dir smoke test
mkdir /tmp/setup-check
cp .env.example /tmp/setup-check/.env.example
mkdir /tmp/setup-check/scripts
cp scripts/setup_env.py /tmp/setup-check/scripts/setup_env.py
(cd /tmp/setup-check && python scripts/setup_env.py && python scripts/setup_env.py)
```
