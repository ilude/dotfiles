# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cross-platform dotfiles repository for Linux and Windows. Uses **Dotbot** for symlink management with automatic SSH key detection and shell configuration. Includes **menos** as a git submodule — a self-hosted content vault for YouTube transcripts, markdown files, and structured data.

## Commands

### Installation

**Linux/Git Bash/MSYS2:**
```bash
~/.dotfiles/install
```

**Windows PowerShell (full package installation):**
```powershell
~/.dotfiles/install.ps1              # Core packages
~/.dotfiles/install.ps1 -Work        # + AWS, Helm, Terraform, etc.
~/.dotfiles/install.ps1 -ITAdmin     # + AD, Graph, Exchange modules
~/.dotfiles/install.ps1 -NoElevate   # Skip elevation (Developer Mode)
```

> **Note for Claude:** Self-elevating scripts like `install.ps1` can be run directly via `pwsh -File install.ps1`. They spawn an elevated admin window automatically - you won't see output but the script runs. Wrap in a 90 second timeout to avoid hanging: `timeout 90 pwsh -File install.ps1 -SkipPackages`

**WSL (from Windows):**
```bash
~/.dotfiles/wsl/install              # Install dotfiles into WSL
~/.dotfiles/wsl/install --packages   # Also install apt packages
```

### Development

```bash
just update  # Update dotbot submodule, commit, and reinstall
make test    # Run pytest tests
```

## Architecture

### Installation Flow
1. `install` (bash) or `install.ps1` (PowerShell) → entry points
2. Windows: enables Developer Mode (registry key, allows symlinks without admin)
3. XDG migration: removes old `~/.gitconfig` and `~/.gitignore_global` so Git uses `~/.config/git/`
4. **Dotbot** creates symlinks defined in `install.conf.yaml`
5. `scripts/git-ssh-setup` detects SSH keys, writes machine-specific `.gitconfig-*-local` files
6. `scripts/zsh-setup` installs zsh and sets as default shell (Linux only)
7. `scripts/zsh-plugins` downloads version-pinned plugins on first shell startup
8. Credential lockdown: `chmod 600` on sensitive files like `~/.claude/.credentials.json`

### WSL Installation Flow
WSL setup is orchestrated by `install.ps1` and uses files in the `wsl/` directory:
1. `install.ps1` installs WSL + Ubuntu 24.04 (requires admin for first install)
2. Configures passwordless sudo for apt/chsh
3. Runs `wsl/install` inside WSL via `wsl -e bash --norc -c "cd '$wslBasedir' && ./wsl/install"`
4. `wsl/install` runs **Dotbot** with `wsl/install.conf.yaml` to create symlinks from WSL `~` into the Windows-mounted dotfiles repo (`/mnt/c/Users/<user>/.dotfiles`)
5. `wsl/install.conf.yaml` creates a `~/.dotfiles` self-symlink so paths like `~/.dotfiles/scripts/zsh-plugins` resolve correctly inside WSL
6. `wsl/packages` installs apt packages (zsh, fzf, eza, etc.) and sets zsh as default shell
7. `wsl/install` downloads zsh plugins

**Key difference from main config**: `wsl/install.conf.yaml` must mirror the links in `install.conf.yaml` (using `home/` prefixed source paths). When adding new links to `install.conf.yaml`, also add them to `wsl/install.conf.yaml` (skip Windows-only links like PowerShell profile and VS Code Windows paths).

### Git Identity System
- **Directory-based** (Windows): `C:/Projects/Work/` → professional, `C:/Projects/Personal/` → personal
- **URL-based** (universal): GitHub org matching via `includeIf hasconfig:remote.*.url`
- Machine-specific SSH configs in `.gitconfig-personal-local` and `.gitconfig-professional-local` (gitignored)

### SSH Key Priority
- Personal: `id_ed25519-personal` > `id_ed25519` (generic key used for personal only)
- Work: `id_ed25519-work` > `id_ed25519-eagletg` (requires a named key; generic `id_ed25519` is NOT used for work)

