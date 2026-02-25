---
title: Windows Console Window Flashing Regression
status: open
pinned_version: 2.1.42
primary_issue: https://github.com/anthropics/claude-code/issues/14828
comment_posted: https://github.com/anthropics/claude-code/issues/28138#issuecomment-3959696822
last_checked: 2026-02-25
---

## Windows: Console window flashing regression introduced in v2.1.45 (comprehensive tracking)

### Summary

Since v2.1.45, every tool call, hook execution, and MCP server startup on Windows spawns a visible `cmd.exe`/`conhost.exe` window that flashes on screen and steals keyboard focus. **v2.1.42 is the last version without this behavior.**

This has been reported independently by many users across 14+ issues over the past two months with no official response. Posting this as a consolidated comment with root cause analysis to hopefully get some traction.

### What happens

When Claude Code executes any tool (Bash, Grep, Glob, Read, etc.), runs a hook, or starts an MCP server, a black console window briefly appears and steals keyboard focus. If you're typing in another application, keystrokes get swallowed. If you have hooks running on every prompt or tool call, the flashing is nearly continuous. It makes Claude Code effectively unusable on Windows without pinning to v2.1.42.

### Root cause analysis

The regression aligns precisely with the introduction of the **session environment / shell snapshotting mechanism** in v2.1.45. Here's the evidence:

1. **v2.1.27** originally fixed console window flashing by adding `windowsHide: true` to `child_process.spawn()` calls
2. **v2.1.45** introduced shell snapshotting — a mechanism that captures and replays the user's shell environment. This created **new spawn call sites** that don't carry the `windowsHide: true` fix from v2.1.27
3. The error message `"Session environment not yet supported on Windows"` ([#26610](https://github.com/anthropics/claude-code/issues/26610)) confirms the feature shipped without full Windows support
4. The `onecmd` leak in `$SHELLOPTS` ([#26481](https://github.com/anthropics/claude-code/issues/26481)) shows the snapshotting mechanism uses `bash -o onecmd` to capture environment, and this flag leaks into user sessions
5. Technical investigation in [#27115](https://github.com/anthropics/claude-code/issues/27115) confirmed that `windowsHide: true` IS set in 12 places in the binary, but the ConPTY/SEA binary context causes `conhost.exe` allocation anyway — the new spawn paths introduced by shell snapshotting likely bypass or override these settings

Additional changes in v2.1.45 that may contribute:
- "Propagating API provider environment variables to tmux-spawned processes" — if env construction was refactored, spawn options may have been lost
- "Improved memory usage for shell commands that produce large output" — likely touched spawn call sites

v2.1.47 made things worse with "Fixed hooks silently failing on Windows by using Git Bash instead of cmd.exe" ([#25981](https://github.com/anthropics/claude-code/issues/25981)), which created yet another spawn path. That same version also introduced hook path mangling on Windows ([#26746](https://github.com/anthropics/claude-code/issues/26746)) where backslash separators get stripped.

### Related issues

**Primary reports:**
- [#14828](https://github.com/anthropics/claude-code/issues/14828) — Console window flashing when executing tools (9 👍, 13 comments, open since Dec 2025)
- [#27115](https://github.com/anthropics/claude-code/issues/27115) — Plugin hooks spawn visible cmd.exe/conhost.exe despite windowsHide:true
- [#28138](https://github.com/anthropics/claude-code/issues/28138) — Bash commands spawn visible black console windows
- [#20814](https://github.com/anthropics/claude-code/issues/20814) — Constant console window popups and zombie node.exe processes
- [#19391](https://github.com/anthropics/claude-code/issues/19391) — Windows popup issue

**Duplicate/related reports:**
- [#19012](https://github.com/anthropics/claude-code/issues/19012) — Hook commands cause brief console window flash (contains COMSPEC wrapper workaround)
- [#17230](https://github.com/anthropics/claude-code/issues/17230) — Feature request: add windowsHide option for hooks
- [#16880](https://github.com/anthropics/claude-code/issues/16880) — Console window flashes on every Bash tool execution (closed as dup)
- [#15572](https://github.com/anthropics/claude-code/issues/15572) — Console windows flash, missing windowsHide option (closed as dup)
- [#24708](https://github.com/anthropics/claude-code/issues/24708) — MCP stdio servers flash visible CMD windows (closed as dup)
- [#26440](https://github.com/anthropics/claude-code/issues/26440) — Bash popup at startup due to `-i` flag in cygpath call (closed as dup)
- [#21375](https://github.com/anthropics/claude-code/issues/21375) — Bun console window appears when starting Claude Code
- [#23229](https://github.com/anthropics/claude-code/issues/23229) — Persistent bun.exe terminal window with EPERM error

**Same-root-cause regressions from v2.1.45:**
- [#26481](https://github.com/anthropics/claude-code/issues/26481) — Bash tool returns exit code 1 (`onecmd` in SHELLOPTS)
- [#26610](https://github.com/anthropics/claude-code/issues/26610) — "Session environment not yet supported on Windows"
- [#26746](https://github.com/anthropics/claude-code/issues/26746) — Hook paths broken (backslash stripping)

### Workarounds

| Workaround | Effectiveness |
|------------|--------------|
| Pin to v2.1.42 + `DISABLE_AUTOUPDATER=1` | Fully works, but stuck on old version |
| Custom COMSPEC wrapper ([details in #19012](https://github.com/anthropics/claude-code/issues/19012)) | Fully works, requires compiling a C++ GUI-subsystem exe |
| Set `CLAUDE_CODE_GIT_BASH_PATH` to `C:\Program Files\Git\bin\bash.exe` | Works for some users |
| Use WSL instead of native Windows | Works but changes the whole workflow |
| Disable plugin hooks (claude-mem, etc.) | Reduces frequency but doesn't eliminate |

### What a fix probably looks like

Based on community investigation, the fix needs to ensure `windowsHide: true` (or the Win32 `CREATE_NO_WINDOW` flag) is set on **all** `child_process.spawn()` and `child_process.exec()` calls — including the ones introduced by the shell snapshotting mechanism in v2.1.45 and the hook execution path changed in v2.1.47. The MCP SDK also has a bug where `windowsHide` is conditional on `"type" in process` which only returns `true` in Electron, so it's effectively always `false` in Node.js ([#24708](https://github.com/anthropics/claude-code/issues/24708)).

### Environment

- Windows 11 (also reported on Windows 10)
- Claude Code v2.1.45+ (last working: v2.1.42)
- Affects: CLI (VS Code extension and Claude Desktop also reported in some issues but unverified)
- Terminals tested: Windows Terminal, VS Code integrated terminal, cmd.exe, PowerShell

---

### Tracking log

| Date | Action | Notes |
|------|--------|-------|
| 2026-02-25 | Initial research & comment posted | Posted consolidated analysis to [#28138](https://github.com/anthropics/claude-code/issues/28138#issuecomment-3959696822). 14+ related issues identified, no official response on any. |
