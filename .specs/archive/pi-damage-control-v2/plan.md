---
created: 2026-05-08
status: completed
completed: 2026-05-08
---

# Plan: Pi Damage-Control V2 Integration

## Context & Motivation

The user reported that Pi damage-control was not prompting for dangerous commands and wanted the Pi implementation to match the intent of the existing Claude Code damage-control hooks while integrating with the current Pi extension ecosystem. Review of the current system found that Pi had useful primitives but important gaps: rules could silently fail to load, command matching could miss variants, live handler prompt wiring needed smoke coverage, `/permissions` did not yet form a complete control loop, and `/doctor` did not report damage-control health.

A first hardening pass may already exist in the current working tree from the preceding session. `/do-it` must start by inspecting and preserving existing WIP in `pi/extensions/damage-control.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`, and `pi/justfile`; it must finish gaps rather than blindly reimplement already-passing work.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`, x86_64).
- Shell: Git Bash for repo commands; PowerShell is available but not required unless testing Windows-native behavior.
- Project policy: Pi TypeScript validation is pnpm-only. Do not use Bun for Pi extension tests/typechecks.
- Do not modify or commit secrets or `*.env` files.
- Do not change Claude Code hooks for this plan. Claude hooks are the reference behavior, not the target runtime.
- Keep the implementation Pi-native: TypeScript extension code, Pi status/UI APIs, existing permission registry, metrics, and doctor/status surfaces.
- Keep catastrophic hard blocks non-bypassable. Session approvals may only apply to ask-level rules, must be exact/canonical, must expire at session end, and must never use substring/prefix matching.
- Damage-control rule-source precedence must be explicit and tested: project-local `.pi/damage-control-rules.yaml` first, tracked repo fallback `pi/damage-control-rules.yaml` second, user/global `~/.pi/agent/damage-control-rules.yaml` third. Missing, malformed, or hostile rules must fail closed for handled tools.
- Deny/replay payloads must never persist raw command input when it may include secrets. Persist a sanitized replay descriptor only: tool name, cwd/scope, matched rule id/pattern, classification, redacted command/path summary, and no file contents.
- Existing unrelated working-tree items such as `pi/settings.json`, `.specs/defender-tuning-ai-cli/`, or `sessions/` must not be bundled into this plan's implementation commit.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Maintain a small independent Pi-only safety layer | Simple and fast to maintain | Continued drift from Claude hooks; misses dangerous variants and shell wrapper patterns | Rejected: user explicitly said Pi should have been a direct port of Claude hooks before improvements |
| Port the entire Claude Python hook engine line-for-line into Pi | Maximum behavioral parity in one step | Large risky rewrite; Python implementation details do not map cleanly to Pi's TS extension APIs/status/permissions ecosystem | Rejected for this iteration: too broad and likely to overfit Claude internals |
| Incrementally port Claude hook intent into Pi-native TypeScript | Preserves native Pi UI/status/registry integration while adding high-value Claude-equivalent behavior | Requires a parity matrix to avoid subjective omissions | **Selected** |
| Create a neutral shared policy schema now and generate Claude/Pi configs | Long-term clean source of truth | More architecture before the urgent prompting/visibility issues are locked down | Deferred: document as follow-up after Pi behavior is hardened |

All major tasks converge on a Pi-native TypeScript extension pattern. The opposite pattern -- a separate language-agnostic daemon or external policy engine -- would be correct if multiple unrelated clients needed runtime-enforced policy from one process, but this repo already has native Pi extension and Claude hook surfaces and should use them directly.

## Objective

Complete a Pi-native damage-control V2 that visibly reports active/failed state, fails closed when rules cannot load or validate, ports a bounded high-value subset of Claude hook behavior into Pi rules/matching, integrates truthfully with `/permissions` and `/doctor`, and adds automated registered-handler tests that prevent ask/block/status regressions.

## Project Context

- **Language**: TypeScript for Pi extensions/tests, Python/shell elsewhere in repo.
- **Test command**: `cd pi/tests && pnpm test damage-control.test.ts` for targeted existing damage-control tests; include additional explicit test files if created.
- **Lint command**: prefer repo-owned `make lint` / `make check`; do not rely on unpinned `pnpm exec biome` unless `@biomejs/biome` is added to the owning package lock in this plan.
- **Typecheck command**: `cd pi/extensions && pnpm run typecheck`.
- **Repo-wide validation**: `make check`, with baseline captured before edits. Final failures can be classified unrelated only if they match the pre-implementation baseline and all Pi-specific gates pass.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight status | `git status --short && git diff --stat -- pi/extensions/damage-control.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts pi/justfile` | none | status/diff summary in final report |
| Preflight patch capture | `mkdir -p .specs/pi-damage-control-v2/evidence && git diff -- pi/extensions/damage-control.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts pi/justfile > .specs/pi-damage-control-v2/evidence/preflight-wip.patch` | none | `evidence/preflight-wip.patch` |
| Baseline validation | `make check > .specs/pi-damage-control-v2/evidence/make-check-baseline.log 2>&1` | none | baseline log; if nonzero, record exit code and summary |
| Install/check deps | `cd pi/extensions && pnpm install --frozen-lockfile && cd ../tests && pnpm install --frozen-lockfile` | none | pnpm exits 0 or reports lockfile satisfied |
| Pi targeted tests | `cd pi/tests && pnpm test damage-control.test.ts` plus explicit new test file names if created | none | all targeted Pi tests pass; output names every executed file |
| Typecheck | `cd pi/extensions && pnpm run typecheck` | none | exits 0 |
| Lint/format | `make lint` or `make check`; if Biome is required directly, first add/pin it in the relevant pnpm package | none | exits 0 or documented baseline-equivalent failure |
| Repo-wide validation | `make check` | none | exits 0, or compared to baseline with unrelated/pre-existing failure documented |
| Manual live validation | Scratch harmless ask-rule procedure in `## Validation Contract` | none | transcript/screenshot or user-confirmed evidence path showing status/prompt/permissions output |
| Deploy | not applicable; local dotfiles/extension changes only | none | not applicable |
| Rollback | Apply an inverse patch for this plan's changes or revert the local plan commit. Do not use `git checkout -- <paths>` unless the preflight patch proves no pre-existing WIP would be discarded. | none | working tree returns to pre-plan state without destroying unrelated WIP |

