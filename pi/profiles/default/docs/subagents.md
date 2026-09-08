# Subagents

`subagent` launches a bounded specialist assignment. Omit `surface` for normal delegation: children are visible inside Herdr by default and headless elsewhere; coordinator children inherit their coordinator's surface. Inside Herdr, select `surface: "headless"` only when the user requests it, not merely because work is parallel, unattended, or in a worktree. This is tool guidance, not a runtime authorization check. Visible launch never falls back to headless.

## Agreed UX changes (implemented with bounded validation)

This section records the implemented operator decisions for the subagent UX update. The focused unit/component checks and the opt-in isolated Herdr geometry test pass with the default profile. `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts` uses a named scratch Herdr session, isolated config, disposable workspaces, inert plugin processes, and exact cleanup; it does not touch the shared server or production plugin links. The test verifies the production layout adapter's 1/4/5/8/9/17 slot topology, server-side rectangles for the focused main tab, pane titles, stable caller identity, and unchanged unrelated focus. The adapter test does not prove physical keyboard or attached-client focus behavior.

A bundled-Pi visible launch/follow-up/completion case is present behind the additional `PI_SUBAGENT_UX_LIVE_REAL=1` opt-in. With the worktree's local ignored auth/model store populated, `PI_SUBAGENT_UX_LIVE=1 PI_SUBAGENT_UX_LIVE_REAL=1 pnpm test subagent-ux-live.test.ts -t 'bundled Pi'` passed (1 test, 1 geometry test skipped). It checks the human title, metadata, retained identity, follow-up result, completion, exact pane cleanup, and preservation of unrelated focus. `SubagentLayout` obtains focus from the focused workspace, tab, and pane list records, not caller-context `pane current`; the regression test covers that distinction.

- Give each child a familiar human name from a predefined pool, stable across follow-ups and not reused within the orchestrator session. Keep UUIDs internally. Use the name consistently in tool-call presentation, pane titles, and controls; show the role and assignment separately.
- Improve the subagent tool-call transcript, not the `/subagents` inspector: resolved launch configuration, assignment preview, readable lifecycle/result/error information, timing, and expanded details. Background launch acknowledgement is not child completion; detached waits must say the child continues.
- Split above the existing orchestrator. Children fill left to right, four per row, up to two rows. More than eight children moves to a new tab. Preserve focus and the orchestrator's bottom placement. This replaces the archived fifth-child migration threshold.
- Pane closure was already decided in the newer `.specs/archive/default-subagents-and-council/plan.md`, Required behavior / Temporary panes: capture results and settle owned processes, then close finished panes immediately, including failed work, without waiting for zoom restoration. Preserve explicitly retained conversations and direct user intervention under their existing lifecycle. Do not ask the operator to decide closure again.

**Source correction:** The older cancelled `.specs/archive/herdr-visible-subagents/plan.md` prescribed failed-pane retention and zoom-deferred cleanup. Those rules were superseded by the completed default-subagents plan. An earlier version of this section incorrectly promoted the older rules; that was an assistant retrieval error, not a user-requested lifecycle change.

Implementation plan: `.specs/archive/subagent-transcript-and-pane-ux/plan.md` (repository-root-relative; move this reference to its archive at closeout).

## Definitions and authority

Editable profile roles live in `agents/*.md`. Trusted projects can override them through the nearest `.pi/agents/` directory. Invalid overrides disable the affected names rather than restoring a more powerful profile definition. Each filename must match its `name`.

```yaml
---
name: reader
description: Inspect local evidence
tools: [read, grep, find, ls, subagent_parent]
model: openai-codex/gpt-5.6-luna
effort: low
skills: []
delegates: []
---
Read the assigned evidence and report the relevant findings.
```

Required fields are `name`, `description`, and `tools`; the other fields above are optional. Tool lists accept YAML arrays or comma-separated text. `tools: []` means no model-callable tools, including no hidden parent helper. `delegates` is a separate permission list. Coordinators need explicit `subagent` and `subagent_control` tools as well as permission to commission the named leaves. Leaves cannot delegate; coordinators cannot nest. Counts are guidance, not runtime limits or queues.

