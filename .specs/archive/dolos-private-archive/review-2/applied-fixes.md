# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Preflight can run parallel with edits | Bug | Execution Checklist, Task Breakdown, Execution Waves, Dependency Graph | Add Wave 0 T1/V0 and make modifying tasks depend on V0 | Add V0; move T1 out of Wave 1 |
| Phase 2 `/commit` in MVP | Bug/scope | Objective, Task Breakdown, Waves, Handoff | Remove T9 executable work; keep `/commit` as deferred future plan | Remove T9 checklist/task/dependency |
| Missing age SSH proof | Bug | Task Breakdown, Wave 0, Validation Contract | Add early generated SSH key age proof before implementation | Add to T1/V0 acceptance |
| Missing shared transaction/state contract | Bug | Task Breakdown, Waves | Make T3 define state/transaction/package contracts before pack/unpack/status | V1 blocks T4-T6 |
| Unpack promotion/rollback ambiguity | Bug/security | Wave 2 T5, Success Criteria, Validation Contract | Add transactional promotion/rollback and crash-point tests | No new task; strengthen T5/V2 |
| False-passing commands | Bug/automation | Automation Plan, T7, Validation Contract | Replace `|| true` verification with failing assertions/allowlist scripts | No new task |
| `.dolos` repo policy unclear | Bug | Constraints, Objective, Handoff | State authorized_keys policy; artifact generated only from fixtures unless user explicitly packs real private | No new task |
| Missing exact validation commands | Bug/QA | Wave gates, Success Criteria | Name tests for e2e temp repo, worktree isolation, hook install, evidence hygiene | No new task |
| Docker over-specified | Hardening | Project Context, T2, V1, Validation Contract | Make local Go build primary, Docker parity when available | No checklist change |
| Package boundaries vague | Hardening | T3/T4/T5/T6 | Require pure state/archive/git/crypto/CLI boundaries | No checklist change |
