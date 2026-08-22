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
- Model and topology guidance is advisory: use Luna low for tool-heavy inspection and summarization, Sol low or Luna high for bounded planning, Sol low for coordinators and subagent team managers, Luna medium or high for implementation, and Sol low for review. If selection is uncertain, compare bounded read-only plans before assigning one modifying owner.
- Before fan-out over a shared unproven dependency, run one representative leaf and expand only if it succeeds.

## Scheduler

The process-wide tree scheduler runs up to eight descendants by default and accepts a configured ceiling no greater than 16. Excess work queues. Every child has a 64-turn limit. Read-only fan-out workers stop after eight minutes.

Cancelling a Team Lead cancels its queued and active descendants. Process-tree state and bounded history survive session replacement in the same Pi process but not process exit.

## Mutation and tasks

- Concurrent modifying leaves require normalized, disjoint repository-relative scopes. Scoped leaves cannot mutate outside their lease.
- The root owns durable task creation, state changes, validation, and closure. Team Leads may carry an assigned task ID. Subagents do not change task records.
- Reduce or summarize worker output before returning it. Prefer a Luna-low reduction when raw output would consume material parent context. The root must validate the requested outcome.
- Recommendation overrides remain allowed and should be recorded for later routing analysis. Max effort requires explicit operator approval.
