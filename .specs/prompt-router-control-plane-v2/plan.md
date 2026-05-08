---
created: 2026-05-08
status: draft
completed:
---

# Plan: Prompt Router Control Plane V2 on Awaited Provider Seam

## Objective

Complete the prompt-router control-plane cleanup using the completed provider-architecture spike as the same-turn routing foundation. V2 must route through the awaited `before_provider_request` / immutable `RouteDecision` seam instead of the failed input-hook `setModel` / `setThinkingLevel` side-effect path.

## Context

The original plan at `.specs/prompt-router-control-plane/plan.md` stopped at Wave 0 because same-turn routing could not be proven from the input hook. The provider-architecture spike at `.specs/archive/prompt-router-control-plane/provider-architecture-spike.md` completed and proved an awaited provider seam with same-turn dispatch evidence.

## Constraints

- Continue work in the existing isolated worktree `../.dotfiles-prompt-router-control-plane` on branch `plan/prompt-router-control-plane`. Before mutation, resolve `ORIGINAL_ROOT="$(pwd -P)"` and `WORKTREE_ROOT="$(cd ../.dotfiles-prompt-router-control-plane && pwd -P)"`, verify `git -C "$WORKTREE_ROOT" rev-parse --show-toplevel` equals `WORKTREE_ROOT`, verify branch `plan/prompt-router-control-plane`, then `cd "$WORKTREE_ROOT"` and verify `pwd -P` equals `WORKTREE_ROOT` and differs from `ORIGINAL_ROOT`.
- Do not merge, rebase, cherry-pick, fast-forward, push, or mutate the original checkout.
- Use pnpm only for Pi TypeScript validation; do not use Bun for Pi TypeScript work.
- Use canonical route vocabulary: `nano | mini | core | large | max`.
- Legacy labels (`Haiku`, `Sonnet`, `Opus`) are allowed only at a named compatibility adapter boundary and compatibility tests/docs.
- Default logs/evidence must not include raw prompts, prompt excerpts, endpoints, account IDs, tokens, credentials, private paths, or screenshots. Privacy/log-disable defaults must be verified in Wave 0 before any classifier/eval command runs.
- Cross-provider fallback is denied by default and must fail closed without applying stale route state.
- `max` is explicit/policy-only in V2. `nano` remains disabled/unavailable by default unless explicitly configured.
- All durable evidence goes under `.specs/prompt-router-control-plane-v2/evidence/` in the worktree. Review artifacts must be copied into the worktree review directory before archive preflight so the worktree is the single archive source.

## Automation Plan

