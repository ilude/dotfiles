---
reviewer: reviewer
status: complete
---
# Findings
- severity: high
  evidence: "Functional Requirements require `TaskExecute`, `TaskStop`, auto-cascade, and completed prerequisite output injection, but Open Questions still ask whether auto-cascade is default and Risks say `TaskStop` may be partial."
  required_fix: "Define exact execution semantics before planning: when `TaskExecute` runs, whether auto-cascade defaults on/off, what gets injected into dependent prompts, and the observable contract for best-effort stop/cancellation."
- severity: high
  evidence: "Open Questions: `Should task storage remain under the existing operator state directory only, or also support upstream-style project/session/named scopes?` while the Problem lists `storage scopes` as part of the desired full experience."
  required_fix: "Resolve storage scope requirements now: supported scopes, default scope, persistence paths, locking boundaries, migration behavior, and which `/tasks` and tool calls can select scopes."
- severity: medium
  evidence: "Acceptance Criterion 2 says tools `expose documented schemas`, but Requirements list tool names only and fields are described inconsistently as subject/summary, description, active form, agent type, owner, metadata, dependency declarations."
  required_fix: "Add explicit input/output schemas for every task tool, including required fields, status enum, dependency field names, error shapes, and backward-compatible aliases if Claude compatibility is required."
- severity: medium
  evidence: "Acceptance Criteria use several non-existent or vague verifications: `unit test creates`, `mocked execution test`, `mock registry write failure`, `simulated new session`, without naming files, harnesses, or expected commands."
  required_fix: "Convert each acceptance criterion to concrete runnable verification commands or file-level test targets a planner can implement against, with expected pass/fail assertions."
- severity: medium
  evidence: "Functional Requirements say `Add persistent or compact task visualization if supported by Pi UI APIs`; Risks say `Widget API limitations` and `gate widget behind capability check`, but AC 9 requires display modes render expected output."
  required_fix: "Separate mandatory CLI/status rendering from optional persistent widget behavior, and define the exact fallback output contract for hidden/compact/full when Pi UI widget APIs are unavailable."
