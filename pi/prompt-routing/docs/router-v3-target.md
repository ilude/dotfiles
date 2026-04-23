# Router v3 Classifier Prediction Target

Status: T1 artifact (Wave 1). Locks the production prediction target for
the cost-first Pi prompt router. Consumed by T2 (training/evaluation),
T4 (TypeScript integration), and V1/V2 gates.

Terms in this doc use the plan glossary: "catastrophic under-routing",
"cheapest acceptable route", "over-routing", "temporary escalation",
and "HIGH->LOW inversion" (legacy proxy only).

---

## 1. What the classifier predicts

Per user prompt, the trained v3 classifier emits exactly one JSON object
per `classify.py` invocation (single-line, newline-terminated). The
object carries three load-bearing fields plus a schema version:

- `primary`: the `{model_tier, effort}` route the classifier believes
  is the **cheapest acceptable route** for the prompt. This is the
  training label and the router's first-attempt dispatch target.
- `candidates`: an array of `{model_tier, effort, confidence}` route
  entries ordered by ascending cost. Each entry carries a calibrated
  marginal probability that the route is acceptable. The router uses
  this list for uncertainty fallback, temporary escalation candidate
  selection, and `/router-explain` output.
- `confidence`: a calibrated scalar in `[0.0, 1.0]` giving the
  probability that `primary` is actually the cheapest acceptable
  route (top-1 calibrated confidence). Consumers may treat
  `confidence < UNCERTAIN_THRESHOLD` as an automatic bias toward a
  costlier candidate per the T3 policy spec.

The frozen wire schema is `pi/prompt-routing/docs/router-v3-output.schema.json`.
`primary`, `candidates`, `confidence`, and `schema_version` are
required top-level fields. Additive optional fields (`reason`,
`ambiguity_flag`, `predicted_domain`, `model_version`) are allowed for
observability but MUST NOT drive dispatch.

### 1.1 Wire format

One JSON object per `classify.py` invocation, serialized as a single
line (no embedded newlines in the object), terminated with a trailing
`\n`. The TypeScript router parses stdout with `JSON.parse` after
trimming the trailing newline; on parse failure or `schema_version`
mismatch the router falls back to the currently applied route and logs
the failure (T4 acceptance 1a).

Example:

```
{"schema_version":"3.0.0","primary":{"model_tier":"Sonnet","effort":"medium"},"candidates":[{"model_tier":"Haiku","effort":"low","confidence":0.08},{"model_tier":"Sonnet","effort":"medium","confidence":0.82},{"model_tier":"Opus","effort":"high","confidence":0.10}],"confidence":0.82}
```

---

## 2. Label space and ordinal cost ordering

The label space is the cross-product of the two ordinal tiers defined
in `corpus-v3-schema.md` section 1:

- `model_tier`: `Haiku < Sonnet < Opus`
- `effort`: `none < low < medium < high`

Cost is monotone in both dimensions. Define the ordinal cost of a
route as the lexicographic pair `(model_tier_rank, effort_rank)` with
the model tier taking precedence (promoting model tier is strictly
more expensive than raising effort within a tier). This matches the
cost ordering used by the corpus rubric and the shadow-eval harness
in T4.5.

Full ordinal ordering (cheapest first):

```
(Haiku,  none)  < (Haiku,  low)  < (Haiku,  medium)  < (Haiku,  high)
< (Sonnet, none) < (Sonnet, low) < (Sonnet, medium) < (Sonnet, high)
< (Opus,   none) < (Opus,   low) < (Opus,   medium) < (Opus,   high)
```

The classifier's training target is the `cheapest_acceptable_route`
column in `train_v3.jsonl`; no other route is treated as correct for
top-1 accounting.

---

## 3. Safety constraint: catastrophic under-routing

**Definition (operational, from the v3 data plan B4).** A prediction
is catastrophic under-routing when BOTH conditions hold:

1. Ground-truth cheapest acceptable route has `model_tier in {Sonnet, Opus}`.
2. Predicted route has `pred_tier == Haiku` AND `pred_effort <= medium`.

In plain terms: the classifier recommended a cheap small-model route
with no more than medium effort for a prompt whose ground truth
demanded at least Sonnet. This is the v3 replacement for the legacy
`HIGH->LOW inversion` metric; the legacy term is a migration-era proxy
only and is not the primary safety signal.

**Tolerance.** Zero on the eval split (`eval_v3.jsonl`, n=564). Any
catastrophic under-routing count > 0 on eval blocks promotion to
production (V2 gate in the effort-routing plan).

Rationale: a catastrophic under-route silently ships a wrong answer
on a hard prompt. Every other kind of miss (over-routing, adjacent
effort confusion within a tier) trades cost for safety; catastrophic
under-routing trades safety for cost, which is the single thing the
router must not do.

---

## 4. Cost constraint: over-routing

**Definition.** A prediction is over-routing when the predicted route
is strictly costlier than the ground-truth cheapest acceptable route
under the ordinal ordering in section 2. Over-routing is correct on
safety (the answer will be acceptable) but wasteful on cost.

**Tolerance.** Non-zero. Over-routing is tracked as a cost metric,
not a hard gate. The shadow-eval gate in T4.5 enforces that the v3
router's projected cost is `<=` the legacy router's projected cost on
historical traffic; beyond that, over-routing is optimized against
but not gated.

