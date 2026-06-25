---
name: pi-extension
description: "Pi TypeScript extension implementation and review. Use when editing or reviewing pi/extensions/*.ts, extension hooks, registerTool, registerCommand, footer/status UI, tool_result handlers, session hooks, or subprocess usage in Pi extensions. Not for slash-command placement decisions; use pi-command."
---

# Pi Extension Engineering

**Auto-activate when:** working in `pi/extensions/*.ts`, `pi/tests/*`, extension hooks, `registerTool`, `registerCommand`, footer/status rendering, `tool_result`, `session_start`, or subprocess behavior in Pi extensions.

## Boundary

| Need | Use |
| --- | --- |
| Pi extension implementation, hooks, runtime behavior, subprocess use | `pi-extension` |
| Slash-command placement or prompt-vs-extension decisions | `pi-command` |
| General TypeScript patterns and package commands | `typescript` |
| Focused existing-code edits | `least-astonishment` |

## Core Principle

Pi extensions run inside the interactive agent process. Treat render paths, status paths, hooks, and tool-result handlers as hot paths. Small subprocess calls can become visible CPU, process churn, or startup latency when repeated.

Pi docs and Pi examples are authoritative for extension behavior. Use Node docs only for runtime mechanics such as `child_process`, streams, signals, and buffers. Do not import editor-extension rules from other ecosystems unless the user explicitly asks for that comparison.

## Pi Runtime Rules

1. Keep the extension factory for registration only: `pi.on`, `pi.registerTool`, `pi.registerCommand`, `pi.registerShortcut`, `pi.registerFlag`, `pi.registerProvider`, and renderers. Runtime actions such as `pi.sendMessage()` belong in handlers, tools, or commands after Pi binds the session runtime.
2. Use `ctx.signal` for nested async work during active turn events such as `tool_call`, `tool_result`, `message_update`, and `turn_end`.
3. Clean up timers, intervals, file watchers, background work, and long-running subprocesses in `session_shutdown` or component disposal paths.
4. Use `ctx.hasUI` and `ctx.mode` before dialogs or TUI-only behavior. `ctx.hasUI` includes RPC; guard direct TUI components with `ctx.mode === "tui"`.
5. For footer/status UI, prefer `footerData`, `ctx`, and cached state over fresh discovery.
6. For custom tools that mutate files, use `withFileMutationQueue()` around the full read-modify-write window.
7. Custom tools must truncate large output and tell the caller when full output is saved elsewhere.
8. Throw from tool `execute()` to mark a failed tool result. Returning `isError: true` in a result object does not signal failure.

## Shell-Out Rules

1. Prefer `pi.exec(command, args, { cwd, timeout, signal })` for ordinary command execution. Use raw `child_process` only when Pi's wrapper does not fit the use case.
2. Do not shell out from footer render, status render, or other UI render paths unless the result is cached.
3. Prefer computing display values once per relevant key, such as cwd, model, or session id.
4. Avoid subprocesses in `tool_result` handlers unless gated by file type, output size, command type, or another cheap deterministic check.
5. Cache binary availability checks such as `where.exe`, `which`, `git --version`, or tool probes. Lazy cache is usually best for optional validators.
6. Treat `session_start` subprocesses as startup-cost risks. Network calls, `git fetch`, package-manager commands, and Python probes need timeouts and a clear reason.
7. Prefer in-process Node APIs for filesystem, path, JSON, and config reads.
8. Avoid synchronous subprocess APIs in hot paths; they block the extension event loop.
9. If a subprocess is required, use explicit args, avoid `shell: true` unless required, set `windowsHide: true` on Windows, bound it with timeout/cancellation, and either consume or ignore stdout/stderr deliberately.
10. On timeout or abort, clean up the whole child process tree. On Windows, use `taskkill /PID <pid> /T /F`; on Unix-like systems, spawn detached when appropriate and signal the process group.
11. For Windows churn investigations, use `scripts/diagnose-windows-process-churn.ps1` before guessing. Check for hot LSM/CryptSvc, stale Git LFS/MSYS helpers, orphan-like console processes, and `Tcpip` event ID `4227`.
10. On timeout or abort, clean up the whole child process tree. On Windows, use `taskkill /PID <pid> /T /F`; on Unix-like systems, spawn detached when appropriate and signal the process group.
11. For Windows churn investigations, use `scripts/diagnose-windows-process-churn.ps1` before guessing. Check for hot LSM/CryptSvc, stale Git LFS/MSYS helpers, orphan-like console processes, and `Tcpip` event ID `4227`.

## Known Bad Patterns

| Pattern | Problem | Better pattern |
| --- | --- | --- |
| `git rev-parse` inside footer render | Repeats on repaint | Cache by cwd |
| `where.exe` or `which` before every edit validator | Process churn per edit | Cache availability by binary |
| Python reducer for every Bash result | Python startup for tiny output | Skip below a byte threshold |
| `git fetch` on every reload | Startup/network cost | Run only on primary startup, timeout, skip on failure |
| Unbounded tool output | Context pressure and compaction risk | Use Pi truncation helpers and save full output when needed |
| Background interval without shutdown cleanup | Work continues after reload/session switch | Clear it in `session_shutdown` or component disposal |

## Good Pi Patterns To Prefer

| Need | Pattern |
| --- | --- |
| Fast autocomplete backed by external data | Preload once, cache a promise, filter locally |
| Footer branch display | Use `footerData.getGitBranch()` |
| Session-transition guard | Run checks in `session_before_*`, not every render |
| Long nested async work during a turn | Pass `ctx.signal` |
| Shell command from extension code | Use `pi.exec` with explicit args, cwd, timeout, and signal |
| String enum tool parameters | Use `StringEnum` from `@earendil-works/pi-ai` |
| Path parameters in custom tools | Strip a leading `@` before resolving paths |
| Extension-relative helper files | Resolve from `import.meta.url`, not process cwd |

## State And Session Rules

1. Reconstruct in-memory state on `session_start`; `/reload`, `/new`, `/resume`, and `/fork` create fresh extension instances.
2. Store extension-private state with `pi.appendEntry()` when it must survive reload/fork. Store tool state in tool result `details` when reconstruction depends on branch history.
3. Do not use captured old session-bound objects after `ctx.reload()`, `ctx.newSession()`, `ctx.fork()`, or `ctx.switchSession()`.
4. Command-only methods such as `ctx.reload()`, `ctx.newSession()`, `ctx.fork()`, and `ctx.switchSession()` belong in command handlers. From tools or events, queue a follow-up command with `pi.sendUserMessage()`.
5. Check model existence and the boolean result from `pi.setModel()` before reporting success.

## Validation

For Pi extension changes, prefer targeted validation:

```bash
cd pi/tests && pnpm test <matching-test-file>.ts
cd pi/extensions && pnpm exec tsc --noEmit --pretty false
```

Pi TypeScript is pnpm-only in this repo. Do not use bun or npm for Pi extension validation.

## Review Checklist

- Is the code path registration-time, render-time, status-time, per-token, per-tool-result, or session startup?
- Does any subprocess run more often than the user action that justifies it?
- Is availability discovery cached?
- Is small/no-op input bypassed before spawning?
- Are timeout, cancellation, and stdio behavior explicit?
- Does background work clean up on reload, shutdown, session switch, or disposal?
- Does state reconstruct from session entries or tool result details after reload/fork?
- Does tool output stay bounded and documented?
- Does the test prove the expensive call is skipped, cached, cancelled, truncated, or bounded?
