# AGENTS.md

Repository-wide rules for this cross-platform dotfiles repository: Linux, Windows PowerShell, Git Bash/MSYS2, and WSL; Dotbot and project submodules under `modules/`; terminals converging on zsh. Read this file first. More specific active-client or directory instructions take precedence without changing these repository-wide invariants:

- Claude Code: `CLAUDE.md`
- OpenCode/Codex: `opencode/AGENTS.md`
- Default Pi's profile-wide working rules live in `pi/profiles/default/AGENTS.md`, loaded through `PI_CODING_AGENT_DIR` by bare `pp`. Other profiles keep their own instructions.
- Claude global instructions: `claude/CLAUDE.md` (independent from Pi instructions, no symlink)
- Pi runtime: [`pi/README.md`](pi/README.md)

Claude hooks, commands, settings, runtime workarounds, and content ingestion are Claude-only. Follow the owning surface rather than blending client, shell, PowerShell, WSL, or platform conventions.

## Module and repository boundaries

- `modules/onclave/` is the Onclave product repository. It owns the agent communication protocol, services, adapter implementation, and provider-neutral application contracts. Keep its checkout attached to and tracking `origin/feature/v2-broker-core`; do not switch it to `main` or another branch unless the user explicitly requests that branch change.
- `modules/homelab-infra/` is the homelab infrastructure repository. It owns Proxmox resources, infrastructure services, host deployment orchestration, and the nested private `values/` repository.
- This dotfiles repository owns workstation setup and Pi runtime integration. `pi/extensions/onclave-pi.ts` is only a loader for the implementation in `modules/onclave/`.
- Treat each module as an independent repository with its own instructions, branch, validation, commit, and remote. Make changes in the owning repository rather than duplicating source across repositories.
- For coordinated changes, preserve the boundary: Onclave publishes application contracts, homelab-infra consumes them for deployment, and dotfiles wires local clients to them. Do not move live inventory or site secrets out of `modules/homelab-infra/values/`.
- Commit and push module changes from the module first, then commit the updated gitlink in dotfiles. Never include a module's files directly in a dotfiles commit.

## Command index

