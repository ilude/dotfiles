# UX Researcher Review: Pi Task Ready Dependency UX

## Findings

### 1. Severity: High — "blocked" vs "waiting" is overloaded and likely confusing

**Evidence:** The plan uses multiple labels for similar concepts: objective says derive `ready` or `waiting`; command is `/tasks blocked`; T2 says compact output may include `ready`, `waiting`, `blocked`, `running`; T3 says `blocked` includes both explicitly `blocked` tasks and pending tasks waiting on blockers.

**Required fix:** Define one operator-facing vocabulary table before implementation. Recommended: use **ready** for actionable pending tasks, **waiting** for dependency-blocked pending tasks, and reserve **blocked** only as the command alias/view name if compatibility requires it. Help and list output must explain: `/tasks blocked` shows waiting tasks plus explicit blocked-state tasks.

### 2. Severity: High — blocked/start rejection output is not specified enough to be actionable

**Evidence:** T3 requires blocked output to include “unmet blocker IDs/reasons,” and T4 requires start rejection to “explain which blockers are unmet,” but there is no required format that tells the operator what to do next.

**Required fix:** Add output acceptance criteria with an actionable template, e.g. `Cannot start <task-id>: waiting on <blocker-id> (<status>) <title>. Next: run /tasks start <blocker-id> or /tasks blocked --full.` Tests should assert blocker id, status, short title/summary, and a recovery command.

### 3. Severity: Medium — compact/full/hidden mode recovery paths are underspecified

**Evidence:** The reviewer focus asks for hidden/compact/full mode recovery. The plan only says “Hidden mode behavior must remain unchanged” and “Existing /tasks, /tasks list, /tasks list --all, and hidden-mode recovery behavior must remain compatible.” It does not require help text or blocked/start errors to tell users how to escape compact/hidden ambiguity.

**Required fix:** Add acceptance criteria that help text and empty/blocked outputs include mode recovery hints, such as `Use /tasks blocked --full for blocker details` and, if hidden mode suppresses output, an explicit documented recovery command. Add tests for compact blocked output and full blocked output.

### 4. Severity: Medium — command help is mentioned but not UX-tested for discoverability

**Evidence:** T3 only says help must mention `ready`, `blocked`, and retry/reopen non-execution. It does not require examples or clarify the relationship between `/tasks`, `/tasks list`, `/tasks ready`, and `/tasks blocked`.

**Required fix:** Require help text examples for the two new operator journeys: “What can I work on now?” (`/tasks ready`) and “Why can’t this start?” (`/tasks blocked` or `/tasks blocked --full`). Tests should assert at least one example line or phrase for each journey.

### 5. Severity: Low — “terminal-success” and skipped-as-unblocking may surprise operators

**Evidence:** T1 recommends `completed` and `skipped` unblock dependencies. That may be technically valid, but “skipped” can read as “not done,” which makes downstream tasks appearing ready surprising.

**Required fix:** Make the policy visible in full/detail output or help, e.g. “Dependencies unblock when completed or skipped.” For skipped blockers, consider showing `skipped` explicitly in dependency context so operators understand why a task is ready.
