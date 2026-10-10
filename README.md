# Dotfiles

Cross-platform dotfiles for Linux, Windows (PowerShell, Git Bash/MSYS2), and WSL.

For contributor and coding-agent onboarding, start with `AGENTS.md`.

## Features

- **Unified zsh experience** - All terminals use zsh with autosuggestions, syntax highlighting, and fuzzy completion
- **Automatic Git identity** - Directory-based and URL-based identity switching with SSH key detection
- **Dotbot symlinks** - Declarative symlink management, idempotent installation
- **Agent integrations** - Pi, Claude Code, and OpenCode-specific surfaces live alongside the shared repo config
- **Shared command overlay** - `claude/commands/` is the canonical shared command source, with OpenCode overrides layered on top

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
~\.dotfiles\install.ps1                # Ensure core packages and update installed apps/tools
~\.dotfiles\install.ps1 -Work          # + AWS, Terraform, Helm, etc.
~\.dotfiles\install.ps1 -ITAdmin       # + AD, Graph, Exchange modules
~\.dotfiles\install.ps1 -NoElevate     # Skip elevation (Developer Mode)
~\.dotfiles\install.ps1 -SkipPackages  # Configuration only, no application/tool updates
~\.dotfiles\install.ps1 -ListPackages  # Show available packages
```

Windows packages are defined declaratively in `winget/configuration/{core,work,dev}.dsc.yaml`
(WinGet Configuration / DSC). Add or remove packages by editing those files — `install.ps1`
invokes `winget configure` on each selected group. Preserve the comment format
`id: <id>  # <Display Name>` (two spaces before `#`) so `-ListPackages` keeps working.

Every normal Windows run ensures the selected package groups exist, then runs
`winget upgrade --all --include-unknown`. This also updates installed applications
outside the dotfiles package lists, including previously installed work/dev tools
without requiring those flags again. Existing WinGet pins remain respected.
Packages with unknown versions may be offered again on subsequent runs.
`-ForcePackages` remains accepted for compatibility; `.dotfiles.lock` no longer
suppresses maintenance.

Installer-managed pnpm globals, PowerShell modules, Python hook dependencies and
uv tools are updated through their owning managers. Pi and Herdr retain their
latest-stable installation paths and package-source fallback behavior. Explicit
pins (including `lizard==1.21.3` and the checksum-pinned BWS release), existing
supply-chain settings, and frozen repository dependency installs are retained.
Arbitrary user pnpm/uv packages are not bulk-upgraded.

An existing MSYS2 installation is excluded from the WinGet bootstrap configuration.
The installer adds a blocking WinGet pin for `MSYS2.MSYS2` when no pin already exists,
without replacing user pins, and updates MSYS2 through separate `pacman -Syu`
passes before ensuring zsh is installed. Close MSYS2/Git Bash terminals before
running maintenance; if a runtime update fails, close them and rerun the installer.

`-SkipPackages` skips application/tool updates, the Pi global update, and WSL
installation/package installation. Dotfiles configuration and repository runtime
dependency setup still run. WSL package setup otherwise retains its existing
behavior; this is not a bulk upgrade of all WSL applications.

The transcript contains package-manager diagnostics. The final summary reports
successful update/current checks, explicit no-update results, skips, failures and
reboot requirements. Exit codes are `0` for success, `1` for failures, `2` for failed
or cancelled elevation, and `3010` for reboot-required completion without other
failures. Elevated runs propagate the child exit code. No automatic reboot occurs.

### Temporary install hooks

End-of-install temporary fixes live in root `install.d/` and run in lexical order:

- `install` runs `install.d/*.sh` and common `install.d/*.py` hooks.
- `install.ps1` runs `install.d/*.ps1` and common `install.d/*.py` hooks.
- Move a hook to `install.d/disabled/` to turn it off.

Hook rules:

- Name hooks `NN-short-description.{sh,ps1,py}`.
- Prefer `*.py` for common cross-platform logic; use `*.sh`/`*.ps1` only for platform-specific behavior.
- Hooks must be idempotent, safe to skip, and must not replace core installer steps.
- Hooks are soft-fail by design: failures warn and the installer continues.
- Temporary hooks should include an `install.d` metadata comment with `reason`, `remove_when`, `safe_to_skip`, and `idempotent`.

### WSL (from Windows)

