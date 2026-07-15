---
reviewer: durable-state-reviewer
status: complete
---

# Findings

- severity: high
  evidence: T1 says same-batch records are created and reverse edges are maintained after prospective validation, but it does not require blockers to be written before dependents or perform a second edge-reconciliation pass. With a valid batch ordered as dependent before blocker, the existing `maintainReverseEdges` lookup cannot find the not-yet-written blocker, so the dependent's `blockedBy` persists while the blocker's `blocks` edge is absent.
  required_fix: Specify a two-phase batch write: persist all validated records with normalized forward edges, then reconcile every affected blocker from the complete prospective graph before returning. Add a test with reverse declaration order and assert both directions exactly match.

- severity: high
  evidence: The prospective validation criteria reject unknown local keys but do not explicitly reject an unknown existing UUID in `blockedBy`. The current single-create path permits a missing blocker, and readiness then reports `missing`; applying that behavior to a batch silently creates a dangling dependency and cannot maintain its reverse edge. This conflicts with the stated valid-graph and reverse-edge invariant.
  required_fix: Define existing-ID resolution as existence validation against non-tombstoned or explicitly tombstone-eligible records, reject missing/tombstoned IDs before the first write, and test that the isolated registry remains unchanged for both cases.

- severity: high
  evidence: T1 explicitly defers crash-atomic multi-file commits, while the batch operation writes task files and reverse-edge files separately. A failure after some task files or blocker files are renamed can leave partial records or asymmetric `blockedBy`/`blocks` state; the plan has no recovery or invariant-repair contract and its tests cover only deterministic validation failures, not write failures.
  required_fix: Either make the MVP batch commit atomic via a journal/staging-and-recovery protocol, or narrow the guarantee and add deterministic injected-write-failure tests plus a documented recovery/reconciliation path. Do not claim reverse-edge invariants after an interrupted commit without one of these.

- severity: high
  evidence: T3 permits `startMany` partial acceptance but does not define duplicate IDs, concurrent calls for the same task, or the result/state contract when one start succeeds and a later `start` fails after its running transition. The existing `start` sequence reads, transitions, updates execution metadata, then registers `active`; two callers can race on the same pending file, and an update failure can leave a durable running task with no coordinator promise. Per-task summaries alone do not make these states recoverable.
  required_fix: Require deterministic deduplication or rejection of duplicate IDs, serialize or atomically claim each task before fan-out, and specify partial-result semantics including already-running/external ownership. Add tests for overlapping `startMany` calls and an injected metadata-write failure, with the resulting retry/orphan behavior asserted.

- severity: high
  evidence: The compatibility assertion for retry/orphan/`failed_to_stop` is only an inspection item in V4. In the existing coordinator, a timed-out stop records `failed_to_stop` while the old runner may still be alive; a later process can execute the still-running task and overwrite execution metadata, while the old runner can subsequently settle the same task. `startMany` and `await` add no ownership or stale-settlement rule, especially for externally owned running records.
  required_fix: Add explicit state-transition rules and focused tests covering retry after failed execution, orphan reconciliation, failed-to-stop followed by a new session, and await/execute_many against externally owned running tasks. Prevent a new run or stale completion from overwriting a live/foreign run, or document and implement the required recovery transition before allowing it.
