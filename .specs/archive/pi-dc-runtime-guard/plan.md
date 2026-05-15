---
created: 2026-05-14
status: completed
completed: 2026-05-14
---

# Plan: Pi Damage-Control Runtime Guard Reliability

## Context & Motivation

Safe destructive-command probes (`rm -rf` in `/tmp`, `git reset --hard` in a disposable repo, and `git clean -fd` in a disposable repo) were run through this session's direct developer tool surface (`functions.bash`) and were not blocked. Claude Code hooks do block comparable commands because Claude Code invokes host-level `PreToolUse` hooks before tool execution.

Source inspection and web/docs research indicate normal Pi agent tool calls already have a similar pre-execution boundary: Pi wires extension `tool_call` handlers through `AgentSession.agent.beforeToolCall`, and the lower-level agent loop converts `{ block: true }` into an immediate error result before the tool body executes. The unresolved problem is therefore boundary-specific: determine whether the observed `functions.bash` bypass is outside normal Pi runtime, and prevent future work from confusing direct API/developer tools with Pi's normal LLM `bash` tool.

A prior speculative implementation tried to wrap `bash` in `pi/extensions/damage-control.ts` and was reverted. This plan requires evidence first, then either tests/docs in dotfiles or a stop condition for a separate upstream/harness plan.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: `/usr/bin/bash`; commands in this plan assume Git Bash/MSYS unless a task says otherwise.
- Repository under review: `C:/Users/mglenn/.dotfiles`.
- Upstream Pi source may be inspected read-only via `PI_MONO_DIR`, defaulting to `C:/Projects/Personal/pi-mono`.
- Upstream Pi source writes are out of scope. If a core Pi defect requiring upstream edits is found, stop and create a separate upstream plan.
- Pi TypeScript validation is pnpm-only. Use `pnpm install --frozen-lockfile` before test/typecheck when dependencies may be stale or absent.
- Automated tests must treat destructive commands as inert strings. Do not execute `rm -rf`, `git reset --hard`, or `git clean -fd` in automated tests.
- Live destructive probes are prohibited by this plan. If a future diagnostic requires them, create a separate plan with disposable temp-dir safeguards.
- Do not edit or read secret-bearing files (`*.env`, SSH keys, `*.pem`, `*.key`) as part of testing or evidence collection.
- Preserve Claude/Pi separation: Claude Code hook behavior lives under `claude/hooks/`; Pi behavior lives under `pi/extensions/`, `pi/tests/`, and docs.

## Risk & Manual Gate Decision

- **Risk level:** Low
- **Blast radius:** personal-local-repo
- **Rollback:** easy by reviewing `git diff` and applying targeted reverse patches for this plan's changes; do not run destructive `git checkout -- ...` without explicit user confirmation.
- **Manual approval before action:** not required for dotfiles-only test/docs/source edits; required before any out-of-scope upstream Pi source write.
- **Manual validation after action:** not required
- **Decision reason:** The in-scope work is local, reversible, and validated with automated tests using destructive commands only as inert strings. No production/shared systems, paid resources, secrets, or irreversible external side effects are involved.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Add a `bash` tool wrapper in `pi/extensions/damage-control.ts` immediately | Places guard near execution and follows Pi examples for overriding built-ins | Can duplicate `tool_call` checks, re-prompt ask rules, and still not protect `functions.bash` if that surface bypasses Pi tools | Rejected until a failing runtime regression proves it is needed |
| Keep only existing unit tests for `evaluateDangerousCommand` and registered handlers | Smallest code change | Does not prove Pi's agent-loop execution is blocked before tool execution | Rejected as insufficient for runtime-boundary claims |
| Reuse upstream generic runtime-block evidence plus add dotfiles damage-control handler tests | Separates Pi core runtime proof from dotfiles damage-control policy proof | Does not patch direct API/developer `functions.bash` if that owner is outside this repo | **Selected** |
| Patch upstream `pi-mono` in this plan | Could fix a real Pi core defect if found | Cross-repo write scope, different validation/rollback, and likely contributor workflow | Rejected; create a separate upstream plan if needed |
| Patch Claude hooks instead | Claude already blocks via `PreToolUse` | Does not address Pi/API harness behavior | Rejected |

