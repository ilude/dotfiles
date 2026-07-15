---
reviewer: filesystem-transaction-and-dag-invariant-specialist
status: complete
finding_count: 1
---

# Disposition

Crash-safe all-or-nothing batch commit is not necessary for this personal-local MVP. It is explicitly deferred in the MVP boundary, while the selected scope is bounded fan-out in one local Pi process rather than a durable scheduler, lease system, or multi-process coordinator. Adding a journal/manifest changes the persistent format and requires startup recovery, cleanup rules, crash-point tests, and compatibility handling. Stage-plus-rollback is not crash-safe because either rollback writes can fail, and automatic startup reconciliation would silently mutate user-owned records after an interrupted request.

The deferment is valid only with a narrower, deterministic failure contract. Per-file rename atomicity does not make a batch atomic: `writeTaskFile` writes and renames one task file at a time, and `maintainReverseEdges` subsequently rewrites each blocker file. The implementation must not promise that I/O failure leaves no partial graph or that bidirectional edges remain exact after a failed batch.

# Findings

- id: durable-batch-partial-write-contract
  severity: high
  category: correctness
  disposition: amend-plan
  confidence: high
  evidence: "`pi/lib/task-registry.ts:280-287` atomically replaces only one record file with `writeFileSync` then `renameSync`. `pi/lib/task-registry.ts:302-326` updates reverse `blocks` edges in separate later writes. `createTask` already follows this non-transactional sequence at `pi/lib/task-registry.ts:356-358`. `blocks` is only consumed by rendering in `pi/lib/task-renderer.ts:261-262`; readiness derives from each record's forward `blockedBy` through `getUnmetBlockers` and `isTaskReady` in `pi/lib/task-registry.ts`. The plan's Explicit Deferrals already says crash-atomic multi-file batch commits are deferred."
  required_fix: "Amend T1 and its acceptance criteria to define this MVP contract: complete prospective validation occurs before the first write; a successful batch returns only after every task record and affected reverse edge has been written; any write or rename failure throws a `TaskRegistryError` identifying a non-atomic batch write; no rollback, startup reconciliation, or automatic retry is performed; and the operator may retry only after inspecting the durable files. Forward `blockedBy` is authoritative for readiness, while `blocks` is a derived inspection edge that can be incomplete after such a failure. Add an injected write/rename failure test that proves the error is surfaced, no successful batch result is returned, and every persisted forward edge remains readable and keeps readiness conservative. Do not assert zero persisted files or exact reverse-edge symmetry for this failure case."
  validation: "Run the focused registry/dependency tests with a filesystem seam that fails a chosen batch write after at least one task file and before at least one reverse-edge file. Assert deterministic validation failures still leave the task count unchanged; assert the injected I/O failure is explicit; and assert `partitionReadyTasks` does not mark a task ready when its persisted `blockedBy` names a non-completed blocker."