### Key Files
| File | Purpose |
|------|---------|
| `install.conf.yaml` | Dotbot symlink configuration |
| `home/.bash_profile` | Login shell → zsh transition with ZDOTDIR setup |
| `home/.zshrc` | Main zsh config, sources `zsh/rc.d/*.zsh` |
| `home/.zshenv` | All zsh shells, sources `zsh/env.d/*.zsh` |
| `zsh/env.d/` | Environment modules (WINHOME, locale, PATH) |
| `zsh/rc.d/` | Interactive modules (completions, history, prompt, aliases) |
| `scripts/zsh-plugins` | On-demand plugin downloader from GitHub |
| `zsh/zshrc-msys2-bootstrap` | MSYS2 HOME redirect to Windows home |
| `config/git/config` | Unified Git config (XDG: `~/.config/git/config`) |
| `config/git/ignore` | Global gitignore (XDG: `~/.config/git/ignore`) |
| `config/git/gitconfig-personal` / `config/git/gitconfig-professional` | Identity-specific configs |
| `scripts/git-ssh-setup` | SSH key detection, writes `.gitconfig-*-local` files |
| `powershell/profile.ps1` | PowerShell profile |
| `config/ohmyposh/prompt.json` | Oh My Posh prompt theme |
| `wsl/install` | WSL-specific installer (runs dotbot with `wsl/install.conf.yaml`) |
| `wsl/install.conf.yaml` | WSL dotbot config (symlinks WSL `~` into Windows mount) |
| `wsl/packages` | WSL apt package installer (zsh, fzf, eza, etc.) |
| `wsl/validate.sh` | WSL environment validation |
| `.claude/` | Global Claude Code config (symlinked to ~/.claude/) |
| `copilot/` | Global Copilot instructions (symlinked) |
| `menos/` | Content vault submodule (FastAPI + SurrealDB + MinIO + Ollama) |

### Platform Detection
Canonical helpers are in `zsh/rc.d/00-helpers.zsh` (`is_windows`, `is_wsl`, `is_linux`, `is_macos`). Standalone scripts redefine these for self-containment. All scripts are designed to be idempotent.

### Unified Shell Architecture (CRITICAL)

**Goal**: All terminals (Git Bash, WSL, Linux) use zsh with identical config for consistent muscle memory.

#### Why Zsh Everywhere
- Autosuggestions (gray text from history as you type)
- Syntax highlighting (red = invalid command)
- Better tab completion (case-insensitive, fuzzy)
- One config to maintain, not parallel bash/zsh

#### Shell Startup Flow
```
home/.bash_profile → adds MSYS2 to PATH → sets ZDOTDIR → exec env ZDOTDIR=... zsh -l
                                                               ↓
                                                          home/.zshenv → zsh/env.d/*.zsh (WINHOME, locale, PATH)
                                                                       → sets _DOTFILES_ENV_SOURCED=1
                                                               ↓
                                                          home/.zshrc → skips env.d if _DOTFILES_ENV_SOURCED
                                                                      → sources .env (interactive only)
                                                                      → zsh/rc.d/*.zsh (completions, plugins, history, prompt)
                                                               ↓
                                                          scripts/zsh-plugins (downloads pinned versions if missing)
```

#### MSYS2/Git Bash Complexity (READ THIS)
Git Bash and MSYS2's zsh have **different HOME directories**:
- Git Bash: `HOME=/c/Users/Mike`
- MSYS2 zsh: `HOME=/home/Mike`

**Critical fixes required:**
1. **ZDOTDIR must use `env`** to cross the boundary:
   ```bash
   # WRONG - ZDOTDIR is empty in zsh:
   export ZDOTDIR="$HOME" && exec zsh -l

   # RIGHT - env passes it through:
   exec env ZDOTDIR="$(cygpath -u "$USERPROFILE")" zsh -l
   ```

2. **All dotfiles paths must use `${ZDOTDIR:-$HOME}`**, not `~` or `$HOME`:
   ```bash
   # WRONG - expands to /home/Mike/.dotfiles (doesn't exist):
   source ~/.dotfiles/scripts/zsh-plugins

   # RIGHT - uses ZDOTDIR which is /c/Users/Mike:
   source "${ZDOTDIR:-$HOME}/.dotfiles/scripts/zsh-plugins"
   ```

