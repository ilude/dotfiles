# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| TLS/WSS and auth under-specified | Bug | Constraints, Automation Plan, T2, T4, T6, Validation Contract, Handoff Notes | Add certificate path/generation strategy, certificate fingerprint/channel binding, selected WSS runtime decision, plaintext rejection, MITM/transcript mismatch tests | No new task; expand T2/T4/T6/V2/V3 acceptance |
| Trusted-key config under-specified | Bug | Constraints, T2, T5, Validation Contract, Handoff Notes | Define `~/.pi/coms-lan/authorized_keys`, import/list/remove tools, permissions, atomic writes, invalid/missing trust-file tests | No new task; expand T2/T5 acceptance |
| Local hub lifecycle under-specified | Bug | Constraints, T3, V2, Handoff Notes | Add lock primitive requirements, stale/corrupt state recovery, PID/port liveness, process-level test, socket/timer cleanup, endpoint retirement | No new task; expand T3/T6/V2 acceptance |
| Validation can be false-positive | Bug | T4, T6, Success Criteria, Validation Contract | Require real UDP socket path, real localhost WSS listeners, identity/key-confusion tests, persisted audit scans | No new task; expand T4/T6/F1 |
| Dependency/runtime validation incomplete | Bug | Automation Plan, T2, Project Context | Add WSS/TLS/UDP compatibility smoke tests, dependency placement rules for pi/extensions and pi/tests | No new task; expand T2 |
| Audit sanitization and retention | Hardening | T5, T6, Success Criteria, Validation Contract | Add JSONL allow-list, length/control-char handling, rotation/retention/write-failure tests | No new task; expand T5/T6 |
| Archive preflight scans | Hardening | Final Gates, Validation Contract, Handoff Notes | Add git status and secret/runtime artifact scan requirements | No new task; expand F5/Validation Contract |
| Milestone/checkpoint clarity | Hardening | MVP Boundary, Execution Waves, Handoff Notes | Clarify sequence is controlled MVP, not unbounded product slice | No checklist impact |
| Validation wrapper | Hardening | Automation Plan, T6, Validation Contract | Add wrapper target/script requirement such as `make check-coms-lan` or package script | No new task; expand T6/F2 |
| Prior-art fallback | Hardening | Automation Plan, T1, Handoff Notes | Add fallback behavior if remote URLs unavailable and require recording fetched commit/date | No checklist impact |
| Missing Execution Status heading | Automation readiness | End of plan | Add `## Execution Status` for section integrity and /do-it updates | No checklist impact |