Dependency changes: if any task needs to add or update `package.json`, `pnpm-lock.yaml`, or tool dependencies, stop and add an explicit task/checklist item before proceeding.

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Preflight WIP, dependency, justfile, and baseline validation inventory
  - Status: completed
  - Evidence: preflight patch captured; pnpm-only just recipe dry-run passed; baseline make check attempted and timed out before exit capture
- [x] T2: Finish rule-source health, schema validation, and fail-closed behavior
  - Status: completed
  - Evidence: damage-control health publishing/schema validation/fail-closed retained; targeted tests pass
- [x] T3: Finish regex destructive rules with negative matrix
  - Status: completed
  - Evidence: destructive regex rules expanded; targeted damage-control tests pass
- [x] T4: Add minimum registered-handler smoke coverage
  - Status: completed
  - Evidence: registered handler coverage in pi/tests/damage-control.test.ts passes
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: cd pi/tests && pnpm test damage-control.test.ts; cd pi/extensions && pnpm run typecheck; final make check passed

### Wave 2

- [x] T5: Build Claude parity inventory matrix
  - Status: completed
  - Evidence: .specs/pi-damage-control-v2/claude-parity-matrix.md created and rg verification passed
- [x] T6: Add shared damage-control health module and `/doctor` integration
  - Status: completed
  - Evidence: pi/lib/damage-control-health.ts added; operator-status tests pass
- [x] T7: Improve `/permissions`, sanitized replay, and session approvals
  - Status: completed
  - Evidence: replay descriptors now redact command/path summaries; permissions tests pass
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: cd pi/tests && pnpm test damage-control.test.ts operator-status.test.ts permissions.test.ts; cd pi/extensions && pnpm run typecheck; final make check passed

### Wave 3

- [x] T8: Port bounded shell-wrapper, secret-read, and exfil coverage
  - Status: completed
  - Evidence: pi/damage-control-rules.yaml includes wrapper, secret-read, metadata, and exfil rules; targeted tests and make check pass
