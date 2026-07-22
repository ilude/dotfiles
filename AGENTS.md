# AGENTS.md

Repository-wide rules for coding agents. This cross-platform dotfiles repository supports Linux, Windows PowerShell, Git Bash/MSYS2, and WSL; uses Dotbot and git submodules including `dotbot/` and `menos/`; and converges terminals on zsh.

Read this file first. More specific instructions for the active client or directory take precedence without changing this file's repository-wide invariants:

- Claude Code: `CLAUDE.md`
- OpenCode/Codex: `opencode/AGENTS.md`
- Copilot: `copilot/`
- Pi global instructions: [`pi/AGENTS.md`](pi/AGENTS.md); Claude global instructions: `claude/CLAUDE.md` (independent files, no symlink)
- Pi runtime: [`pi/README.md`](pi/README.md)

Claude hooks, commands, settings, and runtime workarounds are Claude-only. `menos/` deployment and Claude-only content ingestion are also outside this file's scope. Follow the owning surface rather than blending client, shell, PowerShell, WSL, or platform conventions.

## Command index

Installation details live in [`README.md#installation`](README.md#installation), with development guidance in [`README.md#development`](README.md#development); the entrypoints are:

```bash
# Linux, Git Bash, MSYS2
~/.dotfiles/install

# WSL
~/.dotfiles/wsl/install
~/.dotfiles/wsl/install --packages
```

```powershell
# Windows PowerShell
~\.dotfiles\install.ps1
~\.dotfiles\install.ps1 -Work
~\.dotfiles\install.ps1 -ITAdmin
~\.dotfiles\install.ps1 -NoElevate
~\.dotfiles\install.ps1 -ListPackages
```

Validation commands:

```bash
make test
make test-quick
make test-pytest
make lint
make lint-python
make format
make check
just update
```

Tooling rules:

- Python tooling uses `uv`; tests use `pytest`, Python lint/format uses `ruff`, shell lint uses `shellcheck`, shell format uses `shfmt`, and `pyproject.toml` sets Python 3.9 as the floor.
- Prefer `bun` for general JavaScript/TypeScript work. Never use `npm` or create/commit `package-lock.json`.
- Pi TypeScript is pnpm-only, with `pi/package.json` as the dependency, typecheck, and Vitest source of truth. Never use `bun add`, `bun install`, `bun run`, or `bun test` for Pi packages/tests. Run `cd pi && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd pi && pnpm test`.
- For one Vitest file, pass the filter directly, for example `cd pi && pnpm test operator-status.test.ts`; never insert `--`, because the script passes it through to Vitest and would run the full suite.
- `@earendil-works/*` and `@sinclair/*` are intentionally absent from `pi/package.json`; `scripts/pi-deps-link-setup` links them from pnpm-global into `pi/node_modules` so they match the installed Pi binary. See [`pi/README.md#javascript-package-manager-policy`](pi/README.md#javascript-package-manager-policy).
- Validation must exercise the changed contract or regression. When the request requires preserving a workflow, validate its user entrypoint and sequence. A smoke test is not contract verification; identify it as such. Never claim behavior that was not run and observed.
- Use proportionate checks for the changed contract. Stop testing when additional runs are unlikely to change the implementation decision or confidence.
- For bug fixes, define the expected successful outcome before editing. When exact workflow validation is required by the requested behavior and is blocked, report the fix as incomplete and name the blocker.

## Repository invariants

### Install, links, and shells

The installer entrypoints and supporting paths are indexed in [`README.md#structure`](README.md#structure); inspect the entrypoint before changing its flow.

- `wsl/install.conf.yaml` must mirror every relevant cross-platform link from `install.conf.yaml`. Add the WSL equivalent with each cross-platform link; exclude Windows-only targets such as the PowerShell profile and Windows VS Code paths.
- All terminals converge through `.bash_profile -> .zshenv -> .zshrc`; see the [shell architecture](README.md#shell-architecture).
- In MSYS2 and Git Bash, pass `ZDOTDIR` through `env` when execing zsh.
- In shell config and prompt logic, prefer `${ZDOTDIR:-$HOME}` over raw `~` or `$HOME` when path resolution crosses the Git Bash/MSYS2 boundary.
- On Windows with MSYS2, `nsswitch.conf` must resolve HOME with `db_home: env windows cygwin desc`.
- In WSL prompt normalization, compare Windows-home paths case-insensitively.
- Canonical platform helpers live in `zsh/rc.d/00-helpers.zsh`; standalone scripts may redefine platform detection only to remain self-contained.

### Git identity, LFS, and submodules

- Git identity switches by directory and remote URL; see the [Git identity system](README.md#git-identity-system), and keep machine-specific SSH config in gitignored local files managed by [`scripts/git-ssh-setup`](scripts/git-ssh-setup).
- Personal SSH key priority is `id_ed25519-personal`, then generic `id_ed25519`.
- Work SSH key priority is `id_ed25519-work`, then `id_ed25519-eagletg`; work must not fall back to generic `id_ed25519`.
- [`.gitattributes`](.gitattributes) may route only `patches/msys2-runtime/*.dll` through Git LFS. If LFS hooks hang or git becomes slow, run [`scripts/git-lfs-health.ps1`](scripts/git-lfs-health.ps1) with `pwsh -File` before retrying. Do not remove or bypass hooks by default; bypass only after staged-diff and LFS health checks pass and the user approves.
- Never force-push a submodule repository. Never amend or rebase an already-pushed submodule commit. Pull inside the submodule before updating the parent repository's pinned reference.
- If `git pull` fails on a submodule fetch, recover with:

```bash
git pull --no-recurse-submodules
git submodule update --init --recursive
```

### Implementation and workflow

- All scripts must be idempotent. Use LF line endings only.
- VS Code is the default editor, diff tool, and merge tool. The default branch is `main`.
- Dotbot link defaults rely on `force: true`, `relink: true`, and `create: true`.
- In Onramp/Caddy stack variables, a service `port` is the container/service port reachable on the Docker Compose network. Do not reinterpret it as host publishing, split it into host/internal ports, or assume a host bind unless explicitly requested.
- Use only tools, workflows, permissions, and memory/task systems available in the active harness. If a capability is absent, adapt instead of assuming or naming it.
- Use deterministic code/tooling for routing, retries, transforms, status handling, install detection, and validation. Reserve model judgment for synthesis, review, classification, and ambiguous language.
- Do not add try-catch wrappers, guard flags, or fallback logic unless requested. Solve the domain problem directly; missing data or dependencies must fail explicitly, never through silent defaults. Remove redundant paths rather than wrapping old logic in fallback flags. Do not bypass a failed supported entrypoint with an alternate host runtime or lower-level command when that changes the environment, behavior, or state; report the blocker instead.
- Keep planning proportional: brief prose for complex work, none for simple work, and clarification only when ambiguity changes correctness or direction.
- For lists or batches, track every item to completed, explicitly skipped with reason, or blocked before finalizing.
- Stop research when the core question is answered and further retrieval is unlikely to change the conclusion; be exhaustive only when requested.

### Rollout and incident discipline

- For live stateful infrastructure, replace or migrate one independent service per rollout until the canary is healthy. Before mutation, require a current backup, a known restore path, an explicit rollback boundary, and a reviewed plan naming every create, update, replace, and delete.
- The first failed live mutation enters incident mode: stop roadmap work, broad applies, parallel recovery, and unrelated refactoring. Diagnose directly, recover one service, preserve healthy services, and exit incident mode only after the original endpoint and state checks pass.
- Direct command output, saved logs, and endpoint checks outrank summaries. The parent executing or coordinating live work must independently verify critical plan and health claims.
- Reuse the user's authorization for repeated in-scope, non-destructive recovery steps. Ask again only when the target, destructive scope, rollback risk, or intended outcome materially changes.

### Windows process churn

If agent work coincides with high LSM, CryptSvc, Git LFS, MSYS helper, or console-host CPU, run [`scripts/diagnose-windows-process-churn.ps1`](scripts/diagnose-windows-process-churn.ps1) with `pwsh -File` before guessing. Correlate System log `Tcpip` event ID `4227` with recent subprocess-heavy work; prefer fixing process churn through caching, timeouts, and child-tree cleanup over repeated retries.

## Ownership and navigation

For command ownership and the full client surface catalog, see [`docs/agent-command-surfaces.md`](docs/agent-command-surfaces.md). Pi runtime features, safety systems, slash/workflow commands, skills, routing, status UI, tools, and operator behavior are Pi-first and belong in `pi/` unless the user explicitly requests another client or cross-client support; follow [`pi/README.md`](pi/README.md). When client or platform patterns conflict, follow the owning/local surface and flag any consequential conflict.

Key paths:

| Path | Purpose |
| --- | --- |
| `install`, `install.ps1`, `wsl/` | Primary installers and WSL install/config/validation |
| `install.conf.yaml` | Cross-platform Dotbot links |
| `zsh/env.d/`, `zsh/rc.d/` | Environment and interactive zsh modules; platform helpers start in `zsh/rc.d/00-helpers.zsh` |
| `config/git/`, `powershell/profile.ps1` | Git and PowerShell configuration |
| `test/` | Repository tests |
| `plugins/`, `dotbot/` | zsh plugins and Dotbot submodule |
| `docs/research/obsidian-vault/` | Research vault; obey its local `AGENTS.md` and topic instructions |

Windows packages live in `winget/configuration/{core,work,dev}.dsc.yaml`; edit the applicable file and preserve `id: <id>  # <Display Name>` with two spaces before `#` so `install.ps1 -ListPackages` continues to work.

Current Pi expertise ownership and implementation notes live in [`pi/docs/expertise-layering.md`](pi/docs/expertise-layering.md); do not duplicate them here.
