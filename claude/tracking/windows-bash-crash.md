---
title: MSYS2 Bash Crash (add_item Race Condition)
status: archived-custom-patch-retired
primary_issue: https://github.com/anthropics/claude-code/issues/30165
last_checked: 2026-08-23
---

## MSYS2 Bash Crash: add_item Race Condition on Windows

The historical investigation and retirement evidence are archived at:

**`.specs/archive/msys2-bash-crash/context.md`**

The custom DLL and installer were removed after the vendor runtime passed a
100-concurrent-Bash startup test without the patch. The upstream pull request
remains unmerged, so consult the archived evidence if the failure recurs.

Read that file for the error signature, root cause, the March 2026 trigger,
fix-verification details, and - most importantly - the Current State table:
several March mitigations have since drifted (the Git for Windows version
pin did not hold; nsswitch.conf reverted; the SessionStart pre-warm was
never applied). Verify against the live system before assuming any listed
mitigation still holds.

If this crash recurs, start with the dossier's "Priority action if the
crash recurs" section before re-investigating from scratch.
