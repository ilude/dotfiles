# MSYS2 Bash Crash Remediation Plan

**Date:** 2026-03-27
**Status:** Active — crash is currently reproducible
**Root cause:** Cygwin/MSYS2 shared memory race condition in mount table init (`add_item`)
**Contributing factors:** Rapid hook-triggered bash spawning, DC lookup hangs in nsswitch.conf, 3 coexisting msys-2.0.dll versions, recent Windows security updates (KB5079473/KB5083532)

---

## Phase 1: Immediate (Today) — Reduce Crash Surface

### 1.1 Edit nsswitch.conf (MANUAL — needs admin)

Remove `windows` from `db_home` to eliminate domain controller lookup hangs during bash startup.

```
# File: C:\Program Files\Git\etc\nsswitch.conf
# Before: db_home: env windows cygwin desc
# After:  db_home: env cygwin desc
```

**Why:** On domain-joined machines, the `windows` provider triggers `DsGetDcName` which can hang 15-20s, holding the shared memory spinlock and causing all other bash processes to timeout into the race.

**Risk:** None — `HOME` env var is already set, so the `env` provider resolves before `windows` is reached.

### 1.2 Kill stale MSYS2 processes (MANUAL — once)

Clear potentially corrupted shared memory by killing all Git/MSYS2 processes:

```powershell
Get-Process | Where-Object {$_.Path -like '*\Git\*'} | Stop-Process -Force
```

**Why:** If the shared memory segment is corrupted from a previous crash, every subsequent bash spawn fails until all handles are released.

### 1.3 Pre-warm bash at SessionStart

Add a SessionStart hook that runs a single bash process to ensure the mount table is initialized cleanly before any parallel tool calls begin.

```json
{
  "matcher": "",
  "hooks": [{
    "type": "command",
    "command": "bash -c true",
    "timeout": 10
  }]
}
```

Add this as the FIRST SessionStart hook in settings.json.

**Why:** Ensures mount table exists in shared memory before hooks and tool calls create parallel bash processes. ~100ms one-time cost per session.

### 1.4 Debounce log rotation in hooks

All 3 damage-control hooks spawn a detached `subprocess.Popen` for `log_rotate.py` on EVERY tool call. 99.9% do nothing (logs only rotate after 30 days).

**Fix:** Check a `.last-rotation` timestamp file. Only spawn if >1 hour elapsed.

```python
def should_rotate() -> bool:
    ts_file = Path(__file__).parent / ".last-rotation"
    try:
        if ts_file.exists():
            age = time.time() - ts_file.stat().st_mtime
            if age < 3600:  # 1 hour
                return False
        ts_file.touch()
        return True
    except OSError:
        return False

def spawn_log_rotation() -> None:
    if not should_rotate():
        return
    # ... existing Popen code ...
```

Apply to: `bash-tool-damage-control.py`, `edit-tool-damage-control.py`, `write-tool-damage-control.py`

**Impact:** Eliminates ~30 wasted processes/hour.

---

## Phase 2: This Week — Eliminate Hook MSYS2 Spawning

### 2.1 Switch all hooks to PowerShell shell

Change hook commands in settings.json from:
```json
"command": "python $HOME/.claude/hooks/..."
```
To:
```json
"command": "pwsh -NoProfile -Command \"python $HOME/.claude/hooks/...\"",
"shell": "powershell"
```

Or if Claude Code supports `"shell": "powershell"` natively, just add the field:
```json
"command": "python $HOME/.claude/hooks/...",
"shell": "powershell"
```

**Why:** Eliminates ALL hook-triggered MSYS2 spawns. `$HOME` resolves identically in PowerShell, Python invocation works the same way. Takes hook-triggered bash processes from ~30/min to 0.

**Effort:** ~1 hour to update settings.json and test all hooks.
**Risk:** Low-medium. Need to verify `$HOME` expansion and path handling in PowerShell for each hook.

### 2.2 Add retry wrapper for bash crashes

Create a wrapper script that detects exit code 0xC0000005 and retries:

```bash
#!/bin/bash
# bash-retry-wrapper.sh
MAX_RETRIES=3
RETRY_DELAY_MS=100

for i in $(seq 1 $MAX_RETRIES); do
    "$@" && exit 0
    rc=$?
    if [ $rc -ne 3221225477 ]; then
        exit $rc  # Not the MSYS2 crash, don't retry
    fi
    sleep 0.1
done
exit $rc
```

