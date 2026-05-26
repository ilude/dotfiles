# NVIDIA Complexity Scorer

## Status

Smoke-tested, not integrated.

The model `nvidia/prompt-task-and-complexity-classifier` was identified during
research but deferred during the curation MVP. A later smoke test showed the
model-card custom PyTorch class can score prompts, but CPU latency was about
19 seconds per prompt. It should be treated as an offline GPU batch sidecar, not
runtime routing logic.

## Why it might help

The current curation workflow uses ConfGate as its weak labeler. That can
reinforce current model bias. An independent complexity scorer may help detect
rows where ConfGate is overconfident or underestimates difficulty.

Potential uses:

- Prioritize manual review.
- Detect short hard prompts.
- Detect long easy prompts.
- Improve route-balanced sampling.
- Identify disagreement between ConfGate and external complexity.
- Explain why routellm bulk weak-label training failed at 1k rows.

## Why it is not ground truth

The router target is cheapest acceptable `(model_tier, effort)`, not generic
complexity. A prompt can be complex but still not require high effort in a given
workflow, or simple-looking but locally risky.

The NVIDIA score should not directly populate `accepted_route`.

## Evaluation plan

Inputs:

- Passing routellm 250-row ablation.
- Failed routellm 1k run.
- Reviewed 60-row route-balanced subset.
- Needs-review rows from routellm and smolagents.

Measure:

- Score distribution by route.
- Score distribution by status.
- Agreement with ConfGate confidence.
- Disagreement cases that become accepted after review.
- Whether high NVIDIA complexity predicts catastrophic-regression candidates.
- Whether NVIDIA score helps choose better route-balanced subsets.

Decision rule:

- Integrate if it improves review prioritization or reduces false auto-accepts.
- Do not integrate if it only tracks prompt length or reproduces ConfGate route
  skew.

## Possible integration fields

```json
{
  "external_complexity": {
    "classifier": "nvidia/prompt-task-and-complexity-classifier",
    "scores": {
      "creativity": 0.0,
      "reasoning": 0.0,
      "constraint": 0.0,
      "domain_knowledge": 0.0,
      "contextual_knowledge": 0.0,
      "fewshots": 0.0,
      "complexity": 0.0
    },
    "used_for_ground_truth": false
  }
}
```

## Recommendation

Do not use it in runtime routing. If GPU access is available, run a full offline
batch over existing routellm 250, routellm 1k, reviewed subset, and needs-review
rows. Integrate it only if it improves review prioritization or false
AutoAccept detection. It should not replace reviewed route labels.
