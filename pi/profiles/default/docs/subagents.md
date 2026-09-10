# Subagents

`subagent` launches a bounded specialist assignment. Omit `surface` for normal delegation: children are visible inside Herdr by default and headless elsewhere; coordinator children inherit their coordinator's surface. Inside Herdr, select `surface: "headless"` only when the user requests it, not merely because work is parallel, unattended, or in a worktree. This is tool guidance, not a runtime authorization check. Visible launch never falls back to headless.

## Agreed UX changes (implemented with bounded validation)

**Layout correction, 2026-09-09:** Children now occupy a full-width row above the orchestrator; the orchestrator stays at the bottom with approximately two-thirds of the height. Four children remain supported per tab, with overflow beginning at child five. Focused tests and isolated Herdr 0.9.0 geometry/focus checks cover this correction; attached-client acceptance of the corrected order remains unverified.

**Earlier acceptance:** The previous downward layout, four-per-tab overflow, reload lifecycle, model-backed execution, process settlement, cleanup, and attached-client presentation passed bounded acceptance on Herdr 0.9.0. The operator subsequently corrected the required vertical ordering.

The focused automated suite, isolated Herdr geometry test, model-backed retained follow-up, and attached-client three-child runs passed. The operator observed the final merged runtime after `/reload` and reported that everything appeared to work as expected. The baseline unrelated TypeScript declaration error in `tests/commit-whitespace.test.ts` remains outside this work; runtime checks passed 335 rules and 8 schemas.

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
- `message` uses one exchange path. It defaults to `delivery: "queued"` and `interaction: "notify"`; queued messages use native steering while a child is busy and start a retained conversation when idle. Set `delivery: "immediate"` only to intentionally redirect the current turn. `answer` is the compatibility adapter for a `question-answer` request and accepts `replyTo` when a request reference is needed. Active assignments, including `retained: false` children waiting for a parent reply, can receive these exchanges. `notify` does not request acknowledgement; `request` identifies a response-bearing exchange.
- A parent question yields successfully and leaves the child idle with `Waiting for parent reply`; it does not run a polling tool or imply completion. The runtime creates the request ID and correlates a matching answer. Unknown or stale replies are native control errors. Delivery is origin-scoped and uses native queued steering for busy parents/coordinators; idle delivery starts a new turn. Automatic outcomes are acknowledged once per outcome, so a result already received by a model is not replayed later.
- `escalate` hands a visible child to the user, or shows a pending headless user-only prompt through the originating parent's actual UI.
- `finish` closes a settled retained conversation without changing its completed outcome. `cancel` explicitly stops ordinary work and its owned process tree.

`subagent_parent`, when explicitly permitted, asks factual questions or reports genuinely partial/blocked work. Successful work should use a normal final reply, not a partial report. Blank output and successful process exit do not constitute completion. Failed work is not, by itself, a reason to retain a pane.

`/subagents` or `/subagents inspect [id]` lists the current chat's descendants. `/subagents wait <id>` waits on the same child with a **Stop waiting** control; closing it leaves the child running and preserves automatic delivery to the parent model. `/subagents cancel <id>` is direct user cancellation, including a child under user intervention. Model-driven parent control is suspended during direct user help. `/subagent-return <id>` in the parent, or `/subagent-return` in the child, explicitly hands control back. Restricted children also provide `/reload` and `/exit`.

## Progress and outcome delivery

Subagents do not install a persistent status widget. Launch and wait progress stays in the active tool row; completions, failures, and questions appear in the transcript. Tool rows keep identity and status concise, with the selected model/effort, a readable local start time, and elapsed or completed duration. The prompt has a compact preview; native tool-output expansion (normally `Ctrl+O`) reveals its full text and execution details. Repeated role/activity labels and ordinary attached-wait bookkeeping are omitted from the compact view. Live last-activity information and meaningful questions, errors, and results remain visible. `/subagents inspect [name-or-id]` provides explicit status and result details when requested.

Heartbeats establish contact, not productivity. There is no inactivity cancellation, assignment timeout, automatic retry, or progress-triggered model turn. Tool arguments and reasoning are not included in progress. Cleanup errors remain available in transcript outcomes and explicit inspection.

Completion, failure and factual questions reach the parent model automatically. An attached foreground model wait receives its tool result; background/detached outcomes use native queued steering while the originating parent is busy and a follow-up when it is idle. Busy/inactive origins retain outcomes without transcript polling or delivery into another chat. Coordinator leaves use the existing authenticated heartbeat/application channel for outcome delivery and journal acknowledgement. A coordinator remains alive while commissioned children or their unread outcomes remain; normal final settlement follows its subsequent response. If it fails or is cancelled first, outstanding outcomes go to the originating orchestrator with an explicit notice. User-only approval prompts always go to the originating user's UI, not a coordinator's factual-answer tool. Outcome delivery is not an acknowledgement request and does not generate automatic receipt chatter.

Native RPC `agent_end` carries an aggregate message array and can exceed 1 MiB after an otherwise successful assignment. RPC frames now have a separate 16 MiB bound and a growing, bounded frame buffer; the authenticated application channel stays at 256 KiB and final text stays at 24,000 characters. Oversized/incomplete frames report event type and byte counts without echoing payloads, then settle owned cleanup. Initial provider/prompt rejection is observed explicitly. This is bounded support for large native events, not unlimited output.

