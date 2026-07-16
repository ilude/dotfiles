# Post-change TypeScript API review

Scope reviewed: `.specs/pi-task-dag-runner/plan.md` only.

## Findings

### 1. [high] `execute_many` has no result classification for a per-ID start persistence failure

- **Contract locations:** Public Action Contract -> Multi-task result vocabulary; `execute_many` final bullet; Wait and Ownership Truth Table.
- **Problem:** The contract requires one result per supplied ID and says the exported result union must use the listed exact classifications. A metadata-write failure must "surface for that ID" while later IDs remain classifiable, but the closed vocabulary has no `write_failed` or `start_failed` member. `terminal` is false if the runner is already running but coordinator ownership could not be durably recorded, and `pending` is also false or misleading for a failed start attempt.
- **Impact:** The public handler cannot satisfy both the exact union and the required truthful per-ID error. Collapsing the error into the top-level outcome loses the ID-level result required by the contract; relabeling it risks hiding an unowned running worker.
- **Required correction:** Add one exact per-ID classification for this boundary, such as `start_write_failed`, including its caller action and renderer behavior, or revise the failure requirement to a typed top-level failure envelope that explicitly permits no per-ID success results. Specify whether a runner started before this failure must be reconciled or reported as an ownership-safety failure.

### 2. [high] Details `records` cannot be ordered one-for-one with all supplied IDs

- **Contract locations:** Public Action Contract -> Multi-task result vocabulary; `await` and `execute_many` missing/foreign classifications.
- **Problem:** Details are declared as `{ outcome, records, results }`, with `records` ordered to match returned IDs. Both actions must return `missing` for an ID with no record. No complete durable record exists for that position. The same ambiguity applies to foreign records if details must not expose foreign-workspace task data.
- **Impact:** The envelope cannot be typed truthfully as `TaskRecordV1[]` with positional correspondence, and a renderer cannot reliably associate classifications or artifact paths with IDs without guessing or leaking inaccessible records.
- **Required correction:** Define one positional representation explicitly: for example, `results: Array<{ id, classification, record?: TaskRecordV1 }>` with `record` omitted for missing and inaccessible IDs, or `records: Array<TaskRecordV1 | null>` with a required documented `null` rule. State whether foreign records are omitted/redacted and update the renderer input contract accordingly.

### 3. [medium] The batch provider-content byte guarantee is unbounded

- **Contract locations:** Shared schema and compatibility; Graph-aware batch rule 9; graph-aware batch item schema.
- **Problem:** Batch success content must include one `{ key?, id, state }` entry per created task, but `tasks[]` has no maximum item count and `key` permits up to 64 characters. The 4,096 UTF-8-byte requirement applies to "each new action", while batch is materially extended with new fields and a new response shape. Whether the bound applies to the extended batch is therefore ambiguous; if it does, the required complete task list cannot fit for sufficiently large valid batches.
- **Impact:** An implementation must either violate the byte cap, silently truncate a contractually complete success list, or impose an undocumented batch limit. Non-ASCII keys also make character-count-only sizing invalid.
- **Required correction:** State explicitly whether the 4,096-byte rule covers `batch`. If it does, set a schema/runtime `tasks[]` limit derived from worst-case UTF-8 output or define a compact/truncated provider summary with complete aliases and records only in details. Require UTF-8 byte measurement for this batch response as well.