For medium tasks below, the concrete rejected alternative is a broad tool-wrapper migration. It is rejected unless tests prove `tool_call` is not honored in the relevant in-scope Pi execution path.

## Objective

Produce an automated, evidence-backed dotfiles plan outcome by:

1. Recording source evidence for Pi's normal pre-execution `tool_call` boundary, preferably including the existing upstream generic sentinel-tool test.
2. Adding or hardening dotfiles tests that prove the Pi damage-control extension blocks dangerous bash command strings through its registered `tool_call` handler.
3. Identifying whether the observed `functions.bash` bypass is owned by local source. If no local owner is found, document it as an external/direct API developer-tool surface rather than claiming it is fixed.
4. Implementing only in-scope dotfiles changes. If evidence shows a Pi core or API harness defect, stop and create a separate plan for that owner.

## Project Context

- **Language**: Python, shell, TypeScript/JavaScript, Go submodules/tools; target area is TypeScript under `pi/` plus documentation under `pi/README.md` or `pi/extensions/README.md`.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts` for task-specific Pi extension tests.
- **Lint command**: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`; repo-wide `make check` when practical.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `mkdir -p .specs/pi-dc-runtime-guard/evidence; export PI_MONO_DIR="${PI_MONO_DIR:-C:/Projects/Personal/pi-mono}"; git status --short; test -f pi/tests/damage-control.test.ts; test -d "$PI_MONO_DIR" || { echo "PI_MONO_DIR missing: $PI_MONO_DIR"; exit 20; }` | none | `.specs/pi-dc-runtime-guard/evidence/preflight.md` |
| Dependency prep | `cd pi/tests && pnpm install --frozen-lockfile; cd ../extensions && pnpm install --frozen-lockfile` | none | `.specs/pi-dc-runtime-guard/evidence/dependencies.md` |
| Runtime boundary research | `grep -R "beforeToolCall\|emitToolCall\|allows extension tool_call handlers to block tool execution" -n "$PI_MONO_DIR/packages/agent/src" "$PI_MONO_DIR/packages/coding-agent/src" "$PI_MONO_DIR/packages/coding-agent/test" | sed -n '1,200p'` | none | `.specs/pi-dc-runtime-guard/evidence/runtime-boundary.md` |
| Local ownership check | `grep -R "functions.bash\|developer tool\|tool adapter" -n "$PI_MONO_DIR/packages" pi 2>/dev/null | sed -n '1,120p' || true` | none | `.specs/pi-dc-runtime-guard/evidence/functions-bash-ownership.md` |
| Task-specific tests | `cd pi/tests && pnpm test damage-control.test.ts` | none | `.specs/pi-dc-runtime-guard/evidence/damage-control-test.md` |
| Pi extension typecheck | `cd pi/extensions && pnpm run typecheck` | none | `.specs/pi-dc-runtime-guard/evidence/pi-extension-typecheck.md` |
| Repo-wide validation | `make check` or documented fallback: `make test-quick && make lint-python && cd pi/tests && pnpm test damage-control.test.ts && cd ../extensions && pnpm run typecheck` | none | `.specs/pi-dc-runtime-guard/evidence/repo-validation.md` |
| Rollback | Review `git diff`; apply a targeted reverse patch for this plan's changes. Do not run destructive `git checkout -- ...` without explicit user confirmation. | none | `git status --short` after rollback if used |

