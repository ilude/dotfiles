# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Handler-only tests can be mistaken for runtime proof | Bug | Context & Motivation, Objective, T1, T2, Success Criteria | Require upstream existing generic runtime evidence and damage-control-specific dotfiles handler tests; stop claiming dotfiles tests alone prove AgentSession behavior | Preserve T1/T2 IDs; clarify acceptance criteria |
| Upstream pi-mono edits allowed without gates | Bug | Constraints, Risk, T3, Validation Contract, Handoff Notes | Make upstream writes out of scope; if upstream runtime defect is found, stop and create a separate upstream plan | T3 remains but changed to dotfiles-only implementation/documentation |
| Plan does not close functions.bash bypass | Bug | Objective, T3, Success Criteria, Handoff Notes | State this plan can document/diagnose external API harness bypass but cannot patch out-of-repo developer tools unless owner is found in scope | Preserve checklist; no new task |
| Destructive rollback command | Bug | Automation Plan, Validation Contract, Handoff Notes | Remove default `git checkout --`; use diff/reverse-patch guidance and require explicit confirmation for destructive rollback | No checklist change |
| Hard-coded path and fuzzy grep | Bug/Hardening | Constraints, Automation Plan, T1, V1 | Introduce `PI_MONO_DIR` variable/default, missing-checkout branch, mandatory evidence file schema | T1 clarified only |
| Evidence/secret/archive gaps | Hardening | Automation Plan, T1, T4, F5, Validation Contract | Add mandatory evidence files, redaction requirements, secret-pattern scan, archive preflight | Preserve F5; clarify requirements |
| Missing dependency install | Hardening | Automation Plan, V gates, Validation Contract | Add `pnpm install --frozen-lockfile` before pnpm test/typecheck | No checklist change |
| Missing Execution Status section | Automation readiness | Add section near end | Add empty status section for /do-it updates and section integrity | No checklist change |
