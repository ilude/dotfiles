- severity: high
  evidence: Automation Plan runs `export --output-dir .../retrain-candidates` before `init-gates`, while T1 says gate config must exist before generated experiment rows are written. A resumed `/do-it` could export candidate rows, then fail before gates, leaving an ungated experiment directory.
  required_fix: Change sequencing so `init-gates --fail-if-exists` runs before export/evaluate for the final experiment directory, or split immutable gate config into a parent experiment init step that creates the directory before any rows.

- severity: high
  evidence: `.gitignore` currently ignores only `pi/prompt-routing/experiments/curation/**`, not `pi/prompt-routing/experiments/retraining/**`. The plan relies on retraining outputs being ignored, but the preflight/automation sequence can write retraining artifacts before V1 confirms ignore coverage.
  required_fix: Make adding/verifying `.gitignore` coverage for `pi/prompt-routing/experiments/retraining/**` the first T1 acceptance gate, before any export/evaluate command can write generated rows.

- severity: medium
  evidence: Fixed output directories (`retrain-candidates`, `export-smoke`, `final-smoke`) are reused across commands. Only `init-gates` specifies `--fail-if-exists`; export/evaluate/run acceptance commands do not require empty dirs, cleanup, or stale-manifest detection.
  required_fix: Require all write commands to fail on non-empty output dirs unless `--overwrite` is explicit, include a manifest run_id/timestamp check, and add resume instructions for deleting or choosing a new ignored directory.

- severity: medium
  evidence: Artifact safety checks use `git status --short -- ... pi/prompt-routing/experiments/retraining`, but ignored generated files will not appear. This can hide failed runs, stale artifacts, or files accidentally ignored outside the intended experiment subtree.
  required_fix: Add explicit `git check-ignore -q pi/prompt-routing/experiments/retraining/<run>/...`, `git status --short --ignored -- .../experiments/retraining`, and manifest/report existence checks to prove generated artifacts are ignored and complete.

- severity: medium
  evidence: Path confinement is stated but not specified as a hard CLI invariant. Commands accept user-provided `--output-dir` and cleanup says to remove retraining dirs after confirming they are under experiments, but there is no realpath/symlink/`..` acceptance test.
  required_fix: Require `curation_experiment.py` to resolve paths, reject outputs outside `pi/prompt-routing/experiments/retraining/`, reject symlink escapes, and test `../`, absolute outside, and symlinked output-dir cases.
