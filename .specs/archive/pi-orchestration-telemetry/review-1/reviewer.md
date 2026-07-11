---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "dependency defect"
  confidence: high
  evidence: "Severity rationale: The declared wave graph permits implementation against an unstable type contract and makes the validation gate the first place the defect is discovered. Evidence: T1 and T2 are declared parallel in Wave 1 and the dependency graph says `T1, T2 (parallel) -> V1`, but V1 additionally requires that T2 import T1's normalized usage type; T2's mutation boundary also says `new files only` while T1 changes the type it must consume."
  required_fix: "Serialize the shared-type work before T2 (make T2 depend on T1), or split out a prerequisite type-contract task that both depend on. State the import path and the exact canonical usage type before allowing T2 implementation."
- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "Severity rationale: The specified orphan event cannot be populated from the state the plan says to retain, so the report will either fabricate values, omit required data, or fail its closed builder. Evidence: T4 requires an orphaned terminal `orchestration_run` with attempt runId and `durationMs`, byte rollups, usage, and terminal status, while `reconcileOrphans()` only has the task record and updates its execution status; the plan adds no persisted orchestration start timestamp, partial usage, byte snapshot, or explicit unknown/null semantics for reconciliation."
  required_fix: "Define an orphan event contract with explicit nullable/unknown fields and specify how each field is sourced, or persist the required attempt start/usage/byte state before detachment. Add a fixture covering an orphan with missing and partial state and exact report behavior."
- severity: high
  category: "process defect / test isolation"
  confidence: high
  evidence: "Severity rationale: The documented live workflow can write real operator/workflow state and the report's join path is not isolated by the stated test contract. Evidence: the Constraints require redirecting both `PI_METRICS_DIR` and `PI_OPERATOR_DIR`, but the Live smoke command redirects only `PI_METRICS_DIR`; T6 explicitly joins `~/.pi/agent/workflow-friction/reviews.jsonl`, and no plan step defines or verifies a `PI_OPERATOR_DIR` override for that existing storage path."
  required_fix: "Specify the supported override for task and workflow-friction storage, set both variables before Pi/module initialization in the live smoke, and assert all created task/review/metrics files are inside scratch directories. Make the report reader use the same resolved storage root rather than a hardcoded home path."
- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "Severity rationale: The compatibility requirement is internally contradictory and leaves fresh execution without a safe write policy for existing records. Evidence: T1 requires the full normalized usage shape on completed, failed, and cancelled paths, but also says `never inject fields into records that lack them`; its acceptance test only mentions legacy exact-equality assertions and does not define how a newly completed update to an old schemaVersion-1 record is distinguished from a new record."
  required_fix: "Define the compatibility rule precisely: identify the record/version predicate, specify whether new fields are written on updates to old records, and define `/tasks` rendering for both shapes. Add tests that transition an existing legacy record through each terminal/error path and assert the intended persisted JSON exactly."
- severity: medium
  category: "verification gap"
  confidence: high
  evidence: "Severity rationale: Parent usage analytics can silently miss valid assistant messages while all planned tests still pass if fixtures contain text. Evidence: the existing `workflow-friction-review.ts` handler returns when `messageText(event.message)` is empty; T5 only says to feed `message_end` assistant usage and does not require handling usage-bearing messages with no text or assert that usage is recorded before the text guard."
  required_fix: "Make the T5 acceptance criteria explicitly capture usage independently of assistant text, including a textless assistant-message fixture, multiple messages with zero/partial usage, and provider/model grouping. Require the test to prove the interaction event contains those sums after settlement."
