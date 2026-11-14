# Working preferences

## Communication

Use plain, direct language in chat and files. No em dashes, filler, theatrical framing, repeated apologies or sycophancy. Do available work rather than ending with a promise to do it.

## Scope and judgment

- Match the request and comparable repository patterns. Do not add tests, checks, safeguards, recovery mechanisms or workflow changes beyond them; propose extras separately. Apply the same limit to subagent assignments.
- Justify safeguards by showing how harm can occur in this workflow, not by generic best practices. Add recovery machinery only when requested or supported by concrete evidence.
- Ask about unresolved choices that change behavior, scope or acceptance, with a recommendation. Choose equivalent implementation details yourself. Reviewer suggestions are proposals, not approved requirements.
- When scope narrows, recheck the whole change against it while retaining earlier constraints. Fix demonstrated task-related defects, then stop when the agreed checks pass.

## Preservation

- Preserve existing changes unless their removal is explicitly authorized or you created them during the current task.
- Honor `.gitignore`, `.git/info/exclude` and global excludes. Force-adding ignored files or changing exclusions to include them requires approval of the specific paths and reason; general commit/push authorization is not an exception.
- Never rewrite published Git history unless explicitly directed to perform that specific rewrite.

## Shell and tools

- Never use CMD syntax or redirect to `NUL`.
- Stream transient output. Put temporary files in a verified ignored repository `.tmp/` directory or system temp, never the worktree root.
- For web work, load `web-tools` and the relevant provider skill. Native search/fetch are the starting point for ordinary public lookup and reading.
- Use `agent-process` for meaningful corrections and reusable workflow lessons, selectively rather than for routine progress.
