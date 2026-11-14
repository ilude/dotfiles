# AGENTS.md

Repository-wide rules for this cross-platform dotfiles repository: Linux, Windows PowerShell, Git Bash/MSYS2, and WSL; Dotbot and project submodules under `modules/`; terminals converging on zsh. Read this file first. More specific active-client or directory instructions take precedence without changing these repository-wide invariants:

Leave `pi/profiles/legacy/` untouched unless explicitly asked, including during repository-wide checks, cleanup or staging. Pi-specific instructions live in `pi/AGENTS.md`.

- Claude Code: `CLAUDE.md`
- OpenCode/Codex: `opencode/AGENTS.md`
- Default Pi's profile-wide working rules live in `pi/profiles/default/AGENTS.md`, loaded through `PI_CODING_AGENT_DIR` by bare `pi`. Other profiles keep their own instructions.
- Claude global instructions: `claude/CLAUDE.md` (independent from Pi instructions, no symlink)
- Before Pi work, including installer or launcher changes outside `pi/`, read [`pi/AGENTS.md`](pi/AGENTS.md).

Claude hooks, commands, settings, runtime workarounds, and content ingestion are Claude-only. Follow the owning surface rather than blending client, shell, PowerShell, WSL, or platform conventions.

## Module and repository boundaries

- `modules/onclave/` owns the communication protocol, services, adapters and application contracts. Follow its [`AGENTS.md`](modules/onclave/AGENTS.md), including for submodule operations invoked from this parent.
- `modules/hatchery/` owns generic compute, configuration and service facilities. Read its `AGENTS.md` for product work. The independent private `homelab-config` repository (normally `~/homelab-config`) owns live site composition, BWS bindings, deployment/operational commands and the maintained local tooling-image source.
- `modules/homelab-infra/` is no longer a submodule or an active deployment owner. An ignored local checkout may remain because its nested private `values/` repository stores existing backups/artifacts. Preserve that directory and data; do not delete it as submodule cleanup or treat its historical instructions as current ownership.
- This dotfiles repository owns workstation setup and Pi runtime integration. `pi/extensions/onclave-pi.ts` is only a loader for the implementation in `modules/onclave/`.
- `docs/research/obsidian-vault/` is the private Forgejo `mike/research-vault` submodule. It owns research notes, indexes, templates, and vault/topic instructions, not dotfiles runtime implementation. Keep research output at this existing path and follow its local `AGENTS.md`. It is separate from Onclave's content-ingestion/search vault. See the [research vault workflow](README.md#research-vault) for initialization and publication.
- Treat each submodule as an independent repository with its own instructions, branch, validation, commit, and remote. Make changes in the owning repository rather than duplicating source across repositories.
- For coordinated changes, Onclave publishes application contracts, Hatchery supplies generic facilities, homelab-config consumes them for the live site, and dotfiles wires local clients. BWS owns live inventory and secrets; private `values/` holds excluded backups/artifacts/dumps/mutable service state, not a second configuration store.
- The workstation BWS locator is ignored `config/bws/settings.local.json`; see `config/bws/README.md`. Keep bootstrap credentials caller-local and never create per-skill credential stores.
- Commit submodule changes from the submodule first, then commit the updated gitlink in dotfiles. Local parent pin commits do not require pulling or publication. When push is requested, publish relevant module commits before the parent that references them. Never include a submodule's files directly in a dotfiles commit.

## Remote workstation access

Before Herdr remote attachment, Windows PowerShell remoting, or changes to their network access, read [`docs/remote-workstation-access.md`](docs/remote-workstation-access.md). It covers native Herdr attachment, Windows Terminal launch context, credentials, and verification limits. Workstation launchers belong here; managed live inventory and secrets remain in BWS, not tracked examples or a second inventory in `values/`.

## Command index

Installation entrypoints and options live in [`README.md#installation`](README.md#installation); development and validation commands live in [`README.md#development`](README.md#development).

Tooling rules:

- Python tooling uses `uv`; tests use `pytest`, Python lint/format uses `ruff`, shell lint uses `shellcheck`, shell format uses `shfmt`, and `pyproject.toml` sets Python 3.9 as the floor.

## Repository invariants

### Install, links and shells

The installer entrypoints and supporting paths are indexed in [`README.md#structure`](README.md#structure).

- `wsl/install.conf.yaml` must mirror every relevant cross-platform link from `install.conf.yaml`. Add the WSL equivalent with each cross-platform link; exclude Windows-only targets such as the PowerShell profile and Windows VS Code paths.
- Shell configuration follows [`zsh/AGENTS.md`](zsh/AGENTS.md) and the [shell architecture](README.md#shell-architecture).

### Git identity and submodules

- Git identity switches by directory and remote URL; see the [Git identity system](README.md#git-identity-system), and keep machine-specific SSH config in gitignored local files managed by [`scripts/git-ssh-setup`](scripts/git-ssh-setup).
- Personal SSH key priority is `id_ed25519-personal`, then generic `id_ed25519`.
- Work SSH key priority is `id_ed25519-work`, then `id_ed25519-eagletg`; work must not fall back to generic `id_ed25519`.
- Never force-push a submodule repository. Never amend or rebase an already-pushed submodule commit. For publication, pull inside a submodule when needed to reconcile its remote before publishing the parent reference; do not automatically merge or rebase. This is not a prerequisite for a local parent pin commit.
- If `git pull` fails on a submodule fetch, recover with:

```bash
git pull --no-recurse-submodules
git submodule update --init --recursive
```

### Change history

- Update the root `CHANGELOG.md` for material user-facing, operator-facing, workflow, compatibility, or architectural changes. Record the context needed to understand what changed, why it changed, important constraints, and deliberately preserved behavior without duplicating implementation details.

### Repository configuration

- VS Code is the default editor, diff tool, and merge tool. The default branch is `main`.
- Dotbot link defaults rely on `force: true`, `relink: true`, and `create: true`.

### Windows process churn

For Windows CPU spikes or process churn, load the [Windows performance skill](pi/profiles/default/skills/windows-performance/SKILL.md) before diagnosing.

## Ownership and navigation

Command ownership follows the client that loads the surface: Pi runtime features, commands, tools, workflows, and operator behavior belong in `pi/`; Claude-specific commands and shared instructions belong in `claude/`; OpenCode-specific overrides belong in `opencode/`, while its shared command links are generated by `scripts/opencode-link-setup`. Change the owning source rather than generated links or parallel copies. When client or platform patterns conflict, follow the owning/local surface and flag any consequential conflict.

Windows packages live in `winget/configuration/{core,work,dev}.dsc.yaml`; edit the applicable file and preserve `id: <id>  # <Display Name>` with two spaces before `#` so `install.ps1 -ListPackages` continues to work.
