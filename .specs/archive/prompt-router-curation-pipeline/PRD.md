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

1. Pull bounded samples from multiple external prompt/session sources instead of choosing a single source up front.
2. Normalize existing and external prompt/session sources into one candidate schema.
3. Generate weak supervision signals from independent local sources, starting with current router output and deterministic trace features.
4. Automate candidate triage as much as possible, using human review only for ambiguous or high-risk exceptions.
5. Produce accepted training candidates and a separate held-out OOD candidate set without directly mutating production data.
6. Prove whether curated additions improve the router by comparing against fixed baseline metrics before manual promotion.

## Non-Goals

- Bulk-import external labels directly into production training data.
- Replace the current classifier architecture in the first iteration.
- Add runtime network dependencies to the live router.
- Treat trace length, observed model choice, or thinking level as ground truth.
- Optimize for a generic simple/complex prompt classifier instead of Pi's route-level target.
- Require broad human review as the primary curation mechanism.
- Automatically promote curated rows into production training data or model artifacts.

## Requirements

### Functional Requirements

1. Source ingestion must support bounded network pulls from multiple external sources in the first iteration.
   - Initial external sources: `championswimmer/pi-coding-sessions`, `jedisct1/agent-traces-swival`, `smolagents/codeagent-traces`, `routellm/gpt4_dataset`, and `CARROT-LLM-Routing/SPROUT` when easy to load.
   - Later external sources: `nebius/SWE-agent-trajectories` and `nlile/misc-merged-claude-code-traces-v1`, because they are larger and likely need more careful sampling.
   - Local source candidates remain useful for baseline comparison: `prompt-routing/logs/routing_log.jsonl`, local session logs, or existing prompt-routing corpus files.

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
   - source-derived metadata signals
   - disagreement summary
   - optional external complexity score in a later iteration
   - optional rubric judge label in a later iteration

5. Automated triage must assign each row one of these statuses:
   - `auto_accept_candidate`
   - `holdout_candidate`
   - `needs_review`
   - `reject`

6. Automated triage must prioritize human review only for exceptions:
   - low current-router confidence
   - disagreement between weak labelers
   - predicted under-routing risk
   - short hard prompts
   - long easy prompts
   - underrepresented route cells
   - cluster outliers and near-duplicates

7. Pipeline outputs must be separated by promotion state:
   - raw external pulls and caches
   - normalized candidates
   - scored candidates
   - auto-accepted candidates
   - held-out OOD candidates
   - rejected rows with rejection reason
   - experiment reports and summaries

8. Retrain experiments must compare baseline and candidate models without modifying production artifacts until manually accepted.

9. Evaluation reports must include:
   - top-1 cheapest-route accuracy
   - catastrophic under-routing count
   - over-routing rate
   - per-tier recall
   - latency summary
   - shadow comparison on real routing logs when labels are available

### Non-Functional Requirements

- Pipeline scripts must be deterministic for the same inputs and configuration.
- Raw external datasets must remain outside tracked source unless explicitly approved.
- Generated raw pulls, caches, and intermediate scored rows should stay ignored by default.
- Small accepted corpora may be tracked only after manual promotion.
- Experiment configs, reports, and summaries should be tracked when they are useful and do not include sensitive raw prompts.
- Accepted rows must retain source attribution and license metadata.
- The first iteration should be small enough to audit by summary and spot-checks, not broad manual review.
- The live router must remain local and non-blocking if curation tools are absent.

## Acceptance Criteria

1. [ ] Normalized candidate JSONL can be produced from bounded samples of at least three external sources.
   - Verify: run the ingestion command documented by the plan.
   - Pass: output rows contain `prompt`, `source`, `source_license`, `trace_features`, `weak_labels`, and `review_status`.
   - Fail: rows are source-specific, missing prompt text, or lack trace/label fields.

2. [ ] The curation pipeline produces automated triage outputs.
   - Verify: inspect generated JSONL outputs and summary report.
   - Pass: rows are split into `auto_accept_candidate`, `holdout_candidate`, `needs_review`, and `reject` groups with explicit reasons.
   - Fail: rows require manual classification by default or lack triage reasons.

