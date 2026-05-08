---
reviewer: reviewer
status: complete
---

## Findings

1. **Severity: High**
   **Evidence:** T1 says “`skipped` lifecycle transitions are enforced” and “allowed transitions match the PRD,” but the plan does not enumerate the actual allowed/forbidden transition matrix.
   **Required fix:** Inline the lifecycle transition table in `plan.md` or add an explicit referenced section path/anchor. `/do-it` should not need to infer behavior from the PRD during implementation.

2. **Severity: High**
   **Evidence:** T3 requires “all-or-nothing or repair-record behavior” for partial writes, leaving two materially different implementations acceptable.
   **Required fix:** Choose one required behavior before execution. Specify exact persisted state, error outcome, and recovery/repair expectations for interrupted bidirectional dependency updates.

3. **Severity: Medium**
   **Evidence:** Redaction acceptance says “representative secrets,” “common token/key patterns,” and “redacted or rejected,” but does not define required patterns or output format.
   **Required fix:** List minimum secret fixtures and expected behavior for each field class: reject vs redact, replacement token, typed outcome, and whether original values may remain in memory-only results.

4. **Severity: Medium**
   **Evidence:** T5 asks for “explicit schemas/result shapes” and “schema essentials,” but does not spell out tool input/output contracts for `TaskCreate`, `TaskCreateMany`, `TaskList`, `TaskGet`, or `TaskUpdate`.
   **Required fix:** Add concise per-tool schemas and result unions, including IDs, dependency syntax, status values, error codes, batch atomicity, and pagination/filter semantics.

5. **Severity: Medium**
   **Evidence:** The checklist says `/do-it` must mark items complete after verification, but validation evidence paths are only specified generically and task-level evidence fields start as `--`.
   **Required fix:** Define exact evidence log filenames per task/gate and require `/do-it` to update each checklist item’s `Evidence:` line with the command/log path before advancing.
