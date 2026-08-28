# CI contract

GitHub Actions validates a fresh checkout, not a fully installed personal machine.

## Bootstrap diagnostics

`scripts/ci-bootstrap base` prints the repository, working directory, home, runner, CI flag, and versions or availability for Git, Python, Python 3, uv, Node, pnpm, bun, shellcheck, and related tools. It does not install dependencies or change home-directory links.

`scripts/ci-bootstrap pi` prints the same diagnostics and exposes the checkout through the Pi paths used by Pi tests:

- `~/.dotfiles -> $GITHUB_WORKSPACE`
- `~/.pi/agent -> $GITHUB_WORKSPACE/pi`

Pi mode refuses to create or replace those home links outside CI unless `--allow-local` is supplied. It also requires `HOME`.

## CI targets

- `make check-ci` runs `lint` and `test-ci`.
- `test-ci` first runs `test-ci-contract`, then runs the portable pytest suites with `-m "not zsh"`; it excludes the contract test from the second invocation.
- `make check-pi-ci` installs `pi/` dependencies with `pnpm install --frozen-lockfile`, runs `scripts/pi-deps-link-setup` to link the globally installed Pi packages, and runs `cd pi && pnpm test`.

The workflow installs `bats` and `shellcheck` on Linux/macOS, and installs zsh through MSYS2 on Windows. It also exports `ZSH_EXECUTABLE` for the Windows zsh checks.

Linux and macOS run `make check-ci`, then the zsh runtime contracts. Windows runs the portable pytest command directly:

```text
uv run pytest test/ claude/hooks/*/tests/ -m "not zsh" -v --tb=short
```

The separate `pi-vitest` job runs Pi bootstrap, installs bun and pnpm, installs the global Pi packages at the versions named in the workflow, and then runs `make check-pi-ci`.

## Local targets

- `make test-local` is an alias for `make test`, the local portable pytest suite. Tests needing absent ignored or generated runtime artifacts skip themselves where supported.
- `make test-runtime` runs `check-pi-extensions`: Pi dependency installation, Pi dependency linking, typecheck, the Pi suite excluding commit-mutation tests, and the isolated commit-mutation suite.

These local targets are not interchangeable with the CI targets. `test-local` covers the repository's portable pytest tests; `test-runtime` covers Pi type/runtime checks.

## Dependency boundaries

Python tests and lint use `uv`. Pi TypeScript tests use pnpm in `pi/`; `pi/package.json` and its lockfile own those dependencies. The workflow separately installs the Pi runtime packages globally so `scripts/pi-deps-link-setup` can link the versions required by the extension tests. Do not infer that local machine packages or ignored runtime state are available in a fresh CI checkout.

Zsh tests are marked `zsh` and are excluded from the portable pytest commands. The workflow supplies zsh and runs them in their own runtime-contract step. Pester is outside CI: `make test-powershell` invokes local Windows PowerShell tests, but the workflow does not install or run Pester.