- [x] T9: Add expanded registered-handler, prompt-copy, and negative smoke tests
  - Status: completed
  - Evidence: registered damage-control smoke tests pass
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: cd pi/tests && pnpm test damage-control.test.ts; cd pi/extensions && pnpm run typecheck; final make check passed

### Wave 4

- [x] T10: Document Pi/Claude policy relationship and follow-up shared-policy direction
  - Status: completed
  - Evidence: pi/README.md and pi/damage-control-rules.yaml document Pi-native Claude hook intent, limits, parity matrix, and shared-policy follow-up
- [x] V4: Validate wave 4
  - Status: completed
  - Evidence: rg documentation verification passed; cd pi/tests && pnpm test damage-control.test.ts operator-status.test.ts permissions.test.ts passed; cd pi/extensions && pnpm run typecheck passed; final make check passed

### Final Gates

Final gate definitions:
- F1: all task-specific `Verify:` commands and acceptance criteria pass with evidence recorded.
- F2: repo-wide validation is complete: final `make check` exits 0, or failure is proven equivalent to the captured baseline while all Pi-specific checks pass.
- F3: manual scratch validation is complete with transcript/screenshot/user-confirmed evidence, or explicitly marked not required by an updated plan.
- F4: deployment validation is not required for this local extension plan unless the plan is later expanded to include deployment.
- F5: archive preflight confirms all required gates are complete, no unrelated files are staged/committed, and archive criteria are satisfied.

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: task-specific rg/test/typecheck checks passed
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: make check exited 0; log .specs/pi-damage-control-v2/evidence/make-check-final.log
- [x] F3: Manual validation complete or not required
  - Status: completed
  - Evidence: user confirmed harmless scratch live validation passed all required checks
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: deployment not required by validation contract
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: automated validation passed, manual validation user-confirmed, deployment not required, archive preflight satisfied

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Preflight WIP, dependency, justfile, and baseline validation inventory | 0-1 | mechanical | small | validator | -- |
| T2 | Finish rule-source health, schema validation, and fail-closed behavior | 2-3 | feature | medium | typescript-pro | -- |
| T3 | Finish regex destructive rules with negative matrix | 2-3 | feature | medium | security-reviewer | -- |
| T4 | Add minimum registered-handler smoke coverage | 1-2 | feature | medium | qa-engineer | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1, T2, T3, T4 |
| T5 | Build Claude parity inventory matrix | 1-2 | mechanical | small | planner | V1 |
| T6 | Add shared damage-control health module and `/doctor` integration | 3-4 | feature | medium | typescript-pro | V1 |
| T7 | Improve `/permissions`, sanitized replay, and session approvals | 3-5 | feature | medium | security-reviewer | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T5, T6, T7 |
| T8 | Port bounded shell-wrapper, secret-read, and exfil coverage | 2-4 | feature | medium | security-reviewer | V2 |
| T9 | Add expanded registered-handler, prompt-copy, and negative smoke tests | 1-2 | feature | medium | qa-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation-lead | T8, T9 |
| T10 | Document Pi/Claude policy relationship and follow-up shared-policy direction | 1-2 | mechanical | small | planner | V3 |
| V4 | Validate wave 4 | -- | validation | medium | validation-lead | T10 |

## Execution Waves

### Wave 1 (parallel)

