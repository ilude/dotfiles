---
created: 2026-04-17
status: draft
completed:
---

# Plan: Pi command-aware subagent routing policy

## Context & Motivation

While redesigning Pi's `/commit` command, a broader routing question emerged: commands are still part of the prompt-routing system even when they skip freeform complexity classification. The current Pi setup treats `pi/extensions/prompt-router.ts` as a classifier for non-command input and `pi/extensions/workflow-commands.ts` as standalone execution logic for slash commands. That split works for simple command execution, but it leaves no shared routing policy for commands that spawn subagents or multi-step workflows such as `/research`, `/review-it`, and `/do-it`.

The user wants a clean mental model: **all user input is routed**, but only non-command prompts are classified. Commands should be deterministically routed to command handlers, and command workflows that spawn subagents may later benefit from classifier signals to choose models for the agents they launch. This work is intentionally secondary to the `/commit` redesign, but it needs to be captured now so the later implementation preserves the agreed architecture.

## Constraints

This is a future-facing architecture plan, not an immediate implementation task. It must preserve the user's preferred mental model: prompt routing is the top-level routing layer for all input, command handlers are the execution layer, and slash commands should not be classified like normal prose prompts. Any future classifier use for subagents must be additive and policy-driven rather than tightly coupling command execution to the current freeform classifier.

- Platform: Windows (Git Bash / MSYS2 environment)
- Shell: bash in repo operations; pwsh available for Windows-native tasks
- Slash commands are routed intents and should skip freeform complexity classification
- Subagent model selection may use classifier signals, but should not be driven by classifier output alone
- This plan should not block the current `/commit` work
- Primary output is documentation/design, not immediate code changes
- If any implementation spike is performed during review or design, the existing Pi test environment under `pi/tests` must already be installed before running `npx vitest run`
- Validation must prove decision quality via named artifacts, not just keyword presence in files

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep command execution and routing fully separate forever | Minimal changes; easy to reason about locally inside each command file | Model policy drifts across commands; no single source of truth for command/subagent model selection | Rejected: creates long-term inconsistency |
| Merge workflow command logic into `prompt-router.ts` | One file owns everything about routing and commands | Conflates routing policy with workflow execution; hard to maintain; router becomes a god object | Rejected: wrong separation of responsibilities |
| Add a shared routing policy layer used by both router and command handlers | Keeps router as entrypoint, preserves command handlers as execution layer, supports future subagent policy | Requires refactor and shared abstractions before broader adoption | **Selected** |
| Use the current complexity classifier directly for every subagent task | Potentially reuses existing classifier with little extra code | Ignores explicit command intent and agent role; classifier alone is too blunt for planner/reviewer/security roles | Rejected: classifier should be an input, not the only decision-maker |

## Objective

Define and later implement a shared model-routing policy for Pi commands and subagents so that:
- all user input is routed through a consistent policy layer,
- slash commands skip freeform classification,
- command handlers can request command-specific and subagent-specific model decisions,
- future workflows like `/research` and `/review-it` can use classifier-informed model selection for spawned agents without duplicating routing rules.

## Project Context

- **Language**: TypeScript extensions inside a Python/shell dotfiles repo
- **Test command**: `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` (only if an implementation spike occurs and the Node test environment is already installed)
- **Lint command**: none detected — tasks define targeted verification
- **Primary artifacts for this plan**:
  - `.specs/pi-subagent-routing-policy/current-state.md`
  - `.specs/pi-subagent-routing-policy/target-architecture.md`
  - `.specs/pi-subagent-routing-policy/subagent-policy-matrix.md`
  - `.specs/pi-subagent-routing-policy/rollout-plan.md`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Capture current-state routing boundaries and target architecture API | 2 + 2 spec docs | architecture | sonnet | engineering | — |
| V1 | Validate wave 1 | — | validation | sonnet | validation | T1 |
| T2 | Define per-command subagent routing policy matrix | 2-4 + 1 spec doc | architecture | sonnet | planning | V1 |
| T3 | Write rollout and migration plan for command handlers | 2-3 + 1 spec doc | feature | sonnet | engineering | T2 |
| V2 | Validate wave 2 | — | validation | sonnet | validation | T2, T3 |

## Execution Waves

### Wave 1

