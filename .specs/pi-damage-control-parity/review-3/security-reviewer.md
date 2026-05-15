---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "underblocking/plan inconsistency"
  evidence: "Plan T1 requires enumerating keys and actual Claude bashToolPatterns include `exfil` on 24 entries (`patterns.yaml`: key inventory shows pattern/reason/exfil/ask/platforms). T2 says unsupported safety-affecting fields (e.g. `exfil` if deferred) fail policy health closed, while Phase A success requires actual Claude YAML to load. Implementers may either drop `exfil` unsafely or make parity unusable."
  required_fix: "Before implementation, define `exfil` semantics explicitly: either implement equivalent exfil blocking/ask behavior with tests and oracle fixtures, or exclude those rules from Phase A with a documented fail/coverage-debt path that does not claim all `bashToolPatterns` load. Do not allow silent dropping of `exfil` fields."
- severity: high
  category: "dangerous-operation test safety"
  evidence: "G2/G3 no-real-shell gate greps only `pi/tests/damage-control.test.ts`, while T5 explicitly allows parity oracle subprocess helpers in separate files. A helper can import `child_process` and accidentally execute fixture commands; the gate would still pass because it only scans one file."
  required_fix: "Add a repository-scoped test safety gate for all new/changed Pi test/helper files. Require fixture evaluation to call policy functions or the Claude hook subprocess only, never shell fixture strings. Add a canary that fails if any fixture command reaches bash/pwsh/spawn/exec, and whitelist only the fixed Python oracle invocation."
- severity: medium
  category: "fail-closed ambiguity"
  evidence: "Automation Plan says configured policy failures should 'fail policy health closed' and 'refuse to evaluate ask/block rules until resolved'. It does not state what the tool handler returns for bash/write/edit calls while unhealthy. A literal implementation could stop evaluating rules and allow commands by default."
  required_fix: "Specify handler behavior for unhealthy policy state: all covered mutating/execution tool calls must hard-block with a clear error, no confirmation prompt, and no process/file operation. Add tests for missing path, invalid YAML, invalid regex, and unsupported key proving no execution/write occurs."
- severity: medium
  category: "rollback gap"
  evidence: "Rollback says 'Revert changed files from git and reapply preexisting-diff.patch', but this change affects local safety runtime and active Pi sessions; rollout note only mentions restart/reload after implementation. There is no rollback validation that the currently running Pi extension actually returned to the previous policy."
  required_fix: "Add rollback steps and verification: restore files, reinstall/typecheck if needed, restart/reload active Pi sessions, then run a smoke policy check (`rm -f` expected pre/post behavior as appropriate) against the active handler without executing the command."
- severity: medium
  category: "Phase B underblocking risk"
  evidence: "Objective says Phase B path/write policy support is required unless blocked, but T3 says Phase B path policy is implemented 'if implemented in this pass' and T4 pass condition only enforces 'implemented Phase B path policies'. This allows final validation to pass with zero-access/read-only/no-delete/write-confirm protections absent or partially absent."
  required_fix: "Make Phase B mandatory for the named sections or add an explicit blocker gate requiring user/lead approval to defer it. Final success criteria must include per-section pass/fail status and tests for zeroAccessPaths, readOnlyPaths, noDeletePaths, writeConfirmPaths, contentScanPaths, and injectionPatterns, or clearly fail the plan."
