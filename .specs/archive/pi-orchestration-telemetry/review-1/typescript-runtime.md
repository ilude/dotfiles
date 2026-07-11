# TypeScript/runtime contract findings

## 1. T1 makes existing subagent aggregation fail strict typecheck
- Category: TypeScript compile contract
- Severity: high
- Severity rationale: The plan changes `UsageStats.cost` from `number` to nullable, but the same file performs numeric addition without narrowing. The required `pnpm run typecheck` cannot pass from the stated T1 mutation boundary.
- Exact evidence: `pi/extensions/subagent/index.ts:315-322` defines `UsageStats.cost: number`; `:1715-1723` initializes `total.cost` numerically and executes `total.cost += r.usage.cost`. T1 says cost "becomes nullable" while limiting T1 to usage accumulation/persistence paths.
- Required fix: Update every consumer of the nullable worker cost in `subagent/index.ts` (including aggregate totals and formatting) with an explicit nullable policy, or retain a separate numeric display/rollup field while keeping persisted `costUsd` nullable. Add a compile-focused assertion/test for null and known-zero cases.
- Confidence: high

## 2. T4 cannot emit the required worker usage from the coordinator
- Category: Runtime data contract / API boundary
- Severity: high
- Severity rationale: The specified coordinator owns the terminal event, but its runner result discards all normalized usage. Consequently task-execute events cannot satisfy T2's required worker usage/turn fields, including when using the real runner or injected fake runners.
- Exact evidence: `pi/extensions/tasks/execution.ts:39-44` defines `TaskExecutionRunResult` with only `output` and `exitCode`; `:98-137` calls `runSingleAgent(...)` but returns only `output` and `exitCode`; `:229-239` passes that reduced result to `finishExecution`. T2 requires run entries to carry `usage` and `turns`, while T4 requires emission in `finishExecution` and explicitly requires injected runners to exercise coordinator-level emission.
- Required fix: Extend the coordinator result contract to carry the normalized worker usage, turns, resolved model, and timing (with an explicit unavailable representation for orphaned/fake results), and have `runTaskSubagent` preserve `SingleResult` data. Update the injected runner contract and tests before implementing event construction.
- Confidence: high

## 3. T5 drops valid assistant usage events before aggregation
- Category: Pi event lifecycle / usage accounting
- Severity: high
- Severity rationale: The required parent usage grouping is based on every assistant `message_end`, but the existing handler returns before reading usage whenever the assistant message has no text. Tool-call assistant messages commonly have usage without text, so parent token/cost totals and model groups will be undercounted.
- Exact evidence: `pi/extensions/workflow-friction-review.ts:670-675` checks assistant role, then computes `messageText`, and returns on `if (!text)` before any usage handling. The plan requires feeding `message_end` assistant `provider/model/usage` into `noteParentAssistantUsage` and grouping multiple models.
- Required fix: Process and record usage immediately after the assistant-role check, independently of text presence; only gate the bounded assistant-text append on `text`. Use the actual Pi message fields and add a fixture for usage-only/tool-call assistant messages.
- Confidence: high

## 4. T3's one-event guarantee conflicts with content-bearing existing error paths unless finalization owns the returned result
- Category: Runtime lifecycle / privacy boundary
- Severity: medium
- Severity rationale: The current tool constructs and returns error text containing stderr, output, paths, and agent details. A finalizer that merely calls the builder cannot make the emitted event privacy-safe if it reuses the returned tool result or shared error object; the plan needs an explicit in-memory separation between user-visible result text and telemetry input for every early return.
- Exact evidence: `pi/extensions/subagent/index.ts:1125-1200` has early returns for invalid parameters, missing teams, unresolved teams, missing agent files, and confirmation rejection, with returned text including available agents, team names, and `agentFilePath`; `:1458` returns aggregate worker output; `:1510-1530` builds single-agent failure text from `result.errorMessage`, `result.stderr`, and final output. T3 requires exactly one event on all of these paths and forbids failure text, paths, stderr, and output in its payload.
- Required fix: Define a closed finalization input containing only allowlisted status/IDs/counts/byte facts and invoke it from one `try/finally` (or equivalent single exit funnel) that does not inspect returned content. Add tests for each early-return class asserting no forbidden strings in serialized event data.
- Confidence: medium

## 5. T5 does not specify a safe bridge for module-level registration state and extension-local active state
- Category: Module-state lifecycle / correlation
- Severity: medium
- Severity rationale: The current active interaction is closure-local to each extension factory, while the proposed registration API is module-level. Without an explicit activate/deactivate/reset bridge, emitters cannot reliably see the current interaction, and state can survive session replacement or be associated with the wrong session.
- Exact evidence: `pi/extensions/workflow-friction-review.ts:614-617` declares `active` and `currentSessionId` inside `workflowFrictionExtension`; `:630-658` creates/replaces the active interaction; `:696-700` clears only that local variable at settlement. `pi/lib/workflow-friction.ts` currently has only module-level `pendingSubmission` (`:108-128`) and no active-interaction registration state. T5 requires emitters in other modules to register IDs, expose the active ID, and clear state on settlement, shutdown, and session replacement.
- Required fix: Specify and implement an explicit lib-owned lifecycle API (activate with interaction/session ID, register/consume usage and orchestration IDs, settle/reset, shutdown reset), call it on every corresponding extension lifecycle transition, and test new/reload/shutdown plus duplicate settlement cases. Do not rely on extension closure state being visible to imported emitters.
- Confidence: high
