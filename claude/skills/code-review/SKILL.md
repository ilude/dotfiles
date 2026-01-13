---
name: code-review
description: |
  Evidence-based code review that avoids false positives. Invoke with `/code-review` or trigger keywords: code review, review changes, review PR, review diff.
  Based on research from CodeRabbit, Greptile, and academic papers on reducing AI code review false positives.
---

# Evidence-Based Code Review

**Invoke:** `/code-review` or mention "code review", "review changes", "review PR"

**Philosophy:** Finding issues is easy. Finding issues WORTH FIXING is hard.

---

## CRITICAL: The False Positive Problem

Up to 40% of AI code review alerts are ignored due to false positives. This skill prevents the most common causes:

| False Positive Type | How This Skill Prevents It |
|---------------------|---------------------------|
| Pre-existing issues flagged as new | Scope to diff only with `git merge-base` |
| "Bugs" that can't happen | Verify call sites and type constraints |
| Assumed "standards" | Check if pattern exists elsewhere in codebase |
| Out-of-scope improvements | Respect ticket scope (extract vs refactor) |
| Speculative issues | Require 80%+ confidence to report |

---

## Step 1: Scope to THIS Branch's Changes Only

```bash
# CRITICAL: Get changes specific to THIS branch
MERGE_BASE=$(git merge-base origin/dev HEAD)
git diff $MERGE_BASE..HEAD --name-only  # Files changed
git diff $MERGE_BASE..HEAD              # Actual diff
```

**Never review code that isn't in the diff.** Pre-existing technical debt is out of scope.

---

## Step 2: Pre-Flag Checklist (5 Points)

Before flagging ANY issue, verify ALL of the following:

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | **Is it in the diff?** | Only lines with `+` or `-` in `git diff` |
| 2 | **Is it new?** | Compare to `git show MERGE_BASE:path/to/file` |
| 3 | **Can it actually happen?** | Find and check ALL call sites |
| 4 | **Is it a documented standard?** | Search codebase for pattern usage |
| 5 | **Confidence > 80%?** | If speculative, don't report |

**If ANY check fails, do NOT flag the issue.**

---

## Step 3: Classification System

Use these categories (not just "bug" or "issue"):

| Category | Definition | Action |
|----------|------------|--------|
| **BLOCKER** | New bug/security issue in THIS diff | Must fix before merge |
| **FOLLOW-UP** | Pre-existing debt revealed by changes | Create separate ticket |
| **NIT** | Stylistic/educational, technically correct | Optional, author's choice |
| **QUESTION** | Need clarification, not a suggestion | Ask, don't assume |

---

## Step 4: Verification Protocols

### For Potential Bugs
```bash
# Find all call sites
grep -rn "FunctionName(" --include="*.cs" .

# Check each caller for guards
# Does the caller validate inputs?
# Does the caller handle the error case?
```

### For "Missing" Patterns
```bash
# Before claiming something is "standard", verify:
grep -rn "PatternName" --include="*.cs" . | wc -l
# If < 10% of files use it, it's NOT a standard
```

### For Code Duplication
```bash
# Is duplication NEW or pre-existing?
git show $MERGE_BASE:path/to/original.cs | grep -A 20 "duplicated code"
```

---

## Step 5: Output Format

For each issue found:

```markdown
## [CATEGORY] Title

**File:** `path/to/file.cs:123`
**Confidence:** 85%

### Issue
[Specific problem description]

### Evidence
- [Concrete evidence from code/diff]
- [Call site analysis results]
- [Pattern search results]

### Recommendation
[Specific, actionable fix]
```

---

## Anti-Patterns to Avoid

### The "Potential Bug" Trap
- **Wrong:** "This could crash if X is null"
- **Right:** "This WILL crash because caller Y passes null at line Z"

### The "Best Practice" Trap
- **Wrong:** "Should use logging for audit trail"
- **Right:** "Other methods in this class use LogEmail() at lines X, Y, Z"

### The "Code Smell" Trap
- **Wrong:** "This method is too long"
- **Right:** "BLOCKER: This condition is never true due to type constraint"

### The "Scope Creep" Trap
- **Wrong:** "While we're here, let's also refactor..."
- **Right:** "This ticket is extract-only. Refactoring is FOLLOW-UP."

---

## Understanding Ticket Scope

| Ticket Type | What to Review | What NOT to Flag |
|-------------|----------------|------------------|
| **Extract/Move** | Code was copied correctly | Code improvements |
| **Refactor** | Logic is preserved | Style preferences |
| **New Feature** | Correctness, edge cases | Unrelated code |
| **Bug Fix** | Fix is correct, no regression | Surrounding code |

---

## Confidence Scoring

Only report issues with confidence > 80%. Calculate based on:

| Factor | Impact on Confidence |
|--------|---------------------|
| Evidence from diff | +30% |
| Call site verified | +25% |
| Reproducible scenario | +25% |
| Pattern verified in codebase | +20% |
| Speculative/hypothetical | -50% |

---

## Multi-Agent Review (Recommended)

For significant reviews, use parallel agents:

```
Agent 1: Diff-Only Bug Hunter
- Only looks at changed lines
- Checks for actual bugs, not style

Agent 2: Call Site Verifier
- For each flagged issue, verify callers
- Downgrade issues that callers handle

Agent 3: Standards Auditor
- Verify any claimed "standards" against codebase
- Only flag violations of verified patterns
```

---

## Quick Reference

```bash
# Get merge base
MERGE_BASE=$(git merge-base origin/dev HEAD)

# View diff
git diff $MERGE_BASE..HEAD

# View specific file before changes
git show $MERGE_BASE:path/to/file.cs

# Find callers
grep -rn "MethodName(" --include="*.cs" .

# Check pattern frequency
grep -rn "Pattern" --include="*.cs" . | wc -l
```

---

## Sources

This skill is based on research from:
- [CodeRabbit: Pipeline AI vs Agentic AI](https://www.coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews-let-the-model-reason-within-reason)
- [Greptile: How to Make LLMs Shut Up](https://www.greptile.com/blog/make-llms-shut-up)
- [Academic: Multi-review aggregation +43.67% F1](https://arxiv.org/abs/2509.01494)
- [Academic: 80% confidence threshold](https://arxiv.org/abs/2402.00905)
- [ACM: Support, Not Automation](https://dl.acm.org/doi/abs/10.1145/3696630.3728505)

**Key Insight:** "The definition of a 'nit' is subjective and varies from team to team." - Greptile
