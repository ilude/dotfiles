# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Missing inline lifecycle/schema/atomicity/tool details | Bug | Objective, new Implementation Contracts, T1/T3/T5 | Add lifecycle matrix, schema policy, all-or-nothing batch model, tool schemas | No new implementation task; clarify existing T1/T3/T5 |
| Redaction not mandatory across paths | Bug | Security/Data Safety, T2, V1, V3, success criteria | Require integration across registry/tools/renderer/slash output | No new task; strengthen T2 and gates |
| Evidence commands don't capture logs | Bug/readiness | Automation Plan, Validation Contract, checklist/final gates | Add tee wrappers and exact evidence mapping | Add P0 preflight checklist/task/gate item |
| /tasks grammar/display priority underspecified | Bug | UX/Command Contract, T4, T6 | Add canonical grammar, compact priority, warning copy, retry/reopen language | No new task; clarify T4/T6 |
| TS module/import/test prerequisites unclear | Bug | Implementation Contracts, T5/V gates | Add import style, TypeBox schema, extension install prerequisite, auto-discovery check | No new task |
| Archive/rollback safety | Hardening | Automation Plan, Validation Contract, Handoff | Add path-safe rollback and secret scan archive preflight | F5 evidence clarified |
| make wrapper required | Hardening | Automation Plan, V4, Validation Contract | Make `make check-pi-extensions` required unless unrelated infrastructure failure is documented | No new task |
| Idempotency for create/batch failure | Hardening | Implementation Contracts, T1/T3/T5 | Add clientKey/repair-handle expectation for retry after persist_failed | No new task |
