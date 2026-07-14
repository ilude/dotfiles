# Pi Operational Review - Previous 7 Days

## Scope and bounds

- Window: `2026-07-07T18:02:09.706Z` inclusive through `2026-07-14T18:02:09.706Z` exclusive, a rolling seven-day UTC window ending when current session `019f61cb` started.
- Current session `019f61cb` and records at or after its start time were excluded. The time cutoff also prevents current-session child activity with separate session IDs from entering the aggregates.
- Sources: `workflow-friction/interactions.jsonl`, `workflow-friction/reviews.jsonl`, `logs/metrics-2026-07-12.jsonl`, `logs/metrics-2026-07-14.jsonl`, and session JSONL filenames, first-line headers, timestamps, record types, and non-content metadata under `sessions/`.
- No prompt or response text, message bodies, review narrative, secret values, or tool arguments were inspected or reproduced.

## Method

1. Parse each scoped JSONL line as one record.
2. Select interaction and review records where `startedAt` is inside the window. Select metric records where `ts` is inside the window.
3. Select session files whose header `timestamp` is inside the window, excluding the current session. Count only session records with `timestamp` before the window end.
4. Join coverage by exact equality between session header `id` and `sessionId` or metric top-level `session`. Join interaction telemetry by exact equality of `interactionId` and `data.interactionId`.
5. Sum counters directly. Duration percentiles use the nearest-rank method: sorted value at `ceil(0.95 * N)`. Session file spans are last metadata timestamp minus header timestamp; they are not active-work durations and may overlap.
6. Cost totals use only numeric `costUsd` values. Parent and worker costs are added because task-status usage duplicates worker usage and is therefore not added again.

## Source and coverage inventory

| Source | In-window records | Distinct matched session headers | Denominator | Coverage / notes |
| --- | ---: | ---: | ---: | --- |
| Session JSONL headers | 10 files | 10 | 10 files | 3 started Jul 12; 7 started Jul 14 |
| Session JSONL metadata | 1,934 records | 10 | 10 files | Metadata only, through cutoff |
| Interactions | 113 | 9 | 10 session files | 90.0%; 27 distinct `sessionId` values, including 18 without a matching top-level session header |
| Reviews | 20 | 5 | 10 session files | 50.0% session coverage; 17.7% of 113 interactions reviewed |
| Metrics | 326 | 9 | 10 session files | 90.0%; only Jul 12 and Jul 14 metric files were in scope |
| Interaction usage telemetry | 94 | 94 | 113 interactions | 83.2% exact `interactionId` coverage; 19 interactions lack usage telemetry |

Session roots were six `.dotfiles`, three `homelab-infra`, and one `onboard`. Session metadata contains no explicit completed/closed field. Consequently, the 10 non-current files requested as completed sessions are treated as the session-file population, but completion cannot be independently verified from headers. The missing interaction coverage is the Jul 12 session that ended before the first recorded interaction telemetry.

## Duration and activity

| Metric | Value | Calculation / denominator |
| --- | ---: | --- |
| Interaction duration, total | 17,987,324 ms (5.00 h) | Sum `durationMs`, N=113 |
| Interaction duration, mean | 159,180 ms (2.65 min) | N=113 |
| Interaction duration, median | 45,463 ms | N=113 |
| Interaction duration, p95 | 584,868 ms (9.75 min) | Nearest-rank, N=113 |
| Interaction duration, max | 3,022,368 ms (50.37 min) | N=113 |
| Interactions at least 10 min | 5 (4.4%) | 5 / 113 |
| Session metadata span, total | 236,464,265 ms (65.68 h) | Sum of 10 file spans; overlapping and idle time included |
| Session metadata span, median | 5,565,110 ms (1.55 h) | N=10 files |
| Session metadata span, max | 183,236,618 ms (50.90 h) | N=10 files |

Interactions with `subagentCount > 0` were much longer: 11 interactions, mean 554,421 ms and median 320,581 ms, versus 102 non-subagent interactions with mean 116,556 ms and median 29,597 ms. This is descriptive only; task complexity is an uncontrolled confounder.

## Tool, validation, and friction counters

| Metric | Value | Calculation / denominator |
| --- | ---: | --- |
| Tool calls | 1,178 | Sum `toolCount`, N=113 interactions |
| Tool failures | 133 | Sum `toolFailureCount`, N=113 |
| Failure-to-call ratio | 11.3% | 133 / 1,178; this is not necessarily a unique-call failure rate |
| Interactions with a tool failure | 51 (45.1%) | 51 / 113 |
| Interactions with 2+ failures | 29 (25.7%) | 29 / 113; max 16 |
| Validation events | 123 | Sum `validationCount`, N=113 |
| Interactions with validation | 33 (29.2%) | 33 / 113 |
| Interactions with 2+ validations | 24 (21.2%) | 24 / 113; max 14 |
| File-mutating interactions | 13 | `fileMutationCount > 0`, N=113 |
| Mutating interactions with validation | 12 (92.3%) | 12 / 13 |
| Mutating interactions without validation | 1 (7.7%) | 1 / 13 |

Thirty interactions were selected for friction review. Selection reasons are non-exclusive: `repeated_tool_failure` 18, `subagent_duration_over_2m` 12, `duration_over_10m` 5, `user_frustration` 4, `repeated_failed_command` 2, and random control 1. Twenty reviews completed: 13 mixed, 6 productive, and 1 churn. Half of reviews marked a reusable instruction as likely.

