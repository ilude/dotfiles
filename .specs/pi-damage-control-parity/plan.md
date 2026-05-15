# Pi Damage-Control Claude Parity Plan

## Context & Motivation

Pi damage-control does not currently match Claude Code damage-control. The immediate trigger was that `bash rm -f ...` did not prompt for approval in Pi, even though Claude Code damage-control policy already treats broad `rm` usage as approval-required. Investigation found a systemic gap: Claude has 352 `bashToolPatterns` entries (241 ask, 111 block), plus path, write-confirm, content-injection, secret-output, semantic git, AST, sequence, and taint behaviors; Pi currently has a much smaller TypeScript policy (`pi/damage-control-rules.yaml`) and engine.

Relevant files:

- Claude policy/runtime: `claude/hooks/damage-control/patterns.yaml`, `bash-tool-damage-control.py`, `edit-tool-damage-control.py`, `write-tool-damage-control.py`, `sequence-patterns.yaml`, `taint-config.yaml`, `tests/`.
- Pi policy/runtime: `pi/damage-control-rules.yaml`, `pi/extensions/damage-control.ts`, `pi/extensions/damage-control-engine.ts`, `pi/extensions/damage-control-rules.ts`, `pi/lib/yaml-mini.ts`, `pi/tests/damage-control.test.ts`.

Important starting state: before this plan was created, local uncommitted edits existed in `pi/damage-control-rules.yaml` and `pi/tests/damage-control.test.ts` from an initial narrow `rm -f` patch. `/do-it` must preserve those diffs as evidence before changing either file and must not silently discard them.

## Constraints

- Repo: `C:/Users/mglenn/.dotfiles` under Windows Git Bash/MSYS/MSYS2. Use forward slashes.
- Follow repo `AGENTS.md`: Pi TypeScript validation is pnpm-only. Do not use Bun for Pi TypeScript packages/tests.
- Use `uv run --with pyyaml python` for one-off Python helper scripts that import `yaml`; do not rely on ambient `python` having PyYAML.
- New reusable helper modules must live under `pi/lib/` or a non-auto-discovered subdirectory. Do not add new non-extension helper files as top-level `pi/extensions/*.ts`, because Pi auto-discovers every top-level extension file.
- If this plan introduces a new damage-control settings key or a `loadYamlViaPython` exception, update `pi/README.md` and `pi/extensions/README.md` in T6 to document the source, precedence, validation, and rollback behavior.
- Do not execute real dangerous commands. Tests must evaluate policy functions or mocked Pi tool-call handlers only.
- Do not expose real secrets. Use synthetic commands, synthetic file names, and temp/sandbox paths only.
- Claude `bashToolPatterns` are Bash-only by policy comment in `patterns.yaml`; do not apply them to `pwsh` unless a separate explicit Pi overlay rule says so.
- Existing Claude behavior is the compatibility target for each implemented phase. Any non-parity must be listed in the unsupported-feature ledger.

## Risk & Manual Gate Decision

- **Risk level:** Medium.
- **Blast radius:** Local repo runtime safety policy. A bug can over-block useful Pi tool calls or under-block dangerous commands, but changes are local and git-reversible.
- **Rollback:** Revert changed files from git and reapply `.specs/pi-damage-control-parity/evidence/preexisting-diff.patch` if preserving the initial narrow patch is still desired. After rollback, restart/reload any active Pi session and run a mocked policy smoke check against the active handler (no real command execution) to verify the runtime is using the restored policy.
- **Manual approval before execution:** Not required; work is local, non-destructive, and automated.
- **Manual validation after execution:** Not required; mocked approval and policy-parity tests are safer than manually trying dangerous commands.
- **Manual gate rationale:** No shared production system, paid resource, irreversible external side effect, hardware action, or real secret access is required.

## Alternatives Considered

1. **Patch only `rm -f`.** Fastest, but fails the user’s stated goal that Claude and Pi policies/functionality should align. Rejected as final scope; the existing narrow patch may be incorporated as a regression test.
2. **Copy all Claude rules into Pi YAML.** Simple short-term but guarantees drift and duplicates 352+ patterns. Rejected.
3. **Load/normalize Claude policy in Pi.** Recommended Phase A/B approach. It avoids duplicate policy and makes parity testable.
4. **Create a new generated shared schema immediately.** Cleanest long-term, but too large for this fix and risks changing Claude while fixing Pi. Defer until parity is measured.
5. **Shell out from Pi to Claude’s Python engine.** Maximizes reuse but adds runtime dependency, latency, and cross-platform fragility. Reject unless TypeScript normalization proves impractical.

Opposite-pattern fit check: separate per-client policies would be correct if Pi intentionally wanted weaker/smaller safety policy. The explicit goal here is the opposite: align Pi with Claude.

## Objective

Implement staged Pi/Claude damage-control parity with precise claims:

- **Phase A (required MVP):** Pi loads and normalizes Claude `bashToolPatterns` for Bash-command ask/block parity, with deterministic fallback to existing Pi policy only when Claude policy is unavailable. Fix the `rm`/`rm -f` regression through this path.
- **Phase B (required in this plan):** Pi supports Claude path/write policy sections that map to existing Pi tool surfaces: `zeroAccessPaths`, `zeroAccessExclusions`, `readOnlyPaths`, `noDeletePaths`, `writeConfirmPaths`, `contentScanPaths`, and `injectionPatterns`. Omitting a named Phase B section is a plan failure unless `/do-it` stops and records an explicit blocker requiring a new plan/scope decision.
- **Phase C (ledger/deferred unless implemented):** semantic git analysis, AST bash analysis, dry-run/context relaxation, readonly search relaxation, allowed-host exfil bypass, taint/sequence detection, and post-tool secret-output detection. These must not be claimed as complete unless implemented and tested.

