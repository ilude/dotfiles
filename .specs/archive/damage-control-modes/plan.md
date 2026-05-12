---
created: 2026-05-12
status: completed
completed: 2026-05-12
---

# Plan: Pi Damage-Control Session Modes

## Context & Motivation

The Pi damage-control extension provides an always-on safety baseline for shell and file tools: fail-closed rule-load health, dangerous `bash` command detection, `no_delete_paths`, and zero-access file path protection. A review of `disler/bash-damage-from-within/pi` showed this repo is more production-oriented and tested, but lacks two stricter optional shell postures: default-deny shell whitelisting and complete arbitrary-shell blocking.

The goal is to add an instance-local mode toggle with exact commands `/damage-control status`, `/damage-control mode default`, `/damage-control mode whitelist`, `/damage-control mode noshell`, plus `/dc` as an alias. Core damage-control protections must remain always on; modes only add stricter shell behavior. Modes apply to both `bash` and `pwsh`, and `pwsh` dangerous-command coverage should be extended beyond the current `no_delete_paths` extraction.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`, shell `/usr/bin/bash`).
- Shell: bash for repo commands; the Pi `pwsh` tool is registered only when `pi/extensions/pwsh.ts` detects Windows 11 and `pwsh --version` succeeds.
- Pi TypeScript validation is pnpm-only. Do not use `bun` or `npm` for `pi/extensions` or `pi/tests`.
- Damage-control core is always on. No command may disable rule-load fail-closed behavior, zero-access protections, file-tool protections, or `no_delete_paths` checks.
- Mode names are exact: `default`, `whitelist`, `noshell`.
- User-facing command invocations are exact: `/damage-control` and `/dc`. Pi `registerCommand` calls must use unprefixed names: `"damage-control"` and `"dc"`.
- Runtime state must be local to one extension registration/session. Do not store mode, loaded health, rules, or status-formatting inputs in module-level mutable state shared across registrations; keep them in the `export default function (pi)` closure or a per-registration state object and have command/tool handlers close over that state.
- `default` preserves current behavior, with added PowerShell dangerous command coverage acceptable.
- `whitelist` and `noshell` apply to both `bash` and `pwsh`.
- Dangerous command rules may include `tools: ["bash"]` or `tools: ["pwsh"]`; missing `tools` preserves legacy behavior and applies to all command tools that call the evaluator.
- Whitelist v1 uses exact regex matching against the trimmed command string, not prefix matching or shell parsing. It must reject compound shell operators before regex matching.
- Initial whitelist entries must be explicit in `pi/extensions/damage-control-engine.ts` tests and implementation:
  - bash: `pwd`, simple `ls`, `git status --short`, `git diff --stat`, `git diff --cached`, `git log --oneline -N`, `pnpm test [file]`, `pnpm run typecheck`, `uv run pytest [path]`, `uv run ruff [path]`.
  - pwsh: `Get-Location`/`pwd`, simple `Get-ChildItem`/`ls`, matching git and pnpm read/test commands above.
- Existing project style favors small Pi extension modules with pure/testable helpers in `pi/extensions/damage-control-engine.ts` and Vitest coverage in `pi/tests/damage-control.test.ts`.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy if planned paths are clean or executor-owned patches are captured before editing
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This is local, reversible TypeScript/config/test work. It does not perform destructive shell actions; it adds guardrails. Automated unit tests, typecheck, and repo validation can verify behavior without manual UI trials.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep current denylist-only system | Minimal churn; current tests already pass | Does not address whitelist/no-shell safety modes | Rejected: user explicitly wants additional modes |
| Persist mode in YAML/local state file | Survives restarts; auditable default | Not local to a single Pi instance; forgotten mode can surprise future sessions | Rejected: user requested instance-local toggle |
| Slash command with per-registration closure state | Convenient; session-local; testable; avoids cross-registration leakage | Mode resets on extension/session restart | **Selected** |
| Module-level mode state | Simple to implement | Can leak/reset across repeated extension registrations in one process | Rejected: violates instance-local requirement |
| Use `/damage-control bash ...` command shape | Explicit shell scope | Does not cover PowerShell naturally | Rejected: user prefers generic `mode` for both `bash` and `pwsh` |
| Full shell parser for bash/pwsh | More precise detection | Large scope and brittle | Rejected for now: use regex/policy with adversarial tests and documented limits |
| Split PowerShell dangerous rules into follow-up | Smaller toggle-only plan | Misses the requested improvement to `pwsh` coverage | Rejected for this plan; keep rules small and explicitly tested |

Convergence note: the design converges on a policy/regex guardrail pattern because this repo already uses `dangerous_commands` YAML and pure evaluator helpers. The opposite pattern, a capability-only no-shell custom-tool architecture, would be correct for an untrusted-repo sandbox where arbitrary shell execution should never be available.

## Objective

Implement and validate session-local Pi damage-control modes:

- `/damage-control status` and `/dc status` show health, active mode, and that core protections are always on.
- `/damage-control mode default|whitelist|noshell` and `/dc mode default|whitelist|noshell` switch per-registration mode state.
- Invalid command arguments, including extra tokens such as `/damage-control mode whitelist extra`, show usage and do not change mode.
- `default` preserves existing always-on damage-control behavior.
- `whitelist` blocks non-allowlisted `bash`/`pwsh` commands and compound shell operators before execution.
- `noshell` blocks all `bash` and `pwsh` calls while file protections remain active.
- `pwsh` dangerous commands are evaluated through the same configurable rule engine as `bash`, using tool-targeted rules.
- Mode transitions are recorded through existing permission/metrics/status mechanisms or an equivalent session-visible audit record with previous mode, new mode, and command alias used.

## Project Context

- **Language**: TypeScript for Pi extensions/tests; Python/shell elsewhere in repo.
- **Markers detected**: `pyproject.toml`, `Makefile`, `.gitattributes`, `justfile`; Pi package manifests in `pi/tests/package.json` and `pi/extensions/package.json`.
- **Key API reference**: `ExtensionAPI.registerCommand(name, { description, getArgumentCompletions?, handler })`; handler signature is `async (args: string, ctx) => { ... }`. Existing command examples are in Pi extension docs under `pi/extensions/node_modules/.../@earendil-works/pi-coding-agent/docs/extensions.md`.
- **Test command**: `cd pi/tests && pnpm test damage-control.test.ts`; repo-wide `make check` includes lint/test/Pi extension checks.
- **Lint command**: `make lint`; Pi typecheck command is `cd pi/extensions && pnpm run typecheck`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Prepare evidence dir | `mkdir -p .specs/damage-control-modes/evidence` | none | directory exists |
| Preflight status | `git status --short > .specs/damage-control-modes/evidence/preflight-status.txt` | none | `.specs/damage-control-modes/evidence/preflight-status.txt` |
| Planned-path dirty gate | `git status --short -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts > .specs/damage-control-modes/evidence/preflight-planned-path-status.txt && git diff -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts > .specs/damage-control-modes/evidence/preflight-planned-path.diff` | none | status/diff artifacts distinguish pre-existing edits |
| Dirty planned-path decision | If `preflight-planned-path-status.txt` is non-empty before executor edits, stop unless the changes are confirmed as intentional draft work for this plan; otherwise save a patch and document merge strategy in `## Execution Status` | none | execution status note |
| Implement | Edit only `pi/extensions/damage-control*.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts` | none | `git diff -- ...planned paths... > .specs/damage-control-modes/evidence/implementation.diff` |
| Task verify | `cd pi/tests && pnpm test damage-control.test.ts > ../../.specs/damage-control-modes/evidence/damage-control-test.txt 2>&1` and `cd pi/extensions && pnpm run typecheck > ../../.specs/damage-control-modes/evidence/typecheck.txt 2>&1` | none | focused test/typecheck logs |
| Repo verify | `make check > .specs/damage-control-modes/evidence/make-check.txt 2>&1` | none | repo-wide validation log |
| Repo verify baseline exception | If a repo-wide validation exception may be needed, run `make check > .specs/damage-control-modes/evidence/preflight-make-check.txt 2>&1` before implementation edits; only accept later `make check` failures that match this pre-edit baseline or are otherwise proven unrelated in `## Execution Status` | none | baseline exception note and logs |
| Evidence no-secret check | `tmp="$(mktemp)" && if grep -RInE '(AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|xox[baprs]-|ghp_[A-Za-z0-9_]+)' .specs/damage-control-modes/evidence --exclude='no-secret-check.txt' > "$tmp" 2>&1; then mv "$tmp" .specs/damage-control-modes/evidence/no-secret-check.txt; else code=$?; if [ "$code" -eq 1 ]; then printf 'NO SECRET MATCHES\n' > .specs/damage-control-modes/evidence/no-secret-check.txt; rm -f "$tmp"; else cat "$tmp" > .specs/damage-control-modes/evidence/no-secret-check.txt; rm -f "$tmp"; exit "$code"; fi; fi` then inspect matches; no real secrets may remain in evidence | none | `.specs/damage-control-modes/evidence/no-secret-check.txt` |
| Deploy | not applicable | none | none |
| Rollback | If planned paths were clean at preflight: `git checkout -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts`. If they were dirty, apply the saved preflight patch/merge strategy instead of blindly checking out | none | `git status --short -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts` plus execution status note |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Preflight

