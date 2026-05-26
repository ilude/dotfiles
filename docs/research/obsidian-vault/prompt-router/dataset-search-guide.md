# Dataset Search Guide

## What to look for

Prioritize datasets with outcome or preference signal. Prompt volume alone is
not enough.

High-value properties:

- Prompt plus multiple model responses.
- Human preference or benchmark preference labels.
- Cost and quality tradeoff labels.
- Agent trajectories with success or failure.
- Tool-use traces with final outcome.
- Code repair tasks with test results.
- Model identity plus user selection or preference.
- Clear source attribution and license metadata.

## Useful search terms

- `LLM routing preference dataset`
- `model routing benchmark cost quality dataset`
- `LLM cascade routing dataset`
- `agent traces tool use success dataset`
- `SWE agent trajectories test results`
- `code repair preference dataset`
- `human preference model routing dataset`
- `prompt complexity classifier dataset`

## Lower-value datasets

Avoid treating these as primary training sources:

- Generic instruction-only corpora with no outcome labels.
- Raw chat logs with no correction or success signal.
- Complexity-only labels that do not map to cheapest acceptable route.
- Datasets without usable license metadata.

## Current source decisions

| Source | Decision | Reason |
| --- | --- | --- |
| `routellm/gpt4_dataset` | keep exploring | Best external source so far. |
| `CARROT-LLM-Routing/SPROUT` | exclude from auto-training | Increased catastrophic under-routing. |
| `smolagents/codeagent-traces` | review-only | Zero auto-accepted rows with current normalizer. |
| NVIDIA complexity model | evaluate as utility | Could improve triage, not ground truth. |

## Research note

The best long-term data may come from local workflow telemetry and reviewed user
override cases, because those directly reflect Pi's actual routing target.