## Project Context

Detected markers:

- Python: `pyproject.toml`, `uv`, `pytest`, `ruff`.
- TypeScript/JavaScript: `pi/tests/package.json`, `pi/extensions/package.json`, `pi/extensions/tsconfig.json`.
- Makefile: root `Makefile` has `check-pi-ci` and `check-pi-extensions`; use `check-pi-extensions` for extension typecheck + Vitest.
- Git attributes: `.gitattributes` exists.
- Spec path: `.specs/pi-damage-control-parity/`.

Target validation commands must be run with log capture as specified in `Validation Contract`.

## Automation Plan

1. Create `.specs/pi-damage-control-parity/evidence/` before implementation.
2. Preserve preexisting local diffs to `preexisting-diff.patch` before editing implementation files.
3. Generate `policy-inventory.md` using `uv run --with pyyaml python`.
4. Implement Phase A before Phase B. Phase B is required by this plan. Phase C can be documented/deferred, but final claims must say exactly what is complete.
5. Use deterministic policy loading for Phase A:
   - Default canonical source in this dotfiles repo: resolve `claude/hooks/damage-control/patterns.yaml` relative to the repo root / extension source tree when present.
   - Optional override source: env var `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` takes precedence over in-repo discovery. If a settings option is also implemented, use an object key such as `{ "damageControl": { "claudePolicyPath": "..." } }` read from `loadCascadedSettings().merged` with type guards; do not use dotted `getSetting("dangerCtrl.claudePolicyPath")` because dotted paths are not expanded.
   - If an explicit override path is set and missing or invalid, **fail policy health closed** -- do not silently fall back. Surface a single startup error and hard-block covered tool calls until resolved.
   - If no override is set and the in-repo Claude policy is unavailable, Pi runs in explicit "Pi-only mode": log a one-time loud startup warning ("Pi damage-control running in Pi-only mode; not at Claude parity") and surface a UI notification before any covered tool call is evaluated. This is the only path that loads `pi/damage-control-rules.yaml` fallback.
   - Do **not** merge Pi fallback rules with Claude canonical rules in Phase A.
   - Do **not** add Pi overlays until conflict precedence and order tests exist.
6. Normalization requirements:
   - Load `patterns.yaml` via either (a) an improved `loadYamlViaPython` contract in `pi/lib/yaml-helpers.ts` that returns structured success/error details and is testable for missing Python/PyYAML, or (b) an in-process YAML dependency in `pi/extensions` with lockfile updates. Do **not** use `pi/lib/yaml-mini.ts` for Claude policy (yaml-mini does not preserve non-string scalar typing -- `ask: true` would arrive as the string `"true"`). T6 must document this full-YAML exception in Pi docs.
   - Preserve Claude rule order.
   - Convert `bashToolPatterns[].pattern` to Pi regex, `ask === true` (strict boolean) to action `ask`, missing/false ask to action `block`, and scope these normalized rules to `bash` only. Reject any non-boolean `ask` scalar at load time and fail policy health closed.
   - Compile every normalized regex under Node at load/normalization time. Invalid/incompatible regexes must fail policy health closed, not get skipped at evaluation time.
   - Additionally syntax-scan every pattern for Python-only regex features that compile but match differently under ECMAScript: `(?P<`, `(?P=`, `\A`, `\Z`, `\z`, possessive quantifiers (`*+`, `?+`, `++`). Any pattern using these must fail policy health closed and be listed in the unsupported-features ledger -- compile-success is necessary but not sufficient for semantic parity.
   - Unknown/unsupported Claude sections or fields must be reported in inventory/ledger. Semantic/action keys that affect matching or outcome must fail closed if unsupported; non-semantic metadata keys may warn and appear in inventory without failing. T1 enumerates every distinct key seen across `bashToolPatterns[]` entries (including `exfil`, `tools`, `block`, etc.) and classifies each as supported-semantic / supported-metadata / deferred / unsupported-semantic. `exfil` must be implemented or explicitly excluded from Phase A claims; Phase A cannot claim all `bashToolPatterns` parity while silently dropping `exfil`.
7. Evidence must be produced with `tee` into named files and summarized in `evidence-manifest.md` with command, timestamp, exit code, git status/diff stat, fixture counts, mismatch count, and secret-scan result.
8. Evidence must be scanned before final archive. If evidence contains real secret-looking values, redact or abort and record the reason.
9. Active Pi sessions may need restart/reload after implementation. Document this in `rollout-note.md`.

## Execution Checklist

Invariant: checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated. `/do-it` must mark an item `[x]` immediately after its required verification passes and before starting any dependent or next sequential step.

