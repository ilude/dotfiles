---
created: {YYYY-MM-DD}
status: draft
completed:
---

# Plan: {title}

## Context and Motivation

{Why this work exists, what evidence established the need, and enough context for a fresh session.}

## Objective

{Concrete, verifiable end state.}

## Boundaries

- In scope: {requested outcome and owned surfaces}
- Out of scope: {explicit exclusions}
- Preserve: {public interfaces, data, behavior, and user decisions}
- Platform and shell: {detected facts}
- Assumptions: {verified assumptions or "None."}

## MVP and Deferrals

- **MVP:** {smallest complete outcome}
- **Explicit deferrals:** {follow-up work that cannot block completion, or "None."}

## Risk and Gate Decision

- **Risk level:** {low/medium/high}
- **Blast radius:** {local/personal-repo/home-lab/shared/work/production}
- **Rollback:** {easy/known/unclear/none}
- **Manual approval before action:** {required/not required}
- **Manual validation after action:** {required/not required}
- **Deployment:** {required/not required}
- **Reason:** {facts supporting the gate decision}

For a required manual or deployment gate, include exact action, success signal, failure action, rollback, and evidence destination. Manual gates are exceptional and must be tied to destructive, irreversible, data-loss, shared-production, paid-resource, secret-exposure, hardware, or subjective-judgment risk.

## Approach Decisions

| Decision | Selected approach | Rejected alternative and trade-off |
| --- | --- | --- |
| {material choice} | {choice and rationale} | {alternative and why it does not fit} |

Write "None" when the work has no material approach choice.

## Project Evidence

- **Owning files:** {paths}
- **Supported entrypoints:** {commands}
- **Focused validation:** {commands}
- **Repository completion validation:** {commands}
- **Credentials/external systems:** {none or source and boundary}
- **Evidence artifacts:** {existing paths or plan-owned paths}

## Automation Plan

| Operation | Command or wrapper | Mutation boundary | Credentials | Evidence |
| --- | --- | --- | --- | --- |
| Preflight | `{command}` | read-only | {none/source} | {signal/path} |
| Implement | `{command or file edits}` | {exact targets} | {none/source} | {signal/path} |
| Validate | `{command}` | read-only or test-owned output | {none/source} | {signal/path} |
| Deploy | `{command or not applicable}` | {target} | {none/source} | {signal/path} |
| Roll back | `{command or not applicable}` | {target} | {none/source} | {signal/path} |

## Task Breakdown

| ID | Deliverable | Files | Depends on | Required capability | Mutation boundary | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | {deliverable} | {paths} | none | {optional domain/tool/permission need or "none"} | {exact boundary} | `{command}` |
| V1 | Validate wave 1 | {paths or none} | T1 | {optional capability or "none"} | read-only | `{command}` |

Tasks protect deliverables, not activity. Add only real dependencies. A required capability describes domain knowledge, tools, or permissions; execution resolves available resources at runtime.

## Execution Waves

### Wave 1

**T1: {deliverable}**

- Files: {paths}
- Depends on: {IDs or none}
- Required capability: {optional or none}
- Mutation boundary: {create/update/delete targets and external target, if any}
- Work: {concise implementation intent}
- Acceptance:
  - {observable criterion}
  - Verify: `{exact command}`
  - Pass: {observable success signal}
  - Fail: {diagnosis or rollback action}
  - Evidence: {non-secret result or artifact path}

### Wave 1 Validation Gate

**V1: {gate objective}**

- Depends on: {wave task IDs}
- Run: `{exact command or command set}`
- Pass: {observable success signal}
- Fail: {smallest repair boundary; do not start dependent waves}
- Evidence: {non-secret result or artifact path}

Repeat the wave and gate shape only when dependencies require another stage. Independent stateful replacements belong in separate waves, each naming current backup evidence, restore action, rollback boundary, one target, endpoint check, and persisted-state check.

## Dependency Graph

