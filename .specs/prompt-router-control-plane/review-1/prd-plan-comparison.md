# PRD vs Plan Comparison

## Verdict
mostly aligned with gaps

## Must-Fix Gaps

- **FR3a artifact/hash validation is not executable enough.** PRD evidence: FR3a requires each supported classifier mode to list required model artifacts and hash sidecars, and cold-start validation must prove intended artifact loads and hash mismatch fails closed. Plan evidence: T2 covers mode validation and failure paths; T7 covers mode matrix, but no task explicitly inventories per-mode artifacts/hash sidecars or tests hash mismatch failure. Required fix: add T2/T7 acceptance criteria and validation commands for artifact/sidecar inventory per `t2 | lgbm | ensemble | confgate`, intended artifact load evidence, and hash-mismatch fail-closed fixture.

- **Prompt hash normalization contract is under-specified in validation.** PRD evidence: telemetry migration contract requires SHA-256 over exact UTF-8 prompt text after the same trim/join normalization shared across Python and TypeScript. Plan evidence: T8 mentions “prompt hash normalization” but no cross-language fixture/command proves TS and Python produce identical hashes. Required fix: add a shared hash fixture with expected digest and a TS + Python validation command.

- **Context capsule disablement is missing.** PRD evidence: context capsule logging must be disableable separately from current-turn `/router-explain`. Plan evidence: T5 logs capsule flags and T8 hardens telemetry, but no setting or test covers disabling capsule logging while explain still works. Required fix: add config/test coverage for capsule-log disablement and explain-only visibility.

- **Status/explain example coverage omits context continuation hold.** PRD evidence: FR4 planning must include example explain/status output for normal classifier route, context continuation hold, unavailable fallback, policy-only `max`, and manual pin. Plan evidence: T4 examples cover normal route, unavailable fallback, policy-only `max`, manual pin, classifier failure; context continuation appears later in T5 but not as explicit status/explain example output. Required fix: add context-continuation-hold status/explain fixture, either in T4 as a placeholder case or in T5 with explicit FR4 linkage.

- **Telemetry aggregate/stat exposure may be lost.** PRD evidence: Aggregates require requests/cost/latency/fallback/manual conflicts/holds/thrash/calibration, exposed via stats command or analytics script. Plan evidence: T7 produces eval metrics and T8 log readers/privacy, but no task explicitly implements or validates stats/aggregate command/script for runtime telemetry. Required fix: either add a bounded analytics script/stats task for V1-required aggregates or explicitly mark broad aggregate exposure as deferred with PRD-approved rationale.

## Over-Scope or Premature Work

- **Rollback/archive machinery is larger than the PRD V1 product scope.** PRD prioritizes control-plane truthfulness, same-turn proof, bounded continuation, eval, telemetry privacy. Plan evidence: T8 requires rollback manifest, archive preflight, generated artifact inventory, raw-prompt scans, and archive rules. Required fix: keep privacy/secret scans as validation, but defer formal rollback/archive controls unless this is a `/do-it` process requirement rather than router V1 scope.

- **Provider trust tests include missing credentials and sanitized account output beyond PRD acceptance specificity.** PRD requires provider trust metadata and explicit cross-provider fallback. Plan evidence: T3 adds missing credentials and sanitized provider output. This is reasonable but risks expanding resolver work. Required fix: constrain to metadata/fallback behavior needed for status/explain/logs; defer comprehensive credential/account sanitization unless existing code exposes those fields.

- **Manual validation may become a completion blocker despite PRD acceptance being mostly automatable.** PRD acceptance includes command-based verification and one interactive status/explain check, but not necessarily a mandatory post-automation manual smoke gate. Plan evidence: manual validation is required and blocks archive. Required fix: clarify manual smoke is for UX evidence only and cannot substitute for automated acceptance; if unavailable, plan can still report automated completion with “awaiting manual UX smoke.”

## Contradictions / Ambiguities

- **Invalid classifier mode behavior is stricter than PRD wording and needs alignment.** PRD says invalid modes must fail closed with explicit fallback reason or error and must not silently become `ensemble`. Plan says invalid classifier mode must be explicit error/no classification, no silent fallback; runtime subprocess failures may use `null-fallback`. Required fix: state whether invalid config is fatal at settings load, returns null-fallback, or blocks routing; ensure status/explain/eval all render the same behavior.

- **Wave 0 can stop the whole plan before control-plane truthfulness, while PRD V1 needs same-turn proof but also asks for control-plane improvements.** PRD says if same-turn cannot be guaranteed, record required provider-architecture spike before implementation proceeds. Plan stops all downstream work on proof failure. That is defensible, but ambiguous whether non-behavioral normalization can still proceed safely. Required fix: explicitly classify which tasks are blocked by same-turn failure and whether read-only/planning-only control-plane cleanup is allowed.

- **`max`/`nano` resolver states are still ambiguous.** PRD allows `nano` unavailable/fallback and `max` policy-only. Plan says `nano` may be unavailable or fallback, and tests cover both “unavailable fallback” and policy-only max. Required fix: choose one default V1 behavior for `nano` in the plan before implementation, or require resolver config to make the state explicit in status/explain fixtures.

## Validation Coverage

- **Strong coverage:** plan validates same-turn routing first; canonical labels; settings-driven classifier mode; invalid mode; status/explain/log schemas; continuation fixture matrix; override hierarchy; unified eval; privacy-conscious logging; repo-wide `make check`, pnpm typecheck, Vitest, and Python `uv` commands.

- **Missing validation evidence:** per-mode artifact/hash sidecars and hash mismatch; TS/Python prompt hash parity; context capsule logging disablement; explicit context-continuation-hold status/explain output; runtime telemetry aggregate/stat exposure; exact mode matrix execution beyond T7 single valid mode plus V4 one invalid mode.

- **Potential validation weakness:** same-turn proof requires “actual provider/model/thinking used by generation,” but the plan does not specify the instrumentation seam or minimum acceptable evidence if Pi does not expose generation dispatch metadata. Add a concrete harness contract or fixture API before T0 starts.

## Recommended Plan Edits

- Add FR3a artifact/hash validation to T2/T7, including hash-mismatch fail-closed evidence.
- Add cross-language prompt hash parity fixture and command to T8/V4.
- Add context capsule logging disablement setting/test to T5 or T8.
- Add context-continuation-hold status/explain fixture to T4/T5.
- Decide and document V1 `nano` default state.
- Clarify invalid classifier mode behavior across settings load, runtime fallback, status/explain, logs, and eval.
- Add a bounded telemetry aggregate/stats validation or explicitly defer it.
- Tighten T0 same-turn harness evidence requirements to name the instrumentation seam and acceptable fields.
