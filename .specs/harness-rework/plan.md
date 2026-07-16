---
created: 2026-07-16
status: draft
completed:
---

# Plan: Pi harness rework

## Goal

Rework Pi's workflow skills, agent definitions, model routing, and instruction
files so they state goals, boundaries, and required capabilities instead of
runtime snapshots. Delete the wording tests that lock the old prescriptions in
place and protect the surviving behavior with tests that execute it.

## Why

Most of the current prescription â€” fixed model ladders, named agents, panel
sizes, file-count routing, step recipes, prompt-wording tests â€” was written to
compensate for older models that could not be trusted to judge. Modern models
follow instructions literally, so contradictions and over-specification now
cost reasoning tokens and cause workflow churn instead of preventing it.

## Evidence base

Read before executing. All file:line claims below come from these reports:

- `.specs/workflow-test-rationalization/research/repo-state.md` â€” inventory of
  hardcoded inventories, duplicated rules, wording tests, compensation-vs-durable
  classification.
- `.specs/workflow-test-rationalization/research/pi-capabilities.md` â€” what
  upstream Pi provides (model registry metadata, skill/prompt discovery, context
  loading, extension hooks) vs. what is repository-owned (agents, subagents,
  model-size routing).
- `.specs/workflow-test-rationalization/research/prompting-guidance.md` â€”
  primary-source prompting principles and the anti-patterns checklist that
  serves as the audit criteria for every rewritten prompt.

## Boundaries

- **Scope is Pi only.** Do not modify `claude/shared/`, `claude/commands/`,
  `opencode/`, or `copilot/`. The Claude client keeps its own separate command
  system by explicit user decision.
- Preserve public command names and argument shapes (`/plan-it`, `/do-it`,
  `/review-it`, `/prd-it`, `/improve`, subagent tool schema).
- Explicit user model/agent overrides remain authoritative.
- Behavior replacement precedes deletion: before removing a test that protects
  real behavior, its replacement must fail against an intentional regression.
  Prose-only wording tests need no replacement â€” classify and delete.
- Do not build new frameworks. Use `ctx.modelRegistry`, existing discovery, and
  `pi/lib/model-routing.ts`. One owned policy point per decision, not a new
  abstraction layer.
- Do not change security or permission semantics (damage-control, permissions,
  hook behavior).
- Pi work is pnpm-only. LF endings, ASCII punctuation. Update `CHANGELOG.md`
  with each commit-worthy slice. Do not commit or push unless asked.

## Tasks

Workers and models are resolved at execution time from what is available; no
task prescribes one.

### T1: Rewrite workflow skills and templates

Rewrite `pi/skills/workflow/plan-it.md`, `do-it.md`, `prd-it.md` (if it shares
the same disease), and `templates/plan-template.md` to the standard already set
by the new `review-it.md`: objective, hard boundaries, evidence/validation
requirements, definition of done. Apply the anti-patterns checklist from the
prompting-guidance report as audit criteria. Remove: file-count complexity
ladders, mandatory Model/Agent plan columns (replace with an optional
required-capability field), phantom reviewer personas (`do-it.md:125` names
three agents that do not exist), reviewer counts, and duplicated delegation
recipes.

Done when: no workflow skill or template names a model, model tier, agent
(except as a runtime-resolved example), panel size, or file-count threshold;
every checklist anti-pattern is absent or justified in the diff notes.

### T2: Consolidate the agent roster and delete the org-chart taxonomy

Delete `roleType`, `reportsTo`, `leads`, and `routingUse` from all
`pi/agents/*.md` frontmatter and from the parser (`pi/extensions/subagent/agents.ts`).
Merge agents that differ only by model binding (`coding-light/medium/heavy`,
`validator/validator-heavy`, lead/orchestrator variants, `skill-review-*` if
the deterministic review protocol allows). An agent file survives only if its
role, tools, or boundaries genuinely differ from every other agent. Keep model
frontmatter only as a default hint; routing (T3) owns selection. Update
`pi/lib/skill-review.ts:602,628-641` for whatever roster survives.

