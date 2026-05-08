# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Missing runtime/source preflight and reload verification | Bug | Automation Plan, Execution Checklist, Task Breakdown, Execution Waves, Dependency Graph, Validation Contract, Success Criteria | Add Wave 0 T0/V0 with realpath/checksum/runtime-load evidence and use it before implementation/live smoke | Add unchecked T0 and V0 items |
| Live probes against real `.env` are unsafe | Bug | Automation Plan, Execution Waves, Validation Contract, Handoff Notes | Replace real `.env` live smoke with synthetic fixture/test-only blocked path; real `.env` only via non-executing permission checks if available | No new item; covered by T0/T1/F3 |
| Parser/schema hardening after modular extraction causes throwaway work | Bug | Task Breakdown, Execution Waves, Dependency Graph | Reorder waves: T2 policy loader/schema decision first, then T3 modular refactor around final loader | Keep IDs T2/T3 but swap descriptions/dependencies |
| Missing `## Execution Status` | Bug | Add section near end | Add status ledger template for `/do-it` failure/manual status updates | No checklist item; final gates reference it |
| Dependency/runtime resolution and `.js` ESM import requirements missing | Bug | T2/T3 acceptance, Validation Contract | Add explicit `.js` import check, runtime import smoke, dependency placement and lockfile gates | Covered by T2/T3/V gates |
| Prefer yaml-mini before new dependency | Hardening | Alternatives, T2, Automation Plan | Make `pi/lib/yaml-mini.ts` the first parser candidate; add `yaml` only if documented unsupported | No new item |
| Redaction tests need synthetic fixtures and stdout/stderr assertions | Hardening | T1 acceptance | Add table-driven synthetic fixture requirements | No new item |
| Ask tests must be deterministic | Hardening | T1 acceptance | Add platform-injected ask tests | No new item |
| Rollback/archive cleanup incomplete | Hardening | Automation Plan, Validation Contract, Handoff Notes | Use changed-file manifest, runtime-copy rollback, log cleanup and secret scan | No new item |
| Subjective modular checks | Hardening | T3 acceptance | Replace with import direction, export API, duplication grep, and adapter/pure test separation | No new item |
