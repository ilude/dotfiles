# Router v3 Metrics

Status: T1 artifact (Wave 1). Defines the metric set the production
classifier and router are scored against. Consumed by T2 (evaluation
pipeline), T4.5 (shadow-eval harness), and the V1/V2 validation gates.

Terminology follows the plan glossary: "catastrophic under-routing",
"cheapest acceptable route", "over-routing", "temporary escalation",
and "HIGH->LOW inversion" (legacy proxy only).

---

## 1. Primary metrics

These metrics gate promotion to production and are re-reported on
every eval run against `eval_v3.jsonl` (n=564).

### 1.1 Cheapest-route accuracy (top-1)

Fraction of eval rows where the classifier's `primary` field exactly
matches the ground-truth `cheapest_acceptable_route` under
`(model_tier, effort)` equality.

- Formula: `mean(pred_primary == gt_cheapest_acceptable_route)`.
- Baseline (TF-IDF + LR, readiness report): 0.5745.
- Production gate: `>= 0.75`.
- Rationale: top-1 exact match on the cheapest acceptable route is
  the single cleanest measure that the classifier is learning the
  joint `(tier, effort)` target rather than just the marginal tier.

### 1.2 Catastrophic under-routing (safety, zero-tolerance gate)

Operational definition (from the v3 data plan B4; authoritative in
`router-v3-target.md` section 3): a prediction is catastrophic
under-routing when BOTH conditions hold:

1. `gt_tier in {Sonnet, Opus}`.
2. `pred_tier == Haiku` AND `pred_effort <= medium`.

- Reporting: raw count over the eval split, plus per-tier breakdown
  (catastrophic rows where gt is Sonnet vs Opus).
- Baseline (TF-IDF + LR): 14.
- Production gate: `== 0`. Hard gate. V2 promotion blocks if any
  catastrophic prediction is produced on eval.
- Rationale: this is the failure mode the router exists to prevent.
  Shipping a cheap small-model answer for a prompt whose ground truth
  demands Sonnet or Opus silently trades correctness for cost, which
  the plan explicitly rules out.

### 1.3 Over-routing rate (cost, non-zero tolerance)

Definition: a prediction is over-routing when the predicted route is
strictly costlier than the ground-truth cheapest acceptable route
under the ordinal ordering in `router-v3-target.md` section 2.

- Formula: `mean(ordinal_cost(pred) > ordinal_cost(gt))`.
- Baseline (TF-IDF + LR): 0.2092.
- Production target: optimize downward; no hard gate. Tracked jointly
  with catastrophic under-routing so safety and cost trade-offs are
  visible on every eval.
- Rationale: over-routing directly maps to wasted cost and rate-limit
  pressure, which is the primary thing the cost-first router is
  meant to reduce. Non-zero tolerance because driving it to zero
  without harming top-1 is not feasible on the current corpus.

### 1.4 Per-tier recall

Fraction of ground-truth rows at each `model_tier` where the
classifier recovered the correct tier.

- Formula (per tier t): `P(pred_tier == t | gt_tier == t)`.
- Corpus-readiness gate (already cleared by the TF-IDF baseline):
  `>= 0.6` on every tier.
- Production regression bound: `>= 0.6` maintained on every tier.
- Rationale: guards against a classifier that games top-1 by
  collapsing to the dominant class. Readiness report section 1 shows
  baseline recalls of 0.7293 / 0.8659 / 0.9103 for Haiku / Sonnet /
  Opus respectively.

---

## 2. Cost and operational metrics

These metrics are reported on every eval but do not gate promotion on
their own. They feed the shadow-eval harness in T4.5 and the
`/router-explain` UX.

### 2.1 Cost-weighted quality

A scalar summary of the safety/cost trade-off: the cost-weighted
quality of the predicted route relative to the cheapest acceptable
route.

- Formula:
  `mean( quality(pred) / ordinal_cost(pred) * ordinal_cost(gt) )`,
  where `quality(pred) = 1` if `ordinal_cost(pred) >= ordinal_cost(gt)`
  (prediction is acceptable or over-routed) and `0` otherwise
  (prediction is insufficient, including catastrophic cases). Higher
  is better.
- Baseline (TF-IDF + LR): 0.7704.
- Rationale: compresses top-1 / over-routing / catastrophic into one
  scalar useful for tracking classifier drift across training runs.
  Not a gate; it hides the catastrophic count behind an average.

