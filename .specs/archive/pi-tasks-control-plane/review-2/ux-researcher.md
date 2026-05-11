# UX Review: Pi Tasks Control Plane MVP Plan

## Findings

### 1. Severity: High — `/tasks` grammar is underspecified for operators

**Evidence:** T6 requires help to mention `list/show/create/start/complete/skip/cancel/retry/clear completed/settings or the exact implemented MVP subset`, but the plan does not define canonical command syntax, aliases, arguments, examples, or invalid-input behavior. The phrase “where feasible for MVP” leaves room for help text and implementation to diverge.

**Required fix:** Add a command grammar table before T6 with exact syntax, aliases, required/optional arguments, examples, and expected error/warning copy for unsupported or malformed commands. Make T6 acceptance criteria compare help output against that canonical grammar.

### 2. Severity: High — Display-mode defaults may hide critical operator context

**Evidence:** T4 says default compact mode shows “at most two highest-priority non-terminal tasks plus summary counts,” while T6 hides completed/cancelled/skipped tasks by default. The plan does not define what makes a task “highest-priority,” nor whether blocked/failed/running tasks must always surface. A technically correct compact renderer could hide a failed or blocked task behind two newer pending tasks.

**Required fix:** Define a deterministic visibility priority for compact mode that always surfaces urgent states first, e.g. failed/running/blocked before pending, plus explicit summary counts and a visible hint to run `/tasks all` or `/tasks show <id>` for hidden items.

### 3. Severity: Medium — Warning copy is not specified, so safe failures may still confuse users

**Evidence:** T1/T5/T6 require typed validation, persistence, redaction, and lifecycle failures, but only say rejected transitions “produce warnings.” There is no requirement that warnings explain the failed action, current state, allowed next actions, or whether data was persisted.

**Required fix:** Add UX acceptance criteria for warning format: include attempted action, task id/title when safe, reason, persistence status, and one suggested next command. Add tests for at least invalid transition, not found, redaction rejected, and persistence failed messages.

### 4. Severity: Medium — `retry` semantics are easy to misread as execution

**Evidence:** T6 says “retry reopens/marks runnable; it does not execute work,” but retry is listed beside state commands and help text. Operators may expect retry to rerun a failed task, especially because upstream has execution concepts that are deferred here.

**Required fix:** Rename or document the command as `reopen` with `retry` as an alias only if necessary, and require help/output copy to say “does not execute.” On successful retry/reopen, return a next-step hint such as “Task reopened; assign or execute manually when execution tools exist.”

### 5. Severity: Medium — Settings behavior lacks discoverability and persistence expectations

**Evidence:** The objective adds rendering/settings support for `hidden`, `compact`, and `full`, and T6 mentions `/tasks ... settings`, but the plan does not define how an operator views current mode, changes mode, whether it persists across sessions, or how to recover from `hidden` mode.

**Required fix:** Add explicit settings commands and defaults, e.g. `/tasks settings`, `/tasks settings mode compact|full|hidden`, persistence scope, confirmation or recovery hint for hidden mode, and tests proving `/tasks help` documents how to re-enable visible output.
