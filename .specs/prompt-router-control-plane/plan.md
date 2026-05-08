---
created: 2026-05-07
status: draft
completed:
---

# Plan: Prompt Router Control Plane and Context-Aware Routing V1

## Context & Motivation

The PRD at `.specs/prompt-router-roadmap/PRD.md` identifies two router failures: control-plane drift across classifier mode, route vocabulary, status/explain output, logs, and eval; and under-routing of short continuation prompts such as “do option 2.” Static inspection during review confirmed the current implementation has real drift and timing risk: `pi/extensions/prompt-router.ts` fires `classifyAndRoute(...)` in the input hook without awaiting before returning continue, `/router-explain` hardcodes `Classifier: confgate`, and the TypeScript classifier bridge hardcodes classifier invocation details while prompt excerpts are emitted in runtime/failure paths. This plan therefore starts with a blocking same-turn proof before behavior changes proceed.

## Constraints

- Platform: Windows host using Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: bash-compatible MSYS shell.
- Repo markers found: `pyproject.toml`, `Makefile`, `.gitattributes`; Pi TypeScript validation is pnpm-only.
- Use canonical route vocabulary `nano | mini | core | large | max`; legacy `Haiku/Sonnet/Opus` only at a named adapter boundary.
- Implement exactly one exported route vocabulary/ordering module consumed by extension, classifier adapter, resolver, telemetry, eval, and tests; local ad-hoc route unions/maps are not allowed outside compatibility adapters.
- Do not retrain the Python classifier in V1; Python schema remains `3.0.0` unless separately planned.
- Invalid classifier mode behavior is fixed for V1: invalid persisted settings fail at settings/config load and disable automatic routing until corrected; invalid CLI/eval mode exits nonzero; runtime subprocess failures for an otherwise valid mode may emit canonical safe `null-fallback` metadata. All three paths must render the same reason in status/explain/log/eval and must never silently fall back to another classifier mode or apply stale previous-turn state.
- Default logging must not include raw prompts or excerpts. Opt-in excerpts must be redacted and tested on success and failure paths.
- Cross-provider fallback must be explicit and denied by default across provider trust boundaries.
- `max` is policy-only/explicit escalation in V1. `nano` default V1 behavior is `disabled`/unavailable, not automatic fallback; fallback to `mini` may be added only via explicit resolver config and must be visible in status/explain/log output.
- Evidence must be durable under `.specs/prompt-router-control-plane/evidence/`; transient terminal output alone is not sufficient to mark a checklist item complete.
- Implementation must run in a dedicated git worktree, not the original checkout. Use branch `plan/prompt-router-control-plane` and worktree path `../.dotfiles-prompt-router-control-plane` unless either already exists, in which case stop and ask the user before choosing a different path/name.
- Do not merge, rebase, cherry-pick, fast-forward, or push worktree changes back to the original checkout as part of this plan. Rollback is deleting the worktree/branch after preserving any requested evidence.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Current input-hook router with normalized control plane | Incremental and close to existing files/tests | Current hook is fire-and-forget; may not affect same generation turn | Selected only if T0 same-turn proof passes |
| Logical `router/*` provider architecture | Stronger before-generation guarantee and cleaner profiles | Larger migration and broader blast radius | Required follow-up if T0 fails |
| Full chat-history classifier input | More semantic context | Privacy, latency, noisy eval, larger prompt surface | Rejected for V1 |
| Deterministic continuation capsule and anti-downgrade rule | Cheap, explainable, sub-ms, easy fixtures | Can false-positive and over-route | Selected after same-turn proof, with explicit cheap/brief override and one-turn bound |
| Learned routing from logs | Potential long-term quality/cost gains | Requires telemetry/eval maturity first | Rejected for V1 |
| External proxy/microservice router | Provider-agnostic and shared across apps | More operational complexity and less Pi-native state/status integration | Rejected; opposite pattern fits only if multiple apps need one shared router |

## Objective

Deliver the smallest safe V1 that proves routing affects the same generation turn, then normalizes the control plane: canonical route sizes, settings-driven classifier mode, truthful status/explain/log output, minimal Codex route profile resolution, explicit override/provider safety, bounded context-continuation anti-downgrade, and runtime-comparable eval/telemetry. If the same-turn proof fails, this plan stops without marking V1 complete and produces a provider-architecture spike plan instead.

## Project Context

