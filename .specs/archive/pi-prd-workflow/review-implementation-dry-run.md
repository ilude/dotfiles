# PRD Workflow Implementation Dry Run

## Positive case: fuzzy PRD prompt

**Prompt:** "Help me create a PRD for making Pi planning easier when my idea is fuzzy."

**Expected trigger:** `/prd-it` behavior activates because the user clearly asks to create a PRD.

**Question batch:**

1. Who is the primary user: you only, other Pi users, or both?
2. What outcome matters most: faster planning, better requirement quality, or fewer unnecessary plans?
3. Should this be lightweight guidance only, or include runtime state?

**Safe slug/path:**

- Generated title: `Pi PRD Workflow`
- Safe slug: `pi-prd-workflow`
- Target path: `.specs/pi-prd-workflow/PRD.md`
- Collision behavior: if it exists, try `.specs/pi-prd-workflow-2/PRD.md`
- Safety: do not write through a symlinked `.specs/{slug}` directory

**Write confirmation:**

> Proposed PRD: Pi PRD Workflow  
> Scope: optional conversational PRD refinement that can hand off to plan/review workflows.  
> Path: `.specs/pi-prd-workflow/PRD.md`  
> Sensitive details will be redacted or summarized. Write this PRD now?

**Handoff after write:**

```bash
/plan-it .specs/pi-prd-workflow/PRD.md
/review-it .specs/pi-prd-workflow/PRD.md
```

## Negative case: PRD unnecessary

**Prompt:** "Use `/plan-it` to make a plan from the context above; no PRD needed."

**Expected behavior:** `/plan-it` remains conversation-only. It uses current-session context and does not require, discover, or silently select the latest filesystem PRD.

**Evidence:** `plan-it.md` documents precedence as explicit `PRD.md` path, current-conversation PRD artifact, then ordinary conversation context.
