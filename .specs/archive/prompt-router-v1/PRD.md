---
created: 2026-05-07
status: draft
---

# PRD: Prompt Router Control Plane and Context-Aware Routing

## Problem

The current Pi prompt router has two separate improvement needs:

1. **Control-plane correctness:** routing vocabulary, classifier mode, status/explain output, runtime policy, and eval scripts can drift from one another. This makes route quality hard to trust or improve.
2. **Context-aware routing:** isolated per-turn classification can under-route short continuation prompts such as "do option 2", "patch it", or "same but with auth" when the hard context was established earlier.

These issues matter because model routing errors are expensive in both directions: over-routing wastes quota/cost, while under-routing can degrade coding, planning, debugging, and safety-sensitive work.

## Users / Jobs To Be Done

- **Primary user:** Pi operator using OpenAI Codex subscription models as the default model family.
- **Job/story:** As a Pi user, I want the router to pick an appropriate Codex route profile per turn, explain why it did so, and avoid unsafe downgrades for context-dependent follow-ups.
- **Current workaround:** Manually switch models/thinking levels or inspect router logs after surprising behavior.

## Research and Extension References

### Academic / research references

- **RouterBench** (2024, ICML/arXiv): benchmark-oriented routing evaluation with cost/performance tradeoffs and oracle baselines. Useful for unified eval design. <https://arxiv.org/html/2403.12031v2>
- **RouteLLM** (2024/2025, arXiv/OpenReview): learns strong/weak routing from preference data; supports future log-derived/preference routing. <https://arxiv.org/abs/2406.18665>
- **FrugalGPT** (2023, TMLR/arXiv): foundational LLM cascade framing and cost reduction. <https://arxiv.org/abs/2305.05176>
- **Unified Routing and Cascading** (2024/2025, ICML): emphasizes quality estimators as the bottleneck for model-selection systems. <https://arxiv.org/abs/2410.10347>
- **Causal LLM Routing** (2025, NeurIPS/arXiv): learning routing policies from observational/partial-feedback logs. <https://arxiv.org/abs/2505.16037>
- **Detecting Context Dependent Messages** (2016): directly frames whether short messages require prior conversational context. <https://arxiv.org/abs/1611.00483>
- **CHIQ** (2024): compact contextual history enhancement for ambiguous conversational queries; supports context capsule over raw history. <https://arxiv.org/html/2406.05013v1>
- **Multi-turn Agent Evaluation Survey** (2025/2026): evaluation dimensions for multi-turn agents, including memory/context retention and tool integration. <https://arxiv.org/abs/2503.22458>

### Extension implementation references

- **yeliu84/pi-model-router:** Pi-native logical `router` provider, profiles/tiers, phase memory, optional LLM classifier, state persistence, pins/fixes/debug UX. Reference repo: <https://github.com/yeliu84/pi-model-router>. Relevant paths: `extensions/provider.ts`, `extensions/routing.ts`, `extensions/state.ts`, `extensions/commands.ts`, `docs/ARCHITECTURE.md`.
- **BlockRunAI/ClawRouter:** weighted dimension scoring, profiles, selector/cost baseline, stats aggregation, context-window/tool filters. Reference repo: <https://github.com/BlockRunAI/ClawRouter>. Relevant paths: `src/router/rules.ts`, `src/router/strategy.ts`, `src/router/selector.ts`, `src/router/types.ts`, `src/stats.ts`, `src/logger.ts`.
- **madushan-sooriyarathne/openclaw-plugin-model-router:** configurable dimension/tiers and JSONL decision logs with dimension scores. Reference repo: <https://github.com/madushan-sooriyarathne/openclaw-plugin-model-router>. Relevant paths: `src/router.ts`, `src/scorer.ts`, `src/logger.ts`, `config/dimensions.json`, `config/tiers.json`.
- **psifactory/openclaw-psi-router:** cheap LLM classifier cache, rule fast-paths, tool-safety upgrade from SIMPLE/RESEARCH to MEDIUM. Reference repo: <https://github.com/psifactory/openclaw-psi-router>. Relevant paths: `src/classifier.ts`, `src/router.ts`, `src/tiers.ts`.
- **42-evey/hermes-plugins:** sensitivity/local-only routing, fallback/retry chains, structured telemetry and telemetry query tooling. Reference repo: <https://github.com/42-evey/hermes-plugins>. Relevant paths: `evey-delegate-model/__init__.py`, `evey-telemetry/__init__.py`.

