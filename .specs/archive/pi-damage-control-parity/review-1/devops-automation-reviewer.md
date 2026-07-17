# DevOps / Automation Adversarial Review

## Findings

### 1. Severity: High — `make check-pi-ci` is treated as a broad Pi gate but does not run extension typecheck

**Evidence:** The plan says broader CI-safe Pi checks can use `make check-pi-ci`, and Final Gate F2 says to run it if available. In this repo, `Makefile` target `check-pi-ci` runs `cd pi/extensions && pnpm install --frozen-lockfile` and `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`, but it does **not** run `pnpm run typecheck`. A fresh `/do-it` could archive a passing `check-pi-ci` log while TypeScript extension errors remain undetected.

**required_fix:** Update the plan’s gate language so `check-pi-ci` is not considered sufficient for extension changes unless paired with `cd pi/extensions && pnpm run typecheck`, or require `make check-pi-extensions` for the repo-wide Pi gate because that target includes both typecheck and tests.

### 2. Severity: Medium — evidence archive commands can fail or leak misleading status because logs are not captured consistently

**Evidence:** The plan requires logs for targeted tests, typecheck, Claude hook tests, final diff summary, and archive preflight, but most validation commands are shown without redirection/tee and without exact artifact paths. `/do-it` starting fresh may run commands interactively, then have no durable proof under `.specs/pi-damage-control-parity/evidence/` for F1–F5.

**required_fix:** Add exact log-producing commands for each gate, e.g. `... 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-tests.log`, `pi-typecheck.log`, `claude-hooks-pytest.log`, `git-diff-stat.log`, plus explicit pass criteria based on command exit codes and file existence.

### 3. Severity: Medium — dependency install assumptions are inconsistent across gates

**Evidence:** The Validation Contract includes `pnpm install --frozen-lockfile` before tests/typecheck, but Wave 2 and Wave 3 gates use `pnpm test` / `pnpm run typecheck` directly after prior steps. A fresh `/do-it` invocation or clean checkout may not have `node_modules`, causing non-reproducible failures unrelated to the implementation.

**required_fix:** Make every independently runnable gate include its own install step, or define one explicit preflight dependency step whose successful evidence is required before any gate runs. Prefer idempotent commands mirroring the final contract.

### 4. Severity: Medium — rollout/reload validation is only a handoff note, not a completion artifact

**Evidence:** The plan notes that already-running Pi processes may need restart/reload, but no checklist item or evidence artifact requires documenting the operator-facing reload behavior. Because this is a local safety extension, stale running processes are a realistic operational failure mode: validation passes in the repo while the active Pi session still uses old policy.

**required_fix:** Add a required documentation/evidence item under T6 or F4 that records the reload requirement and expected operator action, e.g. restart Pi session after extension/policy changes. Archive it as `.specs/pi-damage-control-parity/evidence/rollout-note.md` or include it in the unsupported-feature/status ledger.

### 5. Severity: Low — policy inventory script depends on Python `yaml` without declaring the project runner

**Evidence:** T1 uses `python - <<'PY'` with `import yaml`. The repo standard says Python tooling uses `uv`; a fresh environment may not have PyYAML on the ambient `python`, even if the project’s uv environment does. This makes the first discovery gate fragile.

**required_fix:** Replace the T1 command with a repo-standard runner, e.g. `uv run python - <<'PY' ...`, or add a preflight check that proves `python -c 'import yaml'` succeeds before relying on it.