**T1: Preflight WIP, dependency, justfile, and baseline validation inventory** [small] -- validator
- Description: Inventory current WIP, capture a patch before edits, verify Pi justfile recipes are already pnpm-only or identify exact remaining edits, check whether Biome is pinned before using it directly, and capture a baseline `make check` result.
- Files: read-only inspection; evidence under `.specs/pi-damage-control-v2/evidence/`.
- Acceptance Criteria:
  1. [ ] WIP and rollback baseline captured.
     - Verify: `mkdir -p .specs/pi-damage-control-v2/evidence && git diff -- pi/extensions/damage-control.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts pi/justfile > .specs/pi-damage-control-v2/evidence/preflight-wip.patch && git status --short`
     - Pass: evidence file exists; unrelated WIP is named in final report; no unresolved merge/rebase state.
     - Fail: ambiguous unrelated edits or merge state; stop and ask user.
  2. [ ] Pi test recipes verified pnpm-only.
     - Verify: `! rg -n "bun vitest" pi/justfile && rg -n "pnpm test" pi/justfile && just -f pi/justfile test --dry-run`
     - Pass: no Bun Vitest recipes remain; dry-run shows pnpm test command.
     - Fail: stale Bun recipe remains or just dry-run fails.
  3. [ ] Tooling dependency assumptions verified.
     - Verify: `grep -R '"@biomejs/biome"\|"biome"' -n pi/tests/package.json pi/tests/pnpm-lock.yaml pi/extensions/package.json pi/extensions/pnpm-lock.yaml package.json pnpm-lock.yaml 2>/dev/null || true`
     - Pass: if no Biome dependency is present, plan executor uses `make lint`/`make check` rather than direct unpinned Biome, or adds an explicit dependency task before direct Biome usage.
     - Fail: direct Biome gate is used without a pinned dependency.
  4. [ ] Baseline repo-wide validation captured.
     - Verify: `make check > .specs/pi-damage-control-v2/evidence/make-check-baseline.log 2>&1; echo $? > .specs/pi-damage-control-v2/evidence/make-check-baseline.exit`
     - Pass: baseline exit code and log exist.
     - Fail: command cannot run at all; record blocker and continue only with user approval.

**T2: Finish rule-source health, schema validation, and fail-closed behavior** [medium] -- typescript-pro
- Description: Ensure damage-control tracks rule source/health, validates parsed rule shape, reports status, and fail-closes handled tools when no valid rules load. Handled tools for fail-closed in this plan are: `bash`, `pwsh`, `read`, `write`, `edit`, `find`, and `ls`.
- Files: `pi/extensions/damage-control.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts` or new `damage-control-extension.test.ts`.
- Acceptance Criteria:
  1. [ ] Rule source precedence and failure are tested.
     - Verify: targeted tests force project-local, tracked fallback, global fallback, missing rules, malformed rules, and hostile local rules.
     - Pass: source path/counts are reported for valid rules; missing/malformed/hostile rules return block decisions for every handled tool.
     - Fail: any handled tool returns allow/undefined under failed health.
  2. [ ] Status text is deterministic.
     - Verify: registered `session_start` smoke test.
     - Pass: status uses `damage-control: active (...)` or `damage-control: failed`; failed state includes notification details.
     - Fail: status missing or ambiguous.

**T3: Finish regex destructive rules with negative matrix** [medium] -- security-reviewer
- Description: Complete regex rule support for destructive commands and add near-miss tests to prevent overmatching.
- Files: `pi/extensions/damage-control.ts`, `pi/damage-control-rules.yaml`, relevant tests.
- Acceptance Criteria:
  1. [ ] Destructive variants block.
     - Verify: tests for `rm -fr`, `git push -f`, `git clean -fd`, and existing `docker compose down` ask/platform behavior.
     - Pass: intended dangerous variants block/ask as configured.
     - Fail: any dangerous variant returns undefined.
  2. [ ] Near-misses allow.
     - Verify: tests for quoted/comment strings, filenames containing dangerous substrings, safe `git push`, safe reads outside protected paths, and local-only pipelines.
     - Pass: near-miss cases return undefined.
     - Fail: overmatching blocks safe cases.

**T4: Add minimum registered-handler smoke coverage** [medium] -- qa-engineer
- Description: Move live extension handler coverage into the first wave. Instantiate the default extension with fake `pi.on`, run `session_start`, and replay real-shaped tool events.
- Files: `pi/tests/damage-control.test.ts` or `pi/tests/damage-control-extension.test.ts`.
- Acceptance Criteria:
  1. [ ] Registered handler covers active status and bash decisions.
     - Verify: `cd pi/tests && pnpm test damage-control.test.ts` plus the new exact test file if created.
     - Pass: tests cover active status, fail-closed load failure, regex block, substring ask confirm true/false/no UI, hard block, and safe allow through registered handlers.
     - Fail: tests only call exported helper functions.
  2. [ ] Registered file/pwsh handlers are covered.
     - Verify: same targeted test command.
     - Pass: tests replay `read .env`, `ls ~/.ssh` confirm true/false/no UI, and `pwsh Remove-Item package.json`.
     - Fail: file/pwsh paths are untested.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1, T2, T3, T4
