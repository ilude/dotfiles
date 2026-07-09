# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Exact GPT/Fable targeting not executable | process defect | Constraints, Objective, Automation Plan, Execution Checklist, Task Breakdown, Execution Waves, Validation Contract | Add T0 to create exact-model reviewer agent definitions and verify subagent dry-run payloads before implementation proceeds | Add T0 and V0 checklist items; make T1/T2 depend on V0 |
| Dogfood slash command not executable by /do-it | process defect | Automation Plan, T4, T6, Success Criteria, Validation Contract | Add a command smoke runner plus explicit Pi CLI dogfood attempt and artifact capture requirements | Update T4/T6/V5/F gates |
| Wrong Vitest command and wave ordering | process defect | T3, T5, Validation Contract | Remove unsupported `-- --runInBand`; require minimal test file in Wave 1 and expand later | Update T2, T3, V2, T5 |
| New pi/lib module not typechecked before import | substantive defect | T1, T2, V1, Validation Contract | Require Wave 1 tests to import `pi/lib/skill-review.ts`; do not rely on typecheck alone until extension imports it | Update T1/T2/V1 acceptance criteria |
| pi/lib importing pi/extensions would break boundaries | substantive defect | Constraints, T1 | Forbid `pi/lib/*` imports from `pi/extensions/*`; require shared usage collector in `pi/lib` if reuse is needed | No new checklist item |
| Model artifacts may leak secrets before subagents run | substantive defect | T3, T6, V5, Validation Contract | Add pre-subagent redaction/secret-scan gate and fail-closed behavior before model packets are sent | Update T3/T6/V5 |
| Write boundary ambiguous and symlink/cwd risks | substantive defect | Constraints, T4, T5, T6, V5 | Define git repo root as output base; require realpath containment, symlink rejection, exclusive mkdir, and source-root manifests | Update T4/T5/T6/V5 |
| Model-output schema validation missing | substantive defect | T3, T5, T6, Validation Contract | Add deterministic comparison validator for gpt/fable outputs and decision ledger | Update T3/T5/T6 |
| .tmp evidence not durable for archive | process defect | Automation Plan, T6, V5, Validation Contract, Telemetry & Evidence Contract | Add sanitized evidence manifest under `.specs/skill-review-system/evidence/` with hashes and counts | Update T6/V5/F5 |
| Existing discovery/stats duplication risk | duplicate | Constraints, T1 | Make the plan adapter-first and forbid reimplementing default root discovery/frontmatter parsing/session mining | No new checklist item |
| Heuristic rules underspecified/noisy | substantive defect | T1, T3, T5 | Treat broad/no-op/overlap checks as advisory candidates with calibrated thresholds in generated config | No new checklist item |
| Scope-reduction recommendation | low-value/theater | Contested/Dismissed in synthesis only | Not applied because user explicitly requested full system to completion, including GPT/Fable comparison | No checklist impact |
