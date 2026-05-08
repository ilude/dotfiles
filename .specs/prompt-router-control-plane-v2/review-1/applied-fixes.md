# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Relative worktree/archive ambiguity | Bug | Constraints, Automation Plan, Archive rule | Add absolute `WORKTREE_ROOT` preflight and single archive source in worktree | none; covered by W0/F5 |
| Missing shared RouteDecision/route contract | Bug | Wave 1, T1/T3/T4 | Require shared `pi/lib/prompt-router/route-decision.ts` and language-neutral schema/parity tests | none; covered by T1/V1 |
| Aspirational classifier/eval commands | Bug | Automation Plan, T2, T7, Validation Contract | Add command-contract/help checks and require implementing `--prompt-file`, eval flags before gates use them | none; covered by T2/T7/V gates |
| Privacy hardening too late | Bug | Wave 0/T2/T8, Automation Plan | Move log-disable/privacy preflight before classifier/eval commands; fail archive scan on unauthorized matches | none; covered by W0/T2/T8/F5 |
| Exact tests/grep/artifact checks missing | Bug | Automation Plan, V1, Validation Contract | Add explicit commands for test filters, legacy-label audit, artifact hash inventory, evidence capture | none; covered by V1/final gates |
| Manual validation template missing | Hardening | W0, Manual validation | Require synthetic prompt template creation in W0 | none; covered by W0/F3 |
| Evidence capture too manual | Hardening | Automation Plan, Validation Contract | Add standard evidence wrapper requirements | none |
| Rollback drill missing | Hardening | T8/F5/Archive rule | Add synthetic rollback drill and checksums | none; covered by T8/F5 |
| Scope too broad | Hardening | Execution Waves/Handoff | Add strict MVP sequencing and no expansion beyond listed gates; advanced metrics can be deferred only with explicit `deferred_aggregates` rationale | none |
