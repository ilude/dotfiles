# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Raw session discovery unsafe | Bug | T1, Validation Contract | Replace open-ended grep/read with redaction-safe summarizer contract and archive content scan | none |
| Final gates out of order | Bug | Checklist, Dependency Graph, Validation Contract | Rename F5 forward decision, F6 archive preflight sequentially | rename final gate IDs |
| No-hook path branch unclear | Bug | Execution Waves, Dependency Graph, Execution Status | Stop after V1 before Wave 2 mutations unless approval exists | none |
| Event schema/path leakage | Bug | T2, T4, Success Criteria | Define exact `customType: skill-load`, `schemaVersion`, payload and safe path labels | none |
| Evidence paths/rollback/archive portability | Bug | Automation Plan, P1/P2, Validation Contract | Use `$REPO_ROOT`, exact manifest, untracked status, content redaction scan | none |
| Runtime load smoke | Hardening | V2/Validation Contract | Add import/load smoke requirement | none |
| Report escaping/safe path | Hardening | T3, Success Criteria | Add escaping/label caps/session root label | none |
| QA fixture hardening | Hardening | T5 | Add mixed duplicates, real envelopes, skill paths, windows | none |
| CLI args | Hardening | T3/T2 | Define usage and invalid args | none |
| make check fallback | Hardening | Validation Contract | Allow classified unrelated failures after task validation | none |