Done when: every remaining agent has a distinct role/tool/boundary rationale;
parser accepts only fields the launcher consumes; `agent-role-semantics.test.ts`
is replaced by a behavior test of parse-to-launch (frontmatter in, spawn flags
out) with no org-chart assertions.

### T3: One owned routing policy

Consolidate model selection into `pi/lib/model-routing.ts` as the single policy
point, resolving against `ctx.modelRegistry.getAvailable()` metadata (context
window, reasoning/thinking levels, cost). Remove the duplicate hardcoded ladder
in `pi/extensions/fable.ts:13-18` and its pinned-ID regexp; `/fable` and
`/foreman` keep their explicit user-facing model choices but express them
through the resolver. Named-model preferences that remain (e.g. Codex premium
set in `prompt-router.ts`) live in one clearly-marked policy table in the
resolver module, not scattered across extensions.

Done when: exactly one module maps capability needs to model selection; zero,
one, and many available-model fixtures resolve deterministically; missing
capability fails with a clear diagnostic; explicit override wins; existing
subagent/routing tests pass against the consolidated path.

### T4: Trim Pi instruction files to judgment, safety, and facts

Apply the pi-capabilities report's "prose that duplicates runtime capability"
table: stop restating skill/extension/context discovery mechanics in
`pi/README.md`, `pi/PI-INSTRUCTIONS.md`, `pi/AGENTS.md`, and
`pi/extensions/pi-instructions.ts`. Replace named-model delegation gates
(`pi/PI-INSTRUCTIONS.md:9`, `pi/README.md:622-624`) with capability terms.
Remove rules from `CLAUDE.md` that `AGENTS.md` already owns (pnpm policy
restatement); keep pointers, not paraphrases. Root `AGENTS.md` remains the
owner of repository invariants.

Done when: each retained rule has one owning file; no Pi instruction restates
what Pi discovers or enforces at runtime; byte counts before/after recorded as
a context-load proxy.

### T5: Align Pi tests with behavior

Delete remaining prompt/wording assertions per the repo-state report:
`workflow-prompts.test.ts` literals beyond dispatch behavior,
`runtime-smoke.test.ts` source-shape checks (replace with a fixture-driven
extension-load test if cheap, else accepted loss), `tool-reduction.test.ts`
source greps (extend the existing process-behavior tests to cover Windows
invocation options via mocked spawn), and the prompt-wording case in
`workflow-commands-pure.test.ts:310-318`. Keep tests that exercise runtime
output (`pi-instructions`, `skill-prompt`, `review-artifact`, dispatch,
subagent).

Done when: no Pi test passes or fails on unparsed prose; each deletion has a
row in the repo-wide decision ledger at
`.specs/test-rationalization/ledger.md` (wording-only delete vs.
behavior-replaced vs. accepted loss); focused suites and typecheck pass.

## Dependencies

T1 and T4 are independent. T2 before T3 (roster determines what routing must
resolve). T5 last â€” it deletes the locks after the surfaces stabilize.

## Validation

1. Focused: `cd pi && pnpm test <changed filters>` and `pnpm run typecheck`
   per task.
2. Exercise the real entrypoints once after T5: `/plan-it`, `/do-it`,
   `/review-it` against a scratch plan fixture; confirm dispatch, routing, and
   mutation boundaries.
3. Aggregate once at the end: `make check-pi-extensions`.
4. Record before/after instruction byte counts and test counts.

## Out of scope

- Claude/OpenCode/Copilot command bodies (kept separate by user decision).
- Shell/config Python tests and the repo-wide test decision ledger
  (`.specs/test-rationalization/plan.md`).
- Quality tooling pinning (`.specs/quality-tooling/plan.md`).
- Workflow-friction instruction-context capture (deferred follow-up).

## Execution status

- **Classification:** planned, not started
- **Next:** T1, T4 in parallel; then T2 -> T3; then T5
- **Resume:** `/do-it .specs/harness-rework/plan.md`
