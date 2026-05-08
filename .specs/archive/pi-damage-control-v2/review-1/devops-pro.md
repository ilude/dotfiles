## Finding 1
severity: high
evidence: The plan’s required lint gate is `cd pi/tests && pnpm exec biome check ...`, but `pi/tests/package.json` has only `vitest`, `typescript`, and coverage dependencies, and no `biome` dependency exists in package manifests. In a fresh pnpm install, `pnpm exec biome` cannot be relied on as a frozen-lockfile local tool.
required_fix: Add Biome to the owning pnpm workspace/package lock, or replace the gate with the repository’s actual formatter/linter command and verify it after deleting/reinstalling `pi/tests/node_modules`.

## Finding 2
severity: high
evidence: Rollback is specified as `git checkout -- pi/extensions/damage-control.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts pi/justfile`. The plan also states those files may already contain partial WIP from a prior session. Running this rollback will discard pre-existing user/session work, not just the new implementation wave.
required_fix: Require preflight patch capture or a dedicated WIP commit/stash boundary before edits, and define rollback as applying the inverse of this plan’s patch only. Do not use path checkout unless the captured baseline is explicitly disposable.

## Finding 3
severity: medium
evidence: T9 accepts `rg -n "bun vitest|pnpm test" pi/justfile` as proof. This command passes if any `pnpm test` appears, even while unrelated or stale Bun test invocations remain. It also does not execute the just recipes under the configured Windows `pwsh.exe` shell.
required_fix: Replace with negative checks for all Pi Vitest Bun forms plus positive execution checks, e.g. `just -f pi/justfile test --dry-run` and `just -f pi/justfile test`, from both repo root and a different cwd.

## Finding 4
severity: medium
evidence: Manual validation uses `cd ~/.dotfiles/pi && just safe`, but the adversarial case is a fresh `/do-it` session or different cwd. `loadRules(cwd)` prioritizes `cwd/.pi/damage-control-rules.yaml`, so cwd affects rule source and status. The plan does not require validating launch/rule loading from outside `~/.dotfiles/pi`.
required_fix: Add a manual/smoke validation from a scratch cwd and from repo root that records the status-bar rule source, confirms fallback to `pi/damage-control-rules.yaml`, and verifies prompts still fire.

## Finding 5
severity: medium
evidence: `make check` is treated as repo-wide validation, but the plan allows archiving with “documented unrelated/pre-existing failure.” That weakens the gate without requiring a reproducible baseline proving the failure predates this work. In this repo, `make check` also runs environment-sensitive tools like `shellcheck`, `uv`, and all Claude hook tests.
required_fix: Before implementation, run and capture a baseline `make check` result. If final `make check` fails, require comparison to the baseline plus passing Pi-specific gates before classifying it unrelated; otherwise block archive.