| Operation | Command | Evidence |
|---|---|---|
| Worktree guard | `ORIGINAL_ROOT="$(pwd -P)" && WORKTREE_ROOT="$(cd ../.dotfiles-prompt-router-control-plane && pwd -P)" && test "$(git -C "$WORKTREE_ROOT" rev-parse --show-toplevel)" = "$WORKTREE_ROOT" && test "$(git -C "$WORKTREE_ROOT" branch --show-current)" = plan/prompt-router-control-plane && cd "$WORKTREE_ROOT" && test "$(pwd -P)" = "$WORKTREE_ROOT" && test "$(pwd -P)" != "$ORIGINAL_ROOT"` | `.specs/prompt-router-control-plane-v2/evidence/worktree-guard.md` |
| Spike foundation check | `cd "$WORKTREE_ROOT" && test -f .specs/archive/prompt-router-control-plane/provider-architecture-spike.md && grep -R "RouteDecision\|before_provider_request\|same_turn_applied" -n pi/extensions pi/tests pi/lib --exclude-dir=node_modules` | `.specs/prompt-router-control-plane-v2/evidence/spike-foundation.md` |
| Evidence wrapper | For every gate, write command, cwd, timestamp, tool versions, stdout/stderr summary, and exit status to the named evidence file before marking the checklist item complete. | every gate evidence file |
| Command contract checks | `cd "$WORKTREE_ROOT" && uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --help && uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --help` and grep help for `--prompt-file`, `--config`, `--data`, `--sequences`, and `--json` before using those options as gates | `.specs/prompt-router-control-plane-v2/evidence/command-contracts.md` |
| Typecheck | `cd "$WORKTREE_ROOT/pi/extensions" && pnpm install --frozen-lockfile && pnpm run typecheck` | gate evidence markdown |
| Targeted Vitest | `cd "$WORKTREE_ROOT/pi/tests" && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` | gate evidence markdown with named same-turn/status/privacy/context/failure tests |
| Full Pi tests | `cd "$WORKTREE_ROOT/pi/tests" && pnpm install --frozen-lockfile && pnpm run test` | gate evidence markdown |
| Python classifier checks | `cd "$WORKTREE_ROOT" && LOG_ROUTING=0 uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --prompt-file .specs/prompt-router-control-plane-v2/evidence/synthetic_simple.txt` plus invalid-mode variant after T2 implements real `--prompt-file` support | `.specs/prompt-router-control-plane-v2/evidence/classifier-mode.md` |
| Classifier artifact/hash inventory | command implemented by T2, then run for `t2`, `lgbm`, `ensemble`, and `confgate`; must list required artifacts, `.sha256` sidecars, missing-sidecar failure, and hash-mismatch failure without fallback | `.specs/prompt-router-control-plane-v2/evidence/classifier-artifacts.md` |
| Legacy-label audit | `cd "$WORKTREE_ROOT" && grep -RInE "Haiku|Sonnet|Opus" pi/extensions pi/lib pi/tests pi/prompt-routing --exclude-dir=node_modules` with only the named compatibility adapter, compatibility tests, and migration docs allowlisted | `.specs/prompt-router-control-plane-v2/evidence/legacy-label-audit.md` |
| Eval | `cd "$WORKTREE_ROOT" && LOG_ROUTING=0 uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --data pi/prompt-routing/data/eval_v3.jsonl --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --classifier t2 --json` after T7 implements the CLI options | `.specs/prompt-router-control-plane-v2/evidence/eval-summary.json` |
| Repo-wide validation | `cd "$WORKTREE_ROOT" && make check` | `.specs/prompt-router-control-plane-v2/evidence/make-check.md` |
| Archive preflight | `cd "$WORKTREE_ROOT" && git status --short && grep -RInE "(sk-[A-Za-z0-9]|api[_-]?key|token|secret|https?://|C:/Users|/home/[^/]+)" .specs/prompt-router-control-plane-v2 pi/extensions pi/lib pi/tests pi/prompt-routing > .specs/prompt-router-control-plane-v2/evidence/archive-scan.raw; rc=$?; test $rc -eq 0 -o $rc -eq 1`, followed by explicit allowlist triage that exits nonzero for unauthorized matches or scanner errors (`grep` exit `1` means no matches; exit `2+` is scanner failure) | `.specs/prompt-router-control-plane-v2/evidence/archive-preflight.md` |

## Execution Checklist

### Wave 0: Foundation

- [ ] W0a: Resolve and enter isolated worktree
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/worktree-guard.md`
- [ ] W0b: Copy or verify reviewed plan exists inside `$WORKTREE_ROOT`
  - Status: pending
  - Evidence: `$WORKTREE_ROOT/.specs/prompt-router-control-plane-v2/plan.md`
- [ ] W0c: Create synthetic and manual-validation evidence templates inside `$WORKTREE_ROOT`
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/synthetic_simple.txt`, `.specs/prompt-router-control-plane-v2/evidence/manual-validation-template.md`
- [ ] W0d: Validate completed provider spike foundation
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/spike-foundation.md`
- [ ] W0e: Validate command contracts and privacy/log-disable preflight
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/command-contracts.md`
- [ ] V0: Validate same-turn seam remains passing
  - Status: pending
  - Evidence: targeted Vitest evidence markdown

### Wave 1: Canonical routes and classifier mode