**T1: Capture current-state routing boundaries and target architecture API** [sonnet] — engineering
- Description: Document the existing routing boundaries across `prompt-router.ts` and `workflow-commands.ts`, then define the target shared routing API that preserves the rule that slash commands are routed but not classified.
- Files: `pi/extensions/prompt-router.ts`, `pi/extensions/workflow-commands.ts`, `.specs/pi-subagent-routing-policy/current-state.md`, `.specs/pi-subagent-routing-policy/target-architecture.md`
- Acceptance Criteria:
  1. [ ] `current-state.md` maps current input flow and command boundaries with concrete code references.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "text.startsWith\(\"/\"\)|registerCommand\(\"(commit|research|review-it|do-it)\"" pi/extensions`
     - Pass: Output supports a written current-state map that distinguishes classifier entry from command execution entry
     - Fail: Code references are missing, ambiguous, or do not support the documented flow
  2. [ ] `target-architecture.md` defines named routing APIs and explicitly states that classifier signals are optional inputs for subagent routing.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "resolvePromptModel|resolveCommandModel|resolveSubagentModel|optional classifier input" .specs/pi-subagent-routing-policy/target-architecture.md`
     - Pass: The target architecture names the API surface and documents command-vs-classifier boundaries clearly
     - Fail: Routing decisions remain ad hoc or classifier-only in the target architecture
  3. [ ] The target architecture includes an explicit open-questions section.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "^## Open Questions" .specs/pi-subagent-routing-policy/target-architecture.md`
     - Pass: Open questions are documented for any unresolved architecture decisions
     - Fail: Important unresolved issues remain implicit

### Wave 1 — Validation Gate

**V1: Validate wave 1** [sonnet] — validation
- Blocked by: T1
- Checks:
  1. Run acceptance criteria for T1
  2. Review `.specs/pi-subagent-routing-policy/current-state.md` and `.specs/pi-subagent-routing-policy/target-architecture.md` for consistency
  3. Confirm the target architecture preserves the mental model: commands are routed, only non-command prompts are classified
  4. `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` — only if code was changed during an implementation spike
- On failure: create a fix task, re-validate after fix

### Wave 2

**T2: Define per-command subagent routing policy matrix** [sonnet] — planning
- Blocked by: V1
- Description: Define parent-command model policy and subagent role policy for `/research`, `/review-it`, and `/do-it`, including where classifier signals may inform routing without classifying slash commands at entry.
- Files: `pi/extensions/workflow-commands.ts`, `pi/skills/workflow/`, `.specs/pi-subagent-routing-policy/subagent-policy-matrix.md`
- Acceptance Criteria:
  1. [ ] `subagent-policy-matrix.md` contains one table row set per command covering parent model policy, subagent roles, allowed classifier inputs, and fallback behavior.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "research|review-it|do-it|parent model|fallback|classifier" .specs/pi-subagent-routing-policy/subagent-policy-matrix.md`
     - Pass: All three commands are covered with explicit policy rows and no placeholder text
     - Fail: One or more commands or policy dimensions are missing
  2. [ ] The matrix distinguishes deterministic command routing from classifier-informed subagent routing.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "routed but not classified|classifier-informed subagent routing" .specs/pi-subagent-routing-policy/subagent-policy-matrix.md`
     - Pass: The rule is explicit and applied consistently across all commands
     - Fail: The matrix reintroduces full command classification or blurs the distinction

**T3: Write rollout and migration plan for command handlers** [sonnet] — engineering
- Blocked by: T2
- Description: Convert the target architecture and policy matrix into an incremental rollout plan that starts with `/commit` and later extends to agent-spawning commands without a big-bang refactor.
- Files: `pi/extensions/workflow-commands.ts`, `pi/extensions/prompt-router.ts`, `.specs/pi-subagent-routing-policy/rollout-plan.md`
- Acceptance Criteria:
  1. [ ] `rollout-plan.md` defines migration stages, first adopter, later adopters, and stage-specific verification steps.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "Stage 1|Stage 2|commit|research|review-it|do-it|verification" .specs/pi-subagent-routing-policy/rollout-plan.md`
     - Pass: The rollout is incremental, explicit, and avoids a single big-bang refactor
     - Fail: The rollout is incomplete, unordered, or missing verification steps
  2. [ ] The rollout plan is consistent with `subagent-policy-matrix.md` and `target-architecture.md`.
     - Verify: manual cross-check of the three named artifacts
     - Pass: No migration stage contradicts the policy matrix or target architecture
     - Fail: The rollout assumes policy decisions that are absent or contradicted elsewhere

### Wave 2 — Validation Gate

**V2: Validate wave 2** [sonnet] — validation
- Blocked by: T2, T3
- Checks:
  1. Run acceptance criteria for T2 and T3
  2. Review `.specs/pi-subagent-routing-policy/subagent-policy-matrix.md` and `.specs/pi-subagent-routing-policy/rollout-plan.md` against `.specs/pi-subagent-routing-policy/target-architecture.md`
  3. Confirm the final artifact set answers these questions end-to-end:
     - how commands are routed,
     - how subagent model policy is chosen,
     - how classifier input is used without classifying slash commands,
     - how adoption should roll out safely
  4. `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` — only if code was changed during an implementation spike
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```
Wave 1: T1 → V1
Wave 2: T2 → T3 → V2
```

## Success Criteria

1. [ ] A future implementer can resume command/subagent routing work from the artifact set without needing the original conversation.
   - Verify: `cd /c/Users/mglenn/.dotfiles && test -f .specs/pi-subagent-routing-policy/current-state.md && test -f .specs/pi-subagent-routing-policy/target-architecture.md && test -f .specs/pi-subagent-routing-policy/subagent-policy-matrix.md && test -f .specs/pi-subagent-routing-policy/rollout-plan.md`
   - Pass: All four named artifacts exist and are complete enough to hand to a builder
   - Fail: Any required artifact is missing
2. [ ] The artifact set explicitly preserves the agreed routing model and covers all target commands.
   - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "routed but not classified|research|review-it|do-it|classifier-informed subagent routing" .specs/pi-subagent-routing-policy/*.md`
   - Pass: The named artifacts collectively document the routing rule and the command coverage set
   - Fail: The final documentation omits the core rule or any target command
3. [ ] The rollout path is actionable and non-contradictory.
   - Verify: manual review of `rollout-plan.md` against `target-architecture.md` and `subagent-policy-matrix.md`
   - Pass: A builder can follow the rollout stages without unresolved contradictions
   - Fail: The rollout still depends on undefined policy decisions

## Handoff Notes

This plan is intentionally secondary to the `/commit` redesign. Do not block `/commit` implementation on subagent-routing generalization.

Preferred execution order after the `/commit` work lands:
1. Reuse the `/commit` implementation to establish the first shared routing helper shape
2. Revisit this spec and update `target-architecture.md` if the real helper differs from the initial design
3. Apply the refined routing model to `/research`, `/review-it`, and `/do-it`

If no code changes are made while executing this spec, the artifact reviews are the primary validation mechanism and the Vitest command may be skipped.