- [x] T0 Preflight and local-diff preservation — Status: completed — Evidence: `evidence/preflight-status.log`, `evidence/preexisting-diff.patch`, `evidence/preflight-cached.patch`
- [x] T1 Claude/Pi policy inventory and scope contract — Status: completed — Evidence: `evidence/policy-inventory.md`, `evidence/scope-contract.md`
- [x] G1 Wave 1 validation gate — Status: completed — Evidence: Wave 1 required files present and scope contract contains Phase A/Phase C
- [x] T2 Claude bashToolPatterns adapter and typed normalization — Status: completed — Evidence: `pi/extensions/damage-control-rules.ts`, `pi/lib/yaml-helpers.ts`, `pi/tests/damage-control.test.ts`
- [x] T3 Engine parity for command/path outcomes and fail-closed compatibility — Status: completed — Evidence: `pi/extensions/damage-control-engine.ts`, `pi/tests/damage-control.test.ts`
- [x] T4 Tool-call integration with mocked ask/block/no-exec guarantees — Status: completed — Evidence: `pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts`
- [x] G2 Wave 2 validation gate — Status: completed — Evidence: final targeted Pi tests and typecheck passed; initial G2 logs include repair-loop failures
- [ ] T5 Claude-vs-Pi parity fixtures, oracle runner, and negative controls — Status: blocked — Evidence: `evidence/parity-diff.md` records that Claude subprocess oracle/per-pattern coverage runner is not completed; coverage_debt_count not established as 0
- [x] T6 Documentation, rollout note, and unsupported-feature ledger — Status: completed — Evidence: `pi/README.md`, `pi/extensions/README.md`, `evidence/rollout-note.md`, `evidence/unsupported-features.md`
- [ ] G3 Wave 3 validation gate — Status: blocked — Evidence: `evidence/parity-diff.md` exists but does not satisfy required Claude oracle/per-pattern coverage criteria
- [ ] F1 Task-specific verification — Status: blocked — Evidence: automated commands passed except parity contract remains incomplete
- [ ] F2 Repo-wide validation complete or not required — Status: pending — Evidence: `evidence/check-pi-extensions.log` passed, but final gate depends on F1
- [ ] F3 Manual validation complete or not required — Status: pending — Evidence: manual validation not required, but not final-marked because F1/F2 remain blocked/pending
- [ ] F4 Deployment validation complete or not required — Status: pending — Evidence: rollout note exists; no deployment required, but not final-marked because F1/F2 remain blocked/pending
- [ ] F5 Archive preflight — Status: blocked — Evidence: evidence manifest lacks required numeric parity fields with coverage_debt_count=0; plan not archived

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Preflight and local-diff preservation | `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`, `.specs/pi-damage-control-parity/evidence/preexisting-diff.patch` | Research/preflight | small | coding-light | none |
| T1 | Claude/Pi policy inventory and scope contract | `.specs/pi-damage-control-parity/evidence/policy-inventory.md`, `.specs/pi-damage-control-parity/evidence/scope-contract.md` | Research | medium | planner | T0 |
| G1 | Wave 1 validation gate | evidence only | Validation | medium | qa-engineer | T1 |
| T2 | Claude bashToolPatterns adapter and typed normalization | `pi/extensions/damage-control-rules.ts`, tests | Feature | large | typescript-pro | G1 |
| T3 | Engine parity for command/path outcomes and fail-closed compatibility | `pi/extensions/damage-control-engine.ts`, tests | Feature | large | typescript-pro | G1 |
| T4 | Tool-call integration with mocked ask/block/no-exec guarantees | `pi/extensions/damage-control.ts`, tests | Feature | medium | typescript-pro | G1 |
| G2 | Wave 2 validation gate | evidence logs | Validation | large | qa-engineer | T2, T3, T4 |
| T5 | Claude-vs-Pi parity fixtures, oracle runner, and negative controls | `pi/tests/damage-control.test.ts`, optional fixture/helper files under `pi/tests/` | Test | medium | qa-engineer | G2 |
| T6 | Documentation, rollout note, and unsupported-feature ledger | `pi/README.md`, `pi/extensions/README.md`, `.specs/pi-damage-control-parity/evidence/rollout-note.md`, `.specs/pi-damage-control-parity/evidence/unsupported-features.md` | Docs | small | utility-mini | G2 |
| G3 | Wave 3 validation gate | evidence logs | Validation | medium | qa-engineer | T5, T6 |
| F1 | Task-specific verification | evidence logs | Validation | medium | qa-engineer | G3 |
| F2 | Repo-wide validation complete or not required | evidence logs | Validation | medium | devops-pro | F1 |
| F3 | Manual validation complete or not required | evidence note | Validation | small | qa-engineer | F2 |
| F4 | Deployment validation complete or not required | rollout evidence note | Validation | small | devops-pro | F3 |
| F5 | Archive preflight | `.specs/pi-damage-control-parity/evidence/evidence-manifest.md` | Validation | small | qa-engineer | F4 |

### Task details

#### T0 Preflight and local-diff preservation

Commands:

```bash
mkdir -p .specs/pi-damage-control-parity/evidence
git status --short | tee .specs/pi-damage-control-parity/evidence/preflight-status.log
git diff HEAD -- pi/damage-control-rules.yaml pi/tests/damage-control.test.ts | tee .specs/pi-damage-control-parity/evidence/preexisting-diff.patch
git diff --cached -- pi/damage-control-rules.yaml pi/tests/damage-control.test.ts | tee .specs/pi-damage-control-parity/evidence/preflight-cached.patch
```

Note: use `git diff HEAD --` (not bare `git diff --`) so staged edits are captured. The bare form omits anything already in the index. Also archive the staged-only view separately in `preflight-cached.patch`.

Pass:

- `preexisting-diff.patch` exists, even if empty.
- `preflight-cached.patch` exists, even if empty.
- If non-empty, later rollback notes preserve/reapply it unless the user explicitly discards it.

Fail:

- Implementation edits begin before preserving the diff.

#### T1 Claude/Pi policy inventory and scope contract

Commands:

