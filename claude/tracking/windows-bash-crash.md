---
title: MSYS2 Bash Crash (add_item Race Condition)
status: fixed-locally-verify-on-recurrence
primary_issue: https://github.com/anthropics/claude-code/issues/30165
last_checked: 2026-07-17
---

## MSYS2 Bash Crash: add_item Race Condition on Windows

Full investigation, root cause, fix, source patch, and current-state
verification now live in one consolidated dossier shared with Pi's
feature-memory system:

**`.specs/features/msys2-bash-crash/context.md`**

Read that file for the error signature, root cause, the March 2026 trigger,
fix-verification details, and - most importantly - the Current State table:
several March mitigations have since drifted (the Git for Windows version
pin did not hold; nsswitch.conf reverted; the SessionStart pre-warm was
never applied). Verify against the live system before assuming any listed
mitigation still holds.

If this crash recurs, start with the dossier's "Priority action if the
crash recurs" section before re-investigating from scratch.