Installation entrypoints and options live in [`README.md#installation`](README.md#installation); development and validation commands live in [`README.md#development`](README.md#development).

Tooling rules:

- Python tooling uses `uv`; tests use `pytest`, Python lint/format uses `ruff`, shell lint uses `shellcheck`, shell format uses `shfmt`, and `pyproject.toml` sets Python 3.9 as the floor.
- Pi TypeScript is pnpm-only, with `pi/profiles/legacy/package.json` as the dependency, typecheck, and Vitest source of truth for the customized legacy Pi setup. Never use `bun add`, `bun install`, `bun run`, or `bun test` for Pi packages/tests. Use `cd pi/profiles/legacy && pnpm install --frozen-lockfile` only when dependencies need installation; available checks include `pnpm run typecheck` and `pnpm test`.
- For one Vitest file in the legacy Pi profile, pass the filter directly, for example `cd pi/profiles/legacy && pnpm test operator-status.test.ts`; never insert `--`, because the script passes it through to Vitest and would run the full suite.
- `@earendil-works/*` and `typebox` are intentionally absent from `pi/profiles/legacy/package.json`; `scripts/pi-deps-link-setup` links them from pnpm-global into `pi/profiles/legacy/node_modules` so they match the installed Pi binary. See [`pi/README.md`](pi/README.md) and [`pi/profiles/legacy/README.md`](pi/profiles/legacy/README.md).

## Repository invariants

### Install, links, shells, and Pi profiles

The installer entrypoints and supporting paths are indexed in [`README.md#structure`](README.md#structure).

- `pp` is the cross-platform Pi profile launcher. Use `pp` for the clean repository-owned default profile, `pp -p legacy` or `pp --profile legacy` for the customized legacy setup, and `pp -p <name>` or `pp --profile <name>` for other isolated profiles.
- `scripts/pp` and `scripts/pp.ps1` reserve `-p` for profile selection, validate profile names as `[A-Za-z0-9][A-Za-z0-9._-]*`, set `PI_CODING_AGENT_DIR`, and pass remaining arguments to `pi`. Put Pi's own short `-p` argument after `--`, or prefer Pi's long spelling when available.
- Repository-owned Pi profiles live under `pi/profiles/`: `default/` is the clean default selected by bare `pp`, and `legacy/` contains the previous customized Pi setup plus its local runtime state. Arbitrary named profiles are created on first use under `~/.pi/profiles/<name>/` and are not repository-owned.
- The compatibility path `~/.pi/agent` points at `pi/profiles/legacy/` so direct `pi` invocations retain the previous customized behavior. Use `scripts/migrate-pi-profiles.ps1` with Pi stopped to perform or repair the stopped-process migration into `pi/profiles/{default,legacy}/`.
- `wsl/install.conf.yaml` must mirror every relevant cross-platform link from `install.conf.yaml`. Add the WSL equivalent with each cross-platform link; exclude Windows-only targets such as the PowerShell profile and Windows VS Code paths.
- All terminals converge through `.bash_profile -> .zshenv -> .zshrc`; see the [shell architecture](README.md#shell-architecture).
- In MSYS2 and Git Bash, pass `ZDOTDIR` through `env` when execing zsh.
- On Windows with MSYS2, `nsswitch.conf` must resolve HOME with `db_home: env windows cygwin desc`.
- Before changing files under `zsh/`, read and follow `zsh/AGENTS.md`; standalone scripts may redefine platform detection only to remain self-contained.

### Git identity and submodules

- Git identity switches by directory and remote URL; see the [Git identity system](README.md#git-identity-system), and keep machine-specific SSH config in gitignored local files managed by [`scripts/git-ssh-setup`](scripts/git-ssh-setup).
- Personal SSH key priority is `id_ed25519-personal`, then generic `id_ed25519`.
- Work SSH key priority is `id_ed25519-work`, then `id_ed25519-eagletg`; work must not fall back to generic `id_ed25519`.
- Never force-push a submodule repository. Never amend or rebase an already-pushed submodule commit. Pull inside the submodule before updating the parent repository's pinned reference.
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

If agent work coincides with high LSM, CryptSvc, Git LFS, MSYS helper, or console-host CPU, run [`scripts/diagnose-windows-process-churn.ps1`](scripts/diagnose-windows-process-churn.ps1) with `pwsh -File` before guessing. Correlate System log `Tcpip` event ID `4227` with recent subprocess-heavy work; prefer fixing process churn through caching, timeouts, and child-tree cleanup over repeated retries.

## Ownership and navigation

Command ownership follows the client that loads the surface: Pi runtime features, commands, tools, workflows, and operator behavior belong in `pi/`; Claude-specific commands and shared instructions belong in `claude/`; OpenCode-specific overrides belong in `opencode/`, while its shared command links are generated by `scripts/opencode-link-setup`. Change the owning source rather than generated links or parallel copies. Follow [`pi/README.md`](pi/README.md) for Pi behavior. When client or platform patterns conflict, follow the owning/local surface and flag any consequential conflict.

Key paths:

| Path | Purpose |
| --- | --- |
| `install`, `install.ps1`, `wsl/` | Primary installers and WSL install/config/validation |
| `install.conf.yaml` | Cross-platform Dotbot links |
| `scripts/pp`, `scripts/pp.ps1` | Cross-platform Pi profile launchers |
| `pi/profiles/default/`, `pi/profiles/legacy/` | Repository-owned clean and customized Pi profiles |
| `zsh/env.d/`, `zsh/rc.d/` | Environment and interactive zsh modules; platform helpers start in `zsh/rc.d/00-helpers.zsh` |
| `config/git/`, `powershell/profile.ps1` | Git and PowerShell configuration |
| `test/` | Repository tests |
| `plugins/`, `dotbot/` | zsh plugins and Dotbot submodule |
| `docs/research/obsidian-vault/` | Research vault; obey its local `AGENTS.md` and topic instructions |

Windows packages live in `winget/configuration/{core,work,dev}.dsc.yaml`; edit the applicable file and preserve `id: <id>  # <Display Name>` with two spaces before `#` so `install.ps1 -ListPackages` continues to work.
