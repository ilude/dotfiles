# Router v3 Classifier Output Contract

Status: T7 artifact. Locks the production classifier output shape so
downstream router implementation can be written against a stable
interface without re-opening the data-design question.

---

## 1. Scope

This contract describes what the **trained v3 classifier** emits per
prompt at serve time. It is the interface the router runtime will
consume. Training and evaluation of that classifier are out of scope
for this plan; see `corpus-readiness-report.md` for the go/no-go on
corpus readiness.

The contract is forward compatible with the v3 corpus schema in
`corpus-v3-schema.md`: every label the classifier is trained on is
expressible in this output, and every runtime-consumed field maps back
to a column in `train_v3.jsonl`.

---

## 2. Output object

One JSON object per classification call. All fields use camelCase
except nested route objects which keep the `model_tier` / `effort`
snake_case to match the corpus schema.

### 2.1 Fields

| Field              | Required | Type             | Description |
|--------------------|----------|------------------|-------------|
| `primary_route`    | yes      | `Route`          | The cheapest route the classifier believes is acceptable for this prompt. This is what the router should try first. |
| `fallback_route`   | yes      | `Route`          | A strictly more expensive route the router should escalate to if the primary route's answer fails a quality check or the caller requests retry-up. Must satisfy `route_cost(fallback_route) > route_cost(primary_route)`. |
| `confidence`       | yes      | number (0..1)    | Model-calibrated probability that `primary_route` is actually the cheapest acceptable route for this prompt. Consumers MAY treat confidence below a policy threshold (e.g. 0.55) as an automatic escalation to `fallback_route`. |
| `reason`           | no       | string           | Short human-readable explanation of the route choice. For observability only; never parsed by the runtime. |
| `ambiguity_flag`   | no       | enum             | One of `clear` / `borderline` / `ambiguous`. Mirrors the corpus `ambiguity` field. When `ambiguous`, the router SHOULD bias toward `fallback_route` per the v3 rubric (ambiguous rows bias up, not down). |
| `predicted_domain` | no       | string           | Echo of the classifier's best-guess `domain` tag. Observability only; the runtime does not dispatch on this. |
| `model_version`    | no       | string           | SHA of the classifier artifact that produced this output. Required in production; optional in contract-schema terms because offline tools may omit it. |

### 2.2 `Route` shape

```json
{
  "model_tier": "Haiku|Sonnet|Opus",
  "effort": "none|low|medium|high"
}
```

Ordering: `Haiku < Sonnet < Opus` and `none < low < medium < high`. Cost
is monotone in both dimensions (see `corpus-v3-schema.md` section 1).

---

## 3. Full example

```json
{
  "primary_route": {
    "model_tier": "Sonnet",
    "effort": "medium"
  },
  "fallback_route": {
    "model_tier": "Opus",
    "effort": "high"
  },
  "confidence": 0.82,
  "reason": "Multi-file refactor with moderate ambiguity; Sonnet+medium is the cheapest route whose training-distribution neighbors were marked acceptable.",
  "ambiguity_flag": "borderline",
  "predicted_domain": "typescript",
  "model_version": "sha256:3f1c9b2d4e5f67a8b9c0d1e2f3a4b5c6"
}
```

A minimal example (only required fields):

```json
{
  "primary_route": {"model_tier": "Haiku", "effort": "low"},
  "fallback_route": {"model_tier": "Sonnet", "effort": "medium"},
  "confidence": 0.94
}
```

---

## 4. Runtime semantics

- The router MUST dispatch the first attempt to `primary_route`.
- The router MAY escalate to `fallback_route` when (a) `confidence` is
  below a policy threshold, (b) `ambiguity_flag == "ambiguous"`, or
  (c) a downstream quality check rejects the primary-route answer.
- The router MUST NOT downgrade below `primary_route`. The classifier
  already chose the cheapest acceptable option; cheaper than that is a
  policy violation equivalent to catastrophic under-routing per
  `eval-v3-metrics.md` section 2.2.
- `reason`, `predicted_domain`, and `model_version` are observability
  signals. They are emitted to logs/metrics and MUST NOT drive
  dispatch logic.

---

## 5. Versioning

This is v3 of the classifier output contract. Breaking changes
(renaming a required field, tightening an enum, changing `confidence`
semantics) require bumping the contract major version and coordinating
with the router runtime. Additive changes (new optional fields, new
observability-only fields) do not require a version bump but SHOULD be
announced in the corresponding `corpus-readiness-report.md` revision.
