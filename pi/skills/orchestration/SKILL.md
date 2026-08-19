---
name: orchestration
description: "Coordinate bounded root-to-coordinator-to-leaf work when independent execution, verification, or context isolation provides a concrete benefit."
---

# Orchestration

## Topology

- A root may start a coordinator or a leaf.
- A coordinator may start leaves only.
- Leaves and depth-two children cannot delegate or start workflows.
- State each leaf's deliverable, allowed changes, capabilities, evidence, and stop condition.
- Before fan-out over a shared unproven dependency, run one representative leaf and expand only if it succeeds.

## Scheduler

The process-wide tree scheduler runs up to eight descendants by default and accepts a configured ceiling no greater than 16. Excess work queues. Every child has a 64-turn limit. Read-only fan-out workers stop after eight minutes.

Cancelling a coordinator or workflow cancels its queued and active descendants. Tree state, bounded history, and completed workflow results survive session replacement in the same Pi process but not process exit.

## Typed workflow

Use `subagent_workflow` for a closed map, retry, verify, and reduce operation.

- It accepts at most 256 unique items, two attempts by default, three at most, and reduction groups of at most eight.
- Each item declares required capabilities. Missing capabilities reject the item before an attempt starts.
- Inputs use a bounded extract or repository-relative path and line range.
- Results use `found`, `not_found`, `inconclusive`, or `error` with bounded evidence, changed files, validation, and gaps.
- Retry only failed, inconclusive, schema-invalid, or verifier-contradicted items. Identical retries are rejected.

## Mutation and tasks

- Concurrent modifying leaves require normalized, disjoint repository-relative scopes. Scoped leaves cannot mutate outside their lease.
- The root owns durable task creation, state changes, validation, and closure. Coordinators may carry a task ID for correlation. Leaves and workflow tools do not change task records.
- Reduce or summarize worker output before returning it. The root must validate the requested outcome.
