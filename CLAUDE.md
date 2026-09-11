# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Read `AGENTS.md` first for repo-wide rules, validation commands, shell invariants, WSL mirroring requirements, and submodule workflow. This file covers Claude-specific runtime guidance and Claude-focused workflows.

This repo is a cross-platform dotfiles setup for Linux, Windows, Git Bash/MSYS2, and WSL. Claude remains a first-class supported client.

## Commands

Repo-wide install and validation commands are documented in `AGENTS.md`.

### Claude and Windows installation note

When invoking the self-elevating Windows installer from Claude, run:

```powershell
~/.dotfiles/install.ps1              # Core packages
~/.dotfiles/install.ps1 -Work        # + AWS, Helm, Terraform, etc.
~/.dotfiles/install.ps1 -ITAdmin     # + AD, Graph, Exchange modules
~/.dotfiles/install.ps1 -NoElevate   # Skip elevation (Developer Mode)
```

Windows packages are declared in `winget/configuration/{core,work,dev}.dsc.yaml`
(WinGet Configuration / DSC). `install.ps1` calls `winget configure -f <file>` per
selected group. To add or remove a package, edit the YAML — not `install.ps1`. The
`id: <id>  # <Display Name>` comment format (two spaces before `#`) is load-bearing
for `-ListPackages` and must be preserved.

Package-manager and Pi validation policy is owned by `AGENTS.md`; installation rationale remains in `pi/README.md`.

> **Note for Claude:** Self-elevating scripts like `install.ps1` can be run directly via `pwsh -File install.ps1`. They spawn an elevated admin window automatically, so you will not see output in the current session. Wrap in a 90 second timeout to avoid hanging: `timeout 90 pwsh -File install.ps1 -SkipPackages`

## Claude Surfaces In This Repo

- `claude/` is the Claude-specific runtime/config subtree linked to `~/.claude`.
- `claude/commands/` is the canonical shared command source used by Claude and mirrored into OpenCode.
- `claude/hooks/` contains Claude hook implementations and tests.
- `claude/settings.json` contains Claude runtime settings.
- `scripts/claude-link-setup` is a Claude-specific migration and link helper, not a repo-wide prerequisite.

## Claude-Specific Runtime Notes

### Shared command model

OpenCode reuses the shared command set from `claude/commands/`. OpenCode-specific overrides live in `opencode/commands/`, and the remainder are symlinked from the Claude command directory by `scripts/opencode-link-setup`.

### Hook dependency model

The repo installer pre-installs the Python hook dependencies used by Claude hooks. Hooks use bare `python` rather than `uv run` on Windows to avoid console flashing.

## YouTube local fetching

Claude's supported YouTube surface is `/yt-local`, which explicitly fetches transcript or metadata artifacts under `~/.dotfiles/yt/` without uploading them. Onclave vault operations are owned by default Pi's discovered tools; Claude no longer provides a separate API wrapper or detached backfill workflow.

## Testing

Use the repo-wide test and validation commands from `AGENTS.md`.

## Known Issues

### Windows console window flashing (hooks)

**Tracking:** https://github.com/anthropics/claude-code/issues/14828

Claude Code v2.1.45+ lost `windowsHide: true` on the hook execution spawn path. Any hook that launches a Windows console-subsystem binary such as `uv.exe` causes visible `conhost.exe` flashing. Internal tool calls such as Bash, Read, and Grep are not affected.

**Workaround applied:** All hooks use bare `python` instead of `uv run`. Hook dependencies (`pyyaml`, `tree-sitter`, `tree-sitter-bash`) are pre-installed in system Python via `install.ps1` or `install`. See `claude/tracking/windows-console-flashing.md` for full diagnostic details.

## Repo-Wide References

Repo-wide submodule rules, conventions, installation flow, and shell invariants are documented in `AGENTS.md`.
