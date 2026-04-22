---
created: 2026-04-21
status: draft
completed:
---

# Plan: Pi expertise similarity tie-breaker

## Context & Motivation

The deterministic expertise snapshot MVP is now the baseline for Pi knowledge compaction in this repo. It preserves the raw append-only expertise log, builds a compact snapshot, and makes `read_expertise` use that snapshot instead of replaying raw history. That solves the immediate token-growth problem, but it still relies on rule-based normalization and category-aware merges only.

In the earlier design discussion, a cheaper GitHub Copilot-backed Raptor Mini model was identified as a good candidate for semantic tie-breaking: not as the primary compaction engine, but as an optional second pass for borderline cases where deterministic similarity is too weak. The prior review explicitly rejected making this part of the deterministic MVP because provider/runtime/config risks were underdefined. This plan captures that deferred follow-on as a separate, self-contained implementation path.

The goal here is to add model-assisted similarity safely and narrowly: only for ambiguous candidate merges, only after deterministic pre-grouping, and only behind a feature flag with a deterministic fallback that remains fully functional when no model/provider is available.

## Constraints

- Platform: Windows 10 / PowerShell (`pwsh`) in the current session
- Shell: pwsh
- The existing deterministic snapshot system remains the default and must continue to work with zero provider access
- Raw JSONL expertise logs remain the source of truth; no model pass may delete or mutate history
- Model use must be optional, bounded, and deterministic-first: only ambiguous candidate merges may be sent to the provider
- GitHub Copilot / Raptor Mini integration must be feature-flagged and degrade safely when unavailable, misconfigured, rate-limited, or failing
- No background AI agent orchestration is allowed; any model call should happen inside the existing snapshot rebuild path under explicit guardrails
- Similarity assistance must never silently widen the merge scope for durable categories like `strong_decision` or `key_file`
- Validation must prove both branches: provider-enabled and deterministic-fallback

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Stay deterministic-only forever | Simple, cheap, predictable | Misses semantically similar entries phrased differently | Rejected: acceptable baseline, but this plan exists to improve borderline semantic cases |
| Use Raptor Mini for all compaction | Strongest semantic clustering | Costly, slower, nondeterministic, over-merging risk, provider dependence | Rejected: too broad and risky |
| Use model-assisted tie-breaker only after deterministic pre-grouping | Bounded cost, targeted semantic help, preserves deterministic baseline | More implementation complexity, needs strict provider fallback and test coverage | **Selected** |
| Use embeddings/vector clustering instead of LLM comparison | Potentially cheap at scale | More infrastructure, more moving parts than the current extension runtime warrants | Rejected: not justified for this scope |

## Objective

Extend the expertise snapshot rebuild path so deterministic compaction remains primary, but ambiguous merges in selected categories can optionally be passed to a GitHub Copilot-backed Raptor Mini model for yes/no merge judgment and normalized merged summaries. The system must be gated behind configuration, preserve deterministic behavior when disabled/unavailable, and keep `read_expertise` unchanged from a consumer perspective except for improved consolidation quality when the feature is enabled.

## Project Context

