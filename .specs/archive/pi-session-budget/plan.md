# Pi Session Budget: Epoch Watchdog for Off-Task Drift

Build a small deterministic watchdog in the Pi harness that bounds unattended
work between user messages and interrupts runaway sessions with a status
check-in instead of letting them run to exhaustion.

The whole system in one sentence: Pi gets a budget of tool calls and minutes
per user request, a repeated same-type review or a repeatedly failing command
trips it early, and tripping it means a check-in, never a kill.

Motivating failures (observed, not hypothetical):
- A small requested change escalated into repeated security-agent reviews,
  restarted implementations, and a multi-hour rewrite of an unrequested
  feature.
- Retry loops: the same failing command re-run repeatedly, burning time and
  tokens without progress.
- A /loop supervisor previously invented its own termination condition;
  policy now forbids model-invented limits, which means legitimate limits
  must live in the harness as user-owned configuration. This plan is that
  harness side.

## Prior art (research 2026-07-19)

- OpenHands StuckDetector (https://docs.openhands.dev/sdk/guides/agent-stuck-detector):
  rule-based, on by default; patterns include same action-observation 4+
  times, same action-error 3+ times, alternating ping-pong 6+ cycles.
  Lessons from their issue tracker: long-running commands cause false
  positives (issues #5355, #10350), and a hard RuntimeError on stuck left
  sessions unrecoverable until replaced with a graceful state transition
  (PR #5500). Design consequences adopted below: exempt wait-polling, and
  never hard-crash.
- MAST failure taxonomy, "Why Do Multi-Agent LLM Systems Fail?"
  (https://arxiv.org/html/2503.13657v3): names the relevant failure modes -
  task derailment, step repetition, unawareness of termination conditions.
  Finding: a verifier alone is not sufficient; system-level design flaws
  dominate.
- SNARE (https://arxiv.org/pdf/2605.28122): "overeager" coding agents
  complete the stated task and also perform unauthorized extra actions;
  completion-oriented evaluation credits out-of-scope side effects, so a
  scope watchdog must be a separate sensor.
- Harness engineering practice (https://www.faros.ai/blog/harness-engineering,
  https://addyosmani.com/blog/agent-harness-engineering/): guardrails as
  deterministic "sensors" that close the control loop, with a ratchet
  principle - every observed failure class gets a sensor that would catch
  its recurrence. This plan implements sensors only for observed failure
  classes and records everything else in "Not implemented and why".

## How to run

- Work in `~/.dotfiles/pi/`. Do not commit; leave changes uncommitted for
  review. ASCII punctuation only in all new text. No AI-involvement mentions.
- Validation: `cd pi && pnpm typecheck && pnpm biome:check && pnpm test`.
- Reference implementations to read before writing code (canonical patterns,
  do not invent parallel mechanisms):
  - `pi/extensions/damage-control.ts`: `pi.on("tool_call")` interception,
    block/ask mechanics, notify patterns.
  - `pi/extensions/loop.ts`: long-running job control, iteration counting,
    registerCommand usage.
  - `pi/lib/workflow-telemetry.ts`: episode creation and event logging.
  - `pi/extensions/workflow-commands.ts`: message injection into model
    context (see its hidden-prompt custom message type).
  - Event and API surface: the `@earendil-works/pi-coding-agent` type
    declarations under `pi/extensions/node_modules/.pnpm/` (types.d.ts).
- Discovery step, do first: enumerate available `pi.on(...)` event names from
  the type declarations. Required: an event fired on each user message (to
  delimit epochs) and the tool_call event payload shape (tool name, args).
  If no user-message event exists, derive epoch boundaries from the
  session/message stream the way damage-control derives its state. Record
  what you found in the implementation notes of the final report.

## Decisions already made (do not revisit)

- Simplicity is the acceptance bar: the user must be able to explain the
  system in one sentence, and every trip must be self-evident when it fires.
  Sensors that need a formula to explain were rejected (see "Not
  implemented and why").
- Deterministic detectors only. No LLM judge, no task classifier, no
  semantic analysis. Code decides; the model is only the recipient of
  notices.
- No dependency on a scope contract or any slash-command workflow. The unit
  of tracking is the interaction epoch: everything between one user message
  and the next.
- Thresholds are user-owned configuration in `pi/settings.json` with
  defaults, not constants buried in code and not model-visible rules. This
  is the harness-owned counterpart to the AGENTS.md rule that the model must
  not invent limits.
- Escalation is check-in, not kill. Soft trip injects one re-anchoring
  notice; hard trip pauses and asks the user. The watchdog never terminates
  the session on its own and never throws (OpenHands PR #5500 lesson).
- Wait-polling on long-running commands is exempt from repeat counting
  (OpenHands #5355/#10350 lesson).
- Enabled by default, generous thresholds, single `enabled: false` opt-out.

## Design

### Epoch model

An epoch starts at each user message and ends at the next one. The tracker
accumulates per-epoch state: start time, tool-call count, subagent spawns
(agent type + normalized prompt hash), failing-command repeats (normalized
command + error signature), and the set of files touched (for the footprint
readout only; no sensor fires on it).

### Sensors

1. Budget: soft trip at `softToolCalls` (default 25) or `softMinutes`
   (default 10) since epoch start; hard trip at `hardToolCalls` (default 60)
   or `hardMinutes` (default 30). Wall-clock spent waiting on a single
   long-running command counts toward minutes, but a repeated identical
   poll/wait command does not increment the tool-call count.
2. Repeat spawn: a second spawn of the same subagent type within one epoch
   with a similar prompt (normalized hash) trips hard. First spawn of each
   type is free. `maxSameAgentSpawns` default 1.
3. Action-error repeat: the same command failing with the same error
   signature `maxCommandErrorRepeats` times (default 3) trips soft; twice
   more trips hard. A command that fails, is changed, and then succeeds
   never trips.

### Visibility

A read-only `/budget` command (registerCommand, same pattern as loop.ts)
prints the current epoch footprint: elapsed minutes, tool calls, files
touched, spawns, and each sensor's state vs its threshold. This is the
cheapest control in the system: the user can see a marathon forming and
interrupt on their own judgment before any threshold fires. If the TUI
supports a persistent widget/statusline segment, add the same numbers there;
if that requires new UI machinery, skip it (the command is sufficient).

### Escalation

- Soft trip: inject one system notice into model context, at most one per
  sensor per epoch (no nag loops). Content pattern: quote the user message
  that opened the epoch, state the measured footprint (calls, minutes,
  files), and instruct: state what remains to satisfy the original request,
  do only that, or ask the user. Injection uses the same mechanism as the
  workflow-commands hidden prompt.
- Hard trip: before the next tool call executes, pause and ask the user via
  the ask-user mechanism with a compact status summary and three options:
  continue as scoped, wrap up now, stop. Blocking a pending tool call uses
  the same mechanics damage-control uses for ask-gated commands. The user's
  answer resets that sensor for the remainder of the epoch (continue),
  injects a wrap-up directive (wrap up), or cancels the pending call and
  injects a stop directive (stop).
- Every trip (soft and hard, plus the user's response) is logged as a
  workflow-telemetry event with epoch id, sensor, measured values, and
  thresholds, so thresholds can be tuned from real sessions later.

### Configuration

`pi/settings.json`, new top-level key:

```json
"sessionBudget": {
  "enabled": true,
  "softToolCalls": 25,
  "hardToolCalls": 60,
  "softMinutes": 10,
  "hardMinutes": 30,
  "maxSameAgentSpawns": 1,
  "maxCommandErrorRepeats": 3
}
```

Missing key or missing fields fall back to these defaults in code. Follow
the existing settings access pattern in `pi/lib/settings-loader.ts`.

## Tasks

### Phase 1: pure tracker library plus tests

1. `pi/lib/session-budget.ts`: pure, side-effect-free tracker. Input: a
   stream of typed events (epoch_start, tool_call {name, args, timestamp},
   command_result {command, ok, errorSignature}, spawn {agentType,
   promptHash}). Output: zero or more findings ({sensor, level: soft|hard,
   measured, threshold, epochId}). All thresholds injected via a config
   object. No imports from extension runtime, no I/O, no Date.now
   (timestamps come in on events) - this makes every sensor unit-testable
   with synthetic streams.
2. `pi/tests/session-budget.test.ts` (vitest, matching existing test
   conventions): per sensor, at least one triggering stream and one
   near-miss stream. Required false-positive cases that must NOT trip:
   repeated identical wait/poll commands on a long-running process (repeat
   exemption); a second subagent spawn of a different type; a command that
   fails twice, is modified, and succeeds; a soft notice already sent -
   the same sensor does not fire twice in one epoch.
3. Acceptance: `pnpm test` passes; the tracker module imports nothing from
   `pi/extensions/`.

### Phase 2: extension wiring

1. `pi/extensions/session-budget.ts`: subscribe to session and tool-call
   events (per the discovery step), feed the tracker, and act on findings:
   soft -> inject notice; hard -> ask-user gate on the pending tool call.
   Register the `/budget` command. Wrap every handler so an internal error
   logs and disables the watchdog for the session rather than crashing or
   blocking work.
2. Settings load per the Configuration section; `enabled: false` results in
   no subscriptions at all (the `/budget` command may remain and report
   "disabled").
3. Telemetry: emit events through `pi/lib/workflow-telemetry.ts` using its
   existing episode/event shape.
4. Acceptance: `pnpm typecheck`, `pnpm biome:check`, `pnpm test` pass. A
   manual smoke script or test simulating a burst of tool_call events
   through the extension path shows: one soft notice at threshold, ask-user
   gate at hard threshold, `/budget` output correct, telemetry records
   written.

### Phase 3: documentation

1. `pi/docs/session-budget.md`: the one-sentence model, the three sensors
   with defaults, `/budget`, how to tune or disable, how to read the
   telemetry, and the two escalation behaviors as the user experiences
   them. Include the prior-art links and a pointer to the "Not implemented
   and why" section of this plan.
2. Do not add rules about the watchdog to `pi/AGENTS.md` or any skill: the
   injected notices are self-explanatory to the model, and the whole point
   is that this control lives in the harness, not in prompt guidance.

## Not implemented and why

This section is the durable record. It lives on when the plan is archived:
each entry names a considered mechanism, why it was rejected, and the
observation that would justify revisiting it (the ratchet rule: a sensor is
added when a real failure slips past the shipped ones, not before).

- Self-churn sensor (detect the agent deleting/rewriting code it wrote
  earlier in the same epoch - the "start over" signature). Rejected: the
  line-level accounting is the most complex code the tracker would contain,
  and the budget sensor catches the same marathon a few minutes later. The
  failure is real and observed, but the detector failed the simplicity bar.
  Revisit if: a start-over spiral repeatedly completes inside the budget
  thresholds and therefore never trips anything.
- Fan-out sensor (touched files exceeding a multiple of the first edit
  burst). Rejected: "4x the first-burst set with a floor of 8" is a formula
  the user will not hold in their head; trips would require reading docs to
  understand. Budget covers the same ground later. Revisit if: wide, fast
  rewrites finish under budget and the footprint readout shows fan-out
  would have been the only early signal.
- Ping-pong sensor (two action-observation pairs alternating, per
  OpenHands). Rejected: hard to explain, overlaps both budget and
  action-error repeat. Revisit if: telemetry shows oscillation loops that
  action-error repeat misses because the two alternating commands each
  "succeed".
- Tool-narrowing on wrap-up (after the user chooses "wrap up", restrict the
  tool set to validation and reporting; prior art: state-machine guardrails
  took local models from 2/10 to 10/10 on a SWE-bench subset purely by
  shrinking tool space). Rejected for v1: introduces a mode, and modes are
  where users lose the ability to reason about a system ("why won't it edit
  right now?"). Revisit if: telemetry shows wrap-up directives being
  ignored (edits continuing after a wrap-up answer).
- Verification-inflation sensor (validation re-run after passing, followed
  by more edits - the clearest gold-plating tell). Deferred: plausible but
  not yet observed in this setup. Revisit on first observed instance.
- MAST failure-code labels on telemetry events. Rejected: academic garnish;
  nobody tuning thresholds on their own sessions needs a published taxonomy
  code per event. Revisit if: this telemetry is ever shared or compared
  across projects where a common vocabulary earns its keep.
- Git stash-ref snapshot at epoch start (cheap rollback baseline, borrowed
  from Aider's auto-commit hygiene). Rejected: `git diff` against the last
  commit already provides the baseline; hidden git artifacts confuse more
  than they help. Revisit if: multi-epoch sessions make "diff since my last
  message" a question git cannot answer.
- LLM judge / checkpoint reviewer tier (semantic drift detection, run in
  parallel per arXiv 2604.13759's monitor architecture). Deferred: v1 is
  deterministic-only by decision. Revisit when a real drift incident is
  documented that no deterministic sensor could have caught; implement as a
  parallel, non-blocking monitor if so.
- Task-size classifier for adaptive thresholds (one cheap model call per
  user message emitting S/M/L). Rejected: flat budgets plus `/budget`
  visibility are simpler, and misclassification would make trips harder to
  reason about, not easier. Revisit if: false-positive check-ins on
  legitimately large tasks become a recurring annoyance in practice.
- Scope-contract schema and slash-command factory gates. Out of scope here
  by design: that is a separate system for explicitly structured work (its
  own spec, if pursued). This watchdog intentionally works with zero setup
  on ad-hoc conversational requests.
- Auto-abort / any termination without a user decision. Rejected
  permanently, not just deferred: safety controls that alter completion or
  liveness require an explicit user decision (see pi/AGENTS.md scope and
  execution policy). Do not revisit.

## Verification

1. `cd pi && pnpm typecheck && pnpm biome:check && pnpm test` all pass.
2. Unit tests cover every sensor's trip and near-miss cases listed in Phase
   1, including all four required false-positive cases.
3. With `sessionBudget.enabled: false` in settings, the extension registers
   no event subscriptions (assert via its exported state or a debug log).
4. Grep check: `rg -n 'Date.now' pi/lib/session-budget.ts` returns nothing
   (timestamps are event-supplied).
5. Report: files changed, test output, the discovered event names used for
   epoch boundaries, and any deviation from this plan with its reason.
   Leave everything uncommitted.
