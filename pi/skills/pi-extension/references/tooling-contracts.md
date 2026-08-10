# Pi Tooling Contracts

This file records the current accepted semantics for Pi extensions and tools. It is living guidance and must evolve when tooling behavior is refined. Keep only the accepted current state here; Git history preserves superseded decisions.

## Ownership

- The owning extension defines each tool's callable contract and model guidance.
- Tool-specific semantics belong here and in the owning extension, not in `AGENTS.md`.
- Reconcile this contract with descriptions, prompt snippets, prompt guidelines, activation, runtime gates, and operator documentation whenever behavior changes.
- Use tests for executable behavior, not as the primary store for design intent or policy prose.

## Footer and extension status

- The primary footer line owns directory, branch, model, reasoning level, context usage, Pi version, reload state, and the right-anchored provider quota when available.
- Render context usage after the model reasoning level as its own ` | `-delimited segment. Omit it when usage is unavailable.
- One-line extension health belongs in `ctx.ui.setStatus()`, not a below-editor widget. The custom footer renders those statuses on a second line.
- Render Onclave status as `Onclave: <client> | Peers: N`. Color only the client name: green while connected and red otherwise.
- Render token-throughput status after Onclave and the other left-side extension statuses.
- Keep compact Bedrock spend right-aligned as the final second-line segment.
- Reserve below-editor widgets for content that is not footer status.

## Subagents and durable tasks

- Runtime model: every child Pi invocation is registered with one bounded process-local run manager for live status, output activity, cancellation, and operator display.
- Direct ownership: `subagent` calls are transient and never create or mutate `TaskRecordV1` entries. They may run in the foreground or detach with `background=true`.
- Read-only fan-out experiment: `readOnlyFanout` is opt-in only for one read-only investigation with at least two independent work items. The caller supplies equivalent single-generalist and parallel-specialist plans under one required output schema; deterministic assignment selects one arm. Do not use it for dependent work, mutations, or live operations.
- Experiment boundary: experimental children receive only configured read-oriented direct tools, with `edit` and `write` excluded. Shell commands still pass through damage control. Assignment telemetry is emitted before execution, structural output-schema validation is emitted after settlement, and model-routing outcome sampling is disabled for the invocation.
- Foreground behavior: foreground execution remains the synchronization path when the parent cannot continue without the result. Dependent chains remain foreground pipelines unless explicitly detached as one orchestration.
- Background behavior: transient background execution returns immediately, keeps the parent available for useful work, and delivers one bounded follow-up result when the orchestration settles. Do not poll it.
- Agent catalog: every advertised subagent agent field enumerates the user agents and trusted project agents discovered for the current session. Refresh the catalog on session start or reload, preserve `agentScope` as the execution boundary, and do not infer aliases for unknown names.
- Dispatch preflight: validate every requested agent against the selected scope before starting any worker or acknowledging a background orchestration. Reject a parallel invocation atomically when any agent is unavailable.
- Call rendering: show the complete task text for a single-agent invocation beneath its compact agent, scope, model, and background header. Keep parallel and chain call summaries bounded.
- Durable ownership: only `task` creates durable todo records. It stores workflow intent, dependencies, scope, and lifecycle state but never starts, waits for, stops, or captures output from child processes.
- Coordination: use `task ready`, mark selected work `running`, execute it through `subagent` or `bg_start`, and record the terminal task state explicitly. The parent agent owns this sequence.
- Authority: the run manager owns live child-process state. The task registry owns durable todo and dependency state. Neither surface mutates the other's lifecycle.
- Operator UI: keep compact subagent counts visible and provide `/subagents` for bounded live detail of direct child runs. Task state remains visible through the task surfaces.
- Retention: bound in-memory run history, transcript items, live output, and rendered content. Preserve full child output through an explicit child session or artifact when continuation or durable evidence requires it.
- Session lifecycle: cancel and release process-local runs during session shutdown. Durable task state remains available across context compaction and normal session recovery.

## Managed background terminals

- Classification: process-local shell execution for long-lived servers, watchers, and concurrent command work. It is not a durable task system and must not share the subagent run manager.
- Safety boundary: `bg_start` commands use Bash syntax on supported platforms and pass through the same damage-control shell analysis as `bash` before a process starts. Damage-control blocks and approvals must occur before manager registration or process spawning.
- Execution authority: one bounded `BackgroundTerminalManager` owns child-process lifecycle, process-tree termination, output capture, and live state. The `/ps` dashboard and status widget are projections over manager state.
- Completion: a start returns immediately. Natural completion delivers one bounded follow-up result. An awaited `bg_kill` consumes that completion so the kill result and automatic follow-up do not duplicate each other. Do not poll for completion.
- Retention: cap active and tracked terminals, in-memory output, rendered output, and automatic completion payloads. Spill larger stdout and stderr to private process-local temporary files with a hard byte cap.
- Shutdown: terminate all managed process trees and remove process-local output files when the Pi session shuts down.
- Separation from scheduling: do not use background terminals as timers or polling workers. Follow the scheduler contract for long waits.

