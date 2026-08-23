---
created: 2026-07-27
status: superseded
superseded: 2026-08-23
superseded_by: ../pi-workflow-contract-lifecycle/PRD.md
---

# Plan: Layer Writing Quality into Existing Pi Skills

## Context

The current Pi instruction system already owns scope control and implementation restraint in `pi/AGENTS.md`, and `pi/skills/skills-engineer/SKILL.md` requires subtractive prompt maintenance. The requested change is to add Orwell-informed prose guidance, selected Simplified Technical English practices, and requirements-engineering patterns without creating another broad skill, duplicating policy, or increasing workflow ceremony.

Two current workflow contradictions must be resolved as part of the same ownership change:

- `pi/skills/workflow/prd-it.md` claims behavior that `pi/skills/prd/SKILL.md` does not currently define.
- `pi/skills/workflow/templates/plan-template.md` requires automatic archiving while `pi/skills/workflow/do-it.md` retains plans unless the user asks to archive them.

## Objective

Pi uses the existing `no-ai-slop`, `planning`, `prd`, and `docs` skills as the single owners of writing and requirements guidance, while `/prd-it`, `/plan-it`, `/review-it`, and `/do-it` compose those skills consistently and preserve explicit, verifiable requirements without adding a new skill, command, linter, or always-loaded policy.

## Boundaries

- In scope: the four existing writing/planning skills, bounded progressive-disclosure references, the four related workflow prompts, and the PRD and plan templates.
- Out of scope: root or Pi `AGENTS.md` changes, a new `/spec-it` command, deterministic lint tooling, TypeScript workflow dispatch changes, unrelated README changes, and changes to other clients.
- Preserve: current skill activation boundaries, author voice, exact technical identifiers, command paths, PRD optionality, plan checkbox/resume behavior, and `/do-it` execution semantics.
- Source boundary: independently paraphrase useful principles; do not copy the external distilled skill, reproduce protected standards text, or claim ASD-STE100 compliance.
- Assumptions: Markdown instructions can compose discovered skills without changing `pi/extensions/workflow-commands.ts`. If a live check disproves this, stop and report the extension boundary instead of adding fallback prompt duplication.

## Tasks

- [x] **T1: Consolidate writing and requirement guidance under existing skill owners**
  - Files: `pi/skills/no-ai-slop/SKILL.md`, `pi/skills/no-ai-slop/references/technical-prose.md`, `pi/skills/planning/SKILL.md`, `pi/skills/planning/references/requirements-language.md`, `pi/skills/prd/SKILL.md`, `pi/skills/docs/SKILL.md`
  - Change: add concise Orwell-informed editing principles to `no-ai-slop`; place code-adjacent prose rules behind its conditional reference; make `planning` the owner of singular, explicit, measurable, verifiable requirement language and place EARS/INCOSE-informed detail behind its conditional reference; make `prd` distinguish narrative from normative sections and define only its minimal PRD ownership contract: optional PRDs, activation boundary, decision-oriented content and minimum shape, proportionate clarification, and requested handoffs; add only procedure-structure guidance to `docs`. Do not import every unsupported `/prd-it` claim into `prd`; remove or consolidate any nearby rule made redundant by these additions.
  - Done when: each rule has one primary owner; skill descriptions remain narrow; the PRD contract covers only supported artifact behavior; general prose preserves voice and evidence; technical prose preserves exact identifiers and domain terms; normative requirements identify the responsible entity, condition, observable outcome, and verification where applicable; detailed guidance loads only for matching tasks.
  - Verify: read all six resulting files completely and confirm their boundaries do not overlap or contradict `pi/AGENTS.md`, `skills-engineer`, or each other.

