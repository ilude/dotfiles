# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Readiness API underspecified | Bug | T1, Success Criteria, Handoff Notes | Require pure snapshot-based APIs with explicit task map/list and no filesystem reads | none |
| Registered command tests missing | Bug | T3, T4, V2, Validation Contract | Require mocked ExtensionAPI command registration/handler tests | none |
| Blocked/waiting vocabulary and blocked-state policy unclear | Bug | Objective, T1, T2, T3, Handoff Notes | Add vocabulary table and explicit policy | none |
| Blocked/start output not actionable/redacted | Bug | T2, T3, T4, Validation Contract | Require output template, recovery commands, and redaction tests | none |
| Non-mutation/tombstone tests too weak | Bug | T1, T4, V1, V2 | Require tombstone fixture and full file/record snapshots | none |
| Deterministic ordering | Hardening | T1, T2, T3, Handoff Notes | Define lexicographic full-ID ordering before shortening/rendering | none |
| Focused validation omits security and repeats commands | Hardening | Automation Plan, V1, V2, Validation Contract | Use a single focused test command including task-security.test.ts | none |
| T5 scope creep | Hardening | T5, V3, Handoff Notes | Keep Option 2/3 docs as evidence-only out-of-scope notes unless README is already edited for current behavior | none |
