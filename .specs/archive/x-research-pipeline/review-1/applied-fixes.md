# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Missing Validation Contract / Execution Checklist / Execution Status | Bug / readiness | Add sections near end | Add durable validation rules, evidence paths, checklist, status | Add unchecked items for T0-T8, V1-V3, final gate |
| MVP scope too broad | Bug / scope | Objective, Task Breakdown, Execution Waves | Add T0 reuse spike and Phase 1 follow-list-first; defer browser/tweets/search until after core follow workflow | Add T0 checklist item and clarify dependencies |
| Python packaging/CLI unspecified | Bug | Provider Interface, T1, T6, Validation Contract | Specify `src/x_research`, pyproject scripts/deps, `uv sync`, CLI smoke | Add checklist validation for package setup |
| Graph integrity rules insufficient | Bug | Proposed SQLite Tables, T2 | Add constraints, Page semantics, complete snapshot gating, migrations | Add checklist validation for schema constraints |
| PII/age/git hooks incomplete | Bug / security | Data Layout, T3, Validation Contract | Add .gitignore allowlist, scanner/hook install, recipient contract, round-trip tests | Add checklist items for scanner/hooks/encryption |
| Browser safety/live prerequisites ambiguous | Bug / security | T5, Validation Contract | Define browser read-only contract, mocked boundary, live skip artifact | Add checklist item for browser backend and live smoke skip/run |
| Raw payload minimization/redaction/rollback | Hardening | Data Layout, T3, T4, Validation Contract | Add allowlist default, redaction, atomic writes, cleanup/rollback | Covered by T3/T4 checklist |
| Provider contract examples | Hardening | T4 | Add config schema, endpoint mapping, fixtures, pagination/rate-limit rules | Covered by T4 checklist |
| Evidence artifacts | Hardening/readiness | Validation Contract, Execution Checklist | Require `.specs/.../evidence/` outputs | Add final evidence bundle checklist |
