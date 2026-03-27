# MSYS2 Bash Crash Investigation — Consolidated Findings

## The Error

```
Error: Exit code 3221225477 (0xC0000005)
0 [main] bash (PID) C:\Program Files\Git\bin\..\usr\bin\bash.exe:
*** fatal error - add_item ("\??\C:\Program Files\Git", "/", ...) failed, errno 1
```

## Root Cause

The crash is in `msys-2.0.dll`'s mount table initialization (`shared.cc` / `mount.cc`). When MSYS2 bash starts, it initializes a per-user shared memory region containing the mount table. The `add_item` function inserts mount entries (e.g., `C:\Program Files\Git` → `/`).

**There is NO mutex protecting `add_item` itself.** Only a spinlock at `shared_info::initialize()` level. Under concurrent spawning, multiple processes race to populate the mount table, and the second one fails with `errno 1` (EPERM) because the entry already exists.

The `\??\` prefix is normal — it's the NT kernel namespace path format used by Cygwin internally.

Exit code `0xC0000005` is not a real Windows ACCESS_VIOLATION — MSYS2's `api_fatal()` calls `_exit()` with this code. It bypasses Windows Error Reporting entirely (no Event Viewer entries, no crash dumps, no WER reports).

## Contributing Factors (Ordered by Likelihood)

### 1. Rapid Concurrent Bash Spawning (CONFIRMED — Primary Trigger)

Claude Code spawns a new bash process for every command with no rate limiting or pooling. Parallel tool calls create simultaneous bash processes that race on shared memory init.

**Our hooks amplify this massively:**
- 13 hook registrations in settings.json
- PreToolUse hooks fire before EVERY Bash/Edit/Write tool call
- Each hook spawns `bash -c "python ..."` (a bash process)
- Each hook's `spawn_log_rotation()` fires a DETACHED `subprocess.Popen` (another process)
- A single Edit operation triggers 3 hooks = 6+ processes
- Agent workflows multiply this: 10 rapid Bash commands = 20+ concurrent processes

### 2. Anti-Malware DLL Injection (LIKELY — Enterprise Environment)

Enterprise EDR/antivirus injects DLLs into every new process. If those DLLs occupy address range `0x180000000-0x180040000` (where `msys-2.0.dll` maps shared memory), `MapViewOfFileEx()` fails. This widens the race window even when it doesn't directly cause failure — Defender scanning `msys-2.0.dll` during startup adds latency to the critical section.

### 3. Fire-and-Forget subprocess.Popen in Hooks (CONFIRMED)

Three hook scripts spawn detached `log_rotate.py` processes on every invocation:
- `bash-tool-damage-control.py` (line 352-369)
- `edit-tool-damage-control.py` (line 99-116)
- `write-tool-damage-control.py` (same pattern)

These use `CREATE_NO_WINDOW | DETACHED_PROCESS` flags, survive hook timeouts, and accumulate without cleanup. Each is an additional MSYS2 process competing for shared memory.

### 4. Cygwin 3.6.x Mount Handling Refactor (MITIGATED)

Git 2.49+ ships Cygwin 3.6.x which refactored mount handling, making the race easier to trigger. **Already mitigated** by pinning Git for Windows to 2.48.1 (commit 3a88f9b). Stress test of 50 concurrent bash spawns on 2.48.1 passed cleanly.

### 5. ASLR / Mandatory ASLR (POSSIBLE)

Windows ASLR randomizes where DLLs load. If Mandatory ASLR is enabled system-wide (common in enterprise Win11), it can interfere with Cygwin's fixed shared memory addresses and fork() emulation.

### 6. Corrupted Shared Memory Segment (POSSIBLE)

If the shared memory got corrupted once, every subsequent bash spawn could fail until all MSYS2 processes are killed. The segment persists in the Windows kernel as long as any process holds a handle.

## Matching Upstream Issues

| Issue | Description | Status |
|-------|-------------|--------|
| claude-code#30165 | Exact same crash, filed 2026-03-18, v2.1.63 | OPEN |
| claude-code#37920 | bash.exe.stackdump files from same crash | OPEN |
| claude-code#19415 | Parallel bash tool execution causes freeze | OPEN |
| claude-code#25558 | CLAUDE_CODE_SHELL ignored on Windows | OPEN |
| git-for-windows/git#493 | Same add_item crash | CLOSED |
| git-for-windows/git#1135 | Same crash in Jenkins CI | CLOSED |
| msys2/MINGW-packages#11616 | add_item during parallel gem install | OPEN |

Also affects: JetBrains IDEs, Bazel CI, Ruby bundler — any tool spawning concurrent MSYS2 processes.

## Known Mitigations Already Applied

1. **Pinned Git for Windows to 2.48.1** (Cygwin 3.5.x, before mount refactor)
2. **Windows Defender exclusion** for `C:\Program Files\Git\usr\bin`
3. **Switched hooks from `uv run` to bare `python`** (eliminates extra process per hook)
4. **Switched status line to Go binary** (eliminates periodic bash+python for status bar)
5. **Winget pin** to prevent `winget upgrade` from overriding version lock

## Potential Remediation Options

### Option A: Reduce Bash Process Spawning (Hook-Side)

- Remove fire-and-forget `subprocess.Popen` from all hooks (use synchronous log rotation or batch it)
- Move non-critical checks from PreToolUse to PostToolUse
- Consolidate multiple hooks into single scripts per event
- Cache/debounce log rotation (once per session, not per tool call)

**Pros:** Under our control, reduces process count by 50%+
**Cons:** Doesn't eliminate the root cause, just reduces probability

### Option B: Switch Hooks to PowerShell

Use `shell: powershell` in hook definitions to bypass MSYS2 entirely for hooks.

**Pros:** Eliminates hook-triggered MSYS2 spawning completely
**Cons:** Need to port Python hook invocations to PowerShell wrapper; hooks still need Python

### Option C: Use `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`

Opt-in preview env var that makes Claude Code use PowerShell instead of Git Bash for the Bash tool.

**Pros:** Completely bypasses MSYS2 for all commands
**Cons:** Preview/experimental; Claude generates Unix-style commands that may fail in PowerShell; auto mode doesn't work yet

### Option D: Serialize Bash Spawning (Wrapper Script)

Create a bash wrapper that uses a file lock (mutex) to serialize process initialization, releasing the lock after mount table init completes.

**Pros:** Directly addresses the race condition
**Cons:** Serializes ALL bash startup, potential performance impact; fragile

### Option E: Clear Shared Memory Proactively

Add a SessionStart hook that kills stale MSYS2 processes before the session begins, ensuring clean shared memory.

```powershell
Get-Process | Where-Object {$_.path -like 'C:\Program Files\Git*'} | Stop-Process -Force
```

**Pros:** Prevents corrupted segment from cascading
**Cons:** Kills legitimate Git processes; doesn't prevent the race during the session

### Option F: Upstream Fix — Claude Code Process Pooling

File/advocate for Claude Code to serialize or pool bash process creation on Windows (mutex around `child_process.spawn()` for bash.exe).

**Pros:** Fixes root cause for all Windows users
**Cons:** Depends on Anthropic prioritizing this; timeline unknown

### Option G: Hybrid — Combine A + B + F

Reduce our hook footprint (A), switch hook shells to PowerShell (B), and advocate upstream (F).

**Pros:** Maximum coverage with both immediate and long-term fixes
**Cons:** Most implementation effort

## Environment Details

- Windows 11 Enterprise 10.0.26200
- Git for Windows 2.48.1 (pinned)
- GNU bash 5.2.37(1)-release (x86_64-pc-msys)
- Python 3.14 (primary), 3.13 (also on PATH)
- MSYSTEM=MINGW64, MSYS/CYGWIN env vars empty
- Mount table: standard (5 entries including SMB drive I:)
- No standalone MSYS2 or Cygwin installation (only Git for Windows)
