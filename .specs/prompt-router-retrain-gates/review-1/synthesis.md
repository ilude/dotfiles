---
date: 2026-05-26
status: synthesis-complete
---

# Review: Prompt Router Candidate Review and Retrain Gates

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness and automation-readiness reviewer | Mandatory standard reviewer for standalone execution gaps | Assume fresh `/do-it` lacks hidden context and ambiguous commands pass falsely | `.specs/prompt-router-retrain-gates/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Safety, path, and data-leakage reviewer | Mandatory standard reviewer for operational and prompt-data risks | Assume path escapes, prompt leakage, and production writes happen unless forbidden | `.specs/prompt-router-retrain-gates/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope and simpler-solution reviewer | Mandatory standard reviewer for overbuild and PRD fit | Assume the plan can overfit process instead of proving useful router data | `.specs/prompt-router-retrain-gates/review-1/product-manager.md` |
| python-pro | python-pro | Python experiment-tooling and sklearn artifact-safety reviewer | Plan adds Python CLI/tooling around training/evaluation | Assume train.py reuse mutates production joblibs or evaluates wrong data | `.specs/prompt-router-retrain-gates/review-1/python-pro.md` |
| qa-engineer | qa-engineer | Experiment validation and false-positive gate reviewer | Plan success depends on trustworthy tests and metrics | Assume reports can look complete over empty or meaningless datasets | `.specs/prompt-router-retrain-gates/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Local automation, artifact confinement, and resumability reviewer | Plan relies on CLI sequencing, ignored dirs, scans, and resume gates | Assume stale dirs, network failure, wrong ordering, or ignored artifacts hide failure | `.specs/prompt-router-retrain-gates/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- High: final archive path depended on ignored `final-smoke` curation output without a deterministic regenerate/fallback path.
- High: gate config existence was checked, but evaluation/run was not required to fail when gates were missing or created after results.
- Medium: latency and shadow comparison schemas were underdefined.
- Medium: retraining experiment ignore coverage was not mandatory before first write.

### security-reviewer
- High: output path confinement did not require canonical resolution, symlink rejection, or fail-closed checks before writes.
- High: data-classification rules did not cover all exported candidate, manifest, temp training, or failure-log artifacts.
- Medium: gate metadata needed immutable hashes/timestamps.
- Medium: final safety scan omitted refreshed curation output directories.
- Medium: git status alone was insufficient for production mutation detection.

### product-manager
- High: training on weak proposed routes risks measuring the classifier against its own prior outputs rather than real route quality.
- High: commands depended on ignored `final-smoke` state, not deterministic generated inputs or tracked fixtures.
- Medium: plan should reuse existing train/evaluate helpers where safe instead of duplicating broad tooling.
- Medium: exact gate values and decision rules were not specified.

## Additional Expert Findings
### python-pro
- High: `train.py` hardcodes production model paths and `_save_artifacts()` writes `models/router_v3.joblib` and hash sidecars; the plan did not prohibit unsafe calls.
- High: retraining output ignore coverage was missing before first generated write.
- Medium: manifests need row IDs and content hashes for train/eval/holdout partitions.
- Medium: experiment joblibs need SHA256 sidecars and load verification.
- Medium: label provenance must separate production/manual labels from weak proposed labels.

### qa-engineer
- High: metrics could pass with empty candidate rows, empty baseline labels, or empty shadow labels because key presence was enough.
- High: gate-failed exit-code semantics were undefined, risking false success or false tooling failure.
- Medium: deterministic metric fixtures need exact expected formulas, denominators, deltas, and NaN/null handling.
- Medium: gate fixtures need coverage for over-routing, latency, empty buckets, and partition leakage.

### devops-pro
- High: automation sequence exported candidate rows before initializing gates, contradicting the plan's own gate-before-results invariant.
- High: `.gitignore` did not include retraining outputs, but commands could write them before validation noticed.
- Medium: fixed output directories could collide with stale runs.
- Medium: ignored-file checks needed `git check-ignore` or `git status --ignored`, not plain status.
- Medium: path confinement needed explicit `..`, absolute outside, and symlink escape tests.

## Suggested Additional Reviewers
- python-pro -- relevant because the plan adds Python CLI and training/evaluation wrappers around an existing uv project.
- qa-engineer -- relevant because the plan hinges on metrics/gates that can give false confidence if under-specified.
- devops-pro -- relevant because `/do-it` needs deterministic local automation, path confinement, ignored artifact handling, and resumability.