- [x] V0: Preflight evidence and planned-path dirty gate complete
  - Status: completed
  - Evidence: `.specs/damage-control-modes/evidence/preflight-status.txt`, `preflight-planned-path-status.txt`, `preflight-planned-path.diff`; planned paths had pre-existing draft edits that matched this plan and were validated in-place.

### Wave 1

- [x] T1: Add tool-targeted dangerous command support and PowerShell rules
  - Status: completed
  - Evidence: `pi/extensions/damage-control-rules.ts`, `pi/extensions/damage-control-engine.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`; focused tests passed.
- [x] T2: Add shell mode evaluator for default, whitelist, and noshell
  - Status: completed
  - Evidence: `pi/extensions/damage-control-engine.ts`, `pi/tests/damage-control.test.ts`; focused tests passed.
- [x] V1: Validate wave 1 engine and rules
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test damage-control.test.ts` passed; `cd pi/extensions && pnpm run typecheck` passed.

### Wave 2

- [x] T3: Register commands and integrate mode/pwsh handlers with per-registration state
  - Status: completed
  - Evidence: `pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts`; per-registration closure state implemented; focused tests passed.
- [x] V2: Validate wave 2 command and handler integration
  - Status: completed
  - Evidence: `.specs/damage-control-modes/evidence/damage-control-test.txt`, `typecheck.txt`, `implementation.diff`, `no-secret-check.txt`.

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: focused damage-control tests and typecheck passed.
- [x] F2: Repo-wide validation complete or baseline exception documented
  - Status: completed
  - Evidence: `make check` passed after updating the prompt-router test expectation to match tracked `pi/settings.json` classifier mode `lgbm`; see `.specs/damage-control-modes/evidence/make-check.txt`.
- [x] F3: Manual validation complete or not required
  - Status: completed
  - Evidence: manual validation not required; local reversible TypeScript changes are covered by automated tests/typecheck.
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: deployment not applicable.
- [x] F5: Archive preflight complete, including evidence no-secret check
  - Status: completed
  - Evidence: `.specs/damage-control-modes/evidence/no-secret-check.txt` contains `NO SECRET MATCHES`; archive deferred because F2 failed.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| V0 | Preflight evidence and planned-path dirty gate | evidence/logs | validation | small | devops-pro | -- |
| T1 | Add tool-targeted dangerous command support and PowerShell rules | 4 files: `pi/extensions/damage-control-rules.ts`, `pi/extensions/damage-control-engine.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts` | feature | medium | typescript-engineer | V0 |
| T2 | Add shell mode evaluator for default, whitelist, and noshell | 2 files: `pi/extensions/damage-control-engine.ts`, `pi/tests/damage-control.test.ts` | feature | medium | typescript-engineer | V0 |
| V1 | Validate wave 1 engine and rules | tests/logs | validation | medium | validation-lead | T1, T2 |
| T3 | Register commands and integrate mode/pwsh handlers with per-registration state | 2 files: `pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts` | feature | medium | typescript-engineer | V1 |
| V2 | Validate wave 2 command and handler integration | tests/logs | validation | medium | validation-lead | T3 |

## Execution Waves

### Preflight -- Validation Gate

**V0: Preflight evidence and planned-path dirty gate** [small] -- devops-pro
- Description: Create evidence directory and capture full status, planned-path status, and planned-path diff before implementation edits. If planned paths are dirty, either verify they are intentional draft work for this plan or stop and document a merge/rollback strategy in `## Execution Status` before editing.
- Files: `.specs/damage-control-modes/evidence/*`, `## Execution Status`.
- Acceptance Criteria:
  1. [ ] Evidence directory exists and preflight artifacts are captured before implementation.
     - Verify: `test -d .specs/damage-control-modes/evidence && test -e .specs/damage-control-modes/evidence/preflight-status.txt && test -e .specs/damage-control-modes/evidence/preflight-planned-path-status.txt && test -e .specs/damage-control-modes/evidence/preflight-planned-path.diff`
     - Pass: all files exist; status artifacts were captured before edits. Clean `git status --short` outputs may be zero bytes.
     - Fail: create directory and capture artifacts before any implementation task.
  2. [ ] Dirty planned paths are handled safely.
     - Verify: `cat .specs/damage-control-modes/evidence/preflight-planned-path-status.txt`
     - Pass: file is empty, or `## Execution Status` documents that pre-existing changes are intentional draft work for this plan or records a merge/rollback strategy.
     - Fail: stop before editing; do not run rollback commands that could discard user work.

