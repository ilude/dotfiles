---
reviewer: typescript-pro
persona: TypeScript runtime contract reviewer
artifact_type: prd-readiness-review
status: complete
created: 2026-05-07
---

# PRD Readiness Review: TypeScript Runtime Contract

## Finding 1

severity: high

evidence: PRD requires `router.classifier.mode` with `t2 | lgbm | ensemble | confgate`, but current TS `classifyWithV3` hardcodes `--classifier t2`, while `/router-explain` hardcodes `Classifier: confgate`. `loadRouterPolicy` only reads `router.policy` and `router.effort`; there is no typed settings contract for classifier mode.

required_fix: Add an explicit config schema/interface for `router.classifier.mode`, validation/defaulting, and pass the validated mode through `classifyWithV3`. Require status, explain, logs, and eval to consume the same exported config object, not duplicate strings.

## Finding 2

severity: high

evidence: Vocabulary migration is under-specified for the full TS surface. Current runtime has `Tier = "low" | "mid" | "high"`, `RuntimeModelSize = "small" | "medium" | "large"`, `MODEL_TIER_TO_SIZE` mapping `Haiku/Sonnet/Opus`, and router-stats normalizes low/mid/high and small/medium/large. PRD says keep legacy only as compatibility state “if needed,” but does not define boundary types or deprecation rules.

required_fix: Define canonical internal types plus named legacy adapter functions and exact allowed legacy inputs. Acceptance criteria must require no user-facing/status/log primary fields use low/mid/high, small/medium/large, or Haiku/Sonnet/Opus except explicit `legacy_*` fields.

## Finding 3

severity: high

evidence: PRD acknowledges “Model switching applies too late” as a risk, but its acceptance criteria assume an `input`-hook route affects the same prompt. Current code deliberately fire-and-forgets `classifyAndRoute(...)` and immediately returns `{ action: "continue" }`, so `pi.setModel` can race generation. The context anti-downgrade test could pass explain/logging while not affecting the actual request.

required_fix: Make event timing a gating requirement. Specify whether routing must block the input hook, use a before-generation hook, or move to a logical provider. Add an acceptance criterion proving the resolved model/thinking used for generation equals the applied route for that same turn.

## Finding 4

severity: medium

evidence: Telemetry schema mixes old and new contracts without a migration plan. PRD log example uses snake_case canonical fields (`raw_route`, `applied_route`, `classifier_mode`, `context_capsule.last_effective_size`), while current runtime emits `raw_classifier_output`, `applied_route: "mid:medium"`, and `selected_model_size: "medium"`; router-stats reads the Python log and normalizes `primary.model_size`, `tier`, or `raw_pred`.

required_fix: Define `router-log-v1` as a versioned TypeScript interface and require all emitters/readers to update together. Include backwards-compatible parsers for existing logs or explicitly state old logs are ignored after migration.

## Finding 5

severity: medium

evidence: Provider/profile mapping is not implementation-ready. PRD introduces `RouteProfile` and Codex ladders, but current TS resolves dynamic models by `small/medium/large` via `resolveDynamicModelFromRegistry(..., "same-family")`, skips some providers, and applies a Codex-specific GPT-5.5 effort bias after model resolution. It does not define how unavailable `nano/max`, domain, effort aliases, or manual `/model` pins interact with registry resolution.

required_fix: Add a concrete `resolveRouteProfile(input): RouteProfileResolution` contract covering unavailable/fallback routes, provider/model/effort aliases, domain defaults, and manual override precedence. Acceptance criteria should assert exact profile resolution examples for mini, core, large, max, unavailable nano, and pinned model cases.
