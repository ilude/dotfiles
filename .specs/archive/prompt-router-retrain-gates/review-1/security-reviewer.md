---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "path-confinement"
  confidence: high
  evidence: "Plan relies on user-provided `--output-dir` and only checks `git status` after writes. It does not require canonical path resolution, symlink rejection, or fail-closed checks before writing under `pi/prompt-routing/experiments/retraining/`. A malicious/accidental path or symlink could write artifacts outside the sandbox."
  required_fix: "Require `curation_experiment.py` to resolve output paths, reject paths outside the canonical retraining experiment root, reject symlinked output ancestors, and perform this check before creating or writing any artifact."
- severity: high
  category: "prompt-data-leakage"
  confidence: high
  evidence: "The plan allows generated candidate JSONL/experiment inputs under ignored directories and only requires prompt-safe reports/review packets. It does not forbid full raw prompts in exported candidates, manifests, temp training sets, or failure logs, despite later warning not to track raw prompts."
  required_fix: "Define a data classification policy for every output file. Require export/evaluate artifacts to omit or redact full prompts by default, or store them only in a named local-only raw directory. Add tests scanning all generated files, not only reports."
- severity: medium
  category: "gate-integrity"
  confidence: medium
  evidence: "`init-gates` must run before evaluation, but `evaluate --experiment-dir` criteria do not require verifying `gates.json` existed before candidate results. A later or overwritten gates file could justify results after seeing metrics."
  required_fix: "Require immutable gate metadata: create `gates.json` before evaluation, fail if missing, and record the gate hash in `report.json`. Test evaluation fails when gates are absent, newer than result inputs, or overwritten without a new experiment directory."
- severity: medium
  category: "artifact-scan-coverage"
  confidence: medium
  evidence: "Final artifact safety scan targets only `pi/prompt-routing/experiments/retraining/final-smoke`. The automation also creates curation data under `pi/prompt-routing/experiments/curation/retrain-candidates`, which may contain pulled prompts/source payloads and is not included in final scan evidence."
  required_fix: "Expand final safety checks to scan every generated output directory, including refreshed curation directories. Require manifests to list generated directories and fail archive if any listed directory is unscanned or contains leaks."
- severity: medium
  category: "production-mutation-detection"
  confidence: medium
  evidence: "Production mutation checks use `git status --short -- pi/prompt-routing/data ...`, which only detects git-visible changes. It may miss symlinks, hardlinks, ignored files, permissions changes, or accidental in-place model writes outside those exact paths."
  required_fix: "Add pre/post SHA256 snapshots for production corpus/model artifacts and assert path types are regular files/directories, not symlinks. Add tests proving no production artifact path is opened for write during export/evaluate/run."