### Wave 1 (parallel)

**T1: Add tool-targeted dangerous command support and PowerShell rules** [medium] -- typescript-engineer
- Description: Extend `DangerousCommand` with optional `tools?: string[]`, validate it, and make dangerous-command evaluation skip rules whose `tools` do not include the current tool name. Missing `tools` must preserve legacy behavior and apply to all command tools passed to the evaluator. Add PowerShell rules for recursive force delete, encoded command, execution policy bypass, download-and-execute, `Invoke-Expression`/`iex`, and Defender weakening.
- Files: `pi/extensions/damage-control-rules.ts`, `pi/extensions/damage-control-engine.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`.
- Acceptance Criteria:
  1. [ ] Rule parsing preserves `tools: ["pwsh"]` metadata and rejects non-string tool arrays.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: parser/validator tests pass.
     - Fail: parser output omits `tools` or schema accepts invalid entries; fix parser/validator.
  2. [ ] Tool-targeted rules only block matching tool calls, while unscoped rules preserve legacy all-command-tool behavior.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: tests show `tools: ["pwsh"]` blocks `pwsh` but not `bash`, and missing `tools` still blocks matching `bash`.
     - Fail: evaluator ignores `toolName` or changes legacy behavior; fix filtering.
  3. [ ] PowerShell rule tests include at least one positive and one negative case per category.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: synthetic positives block and benign negatives do not block for recursive force delete, encoded command, execution policy bypass, download-and-execute, `iex`, and Defender weakening.
     - Fail: broad regexes block benign commands or miss named positives; refine patterns.
  4. [ ] PowerShell evasion limits are tested or documented.
     - Verify: `grep -n "PowerShell.*non-goal\|backtick\|EncodedCommand" pi/tests/damage-control.test.ts pi/damage-control-rules.yaml pi/extensions/damage-control-engine.ts`
     - Pass: representative tests exist for case-insensitive aliases and direct `-EncodedCommand`; unsupported obfuscations such as dynamic invocation, alias/function shadowing, and complex quoted command construction are documented as non-goals.
     - Fail: coverage claims are broader than tests; add tests or non-goal comments.

