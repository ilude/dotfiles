---
name: pi-extension
description: "Pi extensions and tool policy: extensions/*.ts, hooks, registerTool, promptGuidelines, registerCommand, footer/status UI, tool_result, session hooks, or subprocesses. Not for slash-command placement; use pi-command."
---

# Pi Extension Engineering

## Boundary

| Need | Use |
| --- | --- |
| Pi extension implementation, hooks, runtime behavior, subprocess use | `pi-extension` |
| Slash-command placement or prompt-vs-extension decisions | `pi-command` |

## Core Principle

Pi extensions run inside the interactive agent process. Treat render paths, status paths, hooks, and tool-result handlers as hot paths. Small subprocess calls can become visible CPU, process churn, or startup latency when repeated.

Pi docs, Pi examples, and local Pi source/types are authoritative for extension behavior. When local Pi source or `.d.ts` files are available, inspect them before hedging about extension API behavior. Use Node docs only for runtime mechanics such as `child_process`, streams, signals, and buffers. Do not import editor-extension rules from other ecosystems unless the user explicitly asks for that comparison.

## Living Tooling Contract

Before changing public or normative Pi tooling behavior, load only its owning contract:

- [Footer and extension status](references/tooling-contracts.md#footer-and-extension-status)
- [Commit workflow](references/contracts/commit-workflow.md)
- [Damage control](references/contracts/damage-control.md)
- [Safe file mutation](references/contracts/safe-file-mutation.md)
- [Quality gates and repair](references/contracts/quality-gates.md)
- [Instruction and path context](references/contracts/instruction-context.md)
- [Interactive workflow lifecycle](references/contracts/workflow-lifecycle.md)
- [Goal and loop execution](references/contracts/goal-and-loop.md)
- [Session lifecycle and compaction](references/contracts/session-lifecycle.md)
- [Observability, transcripts, and usage](references/contracts/observability.md)
- [Provider and model lifecycle](references/contracts/provider-model-lifecycle.md)
- [Onclave integration](references/contracts/onclave.md)
- [Subagents and durable tasks](references/contracts/subagents-and-tasks.md)
- [Managed background terminals](references/contracts/background-terminals.md)
- [Session export and summaries](references/contracts/session-export.md)
- [Slash command context](references/contracts/slash-command-context.md)
- [Tool visibility and discovery](references/contracts/tool-discovery.md)
- [PowerShell](references/contracts/powershell.md)
- [Scheduler](references/contracts/scheduler.md)

Update an existing contract only when the requested change would otherwise make it inaccurate. Record accepted current behavior, remove superseded guidance, and inspect only affected callable or operator-facing surfaces. Do not update policy or documentation for implementation-only changes. Keep callable policy in the owning extension; reserve these contracts for stable cross-cutting or operator-facing semantics.

## Pi Runtime Rules

1. Keep the extension factory for registration only: `pi.on`, `pi.registerTool`, `pi.registerCommand`, `pi.registerShortcut`, `pi.registerFlag`, `pi.registerProvider`, and renderers. Runtime actions such as `pi.sendMessage()` belong in handlers, tools, or commands after Pi binds the session runtime.
2. Keep tool-specific model instructions in the owning `registerTool()` definition: use `description` and `parameters` for the callable contract, `promptSnippet` for one-line discovery, and `promptGuidelines` for behavioral guidance. Enforce mandatory behavior in `execute()` or `tool_call`; do not duplicate tool instructions in `pi/AGENTS.md`.
3. Every `registerCommand()` handler must produce immediate visible acknowledgement before its first potentially slow `await` or synchronous operation. Echo the submitted slash command for chat-dispatch workflows; use a status, loader, notification, or dialog when that better represents the command. Clear transient status in `finally`. Do not wait for repository discovery, Git, filesystem scans, subprocesses, network calls, model calls, session settling, or report generation before showing feedback.

4. Use `ctx.signal` for nested async work during active turn events such as `tool_call`, `tool_result`, `message_update`, and `turn_end`.
5. Clean up timers, intervals, file watchers, background work, and long-running subprocesses in `session_shutdown` or component disposal paths.
6. Use `ctx.hasUI` and `ctx.mode` before dialogs or TUI-only behavior. `ctx.hasUI` includes RPC; guard direct TUI components with `ctx.mode === "tui"`.
7. For footer/status UI, prefer `footerData`, `ctx`, and cached state over fresh discovery.
8. For custom tools that mutate files, use `withFileMutationQueue()` around the full read-modify-write window.
9. Custom tools must truncate large output and tell the caller when full output is saved elsewhere.
10. Throw from tool `execute()` to mark a failed tool result. Returning `isError: true` in a result object does not signal failure.
11. Preload and cache external autocomplete data, filter it locally, and run session-transition guards in `session_before_*` rather than render paths.
12. Register every `session_start` handler with `onSessionStart(pi, import.meta.url, handler)` from `pi/lib/session-start-metrics.ts`, never with direct `pi.on("session_start", ...)`. The wrapper awaits the original handler, preserves thrown errors, derives the extension name from `import.meta.url`, measures monotonic duration, and defers an `extension_session_start` event to the existing metrics JSONL with session id, reason, duration, and status. It measures handler work only; module imports and extension factories remain Pi runtime timings.
13. Use `StringEnum` from `@earendil-works/pi-ai` for string enums.
14. Strip a leading `@` from custom-tool path arguments and resolve extension-relative helpers from `import.meta.url`.

## Command output decisions

| Command shape | Immediate surface | Completion surface |
| --- | --- | --- |
| Immediate report or control-plane action | Bounded notification or result | Bounded notification/result; no editor replacement |
| Noticeable background work | `appendSlashCommandAcknowledgement()` in TUI, optionally a footer status | Bounded result or terminal notification; clear status in `finally` |
| Genuine interaction or cancellation | `ctx.ui.custom()` loader, selector, confirmation, or dashboard | The component's result and cancellation state |
| Non-TUI invocation | Existing result/error path; no TUI transcript row | Existing result/error path |

Use the shared helper when a TUI transcript acknowledgement represents submitted work:

```ts
appendSlashCommandAcknowledgement(pi, ctx, "command", args);
```

The helper appends a TUI-only custom transcript entry. It does not call `sendMessage`, trigger a turn, or alter the editor. Do not use `ctx.ui.custom()` merely to show progress. Retain it when the user must navigate, confirm, select, or cancel inside the component. Keep reports and notifications bounded, and preserve model-context boundaries. Put transient status cleanup in `finally`, including failure and early-return paths.

### Command checklist

- Classify the command as immediate report, background work, interactive UI, or control-plane/session action.
- Acknowledge before slow work starts, using the smallest appropriate surface.
- Use the shared helper only for TUI transcript acknowledgement; preserve non-TUI behavior.
- Bound results and notifications.
- Clear every transient footer status in `finally`.
- Use custom UI only for genuine interaction or cancellation.

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

## Cache-friendly extension context

When an extension contributes context to provider requests:

- Keep stable system instructions and the stable top-level tool prefix unchanged across ordinary turns.
- Put semantic goal, task, and instruction changes in one bounded trailing custom context message per owning type. Replace stale context instead of accumulating copies.
- Serialize immediate tools in deterministic order. Use provider-supported deferred discoverability for optional tools, but do not keep a tool visible when authority or workflow state requires it to be inactive.
- Treat authority transitions, state-gated visibility changes, compaction, resume, reload, fork, and instruction invalidation as legitimate cache boundaries. Reinject current context once after compaction or session reconstruction.
- Record metadata-only request-shape and provider usage metrics at the request completion boundary. Keep input, cache-read, and cache-write values unavailable when the provider did not report them; never infer quota attribution or cache savings from missing data.
- Keep `/usage` views bounded and local. Read prompt-cache metrics directly, deduplicate by existing event and session/message identity, and do not read raw transcripts for cache reporting.

## Recovery and workflow closeout

Build deterministic extension paths for normal operations, safety boundaries, and final verification - not for every unusual recovery sequence. When a local reversible operation fails, preserve its state and use the shared bounded recovery handoff to give the active model redacted facts and require fresh inspection before retry. Do not add a command-specific recovery state machine when Git, files, or another owning system already expose the current state. In-process state may coordinate transient UI but is never authoritative for durable routing or recovery.

A recovery handoff never authorizes replay, safety bypass, credential disclosure, or changes to ownership, submodules, destructive, or production boundaries. Cancellation, abort, secrets, credentials, permissions, approvals, blocked safety decisions, and production mutations do not trigger automatic recovery turns. For `/do-it`, the model performs archive, commit, and merge work in the owned context; the deterministic closeout verifier checks exact final state and cleans only the owned branch and worktree. Canonical persisted plan status controls normal routing, while conflicting repository evidence routes to reconciliation rather than implementation replay.

## Validation

Choose only the checks affected by the change; these commands are not a required sequence:

```bash
cd pi && pnpm test <matching-test-file>.ts
cd pi && pnpm run typecheck
```
