# Systematic Debugging

**Auto-activate when:** Tests fail, errors occur, unexpected behavior, or user reports same issue twice.

---

## Core Principle: Scientific Method for Software

**From Andreas Zeller's "Why Programs Fail"**: Debugging is not a black art—it's a systematic discipline that follows the scientific method.

Research shows **hypothesis-driven debugging** produces:
- **5x improvement** in success rate for fixing defects
- **3x reduction** in time to debug
- Better root-cause discovery vs. symptom masking

> **The key insight**: Expert debuggers form explicit hypotheses and test them systematically. Novices try random permutations.

---

## The Process

```
REPRODUCE → ISOLATE → HYPOTHESIZE → TEST → FIX → VERIFY
```

### The 10-Minute Rule

If you've spent **10 minutes** on ad-hoc inspection without progress:
1. Stop
2. Document what you know
3. Switch to explicit hypothesis testing

---

### 1. Reproduce

**Before anything else, reproduce the issue reliably.**

- Run the exact command that failed
- Note the exact error message
- Confirm it fails consistently
- If intermittent, identify conditions

**Why this matters**: Without reliable reproduction, you can't know if your fix worked or you just got lucky.

### 2. Isolate

**Narrow down the problem space using systematic reduction.**

- **Binary search**: Comment out half the code, does it still fail?
- **Minimal reproduction**: What's the smallest input that triggers it?
- **Delta debugging**: Automatically reduce failing test cases to minimal examples
- **Eliminate variables**: Fresh environment? Different input? Different path?

**Cognitive principle**: Expert debuggers use "chunking"—grouping code into functional units to narrow the search space efficiently.

### 3. Hypothesize

**Form a specific, testable theory.**

Bad hypothesis: "Something's wrong with the config"
Good hypothesis: "The path normalization fails when input contains backslashes"

**Apply "Consider the Opposite"**: After forming a hypothesis, explicitly ask:
- "What would I expect to see if this hypothesis is WRONG?"
- "What other hypotheses could explain the same symptoms?"

This counters confirmation bias—the most common bias in debugging.

### 4. Test

**Test ONE hypothesis at a time.**

- Add targeted logging/prints at the suspected location
- Check variable values at key points
- Verify assumptions about input/output
- **Record your results**: Build evidence for/against the hypothesis

**Prediction first**: Before running the test, predict the outcome. If reality differs, you've learned something.

### 5. Fix

**Fix the root cause, not symptoms.**

- If you're adding special cases, you might be masking the real bug
- If the fix is complex, the diagnosis might be wrong
- Simple fixes usually indicate correct diagnosis

**5 Whys technique**: Keep asking "why did this happen?" until you reach the root cause, not just the proximate cause.

### 6. Verify

**Confirm the fix works and doesn't break other things.**

- Run the original failing case
- Run related test cases
- Check for regressions
- Add a regression test to prevent recurrence

---

## Stop Rules

### After 2 Failed Attempts: STOP

If the same error persists after two fix attempts:

1. **Acknowledge**: "This approach isn't working"
2. **Step back**: Re-read the error message from scratch
3. **Research**: Web search for the exact error
4. **Ask**: If still stuck, ask user for more context

### Random Changes = Wrong Path

If you find yourself:
- Trying random permutations
- Copying code from different sources hoping it works
- Making changes without understanding why

**STOP.** Go back to step 1 (Reproduce). You've lost the hypothesis thread.

---

## Error Message Protocol

**Read the ENTIRE error message.** Not just the first line.

| Error Part | What It Tells You |
|------------|-------------------|
| Exception type | Category of problem |
| Message text | Specific issue |
| Stack trace | Where it happened |
| Last frame | Usually the actual problem location |
| First frame | Where execution started |
| "Caused by:" | Often the real root cause |

**Common misreads:**
- Focusing on the wrapper exception, not the cause
- Missing "Caused by:" further down
- Ignoring file paths and line numbers

---

## Root Cause Analysis Frameworks

### 5 Whys

Keep asking "Why?" until you reach actionable root cause:

```
Bug: Login fails
Why? → Database query returns null
Why? → User record not found
Why? → Email lookup is case-sensitive
Why? → No normalization on insert
Why? → Requirements didn't specify case handling
ROOT CAUSE: Requirements gap
```

### Fishbone Diagram (for complex issues)

Categorize potential causes:
- **Code**: Logic errors, algorithm bugs, missing validation
- **Environment**: Configuration, permissions, dependencies
- **Data**: Invalid input, edge cases, state corruption
- **Timing**: Race conditions, timeouts, ordering

---

## Debugging Tools

| Task | Tool |
|------|------|
| See variable values | Add print/logging |
| Check execution path | Add checkpoint prints |
| Verify file contents | Read tool |
| Check process state | Bash (ps, env) |
| Test hypothesis | Minimal script |

---

## TL;DR

1. **10-minute rule**: Switch to systematic approach if ad-hoc fails quickly
2. **Reproduce first**: Can't verify fix without reliable reproduction
3. **Isolate with binary search**: Halve the problem space systematically
4. **One hypothesis at a time**: Test explicitly, record results
5. **Consider the opposite**: What would I see if my hypothesis is wrong?
6. **Stop after 2 failed attempts**: Step back and research
7. **Read the FULL error message**: Root cause is often buried

---

## Sources

- [Zeller: Why Programs Fail](https://dl.acm.org/doi/10.5555/1077048) - Systematic debugging bible
- [Hypothesizer Study (ACM UIST 2023)](https://dl.acm.org/doi/10.1145/3586183.3606781) - 5x success rate improvement
- [MIT 6.031: Debugging](http://web.mit.edu/6.031/www/fa17/classes/13-debugging/) - Scientific debugging curriculum
- [Expert vs Novice Debugging](https://www.sciencedirect.com/science/article/pii/S0020737385800547) - Chunking ability research
