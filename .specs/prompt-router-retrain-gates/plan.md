---
created: 2026-05-26
status: draft
completed:
---

# Plan: Prompt Router Candidate Review and Retrain Gates

## Context & Motivation

The prompt-router curation MVP is complete and archived at `.specs/archive/prompt-router-curation-pipeline/plan.md`. It added `pi/prompt-routing/curation_pipeline.py`, bounded source pulls, normalization, deterministic features, v3 ConfGate weak labels, four triage statuses, prompt-safe summaries, scan/list/cleanup safeguards, tests, and docs. Its final network smoke wrote ignored outputs under `pi/prompt-routing/experiments/curation/final-smoke`, produced candidates from `routellm_gpt4_dataset` and `smolagents_codeagent_traces`, timed out `CARROT-LLM-Routing/SPROUT` as an explicit skipped source, and did not modify production corpus or model artifacts.

The archived PRD says the next router data step is not direct promotion. The next step is to review candidate outputs, define fixed pass/fail retraining gates before training, and run a baseline-vs-candidate experiment without mutating production training files or model artifacts. This plan turns that PRD next step into a repeatable local experiment: candidate rows stay experimental, `accepted_route` is not treated as ground truth unless a later manual promotion workflow creates reviewed rows, and the experiment report decides only whether candidate additions are promising enough for follow-up.

## Constraints

- Platform: Windows checkout at `C:/Users/mglenn/.dotfiles` under Git Bash/MSYS2 (`MINGW64_NT`, `/usr/bin/bash`).
- Shell: use bash for git, `uv`, Python, and Make commands; use PowerShell only for Windows-native tasks.
- Language: Python for `pi/prompt-routing`; this plan should not require Pi TypeScript changes.
- Package manager: use `uv` for `pi/prompt-routing`; do not use pip directly; do not add new network/data dependencies unless explicitly justified and locked.
- Existing prompt-routing project has `pyproject.toml`, tracked `uv.lock`, and `package = false`; prefer top-level scripts/modules under `pi/prompt-routing` rather than a package layout.
- Existing MVP curation outputs are generated and ignored under `pi/prompt-routing/experiments/curation/**`.
- Production corpus/model artifacts must remain unchanged: `pi/prompt-routing/data/`, `pi/prompt-routing/models/`, `pi/prompt-routing/model.pkl`, `pi/prompt-routing/model.pkl.sha256`, and `pi/prompt-routing/test_set.pkl`.
- Candidate experiment outputs must be written under `pi/prompt-routing/experiments/retraining/`, not production artifact paths. `.gitignore` must include `pi/prompt-routing/experiments/retraining/**` and `git check-ignore` must pass before any retraining experiment file is written.
- `accepted_route` is nullable and must not be treated as training truth unless a later manual promotion workflow explicitly populates it. `proposed_route` from `auto_accept_candidate` rows may be used only as weak experimental input; weak-label metrics are informational unless compared against production or manually accepted labels.
- `needs_review` rows must be separated into a prompt-safe exception review packet; broad manual review is deferred and is not required to archive this plan.
- Fixed pass/fail gates must be written before candidate export, candidate model training, or evaluation results in a given experiment directory. `evaluate` and `run` must fail if `gates.json` is missing.
- Required report metrics: top-1 cheapest-route accuracy, catastrophic under-routing count, over-routing rate, per-tier recall, latency summary, and shadow comparison where production/manual labels exist. Reports must include row counts and denominators; empty candidate sets or empty baseline evaluation labels are tool failures, not valid quality conclusions.
- Initial gate values for the MVP experiment: catastrophic under-routing must not increase above baseline; per-tier recall may not decrease by more than 0.05 for any tier with nonzero denominator; over-routing rate may not increase by more than 0.10 absolute; mean latency may not exceed baseline by more than 25 percent; top-1 accuracy must not decrease by more than 0.02 absolute. Weak-label-only comparisons are reported separately and cannot make a candidate pass quality gates.
- Experiment code must not call `train.run()` or `train._save_artifacts()` because `train.py` writes production model paths. Any reusable helper must accept explicit experiment output paths, and tests must fail if production model/corpus paths are opened for write.
- Experiment CLIs must resolve output paths against the canonical experiment root, reject `..`, absolute external paths, symlinked output ancestors, and non-empty output directories unless an explicit overwrite/new-run option is provided.
- Broad LLM-judge labeling is deferred. A tiny sampled judge-comparison design may be documented, but no broad paid/API judging should be executed in this plan.
- Repo validation commands from project context: targeted prompt-routing tests with `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/`, repo quick validation with `make test-quick`, and Python lint with `make lint-python`.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy through git for source changes; generated experiment outputs can be deleted
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This plan adds local experiment/review tooling, writes ignored outputs under experiment directories, and explicitly forbids production corpus/model mutation or promotion. It does not call paid judges, deploy runtime changes, or affect shared systems. Automated tests, artifact scans, and git-status checks can validate the work.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Promote `auto_accept_candidate` rows directly into production corpus | Fastest path to new training data | Violates PRD rule that candidates are not truth; repeats bulk-import risk | Rejected: unsafe without fixed gates and promotion review |
| Manual-review all candidate rows before any experiment | Highest label confidence | Too slow, makes review primary workflow, and blocks learning from weak-label experiment | Rejected: use exception review packet only |
| Run candidate retraining with generated artifacts in production paths | Reuses existing `train.py` behavior | Risk of mutating tracked model/corpus artifacts and confusing baseline state | Rejected: experiment must sandbox outputs |
| Add a sandboxed baseline-vs-candidate experiment script | Local, repeatable, auditable, keeps artifacts separate | Requires small tooling addition and tests | **Selected** |
| Broad LLM-judge labeling before retraining | May improve labels | Adds cost, judge bias, and new failure modes before weak-label gates are proven | Deferred; only document optional sampled comparison |
| Only inspect curation summaries and postpone retraining | Very low risk | Does not satisfy PRD acceptance criteria for baseline-vs-candidate evaluation | Rejected: this phase should prove evaluation workflow |