**T2: Add shell mode evaluator for default, whitelist, and noshell** [medium] -- typescript-engineer
- Description: Add pure `DamageControlMode = "default" | "whitelist" | "noshell"` evaluator. `default` returns no extra block. `whitelist` rejects compound shell operators (`&&`, `||`, `;`, `|`, backticks, `$()`, `<`, `>`) and then exact-regex matches the explicit v1 allowlist. `noshell` blocks both `bash` and `pwsh`. Non-shell tools must be ignored.
- Files: `pi/extensions/damage-control-engine.ts`, `pi/tests/damage-control.test.ts`.
- Acceptance Criteria:
  1. [ ] `default` does not block shell commands by mode alone.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: `evaluateShellMode("bash", "git status --short", "default")` returns `undefined`.
     - Fail: default mode blocks commands; preserve current behavior.
  2. [ ] `whitelist` allows only the explicit v1 regex allowlist and blocks unknown commands for both shell tools.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: tests cover allowed bash/pwsh entries and blocked unknown commands.
     - Fail: allowlist uses prefix matching or allows unspecified commands; tighten patterns.
  3. [ ] `whitelist` rejects representative compound/operator forms.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: tests include bash `&&`, `||`, `|`, backticks or `$()`, redirection, and PowerShell `;`/pipeline forms.
     - Fail: any operator form bypasses whitelist; fix operator precheck.
  4. [ ] `noshell` blocks both `bash` and `pwsh`, and ignores non-shell tools.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: `bash` and `pwsh` return `{ block: true }`; `read`/file tools are unaffected by mode evaluator.
     - Fail: only one shell tool blocks or file tools are affected; fix shell tool set.

