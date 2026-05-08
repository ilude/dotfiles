---
reviewer: product-manager
status: changes_requested
---

# Findings

### 1. V1 scope is too large for the stated control-plane problem

- severity: high
- evidence: The plan bundles route vocabulary, classifier mode, Codex resolver, same-turn proof, continuation policy, overrides, eval unification, and telemetry into one V1 with 9 tasks across 4 waves. Several items are quality-program infrastructure, not prerequisites for truthful status/explain routing.
- required_fix: Split V1 to the smallest shippable slice: canonical vocabulary, classifier mode validation, status/explain truthfulness, and same-turn proof. Move continuation, eval unification, and telemetry hardening to separate follow-up plans.

### 2. Sequencing delays the critical feasibility gate

- severity: high
- evidence: T5 says behavior rollout must stop if same-turn routing cannot be proven, but it runs after Wave 1 implementation work. If hook timing cannot affect generation, T1/T2 may create adapter/config churn against the wrong architecture.
- required_fix: Make same-turn proof the first executable task. If it fails, stop this plan and write the provider architecture spike before changing control-plane semantics.

### 3. Resolver/profile abstraction looks speculative

- severity: medium
- evidence: T3 introduces provider trust metadata, route states, fallback policy, specialized profiles, domain/effort/profile resolution, and thinking mapping before the plan demonstrates a current route-profile bug or required consumer. This risks building a generic control plane instead of fixing drift.
- required_fix: Limit V1 resolver work to the concrete provider/model fields already consumed by runtime/status/tests. Defer trust metadata and specialized profiles until a failing fixture or user-visible requirement proves they are needed.

### 4. Manual validation remains too central for a router control plane

- severity: medium
- evidence: Final completion requires an interactive Pi session and pasted transcript/screenshot note for normal, continuation, cheap override, pin, and unavailable cases. The same cases are also deterministic enough to appear in Vitest fixtures or a scripted Pi harness.
- required_fix: Add a scripted validation command that exercises those cases and emits status/explain snapshots. Keep manual validation only as a smoke test, not a blocking substitute for repeatable evidence.

### 5. Reuse of existing tests/eval paths is underspecified

- severity: low
- evidence: Most tasks point broadly at `pi/tests/prompt-router.test.ts`, while T8 later “unifies or retires duplicate eval paths.” The plan does not first inventory existing fixtures, helpers, or duplicate eval behavior, so implementers may add parallel tests and more drift.
- required_fix: Add a preflight inventory task listing existing router tests, fixtures, eval scripts, and reusable helpers. Require each new test to extend or retire an existing path rather than create another duplicate surface.
