---
created: 2026-05-07
status: completed
completed: 2026-05-07
---

# Plan: Prompt Router Provider-Architecture Spike

## Context & Motivation

The previous control-plane plan stopped at Wave 0 because the current prompt router runs from `pi.on("input")` and starts `classifyAndRoute(...)` without awaiting it. Evidence in `.specs/prompt-router-control-plane/evidence/same-turn-blocker.md` showed this order:

```text
classifier-start
hook-returned-continue
classifier-finish
setModel
setThinkingLevel
```

That proves the current input-hook side effect cannot prove same-turn routing. This spike finds the smallest before-generation seam that can await route resolution and prove the exact provider/model/thinking used by generation for the same synthetic turn.

## Objective

Prove, with an executable harness, whether Pi can route prompts through an awaited before-generation provider/model/thinking decision object for the same generation turn. First evaluate existing seams such as `before_provider_request`; create a new typed dispatch seam only if existing seams cannot satisfy the proof. If no safe seam exists, stop with blocker evidence and do not resume control-plane cleanup.

## Constraints

- Run all implementation from the isolated worktree `../.dotfiles-prompt-router-control-plane` on branch `plan/prompt-router-control-plane`.
- Do not merge, push, rebase, cherry-pick, or mutate the original checkout.
- Use pnpm only for Pi TypeScript validation; do not use Bun.
- Use only synthetic prompts in tests/evidence. Do not record raw prompts, excerpts, endpoints, account IDs, tokens, credentials, or private paths.
- Cross-provider fallback remains denied by default. Missing credentials and denied provider transitions must fail closed without applying a stale previous-turn route.
- Feasibility proof comes before resolver/control-plane cleanup. Reuse existing router policy/mapping where possible; defer broad resolver consolidation until same-turn dispatch is proven.
- Awaited classification must have bounded latency. Default spike budget: classifier/policy resolution may block dispatch for at most 1500 ms in tests/config unless a narrower existing timeout is found and documented.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Worktree guard | `cd ../.dotfiles-prompt-router-control-plane && mkdir -p .specs/prompt-router-control-plane/evidence && git rev-parse --show-toplevel && git branch --show-current && test "$(git branch --show-current)" = plan/prompt-router-control-plane` | none | `.specs/prompt-router-control-plane/evidence/provider-spike-worktree.md` |
| Seam inventory | `cd ../.dotfiles-prompt-router-control-plane && grep -R "before_provider_request\|provider_request\|setModel\|setThinkingLevel\|classifyAndRoute" -n pi/extensions pi/lib --exclude-dir=node_modules` | none | `.specs/prompt-router-control-plane/evidence/provider-seam-inventory.md` |
| Typecheck | `cd ../.dotfiles-prompt-router-control-plane/pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` | none | `.specs/prompt-router-control-plane/evidence/provider-spike-typecheck.md` |
| Targeted Vitest | `cd ../.dotfiles-prompt-router-control-plane/pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` | none | `.specs/prompt-router-control-plane/evidence/provider-spike-vitest.md` |
| Repo-wide validation | `cd ../.dotfiles-prompt-router-control-plane && make check` | none | `.specs/prompt-router-control-plane/evidence/provider-spike-make-check.md` |
| Archive preflight | `cd ../.dotfiles-prompt-router-control-plane && git status --short && grep -RInE "(sk-[A-Za-z0-9]|api[_-]?key|token|secret|https?://|C:/Users|/home/[^/]+)" .specs/prompt-router-control-plane/evidence pi/extensions pi/lib pi/tests || true` | none | `.specs/prompt-router-control-plane/evidence/provider-spike-archive-preflight.md`; benign field-name matches such as `token`/`secret` must be triaged and recorded as false positives, not ignored |

## Execution Checklist

### Wave 0

- [x] S0: Validate isolated worktree and evidence directory
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-spike-worktree.md`
- [x] S1: Inventory before-generation/provider seams
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-seam-inventory.md`
- [x] V0: Validate seam inventory gate
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-seam-inventory.md`

### Wave 1

- [x] S2: Select minimal awaited seam or document blocker
  - Status: completed
  - Evidence: selected existing `before_provider_request` in `.specs/prompt-router-control-plane/evidence/provider-seam-inventory.md`
- [x] S3: Implement immutable route decision contract at selected seam
  - Status: completed
  - Evidence: `RouteDecision`, `resolveProviderRouteDecision`, and provider hook in `pi/extensions/prompt-router.ts`
- [x] V1: Validate selected seam and type contract
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-spike-typecheck.md`

### Wave 2