## Glossary and Naming Model

- **Route size:** canonical internal capacity label: `nano | mini | core | large | max`. This is the primary user-facing router vocabulary.
- **Domain:** task context such as `coding` or `general`; domain may influence provider/model resolution but is not a route size.
- **Effort:** thinking level such as `low | medium | high`; effort is displayed separately from route size.
- **Profile:** a named mapping policy, such as default Codex mapping or an explicitly enabled Codex-specialized experiment.
- **Provider/model:** concrete resolved backend, e.g. `openai-codex/gpt-5.5`.
- **Legacy labels:** `Haiku/Sonnet/Opus`, `low/mid/high`, and `small/medium/large` may appear only in explicit `legacy_*` fields, compatibility adapters, or migration notes; they must not be the primary route vocabulary in status/explain/log output.
- User-facing output must render these as separate labeled fields, for example: `route=core`, `domain=coding`, `effort=low`, `profile=codex-default`, `model=openai-codex/gpt-5.5`.

## Implementation Context

Current implementation surfaces to account for during planning:

- Runtime extension: `pi/extensions/prompt-router.ts` owns input handling, policy application, `/router-status`, `/router-explain`, route state, and transcript routing events.
- TypeScript classifier bridge: `pi/lib/prompt-router/classifier.ts` invokes `pi/prompt-routing/classify.py` and validates schema `3.0.0`.
- Router settings: `pi/lib/prompt-router/config.ts` currently loads `router.policy` and `router.effort` from `pi/settings.json`; classifier mode is new.
- Python classifier CLI: `pi/prompt-routing/classify.py` currently supports `t2`, `lgbm`, `ensemble`, and `confgate`; invalid modes must become explicit errors, not implicit fallbacks.
- Python model wrapper: `pi/prompt-routing/router.py` loads hash-verified `models/router_v3.joblib` for T2.
- Eval scripts: `pi/prompt-routing/evaluate.py` and `pi/prompt-routing/scripts/shadow_eval.py` are currently separate paths and must be unified or clearly retired.
- Test surface: `pi/tests/prompt-router.test.ts` covers status/parse/policy behavior and must be expanded for canonical routes, classifier mode, overrides, and context continuation.
- Logs: Python classifier logs live under `pi/prompt-routing/logs/`; transcript routing events live under the configured Pi transcript path. Runtime and classifier logs are joined by prompt hash.
- Eval data: `pi/prompt-routing/data/eval_v3.jsonl` is the current labeled route-level eval set; new multi-turn continuation fixtures are required.

## Goals

1. Establish a provider-neutral internal routing vocabulary:
   ```text
   nano → mini → core → large → max
   ```
2. Make the router control plane truthful and single-sourced: classifier mode, policy settings, status/explain output, eval scripts, and logs should agree.
3. Keep OpenAI Codex as the primary provider mapping while preserving provider-neutral router internals.
4. Add a lightweight context-aware anti-downgrade rule for continuation prompts.
5. Record enough telemetry to evaluate cost, latency, safety, and quality trends over time.

### V1 Scope Priority

V1 must prioritize control-plane truthfulness and proof that routing affects the same generation turn. Context continuation is included only as a bounded, deterministic policy rule. Broad analytics, cost calibration, learned routing from logs, and automatic Codex-specialized model selection are follow-on work unless needed to validate the v1 control-plane changes.

## Non-Goals

- Do not retrain the Python classifier in the first change set.
- Do not dump full chat history into the classifier by default.
- Do not make Claude tier names user-facing except as legacy compatibility labels.
- Do not implement autonomous learned routing from logs in v1.
- Do not replace the entire router with an external proxy.

## Requirements

### Functional Requirements

#### FR1: Canonical route vocabulary

- Add canonical route sizes:
  ```ts
  type RouterSize = "nano" | "mini" | "core" | "large" | "max";
  ```
