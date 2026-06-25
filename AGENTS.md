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

For the Windows Pi package-manager decision (`pnpm` instead of Bun for the global `pi` install), see `pi/README.md`.

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
- JavaScript/TypeScript package-manager policy: prefer `bun`; use `pnpm` where Bun cannot resolve the Pi package graph or where a package already has `pnpm-lock.yaml`; never use `npm` or create/commit `package-lock.json`.
- Pi-specific rule: Pi TypeScript validation is pnpm-only. `pi/extensions/` owns Pi TypeScript dependencies/type-checking, and `pi/tests/` is pnpm-managed for Vitest. Do **not** use `bun add`, `bun install`, `bun run`, or `bun test` for Pi-related TypeScript packages/tests. Run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`. For a single Vitest file, pass the filter directly to the pnpm script, e.g. `cd pi/tests && pnpm test operator-status.test.ts`; do **not** insert `--` before the file filter, because this repo's script passes it through to Vitest and runs the full suite.
- Tests use `pytest`.
- Python lint and format use `ruff`.
- Shell lint and format use `shellcheck` and `shfmt`.
- `pyproject.toml` sets the Python floor at 3.9.
- Validation should target the intended contract or regression, not merely execute commands. If only a smoke test is practical, say so. Do not claim a behavior is verified unless the relevant code path or documented validation command was run.

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

### Git LFS Scope

Git LFS is intentionally narrow in this repo: `.gitattributes` should only route `patches/msys2-runtime/*.dll` through LFS. If Git LFS hooks hang or Git commands become slow, run `pwsh -File scripts/git-lfs-health.ps1` before retrying. Do not remove LFS hooks or bypass Git hooks as a default workflow; only bypass after the staged diff and LFS health checks pass and the user approves.

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
- Onramp/Caddy stack variable convention: a service `port` field means the container/service port reachable on the Docker Compose network. Do not reinterpret it as host publishing, split it into host/internal ports, or introduce host bind assumptions unless explicitly requested.
- Use only tools, workflows, permissions, and memory/task systems explicitly available in the active harness. If a capability is absent, adapt instead of naming or assuming it.
- Prefer deterministic code/tooling for routing, retries, transforms, status handling, install detection, and validation. Use model judgment for synthesis, review, classification, and ambiguous language tasks, not for decisions code or tool output can answer.
- Do not use try-catch wrappers, guard flags, or fallback logic unless specifically requested. Solve the domain problem natively. If data or dependencies are missing, fail with explicit exceptions -- not silent defaults. When requirements make code paths redundant, remove them entirely; do not wrap old logic in fallback flags.
- Keep planning proportional: use brief prose plans for complex work, skip formal planning for simple requests, and ask for clarification only when ambiguity affects correctness or direction.
- When a task involves a list or batch of items, track scope explicitly. Do not finalize until all items are accounted for -- completed, explicitly skipped with reason, or flagged as blocked.
- Stop researching when the core question is answered and additional retrieval is unlikely to change the conclusion. Exhaustive coverage only when explicitly requested.

### Windows Process Churn Diagnostics

If Windows shows high Local Session Manager (LSM), CryptSvc, Git LFS, MSYS helper, or console-host CPU after agent work, run `pwsh -File scripts/diagnose-windows-process-churn.ps1` before guessing. Treat System log event `Tcpip` ID `4227` as evidence of high-rate outgoing connection churn and correlate it with recent subprocess-heavy work. Prefer fixing the process source with caching, timeouts, and child-tree cleanup instead of repeatedly retrying hung commands.

## Agent Surfaces

For command ownership and client-specific command locations, see `docs/agent-command-surfaces.md`.

- `claude/` is Claude Code-specific runtime config, hooks, commands, and local session data linked to `~/.claude`.
- `opencode/` is OpenCode config linked to `~/.config/opencode`.
- `copilot/` contains Copilot prompts and instructions.
- `pi/skills/workflow/` contains Pi workflow skills such as Pi's `/do-it`.

Pi-first feature rule:

- When adding or fixing agent runtime features, safety systems, slash commands, workflow commands, skills, prompt routing, status UI, tools, or Pi operator behavior, work in `pi/` by default. Do not modify `claude/` as a proxy for Pi behavior unless the user explicitly asks for Claude Code support or the task is clearly Claude-only.
- If a feature exists in both `claude/` and `pi/`, treat `pi/` as the active implementation for Pi sessions. Port useful behavior into the owning Pi surface, validate with Pi's pnpm commands, and leave Claude-specific files alone unless cross-client parity is explicitly requested.

Shared command ownership:

- `claude/commands/` is the canonical shared command source for Claude/OpenCode command wrappers.
- `claude/shared/` contains shared command bodies used by Claude, OpenCode, and some Copilot prompts.
- `opencode/commands/` is an overlay: OpenCode-specific overrides live there, and the remaining commands are symlinked from `claude/commands/`.
- Pi does not load `claude/commands/`; update `pi/skills/workflow/` for Pi-specific workflow behavior.

When patterns conflict across Claude, OpenCode, Copilot, Pi, shell, PowerShell, WSL, or platform-specific directories, do not blend them. Follow the owning surface or local directory convention, and flag the conflict if it affects the change.

## Key Paths

- `install`, `install.ps1`: primary installers
- `install.conf.yaml`: Dotbot symlink configuration
- `winget/configuration/`: WinGet Configuration (DSC) YAML files defining the Windows package set. Edit `core.dsc.yaml`, `work.dsc.yaml`, or `dev.dsc.yaml` to add/remove packages — install.ps1 invokes `winget configure` against them. Preserve the comment format `id: <id>  # <Display Name>` (two spaces before `#`) so `-ListPackages` keeps working.
- `wsl/`: WSL installer, packages, validation, and WSL-specific Dotbot config
- `zsh/env.d/`, `zsh/rc.d/`: shell modules
- `config/git/`: XDG Git config
- `powershell/profile.ps1`: PowerShell profile
- `test/`: repo tests
- `docs/research/obsidian-vault/`: Obsidian-style research vault for multi-topic idea gardens; follow its local `AGENTS.md` and topic-specific guidance such as `agent-workflows/AGENTS.md`.
- `plugins/`: zsh plugins
- `dotbot/`: Dotbot submodule

## Out Of Scope Here

This file intentionally does not cover:

- Claude hook internals
- Claude slash-command usage
- Claude settings semantics
- Claude-specific runtime workarounds
- `menos/` deployment or Claude-only content-ingestion workflows
