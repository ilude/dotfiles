---
reviewer: typescript-pro
persona: Pi TypeScript extension type/build contract reviewer
focus: TS module boundaries, type contracts, pnpm validation, hook/runtime assumptions, runtime-proof tests
---

# Findings

- severity: high
  evidence: `pi/extensions/prompt-router.ts:611-626` currently starts `classifyAndRoute(...).catch(...)` without awaiting before returning `{ action: "continue" }`. T5 says prove same-turn route or block, but T3/T4/T6/T7 can still implement visible behavior before that proof and V2 only checks fixtures/evidence.
  required_fix: Make T5 a blocking gate before any resolver/status/policy behavior is considered accepted, or require a test that fails if `setModel`/`setThinkingLevel` happen after the generation request is dispatched.

- severity: high
  evidence: The plan requires canonical `nano|mini|core|large|max`, while current runtime types are `Tier = "low"|"mid"|"high"` and `RuntimeModelSize = "small"|"medium"|"large"` in `pi/extensions/prompt-router.ts:180-199`. T1 permits files as broad as `pi/lib/prompt-router/*`, risking duplicate vocabularies.
  required_fix: Require one exported `RouterSize`/ordering module consumed by extension, classifier adapter, resolver, telemetry, and tests; forbid local string unions or implicit `Record<string,...>` route maps outside adapter boundaries.

- severity: medium
  evidence: `classifyWithV3` currently hardcodes `--classifier t2` in `pi/lib/prompt-router/classifier.ts:116-127`, while `/router-explain` hardcodes `Classifier: confgate` in `pi/extensions/prompt-router.ts:687`. T2 acceptance tests only need valid/invalid modes, not status/explain consistency.
  required_fix: Add acceptance tests asserting the same configured mode is passed to Python, stored in last decision state, emitted in logs, and rendered by both `/router-status` and `/router-explain`.

- severity: medium
  evidence: T9 says default logs avoid raw prompts, but current telemetry emits `prompt_excerpt: makeExcerpt(promptText)` in `emitRoutingDecision` and classifier failures write `prompt_excerpt` in `pi/lib/prompt-router/classifier.ts`. Tests could inspect only JSONL fixtures and miss live failure paths.
  required_fix: Require tests for success, parse failure, nonzero exit, and timeout/exception paths proving no raw prompt/excerpt appears by default unless an explicit redacted-excerpt setting is enabled.

- severity: medium
  evidence: Validation commands mix `cd pi/tests && pnpm run test -- prompt-router.test.ts` with repo-wide `make check`, but Wave 2/3 gates omit `pnpm install --frozen-lockfile` for both `pi/extensions` and `pi/tests`. Stale local deps can make Vitest/typecheck pass differently than CI/fresh clones.
  required_fix: Normalize every validation gate to run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts` before marking the gate complete.
