# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| No-secret check mismatch and self-scan | Bug | Automation Plan, V2, Success Criteria, Validation Contract | Write scan to temp outside evidence, move sentinel/log into evidence, use test -s safely | No checklist ID change |
| registerCommand slash ambiguity | Bug | Constraints, Project Context, T3 | Clarify registered names are unprefixed while invocations use slash | No checklist ID change |
| Runtime state incomplete | Bug | Constraints, T3 | Require mode/health/rules/status inputs in per-registration state object | No checklist ID change |
| make check exception lacks baseline | Bug | Automation Plan, V0, Validation Contract | Add pre-edit `make check` baseline when repo/planned paths dirty or when exception may be used | V0 details updated |
| Audit assertions | Hardening | T3 | Require tests for previousMode/newMode/alias and no invalid transition record | No checklist ID change |
| PowerShell obfuscation limits | Hardening | T1 | Require explicit non-goal docs for unsupported obfuscations | No checklist ID change |
