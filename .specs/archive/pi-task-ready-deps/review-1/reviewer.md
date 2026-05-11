---
reviewer: reviewer
status: complete
finding_count: 4
---

# Findings

- severity: high
  category: "completeness"
  confidence: high
  evidence: "T1 suggests getUnmetBlockers(task)/isTaskReady(task), but a task only stores blockedBy IDs; the plan also requires pure helpers and renderer/command reuse."
  required_fix: "Specify a concrete pure API that accepts an already-loaded task map/list, avoiding hidden filesystem reads and duplicated dependency lookup behavior."
- severity: high
  category: "verification"
  confidence: high
  evidence: "T3/T4 acceptance criteria mention tasks.test.ts but do not require invoking the registered pi.registerCommand(\"tasks\") handler path."
  required_fix: "Require tests to load the extension with a mocked ExtensionAPI, capture the registered tasks handler, invoke ready/blocked/start strings, and assert notify output plus persistence."
- severity: medium
  category: "operator-ux"
  confidence: medium
  evidence: "Plan says missing/tombstoned blockers are unmet but lacks a user-facing remediation path for stale dependency edges."
  required_fix: "Add acceptance criteria that blocked/start rejection output identifies missing/tombstoned blockers distinctly and provides a recovery command or documented next step."
- severity: medium
  category: "state-semantics"
  confidence: medium
  evidence: "T3 says /tasks blocked includes explicit blocked-state tasks and waiting pending tasks, but policy for blocked tasks whose dependencies are now satisfied is not defined."
  required_fix: "Define whether explicit blocked tasks with satisfied/no blockers appear in ready, blocked, both, or require manual transition; test the policy consistently."
