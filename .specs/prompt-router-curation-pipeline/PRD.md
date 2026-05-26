---
created: 2026-05-26
status: draft
---

# PRD: Prompt Router Data Curation Pipeline

## Problem

The prompt router needs better training data, but prior bulk-import attempts degraded classifier quality because observed session behavior and generated labels were noisy. External coding-session and routing datasets may help, but only if they are normalized, scored, reviewed, and evaluated against fixed gates before they touch production training data.

The core problem is not lack of raw prompts. It is deciding which rows are safe and useful for the v3 target: the cheapest acceptable `(model_tier, effort)` route.

## Users / Jobs To Be Done

- Primary user: repository maintainer improving the Pi prompt router.
- Job/story: As the maintainer, I want a repeatable curation pipeline that turns existing logs and external datasets into reviewed training candidates so router quality can improve without poisoning the corpus.
- Current workaround: ad hoc research, one-off dataset inspection, and manual labels without a unified review queue or controlled A/B retrain workflow.

## Goals

1. Normalize existing and external prompt/session sources into one candidate schema.
2. Generate weak supervision signals from independent sources, including current router output, deterministic trace features, optional external classifiers, and optional rubric-based judging.
3. Prioritize human review using disagreement, uncertainty, catastrophic-risk patterns, and diversity sampling.
4. Produce accepted training rows and a separate held-out OOD eval set without directly mutating production data.
5. Prove whether curated additions improve the router by comparing against fixed baseline metrics.

## Non-Goals

- Bulk-import external labels directly into production training data.
- Replace the current classifier architecture in the first iteration.
- Add runtime network dependencies to the live router.
- Treat trace length, observed model choice, or thinking level as ground truth.
- Optimize for a generic simple/complex prompt classifier instead of Pi's route-level target.

## Requirements

### Functional Requirements

1. Source ingestion must support at least one local source and one external source in the first iteration.
   - Local source candidates: `prompt-routing/logs/routing_log.jsonl`, local session logs, or existing prompt-routing corpus files.
   - External source candidates: `championswimmer/pi-coding-sessions`, `jedisct1/agent-traces-swival`, `nebius/SWE-agent-trajectories`, `smolagents/codeagent-traces`, `nlile/misc-merged-claude-code-traces-v1`, `routellm/gpt4_dataset`, or `CARROT-LLM-Routing/SPROUT`.

2. Normalization must emit JSONL rows with a stable schema:
   - `id`
   - `source`
   - `source_license`
   - `prompt`
   - `metadata`
   - `trace_features`
   - `weak_labels`
   - `review_status`
   - `accepted_route`
   - `notes`

3. Deterministic trace features must be computed when source data permits:
   - prompt character count
   - message count
   - tool call count
   - file touch count
   - command/test count
   - error/debug loop count
   - code fence or stack trace presence
   - continuation intent flag
   - architecture/security/refactor/debug intent flags

4. Weak labeling must be explicit and auditable:
   - current router prediction and confidence
   - deterministic heuristic route candidate
   - optional external complexity score
   - optional rubric judge label
   - disagreement summary

5. Review queue generation must prioritize:
   - low current-router confidence
   - disagreement between weak labelers
   - predicted under-routing risk
   - short hard prompts
   - long easy prompts
   - underrepresented route cells
   - cluster outliers and near-duplicates

6. Human-reviewed rows must be exported separately from raw candidates:
   - accepted training candidates
   - accepted development candidates
   - held-out OOD evaluation rows
   - rejected rows with rejection reason

7. Retrain experiments must compare baseline and candidate models without modifying production artifacts until accepted.

8. Evaluation reports must include:
   - top-1 cheapest-route accuracy
   - catastrophic under-routing count
   - over-routing rate
   - per-tier recall
   - latency summary
   - shadow comparison on real routing logs when labels are available

### Non-Functional Requirements

- Pipeline scripts must be deterministic for the same inputs and configuration.
- Raw external datasets must remain outside tracked source unless explicitly approved.
- Outputs that may contain private prompts must stay in ignored local state by default.
- Accepted rows must retain source attribution and license metadata.
- The first iteration should be small enough to inspect manually.
- The live router must remain local and non-blocking if curation tools are absent.

## Acceptance Criteria

1. [ ] A normalized candidate JSONL can be produced from one local source and one external source.
   - Verify: run the ingestion command documented by the plan.
   - Pass: output rows contain `prompt`, `source`, `trace_features`, `weak_labels`, and `review_status`.
   - Fail: rows are source-specific, missing prompt text, or lack trace/label fields.

2. [ ] The curation pipeline produces a review queue sorted by disagreement and risk.
   - Verify: inspect the generated review CSV or JSONL.
   - Pass: rows include current router prediction, heuristic candidate, disagreement summary, and priority reason.
   - Fail: review order is arbitrary or priority reasons are absent.

3. [ ] Human review can produce accepted and rejected outputs without touching production training files.
   - Verify: run the review export command on a small labeled sample.
   - Pass: accepted and rejected files are written to an experiment directory only.
   - Fail: production corpus, model artifacts, or tracked training files are modified during review export.

4. [ ] Candidate retraining is evaluated against the current baseline on fixed datasets.
   - Verify: run the documented baseline and candidate eval commands.
   - Pass: report shows baseline vs candidate metrics for top-1 accuracy, catastrophic under-routing, over-routing, per-tier recall, and latency.
   - Fail: only candidate metrics are reported or eval data changes between runs.

