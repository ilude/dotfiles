---
created: 2026-08-23
status: ready
---

# Codex Prompt Cache Measurement and Focused Optimization

## Objective

Determine whether Pi extension changes materially reduce Codex/OpenAI prompt-cache reuse, test one isolated cache-friendly reminder change when the signal exists, and expose only the evidence needed to evaluate subscription-limit impact. Target `openai-codex` first and update the Pi extension skill with verified guidance.

## Completion Evidence

- Evidence: A bounded Codex slice establishes the observable request and cache-usage fields, compares a stable control with one goal-reminder mutation, and determines whether the quota endpoint has useful resolution; when a material cache regression exists, an explicit optimized mode removes that regression without changing tool authority or unrelated workflows; `/usage` reports the proven measurements without causal overstatement; the Pi extension skill records only demonstrated cache-friendly rules.
- Fails when: Unsupported adapter or usage fields are assumed, unavailable values become zero, more than one prompt/tool/compaction variable changes in the first experiment, optimization proceeds without a measurable regression, security controls change, quota percentages are presented as request-level consumption, or unproved mechanisms become durable extension guidance.

## Boundaries

- Optimize subscription-limit consumption rather than nominal API price, but treat the relationship between cached tokens and ChatGPT quota as unproved.
- Start with `openai-codex`. Neutral metric names are allowed, but do not build provider adapters or a generalized provider framework.
- Reuse existing session, turn, metrics, transcript, and `/usage` mechanisms. Add request-attempt identity only if the slice proves that one turn produces ambiguous multiple provider requests.
- Initial metadata is limited to provider/model, session/turn, explicit experiment mode, system-prompt hash, ordered tool-definition hash, input/cache-read/cache-write tokens, goal/task/toolset-change flags, and compaction flag. Add another field only when the initial evidence cannot distinguish the observed behavior.
- The first optimization changes only volatile goal reminder content or its verified placement. Hold task reminders, tool activation/disclosure, instruction loading, and compaction constant.
- Use explicit `control | optimized` settings for reproducible experiments. Do not add randomized cohort assignment unless bounded manual comparisons establish a signal that needs more samples.
- Take bounded manual fresh quota snapshots around the comparison. Do not add quota interval lifecycle or persistence unless the endpoint shows sufficient resolution to affect the implementation decision.
- Preserve workflow state gates, tool authority, unsupported providers, append-only conversation behavior, and existing generated local data.
- Metrics remain best-effort append-only JSONL. Raw provider payload inspection stays in `.tmp/` or the existing opt-in transcript boundary.

## Tasks

- [x] **T1: Prove whether extension churn causes a measurable cache regression**
  - Files: A focused helper under `pi/lib/` only if existing helpers cannot represent the measurement; the minimum existing provider/transcript/metrics extension files required to observe the request and normalized usage; focused `pi/tests/prompt-cache-measurement.test.ts`; `.tmp/` for offline captures. Do not change goal/task/tool/compaction behavior or `/usage` output.
  - Change: Inspect the installed `openai-codex` adapter and run the smallest offline capture that determines what the last extension-visible request contains, whether a final serialized request can be observed without a live call, and which input/cache-read/cache-write fields Pi preserves. Record only the bounded initial metadata. Compare repeated identical control requests with one otherwise identical request whose goal reminder contains the current volatile fields. Hold provider, model, reasoning effort, messages, tools, tasks, instructions, and compaction constant. Take manual fresh quota snapshots before and after a bounded control/variant comparison solely to determine whether percentage resolution is useful. If cache usage is unavailable, the adapter boundary is unobservable, or the goal mutation produces no material difference in the captured prefix or reported cache reuse, record that result and stop T2 optimization rather than expanding telemetry. Run the shared TypeScript typecheck as soon as any shared contract is introduced.
  - Done when: Captured evidence identifies the observable request boundary and exact available usage fields; the control and one-variable variant are reproducible; cache impact is measured or explicitly unavailable; quota resolution is classified useful or insufficient without attributing percentage changes to a request; no production workflow behavior changed.
  - Verify: Run `cd pi && pnpm test prompt-cache-measurement.test.ts transcript-integration.test.ts session-configuration-fingerprint.test.ts` and, if shared TypeScript changed, `cd pi && pnpm run typecheck`; inspect the bounded capture to confirm only the goal-reminder variable differs.

- [x] **T2: Implement one evidence-backed reminder optimization (skipped - no measured regression)**
  - Dependencies: T1
  - Files: `pi/extensions/goal.ts`, `pi/lib/runtime-context.ts` only if required by the proven placement, a small experiment-setting helper only if existing settings access is insufficient, and focused goal/cache tests. Do not change task reminders, tool activation/disclosure, instruction context, compaction, other workflow owners, or unsupported providers.
  - Change: Execute this task only if T1 demonstrates that volatile goal reminder content or placement materially reduces reusable cache content. Add explicit `promptCache.experimentMode: control | optimized`, defaulting to control during evaluation. In optimized mode, remove unneeded timestamps and per-turn counters from the cache-sensitive reminder or move changing state to the least disruptive boundary that T1 proves the installed adapter preserves. Keep the reminder's required goal identity, state, and completion instructions intact. Compare bounded paired workloads in both modes. If T1 does not demonstrate a regression, mark T2 skipped with that evidence. Treat tool disclosure and compaction as separate future experiments only if the remaining measurements justify them.
  - Done when: Control preserves current behavior; optimized mode changes only the proven reminder variable; required goal intent remains visible; paired captures show the expected stable-prefix improvement and reported cache effect when available; unrelated workflows and providers are unchanged; or the task is explicitly skipped because T1 found no actionable regression.
  - Verify: Run `cd pi && pnpm test goal.test.ts prompt-cache-measurement.test.ts` and `cd pi && pnpm run typecheck`; compare bounded control and optimized captures; run existing goal lifecycle checks that exercise active completion/progress state.

