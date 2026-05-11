# Security Review: Pi Task Ready Dependency UX

## Findings

### MEDIUM: Dependency IDs in output may disclose sensitive task relationships or titles
- **Evidence:** Plan requires compact/detail output and `/tasks blocked` to show blocker/dependent IDs and context (`blockedBy` / `blocks`) in `pi/lib/task-renderer.ts` and `pi/extensions/tasks.ts`. Existing acceptance criteria mention redaction only for synthetic secret sentinels, not relationship metadata or task titles that may embed sensitive work context.
- **required_fix:** Ensure renderer/command output never exposes raw secrets from task titles/descriptions/metadata; apply the existing task redaction path to all ready/blocked/start rejection output and add tests covering `/tasks ready`, `/tasks blocked`, and start-blocked messages with secret sentinel values.

### MEDIUM: Missing/tombstoned blockers could be abused for denial of task progression
- **Evidence:** Plan recommends treating missing and tombstoned blockers as unmet. `/tasks start <id>` will reject unmet dependencies without mutation. A stale or manually edited dependency edge can permanently prevent starting a task.
- **required_fix:** Provide an explicit safe remediation path in the user-facing blocked/start rejection message, such as identifying missing blockers separately and pointing to an existing dependency edit/remove command or documented recovery step; add a test proving missing blockers are actionable and not silently indistinguishable from ordinary pending blockers.

### LOW: New command filters risk inconsistent authorization/visibility semantics with hidden mode
- **Evidence:** Plan adds `/tasks ready` and `/tasks blocked` while stating hidden-mode recovery behavior must remain compatible. If filters query all tasks before applying existing visibility rules, hidden/internal tasks or dependency edges may leak via ready/blocked output.
- **required_fix:** Apply the same visibility and hidden-mode filtering used by existing `/tasks` list/detail paths before rendering ready/blocked results; add regression tests where hidden tasks participate in dependencies and confirm hidden task IDs/titles do not leak in normal mode.

### LOW: Start rejection must remain non-mutating under all failure branches
- **Evidence:** Plan requires `/tasks start <id>` rejection to be non-mutating, but helper plumbing may touch `pi/lib/task-registry.ts` where task state, reverse edges, and timestamps are persisted.
- **required_fix:** Add a regression test that snapshots task files before and after a rejected start caused by unmet blockers, missing blockers, and failed blockers, verifying no state, timestamps, or reverse-edge data changes.
