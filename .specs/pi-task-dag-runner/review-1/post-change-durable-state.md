---
reviewer: post-change-durable-state
status: complete
finding_count: 3
---

# Findings

- severity: high
  category: substantive defect
  confidence: high
  evidence: "The plan requires `write_failed` after a batch write or rename failure and permits asymmetric reverse edges, but it defers rollback, journals, and startup reconciliation without specifying an executable repair operation. The current registry only maintains reverse edges during `createTask` and `updateTask` (`pi/lib/task-registry.ts:302-327`); it has no graph reconciliation entry point. After a reverse-edge write fails, inspection can identify the damaged derived `blocks` data but cannot restore it. Retrying the request creates new UUIDs and does not repair the already-persisted graph."
  required_fix: "Add a registry-owned, explicitly invoked reconciliation operation for affected IDs or a documented deterministic recovery sequence that recomputes `blocks` from every persisted forward `blockedBy` edge and reports any unreadable records. Specify when it is invoked after `write_failed`, its workspace scope, result envelope, and idempotence. Add injected reverse-write-failure and subsequent recovery tests proving forward-edge readiness remains conservative and reverse inspection becomes consistent."

- severity: high
  category: substantive defect
  confidence: high
  evidence: "`execute_many` says a metadata-write failure must surface for that ID and must not leave a running record without coordinator ownership, but its exact result vocabulary has no write-failure classification and its start contract does not define a compensating durable transition. In the current coordinator, `start()` calls `startTask()` before `updateTask(taskId, { execution: runningExecution })` and before `this.active.set()` (`pi/extensions/tasks/execution.ts:262-276`). Thus that update can throw after the durable task is running, leaving no active promise. The proposed per-ID strings cannot truthfully represent this state while the top-level partial outcome still permits later starts."
  required_fix: "Define a per-ID persistence-failure result, its durable state, and the required recovery action. Make the coordinator publication sequence atomic at its own boundary: either persist execution ownership before entering running, or on metadata failure durably move the record to a non-running recoverable state and verify that compensation. Add controlled filesystem-failure tests with multiple IDs showing the failed ID has no unowned running record, later IDs are classified and handled deterministically, and no runner starts for the failed ID."

- severity: high
  category: substantive defect
  confidence: high
  evidence: "The truth table classifies `failed_to_stop` as non-startable for the new action, but `execute_many` is required to reuse the existing synchronous coordinator `start` path. That path currently treats a running record whose execution status is neither `running` nor `stop_requested` as `reopenedForExecution` (`pi/extensions/tasks/execution.ts:232-264`). A `failed_to_stop` record therefore qualifies and can have its execution metadata overwritten by both legacy `execute` and any unguarded fan-out call. T3 also says not to change legacy single-ID actions, which conflicts with preserving the plan's explicit recovery ownership rule."
  required_fix: "Make coordinator start reject `failed_to_stop` before any transition or execution metadata update, and have both `execute` and `execute_many` expose the same `failed_to_stop` recovery classification. Define the explicit recovery transition separately from retry and require it to prove the prior worker is no longer live before a new run. Add tests for legacy execute, execute_many, and a new coordinator after a stop timeout, including a later stale runner settlement."