- [x] **T3: Productize only measurements and guidance that changed the decision (skipped - no decision-changing measurement)**
  - Dependencies: T1, T2
  - Files: `pi/extensions/codex-status.ts` as `/usage` owner; `pi/extensions/usage.ts` only if its parser must expose an available cache-write field; focused `pi/tests/codex-status.test.ts`, `pi/tests/usage.test.ts`, and `pi/tests/prompt-cache-report.test.ts`; `pi/skills/pi-extension/SKILL.md`; `pi/skills/pi-extension/references/tooling-contracts.md`; one focused caching contract under `pi/skills/pi-extension/references/contracts/`.
  - Change: Extend `/usage` only with fields T1 proved available and useful: bounded input, cache reads, cache writes, experiment mode, and the smallest prompt/tool churn indicators needed to interpret the result. Define a cache ratio only if T1 proves its denominator. Show quota snapshots only as account-wide observations when their resolution was useful; otherwise state that quota correlation is unavailable and do not build start/stop interval machinery. Do not add randomized cohorts, retry/concurrency tracing, analytics views, or additional provider support unless T1 produced direct evidence that they are required for a correct report. Update the Pi extension skill and one indexed contract with verified rules for stable static prefixes, avoiding volatile reminder content, late dynamic context where supported, stable tools only where authority permits, and measuring cache effects before broad extension changes. Separate OpenAI-specific facts from provider-neutral guidance.
  - Done when: `/usage` deterministically reports the available evidence without zero-filling or causal claims; no unused experiment infrastructure is added; the skill links the caching contract; every rule is backed by T1/T2 evidence or current primary OpenAI documentation and clearly labeled by scope.
  - Verify: Run `cd pi && pnpm test codex-status.test.ts usage.test.ts prompt-cache-report.test.ts` and `cd pi && pnpm run typecheck`; inspect fixture output for unavailable fields and account-wide quota labels; reread the complete skill and caching contract against implemented behavior.

## Validation

- [x] T1 changes one variable and either proves an actionable cache regression or stops expansion with explicit unavailable/no-effect evidence.
- [x] T2 changes only goal reminder content or placement and preserves goal behavior, or is skipped with T1 evidence.
- [x] T3 contains no randomized cohort, automated quota-interval, generalized provider, broad tracing, tool-disclosure, or compaction implementation unless a new operator decision expands scope.
- [x] Focused tests and applicable typechecks pass.
- [x] `/usage` and Pi extension guidance make no unsupported causal or cross-provider claims.

## Retention

Keep this plan at `.specs/codex-prompt-cache-telemetry/plan.md` while work remains. After all tasks and validation pass, `/do-it` archives the directory to `.specs/archive/codex-prompt-cache-telemetry/`. Keep runtime captures and generated analytics untracked.

## Execution Results

- T1: The installed `openai-codex-responses` adapter calls `onPayload` after building the provider payload and before transport. The focused offline slice captured `model`, `instructions`, ordered `input`, ordered `tools`, and `reasoning`; repeated controls serialized identically, and the variant changed only goal-reminder text inside `instructions`.
- Usage: Synthetic provider responses proved Pi normalizes `input_tokens_details.cached_tokens` to `cacheRead`, optional `cache_write_tokens` to `cacheWrite`, and uncached input to `input_tokens - cached_tokens - cache_write_tokens`. Missing cache-write data normalizes to zero in the installed adapter, so zero cannot prove that cache writes are supported or absent.
- Cache impact: Offline payload capture cannot establish provider cache reuse or subscription-quota impact. No bounded live paired response was available in this execution, so no material goal-reminder regression was demonstrated.
- Quota resolution: The existing ChatGPT usage endpoint exposes account-wide `used_percent` windows, not request-attributed consumption. It is insufficient for assigning a percentage change to this one-request experiment.
- T2: Skipped as required because T1 did not demonstrate a material cache regression.
- T3: Skipped as required because T1/T2 produced no decision-changing measurement. `/usage`, extension guidance, tool authority, compaction, and unsupported providers remain unchanged.
- Validation: `pnpm test prompt-cache-measurement.test.ts transcript-integration.test.ts session-configuration-fingerprint.test.ts` passed 17 tests. The shared typecheck was attempted but the isolated worktree cannot resolve the pre-existing `modules/onclave` loader path from `pi/extensions/onclave-pi.ts`; T1 changed no shared TypeScript contract, so that unrelated worktree-path failure does not invalidate the focused slice.

## Execution Status

- State: Complete. T1 stopped expansion with explicit unavailable evidence; T2 and T3 were skipped under their plan gates.