- **Language**: TypeScript/JavaScript for Pi extensions/tests; Python for classifier/eval; shell/Makefile for repo validation.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`; repo-wide `make check`.
- **Lint command**: `make lint`; Pi typecheck `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
- **Evidence root**: `.specs/prompt-router-control-plane/evidence/`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Worktree preflight | `git rev-parse --show-toplevel && test ! -e ../.dotfiles-prompt-router-control-plane && ! git show-ref --verify --quiet refs/heads/plan/prompt-router-control-plane && test ! -d .git/rebase-merge && test ! -d .git/rebase-apply && test ! -f .git/MERGE_HEAD && git worktree add -b plan/prompt-router-control-plane ../.dotfiles-prompt-router-control-plane HEAD` | none | `.specs/prompt-router-control-plane/evidence/worktree-preflight.md` in the worktree |
| Preflight inventory | `cd ../.dotfiles-prompt-router-control-plane && mkdir -p .specs/prompt-router-control-plane/evidence && git status --short && find pi/tests pi/prompt-routing -maxdepth 3 \( -name '*router*' -o -name '*eval*' \) -print` | none | `.specs/prompt-router-control-plane/evidence/preflight-inventory.md` in the worktree |
| Pi TS deps/typecheck | `cd ../.dotfiles-prompt-router-control-plane/pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` | none | gate evidence markdown with command/exit code |
| Pi Vitest | `cd ../.dotfiles-prompt-router-control-plane/pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` | none | gate evidence markdown with named test list |
| Python classifier checks | `cd ../.dotfiles-prompt-router-control-plane && uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --prompt-file .specs/prompt-router-control-plane/evidence/synthetic_simple.txt` and invalid-mode variant from T2 | none | `.specs/prompt-router-control-plane/evidence/classifier-mode.md` in the worktree |
| Unified eval | `cd ../.dotfiles-prompt-router-control-plane && uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --data pi/prompt-routing/data/eval_v3.jsonl --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --classifier t2 --json` or the exact replacement recorded by T7 | none | `.specs/prompt-router-control-plane/evidence/eval-summary.json` in the worktree |
| Same-turn proof | Instrumented harness/test added by T0; preferred seam is Pi extension test harness around the input hook plus a mocked generation dispatch observer that records `setModel`/`setThinkingLevel` ordering before dispatch. Must capture intended route, applied route, actual provider/model/thinking, dispatch timestamp/order, and observer source for one synthetic prompt. | none | `.specs/prompt-router-control-plane/evidence/same-turn-proof.md` or `same-turn-blocker.md` |
| Manual smoke | Local Pi session using only synthetic prompts from `.specs/prompt-router-control-plane/evidence/manual-validation-template.md` | local Pi session only | `.specs/prompt-router-control-plane/evidence/manual-validation.md` |
| Rollback | From original checkout: `git worktree remove ../.dotfiles-prompt-router-control-plane` then `git branch -D plan/prompt-router-control-plane` only after preserving any requested evidence; from worktree before commit: `git status --short` and `git restore -- <tracked files>` plus remove untracked files from rollback manifest | none | rollback manifest and summarized status |
| Archive preflight | `cd ../.dotfiles-prompt-router-control-plane && git status --short && find .specs/prompt-router-control-plane/evidence -maxdepth 2 -type f -print` plus raw-prompt/secret scan commands documented in F5 evidence | none | `.specs/prompt-router-control-plane/evidence/archive-preflight.md` in the worktree |
| Deploy | not applicable; local dotfiles/Pi extension change only | none | none |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave -1

- [x] W0: Create dedicated git worktree
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/worktree-preflight.md` (worktree created on branch `plan/prompt-router-control-plane`, exit 0)
- [x] WV0: Validate worktree isolation
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/worktree-preflight.md` (branch/path/status captured, exit 0)

### Wave 0

- [x] T0: Inventory existing router surfaces and prove same-turn routing feasibility
  - Status: completed-blocked
  - Evidence: `.specs/prompt-router-control-plane/evidence/preflight-inventory.md`, `.specs/prompt-router-control-plane/evidence/synthetic_simple.txt`, `.specs/prompt-router-control-plane/evidence/same-turn-blocker.md`, `.specs/prompt-router-control-plane/provider-architecture-spike.md`
- [ ] V0: Validate wave 0 blocking gate
  - Status: blocked
  - Evidence: same-turn proof failed; downstream tasks intentionally unstarted

### Wave 1

- [ ] T1: Add canonical route vocabulary and classifier adapter
  - Status: pending
  - Evidence: --
