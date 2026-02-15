---
description: Brain dump mode - capture ideas quickly, make them actionable
argument-hint: [optional-slug]
---

# Brain Dump Mode

**Context**: User likely woke up with an idea they need to get out of their head. Priority is:
1. Capture the idea quickly
2. Make it actionable if possible
3. Get user back to what they were doing (sleeping, etc.)

## Workflow

### 1. Acknowledge Context
- Check time with `date` to understand urgency
- Be concise - user's brain is racing, don't add friction

### 2. Capture the Idea
Ask ONE question at a time to extract:
- **What** is the core idea? (let them dump it all out)
- **Why** does it matter? (what problem does it solve)
- **Scope** - what's the minimum viable version?

### 3. Create Idea Folder
```
.specs/<slug>/
├── IDEA.md                # Main idea document
├── research/              # Any web research, references
├── decisions/             # Key decisions made
└── [other files as needed]
```

This aligns with `.specs/` used by `/do-this` and `/plan-with-team`. If the idea becomes actionable, a `plan.md` can be added alongside `IDEA.md` in the same directory.

**Slug naming:**
- Use descriptive slug: `voice-memo-ingest/`, `shared-command-pattern/`
- If no clear name yet, use date prefix: `2025-11-22-braindump/`
- Ask user before renaming

### 4. Determine Path Forward

**If actionable:**
- Create concrete implementation plan
- Get user approval
- Execute with FREQUENT git commits (every meaningful change)
- Push often so progress is saved
- Continue capturing context in .specs directory while working

**If needs more thought:**
- Save everything to `.specs/<slug>/IDEA.md`
- Add to `.specs/<slug>/SUGGESTED_NEXT.md` for future reference
- Commit and push what we have

### 5. Git Discipline
- Commit after creating .specs directory
- Commit after each phase of planning
- Commit after each implementation step
- Push after every 2-3 commits minimum
- User should be able to resume from any point

## Idea Document Template

```markdown
# [Idea Title]

**Date**: YYYY-MM-DD HH:MM
**Status**: [brainstorm|planning|in-progress|parked|completed]

## The Idea
[Raw brain dump - capture everything user says]

## Why It Matters
[Problem it solves, motivation]

## Minimum Viable Version
[Smallest useful implementation]

## Implementation Plan
[If actionable - concrete steps]

## Open Questions
[Things to figure out]

## Research & References
[Links, notes from web searches]

## Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
```

---

**Start now**: Ask the user "What's the idea?" and let them dump it all out.
