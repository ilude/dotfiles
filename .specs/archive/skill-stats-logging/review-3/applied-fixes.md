# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Schema must use `data`, not `content` | Bug | T2/schema, T3/T4, Validation Contract | Standardize `type: custom`, `customType: skill-load`, `data` payload | No new item; T2/T3/T4 acceptance amended |
| Explicit skill loads not covered by before_agent_start | Bug | Objective, T4, Success Criteria, Validation Contract | Require `skill-loader.ts` or input-hook explicit capture plus prompt inventory separation | No new item; T4 amended |
| Strict safe payload mapping | Bug/Security | T2, T4, T5, redaction | Require allowlist mapper, runtime validation, negative tests | No new item; T4/T5/F5 amended |
| Resume-safe exact evidence/manifest | Bug/Readiness | Automation Plan, P1/P2, archive preflight | Make preflight immutable, owned manifest exact, complete changed-file list | No new item; P1/P2/F6 amended |
| Parser diagnostics/dedupe/timestamp/traversal | Bug/QA | T2, T3, T5 | Define counters, sorting, grammar, windows, traversal contract | No new item; T2/T3/T5 amended |
| Redaction classification/tainted cleanup | Hardening | Validation Contract, rollback | Add classification when scan non-empty and immediate tainted evidence cleanup | No new item; F5 amended |
| node_modules ignored mutation check | Hardening | T1, V2/F6 | Add pre/post metadata/status check for inspected node_modules paths | No new item; T1/V2/F6 amended |
| Manual validation scope | Hardening | Validation Contract | Manual required only if automated control cannot prove disk persistence/report | No new item; F3 semantics clarified |