### 2.2 Rate-limit cost proxy

Projected rate-limit consumption ratio of the v3 router vs the
legacy router on historical traffic, evaluated offline in the
shadow-eval harness (T4.5) using published model pricing and the
last N days of `pi/logs/routing_log.jsonl`.

- Reporting: `projected_cost_delta` (v3 cost / legacy cost, target
  `<= 1.0`) in `pi/prompt-routing/docs/cost-shadow-eval.md`.
- Gate (T4.5): v3 projected cost `<=` legacy projected cost AND
  catastrophic delta `== 0`.
- Rationale: the plan's central claim is subscription and rate-limit
  relief. Measuring projected cost on real historical traffic before
  rollout is the only non-circular way to validate that claim; top-1
  accuracy on eval does not directly imply cost savings in
  production traffic.

### 2.3 Latency budget

Two distinct budgets, per plan constraints (B3):

- **Classifier-internal inference latency**: measured after module
  import, excluding Python startup. Budget: `< 1ms` on CPU.
  Reported as p50 / p95 / p99 over `eval_v3.jsonl`. Tracked on every
  eval; regressions beyond p95 `>= 1.0ms` require investigation.
- **End-to-end classification latency**: cold `pi.exec("python", ...)`
  invocation from TypeScript. Budget: `< 300ms` on Windows. Reported
  as p50 / p95 / p99 over the shadow-eval replay. Accepted at this
  level because the router runs fire-and-forget off the critical
  path; do not conflate with the sub-millisecond internal budget.

### 2.4 Thrash count

Number of turn-to-turn route switches the router produces on the
shadow-eval replay. Thrash is a runtime-policy concern (T3
hysteresis), not a classifier concern, but is reported here because
it shares the eval harness.

- Reporting: total switches plus switches-per-100-turns for both the
  legacy router and the v3 router on the same log stream.
- T4.5 tolerance: thrash count allowed up to the hysteresis spec in
  T3 (no free-fall from high to minimal in a single turn; minimum
  `N_HOLD = 3` turn hold after upgrade).

---

## 3. Legacy proxy metric: HIGH->LOW inversion (migration-era only)

`HIGH->LOW inversion` is the v2 safety metric: a prediction where
the legacy classifier labeled a prompt `high` but routed it to a
`low`-tier model. It is retained in this doc and in the shadow-eval
harness for exactly one reason: side-by-side comparison against the
legacy router on the same log stream during migration.

Rules:

- `HIGH->LOW inversion` is a **legacy proxy**, not a primary metric.
  It does not gate promotion. The primary safety gate is
  catastrophic under-routing (section 1.2).
- New router or classifier code MUST NOT reference `HIGH->LOW
  inversion` as a dispatch signal. The term exists only in
  shadow-eval reports and in this doc.
- When the v3 router is fully rolled out (T5 / V3), `HIGH->LOW
  inversion` tracking is expected to be deprecated. Removing it is
  out of scope for this plan.

---

## 4. Reporting surfaces

- `pi/prompt-routing/docs/eval-v3-baseline.json`: machine-readable
  baseline metrics for the TF-IDF + LR model on `eval_v3.jsonl`.
  Mirrored human-readable summary in
  `corpus-readiness-report.md` section 1.
- `pi/prompt-routing/docs/eval-v3-metrics.md`: narrative write-up
  of the metrics (this doc is the contract; that one is the long-form
  eval log).
- `pi/prompt-routing/docs/cost-shadow-eval.md` (produced in T4.5):
  cost and catastrophic-delta report comparing v3 vs legacy on
  historical traffic.
- `pi/prompt-routing/tools/eval_baseline.py`: the evaluation script
  that reports all metrics in section 1 and section 2.1.

---

## 5. Metric change policy

Adding a new observability metric (no gate change): additive, no
contract bump. Append to section 2 and update
`pi/prompt-routing/tools/eval_baseline.py`.

Changing a gate threshold, redefining catastrophic under-routing,
or promoting a legacy proxy to a primary metric: requires bumping
the `schema_version` in `router-v3-output.schema.json` if the change
forces a wire-format change, plus an amendment entry in
`corpus-readiness-report.md`.

Retiring `HIGH->LOW inversion` entirely is explicitly out of scope
for this plan; T5/V3 may retire it once v3 is fully rolled out.
