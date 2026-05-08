# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Registered handler coverage too late | Bug | Execution Checklist, Task Breakdown, Execution Waves, Success Criteria | Move registered handler smoke tests into Wave 1 as a first-class task and validation requirement | Add T4 in Wave 1; renumber later tasks/gates |
| Replay payload raw input risk | Bug | Constraints, T5/T6, Validation Contract | Require sanitized replay descriptors and redaction tests before persistence | Add T7 permissions/redaction task |
| Doctor import/runtime risk | Bug | T4, Execution Waves | Require shared `pi/lib/damage-control-health.ts` module and combined registered-command smoke test | Add task for shared health + doctor integration |
| Rule source/schema/fail-closed ambiguity | Bug | Constraints, T2/T3, Execution Waves | Define precedence, schema validation, malformed/hostile local rule tests | Add to rule-loading task acceptance |
| Session approval unsafe matching | Bug | Constraints, T5 | Define exact canonical session-scoped approval matching, ask-only, no hard-block bypass | Add acceptance under permissions task |
| Biome unpinned | Bug | Automation Plan, Validation Contract | Use repo `make lint`/`make check` or add explicit dependency task if Biome is required | Update validation commands away from unpinned Biome gate |
| Unsafe rollback path checkout | Bug | Automation Plan, T1 | Replace path checkout rollback with preflight patch capture and inverse patch/baseline strategy | Add T1 acceptance and automation row changes |
| Claude parity subjective | Hardening | Execution Waves, Task Breakdown | Add parity inventory task with port/defer/reject matrix | Add T5 in Wave 2 |
| Negative matrix under-specified | Hardening | T3/T8 | Add explicit negative/near-miss matrices for destructive, wrapper, secret, exfil rules | Acceptance additions |
| Manual validation risky | Hardening | Validation Contract | Replace docker compose manual test with scratch harmless ask rule and evidence path | Final gate text updated |
| Exact test commands | Readiness | Validation gates | Use `pnpm test damage-control.test.ts damage-control-extension.test.ts operator-status.test.ts permissions.test.ts` only for files that exist; require evidence listing | Validation gate command text updated |
| Scratch-cwd/repo-root validation | Hardening | T2, Manual validation | Require rule-source tests from repo root and scratch cwd | Add acceptance |
| Prompt copy criteria | Hardening | T4/T8 | Require prompt content assertions for matched rule, command/path, cwd, scope, safe default | Add acceptance |
| Permissions display | Hardening | T7 | Require damage-control-specific permissions output fields | Add acceptance |
| make check baseline | Hardening | Automation Plan, T1, Validation Contract | Add baseline capture before implementation and comparison for unrelated failures | Add T1 acceptance and final gate wording |
| Remove/reframe redundant T9 | Simpler alternative | Task Breakdown, Checklist, Waves | Replace justfile implementation task with preflight verification; no separate T9 if already complete | Remove old T9, add verification to T1 |
