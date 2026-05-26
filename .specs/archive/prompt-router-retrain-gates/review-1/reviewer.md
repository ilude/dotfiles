---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "automation-readiness"
  confidence: high
  evidence: "plan.md:321 allows final archive with a documented network-blocked status, but final smoke commands at plan.md:347 and artifact scan at plan.md:352 always consume pi/prompt-routing/experiments/curation/final-smoke. If final-smoke is absent or stale, a fresh /do-it session has no deterministic archive path."
  required_fix: "Add an explicit archive fallback command/path: generate a bounded curation sample or create/use a checked-in fixture when network is blocked, then feed that concrete curation-dir into export/evaluate/scan. Define pass/fail evidence for the network-blocked case."
- severity: high
  category: "verification"
  confidence: high
  evidence: "plan.md:181 requires gates before any experiment result, but verification only checks gates.json exists in a fresh schema-smoke dir. Later run/export commands can create outputs before init-gates, and no manifest timestamp/order or fail-if-missing-gates check is required in evaluate/run."
  required_fix: "Require evaluate/run to fail if gates.json is missing and record gate_config_created_at before report/model/result timestamps in the manifest/report. Add tests proving evaluation cannot run without pre-existing gates and cannot overwrite gates after results."
- severity: medium
  category: "execution-checklist"
  confidence: high
  evidence: "Execution Checklist items T1-T5/V1-V3/F1-F5 are coarse, while many acceptance commands and validation gates are nested only in prose. The checklist rule says every executable task, validation gate, and final completion gate has exactly one matching checkbox, but acceptance checks are not represented as checkboxes."
  required_fix: "Add checklist sub-items or separate V items for each executable acceptance/validation command, artifact scan, git-status check, docs inspection, and archive preflight. Ensure /do-it has a durable ledger item to mark immediately after each command passes."
- severity: medium
  category: "metrics"
  confidence: medium
  evidence: "plan.md:28 and plan.md:233 require latency summary and shadow comparison where labels exist, but the plan never defines latency measurement input, repeat count, units, percentile/mean fields, or what qualifies as an existing label for shadow comparison under weak labels."
  required_fix: "Define report schema for latency (units, sample source, repetitions, mean/p95 or equivalent) and shadow comparison (which rows/labels are eligible, baseline/candidate fields, empty-state behavior). Add acceptance checks that validate these fields semantically, not just key presence."
- severity: medium
  category: "artifact-safety"
  confidence: high
  evidence: ".gitignore currently ignores pi/prompt-routing/experiments/curation/** but not pi/prompt-routing/experiments/retraining/**. plan.md:189 allows adding .gitignore as needed, but plan.md:182's init-gates smoke writes into retraining before a prerequisite ignore check is mandatory."
  required_fix: "Make the first executable step verify or add pi/prompt-routing/experiments/retraining/** to .gitignore before any init/export/evaluate command writes there. Add a preflight command and checklist item that fails if generated retraining files would appear as untracked."
