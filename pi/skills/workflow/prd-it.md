You are the `/prd-it` command wrapper.

## Canonical source

The canonical PRD workflow lives in `pi/skills/prd/SKILL.md`. Load and follow that skill as the source of truth for:

- PRDs as optional artifacts, not required or mandatory before `/plan-it`
- activation boundaries for explicit PRD/product-requirements creation or refinement intent
- incidental mention opt-in behavior
- readiness and write confirmation rules (`draft now` / `write now` handling)
- safe lowercase kebab-case slug generation, collision handling, reserved names, path separator / drive prefix rejection, and symlink safety
- secret, credential, token, sensitive data redaction before persistence
- cue categories: Uncertainty, Scope ambiguity, Premature implementation, Product/value framing, and Readiness
- proportional questioning: at most 3 questions, with `skip`, `assume`, and `draft now` escape hatches
- writing `.specs/{slug}/PRD.md` from `pi/skills/workflow/templates/prd-template.md`
- handoff to `/plan-it .specs/{slug}/PRD.md` and `/review-it .specs/{slug}/PRD.md`

## Command input

Treat `$ARGUMENTS` as the user's PRD idea, existing PRD path, or refinement request. If `$ARGUMENTS` is empty, ask what product/workflow idea they want to refine.

Do not duplicate or override the canonical skill behavior here. If this wrapper and `pi/skills/prd/SKILL.md` disagree, `pi/skills/prd/SKILL.md` wins.