Rationale: the plan's explicit intent is reduced subscription and
rate-limit pressure. Over-routing directly measures the cost side of
the trade-off; catastrophic under-routing guards the safety side.
Both must be tracked together.

---

## 5. HIGH_FLOOR_THRESHOLD disposition

**Decision: (b) subsumed by the catastrophic-under-routing constraint.**

The legacy `HIGH_FLOOR_THRESHOLD = 0.20` was a margin-safety rule in
the v2 classifier: when the softmax margin between the top-1 tier
(Haiku) and the next tier (Sonnet) was less than 0.20, promote to
Sonnet. Its purpose was preventing HIGH->LOW inversions on borderline
prompts. The v2 label space was `{low, mid, high}`; the rule operated
over that coarse axis only.

Under the v3 label space this threshold loses its original footing
for three reasons:

1. The axis changed. v2 thresholded a three-way model-only margin.
   v3 predicts a joint `(model_tier, effort)` cell over 12 cells, so
   a single scalar margin on model tier no longer expresses the
   borderline-route-pair decision the threshold was meant to protect.
2. The safety metric changed. v2 used `HIGH->LOW inversion` as its
   primary safety signal. v3 uses `catastrophic under-routing` as
   defined in section 3, which is strictly stronger: it pins the
   exact failure mode (`gt_tier in {Sonnet, Opus}` AND `pred_tier ==
   Haiku` AND `pred_effort <= medium`) and demands zero on eval.
   A 0.20 softmax margin on Haiku-vs-Sonnet is a proxy for this
   failure mode, whereas the catastrophic-under-routing definition
   IS the failure mode.
3. The corpus-readiness work (readiness report section 5, gap 2)
   already found that the residual catastrophic rows are the hard
   "looks simple, actually isn't" cases where pushing the margin
   higher trades Haiku recall below the 0.6 bar. The margin knob is
   not the right tool; a richer prompt representation is.

**Consequence for production.** The production classifier does not
carry a separate `HIGH_FLOOR_THRESHOLD` hyperparameter. The zero-
tolerance catastrophic-under-routing gate in section 3 does the job,
and the TypeScript router's `UNCERTAIN_THRESHOLD` (T3, default 0.55)
provides the runtime safety bias for low-confidence predictions. The
T2 training code SHOULD NOT reintroduce a margin-based post-hoc tier
bump; any safety lift beyond calibrated confidence belongs in the
router policy layer, not the classifier.

**Legacy reference.** `HIGH->LOW inversion` remains tracked as a
legacy migration-era proxy in the shadow-eval harness (T4.5) so the
v3 rollout can be compared against historical v2 behavior on the same
log stream. It is not a primary metric and must not appear in new
router code as a dispatch signal.

---

## 6. Production promotion gates

From `corpus-readiness-report.md` section 3, the production classifier
(trained in T2, evaluated on `eval_v3.jsonl` n=564) must beat the
TF-IDF + LR readiness baseline AND clear the production bars below:

| Gate                            | Baseline (TF-IDF) | Production bar  |
|---------------------------------|-------------------|-----------------|
| top-1 cheapest-route accuracy   | 0.5745            | >= 0.75         |
| catastrophic under-routing      | 14                | == 0            |
| per-tier recall (min across 3)  | 0.7293            | >= 0.6 (cleared)|

Interpretation:

- `top-1 cheapest-route accuracy` is the fraction of eval rows where
  `predicted primary == ground-truth cheapest_acceptable_route` under
  exact `(model_tier, effort)` match.
- `catastrophic under-routing` is the raw count on eval per the
  section 3 definition. Zero is a hard gate.
- `per-tier recall` is the minimum across the three model tiers and
  is already PASS on the baseline; the production classifier must
  not regress below 0.6 on any tier.

A trained classifier that scores `<= 0.5745` top-1 or `>= 14`
catastrophic on the eval split has not learned anything the TF-IDF
baseline could not and MUST NOT be promoted. The V2 gate in the
effort-routing plan re-validates these bars against the production
classifier, not against the readiness baseline.

---

## 7. Relationship to the legacy output contract

`router-v3-output-contract.md` is an earlier T7 draft that used a
`primary_route` / `fallback_route` shape with a single scalar
`confidence`. This document supersedes the dispatch-relevant parts of
that contract: the frozen wire shape is the one in
`router-v3-output.schema.json` with `primary`, `candidates[]`, and
`confidence`. The runtime-semantics paragraphs of the older contract
(MUST dispatch primary first, MUST NOT downgrade below primary, etc.)
carry forward unchanged with `primary` replacing `primary_route`; the
fallback semantics are now expressed through the `candidates[]` list
and the T3 router policy rather than a single `fallback_route` field.

---

## 8. Non-goals

- No per-token cost model. Cost is ordinal over the 12-cell route
  grid; dollar/rate-limit accounting lives in the shadow-eval harness
  (T4.5), not in the classifier target.
- No learned policy for temporary escalation. The classifier emits a
  static per-prompt recommendation; runtime escalation is owned by
  the T3 router policy with explicit thresholds.
- No HIGH_FLOOR_THRESHOLD-style margin knob in the classifier. See
  section 5.
- No online retraining. The classifier is a frozen artifact keyed by
  `model_version`; retraining is a separate offline step.