```bash
~/.dotfiles/wsl/install              # Install dotfiles into WSL
~/.dotfiles/wsl/install --packages   # Also install apt packages
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

```text
# C:\msys64\etc\nsswitch.conf
db_home: env windows cygwin desc
```

The `install.ps1` script automatically detects and fixes this if needed. Without this fix, HOME resolves to `/c/msys64/home/username` instead of `/c/Users/username`, causing config files to be missed.

## Shell Architecture

All terminals (Git Bash, WSL, Linux) transition to zsh for a consistent experience:

```text
.bash_profile -> sets ZDOTDIR -> exec zsh
                                |
                                v
                           .zshenv -> zsh/env.d/*.zsh (WINHOME, locale, PATH)
                                |
                                v
                           .zshrc -> zsh/rc.d/*.zsh (completions, plugins, prompt, aliases)
```

### Why Zsh Everywhere

- Autosuggestions (gray text from history as you type)
- Syntax highlighting (red = invalid command)
- Better tab completion (case-insensitive, fuzzy)
- One config to maintain across all platforms

## Git Identity System

Automatic identity switching based on directory or remote URL:

- **Directory-based** (Windows): `C:/Projects/Work/` -> professional identity
- **URL-based** (universal): GitHub org matching via `includeIf hasconfig:remote.*.url`
- **SSH keys**: Auto-detected by `git-ssh-setup`, written to gitignored local configs

## Structure

| Path | Purpose |
|------|---------|
| `install` | Main installer (bash) |
| `install.ps1` | Windows installer with package management |
| `install.d/` | End-of-install temporary hooks (`*.py` common, `*.sh`/`*.ps1` platform-specific) |
| `wsl/` | WSL installer, packages, and validation |
| `install.conf.yaml` | Dotbot symlink configuration |
| `zsh/env.d/` | Environment modules (WINHOME, locale, PATH) |
| `zsh/rc.d/` | Interactive modules (completions, plugins, prompt, aliases) |
| `powershell/profile.ps1` | PowerShell profile |
| `config/git/` | Git config and global ignore (XDG-compliant) |
| `config/ohmyposh/` | Oh My Posh prompt theme |
| `pi/` | Pi runtime configuration, extensions, skills, prompts, and tests |
| `claude/` | Claude Code-specific runtime config, hooks, commands, and local state |
| `opencode/` | OpenCode global config (linked to `~/.config/opencode`) |
| `test/` | Cross-platform Python, PowerShell, and shell tests |
| `plugins/` | Zsh plugins (auto-downloaded) |
| `dotbot/` | Dotbot submodule |
| `modules/onclave/` | Onclave product and Pi adapter submodule |
| `modules/homelab-infra/` | Homelab infrastructure submodule with a nested private `values/` repository |

## Agent Surfaces

- `AGENTS.md` is the neutral repo-wide onboarding file for coding agents.
- `CLAUDE.md` contains Claude-specific runtime guidance for this repo.
- `pi/AGENTS.md` and `pi/README.md` document the Pi runtime and operator behavior.
- `claude/commands/` is the canonical shared command source.
- `opencode/commands/` contains OpenCode-specific overrides and symlinks to shared commands.

## Development

### Testing

```bash
make test          # Run portable tests without requiring zsh
make test-zsh      # Run executable zsh runtime contracts
make test-docker   # Run portable tests in Ubuntu 24.04
make test-quick    # Run core tests only
```

### Default Pi validation

Default dependencies are installed with `pnpm --dir pi/profiles/default install --frozen-lockfile`, then linked with `bash scripts/pi-deps-link-setup --profile default`. Run `make check-pi-default` for grammar/loader readiness, typecheck, and tests. Existing legacy Pi targets remain independent. Damage Control loads on normal default-profile `pi` and `pp` launches; use `/reload` for an existing session. See [default setup, explicit recovery and verification limits](pi/profiles/default/docs/damage-control-setup.md).

### Onclave backfill operations

The installer builds and registers the short-lived TypeScript worker in `tools/onclave-backfill` as a native per-user daily and login-triggered job. It is local-first, fail-fast, and nonfatal to the rest of installation: missing Node, endpoint configuration, or a supported native scheduler produces a warning and no cron fallback. The worker reads `~/.dotfiles/yt/onclave-backfill.json`, uses the configured key path without copying key material, catches up after missed runs, and removes local cache directories only after verified upload. Use its `--status`, `--disable`, and ownership-checked `--uninstall` operations for migration and recovery. Claude's retired API wrappers, `/yt` command, circuit hooks, and detached backfill are not compatibility fallbacks; use default Pi's discovered vault tools or explicit `/yt-local`.

### Linting

The retained local fetchers are tested independently from the retired API wrappers:

```bash
cd tools/onclave-youtube && uv run pytest tests/test_fetch_transcript.py
cd tools/onclave-backfill && pnpm test
```

```bash
make lint          # Run shellcheck
make format        # Format with shfmt
make check         # Run lint + test + Pi extension validation
```

### Updating

```bash
just update        # Update dotbot, commit, and reinstall
python scripts/get_latest_agent_version.py pi
python scripts/get_latest_agent_version.py herdr
```

The version helper reads each project's latest stable GitHub release. Installers use those versions when available, while preserving their existing package-source fallback if GitHub cannot be reached.

## Conventions

- All scripts are idempotent (safe to re-run)
- LF line endings only (no CRLF)
- VS Code as default editor/diff/merge tool
- Default branch is `main`
