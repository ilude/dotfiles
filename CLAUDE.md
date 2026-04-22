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

For the Windows Pi package-manager decision (`npm` instead of Bun for the global `pi` install), see `pi/README.md`.

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

## menos (Content Vault)

Git submodule at `menos/` is a self-hosted content vault with semantic search. See `menos/.claude/CLAUDE.md` for full project rules.

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

```text
/yt https://youtube.com/watch?v=VIDEO_ID
```

Fetches transcript, stores in MinIO, and enqueues pipeline processing.

**List recent videos:**

```text
/yt list [n]
```

Flags:

- `--wait` polls the job to completion.
- `--verbose` shows full job fields.

After ingestion, follow-up questions about the video content query the API for transcript and pipeline results.

### Annotations

Content items can have annotations linked to a video:

- `POST /api/v1/content/{id}/annotations`
- `GET /api/v1/content/{id}/annotations`
- Utility script: `~/.claude/commands/yt/post_annotation.py <content_id> <title> <text_file> [tags...]`

### Authentication

All API endpoints use RFC 9421 HTTP signatures with ed25519 keys from `~/.ssh/id_ed25519`. Client signing is handled by `~/.claude/commands/yt/signing.py`.

## Testing

Use the repo-wide test and validation commands from `AGENTS.md`.

## Known Issues

### Windows console window flashing (hooks)

**Tracking:** https://github.com/anthropics/claude-code/issues/14828

Claude Code v2.1.45+ lost `windowsHide: true` on the hook execution spawn path. Any hook that launches a Windows console-subsystem binary such as `uv.exe` causes visible `conhost.exe` flashing. Internal tool calls such as Bash, Read, and Grep are not affected.

**Workaround applied:** All hooks use bare `python` instead of `uv run`. Hook dependencies (`pyyaml`, `tree-sitter`, `tree-sitter-bash`) are pre-installed in system Python via `install.ps1` or `install`. See `claude/tracking/windows-console-flashing.md` for full diagnostic details.

## Repo-Wide References

Repo-wide submodule rules, conventions, installation flow, and shell invariants are documented in `AGENTS.md`.
