---
name: planning
description: "Planning methodology including acceptance criteria, PRDs, and verification strategies. Activate when writing acceptance criteria, creating PRDs, defining requirements, user stories, verification criteria, or converting vague requirements into testable outcomes."
---

# Planning & Requirements Engineering

**Auto-activate when:** Writing acceptance criteria, creating PRDs, defining requirements or user stories, discussing verification strategies, converting vague requirements into testable outcomes, or working with `.specs/` plan files.

---

## Core Principle: Verifiable by Default

**Agents can only work autonomously if they can test their own work without human judgment.**

Every requirement must have:
1. A specific, measurable outcome
2. A verification method (command, test, API call, file check)
3. An expected result
4. No subjective interpretation

---

## Acceptance Criteria Methodology

### Converting Vague → Concrete

| Vague Term | Clarifying Question |
|------------|-------------------|
| "Make it faster" | What specific metric? (response time, load time, query time) |
| "Improve UI" | What specific visual change? (layout, colors, spacing, component) |
| "Better errors" | What should the error message say? What status code? |
| "User-friendly" | What specific user action becomes easier? How? |
| "Fix the bug" | What's the expected behavior vs actual behavior? |
| "More secure" | What specific security measure? (auth, validation, encryption) |

### Structured Format

Each acceptance criterion follows this structure:

```
1. [ ] [Specific, measurable outcome]
   - Verification: [Exact command, test, or check]
   - Expected result: [What should happen]
```

### Good vs Bad Examples

**Good** (objective, testable by agent):
- "Add status column to task table with enum: active, complete, archived"
- "Login form displays 'Invalid credentials' error when auth fails"
- "API returns 404 status code when resource ID doesn't exist"
- "Search results render within 2 seconds for queries under 50 chars"
- "npm test passes with zero warnings"

**Bad** (subjective, requires human judgment):
- "Make the UI look nice"
- "Improve performance"
- "Fix the bug"
- "Add better error handling"

### Verification Patterns by Domain

**API Endpoints:**
```
1. [ ] GET /api/users returns 200 with user array
   - Verification: `curl http://localhost:3000/api/users | jq '.status'`
   - Expected result: 200 status, array in response body
```

**File Operations:**
```
1. [ ] Script creates config at ~/.config/app/settings.json
   - Verification: `ls -la ~/.config/app/settings.json && python -m json.tool < ~/.config/app/settings.json`
   - Expected result: File exists and is valid JSON
```

**UI Components:**
```
1. [ ] Error modal displays with red border and close button
   - Verification: E2E test snapshot or `npm run test:e2e -- modal.spec.ts`
   - Expected result: Modal visible, CSS class error-modal, close button present
```

**Performance:**
```
1. [ ] Page load completes within 2 seconds
   - Verification: `lighthouse --only-performance http://localhost:3000`
   - Expected result: Performance score > 90
```

---

## PRD Structure

When generating PRDs, use the `/prd` command which provides a structured template with:
- Context section (project description and goals)
- Tasks with user stories and acceptance criteria
- Test commands for verification
- Constraints and success criteria

Key principle: every task in a PRD must have acceptance criteria that follow the verifiable format above.

---

## Planning Workflow Integration

### With `/plan-with-team`
Plans require acceptance criteria for every task. The plan validation checklist includes: "Every task has Acceptance Criteria." Use the methodology above to write them.

### With `/do-this`
The smart router uses acceptance criteria to validate agent output. Better criteria = better autonomous execution.

### With `/ptc`
PTC (Programmatic Tool Calling) can be used during planning phases for:
- Multi-URL scraping to gather requirements context
- Browser automation for researching existing implementations
- Custom workflows combining multiple MCP tools

---

## Anti-Patterns

1. **Vague criteria accepted** — Always push back on subjective language. Ask clarifying questions.
2. **Missing verification method** — Every criterion needs a concrete way to test it. "Looks correct" is not verification.
3. **Untestable scope** — If you can't write a test for it, the requirement is too vague. Break it down.
4. **Implicit acceptance** — Don't assume criteria are met without running verification. Always execute the test.
5. **Over-specifying implementation** — Criteria should describe WHAT, not HOW. Don't constrain the solution approach.

---

## Quick Reference

| Need | Command |
|------|---------|
| Convert vague → testable | Use methodology above inline |
| Generate PRD template | `/prd` |
| Plan with team orchestration | `/plan-with-team` |
| Smart task routing | `/do-this` |
| Multi-tool research | `/ptc` |

---

## Tips

1. **Start with "What would a test look like?"** — If you can't write a test, it's too vague
2. **Use examples** — Show concrete input/output pairs
3. **Include the command** — Don't say "run tests", say `npm test -- specific.test.ts`
4. **Avoid ranges** — Not "fast", but "< 2 seconds"
5. **Specify error messages** — Exact text the user sees

---

## TL;DR

Convert vague requirements into specific, measurable, testable acceptance criteria. Every criterion needs a verification command and expected result. No subjective interpretation allowed.