```bash
uv run --with pyyaml python - <<'PY' 2>&1 | tee .specs/pi-damage-control-parity/evidence/policy-inventory.md
import pathlib, yaml
c = yaml.safe_load(pathlib.Path('claude/hooks/damage-control/patterns.yaml').read_text(encoding='utf-8'))
p = yaml.safe_load(pathlib.Path('pi/damage-control-rules.yaml').read_text(encoding='utf-8'))
print('# Damage-Control Policy Inventory')
print('| Area | Claude | Pi |')
print('|---|---:|---:|')
print(f"| Bash command rules | {len(c.get('bashToolPatterns', []))} | {len(p.get('dangerous_commands', []))} |")
print(f"| Ask command rules | {sum(1 for x in c.get('bashToolPatterns', []) if x.get('ask'))} | {sum(1 for x in p.get('dangerous_commands', []) if x.get('action') == 'ask')} |")
print(f"| Block command rules | {sum(1 for x in c.get('bashToolPatterns', []) if not x.get('ask'))} | {sum(1 for x in p.get('dangerous_commands', []) if x.get('action') != 'ask')} |")
for ck, pk in [('zeroAccessPaths','zero_access_paths'),('zeroAccessExclusions','zero_access_exclusions'),('writeConfirmPaths','write_confirm_paths'),('readOnlyPaths','read_only_paths'),('noDeletePaths','no_delete_paths'),('contentScanPaths','content_scan_paths'),('injectionPatterns','injection_patterns')]:
    cv = c.get(ck, [])
    pv = p.get(pk, [])
    print(f"| {ck} | {len(cv) if isinstance(cv, list) else int(bool(cv))} | {len(pv) if isinstance(pv, list) else int(bool(pv))} |")
print()
print('## Distinct keys observed in bashToolPatterns entries')
keys = {}
for entry in c.get('bashToolPatterns', []):
    if isinstance(entry, dict):
        for k in entry.keys():
            keys[k] = keys.get(k, 0) + 1
for k, count in sorted(keys.items()):
    print(f'- `{k}` ({count})')
PY
```

The inventory must enumerate every distinct key seen across `bashToolPatterns[]` entries (expected to include at minimum: `pattern`, `ask`, `reason`, `platforms`, `exclude_platforms`, `exfil`, possibly `tools`/`block`/others). Classify each enumerated key in the inventory file as supported-semantic / supported-metadata / deferred / unsupported-semantic. T2 must fail policy health closed if any rule carries an unsupported semantic/action key. `exfil` must be implemented or explicitly excluded from Phase A claims; silent dropping is a failure.

Also write `.specs/pi-damage-control-parity/evidence/scope-contract.md` defining Phase A/B/C, which sections are in/out, and final claim wording.

Pass:

- Inventory has nonzero Claude counts.
- Scope contract explicitly forbids claiming Phase C parity unless implemented.

Fail:

- Inventory cannot parse YAML.
- Scope contract is missing or vague.

#### T2 Claude bashToolPatterns adapter and typed normalization

Implement:

- Loader that reads Claude `patterns.yaml` through the chosen full-YAML path from the Automation Plan and normalizes `bashToolPatterns` for Phase A. Do not use `yaml-mini` for this file (it does not preserve booleans).
- If using `loadYamlViaPython`, first update its contract or wrap it so the caller receives structured errors for missing interpreter/PyYAML, invalid YAML, and JSON conversion failures; tests must prove these become diagnosable policy-health failures.
- Typed handling of `ask` (strict boolean -- reject string `"true"`/`"false"`), `pattern`, `reason`, `platforms`, `exclude_platforms`, and unsupported fields.
- Deterministic source selection: `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` override if set; otherwise discovered in-repo `claude/hooks/damage-control/patterns.yaml`; otherwise Pi-only fallback with loud warning/notification. A configured-but-missing/invalid override must fail policy health closed. No silent fallback.
- No rule merge/overlay in Phase A.
- Python-only regex feature scan: reject patterns containing `(?P<`, `(?P=`, `\A`, `\Z`, `\z`, or possessive quantifiers (`*+`, `?+`, `++`). Failing patterns must fail policy health closed and be listed in the unsupported-features ledger.

Required tests:

- Actual Claude YAML loads and yields expected command-rule count near current inventory.
- `ask: true` (boolean) maps to action `ask`; missing/false ask maps to `block`; string `"true"` for `ask` fails policy health closed (must not be accepted as truthy).
- All normalized regexes compile in Node; any invalid regex makes policy health failed.
- A synthetic pattern containing `(?P<x>...)` makes policy health fail closed (Python-only regex rejection test).
- No override plus missing in-repo Claude policy produces a loud Pi-only-mode warning + UI notification; configured-but-missing override path fails policy health closed (no silent fallback to `pi/damage-control-rules.yaml`).
- Unsupported semantic/action fields cause policy health to fail closed rather than silently dropping. Non-semantic metadata fields warn and appear in inventory.
- `exfil` handling is covered by tests: either equivalent behavior is implemented for Phase A or all `exfil` rules are excluded from Phase A claims and counted as coverage debt that prevents claiming all-pattern parity.

Fail:

- Boolean `ask` is treated as a string and mapped incorrectly.
- Invalid regex is skipped during evaluation instead of failing policy health.
- Python-only regex feature in a pattern is accepted because it happens to compile under Node.
- Missing Claude policy at a configured path silently falls back to Pi rules.

#### T3 Engine parity for command/path outcomes and fail-closed compatibility

Implement:

- JS regex evaluation for normalized Claude Bash rules with Claude's matching semantics: **case-sensitive by default**, honoring any inline `(?i)` flag inside individual patterns. Do **not** force the global `i` flag on every rule -- that would cause `RM file` to match `\brm\b` while Claude allows it, producing wrong-direction parity breaks.
- Rule-order preservation.
- Bash-only scoping for Claude `bashToolPatterns`.
- Platform-aware evaluation: respect `platforms` / `exclude_platforms` against `process.platform` (Pi on Windows is `win32`). A `platforms:[linux]` rule must not fire when Pi runs on Windows; an `exclude_platforms:[win32]` rule must be skipped on Windows.
- Windows/MSYS path normalization for Phase B path policy: forward slashes, expanded home, stable drive-letter casing, `/c/...` and `/mnt/c/...` handling where applicable.
- Mandatory Phase B support for zero-access exclusions, read-only modification blocking, no-delete blocking, write-confirm classification, content-scan path selection, and injection-pattern scanning.