3. [ ] Review is exception-based rather than required for every row.
   - Verify: run the curation command on a bounded sample.
   - Pass: only ambiguous, risky, or low-confidence rows are placed in `needs_review`.
   - Fail: all rows are routed to manual review or accepted without reasons.

4. [ ] Curation outputs do not touch production training files or model artifacts.
   - Verify: run the curation command and inspect git status plus output paths.
   - Pass: outputs are written under `pi/prompt-routing/experiments/curation/` or another experiment directory only.
   - Fail: production corpus, model artifacts, or tracked training files are modified during curation.

5. [ ] Candidate retraining is evaluated against the current baseline on fixed datasets.
   - Verify: run the documented baseline and candidate eval commands.
   - Pass: report shows baseline vs candidate metrics for top-1 accuracy, catastrophic under-routing, over-routing, per-tier recall, and latency.
   - Fail: only candidate metrics are reported or eval data changes between runs.

6. [ ] A candidate data addition is rejected if safety regresses.
   - Verify: run an experiment where catastrophic under-routing increases or per-tier recall collapses.
   - Pass: the report marks the experiment as failed and does not promote artifacts.
   - Fail: the pipeline promotes artifacts based on top-1 improvement alone.

7. [ ] A candidate data addition is accepted only when predefined thresholds are met.
   - Verify: inspect experiment config and report.
   - Pass: thresholds are declared before evaluation and the report states pass/fail for each gate.
   - Fail: acceptance is decided after seeing results without recorded thresholds.

8. [ ] LLM-judge usage is deferred behind a comparison experiment.
   - Verify: inspect curation configuration and generated report.
   - Pass: MVP uses deterministic features plus current router, and any judge workflow is documented as a later sampled comparison.
   - Fail: broad LLM judging is required for MVP curation.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Bulk-import external labels | Fast, high volume | Repeats prior failure mode; noisy labels can poison corpus | Reject |
| Single external complexity classifier | Simple to run | Measures apparent complexity, not cheapest acceptable route | Reject as sole signal |
| Manual-only labeling | Highest label quality | Slow; poor coverage discovery | Reject as primary workflow; use only for exceptions |
| Automated weak supervision plus exception review | Balances scale and safety; auditable | More pipeline work | Choose for MVP |
| Preference-style labeling | Best match to cheapest acceptable route | More expensive; needs model outputs and judging | Defer until curation MVP exists |
| Broad LLM judging in MVP | Could improve labels | Adds cost and judge-bias risk before schema is proven | Defer; run sampled comparison first |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| External data license mismatch | Accepted rows cannot be used | Store source license per row and gate exports by allowed license |
| Private prompt leakage | Sensitive data could enter tracked corpus | Keep raw and review outputs ignored by default; require explicit approval before tracking |
| Weak labels become trusted labels | Corpus quality degrades | Treat all weak labels as review signals only |
| OOD eval contamination | Metrics become misleading | Write OOD eval before retraining and never train on it |
| Over-routing appears safer but wastes cost | Cost goals regress | Track over-routing and shadow cost alongside safety |
| Class imbalance | Model collapses to dominant route cells | Stratify sampling and report per-tier recall |
| Pipeline complexity exceeds value | Maintenance burden | Start with bounded samples and deterministic local scoring only |

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

- What exact bounded sample size should each external source use in the first run?
- What exact pass/fail thresholds should candidate retrains use beyond catastrophic under-routing not increasing?
- Should manually promoted accepted rows live under `prompt-routing/data/` or a separate promoted-corpus directory?
- Which fields must be redacted before a row can be tracked?
- What sample size is sufficient for a later LLM-judge comparison experiment?

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
  - Start with a multi-source bounded ingestion spike, not model retraining.
  - Write generated outputs under `pi/prompt-routing/experiments/curation/` by default.
  - Keep production model artifacts unchanged until an experiment passes fixed gates and is manually promoted.
  - Prefer deterministic feature extraction and explicit experiment reports over ad hoc notebooks.
  - Defer broad LLM judging until a sampled comparison shows it adds useful signal.