- [ ] T1: Add one canonical route vocabulary/ordering module and legacy adapter
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/legacy-label-audit.md`, targeted Vitest evidence
- [ ] T2: Add classifier mode settings validation and strict Python invalid-mode behavior
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/classifier-mode.md`, `.specs/prompt-router-control-plane-v2/evidence/classifier-artifacts.md`
- [ ] V1a: Validate canonical route and classifier mode behavior
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/classifier-mode.md`
- [ ] V1b: Validate classifier artifact/hash inventory
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/classifier-artifacts.md`
- [ ] V1c: Validate legacy-label audit and TS/Python parity
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/legacy-label-audit.md`

### Wave 2: Resolver and operator truth

- [ ] T3: Add minimal route profile resolver on top of `RouteDecision`
  - Status: pending
  - Evidence: targeted Vitest evidence, `.specs/prompt-router-control-plane-v2/evidence/status-explain-schema.md`
- [ ] T4: Make status/explain/log output derive from the dispatch `RouteDecision`
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/status-explain-schema.md`
- [ ] V2: Validate resolver, status, explain, and privacy schemas
  - Status: pending
  - Evidence: --

### Wave 3: Context and overrides

- [ ] T5: Add bounded context capsule and one-turn anti-downgrade policy
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/context-override-matrix.md`
- [ ] T6: Implement override hierarchy and context-window safety checks
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/context-override-matrix.md`
- [ ] V3: Validate context/override matrix
  - Status: pending
  - Evidence: --

### Wave 4: Eval and telemetry

- [ ] T7: Unify eval runner with runtime settings and sequence fixtures
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/eval-summary.json`
- [ ] T8: Harden privacy-conscious telemetry, hash parity, rollback, and archive controls
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/wave4-validation.md`, rollback drill evidence
- [ ] V4a: Validate eval gate
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/eval-summary.json`
- [ ] V4b: Validate telemetry/privacy/hash-parity gates
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/wave4-validation.md`
- [ ] V4c: Validate rollback drill
  - Status: pending
  - Evidence: rollback drill evidence and checksums

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: all wave evidence files and checklist items complete
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/make-check.md`
- [ ] F3: Manual validation passed or explicitly deferred by user
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/manual-validation.md` or explicit user deferral recorded in Execution Status
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: deployment not required recorded in Execution Status
- [ ] F5a: Copy review artifacts into worktree archive source
  - Status: pending
  - Evidence: copied review directory in `$WORKTREE_ROOT/.specs/prompt-router-control-plane-v2/review-1/`
- [ ] F5b: Archive preflight scan and allowlist triage complete
  - Status: pending
  - Evidence: `.specs/prompt-router-control-plane-v2/evidence/archive-preflight.md`
- [ ] F5c: Archive move complete
  - Status: pending
  - Evidence: `$WORKTREE_ROOT/.specs/archive/prompt-router-control-plane-v2/plan.md`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|---|---|---|---|---|---|
| W0a | Resolve and enter isolated worktree | evidence only | preflight | small | qa-engineer | -- |
| W0b | Copy or verify reviewed plan exists inside worktree | plan/evidence | preflight | small | qa-engineer | W0a |
| W0c | Create synthetic/manual validation templates inside worktree | evidence only | preflight | small | qa-engineer | W0b |
| W0d | Validate completed provider spike foundation | evidence only | preflight | small | qa-engineer | W0b |
| W0e | Validate command contracts and privacy/log-disable preflight | evidence only | validation | small | qa-engineer | W0c,W0d |
| V0 | Validate same-turn seam remains passing | tests/evidence | validation | medium | qa-engineer | W0e |
| T1 | Add canonical route vocabulary and legacy adapter | `pi/lib/prompt-router/*`, extension/tests | feature | medium | typescript-pro | V0 |
| T2 | Add classifier mode validation and strict Python mode handling | TS config/classifier, Python classifier, tests | feature | medium | python-pro | V0 |
| V1 | Validate canonical route and classifier mode behavior | evidence | validation | medium | qa-engineer | T1,T2 |
| T3 | Add minimal route profile resolver on top of `RouteDecision` | resolver/extension/tests | feature | medium | typescript-pro | V1 |
| T4 | Make status/explain/log derive from dispatch `RouteDecision` | extension/log/tests | feature | medium | typescript-pro | V1 |
| V2 | Validate resolver/status/explain/privacy schemas | evidence | validation | medium | qa-engineer | T3,T4 |
| T5 | Add bounded context capsule and anti-downgrade policy | policy/state/tests | feature | medium | typescript-pro | V2 |
| T6 | Implement override hierarchy and context-window safety | policy/state/tests | feature | medium | typescript-pro | V2 |
| V3 | Validate context/override matrix | evidence | validation | medium | qa-engineer | T5,T6 |
| T7 | Unify eval runner with runtime settings and sequence fixtures | Python eval/data/docs/tests | architecture | large | python-pro | V3 |
| T8 | Harden telemetry/hash parity/rollback/archive controls | TS/Python log helpers/docs/tests | feature | medium | security-reviewer | V3 |
| V4 | Validate eval, telemetry, and privacy gates | evidence | validation | large | qa-engineer | T7,T8 |

