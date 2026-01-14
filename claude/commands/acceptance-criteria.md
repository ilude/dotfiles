---
description: Convert vague requirements into verifiable acceptance criteria
argument-hint: [requirement or task description]
---

# Acceptance Criteria Generator

**Purpose**: Transform subjective, vague requirements into objective, testable acceptance criteria that agents can verify autonomously.

## Core Principle

**Agents can only work autonomously if they can test their own work without human judgment.**

Good acceptance criteria:
- Are specific and measurable
- Can be verified programmatically (commands, tests, API calls)
- Have no subjective interpretation
- Include the verification method

## Workflow

### 1. Get the Requirement

If the user provided it as an argument, use that. Otherwise, ask:
"What requirement or task needs acceptance criteria?"

### 2. Analyze and Convert

For each vague aspect, ask clarifying questions to make it concrete:

**Vague Term → Clarifying Questions**

| Vague | Ask |
|-------|-----|
| "Make it faster" | "What specific metric? (response time, load time, query time)" |
| "Improve UI" | "What specific visual change? (layout, colors, spacing, component)" |
| "Better errors" | "What should the error message say? What status code?" |
| "User-friendly" | "What specific user action becomes easier? How?" |
| "Fix the bug" | "What's the expected behavior vs actual behavior?" |
| "More secure" | "What specific security measure? (auth, validation, encryption)" |

### 3. Generate Structured Criteria

Output acceptance criteria in this format:

```markdown
## Task: [Descriptive Task Name]

**User Story**: As a [role], I want [feature] so that [benefit]

**Acceptance Criteria**:
1. [ ] [Specific, measurable outcome]
   - Verification: [Exact command, test, or check agent can run]
   - Expected result: [What should happen]
2. [ ] [Another specific outcome]
   - Verification: [How to test]
   - Expected result: [What should happen]

**Test Commands**:
- `[exact command to run]`
- `[another test command]`

**Edge Cases Covered**:
- [Scenario]: [Expected behavior]
- [Scenario]: [Expected behavior]
```

### 4. Examples

#### BAD: "Make the login page better"

**Questions to ask**:
- What specific aspect needs improvement?
- What's not working currently?
- What should the end result be?

#### GOOD (after clarification):

```markdown
## Task: Add Input Validation to Login Form

**User Story**: As a user, I want immediate feedback on invalid input so that I know what to fix before submitting

**Acceptance Criteria**:
1. [ ] Email field shows error "Invalid email format" when format is incorrect
   - Verification: `npm test -- login-validation.test.ts`
   - Expected result: Test suite passes, error appears on blur with invalid email
2. [ ] Password field shows error "Password must be 8+ characters" when too short
   - Verification: Manual check or E2E test in `e2e/login.spec.ts`
   - Expected result: Error appears immediately when input loses focus
3. [ ] Submit button is disabled when either field has validation errors
   - Verification: Check DOM state with DevTools or E2E test
   - Expected result: Button has `disabled` attribute when errors present

**Test Commands**:
- `npm test -- login-validation.test.ts`
- `npm run test:e2e -- e2e/login.spec.ts`

**Edge Cases Covered**:
- Empty fields: "This field is required" message
- Valid format but wrong credentials: Server-side error displayed
- Form resubmission: Errors clear when input is corrected
```

## Common Patterns

### API Endpoints
```markdown
1. [ ] GET /api/users returns 200 with user array
   - Verification: `curl http://localhost:3000/api/users | jq '.status'`
   - Expected result: `200` status code, array in response body
```

### File Operations
```markdown
1. [ ] Script creates config file at ~/.config/app/settings.json
   - Verification: `ls -la ~/.config/app/settings.json`
   - Expected result: File exists and is valid JSON
```

### UI Components
```markdown
1. [ ] Error modal displays with red border and close button
   - Verification: Check screenshot or E2E test snapshot
   - Expected result: Modal visible, CSS class `error-modal`, close button present
```

### Performance
```markdown
1. [ ] Page load completes within 2 seconds
   - Verification: `lighthouse --only-performance http://localhost:3000`
   - Expected result: Performance score > 90
```

## Tips

1. **Start with "What would a test look like?"** - If you can't write a test, it's too vague
2. **Use examples** - Show concrete input/output pairs
3. **Include the command** - Don't say "run tests", say `npm test -- specific.test.ts`
4. **Avoid ranges** - Not "fast", but "< 2 seconds"
5. **Specify error messages** - Exact text the user sees

## Output

Present the user with:
1. The clarified requirement (if questions were needed)
2. Structured acceptance criteria ready to paste into PRD
3. Reminder: "These criteria can now be verified autonomously by agents in RALPH mode"

---

**Start now**: Ask the user what requirement needs acceptance criteria, or use the provided argument.
