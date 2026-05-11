# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Missing required plan sections | Bug / automation-readiness | Add Task Breakdown, Execution Waves, Success Criteria, Validation Contract | Make plan standalone-runnable and section-integrity compliant | Add/align unchecked tasks and gates only |
| Active `/team` registration ambiguity | Bug | Execution Checklist, Task Breakdown, Execution Waves, Validation Contract | Require disabling `pi/extensions/agent-team.ts` registration and testing registered commands | Refine T4, add exact evidence |
| Undefined subagent team/lead interface | Bug | Task Breakdown, Execution Waves | Define exact registered tool/schema/output contract before implementation | Refine T6 acceptance |
| Task persistence/dependency semantics | Bug | Execution Waves, Success Criteria | Add atomic write, lifecycle, tombstone, migration, outcome-code contracts | Split into T7/T8/T9/T10 |
| Missing focused commands/evidence | Bug / automation-readiness | Validation Contract, Execution Waves | Add exact command list and evidence paths | Add validation evidence mapping |
| Task MVP too broad | Bug / scope | Task Breakdown, Execution Waves | Split task work into foundation, graph/security, tools/UX | Keep all tasks unchecked; reorder dependencies |
| Missing `skipped` semantics | Bug | Execution Waves | Define lifecycle matrix and tests | Refine T7/T11 |
| Archive active-vs-historical ambiguity | Bug / safety | Validation Contract, Final gates | Add archive manifest and active-source grep allowlists | Refine F2/F3 |
| Single redaction API | Hardening | Execution Waves | Require shared sanitizer API across registry/render/tools/commands | Refine T9/T12/T13 |
| Emergency/admin recovery check | Hardening | Execution Waves | Add maintenance-path validation before tool restrictions | Refine T5 |
| Operator migration/help messages | Hardening | Execution Waves | Require docs/help/status migration outputs without preserving `/team` workflow | Refine T4/T15/F1 |
| Branch contract clarity | Hardening | Execution Waves | State Windows Terminal supported; Ghostty fallback unless implemented | Refine T1/T2 |
| Durable evidence ledger | Hardening / automation-readiness | Validation Contract, Execution Status | Require per-item ledger format | Add evidence ledger rules |