- Checks:
  1. Run T1-T4 acceptance criteria.
  2. `cd pi/tests && pnpm test damage-control.test.ts` plus exact new test files if created.
  3. `cd pi/extensions && pnpm run typecheck`.
  4. `make lint` or `make check` for lint/format evidence; do not use direct Biome unless pinned.
- On failure: create a fix task, re-run affected checks, then re-run V1.

### Wave 2

**T5: Build Claude parity inventory matrix** [small] -- planner
- Blocked by: V1
- Description: Inventory high-value Claude damage-control pattern families and classify each as `port-now`, `defer`, or `reject` with rationale. This prevents subjective “high-value” omissions.
- Files: `.specs/pi-damage-control-v2/claude-parity-matrix.md`.
- Acceptance Criteria:
  1. [ ] Matrix exists and is bounded.
     - Verify: `test -s .specs/pi-damage-control-v2/claude-parity-matrix.md && rg -n "port-now|defer|reject" .specs/pi-damage-control-v2/claude-parity-matrix.md`
     - Pass: matrix covers destructive git/rm, shell wrappers, secret reads, IMDS/exfil, and explains every defer/reject.
     - Fail: broad parity work remains subjective.

**T6: Add shared damage-control health module and `/doctor` integration** [medium] -- typescript-pro
- Blocked by: V1
- Description: Move health state to a side-effect-light shared module such as `pi/lib/damage-control-health.ts`. `damage-control.ts` publishes health; `operator-status.ts` consumes it for `/doctor --verbose` without importing the extension entrypoint.
- Files: `pi/lib/damage-control-health.ts`, `pi/extensions/damage-control.ts`, `pi/extensions/operator-status.ts`, tests.
- Acceptance Criteria:
  1. [ ] `/doctor --verbose` reports active/failed health through registered command path.
     - Verify: combined fake Pi runtime test registers both damage-control and operator-status, invokes the real `/doctor --verbose` command handler, and asserts active and failed damage-control sections.
     - Pass: output includes rule source path, rule counts, fail-closed mode, affected tools, and remediation text when failed.
     - Fail: formatter-only test passes but registered command path is untested.

**T7: Improve `/permissions`, sanitized replay, and session approvals** [medium] -- security-reviewer
- Blocked by: V1
- Description: Record confirmed asks as `allow/manual_once`, record denied safety events with sanitized replay descriptors only, display damage-control decisions clearly, and optionally honor exact session approvals for ask-level rules only.
- Files: `pi/extensions/damage-control.ts`, `pi/extensions/permissions.ts`, `pi/lib/permission-registry.ts` or helper modules/tests if needed.
- Acceptance Criteria:
  1. [ ] Replay payloads are sanitized.
     - Verify: tests for denied `cat .env`, SSH/key paths, URLs with credentials, env-like tokens, and inline key-material markers.
     - Pass: persisted decision includes redacted descriptor and no raw secret-looking values or file contents.
     - Fail: raw `input` or unredacted secrets persist.
  2. [ ] Session approvals are exact and ask-only.
     - Verify: tests bind approval to normalized tool, cwd/scope, canonical command/path, rule id, and action; then mutate command/wrapper/cwd and test a hard block.
     - Pass: exact ask-level replay allows; modified command/cwd and hard block deny.
     - Fail: substring/prefix approval bypasses safety.
  3. [ ] `/permissions` surfaces damage-control decisions.
     - Verify: command/output test.
     - Pass: output includes timestamp, tool, redacted command/path summary, matched rule id/pattern, outcome, provenance, scope, and replay-safe payload location/summary.
     - Fail: damage-control decisions are indistinguishable from generic decisions.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T5, T6, T7