Evidence files must include: command, cwd, exit code, summarized non-secret output, and conclusion. `/do-it` may capture these manually in the named evidence files or use shell redirection/tee wrappers, but must not rely only on transient terminal scrollback. Redact tokens, secrets, private key material, and unnecessary bulk absolute-path output.

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Establish runtime-boundary evidence
  - Status: completed
  - Evidence: `evidence/runtime-boundary.md`; `evidence/functions-bash-ownership.md`
- [x] T2: Add failing/protective regression tests for Pi damage-control handler boundary
  - Status: completed
  - Evidence: `pi/tests/damage-control.test.ts`; `evidence/damage-control-test.md`
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: `evidence/wave-validation.md`

### Wave 2

- [x] T3: Implement smallest in-scope guard or documentation correction
  - Status: completed
  - Evidence: `pi/extensions/README.md`; no speculative wrapper added
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: `evidence/damage-control-test.md`; `evidence/pi-extension-typecheck.md`

### Wave 3

- [x] T4: Document validated behavior and safe probe policy
  - Status: completed
  - Evidence: `pi/extensions/README.md`; `evidence/wave-validation.md`
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: `evidence/wave-validation.md`

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: `evidence/damage-control-test.md`; `evidence/wave-validation.md`
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: `evidence/repo-validation.md` (`UV_NO_CONFIG=1 make check` passed after repo `uv.toml` no-build blocked editable local package installation)
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: manual validation not required by Validation Contract
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: deployment validation not required
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: `evidence/archive-preflight.md`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Establish runtime-boundary evidence | 1 | research | medium | typescript-pro | -- |
| T2 | Add failing/protective regression tests for Pi damage-control handler boundary | 1-2 | feature | medium | qa-engineer | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1, T2 |
| T3 | Implement smallest in-scope guard or documentation correction | 1-4 | feature | medium | typescript-pro | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T3 |
| T4 | Document validated behavior and safe probe policy | 1-3 | mechanical | small | docs-writer | V2 |
| V3 | Validate wave 3 | -- | validation | small | qa-engineer | T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Establish runtime-boundary evidence** [medium] -- typescript-pro
- Description: Inspect local upstream Pi source read-only through `PI_MONO_DIR` and write `.specs/pi-dc-runtime-guard/evidence/runtime-boundary.md`. The evidence must identify: hook registration source, runner emission source, block-to-nonexecution source, and any existing upstream sentinel-tool test proving a blocked `tool_call` does not execute the tool body. If `PI_MONO_DIR` is missing, mark the task blocked with remediation; do not guess.
- Files: `.specs/pi-dc-runtime-guard/evidence/runtime-boundary.md`; optional `.specs/pi-dc-runtime-guard/evidence/functions-bash-ownership.md`.
- Acceptance Criteria:
  1. [ ] Source path evidence is recorded with command, cwd, exit code, summarized output, conclusion, and line references.
     - Verify: `test -s .specs/pi-dc-runtime-guard/evidence/runtime-boundary.md && grep -E "hook registration|runner emission|nonexecution|sentinel|line" .specs/pi-dc-runtime-guard/evidence/runtime-boundary.md`
     - Pass: Evidence names files/lines for hook registration, runner emission, block-to-nonexecution, and the existing upstream generic block test or explicitly states none exists.
     - Fail: Evidence is only raw grep output or lacks a conclusion.
  2. [ ] Local ownership of `functions.bash` is recorded without treating absence of literal strings as proof of ownership.
     - Verify: `test -s .specs/pi-dc-runtime-guard/evidence/functions-bash-ownership.md && grep -E "found owner|not found locally|limitation" .specs/pi-dc-runtime-guard/evidence/functions-bash-ownership.md`
     - Pass: Evidence either names a concrete local owner or states `not found locally` with the limitation that this does not prove global absence.
     - Fail: Evidence claims the API/developer tool is fixed or out-of-scope solely because grep found no literal match.