Required tests:

- `rm file` -> ask.
- `rm -f file` -> ask.
- `rm -rf /` -> block.
- `RM file` -> allow (case-sensitive default; matches Claude semantics).
- `git rm file` -> ask.
- `git push --force` -> block.
- `git push --force-with-lease` -> ask.
- Bash-only rule does not fire for `pwsh` solely because it came from `bashToolPatterns`.
- Platform scoping: with `process.platform` mocked to `win32`, a rule tagged `platforms:[linux]` does not fire; a rule tagged `exclude_platforms:[win32]` is skipped. With `process.platform` mocked to `linux`, the inverse holds.
- Windows/MSYS examples: `C:/Windows/...`, `C:\Windows\...`, `/c/Users/...`, `~/.ssh/id_ed25519`, and globbed credential paths.

Fail:

- Any catastrophic command asks instead of blocking.
- Any representative Claude ask/block command allows.
- Bash-only rules over-apply to pwsh.
- Universal case-insensitive matching produces ask/block where Claude allows.
- Platform-tagged rules fire on the wrong platform.

#### T4 Tool-call integration with mocked ask/block/no-exec guarantees

Implement:

- Pi `tool_call` handlers use normalized rules and existing decision logging.
- `ask` rules call `ctx.ui.confirm`; denial/no UI blocks; approval allows only the current operation.
- Hard blocks must not call confirmation.
- Handler tests use fake/mocked execution boundaries and assert no shell/pwsh process is spawned for ask/block paths.

Pass:

- Mocked bash handler prompts for ask rules.
- Mocked bash handler blocks hard-block rules without confirmation.
- Write/edit/truncate handlers enforce every named Phase B path/write policy section.
- Tests include a sentinel/canary that fails if a dangerous command would execute.

Fail:

- Handler test relies on real shell command execution.
- Approval persists beyond one operation without explicit design/tests.

#### T5 Claude-vs-Pi parity fixtures, oracle runner, and negative controls

Implement:

- A parity fixture runner that evaluates the same synthetic cases against Claude Python damage-control logic and Pi TypeScript logic, normalizing outcome to `allow|ask|block` plus stable category/reason where feasible.
- Claude oracle invocation contract: drive `claude/hooks/damage-control/bash-tool-damage-control.py` as a subprocess via `uv run --with pyyaml python`, sending synthesized tool-call JSON on stdin that matches the hook's actual schema, parsing the JSON decision response, and normalizing to `allow|ask|block`. Document the exact stdin/stdout JSON schema at the top of `parity-diff.md`. Do **not** import the hook's Python internals (unstable surface).
- Positive fixtures for required Phase A command families and all named Phase B path/write families.
- Negative controls for safe near-misses and allowed operations.
- Per-pattern outcome equivalence: in addition to family-level fixtures, the oracle must assert outcome equivalence on every Phase A Claude `bashToolPatterns` entry included in the claim. Any pattern whose Python and Node engines disagree on at least one representative input is a parity failure. Patterns with no matching input get listed in the coverage-debt artifact; `coverage_debt_count` must be `0` for any set claimed as Phase A parity. Deferred/excluded entries must be counted separately and excluded from the claim wording.
- Coverage-debt artifact for Claude patterns without a positive fixture; unreviewed entries must be listed and counted.

Required fixture examples:

- Positive: `rm file`, `rm -f file`, `rm -rf /`, `git rm file`, `git push --force`, `git push --force-with-lease`, `docker compose down`, metadata endpoint access, representative cloud/database/destructive command classes.
- Negative: safe git status/diff/log, text that mentions `rm -f` but is not a command if Claude allows it in context, zero-access exclusions, allowed read-only reads, benign write outside protected paths.

Pass:

- Parity runner produces `.specs/pi-damage-control-parity/evidence/parity-diff.md` with zero unapproved mismatches for implemented phases, `coverage_debt_count=0` for claimed Phase A patterns, and explicit counts for excluded/deferred entries.
- Fixture counts by family are included in evidence manifest.

Fail:

- Pi expected outcomes are asserted without comparing to Claude oracle for shared fixtures.
- Parity fixtures execute real dangerous commands.

#### T6 Documentation, rollout note, and unsupported-feature ledger

Implement:

- Update `pi/README.md` (add or revise the Damage Control section) to name canonical policy behavior, in-repo discovery, optional `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` override, Pi-only fallback mode, and restart/reload requirement. Do not create `pi/docs/` -- that directory is not a current convention in this repo.
- Update `pi/extensions/README.md` to document the full-YAML exception for Claude `patterns.yaml`, the chosen parser/helper behavior, and the auto-discovery guard: helper/adapter modules belong under `pi/lib/` or a non-auto-discovered subdirectory, not new top-level `pi/extensions/*.ts`.
- Write `.specs/pi-damage-control-parity/evidence/rollout-note.md` explaining that active Pi sessions must restart/reload after extension/policy changes.
- Write `.specs/pi-damage-control-parity/evidence/unsupported-features.md` with Phase C features and status: implemented, partially supported, deferred, or intentionally unsupported.

Pass:

- Final docs do not claim full Claude parity unless Phase C is implemented and tested.
- Rollout note is present and specific.

Fail:

