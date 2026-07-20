# Pi Session Budget: Epoch Watchdog for Off-Task Drift

Build a deterministic watchdog in the Pi harness that bounds unattended work
between user messages and interrupts runaway sessions (repeated self-invoked
reviews, start-over rewrites, multi-hour marathons on small asks) with a
status check-in instead of letting them run to exhaustion.

Motivating failures (observed, not hypothetical):
- A small requested change escalated into repeated security-agent reviews,
  restarted implementations, and a multi-hour rewrite of an unrequested
  feature.
- A /loop supervisor previously invented its own termination condition;
  policy now forbids model-invented limits, which means legitimate limits
  must live in the harness as user-owned configuration. This plan is that
  harness side.

## Prior art (research 2026-07-19)

- OpenHands StuckDetector (https://docs.openhands.dev/sdk/guides/agent-stuck-detector):
  rule-based, on by default; patterns: same action-observation 4+ times, same
  action-error 3+ times, agent monologue 3+ messages, alternating ping-pong
  6+ cycles, repeated context-window errors. Lessons from their issue
  tracker: long-running commands cause false positives (issues #5355,
  #10350), and a hard RuntimeError on stuck left sessions unrecoverable
  until replaced with a graceful state transition (PR #5500). Design
  consequences adopted below: exempt wait-polling, and never hard-crash.
- MAST failure taxonomy, "Why Do Multi-Agent LLM Systems Fail?"
  (https://arxiv.org/html/2503.13657v3): names the relevant failure modes -
  task derailment (FM-2.3), step repetition, unawareness of termination
  conditions, premature/incorrect verification. Finding: a verifier alone is
  not sufficient; system-level design flaws dominate.
- SNARE (https://arxiv.org/pdf/2605.28122): "overeager" coding agents
  complete the stated task and also perform unauthorized extra actions;
  completion-oriented evaluation credits out-of-scope side effects, so
  completion signals alone cannot catch this. A scope watchdog must be a
  separate sensor.
- Harness engineering practice (https://www.faros.ai/blog/harness-engineering,
  https://addyosmani.com/blog/agent-harness-engineering/): guardrails as
  deterministic "sensors" that close the control loop, with a ratchet
  principle - every observed failure class gets a sensor that would catch
  its recurrence. This plan implements sensors only for observed failure
  classes and defers speculative ones.
- Ecosystem norm: Claude Code and Codex both expose deterministic lifecycle
  hooks (SessionStart/PreToolUse/PostToolUse) for exactly this kind of
  guardrail; Pi's equivalent is `pi.on("session_start")` / `pi.on("tool_call")`,
  already used by `pi/extensions/damage-control.ts`.

## How to run

- Work in `~/.dotfiles/pi/`. Do not commit; leave changes uncommitted for
  review. ASCII punctuation only in all new text. No AI-involvement mentions.
- Validation: `cd pi && pnpm typecheck && pnpm biome:check && pnpm test`.
- Reference implementations to read before writing code (canonical patterns,
  do not invent parallel mechanisms):
  - `pi/extensions/damage-control.ts`: `pi.on("tool_call")` interception,
    block/ask mechanics, notify patterns.
  - `pi/extensions/loop.ts`: long-running job control, iteration counting.
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

- Deterministic detectors only in v1. No LLM judge, no task classifier, no
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
- v1 sensors cover only the observed failure classes: budget burn, repeated
  same-type subagent/review spawns, self-churn (start-over), and edit
  fan-out. A verification-inflation sensor (re-running validation after it
  passed, then continuing to edit) is explicitly deferred to v2 under the
  ratchet principle: add it when observed.
- Enabled by default, generous thresholds, single `enabled: false` opt-out.

## Design

### Epoch model

An epoch starts at each user message and ends at the next one. The tracker
accumulates per-epoch state: start time, tool-call count, per-tool counts,
subagent spawns (agent type + normalized prompt hash), files edited (path ->
edit count), lines added/removed per file (from edit tool args or git diff
sampling), and the set of files touched in the first edit burst (first N
edits, N configurable, default 5).

### Sensors (v1)

1. Budget burn: soft trip at `softToolCalls` (default 25) or `softMinutes`
   (default 10) since epoch start; hard trip at `hardToolCalls` (default 60)
   or `hardMinutes` (default 30). Wall-clock spent waiting on a single
   long-running command counts toward minutes but a repeated identical
   poll/wait command does not increment the tool-call count.
2. Repeat spawn: second spawn of the same subagent type within one epoch
   with a similar prompt (normalized hash) trips hard. First spawn of each
   type is free. `maxSameAgentSpawns` default 1.
3. Self-churn: an edit that deletes or rewrites lines added earlier in the
   same epoch, or the same file edited more than `fileEditRepeat` (default
   4) times, trips soft; a second self-churn trip in the same epoch trips
   hard. This is the deterministic signature of starting over.
4. Fan-out: touched-file count exceeding `fanOutFactor` (default 4) times
   the first-burst set size, with an absolute floor of `fanOutMinFiles`
   (default 8) before the sensor can trip, trips soft.

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
  "fileEditRepeat": 4,
  "fanOutFactor": 4,
  "fanOutMinFiles": 8,
  "firstBurstEdits": 5
}
```

Missing key or missing fields fall back to these defaults in code. Follow
the existing settings access pattern in `pi/lib/settings-loader.ts`.

## Tasks

### Phase 1: pure tracker library plus tests

1. `pi/lib/session-budget.ts`: pure, side-effect-free tracker. Input: a
   stream of typed events (epoch_start, tool_call {name, args, timestamp},
   edit {path, added, removed}, spawn {agentType, promptHash}). Output:
   zero or more findings ({sensor, level: soft|hard, measured, threshold,
   epochId}). All thresholds injected via a config object. No imports from
   extension runtime, no I/O, no Date.now (timestamps come in on events) -
   this makes every sensor unit-testable with synthetic streams.
2. `pi/tests/session-budget.test.ts` (vitest, matching existing test
   conventions): per sensor, at least one triggering stream and one
   near-miss stream. Required false-positive cases that must NOT trip:
   repeated identical wait/poll commands on a long-running process (repeat
   exemption); a large task where the first burst itself is large (fan-out
   floor); a second subagent spawn of a different type; soft notice already
   sent - same sensor does not fire twice in one epoch.
3. Acceptance: `pnpm test` passes; the tracker module imports nothing from
   `pi/extensions/`.

### Phase 2: extension wiring

1. `pi/extensions/session-budget.ts`: subscribe to session and tool-call
   events (per the discovery step), feed the tracker, and act on findings:
   soft -> inject notice; hard -> ask-user gate on the pending tool call.
   Wrap every handler so an internal error logs and disables the watchdog
   for the session rather than crashing or blocking work.
2. Settings load per the Configuration section; `enabled: false` results in
   no subscriptions at all.
3. Telemetry: emit events through `pi/lib/workflow-telemetry.ts` using its
   existing episode/event shape.
4. Acceptance: `pnpm typecheck`, `pnpm biome:check`, `pnpm test` pass. A
   manual smoke script or test simulating a burst of tool_call events
   through the extension path shows: one soft notice at threshold, ask-user
   gate at hard threshold, telemetry records written.

### Phase 3: documentation

1. `pi/docs/session-budget.md`: what it watches, the sensor list with
   defaults, how to tune or disable, how to read the telemetry, and the two
   escalation behaviors as the user experiences them. Include the prior-art
   links from this plan.
2. Do not add rules about the watchdog to `pi/AGENTS.md` or any skill: the
   injected notices are self-explanatory to the model, and the whole point
   is that this control lives in the harness, not in prompt guidance.

## Out of scope (v1)

- Scope-contract schema and slash-command factory gates (separate spec).
- LLM judge / checkpoint reviewer tier.
- Task-size classifier for adaptive thresholds.
- Verification-inflation sensor (deferred until observed post-v1).
- Auto-abort or any termination without a user decision.

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