- [ ] T2: Add classifier mode settings validation and strict Python mode handling
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Add minimal Codex route profile resolver and provider trust denial tests
  - Status: pending
  - Evidence: --
- [ ] T4: Make status/explain/log output truthful, canonical, and schema-backed
  - Status: pending
  - Evidence: --
- [ ] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Wave 3

- [ ] T5: Add bounded context capsule and anti-downgrade policy
  - Status: pending
  - Evidence: --
- [ ] T6: Implement override hierarchy and context-window safety checks
  - Status: pending
  - Evidence: --
- [ ] V3: Validate wave 3
  - Status: pending
  - Evidence: --

### Wave 4

- [ ] T7: Unify eval runner with runtime settings and sequence fixtures
  - Status: pending
  - Evidence: --
- [ ] T8: Harden privacy-conscious telemetry, failure logging, and rollback/archive controls
  - Status: pending
  - Evidence: --
- [ ] V4: Validate wave 4
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation passed
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| W0 | Create dedicated git worktree | 0 repo-code files; git worktree state only | workflow/preflight | small | coding-light | -- |
| WV0 | Validate worktree isolation | -- | validation | small | qa-engineer | W0 |
| T0 | Inventory existing router surfaces and prove same-turn routing feasibility | 2-4: tests/harness/spec evidence | research/validation | medium | qa-engineer | WV0 |
| V0 | Validate wave 0 blocking gate | -- | validation | medium | qa-engineer | T0 |
| T1 | Add canonical route vocabulary and classifier adapter | 3-4: `pi/lib/prompt-router/*`, `pi/extensions/prompt-router.ts`, tests | feature | medium | typescript-pro | V0 |
| T2 | Add classifier mode settings validation and strict Python mode handling | 3-5: `config.ts`, `classifier.ts`, `classify.py`, tests | feature | medium | python-pro | V0 |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T1, T2 |
| T3 | Add minimal Codex route profile resolver and provider trust denial tests | 3-5: resolver/config/status test files | feature | medium | typescript-pro | V1 |
| T4 | Make status/explain/log output truthful, canonical, and schema-backed | 3-5: extension, telemetry/log helpers, tests | feature | medium | typescript-pro | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T3, T4 |
| T5 | Add bounded context capsule and anti-downgrade policy | 3-5: policy/state/tests/fixtures | feature | medium | typescript-pro | V2 |
| T6 | Implement override hierarchy and context-window safety checks | 3-5: policy/state/status/tests | feature | medium | typescript-pro | V2 |
| V3 | Validate wave 3 | -- | validation | medium | qa-engineer | T5, T6 |
| T7 | Unify eval runner with runtime settings and sequence fixtures | 4-6: eval scripts/data/docs/tests | architecture | large | python-pro | V3 |
| T8 | Harden privacy-conscious telemetry, failure logging, and rollback/archive controls | 3-5: telemetry/log parser/docs/tests | feature | medium | security-reviewer | V3 |
| V4 | Validate wave 4 | -- | validation | large | qa-engineer | T7, T8 |

## Execution Waves

All waves after W0 must run from `../.dotfiles-prompt-router-control-plane`, not the original checkout. Evidence paths are relative to the worktree unless explicitly stated otherwise.

### Wave -1 (worktree setup)

**W0: Create dedicated git worktree** [small] -- coding-light
- Description: Create an isolated worktree and branch for all implementation, validation, evidence, and final commit work. This step must not require the original checkout to be clean, but it must refuse to proceed if there is an unresolved merge/rebase state or if the branch/worktree already exists.
- Files: git worktree metadata only; no repo-code edits.
- Acceptance Criteria:
  1. [ ] Worktree and branch exist and are isolated.
     - Verify: `git rev-parse --show-toplevel && test ! -e ../.dotfiles-prompt-router-control-plane && ! git show-ref --verify --quiet refs/heads/plan/prompt-router-control-plane && test ! -d .git/rebase-merge && test ! -d .git/rebase-apply && test ! -f .git/MERGE_HEAD && git worktree add -b plan/prompt-router-control-plane ../.dotfiles-prompt-router-control-plane HEAD && cd ../.dotfiles-prompt-router-control-plane && git branch --show-current && git rev-parse --show-toplevel`
     - Pass: branch is `plan/prompt-router-control-plane`; repo root is `../.dotfiles-prompt-router-control-plane`; evidence file records command, exit code, base commit, and worktree path.
     - Fail: unresolved merge/rebase, existing branch/path, or worktree path differs; stop and ask user before choosing a new branch/path.

