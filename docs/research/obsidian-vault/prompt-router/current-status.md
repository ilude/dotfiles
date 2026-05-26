# Prompt Router Current Status

## Current decision

Do not deploy production artifacts yet.

A reviewed, route-balanced routellm sandbox candidate passed all fixed gates, but
production deployment needs a dedicated promotion step that converts accepted
rows into the canonical corpus format, regenerates tracked artifacts, and runs
production validation.

## What exists now

Implemented under `pi/prompt-routing/`:

- Paginated Hugging Face curation pulls.
- Source filtering with `--source`.
- In-process ConfGate weak labeling.
- Email redaction during normalization.
- Sandboxed retraining experiments under ignored experiment directories.
- Fixed gate creation before export/evaluation.
- Promotion review queue generation preserving source, license, provenance,
  weak route, `review_decision`, and `accepted_route`.

## Best sandbox candidate

Path:

```text
pi/prompt-routing/experiments/retraining/reviewed-routellm-balanced-20260526193000
```

Inputs:

- Source: `routellm_gpt4_dataset` only.
- Reviewed rows: 60.
- CARROT/SPROUT: not used.
- smolagents: not used.
- Weak labels: hints only.
- Accepted route labels: populated in sandbox review rows.

Route balance:

| Route | Rows |
| --- | ---: |
| `core|high` | 1 |
| `core|low` | 8 |
| `core|medium` | 12 |
| `large|medium` | 2 |
| `mini|low` | 20 |
| `mini|medium` | 1 |
| `mini|none` | 16 |

Gate result:

| Metric | Baseline | Candidate | Direction |
| --- | ---: | ---: | --- |
| Top-1 accuracy | 0.592 | 0.5904 | slight drop, within gate |
| Catastrophic under-routing | 37 | 32 | improved |
| Over-routing rate | 0.2128 | 0.2112 | improved |
| Core recall | 0.74519 | 0.76923 | improved |
| Large recall | 0.84375 | 0.85 | improved |
| Mini recall | 0.78988 | 0.79767 | improved |
| Mean latency | 328.38 us | 309.34 us | improved |

## Validation evidence

Latest validation after the reviewed subset work:

- `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -q`
  - `173 passed, 6 skipped`
- `make lint-python`
  - passed
- `make test-quick`
  - `199 passed`
- Experiment scan passed.
- Production artifact status was clean for:
    - `pi/prompt-routing/data`
    - `pi/prompt-routing/models`
    - `pi/prompt-routing/model.pkl`
    - `pi/prompt-routing/model.pkl.sha256`
    - `pi/prompt-routing/test_set.pkl`

## Deployment status

No production deployment was performed.

Reason: sandbox gates passed, but production promotion requires a separate
controlled artifact update path.
