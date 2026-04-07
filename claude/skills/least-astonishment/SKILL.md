---
name: least-astonishment
description: "Principle of Least Astonishment (POLA) for edit-time code changes. Activate when modifying, editing, refactoring, fixing, patching, extending, or adding to existing code — any time Claude is about to change code in an established codebase. Trigger keywords: edit, modify, change, update, refactor, fix, patch, extend, add to, integrate with, wire into, match the existing, follow the pattern, in this file, in this module, in this codebase, alongside, similar to. Do NOT activate for: greenfield, from scratch, new project, prototype, scaffold, throwaway."
---

# Principle of Least Astonishment (POLA)

**Every change should be predictable to someone familiar with the codebase.**

If a change would surprise a developer who knows the project, either:
1. Don't make it
2. Make a smaller, less surprising change
3. Explain clearly before proceeding

---

## Before Making Changes

### The Surprise Check

Ask yourself:

1. **Would this surprise someone reading a diff?**
   - Unexpected file modifications
   - Unrelated changes bundled together
   - Renamed things without clear reason

2. **Does this follow existing patterns?**
   - Check neighboring files first
   - Match naming conventions already in use
   - Use established abstractions, don't invent new ones

3. **Is the scope what was requested?**
   - No unrequested refactors
   - No "improvements" beyond the ask
   - No adding features "while I'm here"

4. **Would the function/API do what its name suggests?**
   - No hidden side effects
   - No surprising return values
   - No unexpected mutations

---

## Common POLA Violations

### Scope Creep
```
Asked: "Fix the null check in validateUser"
Did: Fixed null check + refactored 3 other functions + added logging
```
**Why surprising:** Reviewer expects a small fix, gets a large diff.

### Hidden Side Effects
```python
def get_user(id):
    user = db.find(id)
    user.last_accessed = now()  # Mutation in a "get" function
    db.save(user)
    return user
```
**Why surprising:** "get" implies read-only; this writes.

### Inconsistent Naming
```python
# Existing codebase uses:
fetch_user(), fetch_orders(), fetch_products()

# New code adds:
retrieve_customer()  # Different verb AND different noun
```
**Why surprising:** Breaks established vocabulary.

### Unexpected File Changes
```
PR title: "Update README"
Files changed: README.md, config.py, utils.py, test_utils.py
```
**Why surprising:** Unrelated files modified.

### Silent Behavior Changes
```python
# Before: returned empty list on error
# After: raises exception on error
```
**Why surprising:** Callers expecting old behavior will break.

---

## POLA-Compliant Patterns

### Minimal Diffs
Change only what's necessary. If you notice something else that needs fixing, mention it separately.

### Match Existing Vocabulary
```python
# Codebase uses "fetch_*" pattern
def fetch_payments():  # Follows convention
    ...
```

### Explicit Over Implicit
```python
# Instead of hidden side effect:
def get_user(id):
    return db.find(id)

def get_and_update_access(id):  # Name reveals behavior
    user = db.find(id)
    user.last_accessed = now()
    db.save(user)
    return user
```

### Backward-Compatible Changes
```python
# Adding parameter with default preserves existing behavior
def process(data, validate=True):  # Old callers unaffected
    ...
```

### Predictable Return Types
```python
# Always return same type
def find_users(query) -> list[User]:
    # Return [] not None when empty
    return results or []
```

---

## When Larger Changes Are Needed

Sometimes breaking POLA is necessary. When it is:

1. **Announce it** - "This will change behavior for X"
2. **Explain why** - "Current approach causes Y problems"
3. **Offer alternatives** - "We could also do Z, which is less disruptive"
4. **Get explicit approval** - Don't assume silence means consent

---

## Quick Reference

| Situation | POLA-Compliant Approach |
|-----------|------------------------|
| Fixing a bug | Fix only that bug |
| Adding a feature | Add only that feature |
| Refactoring | Only when explicitly requested |
| Renaming | Match existing conventions |
| Changing return types | Add new function, deprecate old |
| Modifying APIs | Backward-compatible by default |

---

## Integration with Other Principles

- **KISS** - Simple solutions are usually less surprising
- **DRY** - But don't create abstractions that surprise (premature DRY violates POLA)
- **Consistency** - Following patterns is core to POLA

---

## TL;DR

**Do what the code reader expects. Match existing patterns. Keep changes focused. No surprises.**

---

## AI-Assistant-Specific Anti-Patterns

LLM coding agents have a distinct set of POLA failure modes. Run this checklist before committing an edit:

1. **Drive-by reformatting** — don't touch whitespace, quote style, or import order in regions you weren't asked to change.
2. **Opportunistic renaming** — don't rename variables/functions across files when the user asked for one local fix.
3. **Idiom substitution** — don't rewrite `for` → comprehension (or vice versa) if the surrounding file uses the other style.
4. **Unrequested abstraction** — don't extract a helper/base class/config object on the first occurrence of duplication. Three similar lines beat a premature abstraction.
5. **New dependency for solved problems** — don't add a library when the file already uses a stdlib equivalent.
6. **Error-handling style drift** — don't introduce `Result`/exceptions/early-returns mid-file when the surrounding code uses a different convention.
7. **Logging vs print divergence** — don't use `print` in a module that uses a structured logger (or vice versa).
8. **Test framework drift** — don't write `unittest.TestCase` tests in a `pytest` codebase (or mix `assert` and `expect`).
9. **Silent default changes** — don't flip a kwarg default, timeout, or retry count "to be safer" without being asked.
10. **Cross-file collateral** — don't modify call sites, types, or fixtures beyond the file the user pointed at without flagging it first.

If you catch yourself about to do any of these, stop and either (a) make the smaller edit, or (b) surface the broader change to the user before proceeding.

---

## References

- Raymond, E. S. *The Art of Unix Programming* — Rule of Least Surprise: <https://www.catb.org/~esr/writings/taoup/html/ch11s01.html>
- Wikipedia — *Principle of least astonishment*: <https://en.wikipedia.org/wiki/Principle_of_least_astonishment>
- DevIQ — *Principle of Least Astonishment*: <https://deviq.com/principles/principle-of-least-astonishment/>