3. **Prompt path normalization must also use ZDOTDIR**:
   ```zsh
   # WRONG - HOME is /home/Mike in MSYS2 zsh:
   if [[ "$p" == "$HOME"* ]]; then

   # RIGHT - ZDOTDIR is /c/Users/Mike:
   local home="${ZDOTDIR:-$HOME}"
   if [[ "$p" == "$home"* ]]; then
   ```

#### WSL Prompt Path Normalization
Windows home `/mnt/c/Users/Mike` should display as `~`, but Linux home `/home/mike` stays as full path.

**Gotcha**: `$USER` is lowercase (`mike`) but Windows path has `Mike`. Use case-insensitive comparison:
```zsh
p_lower="${(L)p}"  # lowercase the path
win_home_lower="/mnt/c/users/${(L)user}"  # lowercase the pattern
```

#### Windows Performance Workarounds
Plugins have known issues on Windows terminals (ConPTY):
- **Async autosuggestions disabled** - Causes cursor flickering in VS Code/Windows Terminal
- **Syntax highlighting disabled** - Performance issues on MSYS2
- **Autosuggestion buffer limited to 50 chars** - Long-line lag workaround

These are configured in `zsh/rc.d/02-plugins.zsh` with platform detection.

#### Key Test Files
- `test/test_config_patterns.py` - Configuration drift detection (validates shell config files contain expected patterns)
- `test/test_prompt.py` - Prompt path normalization and git branch display
- `test/test_git_ssh_setup.py` - Git SSH key detection and config generation

## menos (Content Vault)

Git submodule at `menos/` — a self-hosted content vault with semantic search. See `menos/.claude/CLAUDE.md` for full project rules.

**Stack**: Python 3.12+, FastAPI, SurrealDB, MinIO, Ollama

### Key Paths

| Path | Purpose |
|------|---------|
| `menos/api/` | FastAPI application, tests, scripts, migrations |
| `menos/infra/ansible/` | Deployment via Ansible in Docker |
| `menos/.claude/rules/` | Project rules (architecture, API ref, schema, deployment, gotchas) |

### Deployment

```bash
cd menos/infra/ansible
docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy.yml
```

Server: `192.168.16.241` (user: anvil). Post-deploy verifies git SHA via `/health`.

### `/yt` Command

Claude Code skill for YouTube video ingestion via menos API.

**Ingest a video:**
```
/yt https://youtube.com/watch?v=VIDEO_ID
```
Fetches transcript, stores in MinIO, enqueues pipeline processing (summary, tags, entities, quality).

**List recent videos:**
```
/yt list [n]
```

**Flags**: `--wait` (poll job to completion), `--verbose` (show full job fields)

After ingestion, ask follow-up questions about the video content — Claude will query the API for transcript and pipeline results.

### Annotations

Content items can have annotations (e.g., screenshot text linked to a video):
- `POST /api/v1/content/{id}/annotations` — create annotation
- `GET /api/v1/content/{id}/annotations` — list annotations
- Utility script: `~/.claude/commands/yt/post_annotation.py <content_id> <title> <text_file> [tags...]`

### Authentication

All API endpoints use RFC 9421 HTTP signatures with ed25519 keys (`~/.ssh/id_ed25519`). Client signing handled by `~/.claude/commands/yt/signing.py`.

## Testing

Tests use pytest for cross-platform testing:
```bash
make test              # Run pytest tests
make test-docker       # Run tests in Ubuntu 24.04 container (CI environment)
make lint              # Run shellcheck
make format            # Format with shfmt
make check             # lint + test
```

## Known Issues

### Windows console window flashing (hooks)

**Tracking:** https://github.com/anthropics/claude-code/issues/14828

Claude Code v2.1.45+ lost `windowsHide: true` on the hook execution spawn path. Any hook that launches a Windows console-subsystem binary (like `uv.exe`) causes visible `conhost.exe` flashing. Internal tool calls (Bash, Read, Grep, etc.) are not affected.

**Workaround applied:** All hooks use bare `python` instead of `uv run`. Hook dependencies (pyyaml, tree-sitter, tree-sitter-bash) are pre-installed in system Python via `install.ps1` / `install`. See `claude/tracking/windows-console-flashing.md` for full diagnostic details.

