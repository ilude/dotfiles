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

## Scheduler

The process-wide tree scheduler runs up to eight descendants by default and accepts a configured ceiling no greater than 16. Excess work queues. Every child has a 64-turn limit. Read-only fan-out workers stop after eight minutes.

Cancelling a Team Lead cancels its queued and active descendants. Process-tree state and bounded history survive session replacement in the same Pi process but not process exit.

## Mutation and tasks

- Concurrent modifying leaves may carry normalized repository-relative work markers. Markers are advisory; governed workspace and tool-target containment remains enforced.
- The root owns durable task creation, state changes, validation, and closure. Team Leads may carry an assigned task ID. Subagents do not change task records.
- Reduce or summarize worker output before returning it. Prefer a Luna-low reduction when raw output would consume material parent context. The root must validate the requested outcome.
- Recommendation overrides remain allowed and should be recorded for later routing analysis. Max effort requires explicit operator approval.
