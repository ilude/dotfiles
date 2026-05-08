# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Not executable plan | Bug | Entire document | Convert spike note into executable plan with Objective, Task Breakdown, Execution Waves, Success Criteria, Validation Contract, Execution Checklist, Execution Status | Add unchecked checklist items for all tasks/gates |
| Undefined seam | Bug | Objective, Task Breakdown, Wave 0 | Require discovery/comparison of `before_provider_request` and generation-dispatch seams; stop if no seam exists | Add S1/S2 tasks and V1 gate |
| False-positive same-turn proof | Bug | Execution Waves, Success Criteria, Validation Contract | Require deterministic order trace, conflicting routes, per-turn decision IDs, actual provider invocation correlation | Add S3/S4 tasks and V2 gate |
| Safety/privacy incomplete | Bug | Constraints, Validation Contract, Execution Waves | Add provider trust, credential denial, redacted evidence schema, timeout/fallback/stale-route prevention | Add S5 task and V3/F gates |
| Atomic dispatch missing | Bug | Execution Waves, Success Criteria | Require immutable decision object or explicit blocker if runtime cannot consume one | Covered by S3/S4 tasks |
| Latency/failure UX | Hardening | Constraints, Success Criteria | Add timeout budget and user-visible fallback/status reason | Covered by S5/V3 |
| Feasibility vs cleanup split | Hardening | Out of Scope, Task Breakdown | Defer resolver consolidation/control-plane cleanup until proof passes | No extra checklist item |
| Operator proof fields | Hardening | Success Criteria, Manual Validation | Add `same_turn_applied`, `route_decision_id`, `route_resolution_reason` | Covered by S4/S6 |
| Negative/multi-turn tests | Hardening | Execution Waves, Validation Contract | Add negative and out-of-order cases | Covered by S4/V2 |
| Rollback/archive gates | Readiness | Validation Contract, Final Gates | Add rollback manifest, scans, git status, archive criteria | Add final gates F1-F5 |
