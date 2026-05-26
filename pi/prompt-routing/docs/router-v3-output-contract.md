# Router v3 Classifier Output Contract

Status: current. Locks the production classifier output shape consumed by the
Pi prompt-router runtime.

---

## 1. Scope

This contract describes what the trained v3 classifier emits per prompt at
serve time. Training and evaluation are out of scope; see
`corpus-v3-schema.md` for labels and `router-v3-output.schema.json` for the
machine-readable schema.

---

## 2. Output object

One JSON object per classification call. The object is serialized as one line
of JSON with a trailing newline.

Required fields:

| Field            | Type      | Description |
|------------------|-----------|-------------|
| `schema_version` | string    | Semver output contract version. Current value: `3.0.0`. |
| `primary`        | `Route`   | Cheapest acceptable route predicted for the prompt. |
| `candidates`     | `Route[]` | Candidate routes with confidence values. Must include `primary`. |
| `confidence`     | number    | Calibrated probability for `primary`, range `0..1`. |

Optional fields:

| Field              | Type   | Description |
|--------------------|--------|-------------|
| `reason`           | string | Human-readable observability only. |
| `ambiguity_flag`   | string | `clear`, `borderline`, or `ambiguous`; observability only. |
| `predicted_domain` | string | Classifier domain guess; observability only. |
| `model_version`    | string | Classifier artifact identifier. |
| `ensemble_rule`    | string | Ensemble/confgate rule fired; observability only. |

### 2.1 Route shape

```json
{
  "model_tier": "mini|core|large",
  "effort": "none|low|medium|high"
}
```

Ordering: `mini < core < large` and `none < low < medium < high`.

### 2.2 Candidate shape

```json
{
  "model_tier": "core",
  "effort": "medium",
  "confidence": 0.72
}
```

The TypeScript runtime rejects malformed candidates, unknown route labels,
unknown effort labels, out-of-range confidence values, unknown schema versions,
and outputs where `primary` is missing from `candidates`.

---

## 3. Full example

```json
{
  "schema_version": "3.0.0",
  "primary": {
    "model_tier": "core",
    "effort": "medium"
  },
  "candidates": [
    {"model_tier": "mini", "effort": "low", "confidence": 0.12},
    {"model_tier": "core", "effort": "medium", "confidence": 0.72},
    {"model_tier": "large", "effort": "high", "confidence": 0.16}
  ],
  "confidence": 0.72,
  "reason": "Multi-file refactor with moderate ambiguity.",
  "ambiguity_flag": "borderline",
  "predicted_domain": "typescript",
  "model_version": "sha256:3f1c9b2d4e5f67a8b9c0d1e2f3a4b5c6",
  "ensemble_rule": "lgb-confident"
}
```

Minimal example:

```json
{
  "schema_version": "3.0.0",
  "primary": {"model_tier": "mini", "effort": "low"},
  "candidates": [{"model_tier": "mini", "effort": "low", "confidence": 0.94}],
  "confidence": 0.94
}
```

---

## 4. Runtime semantics

- The router dispatches the first attempt to `primary` after runtime policy
  floors and overrides are applied.
- `candidates` replaces the older `fallback_route` concept. Runtime fallback
  policy can choose from candidates or clamp upward based on context.
- The router must not use `reason`, `predicted_domain`, `model_version`, or
  `ensemble_rule` to dispatch. These fields are observability only.

---

## 5. Versioning

Breaking changes require a new `schema_version` and TypeScript runtime support.
Additive observability-only fields may remain on `3.0.0` if old runtimes can
ignore them safely.