**T2: Add failing/protective regression tests for Pi damage-control handler boundary** [medium] -- qa-engineer
- Description: Add dotfiles tests that exercise the registered `damage-control` `tool_call` handler for bash commands. These tests prove damage-control policy/handler behavior in this repo, while T1 records upstream runtime nonexecution evidence. Automated tests must not execute destructive commands; they must use command strings as inert input data.
- Files: `pi/tests/damage-control.test.ts` and optional `pi/tests/helpers/*`.
- Acceptance Criteria:
  1. [ ] `rm -rf`, `git reset --hard`, and `git clean -fd` are blocked through the registered bash `tool_call` handler without shell/process execution.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: Tests assert block decisions for all three command strings and use handler invocation or mocked execution only.
     - Fail: A command is allowed or a test shells out destructively.
  2. [ ] A safe command remains allowed.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: A `git status --short` or `pwd` case returns `undefined` from the damage-control handler in default mode.
     - Fail: Damage-control overblocks safe commands in default mode.
  3. [ ] Tests contain static guardrails against accidental live destructive execution.
     - Verify: `grep -n "child_process\|spawn\|exec\|bash -c\|rm -rf /\|git reset --hard" pi/tests/damage-control.test.ts || true`
     - Pass: No `child_process`, `spawn`, `exec`, or `bash -c` usage is present; destructive command strings appear only as test input literals with comments naming them inert input.
     - Fail: Tests can execute shell commands or destructive strings are not clearly inert.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run T1 evidence checks and confirm the evidence file has conclusion fields, not only raw grep output.
  2. Run `cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts`.
  3. Confirm no live destructive command was executed; all dangerous strings are inert test data.
  4. Confirm the result classifies the observed `functions.bash` bypass as one of: local owner found, not found locally, or blocked pending harness source.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T3: Implement smallest in-scope guard or documentation correction** [medium] -- typescript-pro
- Blocked by: V1
- Description: Based on V1 evidence, choose exactly one in-scope path:
  - If dotfiles damage-control handler tests fail: fix `pi/extensions/damage-control.ts` so the registered handler blocks dangerous bash command strings. Avoid wrapping `bash` unless a dotfiles test proves the existing handler path is bypassed in this repo.
  - If dotfiles tests pass and the only observed bypass is `functions.bash` with no local owner: do not patch `damage-control.ts`; add a diagnostic/doc note that direct API/developer tool surfaces are not covered by Pi extension hooks in this repo.
  - If evidence shows a Pi core or API harness defect outside dotfiles: stop, update `## Execution Status` as blocked, and create/recommend a separate plan for that owner. Do not edit `C:/Projects/Personal/pi-mono` in this plan.
- Files: expected `pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts`, `pi/README.md`, `pi/extensions/README.md`, or `.specs/pi-dc-runtime-guard/evidence/*.md`. No upstream writes.
- Acceptance Criteria:
  1. [ ] The implementation path is evidence-selected and documented in diff/test/docs.
     - Verify: `git diff -- pi/extensions/damage-control.ts pi/tests/damage-control.test.ts pi/README.md pi/extensions/README.md .specs/pi-dc-runtime-guard | sed -n '1,260p'`
     - Pass: Diff shows the selected path, no upstream edits, and no speculative unused wrapper code.
     - Fail: Diff contains unused imports/functions, broad rewrites not required by V1, or edits under `C:/Projects/Personal/pi-mono`.
  2. [ ] No duplicate prompt/ask behavior is introduced for bash ask-rules.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
     - Pass: Existing ask-rule tests still pass and confirm callbacks are called exactly once.
     - Fail: Confirmation is requested twice or confirmed commands bypass later no-delete checks.
  3. [ ] TypeScript remains valid.
     - Verify: `cd pi/extensions && pnpm run typecheck`
     - Pass: exits 0.
     - Fail: Type errors or unused imports remain.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T3
- Checks:
  1. Run `cd pi/tests && pnpm test damage-control.test.ts`.
  2. Run `cd pi/extensions && pnpm run typecheck`.
  3. Inspect diff to ensure the fix is at the proven in-scope layer and no speculative bash wrapper or upstream edit was added.
  4. If T3 stopped for an out-of-scope owner, verify `## Execution Status` clearly says blocked and names the required follow-up plan.
