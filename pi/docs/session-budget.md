# Session budget watchdog

The session budget gives each user request a tool-call and time budget, detects repeated delegation or command failures, and pauses for a user decision instead of terminating the session.

## Interaction epochs

An epoch starts when Pi receives an input message and ends when the next input message arrives. Interactive, RPC, and extension-originated user messages all start epochs. Hidden custom notices do not.

The watchdog records only the current epoch's start time, tool-call count, modified file paths, subagent types and normalized prompt hashes, and consecutive command-error signatures. It does not classify the request or judge its meaning.

## Sensors and defaults

| Sensor | Soft trip | Hard trip |
| --- | --- | --- |
| Budget | 25 tool calls or 10 minutes | 60 tool calls or 30 minutes |
| Repeat spawn | None | Second subagent launch with the same agent type and normalized prompt |
| Command errors | Third consecutive identical command/error pair | Fifth consecutive identical command/error pair |

Time is evaluated when watchdog events occur, including before tool calls. The first known wait or poll call counts toward the tool budget; repeated identical calls do not. Recognized waits are `onclave_await`, `onclave_get`, `task` with `action: "await"`, and direct `sleep` or `wait` shell commands.

Direct `subagent` calls and executable `task` starts both feed the repeat-spawn sensor. A successful command, a changed command, or a changed error signature resets the command-error streak.

## Check the current budget

Run:

```text
/budget
```

The report shows elapsed time, tool calls, modified files, subagent counts, the current command-error streak, configured thresholds, and whether each sensor is clear, soft, hard, or acknowledged. If no user message has started an epoch, it reports that no epoch is active.

## Escalation behavior

A soft trip injects one hidden re-anchoring notice for that sensor. The notice quotes the request that opened the epoch, reports the measured footprint, and directs the current run to finish only the remaining requested work or ask the user.

A hard budget or repeat-spawn trip gates the tool call that reaches the threshold. A hard command-error trip gates the following tool call because the failure is known only after command completion. The gate presents three choices:

- `continue as scoped` - allow the pending tool and acknowledge that sensor for the rest of the epoch.
- `wrap up now` - allow the pending tool and inject a directive to stop expanding work, perform only necessary validation, and report.
- `stop` - block the pending tool, inject a directive to report current state, and block subsequent tools until the next user input starts a new epoch.

Cancelling the dialog leaves the hard gate pending. In non-interactive modes, each attempted tool remains blocked for that epoch; a new input starts a fresh epoch. The watchdog never kills Pi, aborts the agent, or terminates a session.

## Configure or disable

The user-owned `sessionBudget` object in `~/.pi/agent/settings.json` controls the watchdog. In this dotfiles installation that file is linked from `pi/settings.json`.

```json
{
  "sessionBudget": {
    "enabled": true,
    "softToolCalls": 25,
    "hardToolCalls": 60,
    "softMinutes": 10,
    "hardMinutes": 30,
    "maxSameAgentSpawns": 1,
    "maxCommandErrorRepeats": 3
  }
}
```

Missing fields use the defaults above. Values must be positive, call and repeat limits must be integers, and each hard budget must exceed its soft budget. Invalid user configuration disables the watchdog for that session and `/budget` reports the configuration error.

Set `enabled` to `false` to disable event subscriptions while retaining the read-only `/budget` command. Project `.pi/settings.json` and `.pi/settings.local.json` files cannot weaken or disable this user-owned control.

Reload Pi after changing settings.

## Telemetry

Trips and user responses append metadata-only records under:

```text
~/.pi/workflow-telemetry/<epoch-id>/events.jsonl
```

Records include the epoch ID, sensor, level, metric, measured value, threshold, and selected hard-trip response. They do not include prompts, commands, tool output, or error text. Telemetry failure is logged but never changes an allow or block decision.

Use telemetry to decide whether thresholds need adjustment after observed sessions. Do not lower or add sensors from speculation alone.

## Prior art and exclusions

The design follows these references:

- [OpenHands StuckDetector](https://docs.openhands.dev/sdk/guides/agent-stuck-detector)
- [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/html/2503.13657v3)
- [SNARE](https://arxiv.org/pdf/2605.28122)
- [Harness engineering](https://www.faros.ai/blog/harness-engineering)
- [Agent harness engineering](https://addyosmani.com/blog/agent-harness-engineering/)

Rejected and deferred sensors, their rationale, and the evidence required to revisit them are recorded in [the plan's "Not implemented and why" section](../../.specs/pi-session-budget/plan.md#not-implemented-and-why).
