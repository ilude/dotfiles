---
description: Create logical git commits
argument-hint: [push] [paths...]
---

Spawn the `committer` subagent (Agent tool, `subagent_type: committer`) to perform the commit workflow. Pass `$ARGUMENTS` through as the agent's input so `push` and any explicit paths propagate.

Modes:
- `/commit` — group dirty working tree into logical commits.
- `/commit push` — group commits, then push.

Do NOT run any git commands yourself. The subagent owns the entire workflow: status check, secret scan, grouping, commit message authoring, final `git status --short` confirmation, and optional push.

When the subagent returns, relay its summary (commit hashes + subject lines + push status + final status result) to the user verbatim. No additional commentary.