## Execution Waves

### Wave 0: Foundation

**W0a/W0b/W0c/W0d/W0e: Validate worktree and completed provider spike foundation**
- W0a: run the worktree guard first, then keep the shell in `$WORKTREE_ROOT` for every subsequent file creation and command in this plan.
- W0b: copy the reviewed plan from the original checkout into `$WORKTREE_ROOT/.specs/prompt-router-control-plane-v2/plan.md` if missing, or verify that the worktree copy is byte-identical to the reviewed plan; record the source/destination and checksum.
- W0c: inside `$WORKTREE_ROOT`, create `.specs/prompt-router-control-plane-v2/evidence/synthetic_simple.txt` with only a non-secret synthetic prompt, and create `.specs/prompt-router-control-plane-v2/evidence/manual-validation-template.md` with exact synthetic prompts for normal, continuation, cheap/brief override, route/model pin, and unavailable/policy-only cases plus expected sanitized fields.
- W0d: run the spike foundation check from the Automation Plan.
- W0e: run command-contract checks and privacy/log-disable preflight from the Automation Plan.
- Pass: evidence confirms branch, worktree, completed spike plan, `RouteDecision`, `before_provider_request`, `same_turn_applied`, command option availability or planned implementation gap, and no raw prompt/excerpt output before classifier/eval validation.
- Fail: stop and ask before changing branch/path or proceeding without the completed spike foundation.

**V0: Validate same-turn seam remains passing**
- Run TypeScript typecheck and targeted prompt-router Vitest.
- Pass: same-turn provider seam tests pass and evidence names the ordered trace/correlation from provider spike.
- Fail: repair the seam before any control-plane behavior work.

### Wave 1: Canonical routes and classifier mode

**T1: Add canonical route vocabulary, shared decision contract, and legacy adapter**
- First inventory existing route/model labels and reuse/consolidate existing provider-spike definitions where possible.
- Define shared TypeScript modules under `pi/lib/prompt-router/`, including `route-vocabulary.ts` and `route-decision.ts`, exporting `RouterSize`, route ordering, canonical candidate normalization, legacy-label adapter, `RouteDecision`, immutable `decisionTrace`/schema guards, and request-scoped state helpers.
- Extension, classifier adapter, resolver, telemetry, and tests must import the shared modules; `RouteDecision` must not remain defined only inside `pi/extensions/prompt-router.ts`.
- Add a language-neutral JSON schema/fixture for canonical route labels and classifier modes; TypeScript and Python parity tests must read it and fail on drift.
- Acceptance: tests cover `Haiku→mini`, `Sonnet→core`, `Opus→large`, invalid labels, candidates, confidence, request/decision ID scoping, and legacy-label audit evidence shows no unauthorized primary legacy labels outside the named compatibility adapter/tests/docs.

**T2: Add classifier mode settings validation and strict Python mode handling**
- Add/validate `router.classifier.mode`: `t2 | lgbm | ensemble | confgate`.
- Invalid persisted settings fail config load and disable automatic routing until corrected.
- Invalid CLI/eval mode exits nonzero.
- Runtime subprocess failures for valid modes produce canonical safe `null-fallback` metadata with no stale route and no raw prompts.
- Add real `--prompt-file` support or change all gates to a supported stdin/file contract; add regression coverage proving the path is not classified as prompt text.
- Add artifact/hash-sidecar inventory command for all supported modes; missing/mismatch fails closed.
- Enforce bounded timeout, subprocess cleanup, and stdout/stderr size limits for classifier/eval calls.
- Ensure early classifier/eval validation runs with logging disabled or hash-only output until T8 hardens telemetry defaults.

