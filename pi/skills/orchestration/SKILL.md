---
name: orchestration
description: "Coordinate bounded root-to-coordinator-to-leaf work when independent execution, verification, or context isolation provides a concrete benefit."
---

# Orchestration

## Topology

- A root may start a coordinator or a leaf.
- A coordinator may start leaves only.
- Leaves and depth-two children cannot delegate.
- State each leaf's deliverable, allowed changes, capabilities, evidence, and stop condition.
- Prefer one coordinator per independently verifiable work package. The root retains program-level decomposition, dependency management, integration, and closure.
- Topology and assignment guidance is advisory rather than a gate. Use bounded read-only comparison when the selected topology or modifying owner is uncertain, and record meaningful overrides for later review.
- Before fan-out over a shared unproven dependency, run one representative leaf and expand only if it succeeds.
- Do not delegate one foreground item to the same model tier as the root merely to isolate context. Perform it directly, route it to Luna when bounded context isolation is the concrete benefit, or detach it when it is genuinely independent and useful work remains for the root. Keep a same-tier single child foreground only when its distinct role, authority, or dependency-gating result provides a concrete benefit that direct execution cannot.

## Scheduler

The process-wide tree scheduler runs up to eight descendants by default and accepts a configured ceiling no greater than 16. Excess work queues. Every child has a 64-turn limit. Read-only fan-out workers stop after eight minutes.

Cancelling a Team Lead cancels its queued and active descendants. Process-tree state and bounded history survive session replacement in the same Pi process but not process exit.

## Mutation and tasks

- Concurrent modifying leaves may carry normalized repository-relative work markers. Markers are advisory; governed workspace and tool-target containment remains enforced.
- Create durable tasks only for checkpoints that must survive compaction, interruption, or later continuation, or for explicitly requested tracking. Mandatory unattended goals retain their required root tasks; delegation or an independently verifiable deliverable alone does not require a record. The root owns task creation, assignment, validation, and closure. Use record/assign -> invoke the root tool or actual subagent -> validate -> record the outcome. Readiness selects work but never dispatches it. Assigned means selected work, not live process activity. Team Leads may carry an existing task ID for correlation. Subagents do not create or change task records.
- Reduce or summarize worker output before returning it. Prefer a Luna-low reduction when raw output would consume material parent context. The root must validate the requested outcome.
- Recommendation overrides remain allowed and should be recorded for later routing analysis. Max effort requires explicit operator approval.
