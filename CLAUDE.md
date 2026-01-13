# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cross-platform dotfiles repository for Linux and Windows. Uses **Dotbot** for symlink management with automatic SSH key detection and shell configuration.

## Commands

### Installation

**Linux/Git Bash/MSYS2:**
```bash
~/.dotfiles/install
```

**Windows PowerShell (full package installation):**
```powershell
~/.dotfiles/install.ps1           # Core packages
~/.dotfiles/install.ps1 -Work     # + AWS, Helm, Terraform, etc.
~/.dotfiles/install.ps1 -ITAdmin  # + AD, Graph, Exchange modules
```

> **Note for Claude:** Self-elevating scripts like `install.ps1` can be run directly via `pwsh -File install.ps1`. They spawn an elevated admin window automatically - you won't see output but the script runs. Wrap in a 90 second timeout to avoid hanging: `timeout 90 pwsh -File install.ps1 -SkipPackages`

### Development

```bash
just update  # Update dotbot submodule, commit, and reinstall
make test    # Run bats tests
```

## Architecture

### Installation Flow
1. `install` (bash) or `install.ps1` (PowerShell) → entry points
2. **Dotbot** creates symlinks defined in `install.conf.yaml`
3. `git-ssh-setup` detects SSH keys, writes machine-specific `.gitconfig-*-local` files
4. `zsh-setup` installs zsh and sets as default shell (Linux only)
5. `zsh-plugins` downloads plugins on first shell startup

### Git Identity System
- **Directory-based** (Windows): `C:/Projects/Work/` → professional, `C:/Projects/Personal/` → personal
- **URL-based** (universal): GitHub org matching via `includeIf hasconfig:remote.*.url`
- Machine-specific SSH configs in `.gitconfig-personal-local` and `.gitconfig-professional-local` (gitignored)

### SSH Key Priority
- Personal: `id_ed25519-personal` > `id_ed25519`
- Work: `id_ed25519-work` > `id_ed25519-eagletg`

### Key Files
| File | Purpose |
|------|---------|
| `install.conf.yaml` | Dotbot symlink configuration |
| `.bash_profile` | Login shell → zsh transition with ZDOTDIR setup |
| `.zshrc` | Main zsh config, sources `zsh/rc.d/*.zsh` |
| `.zshenv` | All zsh shells, sources `zsh/env.d/*.zsh` |
| `zsh/env.d/` | Environment modules (WINHOME, locale, PATH) |
| `zsh/rc.d/` | Interactive modules (completions, history, prompt, aliases) |
| `zsh-plugins` | On-demand plugin downloader from GitHub |
| `.zshrc-msys2-bootstrap` | MSYS2 HOME redirect to Windows home |
| `.gitconfig` | Unified Git config with identity includes |
| `.gitconfig-personal` / `.gitconfig-professional` | Identity-specific configs |
| `git-ssh-setup` | SSH key detection, writes `.gitconfig-*-local` files |
| `powershell/profile.ps1` | PowerShell profile |
| `config/ohmyposh/prompt.json` | Oh My Posh prompt theme |
| `.claude/` | Global Claude Code config (symlinked to ~/.claude/) |
| `copilot/` | Global Copilot instructions (symlinked) |

### Platform Detection
Scripts use `$OSTYPE` (`msys`, `cygwin`) or `$WINDIR` for Windows detection. All scripts are designed to be idempotent.

### Unified Shell Architecture (CRITICAL)

**Goal**: All terminals (Git Bash, WSL, Linux) use zsh with identical config for consistent muscle memory.

#### Why Zsh Everywhere
- Autosuggestions (gray text from history as you type)
- Syntax highlighting (red = invalid command)
- Better tab completion (case-insensitive, fuzzy)
- One config to maintain, not parallel bash/zsh

#### Shell Startup Flow
```
.bash_profile → adds MSYS2 to PATH → sets ZDOTDIR → exec env ZDOTDIR=... zsh -l
                                                           ↓
                                                      .zshenv → zsh/env.d/*.zsh (WINHOME, locale, PATH)
                                                           ↓
                                                      .zshrc → zsh/rc.d/*.zsh (completions, plugins, history, prompt)
                                                           ↓
                                                      zsh-plugins (downloads if missing)
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
   source ~/.dotfiles/zsh-plugins

   # RIGHT - uses ZDOTDIR which is /c/Users/Mike:
   source "${ZDOTDIR:-$HOME}/.dotfiles/zsh-plugins"
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

#### Key Test File
`test/shell-setup.bats` - Contains 48 tests documenting WHY each config exists. Read the header comments first.

## Testing

Tests use [bats-core](https://github.com/bats-core/bats-core):
```bash
make test              # Run all tests
make test-docker       # Run in Ubuntu 24.04 container (CI environment)
make lint              # Run shellcheck
make format            # Format with shfmt
make check             # lint + test
bats test/prompt.bats  # Run specific test file
```

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