- Translate legacy classifier labels initially:
  ```text
  Haiku  → mini
  Sonnet → core
  Opus   → large
  ```
- Treat `max` as policy-only in v1.
- Keep legacy `low/mid/high` only as compatibility state if needed.

#### FR2: Codex-first provider mapping

- Add route profile resolution from canonical route/domain/effort to actual provider/model/thinking.
- Preferred default model ladder:
  ```text
  mini/core-low → gpt-5.4-mini
  core-coding   → gpt-5.5 with low effort by default
  core-general  → gpt-5.5 with low/medium effort
  large         → gpt-5.5 high, or pro only when justified
  max           → gpt-5.5 high/pro explicit escalation profile
  ```
- If Pi initially supports only two route defaults, use:
  ```text
  mini → gpt-5.4-mini
  core → gpt-5.5
  ```
- Coding-aware route resolution is a first-class concept in the PRD, but automatic specialized Codex routing must remain conservative:
  ```text
  mini non-coding → gpt-5.4-mini
  mini coding     → gpt-5.4-mini by default
  core non-coding → gpt-5.5
  core coding     → gpt-5.5[low] by default
  optional codex-specialized profile → may use gpt-5.3-codex only when explicitly enabled
  ```
- `nano` remains unavailable/future or an explicit fallback to `mini` until an actual nano-class model is configured.
- Status/explain output must show route state for every canonical route: `available`, `fallback`, `policy-only`, or `disabled`.
- Add a concrete resolver contract during planning:
  ```ts
  interface RouteProfileResolution {
    route: RouterSize;
    domain: "coding" | "general";
    effort: "low" | "medium" | "high";
    profile: string;
    provider: string;
    model: string;
    routeState: "available" | "fallback" | "policy-only" | "disabled";
    fallbackFrom?: RouterSize;
    reason: string;
  }
  ```
- Acceptance tests must cover `mini`, `core`, `large`, `max`, unavailable `nano`, coding vs non-coding defaults, and optional Codex-specialized profiles.

#### FR3: Classifier mode source of truth

- Add settings:
  ```json
  {
    "router": {
      "classifier": {
        "mode": "t2"
      }
    }
  }
  ```
- Supported modes:
  ```text
  t2 | lgbm | ensemble | confgate
  ```
- Runtime, `/router-status`, `/router-explain`, logs, and eval must show the actual mode.
- Settings and CLI must strictly validate mode values. Invalid modes must fail closed with an explicit fallback reason or error; `classify.py` must not silently treat unknown modes as `ensemble`.
- The normalized mode actually executed must be available to runtime logs, status/explain, and eval output from one shared config/validation path.

#### FR3a: Classifier wire contract

- V1 Python classifier output remains schema `3.0.0` unless a separate schema migration is explicitly planned.
- Python may continue emitting legacy `primary.model_tier` labels (`Haiku | Sonnet | Opus`) in v1, but TypeScript must own the legacy-to-canonical adapter at a named boundary.
- The adapter must map candidates and primary route into canonical `RouterSize` before policy application, status/explain rendering, and runtime telemetry.
- The classifier contract must define: schema version, allowed legacy labels, allowed effort labels, candidate shape, confidence range, mode field or sidecar assertion, and failure behavior.
- Each supported mode must list required model artifacts and hash sidecars; cold-start validation must prove the intended artifact loads and hash mismatch fails closed.

#### FR4: Explainable policy result

- `/router-explain` must show:
  - classifier mode
  - raw classifier route in canonical vocabulary
  - applied route in canonical vocabulary
  - confidence and top candidates
  - policy rule fired
  - context capsule flags when available
  - resolved provider/model/thinking
  - one-line operator summary: what route was chosen, why, what changed from classifier, and how to override or clear it
  - route state for unavailable/fallback/policy-only routes
- Planning must include example explain/status output for: normal classifier route, context continuation hold, unavailable fallback, policy-only `max`, and manual pin.

#### FR5: Context continuation capsule

- Add minimal capsule:
  ```ts
  interface RoutingContextCapsule {
    isContinuation: boolean;
    dependencyOnPriorContext: number;
    lastEffectiveSize: RouterSize | null;
    unresolvedTask: boolean;
  }
  ```
