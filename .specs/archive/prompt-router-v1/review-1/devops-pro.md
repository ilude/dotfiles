# DevOps/Operational Safety Review

## Finding 1: High — Archive step is destructive/ambiguous for `/do-it`

**Evidence:** Archive rule says to “Move this plan/evidence to `.specs/archive/prompt-router-v1/`” after gates pass, but does not specify exact commands, collision behavior if archive path already exists, or whether moving active evidence should happen before final reporting. This is especially risky for a resumable `/do-it` workflow because moving the live plan changes the path the task was invoked with.

**Required fix:** Replace the archive instruction with explicit, idempotent commands and safety gates: check destination absence or create timestamped destination, copy first, verify copied files, then remove source only with explicit user approval or mark as ready-to-archive. Clarify whether `/do-it` should archive automatically or stop after writing `F5-archive-preflight.md`.

## Finding 2: Medium — Validation commands assume dependencies are already installed for some gates

**Evidence:** Several verify commands run `pnpm test`, `pnpm run typecheck`, or Python scripts directly, while only some validation gates include `pnpm install --frozen-lockfile`. Examples: T1/T3/T4/T5/T6 use `cd pi/tests && pnpm test prompt-router.test.ts`; T2 uses `uv run ... classify.py`; success criteria use `cd pi/extensions && pnpm run typecheck`. In a fresh session/worktree, missing `node_modules` can produce false failures.

**Required fix:** Standardize every executable validation command or wrapper to include dependency preflight, or define a single P0 dependency setup step: `cd pi/tests && pnpm install --frozen-lockfile`, `cd pi/extensions && pnpm install --frozen-lockfile`, and `uv run --project pi/prompt-routing ...` with expected uv sync behavior documented.

## Finding 3: Medium — Shell portability hazards in grep/head/test pipelines can mask failures

**Evidence:** P0 uses a grouped pipeline with `grep ... 2>/dev/null | head -300` redirected to evidence. T2 success criteria uses `uv ... invalid "hello"; test $? -ne 0`. These forms are fragile under Bash without `set -o pipefail`: grep errors can be hidden by `head`, and the invalid-mode command intentionally exits nonzero, which can be mishandled by `/do-it` wrappers that stop on first failure.

**Required fix:** Provide robust command blocks for intentional nonzero checks and pipelines, e.g. capture exit code explicitly with `set +e`, write stdout/stderr to evidence, then assert the expected code. For grep inventories, add `set -o pipefail` where appropriate or explicitly allow no-match status with `|| true` only when no-match is acceptable.

## Finding 4: Medium — Evidence and eval artifact paths are under-specified

**Evidence:** The automation plan says Python eval evidence includes “generated eval JSON,” and T7 writes `/tmp/router-eval-$m.json`. `/tmp` may be MSYS-specific on Windows Git Bash, is outside the spec evidence tree, and can be lost or conflict across runs. Multiple gates say “write evidence” but do not prescribe stdout/stderr filenames or JSON artifact locations.

**Required fix:** Require all generated artifacts to live under `.specs/prompt-router-v1/evidence/` with deterministic names, e.g. `V3-eval-config.json`, `V3-eval-t2.json`, `V3-eval-confgate.json`, plus matching `.log` files. Avoid `/tmp` for durable evidence.

## Finding 5: Low — Manual validation gate lacks executable readiness checks

**Evidence:** Manual validation says “Start a local Pi session with the modified extension loaded” and run `/router-status`/`/router-explain`, but does not specify the command to launch Pi from Windows Git Bash, how to confirm the modified extension is loaded, or how to capture sanitized output into `F3-manual-validation.md`.

**Required fix:** Add a concrete manual runbook with launch command, cwd, extension-load confirmation, exact prompts using non-sensitive synthetic text, output capture/redaction rules, and fallback criteria for classifying `implemented-awaiting-manual-validation`.
