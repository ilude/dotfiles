# Stale Team Lead result investigation

Date: 2026-09-17. Profile: default. Source revision:
`c3fbed9ad8490d5713483febbc2e828a6c8aa2dd`.

## Finding

An explicit `partial` report remains attached to a running coordinator across
multiple deferred settlement turns. When descendants finish and the coordinator
finally settles, `RpcChild.finishFromTurn` prefers the earlier report over the
new final text and retains the `partial` outcome. The parent notification faithfully
renders that already-stale record. This is not a retained follow-up overwriting a
previously completed assignment, and does not require a lost final message.

The current source reproduces the exact stale-text/outcome pattern in the recorded
incident. Historical wire payloads were not logged, so receipt of the actual final
wire text is inferred from the source/timing and reproduced behavior, not claimed
as separately captured transport evidence.

## Historical evidence

Read-only `log_analytics` queries selected two exact default-profile sessions:

- Lead: `01a0b051-20c1-7681-a1e7-cc553ccfadf9` (756,408 bytes).
- Parent: `01a0b04e-3172-76a1-b372-9a6c59e8488a` (3,335,676 bytes).

Key records, all times UTC on 2026-09-17:

| Time | Session / record | Evidence |
| --- | --- | --- |
| 17:44:47.190 | Lead `93fe9324` | Calls `subagent_parent partial` with “Current work remains active asynchronously” and “Not complete.” |
| 17:44:47.193 | Lead `206103df` | Tool returns “Report accepted by parent.” |
| 17:44:53.272 | Lead `af4d6ea7` | Ends a turn saying correction is running and validation is pending. |
| 17:45–17:48 | Lead subsequent records | Handles direct user questions and worker results, then commissions the validator's final rerun. |
| 17:50:42.789 | Lead `d826bc6f`, `0ed70e5c` | Finish controls confirm validator and developer settled, completed, and closed. |
| 17:50:54.978 | Lead `b238075b` | Normal final reply: “Completed and independently validated.” Reports checks and all workers closed. |
| 17:50:55.412 | Parent `d34138f1` | Automatic `subagent-result` says `partial` and repeats the 17:44:47 report. |
| 18:15:17.344 | Parent `f2c7e9a1` | Later inspection returns the same stale result, settled/exited, retained false, five turns, cleanup complete. |

The inspected record retains assignment start 17:18:49.594 and finishes at
17:50:55.410. The stale partial and later final belong to the same ongoing runtime
assignment, not two settled retained exchanges. The partial's prose calls the lead
retained, but actual runtime metadata says `retained:false`.

Coverage: targeted queries over the two selected files, not a whole-session semantic
review or a cross-session recurrence count. Successful query results were untruncated
and discovery reported no excluded files. One SQL query failed because an unparenthesized
JSON extraction expression had incorrect precedence; the corrected query succeeded.
No raw-history fallback, legacy search, or live-team controls were used.

## Source path

Paths below are relative to `pi/profiles/default/`; line numbers refer to the
revision above.

1. `lib/subagents/rpc.ts:282-284`: `partial`/`blocked` writes `record.outcome` and
   `record.result` immediately but does not settle the assignment.
2. `lib/subagents/runtime.ts:241`: a coordinator has outstanding work while a
   descendant remains active/cleaning up or has a pending outcome.
3. `lib/subagents/rpc.ts:330-332`: settlement returns early in `waiting-children`,
   leaving the explicit report in the record.
4. `lib/subagents/visible.ts:101-109`: direct user input only clears current state
   when status is not running. A waiting-children coordinator is still running.
   Automatic outcome delivery through `child-surface.ts` also does not call the
   `RpcChild.startMessage` reset path.
5. `lib/subagents/child-surface.ts:101-113`: assistant `message_end` captures latest
   text, then `agent_settled` sends it in the numbered `turn` payload.
6. `lib/subagents/visible.ts:123-130`: accepts the turn, sets `last` to its text, and
   calls the shared `finishFromTurn` implementation.
7. `lib/subagents/rpc.ts:336`: if stored outcome is partial/blocked, selects
   `record.result || last`, preferring the old report even when latest text exists.
   Line 340 retains that outcome with `outcome ?? "complete"`.
8. Cleanup and `done()` publish the selected snapshot. Runtime delivery and
   `status.ts` formatting then expose the stale record; changing rendering alone
   would leave inspection wrong.

## Deterministic reproduction

Ran an inline Node/tsx probe against the unchanged real `VisibleChild` and shared
`RpcChild` code, plus the real `outcomeText` formatter. No files or live children
were created. Only external process cleanup was replaced with an inert subclass
method that marks its nonexistent process exited. Descendant availability was a
controlled `hasOutstandingChildren` callback. No result-selection methods were
mocked, and no expected result was installed directly into the record.

Reproduction sequence:

1. Construct a non-retained visible coordinator with `subagent_parent` authority.
2. Submit `parentMessage({type:"partial", payload: oldReport})`.
3. Hold descendant availability true; submit numbered turn 1 with waiting text.
   Assert status remains running, phase waiting-children, and no terminal update.
4. Submit ordinary operator input and numbered turn 2; keep descendants outstanding.
5. Release descendant availability; submit numbered turn 3 with final completion text.
6. Await `onUpdate` and compare received latest text, snapshot, and rendered outcome.

Observed:

```text
received latest text: Completed and independently validated. All workers closed.
stored result:        Current work remains active asynchronously. Not complete.
outcome:              partial
status:               settled
process:              exited
notification:         partial, containing the old report
```

Two controls also passed their current-behavior assertions:

- Without an earlier partial, normal final text becomes the result and outcome complete.
- A partial report in the same settling turn remains partial and retains its explicit
  report. This protects legitimate unfinished-work reporting from a blanket
  “always use the last text” fix.

This was a successful reproduction of the defect, not a passing regression for a
fix. It tested real selection, turn acceptance, snapshot, and formatting behavior;
it did not launch Pi/Herdr or exercise real process/pane cleanup. No permanent test
or production source was added or changed.

## Implementation implications

The causal investigation requested for T2a is now established; T2a still owns the
correction and a permanent regression. T2b remains separate: preserving original
results cannot repair selection that was already stale at first settlement.

Recommended correction boundary: give explicit partial/blocked reports a defined
settlement-turn lifetime so a report from a deferred earlier turn does not override
a later turn with no renewed report. Preserve a report explicitly made in the turn
that actually settles. Use lifecycle identity rather than prose interpretation.
Do not indiscriminately reset on every tool/model `turn_start`: a report and its
ordinary final acknowledgement can span several native tool/model turns within
one `agent_settled` cycle.

The permanent regression should reproduce the deferred-turn sequence above, assert
the later final is selected and reported as complete, and retain the same-turn
partial/blocked control. T5 should verify the corrected snapshot survives parent
notification and cleanup, not rediscover this cause. No new reporting tool, success
acknowledgement, read receipt, or approval gate is needed.
