---
created: 2026-09-04
status: completed
completed: 2026-09-04
---

# Consolidate Pi guidance to single-owner rules

## Objective

Pi guidance states each cross-cutting rule once in its owning file, the workflow lifecycle contract describes only operator-visible behavior, and Pi guidance carries the rule that stops serial patching at one lifecycle boundary.

## Completion Evidence

- Evidence: the `workflow-lifecycle.md` Execution content is at most 300 words, contains none of the prohibited phrases, and maps every behavior in Preserve to a sentence; each of the six audited rules has its full text in exactly one owning file and at most a one-sentence domain reference elsewhere; `pi/AGENTS.md` states the boundary-patch stop rule exactly once; `plan-it.md` states next-command presentation exactly once and its `## Report` section contains no command block.
- Fails when: a prohibited phrase survives in `workflow-lifecycle.md`, a Preserve behavior has no sentence, any audited rule is stated in full in two files, a cross-client rule was moved out of root `AGENTS.md`, or `plan-it.md` still presents the next command twice.

## Boundaries

- In scope: `AGENTS.md` (root), `pi/AGENTS.md`, `pi/skills/workflow/do-it.md`, `pi/skills/workflow/plan-it.md`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`, `pi/skills/pi-extension/SKILL.md`, `pi/skills/testing/SKILL.md`, `pi/skills/analysis-workflow/SKILL.md`, `CHANGELOG.md`.
- Out of scope: extension or library TypeScript, tests, `session-lifecycle.md`, `quality-gates.md`, the `planning` skill, rubric items 1 and 3-7 in `plan-it.md` (retained; their review yield was observed today), the damage-control repeated-loop limit, and any behavior change to `/plan-it` or `/do-it`.
- Preserve: every operator-visible behavior currently described in `workflow-lifecycle.md` (flags, clearing, ownership, closeout policies, preflight, routing, archive verification); every safety, destructive-action, secret, and live-mutation boundary; the reviewer rubric; the `Closeout` policy marker; the next-command clipboard mechanism; instruction discovery so each owning file remains loaded in the contexts that need it; and the existing state that no test asserts guidance or contract prose -- add no such test.
- Assumptions: `.specs/reduce-validation-churn/plan.md` edits `pi/AGENTS.md`, `do-it.md`, and `plan-it.md`; this plan must start only after that plan is archived and merged so the consolidated text includes its additions. The primary working tree may carry unrelated modifications that `/do-it` must not alter.

## Tasks

- [x] **T1: Cut the lifecycle contract to operator-visible behavior**
  - Files: `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`, `CHANGELOG.md`
  - Change: Rewrite the Execution bullet so every sentence names something an operator can observe: accepted inputs and flags, when clearing happens, what preflight rejects, ownership and resume behavior, closeout policies, and what preserves recovery state. Remove implementation history and internals: "sole extension refresh" and redundant-reload wording, private continuation ID and consumed/pending semantics, "synthetic public `/do-it` message", argument-completion cache refresh triggers, and the eight-case tracked/untracked/ignored/staged transfer matrix, which becomes one sentence naming the accepted states and the rejection rule. Where a removed sentence records a fixed defect, confirm it is already covered by a named test in `pi/tests/workflow-dispatch.test.ts` or a `CHANGELOG.md` entry; if neither exists, add the changelog line rather than keep the contract sentence. Split the result into at most four bullets if a single bullet exceeds 150 words.
  - Done when: the Execution content totals at most 300 words, no prohibited phrase remains, and every behavior listed in Preserve maps to one retained sentence.
  - Verify: deterministic inspection of the complete Execution section: search it for every prohibited phrase (`sole extension refresh`, `redundant reload`, `private ID`, `consumed`, `pending`, `synthetic public`, `cache`, `refreshed on`, `untracked nonignored`, `staged, mixed, renamed`); measure only that section's word count; map each Preserve behavior to one sentence. No TypeScript tests; nothing in `pi/tests` or `pi/lib` reads this prose. On a surviving phrase, missing behavior, or count above 300, report it and stop; do not retry.

- [x] **T2: Give each duplicated rule one owning file**
  - Files: `AGENTS.md`, `pi/AGENTS.md`, `pi/skills/workflow/do-it.md`, `pi/skills/workflow/plan-it.md`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`, `pi/skills/pi-extension/SKILL.md`, `pi/skills/testing/SKILL.md`, `pi/skills/analysis-workflow/SKILL.md`
  - Change: Apply this ownership table. Cross-client rules stay in root `AGENTS.md`, which every client loads: focused contract-directed validation; completion evidence before work; ask only for material operator decisions; bounded selective delegation. Pi-only rules: stop when evidence is exhausted -> `pi/skills/analysis-workflow/SKILL.md`; no duplicate review path -> `workflow-lifecycle.md`; and one new row, the boundary-patch stop rule -> `pi/AGENTS.md` Engineering: when a second defect is found at the same lifecycle boundary (session replacement, worktree ownership, closeout, or another named transition), do not apply a third targeted patch until one test exercises the whole transition end to end. In each owning file keep the full rule; in every other listed file reduce the overlapping statement to at most one sentence carrying only domain-specific detail (for example `do-it.md` keeps "for prose-only edits, inspect content directly" but not the general focused-check rule). Do not change rule meaning or strength; do not remove domain-specific exceptions or safety stop conditions; do not move any rule out of root `AGENTS.md`.
  - Done when: each rule in the table is stated in full in exactly its owning file, every other occurrence is a one-sentence domain reference or less, and root `AGENTS.md` lost no cross-client rule.
  - Verify: deterministic hunk-by-hunk inspection of `git diff` for the eight files against the ownership table, confirming for each removed statement that the owning file still contains the rule and the removed text carried no unique exception; read the complete `pi/AGENTS.md` and confirm exactly one rule names both the second-defect trigger and the whole-transition-test gate. On a hunk that removes a unique exception or moves a cross-client rule, restore it, report, and stop.
  - Depends on: T1