- [x] S4: Add deterministic same-turn dispatch harness
  - Status: completed
  - Evidence: `Provider architecture spike: awaited provider seam` tests in `pi/tests/prompt-router.test.ts`
- [x] S5: Add failure, timeout, trust-boundary, and stale-route tests
  - Status: completed
  - Evidence: timeout, denied provider, and out-of-order correlation tests in `pi/tests/prompt-router.test.ts`
- [x] V2: Validate same-turn and negative harness gates
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-spike-vitest.md`

### Wave 3

- [x] S6: Add operator/evidence fields from the dispatch decision object
  - Status: completed
  - Evidence: provider hook status/log fields and `.specs/prompt-router-control-plane/evidence/provider-spike-operator-proof.md`
- [x] V3: Validate operator proof and privacy evidence
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-spike-operator-proof.md` and `provider-spike-archive-preflight.md`

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: S0-S6 and V0-V3 checklist evidence complete
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-spike-make-check.md`
- [x] F3: Manual validation complete or explicitly not required
  - Status: completed
  - Evidence: not required; automated provider dispatch observer proof passed
- [x] F4: Rollback/archive preflight complete
  - Status: completed
  - Evidence: `provider-spike-rollback-manifest.md`, `provider-spike-archive-preflight.md`
- [x] F5: Spike outcome recorded for follow-up control-plane plan
  - Status: completed
  - Evidence: `.specs/prompt-router-control-plane/evidence/provider-spike-outcome.md`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| S0 | Validate isolated worktree and evidence directory | evidence only | preflight | small | coding-light | -- |
| S1 | Inventory before-generation/provider seams | evidence only | research | small | typescript-pro | S0 |
| V0 | Validate seam inventory gate | evidence only | validation | small | qa-engineer | S1 |
| S2 | Select minimal awaited seam or document blocker | `.specs/.../evidence/*`, maybe docs | design spike | medium | typescript-pro | V0 |
| S3 | Implement immutable route decision contract at selected seam | `pi/extensions/*`, `pi/lib/*`, tests | spike implementation | medium | typescript-pro | S2 |
| V1 | Validate selected seam and type contract | evidence only | validation | medium | qa-engineer | S3 |
| S4 | Add deterministic same-turn dispatch harness | `pi/tests/prompt-router.test.ts` or dedicated provider harness | test | medium | qa-engineer | V1 |
| S5 | Add failure, timeout, trust-boundary, and stale-route tests | tests, router/provider helpers | test/hardening | medium | qa-engineer | V1 |
| V2 | Validate same-turn and negative harness gates | evidence only | validation | medium | qa-engineer | S4, S5 |
| S6 | Add operator/evidence fields from dispatch decision object | extension/log/status helpers/tests | spike implementation | medium | typescript-pro | V2 |
| V3 | Validate operator proof and privacy evidence | evidence only | validation | medium | qa-engineer | S6 |

## Execution Waves

### Wave 0: Worktree and seam inventory

**S0: Validate isolated worktree and evidence directory**
- Run the worktree guard from the Automation Plan.
- Create `.specs/prompt-router-control-plane/evidence/` if missing.
- Save command, exit code, timestamp, branch, sanitized repo-relative worktree marker (`../.dotfiles-prompt-router-control-plane` or `<worktree>` only; no absolute private paths), and `git status --short` to `provider-spike-worktree.md`.
- Stop if not on branch `plan/prompt-router-control-plane` inside `../.dotfiles-prompt-router-control-plane`.

**S1: Inventory before-generation/provider seams**
- Search for existing hooks and provider request seams, including `before_provider_request`, provider dispatch code, `setModel`, `setThinkingLevel`, and `classifyAndRoute`.
- Specifically inspect `pi/extensions/direct-personality.ts`, `pi/extensions/transcript-provider.ts`, `pi/extensions/prompt-router.ts`, and relevant `pi/lib` provider/model helpers found by grep.
- Save candidate seams, ordering assumptions, typed payloads, and whether each can mutate or return provider/model/thinking before dispatch to `provider-seam-inventory.md`.

**V0: Validate seam inventory gate**
- Confirm `provider-seam-inventory.md` names at least one candidate seam or explicitly states none exists.
- Confirm no behavior-changing code edits were made before inventory.

### Wave 1: Minimal awaited seam and immutable decision contract

**S2: Select minimal awaited seam or document blocker**
- Prefer the smallest existing seam that can be awaited before generation dispatch, such as `before_provider_request`, if it can carry route decisions safely.
- Branch explicitly:
  1. Existing awaited seam works: document the seam and continue to S3 using it.
  2. No existing seam works, but a safe provider-dispatch insertion point exists: document the insertion point and continue to S3 by creating the minimal new typed awaited seam needed for proof.
  3. No safe awaited seam or insertion point exists: document why in `.specs/prompt-router-control-plane/evidence/provider-seam-blocker.md`, create a follow-up API design note, leave S3+ unchecked, and stop.
- Define the selected seam contract: event/API name, ordering relative to generation dispatch, return/payload type, and how provider/model/thinking are consumed by dispatch.

**S3: Implement immutable route decision contract at selected seam**
- Add or use a typed immutable decision object, for example `RouteDecision`, containing `route_decision_id`, prompt hash or synthetic prompt id, classifier mode, raw route, applied route, provider family, model label, thinking level, route resolution reason, fallback reason if any, and `same_turn_applied` initially false until dispatch proof.
- Dispatch must consume this object directly. Do not rely on ambient global model/thinking state or post-`continue` `setModel`/`setThinkingLevel` side effects for the proof.
- If mutable setters must remain for compatibility, add a test proving mixed model/thinking/provider state cannot reach generation after a partial failure.

**V1: Validate selected seam and type contract**
- Run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
- Save command, exit code, and key pass/fail output to `provider-spike-typecheck.md`.

### Wave 2: Same-turn proof harness and negative cases

**S4: Add deterministic same-turn dispatch harness**
- Add a harness around the selected seam and generation/provider dispatch observer.
- Use a synthetic prompt only and inject deliberately conflicting ambient/default route, classifier route, and dispatch default route.
- The harness must hold the classifier promise open and assert dispatch is not called before release.
- Required ordered trace: `pre-generation-start -> classifier-start -> classifier-finish -> route-resolved -> dispatch-called -> first-token-or-provider-invoked`.
- Required correlation: `route_decision_id` propagates from prompt capture through classifier result, resolver, dispatch arguments, status/explain/log evidence, and provider invocation observer.
- Pass condition: dispatch/provider invocation receives the same immutable decision object provider/model/thinking as the applied route for the same `route_decision_id`, with `same_turn_applied: true`.

**S5: Add failure, timeout, trust-boundary, and stale-route tests**
- Add tests for classifier timeout, nonzero exit, malformed JSON, unknown label, resolver exception, denied provider fallback, missing credentials, observer failure, and two prompts completing out of order.
- Each failure must produce a safe fallback decision object with controlled `route_resolution_reason` such as `matched`, `canonicalized`, `override_applied`, `denied_by_policy`, `fallback_used`, `classifier_timeout`, or `classifier_failure`.
- Assert no failure path applies a stale previous-turn route, crosses provider trust boundaries implicitly, logs raw prompt text, or exposes endpoints/account IDs/tokens/private paths.

**V2: Validate same-turn and negative harness gates**
- Run `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`.
- Save command, exit code, named test list, and ordered trace excerpts to `provider-spike-vitest.md`.
- If the existing Vitest filter runs unrelated tests and unrelated failures occur, record them separately, but the spike is not complete until the targeted same-turn tests and required repo-wide gates pass or a real blocker is documented.

### Wave 3: Operator proof and privacy evidence

**S6: Add operator/evidence fields from dispatch decision object**
- Status, explain, logs, and harness evidence must derive from the exact dispatch decision object, not recomputed or stale state.
- Include `route_decision_id`, `same_turn_applied`, classifier mode, raw/applied route, route resolution reason, fallback reason, provider family/model label, thinking level, and sanitized timestamp/order.
- For real prompts, show only route decision ID, timestamp, classifier mode, route fields, and sanitized provider/model labels. Raw prompts/excerpts remain disabled by default.

**V3: Validate operator proof and privacy evidence**
- Confirm status/explain/log evidence carries the same `route_decision_id` as dispatch.
- Run raw-prompt/secret scan from archive preflight against evidence and changed source/test files.
- Save results to `provider-spike-operator-proof.md`.

## Dependency Graph

```text
S0 -> S1 -> V0 -> S2
S2 -> blocker stop OR S3 -> V1 -> (S4, S5) -> V2 -> S6 -> V3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. Same-turn feasibility is proven or blocked with evidence.
   - Pass: `provider-spike-vitest.md` contains the deterministic order trace and matching `route_decision_id`/provider/model/thinking from immutable decision object to provider invocation.
   - Blocked: `provider-seam-blocker.md` explains why no awaited seam can be instrumented safely; downstream tasks remain unchecked.
2. The proof cannot pass from stale global state.
   - Pass: tests use conflicting ambient/default/classifier routes and out-of-order prompt completion.
3. Safety and privacy remain fail-closed.
   - Pass: timeout/error/denied-provider/missing-credential tests use safe fallback decision objects, do not cross provider boundaries implicitly, do not apply stale routes, and do not log raw prompts/secrets.
4. Operator proof is human-readable and correlated.
   - Pass: status/explain/log/harness show the same `route_decision_id`, `same_turn_applied: true`, route resolution reason, provider/model/thinking, and sanitized evidence.

## Validation Contract

### Required automated validation

1. `cd ../.dotfiles-prompt-router-control-plane/pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
2. `cd ../.dotfiles-prompt-router-control-plane/pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`
3. `cd ../.dotfiles-prompt-router-control-plane && make check`
4. Run archive preflight scan from the Automation Plan.

All commands must save command, exit code, timestamp, and sanitized pass/fail signals to evidence files under `.specs/prompt-router-control-plane/evidence/`. Evidence must use repo-relative paths or `<worktree>` placeholders only; do not write absolute private paths such as `C:/Users/...` or `/home/<user>/...`.

### Manual validation

Required only if the selected seam cannot be fully proven by automated tests. If needed, create `.specs/prompt-router-control-plane/evidence/provider-spike-manual-template.md` with exact synthetic prompts and expected visible output:

1. Run one synthetic prompt through the modified local Pi session.
2. Inspect `/router-status`, `/router-explain`, and generated log/evidence.
3. Confirm the same `route_decision_id` appears in status, explain, log, and dispatch/provider observer.
4. Confirm `same_turn_applied: true` and provider/model/thinking match the dispatch observer before generation.
5. Record only sanitized fields; no raw prompts, screenshots with prompt text, endpoints, account IDs, tokens, or private paths.

If manual validation is required and not confirmed passed, classify as implemented-awaiting-manual-validation and do not archive.

### Deployment validation

Not required. This is a local spike in an isolated worktree.

### Rollback and archive criteria

Before archive or completion:

- Record `git status --short`.
- Write `.specs/prompt-router-control-plane/evidence/provider-spike-rollback-manifest.md` listing changed tracked files, untracked evidence files, and generated artifacts.
- Run the raw-prompt/secret scan from the Automation Plan and save it to `provider-spike-archive-preflight.md`.
- Do not archive if evidence contains unredacted prompts, endpoints, account IDs, tokens, credentials, or private paths.
- If no seam exists, revert any behavior-changing code edits, keep blocker/evidence artifacts, and leave implementation tasks unchecked.

## Final Gate Procedure

- **F1 Task-specific verification complete:** confirm S0-S6 and V0-V3 are either checked with evidence or downstream tasks are intentionally unchecked because `provider-seam-blocker.md` stopped the spike.
- **F2 Repo-wide validation complete:** run `make check` from the worktree and save evidence to `provider-spike-make-check.md`, unless the spike stopped at read-only blocker before code changes; if skipped for blocker, record why in `provider-spike-outcome.md`.
- **F3 Manual validation complete or explicitly not required:** mark not required only if automated dispatch/provider observer proves same-turn behavior; otherwise follow the Manual validation section.
- **F4 Rollback/archive preflight complete:** write rollback manifest, run git status, run archive preflight scan, and triage any benign scan matches.
- **F5 Spike outcome recorded:** write `.specs/prompt-router-control-plane/evidence/provider-spike-outcome.md` stating `same-turn-proven` or `blocked`, selected seam or blocker reason, validation commands/results, and whether the original control-plane plan can be revised/resumed.

## Execution Status

- Completion classification: completed-and-archived candidate.
- Status: implementation and automated validation complete; ready for archive.
- Last updated: 2026-05-07 by `/do-it`.
- Last completed wave/gate: F5 spike outcome recorded.
- Next wave/gate to run: archive move only.
- Implemented: selected existing `before_provider_request` seam; added immutable `RouteDecision` provider-route resolver and provider payload application; added deterministic same-turn, timeout, cross-provider denial, and out-of-order correlation tests; fixed `/summarize` workflow prompt drift exposed by validation.
- Validation passed: Pi extension typecheck, Pi Vitest command, repo-wide `make check`, archive preflight scan triaged.
- Manual validation: not required because automated provider dispatch observer proof passed.
- Review applied: `.specs/prompt-router-control-plane/review-2/synthesis.md`.
- Note: this file was originally a spike note, not a full executable plan. `/review-it` converted it into a standalone `/do-it`-ready plan candidate with checklist, gates, validation contract, and safety constraints.
