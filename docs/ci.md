# CI contract

GitHub Actions validates a fresh checkout, not a fully installed personal machine.

## Targets

- `make check-ci` is the CI-safe Python/shell contract.
- `make check-pi-ci` is the CI-safe Pi Vitest contract.
- `make test-local` and `make test-runtime` are local/runtime checks; tests that need ignored or generated artifacts should skip themselves when those artifacts are absent.

## Bootstrap

`scripts/ci-bootstrap` is the shared CI setup entrypoint.

- `scripts/ci-bootstrap base` prints diagnostics and verifies tool visibility.
- `scripts/ci-bootstrap pi` also links the checkout into the Pi runtime paths used by Pi tests:
  - `~/.dotfiles -> $GITHUB_WORKSPACE`
  - `~/.pi/agent -> $GITHUB_WORKSPACE/pi`

The script refuses to create or replace home-directory links outside CI unless `--allow-local` is passed.

## Rules for new tests

- CI-safe tests must pass from a fresh checkout after the workflow installs declared dependencies.
- Tests that require local ignored artifacts, installed dotfiles state, or machine-specific runtime data must either live behind a local/runtime target or skip with a clear reason when the artifact is absent.
- Do not make tests depend on untracked files under `bin/`, `private/`, `pi/skills/pi-skills/`, or generated runtime state.
- Prefer adding setup to `scripts/ci-bootstrap` over duplicating runtime assumptions in workflow YAML.