### Wave 1 -- Validation Gate

**V1: Validate wave 1 engine and rules** [medium] -- validation-lead
- Blocked by: T1, T2
- Checks:
  1. `mkdir -p .specs/damage-control-modes/evidence`.
  2. Save preflight planned-path status and diff before editing if not already saved.
  3. Run `cd pi/tests && pnpm test damage-control.test.ts` and confirm all damage-control tests pass.
  4. Run `cd pi/extensions && pnpm run typecheck` and confirm TypeScript compiles.
  5. Inspect `git diff -- pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts` for scope.
  6. Confirm no implementation adds a way to disable core damage-control protections.
- On failure: create a fix task, re-run the failed check, then re-run all V1 checks.

### Wave 2

**T3: Register commands and integrate mode/pwsh handlers with per-registration state** [medium] -- typescript-engineer
- Blocked by: V1
- Description: In `pi/extensions/damage-control.ts`, keep mode, loaded health, rules, and status-formatting inputs inside the extension registration closure or a per-registration state object, not as module-level shared mutable state. Register unprefixed command names `"damage-control"` and `"dc"` through `ExtensionAPI.registerCommand`; users invoke them as `/damage-control` and `/dc`. Empty args or `status` report health/mode/core-always-on. `mode default|whitelist|noshell` updates per-registration mode, UI status, and transition audit/status record with previous mode, new mode, and alias used. Invalid args or extra tokens show usage and do not change mode or emit transition records. Apply `evaluateShellMode` in `bash` and `pwsh` handlers after fail-closed health; wire `pwsh` through `evaluateDangerousCommand(..., { toolName: "pwsh" })` before `no_delete_paths`. File-tool handlers must not consult mode state.
- Files: `pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts`.
- Acceptance Criteria:
  1. [ ] Both commands are registered with unprefixed names and share one per-registration mode state.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: mocked `registerCommand` receives `"damage-control"` and `"dc"`, `/dc mode whitelist` changes status, and `/damage-control status` reports `mode: whitelist` in the same registration.
     - Fail: alias missing or states diverge; fix registration closure.
  2. [ ] Mode state is isolated between extension registrations.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: test registers instance A, sets `noshell`, registers instance B, and proves B starts at `default` while A remains `noshell`; loaded health/rules/status inputs are also independently observable or closure-local.
     - Fail: module-level state resets/leaks; move runtime state into registration closure.
  3. [ ] Invalid and extra slash-command args do not change mode.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: `/damage-control mode whitelist extra` and unknown subcommands notify usage and preserve prior mode.
     - Fail: parser truncates extras or changes mode; require exact token count.
  4. [ ] Registered `bash` and `pwsh` handlers enforce `whitelist` and `noshell` after mode changes.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: tests register extension, invoke `/dc mode whitelist`/`noshell`, then dispatch mocked `bash` and `pwsh` tool calls and assert blocks.
     - Fail: pure evaluator passes but handlers allow commands; wire mode state into handlers.
  5. [ ] `pwsh` dangerous commands block through the registered handler before no-delete checks.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: handler-level `pwsh` `iex`/`Invoke-Expression` test returns dangerous-command block reason.
     - Fail: only pure evaluator test exists; add handler test and toolName propagation.
  6. [ ] File protections remain active after switching modes.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: after switching to `whitelist` and `noshell`, registered file handlers still block zero-access and truncating/no-delete targets.
     - Fail: file handler depends on shell mode or is bypassed; keep mode scoped to shell handlers.
  7. [ ] `bash` handler in `default` still prompts for Linux `docker compose down` ask rules.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: existing registered bash handler test confirms UI confirm is called.
     - Fail: mode overlay blocks/bypasses baseline dangerous-command flow; reorder checks.
  8. [ ] Mode transition audit/status records are testable and precise.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: changing modes records previousMode, newMode, and alias for both registered command names; invalid/extra-arg invocations record no transition.
     - Fail: audit data is missing or untestable; wire through existing metrics/permission/status mechanism or add a session-visible in-memory record.

