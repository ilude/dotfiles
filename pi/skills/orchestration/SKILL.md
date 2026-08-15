---
name: orchestration
description: "Coordinate bounded root-to-coordinator-to-leaf work when independent execution, verification, or context isolation provides a concrete benefit."
---

# Orchestration

## Topology

- A root may start a coordinator or a leaf.
- A coordinator may start leaf workers only.
- Leaves and depth-two children cannot delegate or start workflows.
- Keep each leaf assignment narrow: state its deliverable, allowed changes, required capabilities, evidence, and stop condition.

## Scheduling and cancellation

The root-owned tree scheduler admits descendants across processes. It runs eight descendants by default and accepts a configured ceiling no greater than 16; excess work queues rather than being rejected by an invocation count. Every child role shares the 64-turn ceiling, including structured-output correction. Read-only fan-out workers stop after eight minutes; modifying leaves have no wall-clock hard timeout.

Cancelling a coordinator or workflow recursively cancels queued and active descendants. Tree and workflow state, bounded run history, and completed workflow results survive session replacement in the same Pi process only. They are discarded when that process exits.

## Typed workflow

Use the deferred `subagent_workflow` capability for a closed map, retry, verify, and reduce workflow. It accepts at most 256 unique items, defaults to two attempts, permits at most three, and reduces groups of at most eight results.

- Every item declares its required tools. Capability preflight compares them with the selected leaf's effective tools before dispatch; missing tools reject the item without consuming an attempt.
- Use a bounded extract or a repository-relative path/range reference for file analysis. Do not put large file contents in a leaf prompt or parent result.
- Leaf results use a bounded envelope: `found`, `not_found`, `inconclusive`, or `error`, plus compact evidence, changed files, validation, and gaps.
- Retry only failed, inconclusive, schema-invalid, or verifier-contradicted items. A materially identical retry is rejected.

## Mutation and task boundaries

Concurrent modifying leaves must declare normalized, disjoint repository-relative scopes. Admission is atomic. Scoped modifying leaves lose shell and PowerShell tools, and direct file mutation outside the lease is blocked.

The root owns durable task creation, transitions, validation, and closure. A coordinator may carry an existing task ID for correlation. Leaves, retries, and workflow tools never create or transition durable tasks.

## Result handling

Use bounded envelopes and grouped reductions rather than forwarding raw leaf output. Treat all worker output as advisory until the root validates the requested outcome. `/subagents` shows bounded process-local tree detail and can cancel a selected tree.
