---
date: 2026-07-10
status: applied
---

# Applied Fixes

| Finding | Category | Target sections | Edit intent | Checklist impact |
|---------|----------|-----------------|-------------|------------------|
| T1/T2 canonical-type race | bug | Checklist, Task Breakdown, Waves, graph | Make T2 depend on T1; make Wave 1 sequential | V1 dependency wording updated; no item added |
| Nullable cost breaks consumers | bug | T1 | Require canonical normalizer plus all aggregate/format consumers and null/zero tests | T1 remains pending |
| Background runner discards telemetry | bug | T4 | Extend content-free runner result before coordinator emission | T4 remains pending |
| Orphan loses IDs/state | bug | T4, task files | Persist orchestrationId, interactionId, startedAt; allow unavailable orphan fields | T4 remains pending |
| Stop timeout/late completion race | bug | T4 | Define idempotent terminal settlement ownership and tests | T4 remains pending |
| Undefined interaction bridge | bug | T5 | Specify activate/register/record/settle/reset API | T5 remains pending |
| Textless usage dropped | bug | T5 | Record usage before text guard; add fixture | T5 remains pending |
| Legacy compatibility contradiction | bug | T1 | Define additive-on-next-write policy and exact legacy transition tests | T1 remains pending |
| Incomplete storage isolation | bug | Constraints, Automation, T6, Success | Add PI_WORKFLOW_FRICTION_DIR resolver and scratch roots | Existing tasks/gates remain pending |
| Non-runnable live smoke/auth | bug | Risk, Automation, Success, Validation | Add exact bounded Pi CLI commands, existing-auth source, blocking semantics | F1 remains pending |
| Missing evidence/archive mechanics | bug | Automation, Final Gates, Validation, Telemetry, Execution Status | Add evidence directory/commands, archive preflight, status heading | F1/F5 gain exact evidence requirements; unchecked |
| Causal outcome mismatch | bug | Context, Objective, MVP, Deferrals | Narrow MVP to descriptive evidence | No checklist change |
| Reader resource bounds | hardening | T2/T6 | Add file/line/total-byte caps and diagnostics | T2/T6 remain pending |
| Identifier privacy grammar | hardening | T2 | Add conservative metadata grammar and credential-shaped cases | T2 remains pending |
| Slash-command path untested | hardening | T6 | Require registered command invocation and sendMessage assertion | T6 remains pending |
| Rollback does not erase data | hardening | Risk, Docs, Rollback | Add purge procedure and shared-directory warning | T7/F5 remain pending |
| Unsupported lib default-export invariant | false positive cleanup | T2 | Remove criterion; retain actual collision check | No item removed |
| T6 scope | scope reduction | T6 | Remove concurrency-overlap headline; retain quality/friction and model breakdown needed by goal | T6 remains pending |

Apply result: 12 panel must-fix defects and 5 hardening/readiness changes were incorporated into the reviewed plan. Two standalone repair passes then fixed live-smoke fail-fast behavior, smoke initialization, evidence verification, and most dirty-worktree rollback behavior. A user-requested follow-up pass resolved the final rollback blocker with a remove-then-restore baseline procedure verified fail-closed by sha256 manifest and porcelain-status comparison, validated against a git fixture; standalone readiness now returns STANDALONE READY. The checklist remains entirely unchecked. Section integrity passed with unique required headings, one-to-one checklist IDs, aligned T1 -> T2 and T3 -> T4 dependencies, and `## Execution Status` present.

Intentional omissions:
- Shared metrics writer permission-mode changes are omitted: cross-cutting existing infrastructure, Windows target, and not required for telemetry correctness. Documentation/purge/isolation hardening is applied instead.
- Friction classification is retained because the goal requires detecting quality regression.
- TaskUsage persistence is retained because confirmed durable usage defects and background result ownership require a canonical content-free shape.
- No checklist item is marked complete; all implementation and validation remain pending.