Permission telemetry contains 107 decisions: 105 denied and 2 allowed. Of the denials, 97 were attributed to `data.rule = secret_output`; the remaining rules were safety or semantic controls. Tool distribution was read 66, bash 21, web fetch 8, grep 8, subagent 2, web search 1, and PowerShell 1. These counts use `event = permission_decision` and `data.outcome`, `data.rule`, `data.tool`, and `data.provenance`; rule expressions and tool arguments are omitted.

## Tokens and known cost

| Usage source | Rows | Input | Output | Cache read | Cache write / creation | Known cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Parent interactions | 94 | 2,824,811 | 203,546 | 59,631,616 | 0 | $55.278473 |
| Orchestration workers | 29 | 1,879,469 | 134,446 | 9,080,832 | 0 | $9.663880 |
| Combined observed | 123 | 4,704,280 | 337,992 | 68,712,448 | 0 | $64.942354 |

Exact fields were parent `data.parentUsageByModel[].inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `contextPeakTokens`, and `costUsd`; worker `data.workers[].usage.inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `processedTokens`, and `costUsd`.

All 94 parent rows identify `openai-codex/gpt-5.6-sol`; maximum parent `contextPeakTokens` was 313,363. Worker usage reports 11,094,747 processed tokens and 248 turns. Worker cost is available for 25 of 29 workers; the four failed workers have null cost. Therefore $64.942354 is a known-cost subtotal, not a complete cost total. Parent telemetry is also absent for 19 interactions. Cache reads were 14.6 times combined fresh input tokens, indicating substantial context reuse and context-processing volume, but the metadata does not expose cache pricing or attributable cost by token category.

## Delegation topology and status

| Metric | Value | Fields / denominator |
| --- | ---: | --- |
| Orchestration runs | 23 | `event = orchestration_run` |
| Run status | 21 completed, 2 failed | `data.status`, N=23 |
| Workers | 29 | `data.workers[]` |
| Worker status | 25 completed, 4 failed | Worker `status`, N=29 |
| Worker failure rate | 13.8% | 4 / 29 |
| Fan-out | 18 x 1, 4 x 2, 1 x 3 | `data.fanOut`, N=23 |
| Mode | 15 single, 5 parallel, 3 task-execute | `data.mode`, N=23 |
| Aggregate run duration | 4,776,664 ms (1.33 h) | Sum `data.durationMs`; overlapping work may exist |
| Run duration median / p95 / max | 125,835 / 585,455 / 964,448 ms | N=23 |
| Known worker cost share | 14.9% | $9.663880 / $64.942354 known cost |

Worker models were 11 terra, 7 luna, 7 sol, and 4 unavailable on failed workers. Output modes were 23 inline, 3 none, and 3 artifact. Interaction counters report 21 subagents across 11 interactions, while orchestration telemetry reports 29 workers. These are different event surfaces and should not be treated as interchangeable.

Task metadata has 73 `task_status_change` events over 27 task IDs: 24 pending, 24 running, and 25 completed transitions. It has no failed transition even though worker records contain four failures. Timing metadata has 28 spans: 25 successful `subagent.run` spans and 3 successful commit-tool spans. Exact fields were `data.taskId`, `to`, `from`, `retryCount`, `usage`; and timing `data.name`, `category`, `durationMs`, `status`, and non-content `metadata`.

## Unavailable or non-comparable fields

- No explicit session close/completion marker or active-time field exists in the inspected session metadata.
- No metric files for Jul 8-11 or Jul 13 were provided. Zero activity on those dates cannot be distinguished from absent telemetry.
- Interaction records do not contain tokens, cost, tool names, individual validation names, or per-call durations.
- Nineteen interactions have no matching orchestration-interaction usage event.
- Four failed workers have no numeric cost and no resolved model.
- Review selection is trigger-biased and covers only 17.7% of interactions; review classifications are not a population quality rate.
- Counts from task transitions, workers, timing spans, and interaction subagent counters have different semantics and do not reconcile one-to-one.
- Session metadata spans include idle gaps and overlap across concurrent files; they must not be summed as labor time.

## Prioritized operational findings

1. **Reduce repeated tool failure first.** Tool failures occurred in 45.1% of interactions and represented 11.3 failures per 100 tool calls; 25.7% of interactions had at least two failures. `repeated_tool_failure` was the largest selection trigger and appeared in 14 of 20 completed reviews. Prioritize failure isolation by tool and command-construction boundary before broader workflow optimization.
2. **Close telemetry coverage and status-consistency gaps.** Usage exists for only 94 of 113 interactions, metric files cover only two observed dates, worker failures do not appear as failed task transitions, and completion is absent from session headers. Add a stable parent-session ID, explicit session close event, and reconciled terminal task status before using these metrics for trends or SLOs.
3. **Control context and known cost.** Observed cost is at least $64.94, with 68.7M cache-read tokens against 4.70M fresh input tokens and a 313,363-token parent context peak. Instrument cost by interaction, cache category, and context peak, then inspect the highest-context interactions for avoidable retained state.
4. **Treat delegation as a reliability and latency trade-off.** Orchestration produced 4 failed workers out of 29 and 2 failed runs out of 23. Subagent-bearing interactions had a 4.8x higher mean duration than non-subagent interactions, though complexity likely contributes. Track task complexity and critical-path child duration before deciding whether delegation itself causes delay.
5. **Preserve mutation validation while reducing non-mutating validation churn.** Twelve of 13 mutating interactions had validation, a strong observed safety pattern. Separately, 24 interactions ran at least two validations and 21 validated despite no file mutation. Capture validation names and outcomes to distinguish necessary read-only checks from redundant reruns.