- On failure: create a fix task and rerun V2.

### Wave 3

**T4: Document validated behavior and safe probe policy** [small] -- docs-writer
- Blocked by: V2
- Description: Update docs or evidence notes so future agents know how to test Pi damage-control safely. The doc must distinguish Claude Code `PreToolUse`, Pi `tool_call`, and this session's direct API/developer tool surface. State that automated tests use dangerous commands as inert strings and live destructive probes are out of scope for this plan.
- Files: `pi/extensions/README.md`, `pi/README.md`, or `.specs/pi-dc-runtime-guard/evidence/*.md`.
- Acceptance Criteria:
  1. [ ] Documentation states which surfaces are covered by Pi damage-control.
     - Verify: `grep -R "functions.bash\|tool_call\|PreToolUse\|damage-control" -n pi/README.md pi/extensions/README.md .specs/pi-dc-runtime-guard 2>/dev/null | sed -n '1,160p'`
     - Pass: Output includes a clear distinction between Pi normal runtime hooks and external/direct tool surfaces.
     - Fail: Docs imply `functions.bash` is protected by Pi extensions without evidence.
  2. [ ] Safe destructive-command policy is documented.
     - Verify: `grep -R "inert string\|live destructive probes are out of scope\|disposable\|rm -rf\|git reset --hard\|git clean" -n pi/README.md pi/extensions/README.md .specs/pi-dc-runtime-guard 2>/dev/null | sed -n '1,160p'`
     - Pass: Documentation says automated tests use inert strings and live destructive probes are prohibited or require a separate plan.
     - Fail: Documentation encourages real destructive tests in the repo.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [small] -- qa-engineer
- Blocked by: T4
- Checks:
  1. Run documentation grep checks from T4.
  2. Run `cd pi/tests && pnpm test damage-control.test.ts`.
  3. Run `cd pi/extensions && pnpm run typecheck`.
- On failure: fix docs/tests and rerun V3.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
Wave 3: T4 → V3
Final: V3 → F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] Pi damage-control has automated dotfiles regression coverage proving dangerous bash command strings are blocked through the registered damage-control `tool_call` handler.
   - Verify: `cd pi/tests && pnpm test damage-control.test.ts`
   - Pass: Tests for `rm -rf`, `git reset --hard`, and `git clean -fd` pass without executing destructive shell operations.
2. [ ] Pi runtime nonexecution evidence is recorded separately from dotfiles handler tests.
   - Verify: `grep -E "sentinel|tool body|blocked|nonexecution" .specs/pi-dc-runtime-guard/evidence/runtime-boundary.md`
   - Pass: Evidence cites upstream source/test paths or explicitly blocks execution pending missing source.
3. [ ] The implementation or documentation accurately identifies the observed bypass boundary.
   - Verify: `grep -R "functions.bash\|direct API\|developer tool\|tool_call" -n pi/README.md pi/extensions/README.md .specs/pi-dc-runtime-guard 2>/dev/null | sed -n '1,160p'`
   - Pass: Evidence states whether the bypass is not found locally, names a local owner, or blocks pending harness source.
4. [ ] Pi TypeScript validation passes.
   - Verify: `cd pi/extensions && pnpm run typecheck`
   - Pass: exits 0.
5. [ ] Repo-wide validation passes or a documented narrower validation set is justified by environment constraints.
   - Verify: `make check` or the fallback set in `Validation Contract`.
   - Pass: selected command set exits 0 with no new warnings; if fallback was used, evidence records why full validation was unavailable or unrelated.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- Credentials are not required.
- Manual-only steps are not required for in-scope work.
- Upstream Pi source writes are not in scope; finding a required upstream fix blocks this plan and requires a separate plan.

### Required automated validation

