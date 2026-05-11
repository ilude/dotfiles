# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Same-turn proof sequenced too late | Bug | Objective, Execution Checklist, Task Breakdown, Execution Waves, Dependency Graph, Success Criteria | Add T0 as first blocking proof/inventory gate; make failure stop/archive-blocking | Add T0 and V0 checklist items; shift dependencies |
| Placeholder verification commands | Bug | Automation Plan, Execution Waves, Validation Contract | Replace help-only/generic checks with named commands/fixture expectations and uv/pnpm commands | No completion marked |
| Missing evidence convention | Bug | Automation Plan, Execution Checklist, Validation Contract, Execution Status | Add spec-local evidence directory conventions and required artifacts | No completion marked |
| Ambiguous invalid mode/failure behavior | Bug | Constraints, T2, T9, Success Criteria | Define fail-closed semantics for invalid modes and subprocess/parser failures | No completion marked |
| Privacy/rollback/archive gaps | Bug | Automation Plan, T9, Manual validation, Archive rule | Add synthetic prompts, sanitized evidence template, rollback manifest and artifact inventory | No completion marked |
| Single route module and matrix hardening | Hardening | T1, T6, T7, T8 | Require single `RouterSize` module and compact fixture matrices | No completion marked |
| Scope staging | Hardening | Objective, Execution Waves, Handoff Notes | Keep V1 incremental and stop after proof failure; defer speculative resolver expansion | No completion marked |
| Validation command consistency | Hardening | All validation gates | Normalize pnpm install/typecheck/test and uv-run checks | No completion marked |
| Missing Execution Status | Readiness | Plan end | Add durable status section | Add no checklist completions |
