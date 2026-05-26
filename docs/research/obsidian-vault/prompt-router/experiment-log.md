# Prompt Router Experiment Log

## External source sizes

Currently wired sources:

| Dataset | Total rows | Targeted rows in current pipeline |
| --- | ---: | ---: |
| `routellm/gpt4_dataset` | 119,101 | 109,101 train rows |
| `CARROT-LLM-Routing/SPROUT` | 44,241 | 30,968 train rows |
| `smolagents/codeagent-traces` | 98,730 across configs | 32,965 default train rows |

## Multi-source scale experiments

| Run | Result | Finding |
| --- | --- | --- |
| 5/source public smoke | passed | Workflow worked end to end. |
| 25/source larger sample | passed | Small positive signal, not enough data. |
| 50/source | passed | Cleanest early multi-source signal. |
| 100/source | passed | Many review rows and classifier failures. |
| 250/source | gate_failed | Catastrophic under-routing increased. |
| 500/source before pagination | failed | Source API rejected large length request. |

Pagination was added after source API failures at larger lengths.

## Source ablation at 250 rows

| Source | Rows | Accepted | Needs review | Rejected | Result | Finding |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| routellm | 250 | 166 | 67 | 0 | passed | Best source so far. |
| CARROT/SPROUT | 250 | 151 | 88 | 1 | gate_failed | Increased catastrophic under-routing. |
| smolagents | 250 | 0 | 239 | 11 | skipped | Review-only with current normalizer. |

Routellm is the only source currently suitable for auto-training experiments.
CARROT is excluded from auto-training. Smolagents needs better trace
normalization before it can contribute training rows.

## Routellm 1k experiment

The routellm-only 1k run tested whether the promising 250-row result scaled.

| Metric | Baseline | Candidate | Result |
| --- | ---: | ---: | --- |
| Top-1 accuracy | 0.592 | 0.5856 | within gate |
| Catastrophic under-routing | 37 | 42 | failed |
| Over-routing rate | 0.2128 | 0.2064 | improved |
| Large recall | 0.84375 | 0.86875 | improved |
| Mini recall | 0.78988 | 0.77821 | regressed |
| Mean latency | 310.74 us | 477.47 us | failed |

Finding: bulk weak-label routellm training is not safe. The useful signal needs
review and route balancing.

## Reviewed route-balanced subset

A 60-row reviewed subset was built from the passing routellm 250-row ablation.
It capped `core|medium` and prioritized underrepresented routes.

| Metric | Baseline | Candidate | Result |
| --- | ---: | ---: | --- |
| Top-1 accuracy | 0.592 | 0.5904 | passed |
| Catastrophic under-routing | 37 | 32 | passed |
| Over-routing rate | 0.2128 | 0.2112 | passed |
| Core recall | 0.74519 | 0.76923 | passed |
| Large recall | 0.84375 | 0.85 | passed |
| Mini recall | 0.78988 | 0.79767 | passed |
| Mean latency | 328.38 us | 309.34 us | passed |

Finding: reviewed, route-balanced subsets are more promising than bulk weak-label
training.

## Parallel sidecar experiments

Additional parallel experiments tested NVIDIA complexity scoring, embedding kNN,
deterministic taxonomy, route-balanced subset variants, and CARROT/smolagents
reviewability.

Key results:

- NVIDIA scoring can run offline but is CPU-heavy at about 19 seconds per prompt
  in the smoke run. It is not suitable for runtime routing.
- Embedding kNN agreement was low: 54.8% on routellm 250 and 35.6% on routellm
  1k. It is useful as a disagreement signal, not a labeler.
- Deterministic taxonomy showed architecture and security rows are strongly
  review-priority, though source-confounded by smolagents traces.
- Mini-heavy route balancing failed catastrophic-under-routing gates.
- Confidence-conservative route balancing passed and is the safest variant from
  this batch.
- CARROT has reviewable subsets after filtering; smolagents needs cleaner task
  extraction before review.

See [Triage sidecar results](triage-sidecar-results.md) and
[Route-balanced subset results](route-balanced-subset-results.md).

## Working hypotheses

1. External data helps only after filtering, review, and route balancing.
2. Routellm is useful for candidate discovery, not direct bulk training.
3. CARROT may contain useful rows, but current weak-label auto-training is
   unsafe for it.
4. Smolagents traces need task-boundary extraction before they can help.
5. Local workflow telemetry and user overrides may be higher-value than external
   prompt volume.
