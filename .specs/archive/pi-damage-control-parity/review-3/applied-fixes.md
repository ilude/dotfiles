# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Invented/ambiguous config contract | Bug | Automation Plan, T2, T6 | Replace `dangerCtrl.claudePolicyPath` with in-repo discovery + concrete optional `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` and documented settings object | No new checklist item; T2/T6 expanded |
| Phase B scope contradiction | Bug | Objective, T3, T4, Success Criteria | Make Phase B mandatory and remove conditional language | No checklist change |
| Unsupported exfil semantics | Bug | Automation Plan, T1, T2, T5, Success Criteria | Require `exfil` classification/support; fail claims if excluded | No checklist change |
| loadYamlViaPython reliability | Bug | T2, Validation Contract | Require helper upgrade or in-process YAML dependency and tests for missing Python/PyYAML | No checklist change |
| No-spawn gates too narrow | Bug | T4, T5, G2, G3 | Expand scanning to all changed Pi test/helper files with oracle allowlist | No checklist change |
| Coverage debt can hide non-parity | Bug | T5, F5, Success Criteria | Require coverage_debt_count=0 for claimed Phase A patterns unless deferred/excluded | No checklist change |
| Pi docs constraints missing | Bug | Constraints, T2, T6, F5 | Add helper-placement rule, docs exception, source-vs-runtime archive guard | No checklist change |
| Oracle canaries/unhealthy policy tests | Hardening | T2, T5 | Add explicit allow/ask/block canaries and health scenario artifacts | No checklist change |
| Rollback active session validation | Hardening | Risk, Handoff | Add reload/smoke policy check guidance after rollback | No checklist change |
