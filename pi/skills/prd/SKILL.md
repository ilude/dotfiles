---
name: prd
description: "Product Requirements Document refinement for Pi. Activate when the user invokes /prd-it or asks to create, refine, review, flesh out, draft, or write a PRD/product requirements artifact. Do not activate for incidental PRD mentions unless asking one opt-in question."
---

# PRD Workflow

**Auto-activate when:** The user invokes `/prd-it`, asks to create/refine/review/flesh out/write a PRD, or asks for product requirements refinement.

## Core Principle

PRDs are optional idea-refinement artifacts, not a mandatory step before `/plan-it`. Use this skill only when a PRD will clarify fuzzy product/workflow intent; otherwise preserve the normal conversation-to-plan flow.

## Practical Steps

1. **Classify intent**
   - Clear PRD intent: enter PRD refinement mode.
   - Incidental PRD mention: ask one opt-in question, then follow the user's choice.
   - Concrete implementation/planning request: do not force a PRD.

2. **Refine in small batches**
   - Ask at most 3 questions at a time.
   - Offer escape hatches: `skip`, `assume`, `draft now`, or `keep it lightweight`.
   - Keep depth proportional to risk and ambiguity.

3. **Watch refinement cues**
   - **Uncertainty**: maybe/not sure/vague users/conflicting goals.
   - **Scope ambiguity**: unclear boundaries, missing non-goals, multiple audiences.
   - **Premature implementation**: tools/architecture appear before the problem and outcomes.
   - **Product/value framing**: unclear user, job-to-be-done, value, or success signal.
   - **Readiness**: testable requirements, explicit non-goals, named risks, and clear `/plan-it` handoff.

4. **Before writing**
   - If the user did not explicitly ask to write now, present title, scope, target path, and redaction note; ask for confirmation.
   - Do not persist secrets, credentials, tokens, private customer data, sensitive personal data, or proprietary evidence unless redacted/summarized with explicit approval.

5. **Write the artifact**
   - Generate a lowercase kebab-case slug, max 40 chars.
   - Strip `..`, path separators, drive prefixes, control characters, reserved names, and unsafe punctuation.
   - Write only to `.specs/{slug}/PRD.md`.
   - On collision, append `-2`, `-3`, etc.
   - Never write through a symlinked `.specs/{slug}` target.
   - Use `pi/skills/workflow/templates/prd-template.md` as the default structure.

6. **Handoff**

```bash
/plan-it .specs/{slug}/PRD.md
/review-it .specs/{slug}/PRD.md
```

If no PRD is needed, hand off to `/plan-it` with ordinary conversation context.

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Forcing PRDs before every plan | Adds friction and violates optional-PRD rule | Use PRDs only for fuzzy or product-shaped work |
| Hijacking incidental mentions | Surprises users | Ask one opt-in question |
| Long interrogation | Slows refinement | Ask at most 3 questions and offer assumptions |
| Persisting sensitive details | Leaks secrets/private data | Redact or summarize before writing |
| Choosing latest filesystem PRD | Hidden state causes wrong handoff | Use explicit path or current-conversation artifact only |

## Quick Reference

| User input | Behavior |
|------------|----------|
| `/prd-it` | Start PRD refinement |
| `help me create a PRD` | Start PRD refinement |
| `review this PRD.md` | Review PRD readiness for `/plan-it` |
| `PRDs can be useful sometimes` | Ask opt-in at most once or continue normally |
| `make a plan from this context` | Use `/plan-it` context; no PRD required |