- V1 detector should be deterministic and cheap.
- Candidate continuation phrases:
  ```text
  do that, option 2, continue, resume, patch it, fix it,
  same, previous, above, now implement, go ahead, make the changes
  ```

#### FR6: Context-aware anti-downgrade

- Add policy rule:
  ```text
  context-continuation-hold
  ```
- If the prompt is a continuation and raw route is below the previous effective route, hold previous route unless user explicitly asks for cheap/fast/brief behavior.
- V1 hold must be bounded to one turn unless a later plan defines a stronger unresolved-task state machine.
- The cheap/fast/brief override vocabulary must be explicit and logged as `downgrade_intent_detected` when it bypasses the hold.

#### FR7: User override safety

- Explicit user-selected model/route pins must override automatic routing until cleared, except hard safety floors may still warn or prevent unsafe downgrades.
- Define override hierarchy before implementation: explicit model selection > route pin > temporary per-turn override > hard safety floor/provider policy > automatic policy > fallback.
- Pins must have visible scope/lifetime in `/router-status` and `/router-explain`; stale pins should be session-scoped by default or require explicit persistence.
- This avoids the Hermes-style failure where smart routing silently overrides session-scoped `/model` choice.

#### FR8: Context-window/compression safety

- A cheaper/lower route must not silently shrink session context/compression policy.
- If model context window affects compression, anchor compression decisions to the session/default route or explicitly log the change.

#### FR8a: Provider trust and fallback policy

- Route profiles must include provider trust metadata: provider allowlist membership, local/subscription/API-key class, context window, retention assumption if known, and whether cross-provider fallback is allowed.
- Cross-provider fallback must be explicitly configured; no route should silently move prompts to a different provider family.
- Status/explain/log output must show provider changes and fallback reasons.

#### FR9: Unified eval runner

- Provide one eval path that can run the same classifier mode and policy settings as runtime.
- It should report:
  - top-1 accuracy on labeled eval data
  - catastrophic under-routing
  - over-routing
  - cost-weighted quality
  - route thrash
  - policy deltas vs raw classifier
  - context-continuation rule effects on sequence fixtures
- The PRD/planning handoff must define each metric mathematically: route ordering, denominator, turn-level vs sequence-level aggregation, thresholds, and baseline comparison.
- Eval must include a mode matrix for `t2 | lgbm | ensemble | confgate`; unsupported modes must produce explicit unsupported/fallback reasons consistently across runtime, status, explain, logs, and eval.
- Eval must include named multi-turn fixtures covering continuation phrase classes, previous effective sizes `mini/core/large/max`, explicit cheap/brief override negatives, and non-continuation lookalikes.

### Non-Functional Requirements

- Routing decision overhead should remain low; deterministic context capsule should be sub-ms.
- Router failure must be non-fatal and fall back safely.
- Default logging must avoid full raw prompts. Prompt excerpts must be disabled by default or redacted by a documented scrubber; raw/excerpt logging requires explicit opt-in.
- Logs should be JSONL and append-only with owner-only permissions, rotation/size limits, corrupted-line tolerant readers, schema versioning, and a documented purge command.
- Status/explain output should use canonical route vocabulary.
- Keep implementation incremental and testable.

## Telemetry Requirements

### Per-turn routing log fields

Record by default. `prompt_excerpt` is shown below as an optional/redacted field; default-safe implementations may omit it or emit only a scrubbed excerpt.

```json
{
  "schema_version": "router-log-v1",
  "session_id": "...",
  "turn_index": 12,
  "prompt_hash": "...",
  "prompt_excerpt": "<optional redacted excerpt; omitted by default unless enabled>",
  "classifier_mode": "t2",
  "raw_route": "core",
  "raw_effort": "medium",
  "classifier_confidence": 0.72,
  "candidate_margin": 0.18,
  "candidates": [
    { "route": "mini", "effort": "low", "confidence": 0.18 },
    { "route": "core", "effort": "medium", "confidence": 0.72 }
  ],
  "previous_route": "large",
  "applied_route": "large",
  "applied_effort": "high",
  "rule_fired": "context-continuation-hold",
  "context_capsule": {
    "is_continuation": true,
    "dependency_on_prior_context": 0.91,
    "unresolved_task": true,
    "last_effective_size": "large"
  },
  "provider": "openai-codex",
  "resolved_model": "gpt-5.5",
  "resolved_profile": "gpt-5.5[high]",
  "model_switch_applied": true,
  "classifier_elapsed_ms": 12.4,
  "routing_elapsed_ms": 13.1,
  "estimated_cost": 0.0012,
  "baseline_cost": 0.0048,
  "fallback_reason": null
}
```

