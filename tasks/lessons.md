# Lessons Learned

---

## 2026-02-26: Windows console flashing — uv.exe in hooks

### What happened
Console windows were flashing on every Claude Code tool call on Windows. Initially attributed entirely to a Claude Code regression in v2.1.45+ (missing `windowsHide: true`). Systematic testing revealed the flashing was specifically from `uv.exe` being invoked in hook commands, not from Claude Code's internal tool calls.

### Key lessons

1. **Never edit the file that defines the hooks guarding edits.** A `replace_all` edit on `settings.json` removed `bash -c '` but left trailing `'`, breaking every hook command. Since hooks read their commands from `settings.json`, every subsequent tool call (Edit, Write, Bash) was blocked by the broken hooks. Recovery required manual intervention outside Claude Code.

2. **Isolate variables when debugging.** The breakthrough came from disabling all hooks, confirming no flashing from tool calls, then re-enabling one hook at a time with different commands (`echo`, `python`, `uv run`). This narrowed the root cause from "Claude Code is broken" to "uv.exe spawns visible console windows" in under 10 minutes.

3. **Test the simplest explanation first.** The initial analysis assumed the flashing was entirely a Claude Code bug. But the fact that v2.1.42 didn't flash with the same hooks should have prompted earlier investigation into what changed in the hook execution path, not just "they broke windowsHide."

4. **`uv.exe` is a Windows console-subsystem binary.** It allocates its own `conhost.exe` on every invocation. `uvw.exe` (the official windowless wrapper) also flashes because it spawns a child `uv.exe`. Bare `python` runs inside the existing bash process and doesn't allocate a new console. This distinction matters for any Windows subprocess work.

5. **Version pin was masking the real issue.** Pinning to v2.1.42 "fixed" the problem but prevented understanding the root cause. The actual fix (bare `python` in hooks) is version-independent and allowed unpinning.

6. **Check for duplicate binaries on PATH.** Three copies of `uv` existed (`C:\Python314\Scripts`, user Python Scripts, WinGet), each a different version. The oldest (0.9.7) was shadowing the newest. Orphaned binaries from removed Python installs can persist in PATH indefinitely.

### Patterns to apply

- When a tool/binary causes unexpected behavior on Windows, check if it's a console-subsystem vs GUI-subsystem executable
- For hooks/subprocess work on Windows, prefer commands that run inside the parent shell process over launching separate `.exe` binaries
- Before editing config files that control active hooks/linters/formatters, back up or temporarily disable them first
- When a version pin "fixes" a bug, still investigate the root cause — the pin may be hiding a simpler, version-independent fix
