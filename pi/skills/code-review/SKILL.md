---
name: code-review
description: "Evidence-based code review avoiding false positives. Triggers: code review, review code, review changes, review PR, review diff, review branch, review commit, PR review, pull request review, git diff, git show, compare changes. Activate when user asks to review code, changes, a branch, a commit, or a PR."
---

# Evidence-Based Code Review

**Invoke:** `/code-review` or mention "code review", "review changes", "review PR"

---

## Core Principle: Must vs May

Static analysis research distinguishes two types of findings:

| Type | Definition | Risk |
|------|------------|------|
| **MUST** | Issue definitely occurs on a reachable path | Real bug |
| **MAY** | Issue could occur under some hypothetical condition | Often false positive |

**The Rule:** Only flag MUST issues. If you can't prove it definitely happens, don't report it.

- **Wrong:** "This could crash if the list is empty"
- **Right:** "This crashes because caller X passes empty list at line Y"

This single principle eliminates most false positives. The techniques below help you distinguish MUST from MAY.

---

## Step 1: Scope to This Branch Only

```bash
MERGE_BASE=$(git merge-base origin/dev HEAD)
git diff $MERGE_BASE..HEAD --name-only  # Files changed
git diff $MERGE_BASE..HEAD              # Actual diff
```

**Only review code in the diff.** Pre-existing issues are out of scope—they're MAY issues for this review (may have been intentional, may be handled elsewhere).

---

## Step 2: Three Verification Pillars

Before flagging ANY issue, verify using these three techniques from static analysis research:

### Pillar 1: Path Feasibility

**Question:** Can this code path actually execute?

Many "bugs" exist on paths that are never taken:
- A guard earlier in the code prevents the dangerous case
- A type constraint makes the scenario impossible
- The caller validates before calling

**Verification:**
```bash
# Find the path to the "bug"
# Check each condition on that path
# If ANY condition is always false, the path is infeasible
```

**Real example:** `list.Substring(0, list.Length-1)` "crashes on empty" → Caller has `if (list.Any())` guard → Path to crash is infeasible → NOT a bug.

### Pillar 2: Context Completeness

**Question:** Do I have full context, or am I missing information?

False positives often come from incomplete context:
- **Interface contracts:** Parameter is part of an API signature—other implementations may use it
- **Cross-file dependencies:** Variable is validated in another file before reaching here
- **Framework guarantees:** The framework ensures non-null before calling your code

**Verification:**
- Check if the code implements an interface—respect the contract
- Check other files that interact with this code
- Check framework documentation for guarantees

**Real example:** "Parameter `scac` is unused" → It's part of interface contract, callers pass it, other implementations may use it → NOT an issue.

### Pillar 3: Interprocedural Analysis

**Question:** What happens across function boundaries?

Analyzing one function in isolation produces false positives. You must trace data flow:

1. **Find all callers** of the method
2. **Check caller guards** - does caller validate inputs?
3. **Check caller constraints** - what values can caller actually pass?
4. **Propagate guarantees** - if caller guarantees X, the callee can assume X

**Verification:**
```bash
# Find all call sites
grep -rn "MethodName(" --include="*.cs" .

# For each caller, check:
# - What guards exist before the call?
# - What values are actually passed?
# - Are there type constraints?
```

If the issue is handled by callers, it's a MAY issue (may be a problem if called differently), not a MUST issue.

---

## Step 3: The Verification Checklist

Before flagging, verify ALL:

| # | Check | Pillar |
|---|-------|--------|
| 1 | Is it in the diff? | Scope |
| 2 | Is it new to this branch? | Scope |
| 3 | Is the path feasible? | Path Feasibility |
| 4 | Do I have complete context? | Context Completeness |
| 5 | Have I checked callers? | Interprocedural |
| 6 | Is confidence > 80%? | MUST vs MAY |

**If ANY check fails, do NOT flag.**

---

## Step 4: Classification

