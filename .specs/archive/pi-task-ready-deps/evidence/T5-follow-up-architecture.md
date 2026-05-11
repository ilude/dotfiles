# T5 follow-up architecture

## Option 2: dependency tree renderer

A future dependency tree view can layer on the new snapshot-based readiness helpers without changing persistence. The renderer can build a topological ordering from `blockedBy` / `blocks`, then display an indented dependency tree with a ready queue section for pending tasks whose blockers are all `completed` or `skipped`. Integration should stay in renderer modes and command views (for example `/tasks tree`) so compact/full output remains stable.

## Option 3: workflow engine-lite

A future workflow engine layer can observe readiness transitions for auto-unblock, cascade status updates, and deferred execution hooks. It must preserve current guardrails: automatic execution is not implemented today, `task_execute` remains deferred/non-executing, and any cascade/execution behavior should require explicit scheduling, cancellation, and user-risk policies before it can affect tasks automatically.