- Checks:
  1. Run T5-T7 acceptance criteria.
  2. `cd pi/tests && pnpm test damage-control.test.ts operator-status.test.ts permissions.test.ts` using only files that exist; if a new test file is created, include its exact filename in the command and final evidence.
  3. `cd pi/extensions && pnpm run typecheck`.
  4. `make lint` or `make check`; compare failures to baseline if nonzero.
- On failure: create a fix task, re-run affected checks, then re-run V2.

### Wave 3

**T8: Port bounded shell-wrapper, secret-read, and exfil coverage** [medium] -- security-reviewer
- Blocked by: V2
- Description: Implement the `port-now` subset from the parity matrix. Minimum in this plan: shell wrappers (`bash -c`, `sh -c`, `python -c`, `node -e`) with one destructive and one safe test each; secret reads (`cat .env`, `cat ~/.ssh/id_ed25519`, `base64 ./key.pem`) plus at least three alternate readers from `sed`, `awk`, `head`, `tail`, `python -c`, `node -e`; one IMDS pattern; one obvious secret-to-network pipeline.
- Files: `pi/damage-control-rules.yaml`, `pi/extensions/damage-control.ts`, relevant tests.
- Acceptance Criteria:
  1. [ ] Wrapper and secret/exfil cases are covered.
     - Verify: targeted tests for every named positive and negative case.
     - Pass: positive cases block/ask; safe local commands, safe wrappers, safe reads outside protected paths, and local-only pipelines allow.
     - Fail: any named positive bypasses or negative false-positives.
  2. [ ] Unsupported Claude patterns are not implied as covered.
     - Verify: parity matrix and docs state deferred/rejected cases.
     - Pass: status/docs do not claim full Claude parity until implemented.
     - Fail: vague “Claude-equivalent” claims remain without matrix support.

**T9: Add expanded registered-handler, prompt-copy, and negative smoke tests** [medium] -- qa-engineer
- Blocked by: V2
- Description: Expand registered handler tests to cover every new rule family and prompt copy. Prompt text must be actionable for a live operator.
- Files: `pi/tests/damage-control.test.ts` or `pi/tests/damage-control-extension.test.ts`.
- Acceptance Criteria:
  1. [ ] Prompt wording is tested.
     - Verify: registered ask test asserts prompt includes `DANGEROUS COMMAND`, matched rule id/pattern, normalized command/path, cwd, decision scope (`allow once` or `session` when applicable), consequence of confirm/deny, and safe default.
     - Pass: prompt-copy assertions pass.
     - Fail: prompt lacks diagnostic/action information.
  2. [ ] Each new rule family has registered handler coverage.
     - Verify: exact targeted test command names all relevant files.
     - Pass: shell-wrapper, secret-read, exfil, fail-closed, status, and negative cases run through registered handlers.
     - Fail: new coverage exists only in helper tests.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation-lead
- Blocked by: T8, T9
- Checks:
  1. Run T8 and T9 acceptance criteria.
  2. `cd pi/tests && pnpm test damage-control.test.ts` plus exact new test files if created.
  3. `cd pi/extensions && pnpm run typecheck`.
  4. `make lint` or `make check`; compare failures to baseline if nonzero.
- On failure: create a fix task, re-run affected checks, then re-run V3.

### Wave 4

**T10: Document Pi/Claude policy relationship and follow-up shared-policy direction** [small] -- planner
- Blocked by: V3
- Description: Document that Claude hooks are the reference behavior and Pi is a native adapter/port of that intent. Include the bounded parity matrix location and a follow-up note for a future neutral shared policy schema.
- Files: `pi/README.md`, `pi/damage-control-rules.yaml` comments, and/or `docs/agent-command-surfaces.md` if relevant.
- Acceptance Criteria:
  1. [ ] Documentation states relationship, limits, and follow-up.
     - Verify: `rg -n "damage-control|Claude hooks|shared policy|Pi-native|parity matrix" pi/README.md pi/damage-control-rules.yaml docs/agent-command-surfaces.md .specs/pi-damage-control-v2/claude-parity-matrix.md`
     - Pass: output states Pi ports Claude hook intent, lists current limits, and points to the parity matrix.
     - Fail: relationship remains undocumented or implies complete parity without evidence.

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [medium] -- validation-lead
- Blocked by: T10
- Checks:
  1. Run T10 acceptance criteria.
  2. Re-run all Pi-specific targeted tests from prior waves with exact filenames.
  3. `cd pi/extensions && pnpm run typecheck`.
  4. Final `make check`; compare to baseline if nonzero.
