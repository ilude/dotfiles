# Prompt Router Curation Next Steps

## Current Decision

The current sandbox candidate is promising but not deployed. The safest path is
to improve promotion quality and runtime telemetry before replacing production
artifacts.

## Immediate Next Steps

### 1. Add User Effort Override Policy

User-selected effort should be authoritative. The router may recommend a route,
but if the user explicitly sets effort up or down, that selected effort should
be respected unless it violates a hard runtime or safety limit.

Expected behavior:

- User raises effort: keep the higher effort.
- User lowers effort: keep the lower effort.
- Router prediction remains logged as recommendation context.
- Runtime applied effort records whether a user override was present.

This should become both runtime policy and training telemetry because override
behavior is a high-signal label source.

### 2. Add Workflow Telemetry for Routing Outcomes

The most valuable future data is local workflow outcome data, not larger raw
external prompt dumps.

Collect privacy-safe records for:

- Prompt hash and deterministic prompt features.
- Router predicted tier and effort.
- User-selected tier and effort.
- Final applied tier and effort.
- Override type: none, user-up, user-down, model-tier override, effort override.
- Task surface: code edit, debugging, docs, planning, shell, review, etc.
- Files touched count.
- Tool calls count.
- Validation commands and results.
- Repair loop count.
- Follow-up signal: accepted, correction, escalation, continuation, cancel.

Raw prompts should remain opt-in and reviewed before becoming training data.

### 3. Build an Adjudication Queue from Local Signals

Create a review queue from cases most likely to improve the router:

- User override disagreed with router recommendation.
- Low effort route followed by validation failures or repeated corrections.
- High effort route completed trivially.
- Router/user disagreement on model tier.
- Short prompt that required high effort.
- Long prompt that completed cheaply.
- Safety-sensitive prompts routed too low.

Reviewed queue rows should produce `accepted_route` labels with provenance and
review notes.

### 4. Promote Reviewed Rows Through Production Format

The sandbox reviewed subset should not be copied directly into production
artifacts. Use a dedicated promotion step that:

1. Converts reviewed rows into canonical corpus schema.
2. Preserves source, license, provenance, and review decision.
3. Regenerates model artifacts in a controlled run.
4. Runs production tests and SHA checks.
5. Produces a deployment report before any artifact replacement.

### 5. Improve External Source Selection

Keep the current source decisions:

- Use routellm as the primary external source.
- Exclude CARROT from auto-training until reviewed, because it increased
  catastrophic under-routing.
- Treat smolagents as review-only until normalizers can extract better task
  boundaries.

Future external sources should be selected for outcome and preference signals,
not just prompt volume.

## Dataset Search Targets

Prefer datasets with one or more of these properties:

- Prompt plus multiple model responses.
- Human or benchmark preference labels.
- Cost and quality tradeoff labels.
- Agent trajectory success or failure.
- Tool-use traces with task outcome.
- Test result or patch correctness.
- Model identity plus user preference.
- Clear licensing and source attribution.

Useful search terms:

- `LLM routing preference dataset`
- `model routing benchmark cost quality dataset`
- `LLM cascade routing dataset`
- `agent traces tool use success dataset`
- `SWE agent trajectories test results`
- `code repair preference dataset`
- `human preference model routing dataset`
- `prompt complexity classifier dataset`

Lower-value datasets:

- Generic instruction-only corpora with no outcome labels.
- Raw chat logs with no success or correction signal.
- Complexity-only labels that do not map to cheapest acceptable route.
- Datasets without usable license metadata.

## Experiments to Run Next

### Experiment A: NVIDIA Complexity Scorer Triage

Use the NVIDIA prompt task and complexity classifier as an additional weak
signal. Do not treat it as ground truth.

Measure whether it improves:

- Detection of short hard prompts.
- Filtering of weak-label false positives.
- Route-balanced sampling.
- Disagreement queue quality.
- Selection of high-value rows for manual review.

### Experiment B: Reviewed Subset Promotion Dry Run

Convert the 60-row reviewed routellm subset into the canonical production corpus
format in a sandbox branch or experiment directory. Regenerate artifacts outside
production paths first, then compare metrics.

### Experiment C: Local Override Telemetry Pilot

Log user effort overrides and router recommendations for local sessions. Build a
small adjudication queue from override cases and review the first batch.

## Experiment Pipeline Reference

Use `classifier-experiment-pipeline.md` for the current experiment workflow.
It defines the production ConfGate baseline, baseline rebuild parity, active-
learning queue usage, sandbox retraining, and promotion requirements.

## Promotion Criteria

A candidate should not replace production artifacts unless all are true:

- The candidate is compared against production ConfGate.
- Baseline rebuild parity has been checked for the session.
- Catastrophic under-routing does not increase.
- Top-1 accuracy remains within the gate or improves.
- Over-routing does not regress beyond the gate.
- Per-tier recall does not regress for nonempty tiers.
- Latency remains under budget.
- Production artifact SHA sidecars are valid.
- Prompt-routing tests and repo quick validation pass.
- The accepted rows have reviewed labels and provenance.
- User effort override policy is not broken by the router.
