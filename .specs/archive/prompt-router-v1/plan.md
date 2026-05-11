---
created: 2026-05-11
status: completed
completed: 2026-05-11
---

# Plan: Prompt Router V1 Completion

## Context & Motivation

`.specs/prompt-router-roadmap/PRD.md` defines a V1 prompt-router cleanup: canonical route vocabulary, truthful classifier mode/status/explain output, same-turn routing proof, bounded context-aware anti-downgrade, Codex-first route/profile resolution, unified eval, and privacy-conscious telemetry.

Current code already implements several foundations:

- `pi/lib/prompt-router/route-vocabulary.ts` defines canonical `nano | mini | core | large | max` and maps legacy `Haiku | Sonnet | Opus` to canonical routes.
- `pi/lib/prompt-router/config.ts` loads and validates `router.classifier.mode` with supported modes `t2 | lgbm | ensemble | confgate`; default is `t2` because `pi/settings.json` currently has no `router.classifier.mode`.
- `pi/extensions/prompt-router.ts` has a `before_provider_request` same-turn provider seam, `RouteDecision` records, route pins/session overrides, nano-to-mini fallback, cross-provider denial, and context-window safety floor.
- `pi/prompt-routing/classify.py` uses strict argparse `choices` for classifier modes and has artifact inventory/hash checks.
- `pi/prompt-routing/evaluate.py` supports classifier modes, runtime config input, artifact inventory, sequence metrics, and privacy summary.
- Focused tests pass today: `cd pi/tests && pnpm test prompt-router.test.ts` reported 69/69 passing.

Remaining gaps against the PRD are mostly V1 acceptance gaps: status/explain still expose legacy tier details, the context capsule is not the PRD shape and anti-downgrade is over-broad rather than continuation-gated, route profile state/domain/provider trust are incomplete, eval does not replay runtime policy deeply enough, telemetry lacks the full privacy/rotation/purge contract, and docs/evidence are not yet consolidated.

## Constraints

