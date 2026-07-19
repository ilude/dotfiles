---
name: multi-agent-projects
description: "Coordinating multiple concurrent agent sessions in one repo via STATUS.md and .spec/ files. Use when splitting work across parallel agent sessions or laying out a multi-agent project."
---

# Multi-agent projects

**Auto-activate when:** coordinating concurrent sessions through `STATUS.md`, `.spec/`, or session-scoped work areas.

## Project state

Use `STATUS.md` as the shared index for:

- Current phase and active objective
- Completed work
- Blockers and dependencies
- Session ownership
- Exact resume instructions

Read it before starting. Update it when ownership, status, blockers, or the next action changes.

## Specification layout

Keep detailed coordination artifacts under `.spec/`:

```text
.spec/
|-- STATUS.md
|-- plan.md
|-- decisions.md
`-- sessions/
    |-- session-a.md
    `-- session-b.md
```

Keep `STATUS.md` concise. Put implementation detail, investigation notes, and evidence in linked files.

## Session scoping

- Give each session one bounded deliverable and named files or directories.
- Avoid overlapping writes. Assign a single owner when shared files must change.
- Record dependencies before starting blocked work.
- Share conclusions and artifact paths, not full transcripts.
- Re-read shared state before integrating another session's output.
- Verify critical evidence in the integrating session.

## Handoff

Before a session stops, record:

- Completed and remaining work
- Files changed
- Validation run and results
- Blockers or unresolved decisions
- The exact next action
