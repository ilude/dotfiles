# Rollout Plan

## Goal

Adopt shared routing policy incrementally, starting with the lowest-risk command surface and extending later to agent-spawning workflows.

This rollout must preserve the current architecture boundary:
- routing policy is centralized
- workflow execution remains in command handlers
- slash commands are routed deterministically and are not classified as freeform input

## Rollout strategy

### Why incremental rollout

A big-bang refactor would mix three separate risks:
1. changing the freeform prompt router
2. changing command-level model selection
3. changing subagent model selection

The safer approach is to establish the shared helper shape on a bounded command first, then extend it once the helper interface is proven in real use.

## Stage 1 — Establish shared helper through `/commit`

### Objective

Use `/commit` as the first adopter of shared command-aware routing.

### Why `/commit` first

- clear command identity
- bounded workflow
- already under active redesign
- does not require full subagent policy to prove command-aware routing works

### Work

1. Introduce shared routing helper shape (likely under `pi/lib/model-routing.ts`)
2. Make `/commit` ask for command-level routing explicitly
3. Keep `/commit` outside freeform prompt classification
4. Capture lessons learned about helper shape, fallback behavior, and diagnostics

### Verification

- `/commit` uses deterministic command routing rather than freeform classifier routing
- command execution logic stays in `workflow-commands.ts`
- no regression in current prompt-router behavior for non-command prompts
- documentation/specs are updated if the implemented helper shape differs from `target-architecture.md`

### Exit criteria

- shared helper exists or helper shape is otherwise concretely proven
- `/commit` demonstrates command-aware routing without merging workflow logic into `prompt-router.ts`

## Stage 2 — Reconcile spec with real helper shape

### Objective

Update this spec set based on the actual helper introduced through `/commit`.

### Work

1. Compare implemented helper behavior against `target-architecture.md`
2. Update `target-architecture.md` if names, boundaries, or metadata differ
3. Update `subagent-policy-matrix.md` if any policy assumptions changed

### Verification

- `target-architecture.md` matches the real helper shape
- no contradiction remains between the architecture doc and the proven `/commit` integration

### Exit criteria

- this spec set reflects reality rather than aspirational naming only

## Stage 3 — Add command-aware parent routing to `/research`, `/review-it`, and `/do-it`

### Objective

Adopt shared command-level routing for the agent-spawning commands without yet turning on full subagent policy behavior.

### Work

1. Make each target command consult shared routing policy for the parent/workflow model
2. Preserve command-entry rule: slash commands are routed, not classified
3. Surface routing metadata/diagnostics for debugging as needed

### Verification

- `/research`, `/review-it`, and `/do-it` all use command-aware parent routing
- none of those commands are passed through the freeform classifier at entry
- command handlers remain responsible for execution behavior

### Exit criteria

- parent command routing is centralized for all targeted commands

## Stage 4 — Introduce subagent role policy gradually

### Objective

Extend the shared helper so spawned roles can request role-aware model selection using the policy matrix.

### Work

1. Add subagent-routing calls for the first safe adopter among agent-spawning commands
2. Apply the policy matrix role-by-role
3. Keep classifier input optional and bounded by command/role policy
4. Capture fallback behavior in routing metadata

### Suggested first adoption order

1. `/research`
2. `/review-it`
3. `/do-it`

### Why this order

- `/research` naturally separates gather/synthesize/critic roles
- `/review-it` is role-sensitive but more constrained than `/do-it`
- `/do-it` is most orchestration-heavy and should adopt last after the helper is proven

### Verification

- subagent roles route according to documented policy
- classifier signals influence routing only where allowed by the matrix
- no role uses classifier output as the sole decision input

### Exit criteria

- at least one agent-spawning command uses policy-driven subagent routing successfully

## Stage 5 — Generalize and harden

### Objective

Consolidate diagnostics, fallback handling, and later adopter guidance.

### Work

1. Standardize routing metadata fields
2. Add regression coverage where code exists
3. Document how future commands should opt into shared routing
4. Decide whether agent-team / chain surfaces should consume the same helper directly

### Verification

- routing decisions are explainable
- future adopters have a documented integration path
- helper usage does not require copying policy logic into command handlers

### Exit criteria

- the shared routing helper is a stable architectural component rather than a one-off for `/commit`

## Commands in scope by stage

| Stage | Commands in scope | Purpose |
|------|-------------------|---------|
| Stage 1 | `/commit` | prove command-aware routing helper shape |
| Stage 2 | spec docs only | reconcile architecture with real implementation |
| Stage 3 | `/research`, `/review-it`, `/do-it` | adopt parent command routing |
| Stage 4 | `/research` → `/review-it` → `/do-it` | adopt subagent role routing |
| Stage 5 | broader surfaces as needed | harden and generalize |

## Verification checklist by stage

### Stage 1 verification
- [ ] `/commit` is routed by command policy
- [ ] freeform classifier still only handles non-command prompts
- [ ] helper shape is explicit enough to document

### Stage 2 verification
- [ ] `target-architecture.md` matches implemented helper shape
- [ ] `subagent-policy-matrix.md` does not contradict the helper behavior

### Stage 3 verification
- [ ] each target command requests command-aware parent routing
- [ ] no target command is classified at entry like freeform prose

### Stage 4 verification
- [ ] selected subagent roles use role-aware routing
- [ ] classifier signals are optional inputs only
- [ ] fallback behavior is observable in diagnostics

### Stage 5 verification
- [ ] later adopters have a documented integration path
- [ ] routing metadata is consistent across prompt, command, and subagent decisions

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `/commit` helper shape differs from the initial architecture doc | spec drift | make Stage 2 mandatory before broader adoption |
| parent command routing and subagent routing get implemented together too early | over-coupling and rework | keep Stage 3 and Stage 4 separate |
| classifier begins influencing slash-command entry routing | architectural regression | preserve the command-entry invariant in all stages |
| command handlers duplicate policy logic | long-term drift | require helper calls rather than local policy copies |

## Final migration rule

Do not adopt shared subagent routing for `/research`, `/review-it`, or `/do-it` until:
1. `/commit` has proven the helper shape,
2. this spec set has been reconciled with reality, and
3. parent command routing is already centralized for the target command.
