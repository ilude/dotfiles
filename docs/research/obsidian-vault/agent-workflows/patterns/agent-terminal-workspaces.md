# Agent terminal workspaces

## Idea

When multiple agents/tasks run in parallel, the main UX problem becomes attention management, not raw execution.

## Seen in

- ../projects/manaflow-cmux.md

## Useful primitives

- Status per pane/task.
- Notification when an agent stops or needs input.
- Quick jump to blocked/latest task.
- Visible project context: branch, directory, ports, PR.
- Browser pane beside terminal pane for web/dev feedback loops.

## KISS version for Pi

Before building GUI features, create simple terminal-friendly status artifacts:

```text
.pi/tasks/<task-id>/status.json
.pi/tasks/<task-id>/summary.md
.pi/tasks/<task-id>/needs-attention.md
```

Then add one command:

```bash
pi-status
```

It should show:

- active tasks
- last update
- blocked/needs-user-input tasks
- changed files
- test status

## Anti-patterns

- Running many agents without a dashboard.
- Treating terminal panes as state.
- Making notifications noisy instead of actionable.