- Documentation says “identical” while unsupported mechanisms remain deferred.

## Execution Waves

### Wave 1 — Baseline and scope contract

Tasks: T0, T1.

Validation gate G1:

```bash
test -f .specs/pi-damage-control-parity/evidence/preexisting-diff.patch
test -f .specs/pi-damage-control-parity/evidence/policy-inventory.md
test -f .specs/pi-damage-control-parity/evidence/scope-contract.md
grep -q 'Phase A' .specs/pi-damage-control-parity/evidence/scope-contract.md
grep -q 'Phase C' .specs/pi-damage-control-parity/evidence/scope-contract.md
```

### Wave 2 — Runtime implementation

Tasks: T2, T3, T4. T3/T4 may begin after G1 but must use the normalized policy contract from T2. If `/do-it` cannot coordinate shared interfaces safely, execute T2 first, then T3/T4.

Validation gate G2:

```bash
mkdir -p .specs/pi-damage-control-parity/evidence
(cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-damage-control-tests-g2.log
(cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-typecheck-g2.log
# No-real-shell-execution gate: scan changed Pi damage-control tests/helpers, not just one file.
# Only a dedicated Claude oracle wrapper may import child_process, and it must not pass fixture command strings to a shell.
CHANGED_PI_TESTS=$(git diff --name-only HEAD -- 'pi/tests/**/*' | grep -E 'damage-control|parity|oracle' || true)
if [ -n "$CHANGED_PI_TESTS" ]; then
  if grep -nE "execSync|spawnSync|exec\(|spawn\(|require\(['\"]child_process['\"]\)|from ['\"]child_process['\"]" $CHANGED_PI_TESTS | grep -v "claude-oracle"; then
    echo "FAIL: non-oracle Pi damage-control tests/helpers reference shell-execution primitives" | tee -a .specs/pi-damage-control-parity/evidence/no-real-shell-gate-g2.log
    exit 1
  fi
fi
echo "PASS: no unallowlisted shell-execution primitives in changed Pi damage-control tests/helpers" | tee .specs/pi-damage-control-parity/evidence/no-real-shell-gate-g2.log
```

### Wave 3 — Parity oracle, docs, and ledger

Tasks: T5, T6.

Validation gate G3:

```bash
(cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-damage-control-tests-g3.log
(cd claude/hooks/damage-control && uv run pytest tests/ -v --tb=short --durations=10) 2>&1 | tee .specs/pi-damage-control-parity/evidence/claude-damage-control-pytest-g3.log
test -f .specs/pi-damage-control-parity/evidence/parity-diff.md
test -f .specs/pi-damage-control-parity/evidence/unsupported-features.md
test -f .specs/pi-damage-control-parity/evidence/rollout-note.md
# No-real-shell-execution gate re-check at G3 across changed Pi damage-control tests/helpers.
CHANGED_PI_TESTS=$(git diff --name-only HEAD -- 'pi/tests/**/*' | grep -E 'damage-control|parity|oracle' || true)
if [ -n "$CHANGED_PI_TESTS" ]; then
  if grep -nE "execSync|spawnSync|exec\(|spawn\(|require\(['\"]child_process['\"]\)|from ['\"]child_process['\"]" $CHANGED_PI_TESTS | grep -v "claude-oracle"; then
    echo "FAIL: non-oracle Pi damage-control tests/helpers reference shell-execution primitives" | tee -a .specs/pi-damage-control-parity/evidence/no-real-shell-gate-g3.log
    exit 1
  fi
fi
echo "PASS: no unallowlisted shell-execution primitives in changed Pi damage-control tests/helpers" | tee .specs/pi-damage-control-parity/evidence/no-real-shell-gate-g3.log
```

### Final gates

- F1 Task-specific verification: rerun targeted Pi tests and typecheck with final logs.
- F2 Repo-wide validation complete or not required: run `make check-pi-extensions`, or run explicit equivalent install + typecheck + Vitest commands. Do not treat `make check-pi-ci` alone as sufficient for extension changes.
- F3 Manual validation complete or not required: mark not required with rationale from Risk section.
- F4 Deployment validation complete or not required: no external deployment; verify rollout note exists.
- F5 Archive preflight: create and validate evidence manifest, scan evidence for secrets, archive git diff stat/status.

## Dependency Graph

