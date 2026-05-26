# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Gate sequencing contradiction | Bug | Automation Plan, T1/T2/T5, Validation Contract | Run `init-gates` before export/evaluate/run and require evaluate/run to fail without pre-existing gates | No new checklist item; T1/T2/T5 acceptance tightened |
| Fresh-session dependency on ignored final-smoke | Bug | Automation Plan, T2/T5, Success Criteria, Validation Contract, Handoff Notes | Use a deterministic generated curation run path for smoke; final-smoke becomes optional context only | No checklist change |
| Missing retraining gitignore before writes | Bug | Constraints, Automation Plan, T1, V1, Validation Contract | Make `.gitignore`/`git check-ignore` first preflight before generated retraining writes | No checklist change |
| Unsafe train.py production-write reuse | Bug | Constraints, T3, Validation Contract, Handoff Notes | Prohibit `train.run()` and `_save_artifacts()` in experiments; require explicit output paths and production write tests | No checklist change |
| Weak labels confused with real labels | Bug | Constraints, Objective, T2/T3/T4, Success Criteria | Separate label provenance and make weak-only candidate metrics informational; pass/fail quality gates only on production/manual labels | No checklist change |
| Empty metric datasets can pass | Bug | T4, T5, Validation Contract | Require row counts, denominators, non-empty candidates/eval labels, and defined empty-state behavior | No checklist change |
| Path confinement under-specified | Bug | T1, T5, Validation Contract | Require canonical root, symlink escape rejection, stale-dir fail-closed tests | No checklist change |
| Exact thresholds missing | Hardening | Constraints, T1, T4, Validation Contract | Add initial gate values and decision rules | No checklist change |
| Artifact safety insufficient | Hardening | Automation Plan, T3/T4, Validation Contract | Add SHA256 snapshots/sidecars, gate hash/timestamps, all-dir scans, ignored-file checks | No checklist change |
| Stale output dirs | Hardening | T1/T5, Handoff Notes | Require fail-if-exists or explicit overwrite/new run dir | No checklist change |
