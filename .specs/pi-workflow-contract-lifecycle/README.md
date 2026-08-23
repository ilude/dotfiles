# Pi workflow lifecycle

This directory is the single open research and product-design location for Pi workflow behavior.

## Authority

- `PRD.md` describes proposed changes that are not yet implemented or accepted as runtime behavior.
- `research.md` consolidates historical research, current implementation evidence, source URLs, open questions, and superseded proposals.
- Current executable behavior remains authoritative in:
  - `pi/skills/workflow/plan-it.md`
  - `pi/skills/workflow/do-it.md`
  - `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
  - `pi/skills/pi-extension/references/contracts/goal-and-loop.md`
  - `pi/docs/goal-execution-domain.md`
  - `pi/extensions/workflow-commands.ts`
  - `pi/extensions/goal.ts`

Archived workflow specs are historical evidence, not active authority.

## Current baseline

```text
/goal [--unattended] <objective>
  -> persistent objective and lifecycle

/plan-it <objective-or-source>
  -> reviewed .specs/{slug}/plan.md

/do-it .specs/{slug}/plan.md
  -> bounded implementation, validation, merge, and archive

goal_complete
  -> verified goal closeout
```

`/review-it` is not a current Pi command. `/validate-it` and `/do-it --repair` are proposals in `PRD.md`, not implemented interfaces. `/prd-it` remains a current optional product-definition workflow.

## Consolidated sources

This directory supersedes these former open locations:

- `.specs/goal-driven-unattended-execution/`
- `.specs/improvement-reports/`
- `.specs/pi-workflow-refinement/`
- `.specs/pr-first-ci-repair/`

Their retained findings and current dispositions are recorded in `research.md`.