**V1: Validate canonical route and classifier mode behavior** (aggregate for checklist gates V1a/V1b/V1c)
- Run typecheck, targeted Vitest, valid/invalid Python commands, command-contract checks, artifact inventory/hash checks, language-neutral TS/Python parity tests, and legacy-label audit with allowlist/fail criteria.
- Save `classifier-mode.md` and `classifier-artifacts.md`.

### Wave 2: Resolver and operator truth

**T3: Add minimal route profile resolver on top of `RouteDecision`**
- Resolver fields carried in the immutable `RouteDecision.decisionTrace`: route, domain, effort, profile, provider, model, routeState, fallbackFrom, reason, sanitized provider family, confidence, candidates, rule, context flags, override scope, and fallback reason.
- Tests cover `nano` disabled by default, explicit `nano→mini` fallback only when configured, `mini/core/large/max`, policy-only `max`, missing credentials, denied cross-provider fallback, and sanitized provider output.

**T4: Make status/explain/log derive from the dispatch `RouteDecision`**
- Schemas derive only from the dispatched immutable `RouteDecision`/`decisionTrace` and include route decision ID, same-turn applied, classifier mode, raw/applied route, confidence, candidates, rule, context flags, provider/model/thinking, route state, fallback reason, override scope, and operator summary.
- No raw prompt/excerpt by default.

**V2: Validate resolver, status, explain, and privacy schemas**
- Run typecheck and targeted Vitest.
- Save `.specs/prompt-router-control-plane-v2/evidence/status-explain-schema.md`.

### Wave 3: Context and overrides

**T5: Add bounded context capsule and one-turn anti-downgrade policy**
- Implement deterministic `RoutingContextCapsule`, one-turn `context-continuation-hold`, route ordering, cheap/fast/brief downgrade-intent bypass, and log-disable setting that preserves `/router-explain` visibility.
- Tests include `do option 2`, `patch it`, `same`, `now implement`, cheap/brief negatives, non-continuation lookalikes, and overlapping provider requests proving context/hold state is keyed by decision/request ID and cleared after dispatch.

**T6: Implement override hierarchy and context-window safety checks**
- Enforce: explicit model selection > route pin > per-turn override > hard safety/provider policy > automatic policy > fallback.
- Prevent silent context-window/compression shrinkage.
- Tests cover clear command/lifetime, status/explain visibility, credential/provider inventory with sanitized provider availability only, and fail-closed behavior for missing/ambiguous credentials.

**V3: Validate context/override matrix**
- Run typecheck and targeted Vitest.
- Save `.specs/prompt-router-control-plane-v2/evidence/context-override-matrix.md`.

### Wave 4: Eval and telemetry

**T7: Unify eval runner with runtime settings and sequence fixtures**
- First implement/test eval CLI support for `--config`, `--data`, `--sequences`, `--classifier`, and `--json`; command-contract help checks must pass before the eval command is used as a validation gate. Eval uses the same classifier mode and policy settings as runtime.
- Define metrics: canonical route order, top-1 accuracy, catastrophic under-routing, over-routing, cost-weighted quality, route thrash, policy delta, sequence aggregation, baseline comparison, and thresholds.
- Add `context_sequences_v1.jsonl` fixtures.
- Eval output includes classifier artifacts/hash status and hash-mismatch fail-closed fixture.

**T8: Harden privacy-conscious telemetry, hash parity, rollback, and archive controls**
- Standardize JSONL schema, TypeScript/Python prompt hash normalization, default excerpt absence, explicit user opt-in gate for redacted excerpts, maximum excerpt length, deterministic redaction, retention/purge behavior, mandatory owner-only permission/ACL validation for telemetry/evidence files with documented Windows/MSYS fallback, rotation/limits, corrupted-line tolerant readers, migration, purge command, rollback manifest, archive scans, and a synthetic rollback drill with checksums.

**V4: Validate eval, telemetry, and privacy gates** (aggregate for checklist gates V4a/V4b/V4c)
- Run typecheck, full Pi tests, valid/invalid eval, log-reader/privacy/hash-parity checks, and capsule-log disablement check.
- Save `.specs/prompt-router-control-plane-v2/evidence/wave4-validation.md`.

## Dependency Graph