- **Language**: Mixed repo; target implementation is TypeScript in `pi/extensions/` and `pi/lib/`, with supporting Markdown docs and Vitest tests
- **Test command**: `make test-pytest` (repo-wide) and `cd pi/tests && bun vitest run` (Pi extension tests)
- **Lint command**: `make lint-python` (repo-wide Python lint detected); Pi-specific type validation uses `python pi/extensions/tsc-check.py`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Define provider-gated similarity contract and safety policy | 3 | feature | medium | planning-lead | — |
| T2 | Add test matrix for provider-enabled and fallback similarity behavior | 3 | feature | medium | qa-engineer | — |
| T3 | Implement optional Raptor Mini tie-breaker in the snapshot rebuild path | 4 | architecture | large | engineering-lead | V1 |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2 |
| V2 | Validate wave 2 | — | validation | large | validation-lead | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: Define provider-gated similarity contract and safety policy** [medium] — planning-lead
- Description: Document exactly where model-assisted similarity is allowed and forbidden. This includes the feature flag/config surface, allowed categories (`observation`, `pattern`, `open_question` only unless explicitly expanded later), prohibited categories (`strong_decision`, `key_file`), candidate pre-grouping requirements, confidence/threshold rules, timeout/failure handling, and the guarantee that deterministic compaction remains the default and fallback behavior.
- Files: `pi/README.md`, `pi/multi-team/skills/mental-model.md`, `pi/lib/expertise-snapshot.ts` (doc comments or TODO contract notes if helpful)
- Acceptance Criteria:
  1. [ ] The docs explicitly state that model-assisted similarity is optional and disabled by default.
     - Verify: `rg -n "optional|disabled by default|feature flag|Raptor Mini|Copilot" pi/README.md pi/multi-team/skills/mental-model.md`
     - Pass: The provider path is clearly described as optional and gated, not required for correct operation.
     - Fail: Docs imply the provider is required or blur the deterministic baseline.
  2. [ ] The allowed and forbidden categories for model assistance are documented.
     - Verify: `rg -n "observation|pattern|open_question|strong_decision|key_file" pi/README.md pi/multi-team/skills/mental-model.md`
     - Pass: Docs clearly restrict model assistance to noisy/ambiguous categories and forbid it for durable categories.
     - Fail: The category scope is left open-ended.
  3. [ ] Failure handling is explicit for unavailable provider, timeout, and low-confidence results.
     - Verify: `rg -n "timeout|unavailable|low confidence|fallback|deterministic" pi/README.md pi/multi-team/skills/mental-model.md`
     - Pass: The docs explain that each such case falls back to deterministic compaction without breaking rebuilds.
     - Fail: Provider failure behavior is omitted or underspecified.

