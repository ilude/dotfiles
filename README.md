# Dotfiles

Cross-platform dotfiles for Linux, Windows (PowerShell, Git Bash/MSYS2), and WSL.

## Features

- **Unified zsh experience** - All terminals use zsh with autosuggestions, syntax highlighting, and fuzzy completion
- **Automatic Git identity** - Directory-based and URL-based identity switching with SSH key detection
- **Dotbot symlinks** - Declarative symlink management, idempotent installation
- **Claude Code integration** - Skills, hooks, and damage control security system

## Installation

### Linux / Git Bash / MSYS2

```bash
git clone --recursive https://github.com/ilude/dotfiles.git ~/.dotfiles
~/.dotfiles/install
```

### Windows PowerShell

```powershell
git clone --recursive https://github.com/ilude/dotfiles.git $HOME\.dotfiles
~\.dotfiles\install.ps1             # Core packages
~\.dotfiles\install.ps1 -Work       # + AWS, Terraform, Helm, etc.
~\.dotfiles\install.ps1 -ITAdmin    # + AD, Graph, Exchange modules
~\.dotfiles\install.ps1 -ListPackages  # Show available packages
```

### WSL (from Windows)

```bash
~/.dotfiles/install-wsl              # Install dotfiles into WSL
~/.dotfiles/install-wsl --packages   # Also install apt packages
```

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
| `config/` | App configs (git, oh-my-posh) |
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
