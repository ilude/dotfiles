# UX Research Review: Conversational PRD Workflow

## Finding 1: Over-broad natural-language activation risks hijacking ordinary planning
- **Severity:** High
- **Evidence:** Objective says the skill should activate from “ordinary mentions of PRD/product-requirements language,” but the plan does not define non-activation cases.
- **Required fix:** Add explicit activation boundaries: only enter PRD workflow when the user asks to create/refine/review a PRD or product requirements. If PRD is mentioned as context, offer one brief opt-in question instead of switching modes.

## Finding 2: File creation readiness is underspecified and may feel too eager
- **Severity:** High
- **Evidence:** T1 requires automatic slug generation and `.specs/{slug}/PRD.md` writing, but does not require explicit user confirmation before writing.
- **Required fix:** Require a clear readiness checkpoint before file creation: summarize proposed PRD scope/path and ask for confirmation unless the user explicitly requested immediate writing.

## Finding 3: Guided questioning lacks a user-control escape hatch
- **Severity:** Medium
- **Evidence:** The plan requires “small-batch questioning” but does not define max question count, skip behavior, or direct-draft behavior for impatient users.
- **Required fix:** Add rules: ask at most 3 questions per turn, allow “skip/assume/draft now,” and proceed with labeled assumptions when the user prioritizes momentum.

## Finding 4: Ambiguity handling may over-interrogate low-stakes ideas
- **Severity:** Medium
- **Evidence:** Required cue categories include uncertainty, scope ambiguity, premature implementation, product/value framing, and readiness, but no proportionality guidance.
- **Required fix:** Add triage: for small/internal tasks, use a lightweight PRD or bullets; reserve deeper discovery for high-impact, user-facing, risky, or multi-stakeholder work.

## Finding 5: Conversation-only fallback needs clearer “do not write” guidance
- **Severity:** Medium
- **Evidence:** Constraints say PRDs are optional and `/plan-it` must work without one, but T1 focuses on PRD writing and handoff.
- **Required fix:** Add “do not write a PRD” cases: user asks for a plan directly, enough context exists, user declines artifact creation, or the PRD would duplicate current-session decisions.
