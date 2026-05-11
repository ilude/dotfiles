# Product Manager PRD Readiness Review

## Finding 1
severity: high
evidence: The PRD imports nearly every upstream feature: 8 tools, widget modes, dependency DAG execution, output injection, auto-cascade, stop controls, orphan detection, storage questions, stats, batch create, corrupt-file recovery, and settings. This is framed as one feature instead of an MVP.
required_fix: Split into MVP and later phases. MVP should likely be registry schema compatibility, TaskCreate/List/Get/Update, `/tasks` filtering fix, and minimal dependency blocking. Defer widget modes, auto-cascade, TaskExecute/Stop, output injection, and advanced recovery unless tied to an immediate user workflow.

## Finding 2
severity: high
evidence: The problem statement says the repo lacks the “full Claude Code-style task coordination experience,” but does not prove which missing capability currently blocks the user. It treats upstream parity as the value proposition.
required_fix: Replace parity framing with 1–2 concrete jobs and success outcomes. Example: “agents lose task state across subagent calls” or “operator cannot see active delegated work.” Remove requirements not necessary to satisfy those jobs before `/plan-it`.

## Finding 3
severity: medium
evidence: `TaskExecute`, `TaskStop`, subagent cancellation, output retrieval, token stats, timeout/budget display, and auto-cascade imply runtime orchestration beyond task tracking. The PRD admits stop may be partial but still includes it in core acceptance.
required_fix: Defer execution orchestration from the first plan. Specify a control-plane-only MVP that records intent/status/output from callers. Add execution/stop/cascade as a separate PRD after proving registry and tool ergonomics.

## Finding 4
severity: medium
evidence: Acceptance criteria duplicate `TaskCreateMany` and persistence failure coverage, while open questions leave key product semantics unresolved: scopes, tombstones vs hard delete, auto-cascade default, and skipped retry behavior.
required_fix: Resolve MVP semantics before planning. Remove duplicate criteria, decide defaults, and explicitly mark unresolved non-MVP questions as deferred. `/plan-it` should not have to choose product behavior.

## Finding 5
severity: medium
evidence: “Persistent or compact task visualization if supported by Pi UI APIs” is vague, yet criteria require hidden/compact/full rendering tests. This risks implementing speculative UI infrastructure before confirming Pi can support a persistent widget.
required_fix: Remove persistent widget from MVP. Define a simple text/status rendering contract for `/tasks` only, with widget support as optional future work behind a capability check.
