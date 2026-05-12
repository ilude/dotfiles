# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Module-level state violates instance-local requirement | Bug | Constraints, Objective, T3, Success Criteria | Require per-registration closure state; add multi-instance independence test | No new task; T3 updated |
| Missing evidence directory and unsafe dirty-tree rollback | Bug | Automation Plan, Execution Waves, Success Criteria, Validation Contract, Handoff Notes | Add `mkdir -p`, planned-path baseline status/diff, dirty planned-path gate, safe rollback guidance | Final gates unchanged; validation gate content updated |
| Handler-level tests missing/optional | Bug | T2/T3 acceptance criteria, V2, Success Criteria | Require registered handler tests for `/dc` mode, `bash`, `pwsh`, and file protections after mode switch | No new task; T3 updated |
| Wave 2 parallel file conflict | Bug | Execution Checklist, Task Breakdown, Execution Waves, Dependency Graph | Collapse T3/T4 into one integration task and one validation gate | Remove T4 checklist/task; V2 depends only T3 |
| Missing Execution Status | Bug | Add section near end | Add required heading initialized to not started | Add no checkbox; status section only |
| Whitelist semantics underspecified | Hardening | Constraints, T2 | Define exact regex allowlist v1 and matching semantics | T2 updated |
| Unscoped tools metadata behavior unspecified | Hardening | T1, Constraints | State missing `tools` preserves legacy behavior and applies to all command tools | T1 updated |
| Mode transition audit/extra args | Hardening | T3 | Require transition record/notification and exact argument count validation | T3 updated |
| Evidence redaction/secret check | Hardening | Automation Plan, Final Gates, Validation Contract | Add no-secret evidence check before archive | F5 wording retained; final gate details updated |
| PowerShell evasions/operators | Hardening | T1/T2/T3 acceptance criteria | Add positive/negative/evasion/operator tests or non-goal docs | T1/T2/T3 updated |
| `make check` contradiction | Hardening | Automation Plan, Success Criteria, Validation Contract, Handoff Notes | Define baseline exception process for pre-existing failures | F2 unchanged; validation clarified |
