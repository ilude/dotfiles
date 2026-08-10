# Pi Tooling Contracts

This index records stable public and normative semantics for Pi extensions and tools. Read and update only the contract that owns the behavior being changed. Keep only the accepted current state here; Git history preserves superseded decisions.

## Ownership

- The owning extension defines each tool's callable contract and model guidance.
- Keep callable details in the owning extension. These contracts hold only stable cross-cutting or operator-facing semantics that are not already clear from the callable contract.
- When changed semantics would make an existing contract inaccurate, update that contract and only the affected callable or operator-facing surfaces. Do not add contract or documentation churn for implementation-only changes.
- Use tests for executable behavior, not as the primary store for design intent or policy prose.

## Contract index

- [Footer and extension status](#footer-and-extension-status)
- [Subagents and durable tasks](contracts/subagents-and-tasks.md)
- [Managed background terminals](contracts/background-terminals.md)
- [Session export and summaries](contracts/session-export.md)
- [Slash command context](contracts/slash-command-context.md)
- [Tool visibility and discovery](contracts/tool-discovery.md)
- [Feature memory](contracts/feature-memory.md)
- [PowerShell](contracts/powershell.md)
- [Scheduler](contracts/scheduler.md)

## Footer and extension status

- The primary footer line owns directory, branch, model, reasoning level, context usage, Pi version, reload state, and the right-anchored provider quota when available.
- Render context usage after the model reasoning level as its own ` | `-delimited segment. Omit it when usage is unavailable.
- One-line extension health belongs in `ctx.ui.setStatus()`, not a below-editor widget. The custom footer renders those statuses on a second line.
- Render Onclave status as `Onclave: <client> | Peers: N`. Color only the client name: green while connected and red otherwise.
- Render token-throughput status after Onclave and the other left-side extension statuses.
- Keep compact Bedrock spend right-aligned as the final second-line segment.
- Reserve below-editor widgets for content that is not footer status.