```text
T0 -> T1 -> G1
G1 -> T2 -> G2
G1 -> T3 -> G2
G1 -> T4 -> G2
G2 -> T5 -> G3
G2 -> T6 -> G3
G3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

- Phase A: Pi loads/normalizes Claude `bashToolPatterns` as canonical Bash-command policy from the in-repo `claude/hooks/damage-control/patterns.yaml` when available, or from explicit `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` override when set and valid. Missing/invalid explicit override fails policy health closed. Pi-only fallback runs only when no override is set and no in-repo Claude policy exists, with a loud startup warning + UI notification.
- Phase A: `rm file`, `rm -f file`, `rm -rf /`, `git rm file`, `git push --force`, and `git push --force-with-lease` match Claude ask/block outcomes in parity fixtures.
- Phase A: all normalized Claude Bash regexes compile under Node AND pass the Python-only feature scan (`(?P<`, `(?P=`, `\A`, `\Z`, `\z`, possessive quantifiers) or policy health fails closed with an archived incompatibility list. Matching is case-sensitive by default, honoring inline `(?i)`.
- Phase A: no normalized Claude Bash rule is applied to `pwsh` unless explicitly added as a Pi pwsh overlay with tests.
- Phase B: every named path/write section (`zeroAccessPaths`, `zeroAccessExclusions`, `readOnlyPaths`, `noDeletePaths`, `writeConfirmPaths`, `contentScanPaths`, `injectionPatterns`) matches Claude oracle for covered synthetic fixtures or the plan fails and records a blocker requiring replanning.
- Phase C: unsupported advanced mechanisms are documented and not included in final parity claims unless implemented/tested.
- No parity or handler test executes a real dangerous command.
- Evidence manifest records exact commands, timestamps, exit codes, git status/diff stat, fixture counts by family, covered pattern count, total claimed Phase A pattern count, `coverage_debt_count`, mismatch count, excluded/deferred count, and evidence secret-scan result. For claimed Phase A parity, `coverage_debt_count` must be `0`.

## Validation Contract

Task-specific final validation commands:

```bash
mkdir -p .specs/pi-damage-control-parity/evidence
(cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-damage-control-tests-final.log
(cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-typecheck-final.log
(cd claude/hooks/damage-control && uv run pytest tests/ -v --tb=short --durations=10) 2>&1 | tee .specs/pi-damage-control-parity/evidence/claude-damage-control-pytest-final.log
make check-pi-extensions 2>&1 | tee .specs/pi-damage-control-parity/evidence/check-pi-extensions.log
git status --short | tee .specs/pi-damage-control-parity/evidence/git-status-final.log
git diff --stat | tee .specs/pi-damage-control-parity/evidence/git-diff-stat-final.log
```

Final validation with captured exit codes:

```bash
mkdir -p .specs/pi-damage-control-parity/evidence
set -o pipefail
(
  echo "command=pi damage-control tests"
  cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts
) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-damage-control-tests-final.log
echo $? > .specs/pi-damage-control-parity/evidence/pi-damage-control-tests-final.exit
(
  echo "command=pi extension typecheck"
  cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
) 2>&1 | tee .specs/pi-damage-control-parity/evidence/pi-typecheck-final.log
echo $? > .specs/pi-damage-control-parity/evidence/pi-typecheck-final.exit
(
  echo "command=claude damage-control pytest"
  cd claude/hooks/damage-control && uv run pytest tests/ -v --tb=short --durations=10
) 2>&1 | tee .specs/pi-damage-control-parity/evidence/claude-damage-control-pytest-final.log
echo $? > .specs/pi-damage-control-parity/evidence/claude-damage-control-pytest-final.exit
(
  echo "command=make check-pi-extensions"
  make check-pi-extensions
) 2>&1 | tee .specs/pi-damage-control-parity/evidence/check-pi-extensions.log
echo $? > .specs/pi-damage-control-parity/evidence/check-pi-extensions.exit
git status --short | tee .specs/pi-damage-control-parity/evidence/git-status-final.log
git diff --stat | tee .specs/pi-damage-control-parity/evidence/git-diff-stat-final.log
```

Secret/evidence scan command:

```bash
uv run python - <<'PY' 2>&1 | tee .specs/pi-damage-control-parity/evidence/evidence-secret-scan.log
from pathlib import Path
import re, sys
root = Path('.specs/pi-damage-control-parity/evidence')
patterns = {
    'aws_access_key': re.compile(r'\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b'),
    'private_key': re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    'github_token': re.compile(r'\bgh[pousr]_[A-Za-z0-9_]{20,}\b'),
    'generic_assignment_secret': re.compile(r'(?i)\b(?:password|passwd|api[_-]?key|token|secret)\s*=\s*[^\s]{12,}'),
}
findings = []
for path in sorted(root.rglob('*')):
    if not path.is_file() or path.name == 'evidence-secret-scan.log':
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    for name, pattern in patterns.items():
        for match in pattern.finditer(text):
            sample = match.group(0)[:12] + '...[redacted]'
            findings.append((str(path), name, sample))
if findings:
    print('# Evidence Secret Scan')
    print('status=failed')
    for item in findings:
        print('|'.join(item))
    sys.exit(1)
print('# Evidence Secret Scan')
print('status=passed')
PY
echo $? > .specs/pi-damage-control-parity/evidence/evidence-secret-scan.exit
```

Evidence manifest command template:

```bash
uv run python - <<'PY' 2>&1 | tee .specs/pi-damage-control-parity/evidence/evidence-manifest.md
from pathlib import Path
import subprocess, datetime, sys
root = Path('.specs/pi-damage-control-parity/evidence')
required_exits = [
    'pi-damage-control-tests-final.exit',
    'pi-typecheck-final.exit',
    'claude-damage-control-pytest-final.exit',
    'check-pi-extensions.exit',
    'evidence-secret-scan.exit',
]
print('# Evidence Manifest')
print(f'timestamp={datetime.datetime.now().isoformat()}')
print('head=' + subprocess.check_output(['git','rev-parse','--short','HEAD'], text=True).strip())
print('## Exit codes')
failed = False
for name in required_exits:
    p = root / name
    value = p.read_text(encoding='utf-8').strip() if p.exists() else 'missing'
    print(f'{name}={value}')
    if value != '0':
        failed = True
parity = root / 'parity-diff.md'
text = parity.read_text(encoding='utf-8', errors='ignore') if parity.exists() else ''
regex = __import__('re')
mismatch = (m.group(1) if (m := regex.search(r'mismatch_count\s*[:=]\s*(\d+)', text)) else 'unknown')
fixture = (m.group(1) if (m := regex.search(r'fixture_count\s*[:=]\s*(\d+)', text)) else 'unknown')
coverage_debt = (m.group(1) if (m := regex.search(r'coverage_debt_count\s*[:=]\s*(\d+)', text)) else 'unknown')
covered_patterns = (m.group(1) if (m := regex.search(r'covered_pattern_count\s*[:=]\s*(\d+)', text)) else 'unknown')
total_phase_a = (m.group(1) if (m := regex.search(r'total_phase_a_pattern_count\s*[:=]\s*(\d+)', text)) else 'unknown')
excluded_deferred = (m.group(1) if (m := regex.search(r'excluded_deferred_count\s*[:=]\s*(\d+)', text)) else 'unknown')
print('## Parity summary')
print('parity_diff_exists=' + str(parity.exists()).lower())
print('mismatch_count=' + mismatch)
print('fixture_count=' + fixture)
print('coverage_debt_count=' + coverage_debt)
print('covered_pattern_count=' + covered_patterns)
print('total_phase_a_pattern_count=' + total_phase_a)
print('excluded_deferred_count=' + excluded_deferred)
if (
    not parity.exists()
    or mismatch == 'unknown'
    or fixture == 'unknown'
    or coverage_debt == 'unknown'
    or covered_patterns == 'unknown'
    or total_phase_a == 'unknown'
    or excluded_deferred == 'unknown'
    or mismatch != '0'
    or coverage_debt != '0'
):
    failed = True
print('## Git status')
status = root / 'git-status-final.log'
print(status.read_text(encoding='utf-8', errors='ignore') if status.exists() else 'missing')
print('## Diff stat')
diff = root / 'git-diff-stat-final.log'
print(diff.read_text(encoding='utf-8', errors='ignore') if diff.exists() else 'missing')
if failed:
    sys.exit(1)
PY
echo $? > .specs/pi-damage-control-parity/evidence/evidence-manifest.exit
```

F5 pass/fail criteria:

- All `*.exit` files listed above exist and contain `0`.
- `evidence-secret-scan.log` contains `status=passed`.
- `evidence-manifest.md` contains timestamp, HEAD, exit codes, git status, diff stat, fixture count, fixture counts by family, covered pattern count, total Phase A pattern count, coverage debt count, excluded/deferred count, and mismatch count.
- `parity-diff.md` exists and reports zero unapproved mismatches for implemented phases and `coverage_debt_count=0` for claimed Phase A patterns. If any required count is `unknown`, F5 fails until the parity runner writes those fields.
- Do not archive real zero-access file contents.
- Archive/evidence preflight confirms generated Pi runtime paths are not staged or archived: `pi/history/`, `pi/sessions/`, `pi/multi-team/sessions/`, `pi/logs/`, `pi/cache/`, expertise logs, and `node_modules/` must be absent from `git status --short` and evidence manifests unless explicitly sanitized and justified.

Manual validation: not required.

Deployment validation: not required beyond `rollout-note.md`; this is local extension/policy code.

## Handoff Notes

- Preserve `.specs/pi-damage-control-parity/evidence/preexisting-diff.patch` before implementation edits.
- Prefer the Phase A adapter path over hand-copying rules.
- Be precise in final status: “Claude `bashToolPatterns` parity for Bash commands” is acceptable for Phase A; “full Claude parity” is not acceptable until Phase C mechanisms are implemented and tested.
- Active Pi sessions may need restart/reload after extension changes.
- Do not commit unless the user explicitly asks after validation passes.

## Execution Status

- Completion classification: blocked-by-failure.
- Date: 2026-05-14.
- Last completed wave/gate: Wave 2 / G2 implementation validation. T6 documentation artifacts were also completed after G2.
- Next wave/gate to run: T5 Claude-vs-Pi parity fixtures/oracle runner, then G3.
- Implemented in this run: preserved preexisting diffs; generated inventory/scope evidence; added Claude `patterns.yaml` loading/normalization for Pi damage-control; added structured PyYAML loader helpers; added Phase B path/write policy enforcement; added/updated mocked damage-control tests; updated Pi docs, rollout note, and unsupported-feature ledger.
- Why not archived: the plan requires a Claude subprocess oracle plus per-pattern coverage with `coverage_debt_count=0` for claimed Phase A parity. `evidence/parity-diff.md` explicitly records that this oracle/per-pattern runner is not complete, and `evidence/evidence-manifest.md` does not contain the required numeric parity fields. Archive preflight therefore fails.
- Commands/evidence completed successfully: `cd pi/tests && pnpm test damage-control.test.ts` (`evidence/pi-damage-control-tests-final.exit=0`); `cd pi/extensions && pnpm run typecheck` (`evidence/pi-typecheck-final.exit=0`); `make check-pi-extensions` (`evidence/check-pi-extensions.exit=0`); `cd claude/hooks/damage-control && uv run pytest tests/ -v --tb=short --durations=10` (`evidence/claude-damage-control-pytest-final.exit=0`); evidence secret scan (`evidence/evidence-secret-scan.exit=0`).
- Repair-loop notes: earlier G2 Pi test runs failed and were repaired; final targeted Pi tests/typecheck passed.
- Commands/checks still needed: implement the T5 Claude subprocess oracle wrapper against `claude/hooks/damage-control/bash-tool-damage-control.py`; generate `parity-diff.md` with `mismatch_count`, `fixture_count`, `coverage_debt_count`, `covered_pattern_count`, `total_phase_a_pattern_count`, and `excluded_deferred_count`; ensure `coverage_debt_count=0` for the claimed Phase A pattern set; rerun G3 and all final validation/manifest commands from the Validation Contract.
- Remaining user/manual steps: none; manual validation and deployment are not required by the plan.
- Resume guidance: rerun `/do-it .specs/pi-damage-control-parity/plan.md` after implementing/fixing T5 parity oracle coverage, or run `/review-it .specs/pi-damage-control-parity/plan.md` first if the scope should be reduced to exclude per-pattern oracle parity.
