- severity: high
  evidence: Plan claims `/prd-it` should “also activate from PRD/product-requirements language,” but tasks only create `pi/skills/workflow/prd-it.md`; existing auto-discovery registers slash commands, not natural-language activation. No acceptance criterion verifies ordinary PRD mentions load/use the skill.
  required_fix: Either scope natural-language activation out and state `/prd-it` is the only reliable entrypoint, or add the minimal mechanism/instructions and validation proving PRD-language prompts trigger the workflow.

- severity: medium
  evidence: T1 requires readiness detection, cue categories, divergent/convergent refinement, automatic slugging, handoff rules, and template creation in one new skill. This risks a product-management manual despite the constraint “Prefer simple phrasing so the skill can load cheaply.”
  required_fix: Define a tight MVP skill shape: max sections, max question batch size, required outputs only. Move theory-heavy cues to compact checklist language or defer advanced frameworks.

- severity: medium
  evidence: Success checks rely on grep for words like `fuzzy|guided|auto.*slug` and section names. These prove vocabulary exists, not that a fresh agent can produce `.specs/{auto-slug}/PRD.md` or choose when not to write one.
  required_fix: Add one end-to-end dry-run validation using a sample fuzzy prompt and expected PRD path/sections, plus a negative case showing plan-it remains conversation-only without PRD pressure.

- severity: medium
  evidence: T1 says users should not provide slug directories, but no acceptance criterion defines slug generation rules, collision behavior, or title source. `.specs/` existing-slug collision checks are in plan-it instructions, not this PRD implementation plan.
  required_fix: Specify minimal slug algorithm and collision behavior in `prd-it.md` and validate it textually: lowercase kebab title, max length, append suffix on existing directory.

- severity: low
  evidence: T1, T2, and T3 are marked parallel, yet all define one connected user journey and can introduce inconsistent PRD precedence/review terminology across files. V1 catches this late after independent edits.
  required_fix: Either make T1 produce canonical terminology first and have T2/T3 depend on it, or add an explicit shared vocabulary/handoff contract that parallel implementers must copy exactly.