## Objective

Implement the next-phase local experiment workflow for prompt-router curation. When complete, an executor can run a bounded curation sample, initialize fixed retraining gates, export separated candidate/review/holdout sets, run a sandboxed baseline-vs-candidate experiment, and produce a prompt-safe report with required metrics, row counts, gate hashes, and pass/fail gate results without mutating production corpus or model artifacts.

## MVP Boundary

The smallest useful outcome is a local, ignored experiment run that answers: "Do weakly accepted curation candidates look promising enough under fixed safety/cost gates to justify a later promotion review?" The answer may be "gate_failed" without being an implementation failure. This plan delivers candidate export, exception review packet generation, sandboxed experiment evaluation, reports, and tests. It is intentionally small enough for one focused session because it does not manually promote rows, rewrite the training architecture, add judge labeling, or ship model artifacts.

## Explicit Deferrals

- Manual promotion of rows into tracked production training data.
- Updating `pi/prompt-routing/data/training_corpus.json`, `model.pkl`, `test_set.pkl`, or `models/*.joblib` production artifacts.
- Runtime prompt-router or Pi extension changes.
- Broad LLM-judge labeling or paid/API-based adjudication.
- Full active-learning clustering, embeddings, or near-duplicate search.
- Adding new external dataset dependencies such as `datasets`, `huggingface_hub`, `requests`, or `httpx`.
- Reworking classifier architecture or hyperparameter search beyond a minimal candidate-vs-baseline comparison.

## Project Context

