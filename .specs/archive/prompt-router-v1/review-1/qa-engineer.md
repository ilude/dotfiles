# QA Review: Prompt Router V1 Plan

## Findings

### 1. High — Several acceptance checks are grep-only and can be satisfied without runtime behavior
**Evidence:** T1 AC2 verifies telemetry canonicalization with `grep -RIn "applied_route\|raw_route\|selected_model_size"`; T6 AC2 verifies telemetry schema with `grep -RIn "schema_version\|router-log-v1\|prompt_hash\|rule_fired\|context_capsule"`; T8 AC1 verifies docs with keyword grep only. These checks prove strings exist, not that emitted events/status/docs are correct.
**Required fix:** Replace grep-only pass criteria with executable assertions where possible: serialize an actual routing event, inspect parsed JSON fields, and assert canonical route values, schema version, prompt hash, rule, provider/model, and absence of raw prompt. Keep grep only as supplementary evidence, not a pass gate.

### 2. High — Command-surface behavior for `/router-status` and `/router-explain` is deferred to ambiguous manual validation
**Evidence:** Success criteria and T1 rely on `prompt-router.test.ts`, but the validation contract says manual validation is required unless automated registered-command tests prove the same command output. The plan does not add explicit automated command-surface tests for the registered slash commands, leaving a route where internal formatter tests pass while actual command registration/output regresses.
**Required fix:** Add a task/AC to test the registered `/router-status` and `/router-explain` command handlers through the Pi command harness or exported command registry, asserting actual user-visible output after representative prompts, pins, and continuation turns. Manual validation should be fallback evidence only.

### 3. Medium — Same-turn routing proof is under-specified and may remain a shallow ordering test
**Evidence:** Success criterion 6 asks for focused tests covering `before_provider_request` ordering and immutable `route_decision_id`, but no task acceptance criteria require asserting the actual provider payload model/effort for the same prompt turn across classifier mode, override, continuation hold, and provider fallback cases.
**Required fix:** Add explicit same-turn fixtures that invoke the provider seam and assert the outbound provider request uses the same `route_decision_id`, applied canonical route, model, provider family, and effort produced for that exact prompt turn. Include at least normal classifier route, continuation hold, explicit override, and denied fallback cases.

### 4. Medium — Eval validation allows unsupported/artifact failures to pass without a clear quality gate
**Evidence:** Required automated validation says Python tests/eval pass if it “exits 0 or documented gate status matches expected classifier artifact availability.” T7 also allows each mode to “succeed or fail with explicit unsupported/artifact reason.” This can permit all non-default modes or sequence metrics to be non-functional while still counting V1 eval complete.
**Required fix:** Define minimum mandatory eval gates: at least the runtime default mode must complete with sequence fixtures and all PRD metrics present; unsupported modes must be enumerated with expected artifact names and must not hide missing metrics for supported modes. Archive should be blocked if the default runtime-comparable eval cannot run.

### 5. Medium — Privacy checks risk false confidence from synthetic-only absence assertions
**Evidence:** T6 AC1 uses “synthetic private prompt” absence checks, while the validation contract also says evidence must not include “unredacted synthetic sentinel strings.” If tests only search for one sentinel, telemetry could still include prompt excerpts, message text under another field name, or evidence could capture the sentinel in command output.
**Required fix:** Require parsed telemetry snapshot tests that recursively scan all string fields for raw prompt substrings and known secret-like patterns, verify only hash/redacted fields are present, and ensure evidence records sanitized summaries rather than full event payloads containing sentinels.
