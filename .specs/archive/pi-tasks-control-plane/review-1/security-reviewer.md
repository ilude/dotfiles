---
reviewer: security-reviewer
status: complete
---
# Findings
- severity: high
  evidence: "Non-Goal: Do not persist secrets, credentials, tokens, or sensitive private data in task metadata/output" but requirements also persist execution output, metadata, dependency prompt injection, and TaskOutput retrieval with no redaction/access policy.
  required_fix: Define a concrete redaction and storage policy before planning: sensitive-field filtering, max output retention, secret-pattern scanning, opt-out for output persistence, and tests proving secrets in prompts/subagent output are not saved or re-injected.
- severity: high
  evidence: "completed prerequisite outputs can be injected into dependent prompts" and "optional auto-cascade executes newly unblocked tasks" combine persisted output with automated execution.
  required_fix: Require explicit trust boundaries for output injection: sanitize/quote prior outputs as data, disable auto-cascade by default, require user approval for dependent task execution that includes prior output, and test prompt-injection attempts from task output.
- severity: medium
  evidence: "TaskStop" is required while Risks says "Subagent cancellation unsupported" and only promises "best-effort stop and clear status messaging."
  required_fix: Specify safe stop semantics: distinguish stop-requested, stopped, failed-to-stop, and orphaned; prohibit reporting cancellation success until process/subagent state is verified; add recovery guidance for still-running background work.
- severity: medium
  evidence: "Shared task lists and file locking" is referenced, and requirements include batch creation plus DAG edges, but acceptance criteria do not test concurrent writers or lock failures.
  required_fix: Add atomic persistence requirements and tests for concurrent TaskCreateMany/TaskUpdate operations, lock timeout/error surfacing, partial batch rollback or transaction semantics, and bidirectional dependency consistency after write interruption.
- severity: medium
  evidence: Open questions leave storage scopes and deletion semantics undecided: "operator state directory only... project/session/named scopes" and "hard-delete records or mark tombstones?"
  required_fix: Resolve persistence scope and deletion policy before implementation planning. Require scoped path validation, no cross-project task leakage, tombstones or audit records for auto-clear/deletes, and rollback/recovery behavior for accidental clears.