- **Language**: Python for `pi/prompt-routing`; repo also contains TypeScript for Pi extensions, Go utilities, and shell/PowerShell dotfiles, but they are not in scope.
- **Test command**: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/`
- **Lint command**: `make lint-python`
- **Repo-wide validation**: `make test-quick` plus targeted prompt-routing tests; `make check` is stronger but not required for this scoped local experiment unless failures suggest broader impact.
- **Relevant existing files**: `pi/prompt-routing/curation_pipeline.py`, `pi/prompt-routing/train.py`, `pi/prompt-routing/evaluate.py`, `pi/prompt-routing/classify.py`, `pi/prompt-routing/tests/test_curation_*.py`, `pi/prompt-routing/docs/curation-pipeline.md`.
- **Relevant archived context**: `.specs/archive/prompt-router-curation-pipeline/PRD.md` and `.specs/archive/prompt-router-curation-pipeline/plan.md`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && uv sync --project pi/prompt-routing --locked` | none | command exits 0; existing uncommitted work is known before implementation |
| Retraining ignore policy | Add `pi/prompt-routing/experiments/retraining/**` to `.gitignore` if missing, then run `grep -qxF 'pi/prompt-routing/experiments/retraining/**' .gitignore && git check-ignore -q pi/prompt-routing/experiments/retraining/preflight/gates.json` | none | ignore policy is verified before any generated retraining write |
| Generate bounded curation sample | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 25 --output-dir pi/prompt-routing/experiments/curation/retrain-candidates --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000` | public network only | curation manifest/status files exist; at least one public source produces candidates for quality conclusions; network-blocked status is allowed only for tooling tests and prevents archive quality claims |
| Initialize experiment gates | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py init-gates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates --fail-if-exists` | none | `gates.json` exists before export/evaluate outputs; contains initial threshold values, `gates_created_at`, and gate hash input material |
| Export candidate/review sets | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py export --curation-dir pi/prompt-routing/experiments/curation/retrain-candidates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates` | none | separated candidate, holdout, needs-review, rejected, config, and prompt-safe review packet files exist; command fails if gates are absent |
| Run sandboxed experiment | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py evaluate --experiment-dir pi/prompt-routing/experiments/retraining/retrain-candidates` | none | baseline-vs-candidate report exists with row counts, denominators, gate hash, required metrics, and pass/fail gates; no production artifacts changed |
| Task tests | `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation or experiment' -v` | none | exits 0 and collects relevant tests |
| Prompt-routing tests | `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -v` | none | exits 0 |
| Repo quick validation | `make test-quick` | none | exits 0 |
| Lint | `make lint-python` | none | exits 0 |
| Artifact safety scan | `git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/test_set.pkl && git status --ignored --short -- pi/prompt-routing/experiments/retraining && uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py scan --output-dir pi/prompt-routing/experiments/curation/retrain-candidates && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py scan --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates` | none | production artifacts unchanged; generated experiment outputs are ignored; every generated directory is scanned |
| Deploy | not applicable | none | no runtime/deployment step exists |
| Rollback generated outputs | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py cleanup --output-dir <curation-run-dir> --dry-run` for curation runs; retraining cleanup must use `curation_experiment.py cleanup --output-dir <experiment-dir> --dry-run` and reject paths outside `pi/prompt-routing/experiments/retraining/` | none | only ignored experiment outputs are removed; source rollback uses git only if explicitly requested |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [ ] T1: Define experiment schema, output policy, and fixed gate config
  - Status: pending
  - Evidence: --
- [ ] T2: Implement candidate export and exception review packet
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Implement sandboxed baseline-vs-candidate evaluation
  - Status: pending
  - Evidence: --
- [ ] T4: Implement reporting, gate decisions, and artifact safeguards
  - Status: pending
  - Evidence: --
- [ ] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Wave 3

- [ ] T5: Add CLI orchestration, docs, and end-to-end tests
  - Status: pending
  - Evidence: --
- [ ] V3: Validate wave 3
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation not required or completed
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Define experiment schema, output policy, and fixed gate config | 2-3 files: `pi/prompt-routing/curation_experiment.py`, tests, docs | feature | medium | coding-medium | -- |
| T2 | Implement candidate export and exception review packet | 2-3 files: experiment script/tests/docs | feature | medium | coding-medium | T1 |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T2 |
| T3 | Implement sandboxed baseline-vs-candidate evaluation | 2-4 files: experiment script/tests | feature | medium | coding-medium | V1 |
| T4 | Implement reporting, gate decisions, and artifact safeguards | 2-4 files: experiment script/tests/docs | feature | medium | coding-medium | T3 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T4 |
| T5 | Add CLI orchestration, docs, and end-to-end tests | 2-4 files: tests/docs/script updates | feature | medium | qa-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation-lead | T5 |
| F1 | Task-specific verification complete | -- | validation | small | validation-lead | V3 |
| F2 | Repo-wide validation complete | -- | validation | medium | validation-lead | F1 |
| F3 | Manual validation not required or completed | -- | validation | small | validation-lead | F2 |
| F4 | Deployment validation complete or not required | -- | validation | small | validation-lead | F3 |
| F5 | Archive preflight complete | -- | validation | small | validation-lead | F4 |

## Execution Waves

### Wave 1 (sequential)

**T1: Define experiment schema, output policy, and fixed gate config** [medium] -- coding-medium
- Description: Add a local experiment script or helper module that defines schema/versioned records for exported candidate rows, experiment config, fixed gate thresholds, metric summaries, output file classifications, and report manifests. The first implementation step must add/verify `.gitignore` coverage for `pi/prompt-routing/experiments/retraining/**` before any generated retraining file is written. The gate config must be generated before export, training, evaluation, or report output in an experiment directory and must include exact initial thresholds for top-1 accuracy delta, catastrophic under-routing, over-routing rate, per-tier recall, and latency. Output paths must be confined to the canonical `pi/prompt-routing/experiments/retraining/` root with symlink and `..` escape rejection.
- Files: `pi/prompt-routing/curation_experiment.py`, `pi/prompt-routing/tests/test_curation_experiment_schema.py`, `.gitignore`, docs as needed.
- Acceptance Criteria:
  1. [ ] Retraining experiment outputs are ignored before any generated retraining write.
     - Verify: `grep -qxF 'pi/prompt-routing/experiments/retraining/**' .gitignore && git check-ignore -q pi/prompt-routing/experiments/retraining/schema-smoke/gates.json`
     - Pass: both commands exit 0 before `init-gates`, `export`, `evaluate`, or `run` writes under `experiments/retraining`.
     - Fail: ignore coverage is missing or generated retraining files would appear as untracked files.
  2. [ ] Fixed gate config exists before any experiment result is written and cannot be created after results.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py init-gates --output-dir pi/prompt-routing/experiments/retraining/schema-smoke --fail-if-exists && test -f pi/prompt-routing/experiments/retraining/schema-smoke/gates.json && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py evaluate --experiment-dir pi/prompt-routing/experiments/retraining/no-gates-smoke; test $? -ne 0`
     - Pass: `gates.json` declares all initial threshold values, `gates_created_at`, and hashable gate content; evaluation fails when gates are missing; gates cannot be overwritten after results without a new output directory.
     - Fail: thresholds are missing, generated after results, overwritten silently, or evaluation can run without gates.
  3. [ ] Output policy prevents production corpus/model mutation, path escape, and prompt-data tracking.
     - Verify: run targeted tests for outside absolute paths, `..`, symlinked ancestors, non-empty output dirs, and production path write attempts; then run `git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/test_set.pkl`.
     - Pass: invalid paths fail before writes; production corpus/model artifacts are unchanged; generated retraining files are ignored or intentionally prompt-safe tracked docs only.
     - Fail: production artifacts change, symlink/path escapes succeed, stale dirs are overwritten silently, or generated raw/candidate rows appear as untracked files.

**T2: Implement candidate export and exception review packet** [medium] -- coding-medium
- Blocked by: T1
- Description: Export curation output into separated experiment inputs after gates already exist: weakly labeled candidate rows from `auto_accept_candidate`, held-out rows from `holdout_candidate`, prompt-safe `needs_review` packet with IDs/reasons/features/route proposals but no full prompts by default, rejected row summary, and manifest. The export must leave `accepted_route` null, record label provenance separately for production/manual labels versus weak proposed labels, and fail clearly if no candidate rows are available, if the curation run has no manifest, or if gates are missing. Use a generated curation run such as `pi/prompt-routing/experiments/curation/retrain-candidates` for smoke commands; `final-smoke` is optional local context only.
- Files: `pi/prompt-routing/curation_experiment.py`, `pi/prompt-routing/tests/test_curation_experiment_export.py`, `pi/prompt-routing/docs/curation-pipeline.md` or a new experiment doc section.
- Acceptance Criteria:
  1. [ ] Export separates all statuses and preserves candidate semantics.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py init-gates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates --fail-if-exists && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py export --curation-dir pi/prompt-routing/experiments/curation/retrain-candidates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates`
     - Pass: output contains separate files for candidates, holdout, needs-review, rejected summary, and manifest; `accepted_route` remains null in exported rows; candidate label source is recorded as weak/experimental and separate from production/manual labels.
     - Fail: statuses are mixed, needs-review rows enter training candidates, `accepted_route` is populated, or weak labels are treated as real labels.
  2. [ ] Exception review packet is prompt-safe and not broad manual review.
     - Verify: inspect `pi/prompt-routing/experiments/retraining/retrain-candidates/review_packet.md` and run `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py scan --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates`
     - Pass: packet lists IDs, sources, statuses, reason codes, feature summaries, and route proposals without full raw prompt text; scan exits 0.
     - Fail: packet includes full prompts by default, requires every row to be manually judged, or scan fails.
  3. [ ] Export records row IDs and content hashes for partitions.
     - Verify: inspect export manifest or run targeted export tests.
     - Pass: manifest includes sorted row IDs and content hashes for candidate training rows, holdout rows, needs-review rows, rejected rows, and source curation manifest.
     - Fail: partition contents cannot be audited or holdout/candidate overlap cannot be detected.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T2
- Checks:
  1. Run T1 and T2 acceptance commands.
  2. `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation_experiment_schema or curation_experiment_export' -v` exits 0 and collects tests.
  3. Confirm `.gitignore` covers `pi/prompt-routing/experiments/retraining/**` before export/evaluation outputs are generated.
  4. Confirm production corpus/model artifact status is clean with `git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/test_set.pkl`.
  5. Confirm exported candidate labels are explicitly weak/experimental and no `accepted_route` is populated.
- On failure: create a fix task, rerun affected checks, then rerun V1.

### Wave 2 (sequential)

**T3: Implement sandboxed baseline-vs-candidate evaluation** [medium] -- coding-medium
- Blocked by: V1
- Description: Add an evaluation path that compares current baseline metrics with a candidate model/decision surface built from production training data plus exported weak candidate rows, while keeping all intermediate data/model outputs inside the experiment directory. Do not call `train.run()` or `train._save_artifacts()` because those write production artifacts. Reuse only pure helper functions that accept explicit input/output paths; otherwise duplicate the minimal fit/eval logic needed for an experiment-only run. The experiment must use fixed evaluation data, keep holdout/OOD candidate rows out of candidate training input, and record row IDs/content hashes for all train/eval/holdout partitions.
- Files: `pi/prompt-routing/curation_experiment.py`, possible small helper module, tests under `pi/prompt-routing/tests/`.
- Acceptance Criteria:
  1. [ ] Baseline and candidate metrics are computed from fixed inputs without production writes.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py evaluate --experiment-dir pi/prompt-routing/experiments/retraining/retrain-candidates && git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/test_set.pkl`
     - Pass: report includes baseline and candidate metrics, nonzero candidate count, nonzero baseline evaluation label count, metric denominators, and identical eval row hash for baseline/candidate; production artifact status is clean; generated model/data artifacts live only under the experiment directory.
     - Fail: only candidate metrics are reported, evaluation input changes between baseline and candidate, required denominators are zero, or production artifacts change.
  2. [ ] Holdout/OOD rows are not trained on.
     - Verify: inspect experiment manifest/report and run targeted tests for train/eval partitioning.
     - Pass: report lists candidate training row IDs separately from holdout/OOD row IDs with no overlap and includes content hashes for each partition.
     - Fail: holdout IDs appear in candidate training input or partition hashes are absent.
  3. [ ] Production artifact writes are blocked by tests.
     - Verify: run targeted tests that monkeypatch or snapshot `pi/prompt-routing/data`, `models/*.joblib`, `models/*.sha256`, `model.pkl`, `model.pkl.sha256`, and `test_set.pkl`.
     - Pass: tests fail if experiment code opens production artifact paths for write or calls production-saving functions.
     - Fail: experiment code can write production artifacts, directly or through `train.py` helpers.

**T4: Implement reporting, gate decisions, and artifact safeguards** [medium] -- coding-medium
- Blocked by: T3
- Description: Produce prompt-safe `report.md` and machine-readable `report.json` with required PRD metrics: top-1 cheapest-route accuracy, catastrophic under-routing count, over-routing rate, per-tier recall, latency summary, and shadow comparison where production/manual labels exist. Apply the prewritten `gates.json` thresholds, record the gate hash and `gates_created_at`, and mark the candidate experiment as `passed`, `gate_failed`, or `tool_failed`. A safety regression must fail the experiment even if top-1 accuracy improves. Weak-label-only comparisons must be named separately and excluded from quality pass/fail gates. Every generated output file must have a data classification; full prompts may appear only in local-only ignored candidate/training input files, not summaries/reports/review packets.
- Files: `pi/prompt-routing/curation_experiment.py`, tests under `pi/prompt-routing/tests/`, docs.
- Acceptance Criteria:
  1. [ ] Report contains required metrics, denominators, gate decisions, and gate metadata.
     - Verify: `python - <<'PY'
import json
from pathlib import Path
report = json.loads(Path('pi/prompt-routing/experiments/retraining/retrain-candidates/report.json').read_text())
required = {'top1_accuracy', 'catastrophic_under_routing', 'over_routing_rate', 'per_tier_recall', 'latency', 'shadow_comparison', 'weak_label_comparison', 'gates', 'gate_hash', 'row_counts', 'denominators', 'overall_status'}
missing = required - set(report)
raise SystemExit(f'missing: {sorted(missing)}' if missing else 0)
PY`
     - Pass: command exits 0; `report.md` summarizes pass/fail without full raw prompts; report includes latency units/repetition count/mean and p95 or equivalent.
     - Fail: any required metric is missing, denominators are zero without explicit unavailable status, weak labels are presented as real labels, or report includes raw prompts.
  2. [ ] Safety and cost regressions fail the experiment.
     - Verify: run deterministic fixture tests that inject increased catastrophic under-routing, per-tier recall collapse, over-routing increase, latency regression, empty tier buckets, and candidate/holdout overlap.
     - Pass: tests prove the report marks the experiment `gate_failed` and no promotion artifact is emitted when any fixed gate fails.
     - Fail: top-1 improvement can override safety/cost regression or empty denominators produce a passing report.
  3. [ ] Artifact integrity is recorded.
     - Verify: inspect manifest/report and run targeted tests.
     - Pass: report records gate hash, generated file list, output classifications, production artifact pre/post SHA256 snapshots, experiment joblib SHA256 sidecars when joblibs are written, and all scanned directories.
     - Fail: reports cannot prove which gates, files, and production-artifact hashes were used.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T4
- Checks:
  1. Run T3 and T4 acceptance commands.
  2. `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation_experiment_eval or curation_experiment_report' -v` exits 0 and collects tests.
  3. Confirm reports contain baseline-vs-candidate metrics, fixed gate values, pass/fail decisions, and no full raw prompt text.
  4. Confirm safety regression fixtures fail gates even when accuracy improves.
  5. Confirm production corpus/model artifact status is clean.
- On failure: create a fix task, rerun affected checks, then rerun V2.

### Wave 3

**T5: Add CLI orchestration, docs, and end-to-end tests** [medium] -- qa-engineer
- Blocked by: V2
- Description: Add a single documented end-to-end command path for this next phase: use a generated bounded curation run or tracked fixtures for tests, initialize gates, export candidates, evaluate, scan every generated output directory, and summarize next action. Add `curation_experiment.py scan --output-dir <experiment-dir>` for retraining experiment directories because `curation_pipeline.py scan` is confined to curation directories. Add tests that cover CLI sequencing, no-candidate failure, zero-denominator failure, network-blocked behavior, missing-curation-run behavior, production artifact confinement, prompt-safe reports, no-promotion boundary, stale output dirs, and path confinement. Update documentation to state how to interpret `passed`, `gate_failed`, and `tool_failed`, where generated experiment outputs live, and what remains manual/future promotion work.
- Files: `pi/prompt-routing/curation_experiment.py`, `pi/prompt-routing/tests/test_curation_experiment_cli.py`, `pi/prompt-routing/docs/curation-pipeline.md` or `pi/prompt-routing/docs/curation-experiments.md`.
- Acceptance Criteria:
  1. [ ] End-to-end experiment command works from generated curation output.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/e2e-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000 && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py run --curation-dir pi/prompt-routing/experiments/curation/e2e-smoke --output-dir pi/prompt-routing/experiments/retraining/e2e-smoke`
     - Pass: command exits 0 for `passed` or `gate_failed` with reports written; `tool_failed` uses a distinct nonzero exit; production artifacts are unchanged; outputs are under ignored experiment directories.
     - Fail: command requires manual steps, silently passes without candidates, writes outside experiment paths, or confuses gate failure with tooling failure.
  2. [ ] Documentation explains usage and boundaries.
     - Verify: inspect added/updated docs.
     - Pass: docs include commands, expected outputs, fixed gates, exact pass/fail interpretation, no-production-promotion boundary, review packet purpose, weak-label limitations, and deferred LLM-judge scope.
     - Fail: docs imply weak labels are accepted truth, omit gate thresholds, omit exit-code semantics, or imply generated artifacts are production-ready.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation-lead
- Blocked by: T5
- Checks:
  1. Run T5 acceptance commands.
  2. `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation or experiment' -v` exits 0 and collects tests.
  3. Run the end-to-end experiment command and scan its output.
  4. Confirm docs state that manual promotion, broad LLM judging, and production model updates are deferred.
  5. Confirm production corpus/model artifact status is clean.
- On failure: create a fix task, rerun affected checks, then rerun V3.

## Dependency Graph

```
Wave 1: T1 -> T2 -> V1
Wave 2: T3 -> T4 -> V2
Wave 3: T5 (depends on V2) -> V3
Final: V3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] A prompt-safe experiment directory can be produced from generated curation outputs without mutating production artifacts.
   - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/success-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000 && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py run --curation-dir pi/prompt-routing/experiments/curation/success-smoke --output-dir pi/prompt-routing/experiments/retraining/success-smoke && git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/test_set.pkl && git status --ignored --short -- pi/prompt-routing/experiments/retraining/success-smoke`
   - Pass: command exits 0 with `overall_status` of `passed` or `gate_failed`; `tool_failed` is nonzero; production corpus/model artifacts are unchanged; generated experiment files are ignored.
2. [ ] Fixed gates are declared before candidate export/evaluation and applied to baseline-vs-candidate metrics.
   - Verify: inspect `pi/prompt-routing/experiments/retraining/success-smoke/gates.json`, `manifest.json`, `report.json`, and `report.md`.
   - Pass: gates exist before exported rows/results, report references the gate hash, required metrics/denominators/row counts are present, weak-label-only comparisons are informational, and safety regression gates cannot be bypassed by top-1 improvement.
3. [ ] Candidate semantics and review boundaries match the PRD.
   - Verify: inspect exported candidate/review files and docs, then run `uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py scan --output-dir pi/prompt-routing/experiments/retraining/success-smoke`.
   - Pass: `accepted_route` remains null, weak labels are marked experimental, `needs_review` rows are in a separate prompt-safe packet, no full raw prompts appear in summaries/reports, scan passes, and no production promotion occurs.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- Credentials are not required except public network access for bounded curation sample refresh. If public source pulls are unavailable, the executor may use tracked fixtures for unit tests, but final archive must not claim candidate-quality conclusions from network-blocked data; a network-blocked final smoke is a blocker for archive unless the plan is updated to make fixture-only validation the explicit scope.
- Manual-only steps are not required because this plan is local, reversible, non-destructive, and does not promote rows or model artifacts.

### Required automated validation

1. [ ] Run targeted experiment validation.
   - Command: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation or experiment' -v`
   - Pass: exits 0, collects relevant curation/experiment tests, and has no errors or warnings
   - Fail: do not archive; fix tests or implementation and rerun

2. [ ] Run prompt-routing test suite.
   - Command: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -v`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; fix regressions and rerun

3. [ ] Run repo quick validation.
   - Command: `make test-quick`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; fix if related or update `## Execution Status` with blocker evidence

4. [ ] Run Python lint.
   - Command: `make lint-python`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; fix lint and rerun

5. [ ] Run task-specific end-to-end experiment smoke.
   - Command: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/final-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000 && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py run --curation-dir pi/prompt-routing/experiments/curation/final-smoke --output-dir pi/prompt-routing/experiments/retraining/final-smoke`
   - Pass: exits 0 with `overall_status` of `passed` or `gate_failed` after writing prompt-safe reports; `gate_failed` is acceptable only when it means candidate quality failed predefined thresholds, not when tooling crashed
   - Fail: do not archive; fix pipeline/source handling or document a real blocker

6. [ ] Run artifact safety checks.
   - Command: `git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/test_set.pkl && git status --ignored --short -- pi/prompt-routing/experiments/retraining/final-smoke && uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py scan --output-dir pi/prompt-routing/experiments/curation/final-smoke && uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py scan --output-dir pi/prompt-routing/experiments/retraining/final-smoke`
   - Pass: no production corpus/model artifacts changed; generated experiment files are ignored; every generated output directory is scanned and reports no credential/private-key/token/email/local-path leaks beyond allowed metadata
   - Fail: do not archive; fix confinement/redaction and rerun

Do not require exact test function names, exhaustive evidence files, or audit-grade traceability beyond command outputs, generated reports, manifests, and safety scan.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation.

- Required: no
- Justification: Automated validation is sufficient. This plan writes local ignored experiment outputs, does not promote rows, does not modify production model/corpus artifacts, and does not use paid/API judging.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This plan adds local experiment tooling and does not deploy or change runtime routing behavior.

If deployment is skipped because it is not required, `/do-it` may mark the deployment gate complete after confirming no runtime/deployment step exists.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual-validation non-applicability, deployment non-applicability, and repo-wide validation pass. Do not archive if production corpus/model artifacts were modified, if generated experiment outputs are outside ignored experiment directories, if reports include full raw prompts, if fixed gates were created after candidate results, if safety regressions can pass, or if the report implies weak labels are production truth.

## Execution Status

- Status: pending execution after review
- Last updated: 2026-05-26 by /review-it
- Notes: Review fixes applied to make gate ordering, generated-input handling, output confinement, label provenance, metric denominators, artifact safety, and archive evidence explicit. No implementation, validation, deployment, or archive gates have been executed.

## Handoff Notes

- Read `.specs/archive/prompt-router-curation-pipeline/PRD.md`, `.specs/archive/prompt-router-curation-pipeline/plan.md`, and `pi/prompt-routing/AGENTS.md` before implementing.
- Use existing MVP curation outputs at `pi/prompt-routing/experiments/curation/final-smoke` when available for smoke tests. If missing, regenerate with `curation_pipeline.py run` using bounded limits.
- Keep all experiment outputs ignored under `pi/prompt-routing/experiments/retraining/`.
- Prefer a single top-level script `pi/prompt-routing/curation_experiment.py` to match the existing `package = false` project pattern.
- Do not edit production training corpus or model artifacts in this plan.
- Do not commit or track raw prompts, full review rows, generated candidate JSONL, or experiment model artifacts unless a later manual promotion plan explicitly approves it.
- A failed candidate-quality gate is a valid experiment outcome, not necessarily an implementation failure. Tool crashes, missing required metrics, production artifact mutation, or prompt leakage are implementation failures.
- Fixed smoke paths in commands (`retrain-candidates`, `schema-smoke`, `e2e-smoke`, `success-smoke`, `final-smoke`) are canonical examples. Before running a command that writes one of these paths, `/do-it` must check whether the directory already exists. If it exists, use a collision-safe suffix such as `-$(date +%Y%m%d%H%M%S)` and record the actual path in the checklist evidence, or use the plan's implemented cleanup command after a dry-run confirms the target is under the correct experiment root. Do not overwrite non-empty generated directories silently.