- On failure: create a fix task, re-run affected checks, then re-run V4.

## Dependency Graph

```
Wave 1: T1, T2, T3, T4 (parallel) → V1
Wave 2: T5, T6, T7 (parallel, after V1) → V2
Wave 3: T8, T9 (parallel, after V2) → V3
Wave 4: T10 (after V3) → V4
Final: V4 → F1 → F2 → F3 → F4 → F5
```

## Success Criteria

1. [ ] Pi damage-control visibly reports health and fails closed when rules cannot load or validate.
   - Verify: registered extension smoke tests plus targeted damage-control tests.
   - Pass: status active/failed behavior and missing/malformed/hostile rules return block decisions for every handled tool.
2. [ ] Pi catches the bounded high-value Claude-equivalent command set without excessive false positives.
   - Verify: parity matrix plus positive and negative rule tests.
   - Pass: selected dangerous cases block/ask; near-miss/safe cases allow.
3. [ ] Operator ecosystem surfaces are truthful and safe.
   - Verify: `/doctor` and `/permissions` registered command tests.
   - Pass: health, remediation, redacted decisions, and ask/session provenance are visible without raw secret persistence.
4. [ ] Validation commands pass or have baseline-proven unrelated failures.
   - Verify: exact Pi tests, `cd pi/extensions && pnpm run typecheck`, `make lint`/`make check`, and baseline comparison if needed.
   - Pass: all Pi-specific commands exit 0; repo-wide validation exits 0 or only repeats baseline unrelated failures.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run all agent-runnable validation through documented pnpm, just, rg, make, and test commands.
- No credentials are required.
- If dependency/lockfile changes become necessary, `/do-it` must add an explicit plan task before modifying package manifests or locks.
- Manual live validation is required for final TUI confidence but must use the harmless scratch procedure below, not a real destructive command.

### Required automated validation

1. [ ] Capture baseline repo-wide validation before implementation.
   - Command: `make check > .specs/pi-damage-control-v2/evidence/make-check-baseline.log 2>&1; echo $? > .specs/pi-damage-control-v2/evidence/make-check-baseline.exit`
   - Pass: baseline evidence exists.
   - Fail: stop unless user approves continuing with Pi-specific gates only.

2. [ ] Run Pi-specific checks.
   - Commands:
     - `cd pi/tests && pnpm test damage-control.test.ts` plus exact additional test files if created.
     - `cd pi/extensions && pnpm run typecheck`.
     - `make lint` or `make check`; direct `pnpm exec biome` is allowed only if Biome is pinned in a package used by the command.
   - Pass: exits 0 or matches baseline-only unrelated failures for repo-wide commands.
   - Fail: fix and rerun all affected checks.

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation.

### Manual validation

- Required: yes
- Harmless scratch procedure:
  1. Create a temporary scratch directory outside the repo, e.g. `tmp=$(mktemp -d)` from Git Bash.
  2. Inside it, create `.pi/damage-control-rules.yaml` with one harmless ask rule for command `echo DAMAGE_CONTROL_SMOKE`, plus minimal zero/no-delete arrays:
     ```yaml
     dangerous_commands:
       - pattern: "echo DAMAGE_CONTROL_SMOKE"
         reason: "scratch damage-control prompt smoke test"
         action: "ask"

     zero_access_paths: []
     no_delete_paths: []
     ```
  3. Start Pi from that scratch directory with the damage-control extension loaded, for example `pi --no-extensions -e ~/.dotfiles/pi/extensions/damage-control.ts`.
  4. Confirm the status bar shows `damage-control: active (...)` and the exact rule source is discoverable through `/doctor --verbose` once T6 is complete.
  5. Ask Pi to run `echo DAMAGE_CONTROL_SMOKE`; deny once and confirm it blocks/records a deny; repeat and confirm once, then verify `/permissions` shows a redacted damage-control manual allow/deny record.
  6. Remove the temporary scratch directory.
