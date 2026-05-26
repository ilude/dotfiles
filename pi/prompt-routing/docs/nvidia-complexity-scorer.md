# NVIDIA Complexity Scorer Evaluation

## Summary

The NVIDIA prompt task and complexity classifier was identified during dataset
research, but it is not currently used by the prompt-router curation or
retraining workflow.

Model reference:

```text
https://huggingface.co/nvidia/prompt-task-and-complexity-classifier
```

Earlier research classified it as a utility model, not a training dataset. It
can score prompts from other corpora, but it does not directly provide the
prompt router target label: cheapest acceptable `(model_tier, effort)`.

## Current Status

Not integrated.

The first curation MVP explicitly deferred NVIDIA and other external complexity
classifier integration. The implemented workflow currently uses:

- Current local ConfGate router output as a weak label.
- Deterministic prompt and trace features.
- Fixed safety/cost gates for sandbox retraining.
- Manual or local review to populate `accepted_route`.

## What the NVIDIA Model May Add

The model card describes task and complexity dimensions such as:

```text
complexity = 0.35*creativity + 0.25*reasoning + 0.15*constraint
           + 0.15*domain_knowledge + 0.05*contextual_knowledge
           + 0.05*fewshots
```

Those dimensions may help with:

- Finding short prompts that are actually hard.
- Filtering long prompts that are easy.
- Identifying high-reasoning or high-domain-knowledge rows.
- Creating better route-balanced review queues.
- Measuring disagreement between ConfGate and external complexity.

## What It Cannot Solve Alone

The prompt router does not route on generic complexity alone. Its target is the
cheapest acceptable route for Pi work:

```text
(model_tier, effort)
```

A generic complexity score does not know:

- The user's explicit effort override.
- Whether a cheaper model would be acceptable.
- Whether the task requires tools, file edits, tests, or repair loops.
- Whether a high-complexity prompt is still low effort because the user wants a
  quick answer.
- Whether a simple-looking prompt has high local repo risk.

Therefore the NVIDIA score should be used as a weak signal or triage feature,
not as ground truth.

## Recommended Evaluation

Run a bounded experiment before using it in training.

### Inputs

Use existing ignored experiment rows:

- Passing routellm 250-row ablation.
- Failed routellm 1k run.
- Reviewed 60-row route-balanced subset.
- `needs_review` rows where ConfGate was low confidence or risk flagged.

### Outputs

Write scores under an ignored experiment directory, for example:

```text
pi/prompt-routing/experiments/retraining/nvidia-complexity-eval-<timestamp>/
```

### Metrics

Evaluate whether NVIDIA scores improve triage, not model quality directly:

- Distribution of scores by proposed route.
- Score separation between accepted and `needs_review` rows.
- Score separation between passing 250-row routellm and failing 1k routellm
  rows.
- Whether catastrophic-regression rows have distinctive scores.
- Agreement/disagreement with ConfGate confidence and route.
- Review yield: how many high-score disagreement rows become accepted after
  review.

### Decision Rule

Integrate NVIDIA only if it improves at least one concrete workflow step:

- Better selection of rows for manual review.
- Better rejection of weak-label false positives.
- Better route balance.
- Better detection of under-routing risk.

Do not integrate it if it merely correlates with prompt length or reproduces the
same route skew as ConfGate.

## Proposed Integration Shape

If the evaluation is positive, add fields to curation rows such as:

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

Then update triage rules to use it only for review prioritization, for example:

- High NVIDIA complexity plus low ConfGate route -> `needs_review`.
- Low NVIDIA complexity plus high ConfGate route -> possible over-routing review.
- High disagreement -> priority review packet.

## Recommendation

Evaluate NVIDIA before production promotion. It may help explain why bulk
routellm weak-label training failed at 1k rows while a smaller reviewed balanced
subset passed. It should not block preserving the current reviewed subset, but
it should be considered before expanding the subset or replacing production
artifacts.
