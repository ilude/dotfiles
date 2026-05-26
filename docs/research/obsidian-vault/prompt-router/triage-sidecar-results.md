# Triage Sidecar Results

## Summary

Parallel sidecar experiments tested whether external or auxiliary signals can
improve prompt-router curation before production promotion.

Result: sidecars are useful for review prioritization, not automatic labeling.

## NVIDIA Complexity Scorer

Output:

```text
pi/prompt-routing/experiments/retraining/sidecar-nvidia-20260526211726
```

Actual scoring ran on a 10-row CPU smoke sample. The standard Hugging Face
`AutoModelForSequenceClassification` path did not work because the model config
lacks `model_type`, but the model-card custom PyTorch class worked.

Observed CPU latency:

```text
19320.95 ms/prompt
```

Conclusion:

- Do not use NVIDIA in runtime routing.
- It may be viable as an offline GPU batch sidecar.
- Next useful NVIDIA experiment is a GPU batch over all candidate rows.
- Use it only for triage and disagreement analysis, not `accepted_route`.

## Embedding kNN Sidecar

Output:

```text
pi/prompt-routing/experiments/retraining/sidecar-knn-20260526T211742Z
```

Method:

- `sentence-transformers/all-MiniLM-L6-v2`
- Anchors: `eval_v3.jsonl` plus reviewed accepted subset
- Candidate sets: routellm 250 ablation and routellm 1k run

Agreement with candidate route:

| Candidate set | Rows | Agreement |
| --- | ---: | ---: |
| routellm 250 ablation | 166 | 54.8% |
| routellm 1k run | 648 | 35.6% |

Most matches were low similarity:

- 250 ablation: 35 rows below 0.30, 60 rows from 0.30 to 0.45.
- 1k run: 223 rows below 0.30, 312 rows from 0.30 to 0.45.

Conclusion:

- Do not use kNN as an automatic labeler yet.
- Use it as a risk signal for low-similarity rows and route disagreements.
- Improve anchor coverage before trusting nearest-neighbor routing.

## Deterministic Taxonomy Sidecar

Output:

```text
pi/prompt-routing/experiments/retraining/sidecar-taxonomy-20260526T211759Z
```

Method: deterministic regex and feature taxonomy.

Total rows classified: 1,637.

Top categories:

| Category | Count |
| --- | ---: |
| other | 656 |
| factual | 301 |
| architecture | 285 |
| docs_writing | 160 |
| security | 83 |
| code_edit | 78 |
| debugging | 45 |
| workflow_tooling | 29 |

Review/failure-like rates using `needs_review`:

| Category | Review rate |
| --- | ---: |
| architecture | 99.3% |
| security | 92.8% |
| debugging | 53.3% |
| code_edit | 37.2% |
| docs_writing | 21.9% |
| factual | 24.6% |

Conclusion:

- Architecture and security categories are strong review-priority signals.
- The result is source-confounded because smolagents dominates architecture
  needs-review rows.
- Taxonomy is useful for queue shaping and reporting, not final labels.

## Reviewability Analysis

Output:

```text
pi/prompt-routing/experiments/retraining/reviewability-analysis-20260526T211835Z.md
```

CARROT/SPROUT:

- Has reviewable subsets.
- Best filters: `needs_review`, `low_confidence`, prompt length <= 1500,
  routes `mini|none`, `mini|low`, `core|low`, `core|medium`.
- Do not bulk-accept.

Smolagents:

- Not reviewable as-is.
- Full trace wrapper dominates features.
- Needs preprocessing to extract clean user task before review.

## Decision

Add sidecars as review-priority signals only:

- NVIDIA: offline GPU candidate, not runtime.
- kNN: disagreement and low-similarity risk signal.
- Taxonomy: review queue grouping and source diagnostics.
- CARROT: manual review candidate after filtering.
- Smolagents: defer until task extraction improves.
