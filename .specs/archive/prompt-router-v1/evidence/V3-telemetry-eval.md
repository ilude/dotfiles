# V3 telemetry/eval validation

Date: 2026-05-11

## Result

PASS. T6 telemetry acceptance and T7 eval acceptance are covered by focused TypeScript tests, Python prompt-routing tests, canonical eval with sequence fixtures, and operator privacy/purge documentation. No archive performed.

## Commands run

| Command | CWD | Exit | Notes |
|---|---:|---:|---|
| `pnpm test prompt-router.test.ts` | `pi/tests` | 0 | Vitest: 1 file, 75 tests passed. Includes T6 privacy-conscious router telemetry serialization. |
| `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests` | repo root | 0 | Pytest: 141 passed. Includes eval sequence metrics and router logging privacy tests. |
| `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json > .specs/prompt-router-v1/evidence/V3-canonical-eval.json` | repo root | 0 | Canonical eval completed and wrote JSON evidence. Stderr reported SHA256 inventory verification. |

## Telemetry acceptance inspection

- Runtime telemetry payload uses `schema_version: router-log-v1`.
- Default payload includes `prompt_hash` and sets `prompt_excerpt` to null.
- Default payload includes canonical `raw_route`/`applied_route`, classifier mode, candidate margin/candidates, previous route, rule fired, context capsule, provider family/model/profile, latency, fallback reason, selected model size, and model-switch metadata.
- Focused test `T6: privacy-conscious router telemetry` serializes a synthetic private prompt scenario and asserts the raw prompt fields/text are absent by default while required route/policy/provider fields are present.
- Python test `test_router_logging_privacy.py` covers classifier-side logging privacy defaults and explicit prompt logging opt-in behavior.
- `pi/prompt-routing/analytics.md` documents local purge/rotation behavior: router telemetry inherits Pi transcript retention/rotation, classifier logs are local, and purge means removing relevant local trace JSONL files plus `pi/prompt-routing/logs/routing_log.jsonl` after stopping Pi.

## Eval acceptance inspection

Canonical eval output: `.specs/prompt-router-v1/evidence/V3-canonical-eval.json`.

Observed top-level metric keys include:

- `classifier`
- `runtime_settings`
- `canonical_route_order`
- `route_ordering`
- `top1_accuracy`
- `catastrophic_under_routing`
- `over_routing_rate`
- `cost_weighted_quality`
- `policy_delta`
- `policy_deltas`
- `sequence_aggregation`
- `sequence_results`
- `privacy`
- `artifact_inventory`

Observed canonical eval summary:

- top-1 accuracy: `0.8191489361702128`
- cost-weighted quality: `0.7239981501949585`
- sequence results: 6 sequences / 12 turns, 0 violations
- policy deltas: source `runtime_settings`, changed `false`

T7 mode-matrix artifacts already exist under this evidence directory from the implementation wave (`T7-eval-*.json`, `T7-eval-*.log`, `T7-eval-matrix-status.txt`) and document default/non-default classifier behavior.

## Files changed in V3 validation

New/updated by this validation pass:

- `.specs/prompt-router-v1/evidence/V3-canonical-eval.json`
- `.specs/prompt-router-v1/evidence/V3-telemetry-eval.md`
- `.specs/prompt-router-v1/plan.md` (T6 and V3 checkbox/status reconciliation)

Relevant pre-existing Wave 3 implementation changes present in the worktree:

- `pi/extensions/prompt-router.ts`
- `pi/lib/prompt-router/route-decision.ts`
- `pi/lib/prompt-router/route-profile.ts`
- `pi/prompt-routing/analytics.md`
- `pi/prompt-routing/data/context_sequences_v1.jsonl`
- `pi/prompt-routing/evaluate.py`
- `pi/prompt-routing/router.py`
- `pi/prompt-routing/scripts/shadow_eval.py`
- `pi/prompt-routing/tests/test_evaluate.py`
- `pi/prompt-routing/tests/test_router_logging_privacy.py`
- `pi/tests/prompt-router.test.ts`
- `pi/prompt-routing/docs/router-v3-eval*.json`

## Limitations / blockers

- No blockers for V3.
- Repo-wide validation, docs/handoff Wave 4, manual validation decision, deployment not-required note, and archive preflight remain pending by plan. User explicitly requested not to archive.