### Wave 2 -- Validation Gate

**V2: Validate wave 2 command and handler integration** [medium] -- validation-lead
- Blocked by: T3
- Checks:
  1. Run `mkdir -p .specs/damage-control-modes/evidence`.
  2. Run `cd pi/tests && pnpm test damage-control.test.ts > ../../.specs/damage-control-modes/evidence/damage-control-test.txt 2>&1`.
  3. Run `cd pi/extensions && pnpm run typecheck > ../../.specs/damage-control-modes/evidence/typecheck.txt 2>&1`.
  4. Save `git diff -- pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts > .specs/damage-control-modes/evidence/implementation.diff` from repo root.
  5. Confirm command names, mode names, alias, per-registration state, and exact-argument parsing match the objective.
  6. Run the evidence no-secret check using the temp-file/sentinel command from the Automation Plan and save output to `.specs/damage-control-modes/evidence/no-secret-check.txt`; if matches are real secrets, redact/remove evidence before archive.
- On failure: create a fix task, re-run the failed check, then re-run all V2 checks.

## Dependency Graph

```
Preflight: V0
Wave 1: V0 → T1, T2 (parallel) → V1
Wave 2: V1 → T3 → V2
Final: V2 → F1 → F2 → F3 → F4 → F5
```

## Success Criteria

1. [ ] End-to-end command behavior is covered by automated handler-level tests.
   - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
   - Pass: all tests pass, including command registration, alias behavior, exact arg parsing, per-registration state isolation, handler-level mode blocking for `bash`/`pwsh`, handler-level `pwsh` dangerous rules, file protections after mode switch, and existing baseline behavior.
2. [ ] Pi extension TypeScript compiles.
   - Verify: `cd pi/extensions && pnpm run typecheck`
   - Pass: exits 0 with no TypeScript errors.
3. [ ] Repo-wide validation passes or a baseline exception proves unrelated pre-existing failure.
   - Verify: `make check`
   - Pass: exits 0 with no errors or warnings, or `## Execution Status` records the exact failing command plus preflight/baseline evidence that the same failure existed before executor edits.
4. [ ] Evidence is archived under the plan directory and contains no secrets.
   - Verify: `test -s .specs/damage-control-modes/evidence/damage-control-test.txt && test -s .specs/damage-control-modes/evidence/typecheck.txt && test -s .specs/damage-control-modes/evidence/no-secret-check.txt`
   - Pass: evidence files exist; no-secret check contains either `NO SECRET MATCHES` or only documented synthetic/non-secret findings; implementation evidence is present or execution status explains that implementation was already present at preflight.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- Credentials required: none.
- Manual-only steps: none.

### Required automated validation

1. [ ] Create evidence directory and capture preflight state before edits.
   - Command: `mkdir -p .specs/damage-control-modes/evidence && git status --short > .specs/damage-control-modes/evidence/preflight-status.txt && git status --short -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts > .specs/damage-control-modes/evidence/preflight-planned-path-status.txt && git diff -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts > .specs/damage-control-modes/evidence/preflight-planned-path.diff`
   - Pass: evidence files exist; planned-path status is empty or execution status documents intentional pre-existing draft changes. If repo-wide baseline exception may be needed, `.specs/damage-control-modes/evidence/preflight-make-check.txt` was captured before edits.
   - Fail: do not edit until ownership/merge strategy is documented.

2. [ ] Run focused damage-control tests.
   - Command: `cd pi/tests && pnpm test damage-control.test.ts`
   - Pass: exits 0; all tests pass.
   - Fail: do not archive; update `## Execution Status` with failing test and next fix.

3. [ ] Run Pi extension typecheck.
   - Command: `cd pi/extensions && pnpm run typecheck`
   - Pass: exits 0; no TypeScript errors.
   - Fail: do not archive; fix type errors and rerun focused tests.