## Bugs (must fix before execution)
1. Gate sequencing is contradictory: Automation Plan exports rows before gate initialization, while the objective requires gates before results.
2. The plan depends on ignored `final-smoke` curation outputs, so a fresh session may not have the required input.
3. Retraining outputs are not required to be ignored before first write.
4. `train.py` production-write hazards are not explicitly prohibited or tested.
5. Weak proposed routes are not sufficiently separated from real/manual labels, making candidate-quality conclusions misleading.
6. Report/gate success can pass over empty or meaningless datasets.
7. Output path confinement and symlink escape protections are not concrete CLI invariants.

## Hardening
1. Define exact initial gate thresholds and mark weak-label-only metrics informational.
2. Require gate hashes/timestamps in reports and manifests.
3. Add pre/post SHA256 snapshots for production corpus/model artifacts.
4. Define data classification for every output file and scan all generated directories.
5. Require partition row IDs and content hashes to prove baseline/candidate use identical eval inputs and disjoint holdout/training sets.
6. Define CLI exit-code semantics for tool failure vs candidate gate failure.
7. Require non-empty row counts and metric denominators.
8. Require experiment joblib SHA256 sidecars if experiment model artifacts are written.
9. Require stale-output protection for fixed output directories.

## Simpler Alternatives / Scope Reductions
1. Keep this as a thin experiment wrapper around existing safe helpers instead of duplicating broad training/evaluation architecture.
2. Re-scope the candidate-quality claim: weak proposed-route training may be useful as a smoke experiment, but pass/fail quality gates must rely on existing production/manual labels, not weak labels.
3. Use generated bounded curation sample as the canonical smoke input; use tracked fixtures only for tests and network-blocked tooling behavior.

## Automation Readiness
- Agent-runnable operational steps: Not ready before fixes. Commands existed, but order, input existence, output confinement, and stale-run behavior were under-specified.
- Credential/auth flow clarity: Public network only; no manual credential gate needed.
- Evidence and archive gates: Present but needed stronger ignored-file checks, gate order evidence, row counts, hash snapshots, and all-generated-dir scans.
- Manual-only steps and justification: Manual validation is correctly not required; the plan is local and non-promoting.
- Execution Checklist: Present and aligned at task/gate level; no new executable tasks were added, but task details needed stronger acceptance criteria.

## Contested or Dismissed Findings
1. The checklist-subitem concern was downgraded. The plan's requested invariant requires one checkbox per executable task/gate/final gate, not every acceptance subcommand; detailed commands can remain in acceptance criteria.
2. Broad manual review was not added. The PRD explicitly rejects manual-first review; exception packet generation remains the right scope.

## Verification Notes
1. `.gitignore` currently contains `pi/prompt-routing/experiments/curation/**` but not retraining coverage, verified with grep.
2. `pi/prompt-routing/train.py` defines `MODEL_DIR`, `MODEL_PATH`, `HASH_PATH`, `_save_artifacts()`, and writes `models/router_v3.joblib` plus SHA256 sidecar, verified with grep.
3. The plan's Automation Plan had export before init-gates and multiple commands referencing `final-smoke`, verified with grep over the plan.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-retrain-gates/review-1/reviewer.md` | read | usable artifact |
| security-reviewer | `.specs/prompt-router-retrain-gates/review-1/security-reviewer.md` | read | usable artifact |
| product-manager | `.specs/prompt-router-retrain-gates/review-1/product-manager.md` | read | usable artifact |
| python-pro | `.specs/prompt-router-retrain-gates/review-1/python-pro.md` | read | usable artifact |
| qa-engineer | `.specs/prompt-router-retrain-gates/review-1/qa-engineer.md` | read | usable artifact |
| devops-pro | `.specs/prompt-router-retrain-gates/review-1/devops-pro.md` | read | usable artifact |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6/6 reviewers succeeded; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected reviewer artifacts read |
| Recovery calls | not run | no missing or unusable artifacts |
| Verification | unknown | grep/read used for `.gitignore`, plan, and `train.py` evidence |
| Synthesis | unknown | `.specs/prompt-router-retrain-gates/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-retrain-gates/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed after each plan edit
- Standalone-readiness result: blocked; remaining blockers written to `.specs/prompt-router-retrain-gates/review-1/standalone-readiness-blockers.md`
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-retrain-gates/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Fix the remaining standalone-readiness blockers in `.specs/prompt-router-retrain-gates/review-1/standalone-readiness-blockers.md` before `/do-it`.