5. [ ] A candidate data addition is rejected if safety regresses.
   - Verify: run an experiment where catastrophic under-routing increases or per-tier recall collapses.
   - Pass: the report marks the experiment as failed and does not promote artifacts.
   - Fail: the pipeline promotes artifacts based on top-1 improvement alone.

6. [ ] A candidate data addition is accepted only when predefined thresholds are met.
   - Verify: inspect experiment config and report.
   - Pass: thresholds are declared before evaluation and the report states pass/fail for each gate.
   - Fail: acceptance is decided after seeing results without recorded thresholds.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Bulk-import external labels | Fast, high volume | Repeats prior failure mode; noisy labels can poison corpus | Reject |
| Single external complexity classifier | Simple to run | Measures apparent complexity, not cheapest acceptable route | Reject as sole signal |
| Manual-only labeling | Highest label quality | Slow; poor coverage discovery | Use for final review only |
| Weak supervision plus active review | Balances scale and safety; auditable | More pipeline work | Choose for MVP |
| Preference-style labeling | Best match to cheapest acceptable route | More expensive; needs model outputs and judging | Defer until curation MVP exists |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| External data license mismatch | Accepted rows cannot be used | Store source license per row and gate exports by allowed license |
| Private prompt leakage | Sensitive data could enter tracked corpus | Keep raw and review outputs ignored by default; require explicit approval before tracking |
| Weak labels become trusted labels | Corpus quality degrades | Treat all weak labels as review signals only |
| OOD eval contamination | Metrics become misleading | Write OOD eval before retraining and never train on it |
| Over-routing appears safer but wastes cost | Cost goals regress | Track over-routing and shadow cost alongside safety |
| Class imbalance | Model collapses to dominant route cells | Stratify sampling and report per-tier recall |
| Pipeline complexity exceeds value | Maintenance burden | Start with one local and one external source only |

## Research References

### Dataset URLs Reviewed

- https://huggingface.co/datasets/championswimmer/pi-coding-sessions
- https://huggingface.co/datasets/SALT-NLP/SWE-chat
- https://huggingface.co/datasets/jedisct1/agent-traces-swival
- https://huggingface.co/datasets/nebius/SWE-agent-trajectories
- https://huggingface.co/datasets/smolagents/codeagent-traces
- https://huggingface.co/datasets/nlile/misc-merged-claude-code-traces-v1
- https://huggingface.co/datasets/routellm/gpt4_dataset
- https://huggingface.co/datasets/CARROT-LLM-Routing/SPROUT
- https://huggingface.co/datasets/DevQuasar/llm_router_dataset-synth
- https://huggingface.co/datasets/SoftAge-AI/simple-complex-singleturn-dataset
- https://huggingface.co/datasets/tai-tai-sama/semantic-router-dataset
- https://huggingface.co/datasets/DeepNLP/Coding-Agent-Github-2025-Feb
- https://huggingface.co/datasets/PatronusAI/TRAIL
- https://huggingface.co/datasets/lambda/hermes-agent-reasoning-traces
- https://huggingface.co/datasets/YunjueTech/Yunjue-Agent-Traces
- https://huggingface.co/models/nvidia/prompt-task-and-complexity-classifier
- https://huggingface.co/BCN001/llm-complexity-router

### Router and Curation References Reviewed

- https://github.com/lm-sys/RouteLLM
- https://www.lmsys.org/blog/2024-07-01-routellm/
- https://arxiv.org/html/2406.18665v4
- https://github.com/ulab-uiuc/LLMRouter
- https://github.com/anyscale/llm-router
- https://github.com/tumf/kani
- https://github.com/NadirRouter/NadirClaw
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://arxiv.org/abs/1711.10160
- https://arxiv.org/html/2502.11767v1

### Search Queries Used

- `site:huggingface.co/datasets coding agent traces dataset prompt router complexity`
- `site:huggingface.co/datasets SWE agent traces coding assistant conversations dataset`
- `GitHub LLM router training data prompt complexity dataset coding agent traces`
- `Hugging Face prompt complexity classifier dataset coding simple complex prompts`
- `site:huggingface.co/datasets LLM router preference data strong weak model dataset`
- `site:huggingface.co/datasets SWE-bench trajectories agent dataset fields exit_status target patch`
- `Hugging Face prompt complexity classifier model task complexity classifier alternatives`
- `GitHub prompt complexity classifier LLM routing open source`
- `LLM router data curation complexity scoring open source classifier`
- `Hugging Face task router classifier prompt intent complexity model`
- `LLM router training data curation weak supervision active learning preference labeling`
- `LLM as judge best practices dataset labeling calibration agreement human review`
- `active learning text classification uncertainty sampling diversity sampling practical guide`
- `Snorkel weak supervision labeling functions text classification data programming guide`

## Open Questions

- Which local source should be the first ingestion target?
- Which external dataset should be sampled first?
- What exact pass/fail thresholds should candidate retrains use beyond catastrophic under-routing not increasing?
- Should accepted rows live under `prompt-routing/data/` or a separate experiment directory until promotion?
- Which fields must be redacted before a row can be tracked?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/prompt-router-curation-pipeline/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/prompt-router-curation-pipeline/PRD.md
  ```
- Notes for planner:
  - Start with an ingestion spike, not model retraining.
  - Keep production model artifacts unchanged until an experiment passes fixed gates.
  - Prefer deterministic feature extraction and explicit experiment reports over ad hoc notebooks.
