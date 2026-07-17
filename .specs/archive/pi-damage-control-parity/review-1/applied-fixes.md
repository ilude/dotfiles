# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Ambiguous parity boundary | Bug | Objective, Success Criteria, Task Breakdown, Execution Waves | Convert to staged Phase A/B/C scope and prohibit misleading full-parity claims | Add/rename tasks for scope contract and coverage debt |
| Undefined canonical source/merge semantics | Bug | Automation Plan, T2/T3 details | Specify Claude bashToolPatterns canonical for Phase A, Pi fallback only, no merge/overlays until tested | T2 acceptance criteria expanded |
| Underspecified oracle | Bug | T5 details, Validation Contract | Require Claude-vs-Pi parity runner and mismatch artifact | T5 acceptance criteria expanded |
| YAML/regex compatibility | Bug | T2/T3 details, Success Criteria | Require typed YAML normalization, boolean coercion, Node regex compile-all fail-closed | T2/T3 criteria expanded |
| Path/tool scoping | Bug | T3/T4 details | Bash-only source scope; separate pwsh overlay; Windows/MSYS path tests | T3/T4 criteria expanded |
| Vague evidence automation | Bug | Automation Plan, Validation Contract, F gates | Add exact evidence filenames, tee commands, manifest, stale-evidence checks | Final gates expanded |
| check-pi-ci insufficient | Bug | Constraints, Validation Contract, F2 | Require check-pi-extensions or explicit typecheck + tests | F2 criteria updated |
| Evidence secret handling | Hardening | Automation Plan, T0, F5 | Add pre/post evidence secret scan/redaction/abort rules | F5 expanded |
| Fake executor/no-spawn | Hardening | T4/T5 | Require no real shell/pwsh execution assertions | T4/T5 expanded |
| Negative controls | Hardening | T5 | Add safe near-miss fixtures | T5 expanded |
| Rollout note | Hardening | T6, F4 | Add rollout-note artifact for Pi restart/reload behavior | T6/F4 expanded |
| Unsupported-feature ledger | Hardening | T6, Success Criteria | Make ledger concrete with Phase C statuses | T6 expanded |