- [x] **T2: Align workflow prompts and templates with the skill contracts**
  - Files: `pi/skills/workflow/prd-it.md`, `pi/skills/workflow/plan-it.md`, `pi/skills/workflow/review-it.md`, `pi/skills/workflow/do-it.md`, `pi/skills/workflow/templates/prd-template.md`, `pi/skills/workflow/templates/plan-template.md`
  - Depends on: T1
  - Change: reduce `/prd-it` to a thin wrapper around the minimal PRD contract, retaining only command input handling and supported canonical behavior instead of importing its unsupported behavioral inventory; make `/plan-it` load `planning`, preserve requirement identifiers, terms, bounds, and exceptions, and expose unresolved design-changing ambiguity; make `/review-it` apply supported must-fix and necessary clarity repairs to the supplied artifact by default, keep explicit review-only requests non-mutating, and never edit implementation files; make `/do-it` preserve normative language and stop rather than silently choose between material interpretations; update template placeholders to capture actor, condition, outcome, measure, and verification without forcing formal syntax on narrative text. Resolve plan retention in favor of the current `/do-it` contract unless a later explicit decision changes it. Align the template and workflow wording with `/do-it` and `pi/AGENTS.md`: direct Markdown inspection is the focused check for prompt-only changes, followed by the complete repository gate required by `pi/AGENTS.md`; do not add tests whose primary purpose is preserving policy wording.
  - Done when: direct PRD requests and `/prd-it` use the same supported canonical behavior; `/plan-it` translates rather than weakens normative content; `/review-it` repairs supported defects by default without treating sentence length, passive voice, or a style score as a defect by itself; explicit review-only requests remain non-mutating; `/do-it` has one unambiguous plan-retention rule; neither wrapper duplicates detailed skill policy.
  - Verify: read the six revised workflow files as a fresh operator and trace `/prd-it -> /plan-it -> /review-it -> /do-it` for ownership, artifact paths, handoffs, stop conditions, and resume behavior.

- [ ] **T3: Validate the revised workflow without adding policy tests**
  - Targets: Pi skill discovery and `/prd-it`, `/plan-it`, `/review-it`, `/do-it` user entrypoints
  - Depends on: T2
  - Change: use a manual operator checkpoint in a live Pi session: reload Pi, create a bounded disposable PRD, plan it, review both artifacts, and confirm the resulting plan is executable without reinterpretation. Exercise `/do-it` only against reversible disposable work, or report that exact execution remains unvalidated if a safe fixture is unavailable. Do not invent an executable route for this live slash-workflow check or add tests whose primary purpose is preserving prompt wording.
  - Done when: the operator has directly inspected live artifacts that retain stable terminology, explicit conditions, measurable outcomes where applicable, direct verification, and no duplicated workflow ceremony; any unavailable exact check is named rather than inferred.
  - Verify: manually run the live `/prd-it -> /plan-it -> /review-it` checkpoint after reload and inspect the generated PRD and plan directly. Inspect revised Markdown as the focused prompt-only check, then run `make check` as the complete repository gate required by `pi/AGENTS.md`.

## Validation

- [x] Focused content check: inspect every changed Markdown file for ASCII punctuation, narrow ownership, internal links, and contradictory modal language.
  - Expected: no new always-loaded policy, duplicated owner, unsupported compliance claim, or command/skill disagreement.
- [ ] Requested workflow: manual operator checkpoint in a reloaded Pi session: run a representative `/prd-it -> /plan-it -> /review-it` sequence and inspect the artifacts.
  - Expected: narrative prose remains natural, normative statements are testable, and the plan preserves PRD meaning and identifiers.
- [ ] Execution handoff: inspect or safely exercise `/do-it` against the resulting plan.
  - Expected: it resumes checkbox work, preserves the normative contract, and does not archive or reinterpret the plan without authorization.
- [x] Prompt-only focused check: inspect revised Markdown directly under `/do-it` and `pi/AGENTS.md`.
  - Expected: the changed instruction contract is coherent without policy-wording tests.
- [ ] Complete repository gate: `make check`
  - Expected: the repository gate passes after the focused prompt inspection.

## Execution Status

- State: superseded
- Completed: T1 and T2 writing and workflow ownership changes.
- Retired: T3 depended on `/prd-it` and `/review-it`, which the successor PRD removes from the public workflow.
- Successor: `.specs/pi-workflow-contract-lifecycle/PRD.md`
- Remaining validation was not executed.