## Visibility and lifetime

Run the existing Herdr setup from the lasting checkout as described in [Herdr setup](herdr.md). The runtime verifies that `local.pi` uses that profile's repository bootstrap before opening a pane. Do not link a disposable worktree into production. Background creation should preserve the user's currently focused pane, tab and workspace, not assume the caller is focused. Plugin creation uses `--no-focus`. Herdr 0.9.0 lacks upward plugin splits and a non-focusing swap: initial placement swaps the new child above the caller, then restores the pane observed immediately before the swap if focus still points to the caller. A subsequent observed user focus change is left alone. Restoration uses the public exact-pane focus API and is not atomic; a brief focus change or a concurrent switch in the final check/restore window remains possible. No layout replay or caller-process replacement is used.

The bootstrap hosts native Pi through exact argv and inherited terminal handles, without a shell wrapper. A per-launch host owns the actual child process handle. Authenticated process-local loopback messages carry questions, delegation, replies, and control; Herdr state and terminal text are not completion evidence. Results are captured and owned processes settled before immediate pane closure. Cleanup does not wait for zoom restoration.

Operators do not run `/reload` while subagents are active. The existing reload path is supported only after child conversations and owned resources have settled; active-child reload teardown, migration, and recovery are unsupported and outside this cleanup correction. Source edits do not upgrade an already-running operator session. `/clear` remains the clean-session reset, while ordinary retention and intervention semantics apply outside explicit reload.

Outside explicit reload, same-process chat changes preserve children under the existing origin-scoped lifecycle. A settled-only `/reload` ends the settled subagent runtime before replacement; it does not migrate active children. Background results remain bound to their originating chat: they steer that conversation while it is busy, wait in the runtime while it is inactive, and use journal-event acknowledgement to prevent repeat delivery. Results are not delivered into whichever chat happens to be active. There is no durable registry or parent recreation after process exit.

Closing the parent attempts ordinary child cleanup and reports unresolved process or pane resources before exit. Visible children under acknowledged direct user intervention stay open and show **Parent unavailable**; the user can continue directly or exit. Headless children do not remain waiting after their parent disappears. User-help state has a temporary per-launch marker for the host's parent-loss handling; it is removed when the child exits and is not restart recovery. Permission-dialog Allow/Deny input resolves that prompt only; it does not automatically take over the child. Direct conversation input and explicit escalation remain the intervention controls, with `/subagent-return` for handback. Workspace permissions and selected-skill read exceptions are unchanged. Terminating native tool errors preserve the tool name and bounded actual reason on both child surfaces; a later valid final reply clears recoverable tool errors. Successful question yields and intentional redirections are not failures.

Assignment outcome and resource cleanup are separate. A completed or cancelled assignment may retain a cleanup error when process or pane closure was not proven. Independent children are still attempted, and the owner remains available for an explicit subsequent cleanup attempt. `/clear` does not replace the owner or enter the clean session while ordinary cleanup remains unresolved. Successful cleanup is idempotent, does not repeat result delivery, and keeps user-owned visible children excluded by the existing quit intervention contract.

## Roles, guidance, and councils

The roles are `explorer`, `developer`, `reviewer`, `validator`, `researcher`, `advisor`, `strategist`, `teamlead`, and `council`. The orchestrator is the primary model interacting with the user; role names, running subagents, and selected model/effort values are separate concepts. Only developer has native edit/write tools; developer and validator have shell tools. Validator's no-edit/no-autofix instruction is not a shell sandbox.

Delegate only for bounded implementation, parallel investigation, specialist research, or requested independent review; otherwise work directly. Before delegating, normally consult Strategist and reuse its advice. Strategist defaults to Sol low; use Astra low when its decision spans several systems, has competing interpretations, or follows repeated failed assignments. Never use Luna low or medium for Strategist. This is recommendation-only, not an approval gate. Strategist advises on bounded assignments, prerequisite order, roles, and model/effort choices using observable inputs and failure evidence. It cannot dispatch or edit. Shared guidance also permits one bounded stronger-family retry after an attempted but unsolved assignment with working inputs and tools; crashes, timeouts, missing prerequisites, environment failures, and unresolved user decisions do not establish that condition.

The orchestrator sees a generated catalog of all resolved roles. Coordinators see only their frozen permitted delegates, and Strategist sees only roles its caller may dispatch. Catalog visibility does not add dispatch authority. Trusted project overrides and disabled definitions are reflected when the catalog is composed. Child prompts and catalogs are frozen at launch, so definition changes require a new child; profile source changes require the normal settled-only `/reload` boundary.

Use small, clear jobs, normally one plan task section per implementation worker, with dependent work launched after prerequisite results are incorporated. Independent reads and disjoint writes can remain parallel. Guidance is up to four Team Leads, eight leaves per lead, or twelve direct workers where coordination adds no value. Councils require an explicit user request. Their default guidance is three independent openings, one focused rebuttal with retained member contexts, and synthesis covering strongest arguments, changed positions, disagreements, and evidence gaps. They do not force agreement or implementation.

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