```text
T1 -> V1
```

{Include every task and gate ID exactly once.}

## Validation Contract

### Task and wave checks

- Run every task verification command and wave gate above.
- A failed check leaves its checklist item unchecked and blocks dependent work.
- After a repair, rerun the failing command and its owning gate.

### Exact workflow validation

- Entry point: `{the command or sequence users rely on}`
- Expected result: {observable outcome}
- Failure action: {diagnosis, rollback, or blocker rule}
- Evidence: {non-secret result or artifact path}

### Repository completion validation

- Command: `{strongest supported aggregate command or explicit command set}`
- Pass: exits 0 with required warnings resolved
- Fail: do not archive; record the failing command and next repair in Execution Status

### Manual validation

- Required: {yes/no}
- Reason: {risk facts or "Automated validation is sufficient."}
- Action/signal/rollback/evidence: {details or "None."}

### Deployment validation

- Required: {yes/no}
- Action/signal/rollback/evidence: {details or "None."}

## Telemetry and Evidence Contract

Use `pi/docs/workflow-eval-telemetry.md`. Record existing runtime events plus plan-local evidence where detailed events are not emitted.

- `schema_version`: 1
- `episode_id`: {assigned at execution}
- `command`: do-it
- `artifact_path`: {this plan path}
- `repo_root`: {path or repo ID}
- `started_at` / `completed_at`: {ISO-8601}
- `status` / `classification` / `archive_status`: {execution result}
- Phase fields: `phase_id`, `phase_type`, dependencies, timestamps, status, evidence
- Event fields: `event_id`, `phase_id`, `task_id`, `event_type`, command/result, duration when available, status, evidence, failure/repair fields when applicable
- Manual/deployment gate facts and decisions
- Redaction status; never store secrets or raw sensitive output

## Execution Checklist

This is the durable resume ledger. Every executable task and gate has exactly one matching item. Keep an item unchecked while it is pending, in progress, blocked, or invalidated. Immediately after its required verification passes, mark it `[x]`, record status and non-secret evidence, save the plan, and only then start dependent or sequential work.

### Wave 1

- [ ] T1: {deliverable}
  - Status: pending
  - Evidence: --
- [ ] V1: {wave gate}
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: All task-specific and wave validation passed
  - Status: pending
  - Evidence: --
- [ ] F2: Exact user workflow passed
  - Status: pending
  - Evidence: --
- [ ] F3: Repository completion validation passed
  - Status: pending
  - Evidence: --
- [ ] F4: Manual and deployment gates passed or are not applicable
  - Status: pending
  - Evidence: --
- [ ] F5: Evidence consistency and archive preflight passed
  - Status: pending
  - Evidence: --

## Success Criteria

1. {end-to-end requested outcome}
   - Verify: `{command}`
   - Pass: {observable signal}
2. {safety, compatibility, or operational outcome}
   - Verify: `{command or not required}`
   - Pass: {observable signal}

## Archive Rule

Archive only when every required task, validation, exact-workflow, repository-wide, manual, deployment, evidence, and archive gate passes or is explicitly not applicable, and Execution Status has no unresolved item. Move the plan and owned siblings to a collision-safe `.specs/archive/{slug}/` path unless this plan records an explicit opt-out rationale.

## Execution Status

- **Classification:** planned, not started
- **Current blocker:** none
- **Last completed wave/gate:** none
- **Next ready wave/gate:** T1
- **Completed work:** none
- **Commands/results:** none
- **Remaining checks:** all checklist items
- **Exact user action:** none
- **Resume:** `/do-it {plan-path}`

Before any incomplete report or context-clearing handoff, update this section with the actual state, blocker, recovery entrypoint, and whether the resume command remains appropriate.

## Workflow Eval Record

{Filled by `/do-it` at terminal state using the repository telemetry schema: outcome, archive result, validation and gate results, checklist state, blocker, friction, missing evidence, improvement candidates, and confidence.}
