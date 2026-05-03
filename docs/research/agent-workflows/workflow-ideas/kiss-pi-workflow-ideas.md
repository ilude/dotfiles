# KISS Pi workflow ideas from agent research

## 1. Create skills from successful runs

Do not start by designing a perfect skill. Instead:

1. Run the workflow once.
2. Save the transcript/result.
3. Extract the minimum repeatable steps.
4. Add verification criteria.
5. Link it from an index.

Related: [[../patterns/markdown-skills-memory]]

## 2. Add one writable helper surface per domain

Borrow from [[../projects/browser-use-browser-harness]]:

```text
.pi/domain-workflows/<name>/
  README.md
  helpers/
  examples/
  known-failures.md
```

Keep core harnesses protected; let agents propose helper additions in a narrow directory.

Related: [[../patterns/self-healing-harnesses]]

## 3. Build status before orchestration

Before adding more parallel subagent automation, add better visibility:

- task id
- owner/agent
- status
- last update
- changed files
- needs user input
- validation status

Related: [[../patterns/agent-terminal-workspaces]]

## 4. Treat AGENTS.md as the stable contract

Keep repo-wide behavior in `AGENTS.md`; put workflow-specific detail in focused notes/skills. Avoid making global instructions absorb every one-off lesson.

## 5. Prefer explicit commands over hidden integrations

If a workflow can be expressed as a small command, use that before adding MCP/browser/plugin complexity.

Examples:

- `make test-quick`
- `just update`
- `uv run ...`
- `pi-status`

## 6. Use sandboxes selectively

Sandbox unknown or risky work, not every edit. Dotfiles work should stay local unless running untrusted code.

Related: [[../patterns/sandboxed-agent-runtimes]]

## 7. Human review gates for learned behavior

Agent-generated helpers, rules, and skills should be reviewable diffs. If a learned behavior changes execution, require a human to review it before making it default.

## 8. Minimal Obsidian vault convention

Use links and small files:

```text
README.md
index.md
projects/<project>.md
patterns/<pattern>.md
videos/<video>.md
workflow-ideas/<idea>.md
```

This keeps notes navigable for humans and retrievable for agents.
