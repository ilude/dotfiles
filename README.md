# Dotfiles

Cross-platform dotfiles for Windows (PowerShell, Git Bash), WSL, and Linux.

## Installation

### Linux / macOS / Git Bash

```bash
git clone --recursive https://github.com/ilude/dotfiles.git ~/.dotfiles
~/.dotfiles/install
```

Or with SSH:

```bash
git clone --recursive git@github.com:ilude/dotfiles.git ~/.dotfiles
~/.dotfiles/install
```

### Windows (PowerShell)

```powershell
git clone --recursive https://github.com/ilude/dotfiles.git $HOME\.dotfiles
~\.dotfiles\install.ps1
```

Options:
- `-Work` - Include work packages (AWS, Terraform, etc.)
- `-ListPackages` - Show available packages

### WSL (from Windows)

```bash
~/.dotfiles/install-wsl              # Install dotfiles into WSL
~/.dotfiles/install-wsl --packages   # Also install apt packages
```

## Development

### Testing

Requires [Bats](https://github.com/bats-core/bats-core):

```bash
make test          # Run all tests
make test-docker   # Run in Ubuntu 24.04 container
make test-quick    # Run core tests only
```

### Linting

Requires [shellcheck](https://github.com/koalaman/shellcheck):

```bash
make lint          # Run shellcheck
make format        # Format with shfmt
make check         # Run lint + test
```

### Git Hooks

Install pre-commit hook to run tests before each commit:

```bash
make install-hooks
```

## Structure

| Path | Purpose |
|------|---------|
| `install` | Main installer (bash) |
| `install.ps1` | Windows installer with package management |
| `install-wsl` | WSL-specific installer |
| `.bashrc` / `.zshrc` | Shell configuration |
| `test/` | Bats test files |
| `plugins/` | Zsh plugins |
| `dotbot/` | Dotbot submodule for symlink management |
