# Systematic Debugging

**Auto-activate when:** Tests fail, errors occur, unexpected behavior, or user reports same issue twice.

## The Process

```
REPRODUCE → ISOLATE → HYPOTHESIZE → TEST → FIX → VERIFY
```

### 1. Reproduce

**Before anything else, reproduce the issue reliably.**

- Run the exact command that failed
- Note the exact error message
- Confirm it fails consistently
- If intermittent, identify conditions

### 2. Isolate

**Narrow down the problem space.**

- **Binary search**: Comment out half the code, does it still fail?
- **Minimal reproduction**: What's the smallest input that triggers it?
- **Eliminate variables**: Fresh environment? Different input? Different path?

### 3. Hypothesize

**Form a specific, testable theory.**

Bad hypothesis: "Something's wrong with the config"
Good hypothesis: "The path normalization fails when input contains backslashes"

**Ask:**
- What changed recently?
- What's different between working and failing cases?
- What does the error message actually say?

### 4. Test

**Test ONE hypothesis at a time.**

- Add targeted logging/prints at the suspected location
- Check variable values at key points
- Verify assumptions about input/output

### 5. Fix

**Fix the root cause, not symptoms.**

- If you're adding special cases, you might be masking the real bug
- If the fix is complex, the diagnosis might be wrong
- Simple fixes usually indicate correct diagnosis

### 6. Verify

**Confirm the fix works and doesn't break other things.**

- Run the original failing case
- Run related test cases
- Check for regressions

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

**STOP.** Go back to step 1 (Reproduce).

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

**Common misreads:**
- Focusing on the wrapper exception, not the cause
- Missing "Caused by:" further down
- Ignoring file paths and line numbers

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

Reproduce first. Isolate with binary search. One hypothesis at a time. Stop after 2 failed attempts and research. Read the FULL error message.
