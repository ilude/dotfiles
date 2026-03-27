---
title: MSYS2 Bash Crash (add_item Race Condition)
status: mitigated
primary_issue: https://github.com/anthropics/claude-code/issues/30165
related_issues:
  - https://github.com/anthropics/claude-code/issues/37920
  - https://github.com/anthropics/claude-code/issues/19415
  - https://github.com/git-for-windows/git/issues/493
  - https://github.com/git-for-windows/git/issues/4076
  - https://github.com/git-for-windows/git/issues/3870
last_checked: 2026-03-27
---

## MSYS2 Bash Crash: add_item Race Condition on Windows

### Error

```
Error: Exit code 3221225477 (0xC0000005)
0 [main] bash (PID) C:\Program Files\Git\bin\..\usr\bin\bash.exe:
*** fatal error - add_item ("\??\C:\Program Files\Git", "/", ...) failed, errno 1
```

### Root Cause

Race condition in Cygwin/MSYS2 shared memory mount table initialization.
When multiple bash processes start concurrently, they race to populate the
mount table via `add_item()`. The second process finds an existing immutable
`/` entry and crashes with EPERM. No mutex protects `add_item` itself —
only a spinlock at `shared_info::initialize()`.

This is a 10+ year old unfixed bug in the Cygwin runtime.

### Trigger (March 2026)

Visual Studio 2022 updated its bundled `msys-2.0.dll` on 2026-03-13.
VS ships MSYS2 runtime 3.6.x while Git for Windows (pinned at 2.48.1)
ships 3.5.7. When VS does background Git operations, its runtime writes
to the per-user shared memory with a different struct layout, corrupting
the mount table for Git Bash processes.

Three `msys-2.0.dll` versions coexist:
- Git for Windows: 3.5.7 (19 MB patched) at C:\Program Files\Git\usr\bin\
- Standalone MSYS2: 3.6.5 (3.2 MB) at C:\msys64\usr\bin\
- Visual Studio: 3.6.x (3.2 MB) at C:\Program Files\Microsoft Visual Studio\...\TeamFoundation\

Contributing factors:
- Claude Code hooks spawn ~30 bash processes/min (13 hook registrations)
- nsswitch.conf `windows` provider causes DC lookup hangs on domain machines
- Windows security updates KB5079473/KB5083532 (March 17-18) may have
  changed kernel memory management

### Mitigations Applied

1. **Pinned Git for Windows to 2.48.1** (Cygwin 3.5.x, pre-mount refactor)
2. **Windows Defender exclusion** for `C:\Program Files\Git\usr\bin`
3. **Winget pin** to prevent `winget upgrade` overriding version lock
4. **Switched hooks from `uv run` to bare `python`** (fewer processes)
5. **Switched status line to Go binary** (no bash for status bar)
6. **Removed DC lookup from Git nsswitch.conf** (`db_home: env cygwin desc`)
7. **Pre-warm bash at SessionStart** (`bash -c true` ensures mount table
   exists before parallel tool calls)
8. **Debounced log rotation** in damage-control hooks (timestamp file,
   max once per hour instead of every tool call)
9. **Install script** now fixes Git nsswitch.conf and warns about VS DLL conflict

### Still Needed

- [ ] Configure VS to use system Git (Tools -> Options -> Source Control)
- [ ] Evaluate switching hooks to PowerShell shell (eliminates all hook MSYS2 spawns)
- [ ] Add retry wrapper for bash crashes (detect 0xC0000005, retry 3x)
- [ ] Comment on claude-code#30165 with root cause analysis
- [ ] Advocate for CLAUDE_CODE_SHELL fix on Windows (#25558)
- [ ] Consider removing standalone MSYS2 at C:\msys64 if not needed

### References

- Full investigation: `.specs/bash-crash-investigation.md`
- Remediation plan: `.specs/bash-crash-remediation-plan.md`
- Cygwin source: `winsup/cygwin/mount.cc` → `create_root_entry()` → `add_item()`
- Spinlock: `winsup/cygwin/local_includes/spinlock.h` (15s timeout)
