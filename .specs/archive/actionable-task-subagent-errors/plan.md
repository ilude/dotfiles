---
created: 2026-08-24
status: complete
completed: 2026-08-24
---

# Make task and subagent errors actionable

## Objective

Task and subagent rejection paths report the supplied or attempted value, the effective state or boundary used to reject it, and the applicable limit or recovery choice without weakening existing safety controls or disclosing unnecessary session and filesystem secrets.

## Completion Evidence

- Evidence: Focused tests demonstrate workspace-root and scope diagnostics with assigned, supplied, and resolved paths; task lookup diagnostics with the requested ID and workspace context; dependency-cycle diagnostics with authorized cycle members; outcome-bound diagnostics with field, actual count or length, maximum, and offending index without item content; transition diagnostics with task ID plus current, attempted, and allowed states; affinity diagnostics with `affinityTaskId`, bounded candidate count, and non-sensitive rejection reasons; and recovery diagnostics with requested run/tool IDs plus active tools from that authorized run.
- Fails when: Any covered path still returns only a failure category such as `not_found`, `dependency cycle rejected`, or `exceeds its bounds`; omits a diagnostic field named above; changes rejection behavior; reflects bounded-field contents; or exposes child session paths, credentials, unauthorized task/run context, or unrelated filesystem state.

## Boundaries

- In scope: Operator- and model-facing diagnostic text in `pi/extensions/subagent/workspace-policy.ts`, `pi/extensions/subagent/scope-policy.ts`, `pi/extensions/subagent/recovery.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/tasks.ts`, and `pi/lib/task-registry.ts`; focused tests in the matching existing `pi/tests/` files; and the stable diagnostic contract in `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`.
- Out of scope: New error types, telemetry, persistence, retries, task lifecycle changes, schema changes, migration behavior, UI redesign, unrelated validation wording, and errors that already identify the failed input and corrective state.
- Preserve: Workspace containment, canonicalization, selected-skill exceptions, task workspace/session isolation, dependency and transition invariants, affinity eligibility, interrupted-recovery safety, existing tool result shapes except adding diagnostic fields or text where absent, and redaction of session paths, credentials, raw bounded-field contents, and context outside the caller-authorized task or run.
- Assumptions: Existing structured state already contains the values needed for each diagnostic; implementation must not add persisted state solely to improve error text.

## Tasks

- [x] **T1: Add bounded actionable diagnostics and regression coverage**
  - Files: `pi/extensions/subagent/workspace-policy.ts`, `pi/extensions/subagent/scope-policy.ts`, `pi/extensions/subagent/recovery.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/tasks.ts`, `pi/lib/task-registry.ts`, `pi/tests/workspace-policy.test.ts`, `pi/tests/subagent-recovery.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/tests/subagent-t1.test.ts`, `pi/tests/task-dependencies.test.ts`, `pi/tests/task-registry.test.ts`, `pi/tests/task-tools.test.ts`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`
  - Change: Use the existing error and tool-result mechanisms to report: parent, supplied, and resolved workspace values for workspace-root rejection; repository root, supplied scope, and resolved target for scope escape; requested task ID and current-workspace lookup context for task `get`; dependency cycle members visible within the validated workspace graph; actual count or length, applicable maximum, and offending field or item index for outcome bounds without rendering item contents; attempted and allowed task transitions; `affinityTaskId`, bounded candidate count, and non-sensitive eligibility reasons for affinity rejection; and requested run/tool IDs plus bounded active-tool context filtered to the already-authorized selected run for interrupted recovery. Reuse small local formatting helpers only where multiple covered paths require the same representation. Do not expose session paths, broker credentials, raw bounded-field contents, unauthorized task/run context, unrelated task records, or full filesystem inventories. Update the owning stable contract to name the accepted diagnostic behavior.
  - Done when: Every covered rejection retains its existing outcome and enforcement behavior while its message identifies what was supplied or attempted, what effective state rejected it, and the relevant bound or correction; focused tests assert semantic fields rather than brittle full-message prose.
  - Verify: `cd pi && pnpm test workspace-policy.test.ts subagent-recovery.test.ts subagent-run-manager.test.ts subagent-t1.test.ts task-dependencies.test.ts task-registry.test.ts task-tools.test.ts`

## Validation

- [x] Run `cd pi && pnpm run typecheck` and confirm the Pi extension TypeScript project reports no errors.
- [x] Confirm focused negative tests prove diagnostics do not render bounded-field contents or disclose task/run context outside the validated workspace, root session, or selected run, and inspect the diff for child session paths, credentials, unrelated task records, or changes to allow/deny and lifecycle decisions.

## Retention

Keep incomplete work at `.specs/actionable-task-subagent-errors/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/actionable-task-subagent-errors/`.

## Execution Status

- State: complete
- Blocker: None.
- Next: Archive and merge with `plan_archive`.
- Resume: `/do-it .specs/actionable-task-subagent-errors/plan.md`