**T2: Add test matrix for provider-enabled and fallback similarity behavior** [medium] — qa-engineer
- Description: Add Pi tests that describe the expected branch behavior before implementation. Cover deterministic-only baseline, provider-enabled ambiguous merge approval, provider-enabled merge rejection, low-confidence fallback, timeout/provider failure fallback, and guardrails that prevent `strong_decision` / `key_file` from entering the model-assisted path.
- Files: `pi/tests/agent-chain.test.ts`, `pi/tests/helpers/mock-pi.ts` (if provider mocking/helpers are needed), `pi/tests/vitest.config.ts` (only if include/coverage needs updating)
- Acceptance Criteria:
  1. [ ] The test file contains named cases for both provider-enabled and provider-disabled/failure branches.
     - Verify: `rg -n "provider|Raptor|Copilot|timeout|low confidence|fallback|strong_decision|key_file" pi/tests/agent-chain.test.ts`
     - Pass: The matrix includes both success and fallback scenarios plus category-scope guardrails.
     - Fail: Tests only cover the happy path for model assistance.
  2. [ ] Wave 1 targeted Pi tests pass while still encoding future provider-assisted expectations as pending/skipped where necessary.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts`
     - Pass: The current suite passes, and future provider-specific expectations are present without deadlocking the wave.
     - Fail: Wave 1 introduces failing tests that block implementation or omits the provider branch entirely.
  3. [ ] Pi-specific TypeScript validation remains part of the plan’s gate.
     - Verify: `python pi/extensions/tsc-check.py`
     - Pass: The command succeeds and remains the required TS gate for the eventual implementation.
     - Fail: The plan drifts back to relying only on generic repo checks.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `cd pi/tests && bun vitest run tests/agent-chain.test.ts` — targeted Pi tests pass with the provider/fallback matrix encoded
  3. `python pi/extensions/tsc-check.py` — Pi extension TypeScript validation passes
  4. `make lint-python` — no unrelated Python lint regressions from repo edits
  5. Cross-task integration: verify the docs and test matrix agree on scope restrictions, feature-flag behavior, and deterministic fallback
- On failure: create a fix task, re-validate after fix

### Wave 2

**T3: Implement optional Raptor Mini tie-breaker in the snapshot rebuild path** [large] — engineering-lead
- Blocked by: V1
- Description: Extend the deterministic snapshot rebuild pipeline so it can optionally call a GitHub Copilot-backed Raptor Mini model for ambiguous candidate merges only. Deterministic pre-grouping must still narrow the candidate set first. The model path should return a structured decision (`merge`, `keep_separate`, confidence, merged summary) and must be feature-flagged, timeout-bounded, and safe to skip. If the provider is unavailable, low-confidence, or errors, rebuilds must continue using deterministic compaction only.
- Files: `pi/lib/expertise-snapshot.ts`, `pi/extensions/agent-chain.ts`, `pi/tests/agent-chain.test.ts`, `pi/README.md`
- Acceptance Criteria:
  1. [ ] The provider path is never invoked for forbidden categories.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts --reporter=verbose`
     - Pass: Tests confirm `strong_decision` and `key_file` bypass model-assisted similarity entirely.
     - Fail: Durable categories can reach the provider path.
  2. [ ] Provider-enabled ambiguous merges can improve consolidation while keeping structured evidence.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts --reporter=verbose`
     - Pass: Tests show an ambiguous observation/pattern/open-question pair can be merged via the provider path and still preserve evidence counts/metadata.
     - Fail: The provider path does nothing useful or discards metadata needed by the snapshot.
  3. [ ] Timeout, provider failure, and low-confidence responses fall back to deterministic compaction without breaking rebuilds.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts --reporter=verbose`
     - Pass: Tests cover each failure mode and confirm a valid snapshot is still produced.
     - Fail: Rebuilds fail hard, return incomplete snapshots, or silently suppress fallback behavior.
  4. [ ] `read_expertise` remains consumer-stable: it still reads a compact snapshot and does not require callers to know whether the provider path ran.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts --reporter=verbose`
     - Pass: Tests confirm the provider path only affects consolidation quality, not the external tool contract.
     - Fail: The read API or returned state becomes provider-coupled.
  5. [ ] The implementation remains type-safe and provider-gated.
     - Verify: `python pi/extensions/tsc-check.py`
     - Pass: The TS check succeeds with the new provider interfaces/config path.
     - Fail: Provider integration introduces unresolved types, runtime-only imports, or invalid config assumptions.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [large] — validation-lead
- Blocked by: T3
- Checks:
  1. Run acceptance criteria for T3
  2. `cd pi/tests && bun vitest run` — all Pi extension tests pass
  3. `python pi/extensions/tsc-check.py` — Pi extension TypeScript validation passes after implementation
  4. `make test-pytest` — no repo-wide Python test regressions from surrounding changes
  5. `make lint-python` — no new Python lint warnings
  6. Cross-task integration: verify the implemented provider path is still optional, bounded to allowed categories, and fully covered by deterministic fallback behavior
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

1. [ ] Expertise snapshot rebuilds can optionally use a model tie-breaker for ambiguous noisy categories only.
   - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts`
   - Pass: Tests confirm provider-assisted merges are limited to the intended categories and improve ambiguous-case consolidation.
2. [ ] Provider failure does not break expertise snapshot generation.
   - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts`
   - Pass: Tests confirm timeout/error/low-confidence cases all produce deterministic snapshots successfully.
3. [ ] The deterministic baseline remains valid when model assistance is disabled.
   - Verify: `rg -n "disabled by default|deterministic fallback|feature flag" pi/README.md && cd pi/tests && bun vitest run`
   - Pass: Docs and tests both show the feature is optional and the deterministic path still stands alone.

## Handoff Notes

- Build on the existing deterministic snapshot implementation in `pi/lib/expertise-snapshot.ts`; do not redesign the whole snapshot system.
- Keep provider integration narrow: a helper that receives already pre-grouped ambiguous candidates is preferable to threading provider logic through every merge path.
- Require structured provider responses and confidence handling; do not accept freeform prose from the model as the merge contract.
- If GitHub Copilot / Raptor Mini wiring is not already available through Pi’s provider/runtime layer, add the plan notes/config scaffolding first and keep the actual provider call behind a disabled feature flag until runtime access is verified.
- Preserve the existing `read_expertise` external contract from the deterministic MVP; this follow-on should improve consolidation quality, not change the consumer API.
