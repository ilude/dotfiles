# Current State: Pi routing boundaries

## Scope

This document captures the actual current routing and command-execution boundaries in the Pi setup under `~/.dotfiles/pi/`.

Relevant source files:
- `pi/extensions/prompt-router.ts`
- `pi/extensions/workflow-commands.ts`
- `pi/extensions/agent-team.ts`
- `pi/extensions/agent-chain.ts`
- `pi/extensions/subagent/index.ts`

## Top-level input flow

### 1. Non-command prompts

`pi/extensions/prompt-router.ts` owns the current freeform prompt classification path.

Key behavior:
- `pi.on("input", ...)` receives all typed input
- it trims the input and checks:
  - empty input
  - slash command prefix (`text.startsWith("/")`)
  - router enabled state
- only non-command prompts proceed to `classifyAndRoute(...)`

Relevant code facts:
- `prompt-router.ts` line: `if (!text || text.startsWith("/") || !state.enabled) { return { action: "continue" }; }`
- `classifyAndRoute(...)` executes `python ~/.dotfiles/pi/prompt-routing/classify.py`
- classifier result maps to one of three OpenAI Codex models:
  - low → `openai-codex/gpt-5.4-mini`
  - mid → `openai-codex/gpt-5.3-codex`
  - high → `openai-codex/gpt-5.4`
- model switching is performed via `await pi.setModel(model)`

### 2. Slash commands

Slash commands are **not classified** by `prompt-router.ts`.

Current behavior:
- the input hook explicitly bypasses classification for `text.startsWith("/")`
- control returns to Pi's command execution path
- command-specific behavior is then handled by extensions that registered commands

This means commands are already **routed by command identity**, but that routing policy is implicit and fragmented rather than centralized.

## Command execution layer

### `workflow-commands.ts`

`pi/extensions/workflow-commands.ts` is the current shared command registry for user-facing workflow commands.

Registered commands:
- `/commit`
- `/plan-it`
- `/review-it`
- `/do-it`
- `/research`
- `/gitlab-ticket`
- `/exit`

#### `/commit`

`/commit` is implemented directly in TypeScript.

It currently performs:
- git status inspection
- merge-conflict detection
- secret scanning
- staged-vs-all-changes selection
- commit message proposal and confirmation
- commit execution
- optional push

Important boundary:
- `/commit` does **not** currently consult a shared routing policy helper
- `/commit` does **not** use the prompt classifier
- `/commit` does **not** force a command-specific model through a central policy layer

#### `/plan-it`, `/review-it`, `/do-it`, `/research`, `/gitlab-ticket`

These commands are thin wrappers around skill/prompt-template dispatch.

Current behavior pattern:
- load a local skill markdown file from `pi/skills/workflow/`
- call `pi.sendUserMessage(...)` with the rendered template

Examples:
- `/review-it` loads `pi/skills/workflow/review-it.md`
- `/do-it` loads `pi/skills/workflow/do-it.md`
- `/research` loads `pi/skills/workflow/research.md`

Important boundary:
- command execution is explicit
- model selection for these commands is **not** governed by any shared command-routing policy in `workflow-commands.ts`
- these commands rely on downstream prompt behavior rather than command-aware routing decisions made up front

## Subagent and multi-agent surfaces

### `agent-team.ts`

`pi/extensions/agent-team.ts` registers a `/team` command and dispatches work by constructing a message and calling `pi.sendUserMessage(...)`.

Current implication:
- team dispatch exists as a command-driven execution surface
- there is no shared command/subagent model selection policy visible at this layer

### `agent-chain.ts`

`pi/extensions/agent-chain.ts` provides tools and chained execution helpers for planner/builder/reviewer style flows.

Current implication:
- chain execution exists
- expertise/logging/tooling are available
- model-selection policy is not centralized across command entry, chain execution, and subagent execution

### `subagent/index.ts`

`pi/extensions/subagent/index.ts` provides a subagent tool surface.

Current implication:
- subagent execution is available as a capability
- there is currently no explicit shared helper that answers:
  - what model should the parent command use?
  - what model should a spawned subagent use?
  - when may classifier signals influence subagent model choice?

## Current architecture boundary summary

### What the router owns today

`prompt-router.ts` currently owns:
- freeform prompt classification
- three-tier model mapping
- session-level never-downgrade behavior
- router on/off and status commands

### What the router does **not** own today

`prompt-router.ts` does **not** own:
- slash-command-specific model policy
- command-to-model mapping
- subagent model policy
- parent-command vs child-agent model relationship

### What the command layer owns today

`workflow-commands.ts` currently owns:
- command registration
- direct execution for `/commit`
- skill dispatch for `/plan-it`, `/review-it`, `/do-it`, `/research`, `/gitlab-ticket`

### What is missing

The missing architectural layer is a **shared routing policy** that can be used by:
- the freeform prompt router
- slash-command handlers
- subagent-spawning workflows

That shared layer does not exist yet.

## Mental model captured from current behavior

The current code already supports this rule:

> Commands are routed, but not classified.

More precisely:
- non-command prompts → classifier-based routing
- slash commands → deterministic command dispatch

What is missing is a consistent policy for model selection after command dispatch, especially for command workflows that may later spawn subagents.

## Gaps that future work must address

1. There is no shared helper for `resolveCommandModel(...)`
2. There is no shared helper for `resolveSubagentModel(...)`
3. There is no explicit policy for whether a parent command model should constrain child/subagent models
4. There is no policy table for `/research`, `/review-it`, or `/do-it`
5. There is no diagnostic artifact showing how command routing and subagent routing relate to the existing classifier
