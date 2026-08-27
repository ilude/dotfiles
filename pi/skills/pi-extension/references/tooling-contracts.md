# Pi Tooling Contracts

This index records stable public and normative semantics for Pi extensions and tools. Read and update only the contract that owns the behavior being changed. Keep only the accepted current state here; Git history preserves superseded decisions.

## Ownership

- The owning extension defines each tool's callable contract and model guidance.
- Keep callable details in the owning extension. These contracts hold only stable cross-cutting or operator-facing semantics that are not already clear from the callable contract.
- When changed semantics would make an existing contract inaccurate, update that contract and only the affected callable or operator-facing surfaces. Do not add contract or documentation churn for implementation-only changes.
- Use tests for executable behavior, not as the primary store for design intent or policy prose.

## Contract index

- [Footer and extension status](#footer-and-extension-status)
- [Cache-friendly extension context](contracts/cache-friendly-extension.md)
- [Commit workflow](contracts/commit-workflow.md)
- [Damage control](contracts/damage-control.md)
- [Safe file mutation](contracts/safe-file-mutation.md)
- [Quality gates and repair](contracts/quality-gates.md)
- [Instruction and path context](contracts/instruction-context.md)
- [Interactive workflow lifecycle](contracts/workflow-lifecycle.md)
- [Goal and loop execution](contracts/goal-and-loop.md)
- [Session lifecycle and compaction](contracts/session-lifecycle.md)
- [Observability, transcripts, and usage](contracts/observability.md)
- [Provider and model lifecycle](contracts/provider-model-lifecycle.md)
- [Onclave integration](contracts/onclave.md)
- [Subagents and durable tasks](contracts/subagents-and-tasks.md)
- [Managed background terminals](contracts/background-terminals.md)
- [Session export and summaries](contracts/session-export.md)
- [Slash command context](contracts/slash-command-context.md)
- [Tool visibility and discovery](contracts/tool-discovery.md)
- [PowerShell](contracts/powershell.md)
- [Scheduler](contracts/scheduler.md)

## Cache-friendly extension context

- Stable provider system instructions and the deterministic immediate-tool prefix are the default cache-friendly boundary for ordinary requests.
- Goal, task, and nested instruction context is trailing, bounded, hidden custom context with one replaceable message per owner. Replacement is semantic and removes stale content.
- Provider-supported deferred tools may remain discoverable without changing the immediate prefix. Authority and workflow state gates are exceptions: an unauthorized or inactive tool must remain invisible even when that creates a cache boundary.
- The `openai-codex` extension records one metadata-only `prompt_cache_request` event per completed provider response. It joins provider-reported `input`, `cacheRead`, and `cacheWrite` values with model and request-shape change flags; missing values remain `unavailable`.
- `/usage` reads only a bounded recent metrics window, deduplicates event IDs and existing session/message identity, and reports observed local cache reads and writes. It does not read raw transcripts or attribute account quota changes to individual requests.
- Compaction, resume, reload, fork, cwd or instruction invalidation, and authority transitions are expected cache boundaries. After compaction or reconstruction, current context is injected once rather than accumulated.

## Footer and extension status

- The primary footer line owns directory, branch, model, reasoning level, context usage, Pi version, reload state, and the right-anchored provider quota when available.
- Render only the concise model name. Omit provider, region, and vendor-family prefixes such as `anthropic.claude-`.
- Render context usage after the model reasoning level as its own ` | `-delimited segment. Omit it when usage is unavailable.
- One-line extension health belongs in `ctx.ui.setStatus()`, not a below-editor widget. The custom footer renders those statuses on a second line.
- Render Onclave status as `Onclave[N]: <client>`, where `N` is the peer count. Color only the client name: green while connected and red otherwise.
- When a process-local schedule exists, render its next run immediately after Onclave as `sched@ <time>` using the schedule's applicable timezone and a compact lowercase 12-hour time. Omit the segment when no schedule exists.
- At narrow widths, preserve reload, failure, context-pressure, and provider-quota feedback before model identity, Pi version, branch, or directory details. Extension failures sort ahead of routine task and throughput statuses.
- Render token-throughput status after Onclave and the other left-side extension statuses.
- Keep compact Bedrock spend right-aligned as the final second-line segment.
- Reserve below-editor widgets for content that is not footer status.
