---
name: pi-extension
description: "Pi TypeScript extension implementation and review. Use when editing or reviewing pi/extensions/*.ts, extension hooks, registerTool, registerCommand, footer/status UI, tool_result handlers, session hooks, or subprocess usage in Pi extensions. Not for slash-command placement decisions; use pi-command."
---

# Pi Extension Engineering

## Boundary

| Need | Use |
| --- | --- |
| Pi extension implementation, hooks, runtime behavior, subprocess use | `pi-extension` |
| Slash-command placement or prompt-vs-extension decisions | `pi-command` |
| General TypeScript patterns and package commands | `typescript` |
| Focused existing-code edits | `least-astonishment` |

## Core Principle

Pi extensions run inside the interactive agent process. Treat render paths, status paths, hooks, and tool-result handlers as hot paths. Small subprocess calls can become visible CPU, process churn, or startup latency when repeated.

Pi docs, Pi examples, and local Pi source/types are authoritative for extension behavior. When local Pi source or `.d.ts` files are available, inspect them before hedging about extension API behavior. Use Node docs only for runtime mechanics such as `child_process`, streams, signals, and buffers. Do not import editor-extension rules from other ecosystems unless the user explicitly asks for that comparison.

## Pi Runtime Rules

1. Keep the extension factory for registration only: `pi.on`, `pi.registerTool`, `pi.registerCommand`, `pi.registerShortcut`, `pi.registerFlag`, `pi.registerProvider`, and renderers. Runtime actions such as `pi.sendMessage()` belong in handlers, tools, or commands after Pi binds the session runtime.
2. Keep tool-specific model instructions in the owning `registerTool()` definition: use `description` and `parameters` for the callable contract, `promptSnippet` for one-line discovery, and `promptGuidelines` for behavioral guidance. Enforce mandatory behavior in `execute()` or `tool_call`; do not duplicate tool instructions in `pi/AGENTS.md`.
3. Use `ctx.signal` for nested async work during active turn events such as `tool_call`, `tool_result`, `message_update`, and `turn_end`.
4. Clean up timers, intervals, file watchers, background work, and long-running subprocesses in `session_shutdown` or component disposal paths.
5. Use `ctx.hasUI` and `ctx.mode` before dialogs or TUI-only behavior. `ctx.hasUI` includes RPC; guard direct TUI components with `ctx.mode === "tui"`.
6. For footer/status UI, prefer `footerData`, `ctx`, and cached state over fresh discovery.
7. For custom tools that mutate files, use `withFileMutationQueue()` around the full read-modify-write window.
8. Custom tools must truncate large output and tell the caller when full output is saved elsewhere.
9. Throw from tool `execute()` to mark a failed tool result. Returning `isError: true` in a result object does not signal failure.
10. Preload and cache external autocomplete data, filter it locally, and run session-transition guards in `session_before_*` rather than render paths.
11. Use `StringEnum` from `@earendil-works/pi-ai` for string enums.
12. Strip a leading `@` from custom-tool path arguments and resolve extension-relative helpers from `import.meta.url`.

## Shell-Out Rules

1. Prefer `pi.exec(command, args, { cwd, timeout, signal })` for ordinary command execution. Use raw `child_process` only when Pi's wrapper does not fit the use case.
2. Do not shell out from footer render, status render, or other UI render paths unless the result is cached by a stable key.
3. Prefer computing display values once per relevant key, such as cwd, model, provider, session id, tool name, or output fingerprint.
4. Avoid subprocesses in `tool_result` handlers unless gated by file type, output size, command type, or another cheap deterministic check; skip small or no-op inputs before spawning.
5. Cache binary availability checks such as `where.exe`, `which`, `git --version`, or tool probes. Lazy cache is usually best for optional validators.
6. Treat `session_start` subprocesses as startup-cost risks. Network calls, `git fetch`, package-manager commands, and Python probes need timeouts and a clear reason.
7. Prefer in-process Node APIs for filesystem, path, JSON, and config reads.
8. Avoid synchronous subprocess APIs in hot paths; they block the extension event loop.
9. If a subprocess is required, use explicit args, avoid `shell: true` unless required, set `windowsHide: true` on Windows, bound it with timeout/cancellation, and either consume or ignore stdout/stderr deliberately.
10. On timeout or abort, clean up the whole child process tree. On Windows, use `taskkill /PID <pid> /T /F`; on Unix-like systems, spawn detached when appropriate and signal the process group.
11. For Windows churn investigations, use `scripts/diagnose-windows-process-churn.ps1` before guessing. Check for hot LSM/CryptSvc, stale Git LFS/MSYS helpers, orphan-like console processes, and `Tcpip` event ID `4227`.

## State And Session Rules

1. Reconstruct in-memory state on `session_start`; `/reload`, `/new`, `/resume`, and `/fork` create fresh extension instances.
2. Store extension-private state with `pi.appendEntry()` when it must survive reload/fork. Store tool state in tool result `details` when reconstruction depends on branch history.
3. Do not use captured old session-bound objects after `ctx.reload()`, `ctx.newSession()`, `ctx.fork()`, or `ctx.switchSession()`.
4. Command-only methods such as `ctx.reload()`, `ctx.newSession()`, `ctx.fork()`, and `ctx.switchSession()` belong in command handlers. From tools or events, queue a follow-up command with `pi.sendUserMessage()`.
5. Check model existence and the boolean result from `pi.setModel()` before reporting success.

## Validation

For Pi extension changes, prefer targeted validation:

```bash
cd pi && pnpm test <matching-test-file>.ts
cd pi && pnpm run typecheck
```
