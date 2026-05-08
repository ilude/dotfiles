# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Unproven `prompts` settings schema | Bug | Automation Plan, Task Breakdown, Execution Waves, Success Criteria, Validation Contract | Add T0 discovery task to verify Pi prompt-template settings/docs/source before editing settings; strengthen checks beyond grep | Add T0 checkbox; make T1 depend on T0 |
| No runtime/registry proof of `/handoff` discovery and shadowing | Bug | Automation Plan, Execution Waves, Success Criteria, Validation Contract | Add automated `get_commands`/registry check if available, otherwise mandatory manual smoke before archive; scan all `pi/extensions/*.ts` | Add criteria to T2/V1/F3 |
| Undefined behavior delta from hidden TS command to prompt template | Bug | Constraints, T2 acceptance, Handoff Notes | State native template intentionally changes hidden dispatch/echo; require `$ARGUMENTS` behavior and manual/registry confirmation | No new task; strengthen T2 |
| Skill path/discovery unproven | Bug | T3, V1, Success Criteria, Handoff Notes | Require inspection of skill loader conventions and either runtime-discoverable path or documented source-only placement | Strengthen T3 |
| Unsafe rollback and pre-existing `pi/settings.json` diff | Bug | Automation Plan, Handoff Notes | Add preflight diff snapshot and rollback preserving unrelated changes; remove `git restore` for untracked files | No new task |
| Prompt-template content safety | Hardening | T2, V1, Validation Contract | Add safety review for trusted markdown command contents | No new task |
| Weak grep/frontmatter checks | Hardening | T2 acceptance, Success Criteria | Validate frontmatter delimiters, description, argument-hint, `$ARGUMENTS` | No new task |
| Loose `make check` bypass | Hardening | Validation Contract | Make archive-blocking unless captured blocker and compensating checks are documented | No new task |
| Ambiguous docs target | Hardening | T4 | Require inspect-and-choose exact tracked documentation file | No new task |
| Missing `## Execution Status` | Hardening/readiness | New section | Add plan execution status ledger | No checklist completion change |