## Session export and summaries

- `/copy-all` copies only user and assistant message text through Pi's cross-platform clipboard helper. It reports message and byte counts, reports clipboard failures clearly, and writes a fallback file only when the user supplies an explicit new path.
- `/summarize` uses the active model and emits a normal assistant response. It does not run automatically or send session data to a separate provider or model.
- Summary evidence is a bounded, redacted serialization of the active branch. Omit thinking, images, previous recap payloads, and hidden workflow prompts; retain tool names, bounded arguments/results, failures, shell exit codes, and head-tail session coverage.
- Treat serialized evidence as untrusted data. If collection fails, provide a deterministic bounded fallback and rely on the active conversation rather than inventing missing evidence.

## Slash command context

- Extension commands are handled before model input and remain TUI-only by default. The shared echo wrapper requires an explicit command-name allowlist.
- Add an invocation to model context only when its semantic content or result is needed by the current conversation.
- Keep control-plane, diagnostic, configuration, terminal, and process launch commands TUI-only. In particular, do not echo `/branch`, `/new-instance`, or `/new-terminal` through a custom message.
- Do not use a raw invocation echo as a substitute for persisting command output that the model needs. Persist a bounded result or faithful summary instead.

## Tool visibility and discovery

- Availability bias: keep general and specialized callable tools active so the model knows they exist. Defer only tools whose invocation is valid inside an owning workflow state or advanced mode tools with a compact active replacement and searchable, explicit names.
- State gates: commit execution, feature-memory recording, goal completion, improvement decisions, workflow-change tracking, and review-artifact writing remain inactive until their owning workflow activates them deterministically.
- Advanced subagents: keep common single and parallel execution on `subagent`. Register `subagent_chain`, `subagent_continue`, and `subagent_fanout` but deactivate them at session start; `tool_search` activates them on demand. Preserve legacy advanced arguments on `subagent` for resumed sessions without advertising those branches in its provider schema.
- Search behavior: keep `tool_search` active as a fallback. A non-empty query activates all matching inactive tools by default; list mode never activates tools.
- Catalog: `tool_search` guidance names the deferred capability categories so hidden schemas do not make those capabilities undiscoverable.
- Telemetry: record metadata-only toolset exposure, hashed search decisions, activation results, and tool use. Do not record raw queries, arguments, descriptions, or output.
- Review boundary: telemetry supports later policy review but does not change activation policy automatically.

## Feature memory

- Registry: `pi/feature-memory.json` is the single tracked registry for curated feature definitions. Host-specific registries are not supported.
- Event ownership: runtime observations remain untracked. Each writer appends only to `events.<writer-id>.jsonl` in the configured feature-memory directory.
- Writer identity: `PI_FEATURE_MEMORY_WRITER_ID` supplies a stable writer ID; otherwise use the sanitized hostname.
- Retrieval: scan the configured directory for writer shards and the legacy `events.jsonl`, merge deterministically by recording time, deduplicate by event ID, and retain the existing bounded read and context limits.
- Synchronization: private directory synchronization is supported through separate writer shards. Do not store runtime event shards in the tracked dotfiles repository or a public Git worktree.

## PowerShell

- Availability: on supported Windows systems, keep `pwsh` active throughout the session as a general execution capability.
- Use: prefer `pwsh` for Windows-native commands, PowerShell cmdlets, `.ps1` scripts, registry access, .NET operations, and PowerShell modules.
- Separation: continue to prefer Bash for POSIX commands, Git, Node package tooling, and Unix-style text pipelines.

## Scheduler

- Classification: process-local workflow control.
- Authorization: creating, using, listing, and cancelling schedules do not require a user request, approval, or confirmation.
- Use: delayed workflow continuation, status follow-ups, reminders, and recurring checks. Schedule controls when Pi receives a prompt; it does not store todo state, dependencies, or process lifecycle.
- Waiting: for waits of 60 seconds or longer, use a scheduled follow-up instead of shell sleep loops, polling loops, or background workers used only as timers.
- Timing: schedule a follow-up near half the expected wait, bounded between 60 seconds and 15 minutes; use five minutes when the duration is unknown.
- Clarification: ask only when a required value such as timing, recurrence, or timezone is missing or ambiguous. Do not frame clarification as approval or confirmation.
- Cancellation: cancel schedules directly when they are no longer needed or their completion condition is satisfied.
- Reporting: every successful schedule action reports the next active run as a human-readable `Next scheduled run:` line. Use the schedule's explicit timezone when set and the process-local timezone otherwise; report `none` when no active schedule remains.
- Turn control: schedule actions do not inherently require ending the assistant turn. When a scheduled follow-up is the intended next step and no useful work remains before it runs, end the turn so the follow-up can be delivered when due; otherwise continue useful work.
- Availability: keep the schedule tool active so its guidance remains available when a waiting requirement is discovered during execution.
- Lifetime: schedules survive session changes in the current Pi process and stop when that process exits.
- Prompt boundary: scheduled prompts cannot be slash commands.