- Platform: Windows Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`) in `C:/Users/mglenn/.dotfiles`.
- Shell: Bash via Pi; use forward-slash paths.
- Pi TypeScript work is pnpm-only:
  - `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  - `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
  - Do not use Bun/npm for Pi-related TypeScript packages/tests.
- Do not add helper `.ts` files at top level of `pi/extensions/`; top-level files are auto-discovered extensions. Put helpers under `pi/lib/` or non-auto-discovered subdirectories.
- Do not persist raw prompts, credentials, API keys, tokens, private keys, or `.env` content in tests, evidence, logs, or fixtures.
- Keep classifier schema `3.0.0` unless a separate migration is explicitly planned; TypeScript owns legacy-to-canonical adaptation at a named boundary.
- Do not retrain classifier models in this plan.
- Cross-provider fallback must remain explicit; no silent provider-family change.
- Preserve existing working same-turn provider seam unless validation proves it cannot satisfy V1.
- Validation must target the behavior under change, not just smoke tests.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Finish V1 incrementally in current extension architecture | Reuses tested `before_provider_request`, existing tests, and classifier/eval code; lowest risk | Leaves a future logical provider/router-provider architecture for later | **Selected** for V1 because same-turn proof already exists and PRD prioritizes control-plane truthfulness first |
| Replace router with a logical `router/*` provider now | Cleaner architecture for route/profile resolution and same-turn guarantees | Larger migration; higher risk; blocks V1 on provider redesign | Rejected for V1; keep as follow-on spike only if same-turn validation regresses |
| Feed full chat history to classifier for context routing | More semantic context | Higher privacy/latency risk; harder eval; violates PRD non-goal | Rejected; implement deterministic context capsule and one-turn policy rule |
| Keep legacy `low/mid/high` and `Haiku/Sonnet/Opus` in user-facing UX | Less churn | Fails PRD acceptance criteria and operator vocabulary goals | Rejected; legacy labels may appear only in explicit raw/legacy diagnostic fields |
| Implement learned/log-derived routing from telemetry | Long-term route quality improvement | Requires labeled outcomes and telemetry maturity; out of V1 scope | Rejected for V1; unified eval and privacy-safe logs are prerequisites |
| Over-broad anti-downgrade on any lower raw route | Simple and already partially implemented | Over-routes non-continuation simple prompts; misses cheap/brief bypass requirement | Rejected as final behavior; replace/rename with continuation-gated hold |

## Objective

Complete the PRD V1 acceptance criteria for the prompt router without retraining models or replacing the architecture. The finished system must:

1. Use canonical route vocabulary in status/explain/log/eval output.
2. Use settings-driven classifier mode consistently across runtime, status, explain, logs, and eval.
3. Resolve canonical routes through a Codex-first provider/profile contract with visible route state and provider trust/fallback information.
4. Apply a deterministic, bounded `context-continuation-hold` only for continuation prompts, with explicit cheap/fast/brief downgrade intent bypass.
5. Respect explicit route/model overrides and provider trust boundaries.
6. Emit privacy-conscious telemetry with prompt hashes and no raw prompt excerpts by default.
7. Provide a unified eval path that reports runtime-comparable metrics, context-sequence effects, and mode matrix behavior.
8. Preserve and prove same-turn generation routing.

## Project Context

- **Language**: TypeScript extensions/tests plus Python classifier/eval code.
- **Detected markers**: `.gitattributes`, `Makefile`, `pyproject.toml`; Pi-specific `package.json` files under `pi/extensions` and `pi/tests`.
- **Test command**: focused `cd pi/tests && pnpm test prompt-router.test.ts`; full Pi tests `cd pi/tests && pnpm run test`.
- **Lint/typecheck command**: `cd pi/extensions && pnpm run typecheck`; repo gate `make check`.
- **Primary files**:
  - `pi/extensions/prompt-router.ts`
  - `pi/lib/prompt-router/*.ts`
  - `pi/prompt-routing/classify.py`
  - `pi/prompt-routing/evaluate.py`
  - `pi/prompt-routing/scripts/shadow_eval.py`
  - `pi/prompt-routing/data/*.jsonl`
  - `pi/prompt-routing/tests/**`
  - `pi/tests/prompt-router.test.ts`
  - `pi/settings.json`
  - prompt-router docs/evidence created under this spec directory

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `mkdir -p .specs/prompt-router-v1/evidence && git status --short && git ls-files 'pi/extensions/prompt-router.ts' 'pi/lib/prompt-router/*' 'pi/prompt-routing/*' 'pi/prompt-routing/scripts/*' 'pi/tests/*prompt-router*' 'pi/settings.json'` | none | `.specs/prompt-router-v1/evidence/P0-preflight.md` |
| Focused tests | `cd pi/tests && pnpm install --frozen-lockfile && pnpm test prompt-router.test.ts` | none | per-wave evidence files |
| Python router tests/eval | `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests` and `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --json` | none | `.specs/prompt-router-v1/evidence/V*-*.md` plus generated eval JSON |
| Typecheck | `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` | none | `.specs/prompt-router-v1/evidence/F2-repo-validation.md` |
| Full Pi tests | `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` | none | `.specs/prompt-router-v1/evidence/F2-repo-validation.md` |
| Repo validation | `make check` | none | `.specs/prompt-router-v1/evidence/F2-repo-validation.md` |
| Manual validation | Run `/router-status` and `/router-explain` in a Pi session after representative prompts/pins if automated command harness cannot inspect live command output | none; local Pi session only | `.specs/prompt-router-v1/evidence/F3-manual-validation.md` |
| Deploy | not applicable; local dotfiles/Pi extension changes only | none | `.specs/prompt-router-v1/evidence/F4-deployment-validation.md` records not required |
| Rollback | `git diff -- pi/extensions/prompt-router.ts pi/lib/prompt-router pi/prompt-routing pi/tests/prompt-router.test.ts` then revert targeted files with normal git checkout only after user approval if needed | none | rollback note in relevant evidence |
| Archive | secret scan evidence, copy plan/evidence to archive destination, verify copy, and leave active plan in place unless user explicitly approves removal | none | `.specs/prompt-router-v1/evidence/F5-archive-preflight.md` |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [x] P0: Capture prompt-router preflight inventory
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/P0-preflight.md`
- [x] V0: Validate preflight scope
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V0-preflight-scope.md`

### Wave 1

- [x] T1: Canonicalize router status/explain/log route vocabulary
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V1-control-plane.md`
- [x] T2: Harden classifier mode and wire-contract truthfulness
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V1-control-plane.md`
- [x] T3: Add Codex route profile resolver and route-state contract
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V1-control-plane.md`
- [x] V1: Validate control-plane truthfulness
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V1-control-plane.md`

### Wave 2

- [x] T4: Implement deterministic continuation capsule and bounded hold
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V2-runtime-policy.md`
- [x] T5: Complete override hierarchy and provider trust reporting
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V2-runtime-policy.md`
- [x] V2: Validate runtime policy behavior
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V2-runtime-policy.md`

### Wave 3

- [x] T6: Complete privacy-conscious telemetry contract
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V3-telemetry-eval.md`
- [x] T7: Unify runtime-comparable eval and sequence fixtures
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/T7-eval.md`
- [x] V3: Validate telemetry and eval
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V3-telemetry-eval.md`

### Wave 4

- [x] T8: Update docs, examples, and operator handoff
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/T8-docs.md`
- [x] V4: Validate docs and end-to-end acceptance mapping
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/V4-docs-acceptance.md`

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/F1-task-specific-verification.md`
- [x] F2: Repo-wide validation complete
  - Status: complete
  - Evidence: `.specs/prompt-router-v1/evidence/F2-repo-validation.md`
- [x] F3: Manual validation complete or not required
  - Status: not required; recorded and accepted
  - Evidence: `.specs/prompt-router-v1/evidence/F3-manual-validation.md`
- [x] F4: Deployment validation complete or not required
  - Status: not required; recorded and accepted
  - Evidence: `.specs/prompt-router-v1/evidence/F4-deployment-validation.md`
- [x] F5: Archive preflight complete
  - Status: complete
  - Evidence: `.specs/archive/prompt-router-v1/evidence/F5-archive-preflight.md`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| P0 | Capture prompt-router preflight inventory | 0 | research | small | planning-lead | -- |
| V0 | Validate preflight scope | 1 evidence file | validation | small | validation-lead | P0 |
| T1 | Canonicalize router status/explain/log route vocabulary | 2-4 | feature | medium | typescript | V0 |
| T2 | Harden classifier mode and wire-contract truthfulness | 3-5 | feature | medium | typescript | T1 |
| T3 | Add Codex route profile resolver and route-state contract | 4-6 | feature | medium | typescript | T2 |
| V1 | Validate control-plane truthfulness | tests/evidence | validation | medium | validation-lead | T3 |
| T4 | Implement deterministic continuation capsule and bounded hold | 3-5 | feature | medium | typescript | V1 |
| T5 | Complete override hierarchy and provider trust reporting | 3-5 | feature | medium | typescript | V1 |
| V2 | Validate runtime policy behavior | tests/evidence | validation | medium | validation-lead | T4, T5 |
| T6 | Complete privacy-conscious telemetry contract | 3-5 | feature | medium | typescript | V2 |
| T7 | Unify runtime-comparable eval and sequence fixtures | 4-7 | architecture | large | python | V2 |
| V3 | Validate telemetry and eval | tests/evidence | validation | large | validation-lead | T6, T7 |
| T8 | Update docs, examples, and operator handoff | 2-4 | mechanical | small | docs | V3 |
| V4 | Validate docs and end-to-end acceptance mapping | evidence | validation | medium | validation-lead | T8 |
| F1 | Task-specific verification complete | evidence | validation | medium | validation-lead | V4 |
| F2 | Repo-wide validation complete | evidence | validation | medium | validation-lead | F1 |
| F3 | Manual validation complete or not required | evidence | validation | small | validation-lead | F2 |
| F4 | Deployment validation complete or not required | evidence | validation | small | validation-lead | F3 |
| F5 | Archive preflight complete | evidence/archive | validation | small | validation-lead | F4 |

## Execution Waves

### Wave 0

**P0: Capture prompt-router preflight inventory** [small] -- planning-lead
- Description: Record current status before edits, including dirty worktree state, router files, active settings, current tests, and existing PRD acceptance gaps. Do not edit code.
- Files: `.specs/prompt-router-v1/evidence/P0-preflight.md`
- Acceptance Criteria:
  1. [ ] Preflight evidence captures current implementation and unrelated worktree changes.
     - Verify: `mkdir -p .specs/prompt-router-v1/evidence && { git status --short; git ls-files 'pi/extensions/prompt-router.ts' 'pi/lib/prompt-router/*' 'pi/prompt-routing/*' 'pi/prompt-routing/scripts/*' 'pi/tests/*prompt-router*' 'pi/settings.json'; grep -RIn "router-status\|router-explain\|classifierMode\|context-continuation\|anti_downgrade\|RouteDecision" pi/extensions/prompt-router.ts pi/lib/prompt-router pi/prompt-routing pi/tests/prompt-router.test.ts 2>/dev/null | head -300; } > .specs/prompt-router-v1/evidence/P0-preflight.md`
     - Pass: evidence file exists and lists git status, relevant files, and current router symbols.
     - Fail: missing evidence, command errors not explained, or untracked/dirty unrelated changes not recorded.

### Wave 0 -- Validation Gate

**V0: Validate preflight scope** [small] -- validation-lead
- Blocked by: P0
- Checks:
  1. Confirm `.specs/prompt-router-v1/evidence/P0-preflight.md` exists and contains no raw secret-like values.
  2. Confirm plan scope still matches `.specs/prompt-router-roadmap/PRD.md` and not `.specs/pi-control-plane-consolidation/plan.md`.
- On failure: repair P0 evidence before implementation.

### Wave 1 (serialized: shared router files)

**T1: Canonicalize router status/explain/log route vocabulary** [medium] -- typescript
- Description: Ensure `/router-status`, `/router-explain`, status labels, and runtime routing events use `nano/mini/core/large/max` as primary route vocabulary. Legacy labels may appear only under explicit `legacy_*` or raw classifier diagnostic fields.
- Files: `pi/extensions/prompt-router.ts`, `pi/lib/prompt-router/route-vocabulary.ts`, `pi/tests/prompt-router.test.ts`, optional docs/evidence.
- Acceptance Criteria:
  1. [ ] Registered `/router-status` and `/router-explain` command handlers use canonical route names and actual classifier mode.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: tests assert no primary user-facing `small/medium/large`, `low/mid/high`, or `Haiku/Sonnet/Opus` route labels in status/explain except explicit legacy/raw sections.
     - Fail: assertions show legacy labels in primary output.
  2. [ ] Runtime telemetry route fields are canonical.
     - Verify: `grep -RIn "applied_route\|raw_route\|selected_model_size" pi/extensions/prompt-router.ts pi/tests/prompt-router.test.ts`
     - Pass: tests cover `raw_route` and `applied_route` as canonical route sizes.
     - Fail: route fields only log runtime model size or legacy tier.

**T2: Harden classifier mode and wire-contract truthfulness** [medium] -- typescript
- Blocked by: T1
- Description: Make the classifier mode and schema contract single-sourced across runtime, explain/status, failure logs, eval, and artifact validation. Invalid modes must fail closed with explicit reason; no silent fallback to `ensemble` or stale hardcoded labels.
- Files: `pi/lib/prompt-router/config.ts`, `pi/lib/prompt-router/classifier.ts`, `pi/prompt-routing/classify.py`, `pi/prompt-routing/tests/**`, `pi/tests/prompt-router.test.ts`, `pi/settings.json` if adding explicit default is desired.
- Acceptance Criteria:
  1. [ ] Runtime invocation uses `router.classifier.mode` or documented `t2` default.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: tests cover `t2`, `confgate`, and invalid settings error/fallback behavior.
     - Fail: TS invocation hardcodes a mode while status/explain claims another.
  2. [ ] Python CLI rejects invalid modes explicitly.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier invalid "hello"; test $? -ne 0`
     - Pass: command exits nonzero with argparse invalid-choice text.
     - Fail: command succeeds or silently uses another classifier.
  3. [ ] Artifact inventory/hash failure behavior is covered. Runtime default `t2` artifacts must exist and pass inventory in V1; non-default modes may report explicit missing-artifact reasons only in the mode matrix, not for default runtime validation.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --artifact-inventory "warmup"`
     - Pass: JSON includes selected classifier and required `t2` artifacts.
     - Fail: inventory omits mode/artifacts, masks hash errors, or default `t2` artifacts are unavailable.

**T3: Add Codex route profile resolver and route-state contract** [medium] -- typescript
- Blocked by: T2
- Description: Implement a named resolver contract equivalent to PRD `RouteProfileResolution`, separating canonical route, domain, effort, profile, provider, model, route state, fallback source, provider family/trust, and reason. Keep domain detection conservative; default `coding/general` may initially be derived from existing context or `default` if tests document the limitation.
- Files: `pi/lib/prompt-router/route-decision.ts`, new `pi/lib/prompt-router/route-profile.ts` or similar, `pi/extensions/prompt-router.ts`, `pi/tests/prompt-router.test.ts`.
- Acceptance Criteria:
  1. [ ] Resolver covers `mini`, `core`, `large`, `max`, and unavailable `nano`, with an exported `RouteState = "available" | "fallback" | "policy-only" | "disabled"` union and no free-form route-state strings.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: tests assert route state values `available`, `fallback`, `policy-only`, or `disabled` for all canonical sizes.
     - Fail: `max`/`nano` are indistinguishable from `large`/`mini` without route-state reason.
  2. [ ] Codex-first default mapping is explicit and provider-neutral internally. The task must define the route-profile source of truth: settings keys, default profile table for every canonical route, availability assumptions, and expected fallback state per route.
     - Verify: `grep -RIn "gpt-5.4-mini\|gpt-5.5\|routeState\|RouteProfileResolution" pi/lib/prompt-router pi/extensions/prompt-router.ts pi/tests/prompt-router.test.ts`
     - Pass: provider/model IDs live in profile resolution, not classifier schema.
     - Fail: classifier schema or canonical route vocabulary embeds provider-specific models.
  3. [ ] Cross-provider fallback remains denied unless explicitly configured.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: existing and new provider-boundary tests pass.
     - Fail: route selection silently changes provider family.

### Wave 1 -- Validation Gate

**V1: Validate control-plane truthfulness** [medium] -- validation-lead
- Blocked by: T3
- Checks:
  1. Run `cd pi/tests && pnpm install --frozen-lockfile && pnpm test prompt-router.test.ts`, including registered command-surface tests for `/router-status` and `/router-explain`.
  2. Run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
  3. Run `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --artifact-inventory "warmup"`.
  4. Write `.specs/prompt-router-v1/evidence/V1-control-plane.md` with commands, exit codes, files changed, and any deferred limitations.
- On failure: add a targeted fix task or repair T1/T2/T3 before Wave 2.

### Wave 2 (parallel)

**T4: Implement deterministic continuation capsule and bounded hold** [medium] -- typescript
- Description: Replace the over-broad previous-route anti-downgrade with a deterministic PRD-shaped capsule and `context-continuation-hold` policy. Hold only when a prompt is a continuation and raw route is below previous effective route, bounded to one turn unless explicitly documented. Add cheap/fast/brief override detection and log `downgrade_intent_detected` when it bypasses hold.
- Files: `pi/extensions/prompt-router.ts`, optional `pi/lib/prompt-router/context-capsule.ts`, `pi/tests/prompt-router.test.ts`.
- Acceptance Criteria:
  1. [ ] Capsule includes `isContinuation`, `dependencyOnPriorContext`, `lastEffectiveSize`, and `unresolvedTask` without raw prompt text.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: tests cover continuation phrases (`do option 2`, `patch it`, `same but with auth`) and non-continuation lookalikes.
     - Fail: capsule only contains context-window or message-count flags.
  2. [ ] `context-continuation-hold` fires only for continuation downgrades and is consumed/bounded to one turn.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: complex previous route + `do option 2` holds once; a following lower-route prompt without continuation dependency can downgrade unless override/pin/safety floor applies; unrelated `hi` can downgrade.
     - Fail: all downgrades are held, hold persists indefinitely, or continuation downgrades silently apply raw mini route.
  3. [ ] Cheap/fast/brief intent bypasses hold and is logged.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: prompt such as `briefly do option 2` records `downgrade_intent_detected` and applies lower route when safe.
     - Fail: bypass missing or unlogged.

**T5: Complete override hierarchy and provider trust reporting** [medium] -- typescript
- Description: Encode and test override hierarchy: explicit model selection > route pin > temporary per-turn override > hard safety/provider policy > automatic policy > fallback. Expose override scope/lifetime and provider trust/fallback state in status/explain/logs.
- Files: `pi/extensions/prompt-router.ts`, `pi/lib/prompt-router/route-decision.ts`, route-profile helper, `pi/tests/prompt-router.test.ts`.
- Acceptance Criteria:
  1. [ ] Explicit route/model overrides remain visible and are not silently downgraded. Define the TypeScript contract for explicit model selection, including payload/context fields, preservation behavior in `before_provider_request`, and decision-trace metadata.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: route pin and explicit model selection fixtures show scope/lifetime in decision trace and explain/status output, and same-turn provider payload preserves an explicit user-selected model instead of overwriting it.
     - Fail: simple prompt overrides explicit user selection without visible reason.
  2. [ ] Provider trust/fallback metadata is reported.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: decision trace includes provider family/trust class/fallback allowed or denied reason without raw prompt.
     - Fail: provider changes or denials are not visible in trace/status/explain.

### Wave 2 -- Validation Gate

**V2: Validate runtime policy behavior** [medium] -- validation-lead
- Blocked by: T4, T5
- Checks:
  1. Run focused prompt-router tests.
  2. Inspect/record tests covering continuation hold, cheap/brief bypass, override hierarchy, and provider trust.
  3. Write `.specs/prompt-router-v1/evidence/V2-runtime-policy.md`.
- On failure: repair T4/T5 before telemetry/eval work.

### Wave 3 (parallel)

**T6: Complete privacy-conscious telemetry contract** [medium] -- typescript
- Description: Align runtime routing JSONL/transcript events with PRD telemetry fields: schema version, prompt hash, classifier mode, raw/applied routes, candidate margin/candidates, previous route, rule fired, context capsule, provider/model/profile, latency, fallback reason. Excerpts remain omitted by default or redacted only on explicit opt-in. Add purge/rotation or explicitly document bounded local behavior if existing transcript infrastructure owns rotation.
- Files: `pi/extensions/prompt-router.ts`, `pi/lib/transcript.ts` if needed, `pi/tests/prompt-router.test.ts`, docs/evidence.
- Acceptance Criteria:
  1. [ ] Default telemetry contains no raw prompt or unredacted excerpt. V1 default is no excerpts; any opt-in excerpt setting must be named, default false, locally documented, and tested.
     - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
     - Pass: tests serialize routing event with synthetic private prompt and assert raw text absent, hash present.
     - Fail: raw prompt appears in default event/log payload.
  2. [ ] Telemetry fields are useful and schema-versioned across both same-turn `before_provider_request` telemetry and background `emitRoutingDecision` paths.
     - Verify: `grep -RIn "schema_version\|router-log-v1\|prompt_hash\|rule_fired\|context_capsule" pi/extensions pi/lib pi/tests/prompt-router.test.ts`
     - Pass: parsed runtime events include schema version and PRD-critical fields, including prompt hash, classifier mode, raw/applied canonical route, rule, context capsule, provider/profile/model, and no raw prompt.
     - Fail: logs omit applied policy route, rule, or resolved model.
  3. [ ] Purge/rotation/privacy behavior is documented or implemented.
     - Verify: `grep -RIn "router.*purge\|rotation\|schema_version\|prompt_excerpt" pi docs .specs/prompt-router-v1 pi/extensions pi/lib 2>/dev/null`
     - Pass: operator can identify how to purge local router logs and whether rotation is inherited or implemented.
     - Fail: privacy incident has no documented recovery path.

**T7: Unify runtime-comparable eval and sequence fixtures** [large] -- python
- Description: Make `evaluate.py` the single supported eval path or clearly retire `scripts/shadow_eval.py`. Eval must load the same classifier mode/policy/profile assumptions as runtime, report PRD metrics, and include named multi-turn continuation fixtures for previous effective routes `mini/core/large/max`, cheap/brief negatives, and non-continuation lookalikes.
- Files: `pi/prompt-routing/evaluate.py`, `pi/prompt-routing/scripts/shadow_eval.py`, `pi/prompt-routing/data/eval_v3.jsonl`, new `pi/prompt-routing/data/context_sequences_v1.jsonl`, `pi/prompt-routing/tests/**`, docs/evidence.
- Acceptance Criteria:
  1. [ ] One eval path reports mode, policy, route ordering, top-1, catastrophic under-routing, over-routing, cost-weighted quality, route thrash, policy deltas, and sequence results.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json`
     - Pass: JSON includes all listed metrics and exits according to documented gates.
     - Fail: metrics missing or eval uses stale hardcoded policy defaults.
  2. [ ] Mode matrix behavior is explicit for `t2 | lgbm | ensemble | confgate`. Default runtime mode must run successfully; non-default modes may fail only with explicit expected artifact/unsupported reasons captured in evidence.
     - Verify: `mkdir -p .specs/prompt-router-v1/evidence; for m in t2 lgbm ensemble confgate; do set +e; uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --classifier "$m" --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json > ".specs/prompt-router-v1/evidence/V3-eval-$m.json" 2> ".specs/prompt-router-v1/evidence/V3-eval-$m.log"; code=$?; set -e; echo "$m exit=$code" >> .specs/prompt-router-v1/evidence/V3-eval-matrix-status.txt; if [ "$m" = t2 ] && [ "$code" -ne 0 ]; then exit "$code"; fi; done`
     - Pass: `t2` succeeds with required metrics; non-default failures are documented with explicit artifact/unsupported reasons and do not masquerade as successful metrics.
     - Fail: default `t2` eval fails, unsupported mode silently falls back, reports wrong mode, or artifacts are written outside `.specs/prompt-router-v1/evidence/` without explanation.
  3. [ ] Shadow eval path is unified or visibly retired. V1 may replace `shadow_eval.py` with a non-success stub pointing to `evaluate.py`, or document it as archived/non-canonical with a test proving it cannot silently produce divergent metrics.
     - Verify: `grep -RIn "shadow_eval" pi/prompt-routing .specs/prompt-router-v1 2>/dev/null`
     - Pass: references point to the canonical eval path or documented retirement.
     - Fail: two active eval paths disagree without guidance.

### Wave 3 -- Validation Gate

**V3: Validate telemetry and eval** [large] -- validation-lead
- Blocked by: T6, T7
- Checks:
  1. Run focused prompt-router tests.
  2. Run Python prompt-routing tests: `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests`.
  3. Run canonical eval with config and sequence fixtures.
  4. Write `.specs/prompt-router-v1/evidence/V3-telemetry-eval.md`.
- On failure: repair T6/T7 before docs/handoff.

### Wave 4

**T8: Update docs, examples, and operator handoff** [small] -- docs
- Blocked by: V3
- Description: Add/refresh documentation and examples for `/router-status`, `/router-explain`, classifier mode setting, route/profile states, context-continuation behavior, override hierarchy, provider trust, telemetry privacy/purge, and eval command. Include explicit examples required by PRD: normal classifier route, continuation hold, unavailable fallback, policy-only max, and manual pin.
- Files: `.specs/prompt-router-v1/evidence/T8-docs.md`, relevant `pi/README.md` or prompt-router docs if present, possibly `.specs/prompt-router-roadmap/PRD.md` notes if updating status.
- Acceptance Criteria:
  1. [ ] Operator examples cover PRD-required scenarios.
     - Verify: `grep -RIn "context-continuation-hold\|policy-only\|manual pin\|router.classifier.mode\|router purge\|provider trust" pi .specs/prompt-router-v1 .specs/prompt-router-roadmap 2>/dev/null`
     - Pass: docs/examples include all terms with actionable commands or explanations.
     - Fail: users cannot tell how to inspect or override router decisions.
  2. [ ] PRD acceptance mapping is documented.
     - Verify: `test -f .specs/prompt-router-v1/evidence/T8-docs.md && grep -n "AC1\|AC2\|AC3\|AC4\|AC5\|AC6\|AC7\|AC8" .specs/prompt-router-v1/evidence/T8-docs.md`
     - Pass: evidence maps each PRD acceptance criterion to implementation/tests or explicit deferral.
     - Fail: acceptance status remains implicit.

### Wave 4 -- Validation Gate

**V4: Validate docs and end-to-end acceptance mapping** [medium] -- validation-lead
- Blocked by: T8
- Checks:
  1. Verify T8 docs/evidence exists and maps AC1-AC8.
  2. Run `cd pi/tests && pnpm test prompt-router.test.ts` one more time after docs/test updates.
  3. Write `.specs/prompt-router-v1/evidence/V4-docs-acceptance.md`.
- On failure: repair T8.

## Dependency Graph

```
Wave 0: P0 → V0
Wave 1: T1 → T2 → T3 (serialized after V0 because they share router files) → V1
Wave 2: T4, T5 (parallel after V1) → V2
Wave 3: T6, T7 (parallel after V2) → V3
Wave 4: T8 (after V3) → V4
Final: V4 → F1 → F2 → F3 → F4 → F5
```

## Success Criteria

1. [ ] Router status/explain use canonical vocabulary and truthful classifier mode.
   - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
   - Pass: registered command-handler tests assert primary status/explain lines include canonical `mini/core/large/max`, actual classifier mode, route state, provider/model, and no legacy route names except explicit raw/legacy diagnostics.

2. [ ] Classifier mode is settings-driven and fail-closed.
   - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier invalid "hello"; test $? -ne 0` and focused TS tests.
   - Pass: invalid modes error explicitly; runtime/status/explain/log/eval agree on mode.

3. [ ] Context continuation anti-downgrade works only when appropriate.
   - Verify: `cd pi/tests && pnpm test prompt-router.test.ts`
   - Pass: previous `large` + `do option 2` applies `large` with `context-continuation-hold`; unrelated simple prompt can downgrade; cheap/brief override bypass is logged.

4. [ ] Explicit user overrides and provider trust are visible and respected.
   - Verify: focused tests for route pin, explicit model selection, safety floor, and cross-provider fallback.
   - Pass: decision trace/status/explain show override scope, provider trust/fallback reason, and no silent provider-family change.

5. [ ] Unified eval reports runtime-comparable metrics and sequence effects.
   - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json`
   - Pass: JSON includes classifier mode, policy/profile assumptions, catastrophic under-routing, over-routing, cost, thrash, policy deltas, and sequence results.

6. [ ] Same-turn routing remains proven.
   - Verify: focused tests covering `before_provider_request` ordering and immutable `route_decision_id`.
   - Pass: actual provider payload model/effort equals applied route decision for the same prompt turn across normal classifier route, continuation hold, explicit override/model selection, and denied fallback cases.

7. [ ] Telemetry is privacy-conscious and useful.
   - Verify: focused tests serializing routing telemetry with synthetic sentinel prompt.
   - Pass: prompt hash present; recursive scan of all telemetry string fields finds no raw prompt or secret-like sentinel by default; route/policy/provider/confidence/latency fields present.

8. [ ] Full validation passes.
   - Verify: `cd pi/extensions && pnpm run typecheck`, `cd pi/tests && pnpm run test`, and `make check`.
   - Pass: all exit 0 with no new warnings/errors.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes.
- `/do-it` must be able to run all agent-runnable validation steps through documented commands.
- No credentials are required. All work is local repo/Pi extension behavior.
- Evidence files must record command, cwd, exit code, files changed, and sanitized summary. After every evidence write, run or document a secret/sentinel scan before marking the item complete.
- Evidence must not include raw prompts, credentials, tokens, private keys, `.env` content, or unredacted synthetic sentinel strings.

### Required automated validation

1. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` commands.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: do not proceed to dependent wave; create or perform targeted fix, then rerun affected checks.

2. [ ] Run focused prompt-router tests.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test prompt-router.test.ts`
   - Pass: exits 0.
   - Fail: repair before repo-wide validation.

3. [ ] Run Pi typecheck and full Pi tests.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: exits 0.
   - Fail: repair before repo-wide validation.

4. [ ] Run Python prompt-routing tests/eval.
   - Command: `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests && uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json`
   - Pass: exits 0 or documented gate status matches expected classifier artifact availability.
   - Fail: repair or document explicit unsupported artifact reason before archive.

5. [ ] Run strongest repo-wide validation.
   - Command: `make check`
   - Pass: exits 0 with no new errors/warnings.
   - Fail: do not archive; update execution status with failing command and next fix.

### Manual validation

- Required: yes unless automated registered-command tests prove the same `/router-status` and `/router-explain` output.
- Steps:
  1. From repo root, start the normal local Pi command used by this checkout; if no command harness is available, record the exact launch command in `F3-manual-validation.md` before testing. Confirm the prompt-router extension is loaded by running `/router-status`.
  2. Use only fixed synthetic non-sensitive prompts such as `SYNTH_ROUTER_COMPLEX_PLAN_NO_SECRET` and `do option 2`; never use customer data, secrets, paths, or real prompts.
  3. Send the complex synthetic prompt expected to route `large`, then send `do option 2`, then run `/router-explain`. Capture only sanitized excerpts/field names in evidence, not full prompts.
  4. Expected success: explain shows actual classifier mode, canonical raw/applied routes, `context-continuation-hold`, resolved provider/model/effort, and no raw prompt in logs by default.
  5. Pin/select a high/max route, send synthetic `hi`, then run `/router-status`.
  6. Expected success: status shows active override scope/lifetime and no silent downgrade.

If manual validation is not completed and not replaced by automated command-surface tests, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update evidence, and must not archive the plan.

### Deployment validation

- Required: no.
- Procedure: Not applicable; changes are local dotfiles/Pi extension code. Record `not required` in `.specs/prompt-router-v1/evidence/F4-deployment-validation.md` after automated/manual validation decisions are complete.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation completion-or-explicit automated replacement, deployment validation not-required note, repo-wide validation, and archive preflight pass.

Archive preflight must:

1. Run `git status --short` and record unrelated changes.
2. Run a secret/sentinel scan over `.specs/prompt-router-v1/evidence`, new tests, and new fixtures for PEM/AWS/token/private-key-looking patterns and synthetic raw prompt sentinels.
3. Write `.specs/prompt-router-v1/evidence/F5-archive-preflight.md`.
4. Copy, do not move, active plan/evidence to archive destination first; verify copied files. Remove the active plan directory only with explicit user approval or mark `ready-to-archive` instead. If approval is present, move/copy to `.specs/archive/prompt-router-v1/`, set frontmatter `status: completed` and `completed: YYYY-MM-DD`, only after all gates pass.

## Execution Status

- Completion classification: completed-and-archived.
- Status: Wave 0 through Wave 4 and final gates F1 through F5 complete; plan archived.
- Last updated: 2026-05-11.
- Last completed item: F5.
- Next item: none.
- Archive path: `.specs/archive/prompt-router-v1/plan.md`.
- Review artifact: `.specs/archive/prompt-router-v1/review-1/synthesis.md`.

## Handoff Notes

- Existing focused tests passed before this plan was written: `cd pi/tests && pnpm test prompt-router.test.ts` reported 69 tests passing.
- The current anti-downgrade behavior is intentionally too broad for PRD V1; do not merely rename it. Gate it on deterministic continuation detection and add cheap/brief bypass.
- The current `buildRoutingContextCapsule` tracks message count/context window, not the PRD capsule. Preserve useful context-window safety but separate it from continuation detection.
- Keep provider-specific model IDs in profile resolution, never in classifier schema.
- `pi/settings.json` currently lacks `router.classifier.mode`; adding an explicit default is optional, but runtime default must remain truthful in status/explain/eval.
- Do not modify `.env` files or include raw prompts/secrets in evidence.
