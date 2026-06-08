---
name: shell
description: Shell scripting, CLI development, Bash, PowerShell, Makefiles, and cross-platform tooling. Activate when working with .sh, .bash, .ps1, Makefile files or discussing shell/CLI patterns.
---

# Shell Script Workflow

Compact index for shell, PowerShell, Makefile, and CLI work. Load linked files for platform-specific details.

## Auto-activate when

- Editing `.sh`, `.bash`, `.zsh`, `.ps1`, `Makefile`, `justfile`, install scripts, CLI wrappers, or shell test files.
- Discussing Bash, zsh, PowerShell, POSIX portability, shfmt, shellcheck, Bats, winget, or cross-platform command UX.
- Do not use for Dockerfile-only or Python/Node CLIs unless shell wrappers are involved.

## Project-specific rules

- Dotfiles install flow must stay idempotent.
- Use LF line endings only.
- Git Bash/MSYS2 zsh handoff must pass `ZDOTDIR` through `env`.
- Prefer `${ZDOTDIR:-$HOME}` over raw `~`/`$HOME` when path resolution crosses Git Bash/MSYS2 boundaries.
- On Windows-native tasks, prefer PowerShell; for POSIX tooling and git, prefer bash.
- Do not add fallback logic that hides missing dependencies; fail explicitly.

## Practical steps

1. Identify target shell/platform and existing helper conventions.
2. Keep scripts small, quoted, idempotent, and deterministic.
3. Preserve strict-mode and logging style already present in the file.
4. Validate with shellcheck/shfmt or PowerShell parser/tests as appropriate.

## Quick validation

| Context | Commands |
|---|---|
| Repo shell lint | `make lint` |
| ShellCheck direct | `shellcheck <script>` |
| shfmt check | `shfmt -d <script>` |
| PowerShell syntax | `pwsh -NoProfile -Command '$null = [scriptblock]::Create((Get-Content -Raw <path>))'` |
| Repo quick tests | `make test-quick` |

## Anti-patterns

- Assuming Bash features in POSIX scripts or Windows paths in MSYS2/WSL scripts.
- Unquoted variables, unsafe temp files, or broad globs in cleanup.
- Replacing a platform-specific path convention without checking install/Dotbot mirror rules.
- Adding interactive prompts to automation paths unless explicitly requested.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [cli-development.md](cli-development.md), [cross-platform.md](cross-platform.md), [powershell.md](powershell.md), [makefile.md](makefile.md), [tools.md](tools.md), [bats.md](bats.md), [winget.md](winget.md).
