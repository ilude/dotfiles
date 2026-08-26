---
created: 2026-08-25
status: ready
---

# Align agent guidance with simple, flexible enforcement

## Objective

Revise Pi's development guidance and routing policy so consequential invariants remain enforced, contextual choices remain flexible, and advisory or experimental routing machinery is retained only when bounded telemetry demonstrates that it changes a useful decision.

## Completion Evidence

- Evidence: Repository guidance consistently distinguishes values, safety boundaries, outcomes, necessary procedures, overridable defaults, heuristics, and contextual judgment; broad determinism and fallback prohibitions are replaced by simpler invariant-focused language; duplicated reasoning and routing choreography is removed or relocated to its owner; safety-critical Git, credential, target, protocol, rollout, and incident controls remain normative; and a bounded audit of existing routing telemetry records an evidence-backed retain, simplify, or remove disposition for each advisory and experiment mechanism, with focused tests passing for every changed executable contract.
- Fails when: A heuristic is still presented as an invariant, flexibility is used to weaken a safety boundary, global instructions still prescribe mutable model ladders or unnecessary reasoning rituals, routing code is deleted without usage and outcome evidence, an experiment remains without a decision or retirement disposition, or changed Pi routing and instruction-discovery behavior fails its focused validation.

## Boundaries

- In scope: `AGENTS.md`; `pi/AGENTS.md`; the development-philosophy, skills-engineer, orchestration, analysis-workflow, code-review, and directly affected skill guidance; the existing Obsidian failure-category research note and index if its title or link changes; bounded read-only analysis of canonical orchestration metrics; and, only when the audit supports it, advisory routing, routing-experiment, effort-default, telemetry, documentation, and focused test code.
- Out of scope: New policy engines, schedulers, routing experiments, telemetry fields, analytics persistence, general prompt-router redesign, model-provider additions, unrelated skills, formatting-only rewrites, live infrastructure behavior, damage-control weakening, and implementation of broader architectural enforcement candidates such as generated WSL link parity.
- Preserve: Explicit user overrides; user-requested model selection; provider availability and compatibility checks; simple `modelSize` resolution where it remains an active interface; repository and module ownership; destructive-operation, secret, wrong-target, external-protocol, live-rollout, and incident-recovery boundaries; unrelated working-tree changes; and current behavior unless this plan names it for evidence-backed simplification.
- Assumptions: Canonical local orchestration metrics under the configured metrics root contain enough metadata to count advisory classifications and routing experiment assignments/outcomes; when evidence is absent or cannot connect a mechanism to useful outcomes, the plan favors removing advisory or experimental machinery while retaining required model-resolution mechanisms. `/do-it` must create and own the implementation worktree before changing files, then archive, commit, merge with `--no-ff`, verify merged HEAD, and remove only its owned worktree and branch.

## Tasks

- [ ] **T1: Audit routing policy value with bounded evidence**
  - Files: `docs/research/obsidian-vault/agent-workflows/patterns/eliminating-failure-categories.md`, `.tmp/routing-policy-audit.json`
  - Change: Read only canonical orchestration metric records from the configured metrics root and produce a disposable bounded report under `.tmp/` covering advisory policy versions, task classes, preferred/accepted/mismatch counts, topology mismatches, experiment assignments, arms, validation-outcome availability, completion status, cost, duration, and whether any recorded result supports a routing decision. Record in the existing research note a separate retain, simplify, or remove disposition for explicit model resolution, provider compatibility, size aliases, effort defaults, the task-class advisory matrix, mismatch classification, topology classification, and `codex-routing-outcomes-v1`. Treat missing quality evidence as absence of support rather than evidence of equivalence; do not add analytics schemas, telemetry, a new experiment, or permanent audit code.
  - Done when: The disposable report states its metrics root, covered date range, record counts, missing fields, and bounded queries; every active responsibility in `pi/lib/model-routing.ts` has a disposition tied to observed evidence or an external interface; and the note distinguishes deterministic safety mechanisms from defaults, heuristics, and contextual judgment.
  - Verify: `test -s .tmp/routing-policy-audit.json && python -m json.tool .tmp/routing-policy-audit.json >/dev/null && rg -n "Routing policy case study|Retain|Simplify|Remove|missing evidence" docs/research/obsidian-vault/agent-workflows/patterns/eliminating-failure-categories.md`