Authority is frozen for the conversation, including retained turns, reload, and direct user help. Call arguments cannot widen tools or delegation. Native file tools are restricted to the assigned workspace, with read-only exceptions for selected skill files. Child workspaces cannot widen a coordinator's workspace. The restricted `tool_search` only describes already-permitted tools; it cannot activate more.

Damage Control remains loaded. Direct `!` shell input is disabled in children so it cannot bypass tool safety; shell-enabled roles use the guarded shell tool instead. These tool ceilings and path checks are **not an OS sandbox**. A shell-enabled role can mutate files. Children do not load Onclave or general Herdr process/layout tools.

## Tools and conversations

Launch arguments include `agent`, `instructions`, optional `cwd`, `model`, `effort`, `skills`, `background`, `surface`, and `retain`. Skills are profile skill names, not arbitrary paths. Explicit model/effort overrides take precedence over the definition. The requested model must be available to the restricted bundled runtime; there is no provider fallback.

- A normal nonblank final reply completes the assignment automatically. No manual completion command is needed.
- `retain: true` keeps the conversation and process available for follow-ups.
- `background: true` returns its ID without waiting. Cancelling a foreground tool wait detaches the wait, not the child.
- `subagent_control inspect` returns records and bounded results. Text results are capped at 24,000 characters. Records distinguish assignment status/outcome, turn count, process state, transport state, phase, tool name, and last activity time. Activity is UI-only and never creates a model message. `subagent_control wait` explicitly reattaches to a detached wait on the same child; detaching reports that the assignment continues and gives the inspect/wait controls.
- `message` continues a settled retained conversation. `answer` supplies a factual answer to a pending parent question. It cannot approve a user-only request.
- `escalate` hands a visible child to the user, or shows a pending headless user-only prompt through the originating parent's actual UI.
- `finish` closes a settled retained conversation without changing its completed outcome. `cancel` explicitly stops ordinary work and its owned process tree.

`subagent_parent`, when explicitly permitted, asks factual questions or reports genuinely partial/blocked work. Successful work should use a normal final reply, not a partial report. Blank output and successful process exit do not constitute completion. Failed work is not, by itself, a reason to retain a pane.

`/subagents` or `/subagents inspect [id]` lists the current chat's descendants. `/subagents wait <id>` waits on the same child with a **Stop waiting** control; closing it leaves the child running and preserves automatic delivery to the parent model. `/subagents cancel <id>` is direct user cancellation, including a child under user intervention. Model-driven parent control is suspended during direct user help. `/subagent-return <id>` in the parent, or `/subagent-return` in the child, explicitly hands control back. Restricted children also provide `/reload` and `/exit`.

## Progress and outcome delivery

A compact widget above the input shows the current origin's children: surface, phase/tool name, elapsed assignment time, last meaningful activity age, process/transport state, and detached waits. It refreshes at most once per second, including during silence. Within Pi's ten-line widget limit it shows up to three active rows and three recent settled rows, keeping shown errors with their records; inspect lists all records. These are display limits, not launch quotas.

Heartbeats establish contact, not productivity. No activity is reported as **none observed**, not invented progress or an automatic hang diagnosis. There is no inactivity cancellation, assignment timeout, automatic retry or progress-triggered model turn. Tool arguments and reasoning are not included in progress. Cleanup errors remain visible alongside results, even while the parent is busy.

Completion, failure and factual questions reach the parent model automatically. An attached foreground model wait receives its tool result; background/detached outcomes use acknowledged follow-up messages when the originating parent is idle. Busy/inactive origins retain outcomes without transcript polling or delivery into another chat. Coordinator leaves use the existing authenticated heartbeat/application channel for outcome delivery and journal acknowledgement. A coordinator remains alive while commissioned children or their unread outcomes remain; normal final settlement follows its subsequent response. If it fails or is cancelled first, outstanding outcomes go to the originating orchestrator with an explicit notice. User-only approval prompts always go to the originating user's UI, not a coordinator's factual-answer tool.