1. [ ] Run dependency prep before Pi TypeScript tests/typecheck if `node_modules` is absent or stale.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile; cd ../extensions && pnpm install --frozen-lockfile`
   - Pass: exits 0.
   - Fail: do not proceed to test/typecheck until dependency state is repaired.

2. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: Prefer `make check`. If full `make check` is too slow or blocked by unrelated environment prerequisites, record command, duration/error, why the failure is unrelated, then run fallback: `make test-quick && make lint-python && cd pi/tests && pnpm test damage-control.test.ts && cd ../extensions && pnpm run typecheck`.
   - Pass: exits 0 with no errors or new warnings.
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix.

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation.

4. [ ] Run archive preflight.
   - Command: `git status --short; git diff --check; grep -R -n -E "(AKIA[0-9A-Z]{16}|token=|api[_-]?key=|BEGIN [A-Z ]*PRIVATE KEY|\.env|id_ed25519|id_rsa)" -- pi .specs/pi-dc-runtime-guard || true`
   - Pass: status shows only intended files; diff check passes; secret-pattern scan has no unexpected sensitive content. Expected literal mentions in docs/evidence must be reviewed and recorded as non-secret examples.
   - Fail: remove/ redact sensitive or unintended files before archive.

### Manual validation

- Required: no
- Justification: Automated validation is sufficient for in-scope dotfiles work. The plan uses only local reversible changes and synthetic/inert dangerous command strings.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is local repository source/test/doc work. Runtime reload or install is outside scope unless the user separately requests it.

If deployment is required later and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, deployment validation if later added, archive preflight, and repo-wide validation pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover.

## Execution Status

Completion classification: completed-and-archived.
Date: 2026-05-14.
Last completed wave/gate: Final gate F5 archive preflight.
Next wave/gate: none.
Implemented: recorded Pi normal runtime `tool_call` pre-execution boundary evidence, added registered bash handler regression tests for inert `rm -rf`, `git reset --hard`, and `git clean -fd` command strings plus safe command allow coverage, and documented that external/direct API developer-tool surfaces such as `functions.bash` are not claimed covered unless routed through Pi extension hooks.
Validation: dependency prep passed; `cd pi/tests && pnpm test damage-control.test.ts` passed (63 tests); `cd pi/extensions && pnpm run typecheck` passed; `make check` initially failed because repo `uv.toml` no-build conflicts with editable local package installation, then `UV_NO_CONFIG=1 make check` passed; archive preflight passed with secret scan hits reviewed as documentation/test literals.
Manual validation: not required by Validation Contract.
Deployment validation: not required.
Archive: completed at `.specs/archive/pi-dc-runtime-guard/plan.md`.

## Handoff Notes

- Do not repeat the failed pattern of editing `pi/extensions/damage-control.ts` before a failing in-scope test exists.
- Existing source evidence seen before this plan: `C:/Projects/Personal/pi-mono/packages/coding-agent/src/core/agent-session.ts` installs `agent.beforeToolCall`; `C:/Projects/Personal/pi-mono/packages/agent/src/agent-loop.ts` turns `beforeToolCall` blocks into immediate error tool results before execution; `C:/Projects/Personal/pi-mono/packages/coding-agent/src/core/extensions/runner.ts` emits `tool_call` handlers and stops on block; `C:/Projects/Personal/pi-mono/packages/coding-agent/test/suite/agent-session-model-extension.test.ts` includes a generic sentinel-tool block test.
- The observed non-blocking probes were run via this session's `functions.bash`, not via a normal Pi LLM tool call. Treat that as an external/direct API developer-tool surface unless T1 finds a local owner.
- If any task discovers a required upstream `pi-mono` or API harness code change, stop this plan and create a new owner-specific plan. Do not edit upstream source here.
- If rollback is needed, prefer a reviewed reverse patch. Do not run destructive git checkout/reset commands without explicit user confirmation.