- [ ] **T2: Refactor durable guidance around values and boundaries**
  - Files: `AGENTS.md`, `pi/AGENTS.md`, `pi/skills/development-philosophy/codebase-design.md`, `pi/skills/skills-engineer/SKILL.md`, `pi/skills/orchestration/SKILL.md`, `pi/skills/analysis-workflow/SKILL.md`, `pi/skills/analysis-workflow/debugging.md`, `pi/skills/code-review/SKILL.md`
  - Depends on: T1
  - Change: Establish the hierarchy "delete unnecessary choices; prefer direct code; enforce consequential invariants at their owner; provide overridable defaults; preserve contextual judgment; add policy machinery only after demonstrated failure; retire machinery that no longer changes outcomes." Replace the blanket deterministic-tooling and fallback prohibitions with invariant-focused language. Add value/boundary/outcome/procedure/default/heuristic classification to skill authoring, make completion evidence apply to operational workflows rather than every prose step, consolidate duplicated bound-before-work guidance, remove mutable model ladders from global policy, and express review and debugging rules through changed evidence rather than fixed counts or reasoning rituals. Keep exact procedures where order is part of correctness and preserve every named safety boundary. Prefer deletion and consolidation over adding parallel explanations.
  - Done when: Each governing concept has one owner; global instructions contain no mutable model ladder, blanket determinism mandate, blanket fallback ban, universal escalation choreography, or fixed reasoning count; operational skills retain only procedures whose sequence affects correctness; and the resulting diff explicitly preserves destructive Git, credential, target, protocol, rollout, and incident controls.
  - Verify: `git diff --check -- AGENTS.md pi/AGENTS.md pi/skills/development-philosophy/codebase-design.md pi/skills/skills-engineer/SKILL.md pi/skills/orchestration/SKILL.md pi/skills/analysis-workflow/SKILL.md pi/skills/analysis-workflow/debugging.md pi/skills/code-review/SKILL.md && ! rg -n "Use deterministic code/tooling|Do not add try-catch wrappers|Every step ends with|2-3 alternative causes|Stop after 2 failed attempts|A review is one terminal pass" AGENTS.md pi/AGENTS.md pi/skills`

- [ ] **T3: Simplify routing implementation only as the audit supports**
  - Files: `pi/lib/model-routing.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/fable.ts`, `pi/extensions/workflow-commands.ts`, `pi/extensions/workflow-friction-review.ts`, `pi/docs/orchestration-telemetry.md`, `pi/tests/model-routing.test.ts`, `pi/tests/subagent.test.ts`, `pi/tests/orchestration-telemetry.test.ts`, `pi/tests/orchestration-stats.test.ts`
  - Depends on: T1
  - Change: Apply the T1 dispositions subtractively. Preserve active user-facing model resolution and compatibility behavior. Remove advisory matrices, classifications, topology judgments, experiment assignment, effort coupling, telemetry fields, documentation, or tests only when T1 finds no decision-relevant evidence or external dependency; retain a mechanism when evidence or an active interface requires it, while making heuristics overridable and clearly non-normative. Do not replace removed machinery, create compatibility shims for private telemetry, add another abstraction layer, or modify the analytics system. Run the focused routing typecheck and tests before expanding any shared TypeScript change.
  - Done when: Every retained routing mechanism maps to an active interface, safety constraint, or T1 evidence; every unsupported advisory or experimental path is removed through its producers, consumers, documentation, and tests without parallel state; explicit overrides and provider compatibility still work; and no routing mismatch is treated as failure or acceptance evidence.
  - Verify: `cd pi && pnpm run typecheck && pnpm test model-routing.test.ts subagent.test.ts orchestration-telemetry.test.ts orchestration-stats.test.ts`

## Validation

- [ ] The T1 audit is bounded and reproducible from canonical metadata; T2's forbidden-phrase and diff checks pass while named safety boundaries remain present; T3's focused typecheck and tests pass; repository search finds no orphaned routing policy, experiment, telemetry, or documentation symbols contrary to the recorded dispositions; all Markdown links resolve; and `git diff --check` passes for the complete change.

## Retention

Keep incomplete work at `.specs/flexible-agent-guidance/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/flexible-agent-guidance/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/flexible-agent-guidance/plan.md`