- [x] **T3: State next-command presentation once in plan-it.md**
  - Files: `pi/skills/workflow/plan-it.md`, `CHANGELOG.md`
  - Change: Delete the `/do-it` command block and next-command wording from the `## Report` section so the Final Report paragraph is the sole normative statement; the command finalizer already copies and renders the next command separately (covered by the existing `message_end` and `agent_end` tests in `workflow-dispatch.test.ts`). Add one `CHANGELOG.md` entry covering T1-T3.
  - Done when: `plan-it.md` contains exactly one normative next-command rule and `## Report` contains no command presentation.
  - Verify: deterministic inspection confirming the Final Report paragraph is the only normative next-command statement, `## Report` has no command block, and the only `/do-it .specs` match is the Plan Contract's Execution Status Resume example. Do not run tests; the finalizer behavior is unchanged and already covered. On any additional normative statement or command block, report and stop.
  - Depends on: T2

## Execution Strategy

- Run only after `.specs/reduce-validation-churn/plan.md` is archived and merged; T2 consolidates text that plan adds.
- T1 before T2 before T3: the contract cut reduces what T2 reconciles, and T3's `plan-it.md` cleanup follows T2's edits to the same file so the diff stays inspectable.
- All tasks are root-owned prose edits; delegate nothing; run no TypeScript tests. No test or parser reads this prose, and none should be added to assert it.

## Validation

- [x] Word count of the `workflow-lifecycle.md` Execution content is at most 300 after T1.
  - Result: 286 words; the prohibited-phrase scan returned no matches, and the retained sentences cover flags, clearing, ownership, closeout policies, preflight, routing, archive verification, and recovery preservation.
- [x] Root `AGENTS.md` diff after T2 contains no removed rule text, only reductions of duplicates that root does not own.
  - Result: the single hunk inspection retained the four cross-client rules in root, placed the evidence-exhaustion and review-path rules in their named skill and contract owners, and found no removed unique exception; complete `pi/AGENTS.md` inspection found the boundary-patch rule exactly once.

## Retention

Keep incomplete work at `.specs/consolidate-pi-guidance/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/consolidate-pi-guidance/`.

## Execution Status

- State: Complete; T1-T3 and all required validation passed.
- Blocker: None.
- Next: Archive, commit, merge, and verify closeout.
- Current frontier: Complete; remaining live attempts: N/A.
- Resume: `/do-it .specs/consolidate-pi-guidance/plan.md`
