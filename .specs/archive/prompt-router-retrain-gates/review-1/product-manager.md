# Product Manager Review

## Findings

1. severity: high
   evidence: The plan's T3 says to build a candidate model from production training data plus exported weak candidate rows, but the central PRD rule says candidates are not truth. The only required shadow comparison is "where labels exist"; weak labels from `proposed_route` do not create real labels. Training on them can only test whether the classifier can absorb its own prior outputs, not whether route quality improves.
   required_fix: Re-scope MVP to export and gate candidate quality against existing labeled eval/holdout only, or require a small reviewed labeled sample before any candidate retraining claim.

2. severity: high
   evidence: Plan commands repeatedly rely on `pi/prompt-routing/experiments/curation/final-smoke`, an ignored generated directory. Handoff says "when available" but acceptance criteria require it for export, evaluate, e2e, and final smoke. If the directory is absent on a clean checkout, the plan cannot run deterministically.
   required_fix: Make the plan use tracked fixtures for tests and a generated bounded curation run for smoke, with final-smoke optional only. Acceptance commands must not require ignored local state.

3. severity: medium
   evidence: The plan adds a new `curation_experiment.py` with schema, export, gate config, model training/evaluation, reporting, safeguards, orchestration, docs, and e2e tests. Existing `train.py` already exposes `_load_jsonl`, `evaluate_on_split`, and timing; `evaluate.py` already computes required metrics and gates. The plan duplicates instead of specifying reuse seams.
   required_fix: Reduce scope to a thin experiment wrapper that imports/reuses existing metric and training helpers, and only adds export/gate/report glue that is missing.

4. severity: medium
   evidence: Artifact safety checks use `git status --short -- ... pi/prompt-routing/experiments/retraining` and expect ignored outputs to be proven ignored. `git status --short` does not show ignored files, so it cannot prove retraining outputs are ignored or confined. `.gitignore` currently only shows `pi/prompt-routing/experiments/curation/**`.
   required_fix: Add explicit verification with `git check-ignore -q pi/prompt-routing/experiments/retraining/<file>` or `git status --ignored --short`, and require `.gitignore` update before any generated retraining output.

5. severity: medium
   evidence: The plan demands fixed gates for top-1 accuracy delta, catastrophic under-routing, over-routing rate, per-tier recall, and latency, but never specifies the threshold values or how pass/fail handles weak-label-only candidate data. Executors can choose arbitrary thresholds while still satisfying "contains thresholds".
   required_fix: Put exact initial gate values and decision rules in the plan, including which dataset each gate is evaluated on and which metrics are informational when labels do not exist.