### Telemetry privacy and migration contract

- Prompt hash algorithm must be shared across Python and TypeScript: SHA-256 over the exact UTF-8 prompt text after the same trim/join normalization.
- Excerpt rules must define maximum length, redaction patterns for secrets/tokens/emails/paths, and opt-in setting name.
- Context capsule logging must be disableable separately from current-turn `/router-explain`.
- Runtime and classifier logs must use `schema_version` and tolerate older log shapes through a backwards parser or explicitly ignore old logs with a visible migration note.
- Logs must stay local by default, use owner-only permissions where possible, rotate at a bounded size, and support a documented purge command for privacy incidents.

### Aggregates

Track and expose via stats command or analytics script:

- requests by route
- cost by route
- savings vs baseline
- latency p50/p95/p99
- null fallback rate
- classifier failure rate
- manual override conflicts avoided
- context-continuation holds
- route upgrades/downgrades
- model-switch thrash
- catastrophic under-routing on eval fixtures
- over-routing on eval fixtures
- candidate confidence calibration buckets

## Acceptance Criteria

1. [ ] Router status and explain use canonical route vocabulary.
   - Verify: run `/router-status` and `/router-explain` after at least one routed prompt.
   - Pass: output includes `mini/core/large/max` terminology and actual classifier mode.
   - Fail: output hardcodes `confgate`, `small/medium/large`, or `Haiku/Sonnet/Opus` as primary user-facing route.

2. [ ] Classifier mode is settings-driven.
   - Verify: set `router.classifier.mode` to `t2` and `confgate`; inspect classifier invocation/log output.
   - Pass: runtime invocation matches setting.
   - Fail: TS hardcodes `--classifier t2` while status/explain claims another mode.

3. [ ] Context continuation anti-downgrade works.
   - Verify: first route a complex planning prompt to `large`, then send `do option 2`.
   - Pass: applied route remains at least previous effective route and rule is `context-continuation-hold`.
   - Fail: raw low/mini route is applied silently.

4. [ ] Explicit user route/model override is respected.
   - Verify: pin/select a high/max route, then send `hi`.
   - Pass: auto-routing does not silently downgrade until override cleared.
   - Fail: simple prompt overrides explicit user choice.

5. [ ] Unified eval reports runtime-comparable metrics.
   - Verify: run eval with current settings.
   - Pass: report includes classifier mode, policy settings, catastrophic under-routing, over-routing, cost, thrash, and context sequence results.
   - Fail: eval supports only a subset of runtime classifier modes or uses stale policy defaults.

6. [ ] Same-turn generation route is proven.
   - Verify: run a deterministic test or harness that records intended route, applied route, and actual provider/model/thinking used for the same prompt turn.
   - Pass: actual generation route equals applied route, or the plan records a required provider-architecture spike before implementation proceeds.
   - Fail: status/logs show the desired route but generation uses the previous/default model.

7. [ ] Override and provider trust behavior is explicit.
   - Verify: route pin, explicit model selection, safety floor, and cross-provider fallback fixtures.
   - Pass: status/explain/logs show active override scope, provider trust state, and fallback reason; unsafe/stale cheap pins cannot silently bypass hard safety floors.
   - Fail: automatic routing or provider fallback silently changes user intent/trust boundary.

8. [ ] Telemetry is privacy-conscious and useful.
   - Verify: inspect routing JSONL.
   - Pass: includes prompt hash, raw/applied route, rule fired, context flags, resolved model, confidence, latency, and optional redacted excerpt only when enabled.
   - Fail: logs full prompt or unredacted excerpt by default, or omits policy/applied route fields.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep current classifier-only router | Minimal work | Preserves drift and continuation under-routing | Reject |
