# AGENTS.md

Neutral onboarding for coding agents working in this repository. This file covers repo-wide behavior only. Client-specific runtime details live in the client directories, especially `claude/`, `opencode/`, and `copilot/`.

## Overview

Cross-platform dotfiles for Linux, Windows PowerShell, Git Bash/MSYS2, and WSL. The repo uses Dotbot for symlink management and aims to provide a unified zsh experience across terminals. It also contains git submodules, including `dotbot/` and `menos/`.

Read this file first for repo-wide rules. If you are running inside a specific client:

- Claude Code: then read `CLAUDE.md` for Claude-specific hooks, commands, and workarounds.
- OpenCode/Codex: then read `opencode/AGENTS.md` for client-specific behavior.
- Copilot: use the guidance in `copilot/`.

## Primary Commands

### Installation

Linux, Git Bash, MSYS2:

```bash
~/.dotfiles/install
```

Windows PowerShell:

```powershell
~\.dotfiles\install.ps1
~\.dotfiles\install.ps1 -Work
~\.dotfiles\install.ps1 -ITAdmin
~\.dotfiles\install.ps1 -NoElevate
~\.dotfiles\install.ps1 -ListPackages
```

For the Windows Pi package-manager decision (`npm` instead of Bun for the global `pi` install), see `pi/README.md`.

WSL:

```bash
~/.dotfiles/wsl/install
~/.dotfiles/wsl/install --packages
```

### Validation

```bash
make test
make test-quick
make test-pytest
make lint
make lint-python
make format
make check
just update
```

Tooling expectations:

- Python tooling uses `uv`.
- Tests use `pytest`.
- Python lint and format use `ruff`.
- Shell lint and format use `shellcheck` and `shfmt`.
- `pyproject.toml` sets the Python floor at 3.9.

## Repo Rules

### Install Flow

The main entrypoints are `install` and `install.ps1`.

The install flow is:

1. Perform XDG migration for Git config files.
2. Run Dotbot with `install.conf.yaml`.
3. Generate machine-local Git identity config with `scripts/git-ssh-setup`.
4. Configure zsh with `scripts/zsh-setup`.
5. Download pinned zsh plugins on first shell startup with `scripts/zsh-plugins`.

WSL uses `wsl/install` and `wsl/install.conf.yaml`.

### WSL Mirroring Rule

`wsl/install.conf.yaml` must mirror the relevant cross-platform links from `install.conf.yaml`.

When adding a new cross-platform link to `install.conf.yaml`, add the WSL equivalent to `wsl/install.conf.yaml`. Skip Windows-only targets such as the PowerShell profile and Windows VS Code paths.

### Shell Architecture

All terminals are expected to converge on zsh:

```text
.bash_profile -> .zshenv -> .zshrc
```

- `zsh/env.d/` contains environment modules.
- `zsh/rc.d/` contains interactive modules.
- Canonical platform helpers live in `zsh/rc.d/00-helpers.zsh`.
- Standalone scripts sometimes redefine platform detection for self-containment.

### Cross-Platform Shell Gotchas

- In MSYS2 and Git Bash, pass `ZDOTDIR` through `env` when execing zsh.
- In shell config and prompt logic, prefer `${ZDOTDIR:-$HOME}` over raw `~` or `$HOME` when path resolution crosses the Git Bash and MSYS2 boundary.
- On Windows with MSYS2, `nsswitch.conf` must resolve HOME with `db_home: env windows cygwin desc`.
- In WSL prompt normalization, compare Windows-home paths case-insensitively.

### Git Identity Rules

- Git identity switches automatically based on directory and remote URL.
- Machine-specific SSH config is written into gitignored local files.
- Personal key priority is `id_ed25519-personal` then generic `id_ed25519`.
- Work key priority is `id_ed25519-work` then `id_ed25519-eagletg`.
- Work does not fall back to generic `id_ed25519`.

### Pi Expertise Retrieval Note

`read_expertise` currently uses layered snapshots plus optional focused local retrieval (`query` / `max_results`). Option 3 -- a retrieval-first expertise system -- is future-only and not implemented in this plan. Revisit it only if the layered snapshot-plus-retrieval approach cannot keep outputs focused and bounded without losing critical stable knowledge.

### Submodule Rules

- Never force-push submodule repos.
- Do not amend or rebase already-pushed submodule commits.
- Pull inside the submodule before updating the parent repo’s pinned submodule reference.
- If `git pull` fails on a submodule fetch, use:

```bash
git pull --no-recurse-submodules
git submodule update --init --recursive
```

### Conventions

- All scripts must be idempotent.
- Use LF line endings only.
- VS Code is the default editor, diff tool, and merge tool.
- The default branch is `main`.
- Dotbot link defaults rely on `force: true`, `relink: true`, and `create: true`.

## Agent Surfaces

- `claude/` is Claude Code-specific runtime config, hooks, commands, and local session data linked to `~/.claude`.
- `opencode/` is OpenCode config linked to `~/.config/opencode`.
- `copilot/` contains Copilot prompts and instructions.

Shared command ownership:

- `claude/commands/` is the canonical shared command source.
- `opencode/commands/` is an overlay: OpenCode-specific overrides live there, and the remaining commands are symlinked from `claude/commands/`.

## Key Paths

- `install`, `install.ps1`: primary installers
- `install.conf.yaml`: Dotbot symlink configuration
- `winget/configuration/`: WinGet Configuration (DSC) YAML files defining the Windows package set. Edit `core.dsc.yaml`, `work.dsc.yaml`, or `dev.dsc.yaml` to add/remove packages — install.ps1 invokes `winget configure` against them. Preserve the comment format `id: <id>  # <Display Name>` (two spaces before `#`) so `-ListPackages` keeps working.
- `wsl/`: WSL installer, packages, validation, and WSL-specific Dotbot config
- `zsh/env.d/`, `zsh/rc.d/`: shell modules
- `config/git/`: XDG Git config
- `powershell/profile.ps1`: PowerShell profile
- `test/`: repo tests
- `plugins/`: zsh plugins
- `dotbot/`: Dotbot submodule

## Out Of Scope Here

This file intentionally does not cover:

- Claude hook internals
- Claude slash-command usage
- Claude settings semantics
- Claude-specific runtime workarounds
- `menos/` deployment or Claude-only content-ingestion workflows
