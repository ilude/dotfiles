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

Recursive cloning requires access to the private Forgejo submodules `git@forgejo:mike/homelab-infra.git`, `git@forgejo:mike/onclave.git`, and `git@forgejo:mike/hatchery.git`. Configure a machine-local `forgejo` SSH alias and your authorized personal key first. Onclave tracks `feature/v2-broker-core`; other historical branches remain only in its GitHub repository, which stays unarchived. Keep the actual service address in local SSH configuration, not this repository. The submodule's [hosting instructions](modules/homelab-infra/README.md#repository-hosting) include a public-safe example.

> **Note:** Dotbot uses `force: true` for symlinks, which will overwrite existing files at target locations (including `~/.claude/`). Back up any existing configuration before running the installer for the first time.

### Linux / Git Bash / MSYS2

```bash
git clone --recursive https://github.com/ilude/dotfiles.git ~/.dotfiles
~/.dotfiles/install
```

The installer does not request interactive privilege escalation. On Linux, run it as
root or configure non-interactive `sudo -n` access for package setup; if neither is
available, setup stops with a clear error. Interactive zsh and PowerShell expose
`pi` as the sole public launcher, selecting the default profile unless
`--profile <name>` is supplied.

Normal Bash and PowerShell installers configure only default through
`bash scripts/pi-default-setup`; legacy remains historical. The stage checks
runtime loading and the native/default launch configuration offline. A successful
install does not prove account access: it reports authentication as unverified.
Use `/login` in Pi and an authenticated request to verify the subscription.
See [Pi setup and acceptance](pi/README.md#default-installation-and-acceptance).

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

### Forgejo CLI (`fj`)

For the configured Forgejo URL, use this read-only BWS lookup from the dotfiles
root rather than searching infrastructure source files:

```sh
uv run python modules/homelab-infra/scripts/bws-snapshot.py --settings modules/homelab-infra/settings.local.json lookup forgejo_root_url
```

It requires the existing BWS access environment, prints only that field, and
starts no tooling container.

Normal installation includes `fj` from the
[`forgejo-cli` project](https://codeberg.org/forgejo-contrib/forgejo-cli):

- macOS uses the `forgejo-cli` Homebrew formula in `Brewfile`.
- Windows x86-64 and GNU/Linux x86-64/ARM64 use upstream release binaries,
  installed into `~/.local/bin` by `scripts/install-forgejo-cli.py`.
- WSL package setup uses the same Linux installer. Windows `-SkipPackages`
  skips the download/update stage.

There is currently no WinGet package for this CLI. The helper checks the latest
stable upstream release, skips an equal or newer installed version, and verifies
`fj version` before replacing its managed binary. It does not configure a host
or authenticate. To install/update it independently on Windows/Linux:

```sh
python scripts/install-forgejo-cli.py
fj version
fj auth add-token --host https://forgejo.example.com
```

For a self-hosted instance, first reuse an existing suitably scoped token from
its authorized credential store. Create one under
`https://forgejo.example.com/user/settings/applications` only if no suitable
stored token is available. Supply it on stdin to `add-token` (`add-key` is an
alias). Browser-based `fj auth login` supports
only selected hosts, not arbitrary self-hosted instances. Use your actual Forgejo
URL; do not put tokens in command arguments or shell history. Tokens and
machine-specific host configuration stay outside the repository. Windows ARM64 has no upstream
release binary in the researched release (v0.7.0). Its Linux x86-64 binary requires
glibc 2.39 (as provided by Ubuntu 24.04); older distributions need a compatible
distro package or source build rather than this release binary.

### Herdr desktop configuration

On Windows, normal package installation runs the [official desktop installer](https://releases.herdr.dev/app/install.ps1).
It selects the latest Windows x64 release from `https://releases.herdr.dev/app/latest.json`,
verifies the download checksum, installs into `%LOCALAPPDATA%\Programs\herdr-app`,
and adds `herdr-app` to the user PATH and Herdr to the Start menu. It also installs
`herdr-core` if missing. Rerunning setup updates the app without closing an open
window; quit and reopen it to use the new binary. The app also supports automatic
updates. Windows `-SkipPackages` skips this download. Desktop installation on other
platforms is not added by this Windows setup change.

`~/.config/herdr-app/` links to [`config/herdr-app/`](config/herdr-app/) on
Windows, macOS, Linux and WSL. Settings, keybindings, themes and personal layouts
and mods belong there. Herdr's generated support files, shipped layouts/mods and
local runtime state stay Git-ignored. Clone shipped layouts or mods before editing
them because Herdr replaces its own copies on startup.

This is separate from the existing Herdr TUI configuration in `config/herdr/`;
its configuration and workflows remain unchanged.

### T3 Code alongside Herdr

Normal installation adds the T3 Code desktop app on Windows/macOS and its CLI on
supported platforms, then configures the existing default Pi profile as a T3
provider and applies the portable preferences tracked in `config/t3-code/`.
Herdr installation, configuration and running sessions remain unchanged.
On Windows, the desktop app comes from the latest published GitHub nightly release
in `pingdotgg/t3code`, not WinGet stable. The separate CLI keeps its official stable
installer; macOS/Linux behavior is unchanged. Existing stable desktop installations
are not uninstalled automatically.
Windows `-SkipPackages` skips T3 downloads but still applies T3 configuration.

To configure an existing installation without running the full installer:

```sh
node scripts/t3-code-setup.mjs
```

Restart T3 when idle to load desktop preferences, then refresh Pi in T3's
**Settings > Providers** and start a new thread. The work-machine snapshot owns
shared preference keys, including new-thread model defaults; unrelated local
runtime settings stay local. Setup shares the existing Pi profile and credentials
without copying them; it does not enable remote access or background services.
See [T3 setup, preference scope, workflow differences and remote limits](docs/t3-code.md).

### Optional Windows SSH server

The normal installers do **not** enable inbound SSH. To enable it explicitly,
run this command from an **administrator PowerShell** in the repository:

```powershell
.\scripts\windows-ssh-setup.ps1
.\scripts\windows-ssh-setup.ps1 -AllowTailscale  # Optional Tailscale interface access
```

This installs the built-in Windows OpenSSH Server capability (not the WinGet
preview package), sets `sshd` to automatic startup, and starts it. The standard
local SSH firewall rule allows TCP 22 on Domain/Private networks only. Use Private
only for trusted networks. `-AllowTailscale` adds a separate interface-scoped rule
that also works when the physical connection is Public; Tailscale ACLs still apply.
Tailscale must already be installed. Reruns are safe; omitting the switch preserves
an existing Tailscale exception. A requested Windows restart is reported with exit
code `3010`; restart and rerun to finish setup.

The script preserves SSH configuration, authorized keys, unrelated firewall rules,
and managed policy. Other existing allow rules may still grant broader access;
this is not a machine-wide firewall lockdown. It does not rename the machine,
create DNS records, or prove remote login works.

Authorize the connecting machine's public key using the
[Windows OpenSSH key-management guidance](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement).
Windows uses `%USERPROFILE%\.ssh\authorized_keys` for standard users and normally
`%ProgramData%\ssh\administrators_authorized_keys` for administrators, with the
permissions described there. Never copy the private key to the server. Test
`ssh <user>@<host>` from the intended client before using Herdr remote attachment.
See the [remote workstation access runbook](modules/homelab-infra/docs/remote-workstation-access.md)
for network policy and verification limits.

macOS and Linux often include SSH clients, but their servers may also require
installation or explicit enablement. This command is Windows-only.

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
| `modules/hatchery/` | Hatchery disposable-compute product submodule; currently PRD, architecture, and agent guidance |
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

Default dependencies are installed with `pnpm --dir pi/profiles/default install --frozen-lockfile`, then linked with `bash scripts/pi-deps-link-setup --profile default`. Run `make check-pi-default` for grammar/loader readiness, typecheck, and tests. Existing legacy Pi targets remain independent. Damage Control loads on normal default-profile `pi` launches; use `/reload` for an existing session. See [default setup, explicit recovery and verification limits](pi/profiles/default/docs/damage-control-setup.md).

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
