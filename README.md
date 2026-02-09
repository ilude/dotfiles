# Dotfiles

Cross-platform dotfiles for Linux, Windows (PowerShell, Git Bash/MSYS2), and WSL.

## Features

- **Unified zsh experience** - All terminals use zsh with autosuggestions, syntax highlighting, and fuzzy completion
- **Automatic Git identity** - Directory-based and URL-based identity switching with SSH key detection
- **Dotbot symlinks** - Declarative symlink management, idempotent installation
- **Claude Code integration** - Skills, hooks, and damage control security system

## Prerequisites

**Linux / Git Bash / WSL:**
- git
- curl
- python3 (for running tests)

**Windows:**
- [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) (included with Windows 11; [install on Windows 10](https://github.com/microsoft/winget-cli))

## Installation

> **Note:** Dotbot uses `force: true` for symlinks, which will overwrite existing files at target locations (including `~/.claude/`). Back up any existing configuration before running the installer for the first time.

### Linux / Git Bash / MSYS2

```bash
git clone --recursive https://github.com/ilude/dotfiles.git ~/.dotfiles
~/.dotfiles/install
```

### Windows PowerShell

```powershell
git clone --recursive https://github.com/ilude/dotfiles.git $HOME\.dotfiles
~\.dotfiles\install.ps1                # Core packages
~\.dotfiles\install.ps1 -Work          # + AWS, Terraform, Helm, etc.
~\.dotfiles\install.ps1 -ITAdmin       # + AD, Graph, Exchange modules
~\.dotfiles\install.ps1 -NoElevate     # Skip elevation (Developer Mode)
~\.dotfiles\install.ps1 -ListPackages  # Show available packages
```

### WSL (from Windows)

```bash
~/.dotfiles/install-wsl              # Install dotfiles into WSL
~/.dotfiles/install-wsl --packages   # Also install apt packages
```

## Windows Requirements

For proper operation on Windows with Git Bash and MSYS2:

### Git for Windows Installation Options

When installing Git for Windows, select:
- **Line ending**: "Checkout as-is, commit Unix-style line endings" (LFOnly)
- **Symbolic links**: Enable symbolic links
- **Terminal**: Use MinTTY (recommended)

### MSYS2 HOME Resolution

If using MSYS2's zsh from Git Bash, the `nsswitch.conf` must have `db_home` configured correctly:

```
# C:\msys64\etc\nsswitch.conf
db_home: env windows cygwin desc
```

The `install.ps1` script automatically detects and fixes this if needed. Without this fix, HOME resolves to `/c/msys64/home/username` instead of `/c/Users/username`, causing config files to be missed.

## Shell Architecture

All terminals (Git Bash, WSL, Linux) transition to zsh for a consistent experience:

```
.bash_profile → sets ZDOTDIR → exec zsh
                                  ↓
                             .zshenv → zsh/env.d/*.zsh (WINHOME, locale, PATH)
                                  ↓
                             .zshrc → zsh/rc.d/*.zsh (completions, plugins, prompt, aliases)
```

### Why Zsh Everywhere

- Autosuggestions (gray text from history as you type)
- Syntax highlighting (red = invalid command)
- Better tab completion (case-insensitive, fuzzy)
- One config to maintain across all platforms

## Git Identity System

Automatic identity switching based on directory or remote URL:

- **Directory-based** (Windows): `C:/Projects/Work/` → professional identity
- **URL-based** (universal): GitHub org matching via `includeIf hasconfig:remote.*.url`
- **SSH keys**: Auto-detected by `git-ssh-setup`, written to gitignored local configs

## Structure

| Path | Purpose |
|------|---------|
| `install` | Main installer (bash) |
| `install.ps1` | Windows installer with package management |
| `install-wsl` | WSL-specific installer |
| `install.conf.yaml` | Dotbot symlink configuration |
| `zsh/env.d/` | Environment modules (WINHOME, locale, PATH) |
| `zsh/rc.d/` | Interactive modules (completions, plugins, prompt, aliases) |
| `powershell/profile.ps1` | PowerShell profile |
| `config/git/` | Git config and global ignore (XDG-compliant) |
| `config/ohmyposh/` | Oh My Posh prompt theme |
| `claude/` | Claude Code skills, hooks, damage control |
| `copilot/` | GitHub Copilot instructions |
| `test/` | Bats test files |
| `plugins/` | Zsh plugins (auto-downloaded) |
| `dotbot/` | Dotbot submodule |

## Development

### Testing

```bash
make test          # Run all tests
make test-docker   # Run in Ubuntu 24.04 container
make test-quick    # Run core tests only
```

### Linting

```bash
make lint          # Run shellcheck
make format        # Format with shfmt
make check         # Run lint + test
```

### Updating

```bash
just update        # Update dotbot, commit, and reinstall
```

## Conventions

- All scripts are idempotent (safe to re-run)
- LF line endings only (no CRLF)
- VS Code as default editor/diff/merge tool
- Default branch is `main`