Native RPC `agent_end` carries an aggregate message array and can exceed 1 MiB after an otherwise successful assignment. RPC frames now have a separate 16 MiB bound and a growing, bounded frame buffer; the authenticated application channel stays at 256 KiB and final text stays at 24,000 characters. Oversized/incomplete frames report event type and byte counts without echoing payloads, then settle owned cleanup. Initial provider/prompt rejection is observed explicitly. This is bounded support for large native events, not unlimited output.

## Visibility and lifetime

Run the existing Herdr setup from the lasting checkout as described in [Herdr setup](herdr.md). The runtime verifies that `local.pi` uses that profile's repository bootstrap before opening a pane. Do not link a disposable worktree into production. Background creation must preserve the user's currently focused pane, tab and workspace, not switch back to the caller. It uses `--no-focus`; no restore-to-caller command is issued.

The bootstrap hosts native Pi through exact argv and inherited terminal handles, without a shell wrapper. A per-launch host owns the actual child process handle. Authenticated process-local loopback messages carry questions, delegation, replies, and control; Herdr state and terminal text are not completion evidence. Results are captured and owned processes settled before immediate pane closure. Cleanup does not wait for zoom restoration.

If `/reload` encounters the earlier process-global runtime, it preserves that owner and reports the upgrade boundary rather than replacing live children. Use `/clear` to stop those children, reset the process-global runtime, and start a clean chat, or restart Pi; manual finish/cancel steps are not required. Directly helped visible children are also stopped by `/clear`, while a normal Pi exit leaves them open as parent-unavailable.

Once this runtime is loaded, parent `/reload` and same-process chat changes other than `/clear` preserve children. Background results wait for their originating chat, with journal-event acknowledgement preventing repeat delivery. Results are not delivered into whichever chat happens to be active. There is no durable registry or parent recreation after process exit.

Closing the parent stops ordinary children. Visible children under acknowledged direct user intervention stay open and show **Parent unavailable**; the user can continue directly or exit. Headless children do not remain waiting after their parent disappears. User-help state has a temporary per-launch marker for the host's parent-loss handling; it is removed when the child exits and is not restart recovery.

## Roles and councils

The initial roles are `explorer`, `developer`, `reviewer`, `validator`, `researcher`, `advisor`, `teamlead`, and `council`. Only developer has native edit/write tools; developer and validator have shell tools. Validator's no-edit/no-autofix instruction is not a shell sandbox.

Use small, clear jobs. Guidance is up to four Team Leads, eight leaves per lead, or twelve direct workers where coordination adds no value. Councils require an explicit user request. Their default guidance is three independent openings, one focused rebuttal with retained member contexts, and synthesis covering strongest arguments, changed positions, disagreements, and evidence gaps. They do not force agreement or implementation.

## Checks

From the default profile:

```sh
pnpm test subagent herdr-launch.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts
pnpm run typecheck
pnpm run check:runtime
```

`PI_HERDR_FOCUS_LIVE=1 pnpm test herdr-background-focus.test.ts` checks plugin-split preflight, creation and cleanup while another tab or workspace is focused, using an isolated server and inert process. This verifies server-side focus state, not an attached client's physical focus behavior.

`PI_SUBAGENT_LIVE=1 pnpm test subagent-live.test.ts` enables bounded headless model acceptance. `PI_SUBAGENT_HERDR_LIVE=1 pnpm test subagent-herdr-live.test.ts` creates an isolated Herdr server/config/plugin registry and disposable Git repository, tests both surfaces, visible Team Lead/council conversations, reload, intervention, parent loss, and exact cleanup, then removes its resources. These tests require installed Herdr and working profile model credentials. They do not relink the production plugin or prove physical keyboard experience, notifications, or model reasoning quality.

`PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts` runs the bounded inert geometry acceptance. Add `PI_SUBAGENT_UX_LIVE_REAL=1` to run the bundled-Pi model case; its passing result is recorded above.
