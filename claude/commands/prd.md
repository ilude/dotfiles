---
description: Generate a PRD.md template for RALPH loop usage
---

# PRD Generation

Please generate a `PRD.md` file in the current directory using the following template. Ask me for the Project Name and a brief description/goal before generating it.

## Critical: Acceptance Criteria Must Be Verifiable

**Agents can only work autonomously if they can test their own work without human judgment.**

### Good vs Bad Acceptance Criteria

**✅ GOOD** (objective, testable by agent):
- "Add status column to task table with enum: active, complete, archived"
- "Login form displays 'Invalid credentials' error when auth fails"
- "API returns 404 status code when resource ID doesn't exist"
- "Search results render within 2 seconds for queries under 50 chars"
- "npm test passes with zero warnings"

**❌ BAD** (subjective, requires human judgment):
- "Make the UI look nice"
- "Improve performance"
- "Fix the bug"
- "Add better error handling"
- "Make it user-friendly"

### PRD Template

```markdown
# Project: {name}

## Context
{Brief project description and goals}

## Tasks

### Task 1: {Task Name}

**User Story**: As a {role}, I want {feature} so that {benefit}

**Acceptance Criteria**:
1. [ ] {Specific, measurable outcome}
   - Verification: {How agent can test this - command, API call, file check, test suite}
2. [ ] {Another specific outcome}
   - Verification: {How agent can test this}

**Test Commands** (optional):
- `npm test -- {test-file}.test.ts`
- `curl http://localhost:3000/api/{endpoint} | jq .status`
- `ls -la {expected-file-path}`

---

### Task 2: {Task Name}

**User Story**: As a {role}, I want {feature} so that {benefit}

**Acceptance Criteria**:
1. [ ] {Specific, measurable outcome}
   - Verification: {How agent can test this}
2. [ ] {Another specific outcome}
   - Verification: {How agent can test this}

---

## Constraints
- {Any limitations or requirements}

## Success Criteria
- All task acceptance criteria pass verification
- All tests run successfully with `{test command}`
- {Any other project-level success metrics}
```

**Tip**: If you're unsure how to make criteria verifiable, use `/acceptance-criteria` to convert vague requirements into testable ones.