| Full chat-history classifier input | More context | Latency, privacy, harder eval, noisy features | Reject for v1 |
| Logical Pi router provider like `pi-model-router` | Avoids late model-switch risk, clean profiles | Larger architectural change | Consider for v2 / spike |
| External proxy router | Provider-agnostic, easy model swapping | Less integrated with Pi state/status/transcript | Reject for now |
| Deterministic context capsule + policy hook | Cheap, explainable, testable | Limited semantic power | Accept for v1 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Canonical vocabulary migration breaks existing tests | Medium | Add compatibility mappers and update tests incrementally |
| Context continuation false positives over-route | Medium | Add explicit cheap/brief override and log hit rates |
| Eval still diverges from runtime | High | Load runtime settings in eval runner; print policy fingerprint |
| `max` duplicates `large` initially | Low | Treat `max` as semantic emergency/explicit escalation profile even if same model today |
| Prompt privacy in logs | High | Default to hash/excerpt and context flags only |
| Model switching applies too late for current prompt | High | Verify Pi event timing; consider logical provider architecture if needed |

## Open Questions

- Should `nano` fall back to `mini` or be marked unavailable until an actual nano model is configured?
- What exact task signal or complexity threshold, if any, should route coding work to an optional specialized `gpt-5.3-codex` profile instead of the default `gpt-5.4-mini` / `gpt-5.5[low]` lanes?
- Should `large` use `gpt-5.5` high by default and reserve pro/max-capable models only for explicit escalation?
- Should context-continuation-hold have a maximum number of turns?
- What command UX should clear route pins and explicit model overrides after the override hierarchy is implemented?
- Should the first implementation stay in the current `input` hook architecture, or include a provider-architecture spike?

## Possible Implementation Details

### Phase 1: Control-plane normalization

- Add `RouterSize` and mapping helpers in `pi/lib/prompt-router`.
- Add settings loader for `router.classifier.mode`.
- Replace hardcoded classifier label in `/router-explain`.
- Update logs and status labels to canonical route names.
- Add tests for mapping and mode truthfulness.
- Add a same-turn routing proof. If current `input` hook cannot guarantee same-turn model selection, stop Phase 1 and plan a logical provider or before-generation hook migration before behavior changes.

### Phase 2: Provider/profile mapping

- Add Codex route profile resolver:
  ```ts
  type RouteDomain = "coding" | "general";

  interface RouteProfile {
    size: RouterSize;
    domain: RouteDomain;
    provider: string;
    model: string;
    effort: "low" | "medium" | "high";
    label: string;
  }
  ```
- Start with the two-route default mapping if needed: `mini → gpt-5.4-mini`, `core → gpt-5.5`.
- Prefer coding-aware resolution when task-domain detection is reliable enough, but keep core coding defaulted to `gpt-5.5[low]`; `gpt-5.3-codex` should remain an optional specialized profile until evals justify changing the default.
- Keep provider-specific model IDs outside classifier schema.

### Phase 3: Context capsule and anti-downgrade

- Implement `buildRoutingContextCapsule(text, state, ctx)`.
- Add `context-continuation-hold` to `RuleFired`.
- Log capsule flags and policy route delta.
- Add unit tests for continuation prompts and explicit cheap/brief override.

### Phase 4: Unified eval and analytics

- Update eval to support `t2 | lgbm | ensemble | confgate`.
- Add runtime-policy replay with current settings.
- Add multi-turn sequence fixtures for continuation prompts.
- Add metric definitions, baseline comparison, mode matrix, sequence fixtures, and a metrics summary command or script.

### Phase 5: Provider architecture spike

- Inspect whether a logical `router/*` provider would guarantee routing applies before generation better than the current `input` hook.
- If beneficial, write a separate migration plan.

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/prompt-router-roadmap/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/prompt-router-roadmap/PRD.md
  ```
- Notes for planner:
  - Start with control-plane truthfulness before behavior changes.
  - Keep the first context-aware feature deterministic and policy-only.
  - Do not retrain classifier until eval and telemetry are unified.