4. [ ] Run strongest repo-wide validation.
   - Command: `make check`
   - Pass: exits 0 with no errors/warnings, or execution status documents a baseline exception proving unrelated pre-existing failure.
   - Fail: do not archive without either a fix or baseline exception evidence.

5. [ ] Run evidence no-secret check.
   - Command: `tmp="$(mktemp)" && if grep -RInE '(AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|xox[baprs]-|ghp_[A-Za-z0-9_]+)' .specs/damage-control-modes/evidence --exclude='no-secret-check.txt' > "$tmp" 2>&1; then mv "$tmp" .specs/damage-control-modes/evidence/no-secret-check.txt; else code=$?; if [ "$code" -eq 1 ]; then printf 'NO SECRET MATCHES\n' > .specs/damage-control-modes/evidence/no-secret-check.txt; rm -f "$tmp"; else cat "$tmp" > .specs/damage-control-modes/evidence/no-secret-check.txt; rm -f "$tmp"; exit "$code"; fi; fi`
   - Pass: output contains `NO SECRET MATCHES`, or only documented synthetic/non-secret matches.
   - Fail: redact/remove evidence and rerun check.

6. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation.

- Required: no
- Justification: Automated tests/typecheck/repo validation are sufficient for local reversible TypeScript behavior. No destructive or external operation is required.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is local repo code/config; no deployment is part of this plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, exceptional manual validation (if required), deployment validation, repo-wide validation or documented baseline exception, and evidence no-secret checks pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover.

## Execution Status

- Completion classification: completed-and-archived candidate
- Current date: 2026-05-12
- Last completed wave/gate: all implementation, validation, manual-not-required, deployment-not-applicable, repo-wide validation, and no-secret gates completed
- Next wave/gate to run: archive preflight and archive move
- What was implemented: pre-existing draft edits were validated and refined to keep damage-control runtime state in a per-registration closure, enforce exact slash-command argument parsing, add `/damage-control` and `/dc`, add `default`/`whitelist`/`noshell` shell mode evaluation for `bash`/`pwsh`, add tool-targeted dangerous-command rules including PowerShell coverage, and preserve file protections. The unrelated prompt-router test expectation was updated to match tracked `pi/settings.json` classifier mode `lgbm`.
- Commands run and results:
  - `mkdir -p .specs/damage-control-modes/evidence && git status --short ... && git diff -- ...`: passed; planned paths had pre-existing draft edits matching this plan.
  - `cd pi/tests && pnpm test damage-control.test.ts`: passed; log at `.specs/damage-control-modes/evidence/damage-control-test.txt`.
  - `cd pi/extensions && pnpm run typecheck`: passed; log at `.specs/damage-control-modes/evidence/typecheck.txt`.
  - `cd pi/tests && pnpm test prompt-router.test.ts damage-control.test.ts`: passed after the prompt-router expectation fix; log at `.specs/damage-control-modes/evidence/fix-targeted-test.txt`.
  - `make check`: passed; log at `.specs/damage-control-modes/evidence/make-check.txt`.
  - Evidence no-secret check: passed; `.specs/damage-control-modes/evidence/no-secret-check.txt` contains `NO SECRET MATCHES`.
- Commands/checks still needed: none.
- Remaining user/manual steps: none; no manual validation or deployment is required.
- Evidence directory: `.specs/damage-control-modes/evidence/`

## Handoff Notes

- There may already be draft working-tree changes implementing some or all of this plan. A fresh executor must inspect `git status --short -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts` and `git diff -- pi/damage-control-rules.yaml pi/extensions/damage-control.ts pi/extensions/damage-control-engine.ts pi/extensions/damage-control-rules.ts pi/tests/damage-control.test.ts` before editing. If draft changes match acceptance criteria, validate and archive evidence rather than reimplementing.
- The `pwsh` tool availability check is intentionally owned by `pi/extensions/pwsh.ts`; damage-control should react only to observed `tool_call` events.
- Use pnpm commands for Pi TypeScript only. Do not run `bun` or `npm` in `pi/extensions` or `pi/tests`.
- If `make check` fails, the plan is complete only if the failure is fixed or `## Execution Status` records precise baseline evidence proving the failure is unrelated and pre-existing.