| Category | Definition | Action |
|----------|------------|--------|
| **BLOCKER** | MUST issue—definitely occurs in this diff | Fix before merge |
| **FOLLOW-UP** | Pre-existing debt revealed by changes | Separate ticket |
| **NIT** | Style preference, technically correct code | Author's choice |
| **QUESTION** | Need clarification to determine MUST vs MAY | Ask, don't assume |

---

## Step 5: Output Format

For each issue:

```markdown
## [CATEGORY] Title

**File:** `path/to/file.cs:123`
**Confidence:** 85%

### Issue
[What MUST happen, not what COULD happen]

### Evidence
- [Path feasibility: how you verified the path is reachable]
- [Context: what callers/interfaces you checked]
- [Concrete scenario where this triggers]

### Recommendation
[Specific fix]
```

**IMPORTANT:** Do NOT include "Not Flagged" or "Verified Safe" sections. If verification proves something is not an issue, simply don't mention it.

---

## Anti-Patterns (Real-World Traps)

### The "Potential Bug" Trap
Saying "could" or "might" indicates a MAY issue. Convert to MUST or don't flag.
- **MAY:** "This could crash if X is null"
- **MUST:** "This crashes because Y passes null at line Z"

### The "Unused Parameter" Trap
Parameters in interface contracts aren't unused—they're part of the API.
- **Wrong:** "Parameter `scac` is never used"
- **Verify:** Is it part of an interface? Do callers pass it? Could other implementations use it?
- If yes to any: NOT an issue

### The "Linter's Job" Trap
Don't flag what automated tools catch: unused imports, formatting, whitespace.
These are CI/IDE concerns, not review concerns.

### The "Missing Pattern" Trap
Before claiming something violates a "standard," verify the standard exists:
```bash
grep -rn "PatternName" --include="*.cs" . | wc -l
# If < 10% of files use it, it's NOT a standard
```

### The "Scope Creep" Trap
Respect ticket scope:

| Ticket Type | Review For | Don't Flag |
|-------------|------------|------------|
| Extract/Move | Correct copy | Improvements |
| Refactor | Logic preserved | Style |
| New Feature | Correctness | Unrelated code |
| Bug Fix | Fix works | Surrounding code |

---

## Confidence Scoring

Only report at > 80% confidence:

| Factor | Impact |
|--------|--------|
| Path verified reachable | +30% |
| Callers checked | +25% |
| Concrete scenario exists | +25% |
| Pattern verified in codebase | +20% |
| Speculative/hypothetical | -50% |

---

## Quick Reference

```bash
# Scope to branch
MERGE_BASE=$(git merge-base origin/dev HEAD)
git diff $MERGE_BASE..HEAD

# Check file before changes
git show $MERGE_BASE:path/to/file.cs

# Find callers (interprocedural)
grep -rn "MethodName(" --include="*.cs" .

# Verify pattern exists (context)
grep -rn "Pattern" --include="*.cs" . | wc -l
```

---

## Sources

### Academic Foundations
- [LLM4FPM: Precise Code Context for False Positive Mitigation](https://arxiv.org/html/2411.03079v1) - Context completeness achieves 99% F1
- [LLM4PFA: Path Feasibility Analysis](https://arxiv.org/html/2506.10322v1) - Filters 72-96% of false positives
- [IEEE: Mitigating False Positive SA Warnings](https://ieeexplore.ieee.org/document/10305541/) - Comprehensive survey
- [Harvard CS252r: Interprocedural Analysis](https://groups.seas.harvard.edu/courses/cs252/2011sp/slides/Lec05-Interprocedural.pdf)
- [SMASH: Compositional May-Must Analysis](https://dl.acm.org/doi/10.1145/1706299.1706307)

### Industry Practice
- [CodeRabbit: Let the Model Reason](https://www.coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews-let-the-model-reason-within-reason)
- [Greptile: How to Make LLMs Shut Up](https://www.greptile.com/blog/make-llms-shut-up)

**Key Insight:** The MUST vs MAY distinction from static analysis theory explains why "trace backwards" and "check callers" work—they convert MAY findings into confirmed MUST issues or eliminate them entirely.