## Submodule Workflow (onyx, menos)

This repo uses git submodules that are worked on from multiple machines. Follow these rules to avoid dangling commit references that break `git pull`.

### Never force-push submodule repos

**NEVER** use `git push --force`, `git commit --amend` on pushed commits, or interactive rebase on pushed commits in `onyx` or `menos`. Force pushes rewrite history, which invalidates the commit SHA pinned in this parent repo. When another machine pulls dotfiles and tries to fetch the now-deleted SHA, it fails with `upload-pack: not our ref`.

### Updating a submodule reference

```bash
cd onyx                          # or menos
git pull                         # get latest from remote
cd ..
git add onyx                     # stage the new submodule pointer
git commit -m "chore: update onyx submodule (description of changes)"
```

### Pulling dotfiles with submodules

If `git pull` fails due to a submodule fetch error, use:
```bash
git pull --no-recurse-submodules
git submodule update --init --recursive
```

### Rules summary

- No `--force` push in any submodule repo
- No `--amend` on already-pushed commits in submodules
- No interactive rebase on pushed commits in submodules
- Always `git pull` inside the submodule before updating the parent reference
- Use `git submodule update --init --recursive` after pulling dotfiles

## Conventions

- All scripts must be idempotent (safe to re-run)
- Use VS Code as default editor/diff/merge tool
- LF line endings (`autocrlf = input`)
- Default branch is `main`
- Dotbot uses `force: true` and `relink: true` for symlinks

### Dotbot Configuration Options

```yaml
- defaults:
    link:
      relink: true    # Replace existing symlinks
      force: true     # Replace existing files
      create: true    # Create parent directories

- link:
    ~/target:
      path: source
      if: '[ "$OSTYPE" = "msys" ]'  # Conditional linking
```

### Idempotent Script Patterns

```bash
# Check before create
if [[ -L "$link" ]]; then
    echo "Already linked: $link"
    return 0
fi

# Config file generation - only write if changed
if [[ -f "$file" ]]; then
    existing=$(cat "$file")
    if [[ "$existing" == "$content" ]]; then
        echo "Already configured: $file"
        return 0
    fi
fi
echo "$content" > "$file"
```

## Reference: Cross-Platform Dotfiles Repos

These repos successfully support Linux + Git Bash/MSYS2 + WSL. Reference for solving cross-platform issues:

| Repo | Platforms | Notable Approach |
|------|-----------|------------------|
| [bernardopg/zshrc-config](https://github.com/bernardopg/zshrc-config) | Linux, WSL, MSYS2, Git-Bash, Cygwin | Single .zshrc with comprehensive OSTYPE detection |
| [Alex-D/dotfiles](https://github.com/Alex-D/dotfiles) | Windows, WSL2, Git Bash | Symlinks + Windows username detection from WSL |
| [agkozak/dotfiles](https://github.com/agkozak/dotfiles) | Linux, macOS, MSYS2, Cygwin, WSL | Battle-tested zsh config with MSYS2 fixes |
| [z0rc/dotfiles](https://github.com/z0rc/dotfiles) | macOS, Debian, Ubuntu, CentOS, WSL | XDG-compliant, minimal HOME clutter |
| [purarue/dotfiles](https://github.com/purarue/dotfiles) | Linux, macOS, Android (Termux), WSL | ON_OS variable pattern |
| [fatso83/dotfiles](https://github.com/fatso83/dotfiles) | macOS, Linux, WSL2 | BSD vs GNU utility wrappers |

### Key Resources

- [MSYS2 nsswitch.conf HOME fix](https://github.com/msys2/MSYS2-packages/issues/1167) - `db_home: env windows`
- [Git for Windows HOME patch](https://github.com/git-for-windows/msys2-runtime/commit/9660c5ffe82b921dd2193efa18e9721f47a6b22f)
- [chezmoi cross-platform templates](https://www.chezmoi.io/user-guide/manage-machine-to-machine-differences/)
- [yadm alternate files](https://yadm.io/docs/alternates) - Platform-specific file suffixes
- [Git for Windows symlinks](https://gitforwindows.org/symbolic-links.html) - `MSYS=winsymlinks:nativestrict`