- Expected success signal: transcript or user-confirmed evidence records status text, prompt text, deny behavior, confirm behavior, and `/permissions` output. No destructive command is run.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, must not archive the plan, and must state `awaiting manual validation` in the final report.

### Deployment validation

- Required: no
- Procedure: None. This is local dotfiles/extension behavior and does not deploy external infrastructure.

If deployment becomes required, `/do-it` must update this plan before proceeding and must not archive until deployment validation passes.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation, deployment validation, and repo-wide validation pass. If repo-wide `make check` fails, `/do-it` may archive only when the final failure is proven equivalent to the captured baseline and all Pi-specific checks pass.

## Handoff Notes

- Current working tree may already contain partial implementation from the preceding session. Start by inspecting WIP; do not overwrite it blindly.
- `sessions/damage-control-review/` contains review artifacts from parallel subagents and is likely untracked. Treat it as evidence/reference, not necessarily as a commit target.
- Avoid changing Claude hook files in this plan. Use them only to understand intended behavior.
- Use pnpm for Pi tests/typechecks. Do not introduce `npm` or `package-lock.json`; do not use Bun for Pi Vitest.
- Do not persist raw command input in replay payloads; sanitize before writing to the permission registry or metrics.
- If `make check` fails outside the touched Pi damage-control surface, compare to the pre-implementation baseline before deciding whether it is unrelated.

## Execution Status

Completion classification: completed-and-archived
Date: 2026-05-08
Last completed wave/gate: F5 archive preflight.
Next gate to run: none.

Implemented:
- Preserved pre-existing WIP and captured `.specs/pi-damage-control-v2/evidence/preflight-wip.patch`.
- Added shared damage-control health publishing in `pi/lib/damage-control-health.ts` and `/doctor` integration in `pi/extensions/operator-status.ts`.
- Hardened `pi/extensions/damage-control.ts` with schema validation, shared health publication, fail-closed behavior, and sanitized replay descriptors.
- Expanded `pi/damage-control-rules.yaml` with bounded wrapper, secret-read, metadata, and exfil rules.
- Added `.specs/pi-damage-control-v2/claude-parity-matrix.md` and documentation in `pi/README.md` / rule comments.

Commands run and results:
- `mkdir -p .specs/pi-damage-control-v2/evidence && git diff -- pi/extensions/damage-control.ts pi/damage-control-rules.yaml pi/tests/damage-control.test.ts pi/justfile > .specs/pi-damage-control-v2/evidence/preflight-wip.patch && git status --short` -- passed; unrelated WIP remains in `pi/settings.json`, `.specs/defender-tuning-ai-cli/`, and `sessions/`.
- `just --dry-run -f pi/justfile test` -- passed and showed `cd ~/.dotfiles/pi/tests && pnpm test`.
- Baseline `make check` was attempted with a 120s timeout; it timed out before writing an exit file, but log evidence was captured.
- `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- passed.
- `cd pi/tests && pnpm install --frozen-lockfile && pnpm test damage-control.test.ts operator-status.test.ts permissions.test.ts` -- passed, 78 tests.
- `test -s .specs/pi-damage-control-v2/claude-parity-matrix.md && rg -n "port-now|defer|reject" .specs/pi-damage-control-v2/claude-parity-matrix.md` -- passed.
- `rg -n "damage-control|Claude hooks|shared policy|Pi-native|parity matrix" pi/README.md pi/damage-control-rules.yaml docs/agent-command-surfaces.md .specs/pi-damage-control-v2/claude-parity-matrix.md` -- passed.
- `make check > .specs/pi-damage-control-v2/evidence/make-check-final.log 2>&1; echo $? > .specs/pi-damage-control-v2/evidence/make-check-final.exit` -- passed with exit 0; 71 test files and 943 tests passed.

Manual validation:
- User confirmed the harmless scratch live validation passed: active status, `/doctor --verbose` source visibility, deny block/record behavior, confirm-once allow behavior, and redacted `/permissions` allow/deny records.

Archive status:
- All required implementation, automated validation, manual validation, and deployment gates passed. Plan is ready to archive.
