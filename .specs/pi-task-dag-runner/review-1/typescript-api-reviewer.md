---
reviewer: typescript-api-and-provider-schema-compatibility-reviewer
status: complete
finding_count: 5
---

# Findings

- category: "substantive defect"
  severity: high
  severity_rationale: "The public tool contract can be absent or provider-dependent even when the runtime accepts the input, so callers cannot reliably construct the planned DAG or invoke the new actions."
  evidence: "T4 requires new TypeBox inputs and actions, but the current schema in pi/extensions/tasks.ts defines neither key nor blockedByKeys, does not include execute_many or await in the action union, and has no top-level ids property or maxItems: 8 constraint. Both taskItem and parameters also set additionalProperties: true, while asParams performs no runtime validation."
  required_fix: "Define the exact TypeBox properties for batch task keys, blockedByKeys, execute_many ids, and await ids, including maxItems: 8 and string/array bounds. State the compatibility policy for unknown properties and add schema-level tests against the registered provider schema plus malformed and over-limit runtime inputs."
  confidence: high

- category: "substantive defect"
  severity: high
  severity_rationale: "A fan-out entry point that bypasses readiness can execute work before its dependencies complete, violating the central DAG invariant and making the promised blocked classification false."
  evidence: "The current TaskLifecycleService.start checks getUnmetBlockers before startTask, but TaskExecutionCoordinator.start in pi/extensions/tasks/execution.ts checks only task existence, active state, and execution metadata before calling startTask. T3 says startMany uses the existing start path without requiring a readiness recheck, while T4 requires blocked executable tasks to remain unchanged."
  required_fix: "Make startMany perform an atomic readiness/blocker check at the coordinator or public action boundary immediately before each start, return a distinct blocked result, and leave the task unchanged. Add a controlled test with a supplied blocked executable and a ready executable."
  confidence: high

- category: "substantive defect"
  severity: high
  severity_rationale: "An underspecified join envelope and completion race can produce missing, stale, or nondeterministically ordered results for a mixed request, which breaks provider callers and TUI consumers."
  evidence: "T3 says wait classifies active, terminal, pending/manual, and externally owned running records, but does not define missing IDs, duplicate IDs, request ordering, or the active-plus-external mix. The current coordinator removes active entries in finishExecution(...).finally(...), so an implementation that snapshots active and later reads the map can lose an entry as it settles."
  required_fix: "Specify one result per supplied ID with deduplication and deterministic request ordering, including explicit classifications for missing, pending/manual, blocked, terminal, active, and external-running records. Join captured promises and re-read each durable record after settlement; add tests for completion-before-registration, duplicate IDs, mixed ownership, and repeated await."
  confidence: high

- category: "substantive defect"
  severity: high
  severity_rationale: "Dropping or mishandling the provider cancellation signal can make await cancellation cancel workers, reject the tool call unexpectedly, or leave a rejected join promise unobserved."
  evidence: "The registered tool handler currently receives the third callback argument as _signal and ignores it. T4 says to pass the tool abort signal only to waiting but does not define whether the coordinator accepts an optional signal, how an already-aborted signal is handled, or whether abort returns a compact result versus rejects the provider call."
  required_fix: "Define wait(taskIds, signal?: AbortSignal) and an explicit abort result envelope. Wire the actual handler signal only to await, consume all join promises after abort, and test already-aborted and mid-wait abort cases proving workers and durable task state are unchanged and no unhandled rejection occurs."
  confidence: high

- category: "substantive defect"
  severity: medium
  severity_rationale: "The promised full details can silently disappear from the TUI even while the model-visible compact content looks correct, preventing inspection of terminal records and artifact references."
  evidence: "T4 says multi-task actions return compact outcomes with complete records in details, but formatTaskToolResult in pi/lib/task-renderer.ts only renders record, records, and output. It has no branch for a per-task results or outcomes envelope, and T4's mutation boundary omits task-renderer.ts."
  required_fix: "Choose and document a single provider-safe details envelope. Either normalize every multi-task result to the renderer's records shape or update pi/lib/task-renderer.ts with a typed results/outcomes branch. Add compact and expanded renderer tests proving terminal records and artifact references remain visible in details without exposing prompts or transcripts in content."
  confidence: high
