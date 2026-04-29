---
description: Create logical git commits with optional push (delegated to haiku committer agent)
argument-hint: push
---

Spawn the `committer` subagent (Agent tool, `subagent_type: committer`) to perform the commit workflow. Pass `$ARGUMENTS` through as the agent's input so `push` propagates.

Do NOT run any git commands yourself. The subagent owns the entire workflow: status check, secret scan, grouping, commit message authoring, and optional push.

When the subagent returns, relay its summary (commit hashes + subject lines + push status) to the user verbatim. No additional commentary.