### Wave -1 -- Validation Gate

**WV0: Validate worktree isolation** [small] -- qa-engineer
- Blocked by: W0
- Checks:
  1. `cd ../.dotfiles-prompt-router-control-plane && git branch --show-current` returns `plan/prompt-router-control-plane`.
  2. `cd ../.dotfiles-prompt-router-control-plane && git status --short` is captured to `.specs/prompt-router-control-plane/evidence/worktree-preflight.md`.
  3. Confirm no implementation command in later evidence was run from the original checkout.
- On failure: remove the incomplete worktree if safe, keep evidence, and ask the user before retrying.

### Wave 0 (blocking feasibility)

**T0: Inventory existing router surfaces and prove same-turn routing feasibility** [medium] -- qa-engineer
- Description: Inventory existing router tests/eval/log helpers before adding new surfaces. Create `.specs/prompt-router-control-plane/evidence/synthetic_simple.txt` containing only a non-secret synthetic prompt for classifier/eval checks. Add or identify an instrumented harness that proves whether current routing changes affect the same generation turn. The harness must capture intended route, applied route, actual provider/model/thinking used by generation, and dispatch order for synthetic prompts. If no test seam exists, document the missing seam and create `.specs/prompt-router-control-plane/evidence/same-turn-blocker.md`.
- Files: `pi/tests/*`, `pi/extensions/prompt-router.ts`, `.specs/prompt-router-control-plane/evidence/*`.
- Acceptance Criteria:
  1. [ ] Existing surfaces and synthetic fixture are ready.
     - Verify: `find pi/tests pi/prompt-routing -maxdepth 3 \( -name '*router*' -o -name '*eval*' \) -print && test -s .specs/prompt-router-control-plane/evidence/synthetic_simple.txt`
     - Pass: evidence file lists existing tests, fixtures, eval scripts, and which will be reused/retired; `synthetic_simple.txt` exists and contains no secret/client-specific text; the same-turn harness seam is named as input-hook test harness, mocked generation dispatch observer, or documented unavailable API.
     - Fail: new duplicate test/eval surface is proposed without inventory or classifier commands reference a missing fixture.
  2. [ ] Same-turn feasibility is decided before behavior changes.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: `.specs/prompt-router-control-plane/evidence/same-turn-proof.md` shows intended route, applied route, actual generation provider/model/thinking, dispatch timestamp/order, and observer source; actual generation provider/model/thinking equals applied route before generation dispatch for the same synthetic prompt turn.
     - Fail: if proof cannot be produced, write `same-turn-blocker.md`, create `.specs/prompt-router-control-plane/provider-architecture-spike.md` with problem, evidence, proposed architecture, and next validation gate; stop this plan, leave all downstream tasks unchecked, and do not archive.

### Wave 0 -- Validation Gate

**V0: Validate wave 0 blocking gate** [medium] -- qa-engineer
- Blocked by: T0
- Checks:
  1. Confirm either `same-turn-proof.md` exists and contains intended/applied/actual provider-model-thinking fields, or `same-turn-blocker.md` exists and downstream tasks remain unstarted.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  3. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
- On failure: stop before Wave 1; do not treat blocked evidence as V1 success.

### Wave 1 (parallel after V0 only if same-turn proof passed)

**T1: Add canonical route vocabulary and classifier adapter** [medium] -- typescript-pro
- Blocked by: V0
- Description: Define one exported `RouterSize`, route ordering, legacy label adapter, candidate normalization, and invalid-label errors. Extension, classifier adapter, resolver, telemetry, eval, and tests must import this module rather than define local route unions.
- Files: `pi/lib/prompt-router/*`, `pi/extensions/prompt-router.ts`, `pi/tests/prompt-router.test.ts`.
- Acceptance Criteria:
  1. [ ] Legacy labels map only at the adapter boundary.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: named tests cover `Haiku→mini`, `Sonnet→core`, `Opus→large`, candidates, confidence, invalid labels, and grep confirms no primary user-facing legacy labels outside adapter tests/docs.
     - Fail: policy/status/log/eval consumes `Haiku/Sonnet/Opus` directly or defines a local route union.