```text
W0a -> W0b -> (W0c,W0d) -> W0e -> V0 -> (T1,T2) -> (V1a,V1b,V1c) -> (T3,T4) -> V2 -> (T5,T6) -> V3 -> (T7,T8) -> (V4a,V4b,V4c) -> F1 -> F2 -> F3 -> F4 -> F5a -> F5b -> F5c
```

## Success Criteria

1. Same-turn routing foundation remains proven through awaited provider dispatch.
   - Verify: targeted Vitest plus evidence from V0.
   - Pass: `RouteDecision.same_turn_applied` and provider/model/thinking are consumed before dispatch for the same decision ID.
2. Router control plane is canonical and truthful.
   - Verify: targeted Vitest and status/explain/log fixtures.
   - Pass: canonical route vocabulary and actual classifier mode appear everywhere except named compatibility fields.
3. Continuation and override safety work together.
   - Verify: context/override matrix evidence and tests.
   - Pass: no silent downgrade, stale route, context-window shrink, or implicit provider boundary crossing.
4. Eval and telemetry are runtime-comparable and private by default.
   - Verify: eval JSON, telemetry tests, hash parity checks, and archive preflight scan.
   - Pass: metrics are schema-backed; invalid modes fail closed; raw prompts/excerpts are absent by default.

## Validation Contract

### Required automated validation

1. `WORKTREE_ROOT="$(cd ../.dotfiles-prompt-router-control-plane && pwd -P)"` followed by the worktree guard from the Automation Plan.
2. `cd "$WORKTREE_ROOT/pi/extensions" && pnpm install --frozen-lockfile && pnpm run typecheck`
3. `cd "$WORKTREE_ROOT/pi/tests" && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` with evidence listing the same-turn, status/explain, privacy, context/override, and failure-path test names.
4. `cd "$WORKTREE_ROOT/pi/tests" && pnpm install --frozen-lockfile && pnpm run test`
5. `cd "$WORKTREE_ROOT" && make check`
6. All task-specific verification commands listed in the waves.
7. Command-contract checks, language-neutral TS/Python route/mode parity checks, legacy-label audit, classifier artifact/hash inventory, rollback drill, review-artifact copy, archive preflight scan/allowlist triage, and archive move from the Automation Plan.

All must exit 0 or the plan is not complete and must not be archived.

### Manual validation

Required after automated validation unless the user explicitly defers it. The manual-validation template must be created in W0 before this gate can run.

1. Use only synthetic prompts from `.specs/prompt-router-control-plane-v2/evidence/manual-validation-template.md`.
2. Start a local Pi session with the modified extension loaded.
3. Route one normal prompt, one continuation prompt after a larger route, one cheap/brief override, one route/model pin, and one unavailable/policy-only route case if supported.
4. Run `/router-status` and `/router-explain`.
5. Record only sanitized fields in `.specs/prompt-router-control-plane-v2/evidence/manual-validation.md`.

If manual validation is skipped/deferred, classify as `implemented-awaiting-manual-validation` and do not archive.

### Deployment validation

Not required. This is local dotfiles/Pi extension behavior.

### Archive rule

Archive only after all automated validation, task-specific verification, manual validation, deployment validation, repo-wide validation, rollback drill, and archive preflight pass. The worktree is the single archive source: copy review artifacts into `$WORKTREE_ROOT/.specs/prompt-router-control-plane-v2/review-1/`, then move the worktree plan/evidence/reviews together to `$WORKTREE_ROOT/.specs/archive/prompt-router-control-plane-v2/` and set frontmatter `status: completed` and `completed: YYYY-MM-DD`. Do not mutate the original checkout except by explicit user-approved sync after archive.

## Execution Status

- Completion classification: not-started.
- Status: ready for review/execution.
- Last updated: 2026-05-08.
- Resume ledger rule: after every task/gate, record cwd, branch, git status, commands run, artifacts created, failures/repairs, changed files, and next safe command in this section before advancing. Repair protocol: capture failing command, add/identify regression coverage, fix, rerun failed gate plus dependent gates, and record before/after evidence.
- Last completed wave/gate: none.
- Next wave/gate to run: W0.
- Why not archived: implementation has not started.
