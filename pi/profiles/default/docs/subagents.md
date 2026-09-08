# Subagents

`subagent` launches a bounded specialist assignment. Children are visible inside Herdr by default and headless elsewhere; `surface: "headless"` is an explicit override. Visible launch never falls back to headless.

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
- `subagent_control inspect` returns records and bounded results. Text results are capped at 24,000 characters. Records distinguish assignment status/outcome, turn count, process state, and visible pane state.
- `message` continues a settled retained conversation. `answer` supplies a factual answer to a pending parent question. It cannot approve a user-only request.
- `escalate` hands a visible child to the user, or shows a pending headless user-only prompt through the originating parent's actual UI.
- `finish` closes a settled retained conversation without changing its completed outcome. `cancel` explicitly stops ordinary work and its owned process tree.

`subagent_parent`, when explicitly permitted, asks factual questions or reports genuinely partial/blocked work. Successful work should use a normal final reply, not a partial report. Blank output and successful process exit do not constitute completion. Failed work is not, by itself, a reason to retain a pane.

`/subagents` lists the current chat's descendants; `/subagents cancel <id>` is direct user cancellation, including a child under user intervention. Model-driven parent control is suspended during direct user help. `/subagent-return <id>` in the parent, or `/subagent-return` in the child, explicitly hands control back. Restricted children also provide `/reload` and `/exit`.

## Visibility and lifetime

Run the existing Herdr setup from the lasting checkout as described in [Herdr setup](herdr.md). The runtime verifies that `local.pi` uses that profile's repository bootstrap before opening a pane. Do not link a disposable worktree into production.

The bootstrap hosts native Pi through exact argv and inherited terminal handles, without a shell wrapper. A per-launch host owns the actual child process handle. Authenticated process-local loopback messages carry questions, delegation, replies, and control; Herdr state and terminal text are not completion evidence. Results are captured and owned processes settled before immediate pane closure. Cleanup does not wait for zoom restoration.

Parent `/reload` and same-process chat changes preserve children. Background results wait for their originating chat, with journal-event acknowledgement preventing repeat delivery. Results are not delivered into whichever chat happens to be active. There is no durable registry or parent recreation after process exit.

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

`PI_SUBAGENT_LIVE=1 pnpm test subagent-live.test.ts` enables bounded headless model acceptance. `PI_SUBAGENT_HERDR_LIVE=1 pnpm test subagent-herdr-live.test.ts` creates an isolated Herdr server/config/plugin registry and disposable Git repository, tests both surfaces, visible Team Lead/council conversations, reload, intervention, parent loss, and exact cleanup, then removes its resources. These tests require installed Herdr and working profile model credentials. They do not relink the production plugin or prove physical keyboard experience, notifications, or model reasoning quality.