**T2: Add classifier mode settings validation and strict Python mode handling** [medium] -- python-pro
- Blocked by: V0
- Description: Add `router.classifier.mode`, validate `t2 | lgbm | ensemble | confgate`, pass actual mode to Python, and implement the V1 invalid-mode contract: invalid persisted settings fail config load and disable automatic routing until corrected; invalid CLI/eval mode exits nonzero; valid-mode subprocess failures use canonical `null-fallback` metadata. Define timeout, nonzero exit, malformed JSON, unknown label, confidence-range, and subprocess-failure behavior without raw prompt text and without stale previous-route application.
- Files: `pi/lib/prompt-router/config.ts`, `pi/lib/prompt-router/classifier.ts`, `pi/prompt-routing/classify.py`, tests.
- Acceptance Criteria:
  1. [ ] Runtime and Python agree on mode and invalid modes fail closed.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --prompt-file .specs/prompt-router-control-plane/evidence/synthetic_simple.txt` and `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier invalid --prompt-file .specs/prompt-router-control-plane/evidence/synthetic_simple.txt; test $? -ne 0`
     - Pass: valid modes emit JSON with requested/normalized mode; invalid mode exits nonzero with explicit error and no ensemble fallback.
     - Fail: any path hardcodes `t2`, renders `confgate` incorrectly, or treats unknown modes as `ensemble`.
  2. [ ] Failure paths are safe and private.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: tests cover invalid persisted setting, invalid CLI/eval mode, timeout, nonzero exit, malformed JSON, unknown label, and confidence-range failures with no raw prompt/excerpt by default; status/explain/log/eval render the same fail-closed reason.
     - Fail: failure logs include raw prompts or apply stale state silently.
  3. [ ] Classifier artifact/hash sidecars are executable for every supported mode.
     - Verify: run the artifact inventory/hash-check command added by this task and save output to `.specs/prompt-router-control-plane/evidence/classifier-artifacts.md`.
     - Pass: `t2`, `lgbm`, `ensemble`, and `confgate` list required artifacts and `.sha256` sidecars; intended artifact load is proven; missing sidecar and hash mismatch fail closed without falling back to another classifier mode.
     - Fail: any supported mode has unknown artifact provenance, missing hash behavior, or silent fallback to another mode.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T1, T2
- Checks:
  1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
  3. Run the valid/invalid Python commands from T2 and save output to `.specs/prompt-router-control-plane/evidence/classifier-mode.md`.
  4. Save classifier artifact inventory and hash-sidecar results to `.specs/prompt-router-control-plane/evidence/classifier-artifacts.md`.
  5. Grep for duplicate route vocabulary and primary legacy-label use; allowed only in adapter/tests/migration notes.
- On failure: create a fix task and rerun V1.

### Wave 2 (parallel after V1)

**T3: Add minimal Codex route profile resolver and provider trust denial tests** [medium] -- typescript-pro
- Blocked by: V1
- Description: Implement only the concrete resolver fields needed by runtime/status/tests: route, domain, effort, profile, provider, model, routeState, fallbackFrom, reason, and sanitized provider family. Cross-provider fallback is denied by default; specialized Codex profiles remain optional/explicit, not automatic.
- Files: `pi/lib/prompt-router/*`, `pi/extensions/prompt-router.ts`, tests.
- Acceptance Criteria:
  1. [ ] Resolver covers required route states and trust boundaries.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: named tests cover `nano` disabled/unavailable by default, explicit configured `nano→mini` fallback if enabled, `mini`, `core`, `large`, `max`, coding/general defaults, policy-only `max`, denied cross-provider fallback, missing credentials, and sanitized provider output.
     - Fail: provider changes are implicit or account IDs/tokens/endpoints appear in status/explain/logs.

**T4: Make status/explain/log output truthful, canonical, and schema-backed** [medium] -- typescript-pro
- Blocked by: V1
- Description: Update `/router-status`, `/router-explain`, transcript routing events, and test fixtures to use explicit schemas: classifier_mode, raw_route, applied_route, confidence, top candidates, rule_fired, context flags if present, provider/model/thinking, route_state, fallback_reason, override scope, and one-line operator summary.
- Files: `pi/extensions/prompt-router.ts`, telemetry helpers, tests.
- Acceptance Criteria:
  1. [ ] Status/explain examples match PRD cases and schemas.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: named fixtures cover normal route, context-continuation-hold explain/status output, unavailable fallback, policy-only `max`, manual pin, classifier failure, and no raw prompt/excerpt by default.
     - Fail: output claims a different classifier mode, uses primary legacy vocabulary, omits applied-vs-raw route, or logs raw prompts.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T3, T4
- Checks:
  1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
  3. Save status/explain/log fixture output summary to `.specs/prompt-router-control-plane/evidence/status-explain-schema.md`.
- On failure: create a fix task and rerun V2.

### Wave 3 (parallel after V2)

**T5: Add bounded context capsule and anti-downgrade policy** [medium] -- typescript-pro
- Blocked by: V2
- Description: Implement deterministic `RoutingContextCapsule`, one-turn `context-continuation-hold`, route ordering, explicit cheap/fast/brief downgrade-intent bypass, and a setting that disables context capsule logging while preserving current-turn context visibility in `/router-explain`.
- Files: policy/state helpers, `pi/extensions/prompt-router.ts`, tests/fixtures.
- Acceptance Criteria:
  1. [ ] Continuation/override fixture matrix passes.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: matrix records prompt class, previous route, raw route, applied route, rule, downgrade intent, route pin state, provider boundary, status/explain/log evidence for `context-continuation-hold`, capsule-log-enabled and capsule-log-disabled cases, `do option 2`, `patch it`, `same`, `now implement`, cheap/brief negatives, and non-continuation lookalikes.
     - Fail: short continuation applies raw lower route silently or hold persists beyond one turn without explicit state.

**T6: Implement override hierarchy and context-window safety checks** [medium] -- typescript-pro
- Blocked by: V2
- Description: Enforce explicit model selection > route pin > per-turn override > hard safety/provider policy > automatic policy > fallback; prevent silent context-window/compression shrinkage.
- Files: policy/state/status/tests.
- Acceptance Criteria:
  1. [ ] Overrides are visible and respected until cleared.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
     - Pass: named tests cover explicit model, route pin, per-turn override, safety floor, provider fallback denial, context-window shrink prevention, clear command/lifetime, and status/explain visibility.
     - Fail: auto routing silently changes user-selected route/model or trust boundary.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- qa-engineer
- Blocked by: T5, T6
- Checks:
  1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
  3. Save fixture matrix summary to `.specs/prompt-router-control-plane/evidence/context-override-matrix.md`.
- On failure: create a fix task and rerun V3.

### Wave 4 (parallel after V3)

**T7: Unify eval runner with runtime settings and sequence fixtures** [large] -- python-pro
- Blocked by: V3
- Description: Unify or clearly retire duplicate eval paths so eval runs the same classifier mode and policy settings as runtime. Define metric formulas in code/docs: route order `nano < mini < core < large < max`, top-1 accuracy denominator, catastrophic under-routing threshold, over-routing, cost-weighted quality, route thrash, policy delta, turn-vs-sequence aggregation, baseline comparison, and gate thresholds. Add `context_sequences_v1.jsonl` fixtures. Include per-mode classifier artifact/hash-sidecar inventory in eval output for `t2 | lgbm | ensemble | confgate`, including intended artifact loaded and hash-mismatch fail-closed fixture. Add bounded runtime telemetry aggregate output or explicitly emit `deferred_aggregates` with rationale for any aggregate not implemented in V1.
- Files: `pi/prompt-routing/evaluate.py`, `pi/prompt-routing/scripts/shadow_eval.py`, `pi/prompt-routing/data/*`, docs/tests.
- Acceptance Criteria:
  1. [ ] Eval reports runtime-comparable metrics from real fixtures.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --data pi/prompt-routing/data/eval_v3.jsonl --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --classifier t2 --json > .specs/prompt-router-control-plane/evidence/eval-summary.json`
     - Pass: JSON contains classifier mode, policy fingerprint, canonical labels, metric formulas/values, invalid-mode behavior, sequence effects, per-mode artifact/hash status, hash-mismatch fail-closed result, bounded aggregate/stat output or explicit deferred aggregate rationale, and no legacy labels except compatibility fields.
     - Fail: eval uses stale policy defaults, help-only output, or legacy route ordering.

**T8: Harden privacy-conscious telemetry, failure logging, and rollback/archive controls** [medium] -- security-reviewer
- Blocked by: V3
- Description: Standardize JSONL schema, prompt hash normalization shared across TypeScript and Python, default excerpt absence, opt-in redacted excerpts, owner-only permission best effort with Windows/MSYS notes, rotation/size limits, corrupted-line tolerant readers, migration behavior, purge command, rollback manifest, and archive scans.
- Files: runtime log helpers, Python log/eval reader, docs/tests, `.specs/prompt-router-control-plane/evidence/*`.
- Acceptance Criteria:
  1. [ ] Telemetry is useful without leaking raw prompts by default.
     - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` plus the Python log-reader test/command added by this task.
     - Pass: success, parse failure, nonzero exit, timeout, invalid label, and exception paths include hash, raw/applied route, rule/fallback reason, resolver fields, confidence, latency; TypeScript and Python produce the same SHA-256 digest for the shared UTF-8 trim/join fixture; no raw prompt/excerpt unless redacted opt-in is enabled.
     - Fail: default logs contain full prompts/excerpts or omit policy/applied route fields.
  2. [ ] Rollback/archive safety is concrete.
     - Verify: inspect `.specs/prompt-router-control-plane/evidence/rollback-manifest.md` and `.specs/prompt-router-control-plane/evidence/archive-preflight.md`.
     - Pass: manifests list tracked/untracked/generated files, purge command, raw prompt/secret scan commands, and sanitized manual evidence template.
     - Fail: generated JSONL/manual evidence can be archived with raw prompts or rollback omits new files.

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [large] -- qa-engineer
- Blocked by: T7, T8
- Checks:
  1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
  3. Run the T7 eval command with one valid mode and one invalid mode.
  4. Run the T8 log-reader/privacy/hash-parity checks and inspect generated JSONL fixtures.
  5. Confirm context capsule logging disablement keeps `/router-explain` context visibility while omitting capsule fields from logs.
  6. Save summary to `.specs/prompt-router-control-plane/evidence/wave4-validation.md`.
- On failure: create a fix task and rerun V4.

## Dependency Graph

```text
Wave -1: W0 → WV0 (worktree setup; all later work runs in ../.dotfiles-prompt-router-control-plane)
Wave 0: T0 → V0 (blocking after WV0; if same-turn proof fails, stop plan)
Wave 1: T1, T2 (parallel after V0 proof) → V1
Wave 2: T3, T4 (parallel after V1) → V2
Wave 3: T5, T6 (parallel after V2) → V3
Wave 4: T7, T8 (parallel after V3) → V4
Final: V4 → F1 → F2 → F3 → F4 → F5
```

## Success Criteria

1. [ ] Same-turn routing is proven before behavior-changing work is accepted.
   - Verify: `.specs/prompt-router-control-plane/evidence/same-turn-proof.md` plus the T0 harness/test output.
   - Pass: actual generation provider/model/thinking equals applied route for the same synthetic prompt turn.
   - Fail: `same-turn-blocker.md` exists; downstream tasks remain unchecked; separate architecture spike plan is created.
2. [ ] Router status/explain/log/eval use canonical route vocabulary and actual classifier mode.
   - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
   - Pass: `nano/mini/core/large/max` are primary; legacy labels only appear in adapter tests/compat fields.
3. [ ] Context continuation and override safety work together.
   - Verify: `.specs/prompt-router-control-plane/evidence/context-override-matrix.md` and named Vitest fixtures.
   - Pass: no silent downgrade, stale route, context-window shrink, or provider/trust boundary change.
4. [ ] Unified eval and telemetry support ongoing route quality/cost analysis without leaking prompts.
   - Verify: T7 eval JSON and T8 JSONL/privacy checks.
   - Pass: metrics and privacy fields match schema; invalid modes fail closed consistently; per-mode artifact/hash sidecars are validated; TypeScript/Python prompt hashes match; context capsule logging can be disabled separately from explain; raw prompts/excerpts are absent by default.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes.
- All implementation validation must run through pnpm/Vitest, Python `uv run --project pi/prompt-routing` commands, evidence files, and `make check`.
- Credentials are not required for automated tests; manual Pi smoke validation uses the user's local Pi session with synthetic prompts only.
- Manual-only validation is justified because slash-command runtime UX may require an interactive Pi session, but it is a smoke check after automated proof, not a substitute for T0/T4/T5 fixtures.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update `## Execution Status` with failing command and next fix.

2. [ ] Run Pi TypeScript validation.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: exits 0.
   - Fail: fix, rerun affected checks, then rerun repo-wide validation.

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written and evidence files include command, exit code, timestamp, summary, and non-secret pass/fail signal.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation.

### Manual validation

- Required: yes.
- Evidence path: `.specs/prompt-router-control-plane/evidence/manual-validation.md`.
- Steps:
  1. Use only synthetic prompts from `.specs/prompt-router-control-plane/evidence/manual-validation-template.md`; do not use real secrets, client names, private paths, or production prompts.
  2. Start a local Pi session with the modified extension loaded.
  3. Route one normal prompt, one continuation prompt after a larger route, one cheap/brief override, one route/model pin case, and one unavailable/policy-only route case if supported.
  4. Run `/router-status` and `/router-explain` after those prompts.
  5. Record only sanitized fields: classifier mode, raw/applied route, rule/override reason, route state, provider family/model label, prompt hash, and pass/fail notes. Exclude raw prompt text, account IDs, tokens, endpoints, private file paths, and screenshots containing unredacted prompts.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no.
- Procedure: None; this is local dotfiles/Pi extension behavior. If the user later requests publishing or pushing, create a separate release/deployment plan.

If deployment is required later and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation, deployment validation, and repo-wide validation pass. Archive preflight must confirm no secrets/raw prompts were introduced into tracked files, evidence files, logs, or generated eval artifacts, and must include `git status --short`, rollback manifest, generated artifact inventory, and raw prompt/secret scan results.

## Handoff Notes

- Do not use `bun` for Pi TypeScript work; use pnpm exactly as documented.
- Wave 0 is a hard stop for behavior-changing implementation: if same-turn proof fails, do not proceed to canonical/resolver/context behavior work under this plan. Read-only inventory and provider-architecture spike writing are allowed; control-plane cleanup must move to the spike plan or a separate non-behavioral plan.
- Keep V1 incremental: same-turn proof first, then route/mode truthfulness, then minimal resolver/status, then context/override, then eval/telemetry.
- Do not expand provider trust or specialized profile logic beyond the concrete fields/tests listed here unless a failing fixture requires it.
- Existing `.specs/prompt-router-roadmap/PRD.md` remains the source PRD; this plan is the executable implementation plan.

## Execution Status

- Completion classification: blocked-by-failure.
- Status: blocked at Wave 0 same-turn feasibility gate; plan is not archived.
- Last updated: 2026-05-07 by `/do-it`.
- Last completed wave/gate: T0 inventory and same-turn blocker evidence.
- Next wave/gate to run: none under this plan until the provider-architecture spike is reviewed/planned; V0 and all downstream behavior-changing tasks remain unchecked.
- Implemented: created isolated worktree `../.dotfiles-prompt-router-control-plane` on branch `plan/prompt-router-control-plane`; added T0 input-hook harness in `pi/tests/prompt-router.test.ts`; created synthetic fixture and evidence under `.specs/prompt-router-control-plane/evidence/`; created `.specs/prompt-router-control-plane/provider-architecture-spike.md`.
- Why not archived: required same-turn proof failed. Observed harness order was `classifier-start -> hook-returned-continue -> classifier-finish -> setModel -> setThinkingLevel`, so routing is applied after the input hook continues and cannot prove same-turn generation dispatch under the current architecture.
- Commands run:
  - `git worktree add -b plan/prompt-router-control-plane ../.dotfiles-prompt-router-control-plane HEAD` — exit 0.
  - `cd ../.dotfiles-prompt-router-control-plane && find pi/tests pi/prompt-routing -maxdepth 3 \( -name '*router*' -o -name '*eval*' \) -print` — exit 0, captured in `preflight-inventory.md`.
  - `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` — exit 1 because `pi/extensions/node_modules` was missing.
  - `cd pi/extensions && pnpm install --frozen-lockfile && cd ../tests && pnpm run test -- prompt-router.test.ts` — exit 1 overall because Vitest ran the broader suite and exposed unrelated `tests/workflow-dispatch.test.ts` `/summarize` expectation drift; `tests/prompt-router.test.ts` itself passed with 57 tests including the T0 blocker harness.
- Commands/checks still needed:
  - Review or convert `.specs/prompt-router-control-plane/provider-architecture-spike.md` into a new executable plan.
  - After a before-generation/provider-dispatch seam exists, rerun same-turn proof and then create a new/updated control-plane implementation plan.
- Remaining user/manual steps: decide whether to proceed with the provider-architecture spike. No manual Pi smoke validation was run because implementation stopped before behavior changes.
- Rerun guidance: do not rerun `/do-it .specs/prompt-router-control-plane/plan.md` expecting completion until the same-turn architecture blocker is resolved or the plan is revised.
- Review applied: `.specs/prompt-router-control-plane/review-1/synthesis.md`.
- PRD comparison update: addressed `.specs/prompt-router-control-plane/review-1/prd-plan-comparison.md` recommendations for artifact/hash validation, hash parity, capsule-log disablement, continuation explain fixture, `nano` default, invalid-mode semantics, aggregate handling, and T0 harness evidence.
