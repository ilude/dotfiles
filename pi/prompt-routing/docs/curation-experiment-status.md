# Prompt Router Curation Experiment Status

## Summary

The curation work has moved from workflow validation to a sandbox candidate
that can be evaluated safely. No production corpus or model artifact has been
updated.

Current decision: do not deploy yet. A reviewed, route-balanced routellm
sandbox candidate passed fixed experiment gates, but production deployment needs
a separate promotion step that converts accepted rows into the canonical corpus
format, regenerates tracked artifacts, and runs production validation.

## Implemented Workflow

The current workflow supports:

- Bounded and paginated Hugging Face dataset pulls.
- Source filtering with `--source`, including routellm-only runs.
- Prompt normalization, deterministic trace features, and email redaction.
- In-process ConfGate weak labeling to avoid per-row subprocess overhead.
- Four curation statuses:
    - `auto_accept_candidate`
    - `holdout_candidate`
    - `needs_review`
    - `reject`
- Sandboxed retraining under `pi/prompt-routing/experiments/retraining/`.
- Fixed gates in `gates.json` before export or evaluation.
- Prompt-safe reports and review packets.
- Promotion review queues that preserve source, license, provenance, weak route,
  `review_decision`, and `accepted_route`.

Generated experiment outputs are ignored by git. Production files under
`pi/prompt-routing/data`, `pi/prompt-routing/models`, `model.pkl`,
`model.pkl.sha256`, and `test_set.pkl` remained unchanged during these runs.

## Key Experiment Results

### Initial Multi-Source Runs

Small and medium multi-source runs validated the workflow but showed source
quality differences.

| Run | Rows requested | Result | Notes |
| --- | ---: | --- | --- |
| Public smoke | 5/source | passed | Workflow smoke. |
| Larger sample | 25/source | passed | Modest safety/cost signal. |
| Scale 50/source | passed | Cleanest early multi-source signal. |
| Scale 100/source | passed | Many review rows and classifier failures. |
| Scale 250/source | gate_failed | Catastrophic under-routing increased. |

### Source Ablation at 250 Rows

| Source | Accepted | Result | Interpretation |
| --- | ---: | --- | --- |
| `routellm_gpt4_dataset` | 166 | passed | Best external source so far. |
| `CARROT-LLM-Routing/SPROUT` | 151 | gate_failed | Increased catastrophic under-routing. |
| `smolagents/codeagent-traces` | 0 | skipped | Review-only with current normalizer. |

Routellm-only 250-row ablation improved top-1 accuracy, catastrophic
under-routing, over-routing, and per-tier recall. CARROT caused the combined
run's safety failure. Smolagents produced no auto-accepted rows and should not
be used for auto-training without further normalizer work.

### Routellm-Only 1k Run

The 1k routellm-only run produced 648 accepted weak candidates but failed fixed
gates.

| Metric | Baseline | Candidate | Result |
| --- | ---: | ---: | --- |
| Top-1 accuracy | 0.592 | 0.5856 | within tolerance |
| Catastrophic under-routing | 37 | 42 | failed |
| Over-routing rate | 0.2128 | 0.2064 | improved |
| Large recall | 0.84375 | 0.86875 | improved |
| Mini recall | 0.78988 | 0.77821 | regressed |
| Mean latency | 310.74 us | 477.47 us | failed |

Conclusion: routellm is useful, but bulk weak-label training is not safe.

### Reviewed Route-Balanced Routellm Subset

A 60-row reviewed subset was built from the passing routellm ablation. It capped
`core|medium` and prioritized underrepresented routes.

| Route | Rows |
| --- | ---: |
| `core|high` | 1 |
| `core|low` | 8 |
| `core|medium` | 12 |
| `large|medium` | 2 |
| `mini|low` | 20 |
| `mini|medium` | 1 |
| `mini|none` | 16 |

Sandbox evaluation using reviewed labels only passed all fixed gates.

| Metric | Baseline | Candidate | Direction |
| --- | ---: | ---: | --- |
| Top-1 accuracy | 0.592 | 0.5904 | slight drop, within gate |
| Catastrophic under-routing | 37 | 32 | improved |
| Over-routing rate | 0.2128 | 0.2112 | improved |
| Core recall | 0.74519 | 0.76923 | improved |
| Large recall | 0.84375 | 0.85 | improved |
| Mini recall | 0.78988 | 0.79767 | improved |
| Mean latency | 328.38 us | 309.34 us | improved |

Sandbox output:

```text
pi/prompt-routing/experiments/retraining/reviewed-routellm-balanced-20260526193000
```

No deployment was performed. The run is evidence that a reviewed, balanced
subset can improve the sandbox candidate, not proof that production artifacts
should be replaced immediately.

## Current Recommendation

Do not promote the sandbox candidate directly yet. The next production-facing
step should be a dedicated promotion plan that:

1. Converts the reviewed rows into the canonical production corpus format.
2. Regenerates production model artifacts in a controlled branch.
3. Runs the production validation path and artifact SHA checks.
4. Compares production candidate artifacts against the current baseline.
5. Deploys only if production gates match or exceed the sandbox evidence.

## Open Questions

- Does the 60-row reviewed subset remain beneficial after conversion into the
  canonical training corpus?
- Should the promotion subset be expanded with more reviewed `large` examples
  before production retraining?
- Can an external complexity scorer improve sampling and review prioritization?
- How should explicit user effort overrides be represented in runtime policy and
  training telemetry?
