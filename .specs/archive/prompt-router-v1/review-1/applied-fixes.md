# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Parallel Wave 1 edits same files | Bug | Task Breakdown, Execution Waves, Dependency Graph | Serialize T1→T2→T3 and clarify no parallel edits to same files | No new checklist items; dependencies change only |
| Evidence commands do not record exit/cwd and may leak secrets | Bug | Automation Plan, P0, Validation Contract | Add evidence wrapper requirements, sanitize/scan after writes | No new item |
| Route profile source of truth vague | Hardening | T3 | Define route profile table/settings/RouteState union requirements | No new item |
| Artifact availability/eval gates contradictory | Bug | T2, T7, Validation Contract | Define default t2 required; non-default explicit artifact reasons; robust commands | No new item |
| Manual validation underspecified | Bug | Manual validation | Add synthetic prompts, local Pi session procedure, sanitized capture | No new item |
| Scope too broad for V1 | Hardening | Objective, T6, T7 | Mark telemetry/eval as minimal V1 contracts; defer rotation/full shadow retirement unless needed | No new item |
| Same-turn and command-surface tests too shallow | Bug | T1, T4, T5, Success Criteria | Require registered command tests and provider payload tests across scenarios | No new item |
| Explicit model selection contract missing | Bug | T5 | Define payload/context preservation contract | No new item |
| Archive move destructive | Bug | Archive rule | Make archive copy-first and non-destructive unless user approves removal | No new item |
| Missing Execution Status section | Automation readiness | End of plan | Add required status ledger | No new item |