Or better — a small Go binary that wraps bash.exe, set via `CLAUDE_CODE_GIT_BASH_PATH` (if supported).

**Impact:** Makes crashes self-healing with zero happy-path cost.

### 2.3 Investigate DLL version conflict

Three `msys-2.0.dll` versions coexist:
- Git for Windows: 3.5.7 (19 MB) — our pinned version
- Standalone MSYS2 `C:\msys64`: 3.6.5 (3.2 MB)
- Visual Studio: 3.2 MB, updated 2026-03-13

**Action items:**
- Verify no tool/script puts `C:\msys64\usr\bin` in PATH
- Check if VS update on March 13 correlates with crash onset
- Consider uninstalling standalone MSYS2 if not needed, or pinning it to same version
- Add `C:\msys64\usr\bin` to Defender exclusions if kept

### 2.4 Verify Windows Defender exclusions (needs admin)

```powershell
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
```

If `C:\Program Files\Git\usr\bin` is NOT excluded, add it:
```powershell
Add-MpPreference -ExclusionPath "C:\Program Files\Git\usr\bin"
Add-MpPreference -ExclusionPath "C:\Program Files\Git\bin"
```

**Why:** Defender scanning `msys-2.0.dll` during process startup adds latency to the shared memory critical section, widening the race window.

---

## Phase 3: Upstream Advocacy (Ongoing)

### 3.1 Comment on claude-code#30165 with root cause analysis

Share our findings:
- Exact source code path: `create_root_entry()` → `add_item("/")` → EPERM
- No mutex on `add_item`, only spinlock at `shared_info::initialize()`
- Contributing factors: hook spawning, nsswitch.conf, DLL versions
- Proposed fix: serialize/pool bash process creation on Windows

### 3.2 Request CLAUDE_CODE_SHELL fix on Windows (#25558)

This would let users fall back to PowerShell as the Bash tool shell, completely bypassing MSYS2.

### 3.3 Request bash process pooling/serialization

The ideal upstream fix: a named mutex around `child_process.spawn()` for bash.exe on Windows, or reuse a persistent bash session.

### 3.4 Monitor CLAUDE_CODE_USE_POWERSHELL_TOOL maturity

Currently experimental — auto mode doesn't work, Claude generates Unix commands that fail. Once mature, this is the nuclear option that eliminates MSYS2 entirely.

---

## Summary: Priority × Impact Matrix

| Action | Effort | Impact | Risk | Phase |
|--------|--------|--------|------|-------|
| Edit nsswitch.conf | 1 min | Medium | None | 1 (today) |
| Kill stale processes | 1 min | Medium | Low | 1 (today) |
| Pre-warm at SessionStart | 10 min | Medium | None | 1 (today) |
| Debounce log rotation | 30 min | Medium | Very low | 1 (today) |
| Switch hooks to PowerShell | 1 hour | **HIGH** | Low-med | 2 (this week) |
| Retry wrapper | 1-2 hours | **HIGH** | Low | 2 (this week) |
| Investigate DLL conflict | 1 hour | Medium | None | 2 (this week) |
| Verify Defender exclusions | 5 min | Medium | None | 2 (this week) |
| Upstream advocacy | 2 hours | **Critical** | None | 3 (ongoing) |

## Related Issues

- [anthropics/claude-code#30165](https://github.com/anthropics/claude-code/issues/30165) — Exact crash
- [anthropics/claude-code#37920](https://github.com/anthropics/claude-code/issues/37920) — Stackdump files
- [anthropics/claude-code#19415](https://github.com/anthropics/claude-code/issues/19415) — Parallel bash freeze
- [anthropics/claude-code#25558](https://github.com/anthropics/claude-code/issues/25558) — CLAUDE_CODE_SHELL ignored
- [git-for-windows/git#493](https://github.com/git-for-windows/git/issues/493) — nsswitch.conf DC lookup
- [git-for-windows/git#4076](https://github.com/git-for-windows/git/issues/4076) — Best documented add_item crash
- [git-for-windows/git#3870](https://github.com/git-for-windows/git/issues/3870) — High-concurrency msys-2.0.dll regression
