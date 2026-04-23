# Target Architecture: Shared routing policy for prompts, commands, and subagents

## Goal

Introduce a shared routing policy layer that preserves the current mental model:

- **all user input is routed**
- **only non-command prompts are classified**
- **slash commands are routed deterministically by command identity**
- **subagent routing may use classifier signals as one input, but never as the only input**

## Design principles

1. **Keep routing and execution separate**
   - routing decides *which model/policy to use*
   - command handlers decide *how the workflow executes*

2. **Do not merge workflow execution into `prompt-router.ts`**
   - `prompt-router.ts` should not become a god object
   - `workflow-commands.ts` and related command extensions remain the execution layer

3. **Commands are routed, not classified**
   - slash commands must bypass freeform complexity classification
   - command-aware model selection is deterministic

4. **Classifier signals are optional inputs for subagent routing**
   - subagent model selection may consider classifier output
   - but must also consider command type, agent role, and explicit policy bounds

## Proposed shared routing layer

Recommended new shared helper:
- `pi/lib/model-routing.ts`

This module should become the single source of truth for model-selection policy across:
- freeform prompts
- slash commands
- subagents

## Proposed API surface

### `resolvePromptModel(input, ctx)`

Purpose:
- handle non-command freeform input
- use the existing complexity classifier
- return the selected top-level model and routing metadata

Inputs:
- `text: string`
- `ctx: { modelRegistry, sessionState, routerState }`

Outputs:
- selected provider/model id
- tier (`low` / `mid` / `high`)
- metadata such as whether never-downgrade was applied

Notes:
- this is the evolution of the current `classifyAndRoute(...)` behavior in `prompt-router.ts`
- `prompt-router.ts` may remain the extension entrypoint, but should defer policy decisions to this helper

### `resolveCommandModel(commandName, ctx)`

Purpose:
- deterministically choose the parent/workflow model for slash commands
- skip freeform classification entirely

Inputs:
- `commandName: string`
- `ctx: { modelRegistry, sessionState, settings }`

Outputs:
- selected provider/model id
- routing reason (for example `command-policy`, `fallback`, `default`)
- optional policy metadata such as fallback chain used

Examples of command-specific outcomes:
- `/commit` → mini model for planning work
- `/research` → stronger parent model
- `/review-it` → stronger analytical model
- `/do-it` → model chosen by command policy, not prompt classification

### `resolveSubagentModel(commandName, role, taskText, signals, ctx)`

Purpose:
- choose models for spawned agents or delegated roles
- combine deterministic policy with optional classifier input

Inputs:
- `commandName: string`
- `role: string` (examples: planner, reviewer, synthesizer, gatherer)
- `taskText: string`
- `signals: { classifierTier?: string; parentModel?: string; userOverride?: string }`
- `ctx: { modelRegistry, sessionState, settings }`

Outputs:
- selected provider/model id
- routing reason(s)
- constraints applied (for example `bounded-by-command-policy`)

Required behavior:
- role-aware routing
- classifier-informed when useful
- explicit fallback behavior
- no hidden coupling to the freeform classifier alone

## Policy layering

### Layer 1: Input kind routing

Decision tree:
- if input starts with `/` → command route
- otherwise → freeform prompt route

This layer is deterministic.

### Layer 2: Command policy routing

Once a command is identified:
- choose the parent command/workflow model by command name
- do not classify the slash command text as if it were freeform prose

This keeps command intent explicit.

### Layer 3: Subagent policy routing

If the chosen command later spawns subagents:
- route each subagent using role + command policy + optional classifier signals
- do not treat subagent routing as a raw reuse of the freeform prompt classifier

## Extension ownership after the refactor

### `prompt-router.ts`

Should own:
- extension entrypoint for freeform input
- router UI/status behavior
- calling shared routing helper for non-command prompts
- possibly lightweight command-routing coordination if needed for a unified mental model

Should not own:
- command execution logic
- workflow implementation for `/commit`, `/research`, `/review-it`, `/do-it`

### `workflow-commands.ts`

Should own:
- command registration
- command/workflow execution
- asking the shared routing helper for command-level model decisions
- asking the shared routing helper for subagent model decisions when needed

Should not own:
- ad hoc hardcoded model-routing rules duplicated across commands

## Required policy outputs

The shared routing layer must be able to explain **why** a model was chosen.

Suggested metadata fields:
- `kind: "prompt" | "command" | "subagent"`
- `reason: string[]`
- `fallbackUsed: boolean`
- `classifierTier?: "low" | "mid" | "high"`
- `commandName?: string`
- `role?: string`

This is important both for debugging and for later validating whether routing behavior matches the intended policy.

## Minimum viable adoption path

The first implementation should **not** try to generalize everything at once.

Recommended first adopter:
- `/commit`

Why:
- it already has a clear command identity
- it needs command-specific model policy
- it is a lower-risk proving ground for shared command-aware routing

After `/commit`, the same helper shape can be extended to:
- `/research`
- `/review-it`
- `/do-it`

## Non-goals for the first iteration

1. Rewriting the classifier itself
2. Moving all workflow logic into the router extension
3. Solving all agent-team/chain/subagent orchestration in one pass
4. Forcing every command to use classifier output

## Architecture invariants

These must remain true after implementation:

1. Slash commands are routed deterministically by command identity
2. Non-command prompts are the only inputs that use freeform complexity classification at entry
3. Subagent routing may use classifier signals, but only as optional inputs
4. Routing policy is centralized; execution logic is not
5. A command handler can request routing decisions without duplicating policy logic locally

## Open Questions

1. Should command routing live entirely in a new helper, or should `prompt-router.ts` expose a thin command-routing facade over that helper?
2. Should subagent routing allow per-command hard caps (for example: a command may only use mini/mid models for certain roles)?
3. How should user-selected model overrides interact with deterministic command policy?
4. What diagnostics should be surfaced to the user versus kept internal for debugging?
5. Which commands beyond `/commit`, `/research`, `/review-it`, and `/do-it` should opt into shared routing in later iterations?
6. How should agent-team / chain-specific execution surfaces participate in the same routing policy without forcing a large refactor up front?
