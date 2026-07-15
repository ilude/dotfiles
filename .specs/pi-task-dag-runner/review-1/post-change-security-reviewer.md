---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "workspace boundary"
  confidence: high
  evidence: "The plan permits existing custom executable working directories to remain (\"Absolute-path hiding or removal ... Existing behavior remains\") while execute_many authorizes any record whose workspace field is current/no workspace. Record workspace ownership therefore does not establish that the runner's actual cwd is within the resolved current workspace; one call can fan out up to eight executions outside that boundary."
  required_fix: "Define and test the execution-cwd authorization rule for execute_many: resolve/canonicalize cwd before launch, reject paths outside the resolved current workspace (including symlink escapes), or require an explicit separately authorized external-workspace capability. Apply the same rule to artifact locations exposed by these executions."
- severity: medium
  category: "durable state recovery"
  confidence: high
  evidence: "For a non-atomic batch write/rename failure, the contract returns no successful batch result but admits inspectable partial records. Generated UUIDs and request key aliases are not promised in write_failed details or another recovery record. An operator receiving only a bounded error may have no reliable way to identify which newly generated records exist, distinguish them from concurrent work, or safely repair/remove them."
  required_fix: "Specify a bounded, non-secret failure recovery envelope or durable operation/correlation identifier containing the generated IDs, persisted IDs, and failed phase. Add tests for each failure point proving partial records can be located and reconciled without broad workspace scans or guessing."
- severity: medium
  category: "dependency supply chain"
  confidence: medium
  evidence: "Dependency setup executes pnpm install and links globally installed Pi runtime packages. The only stated validation is that five linked paths exist. Existence does not prove the links resolve to the active Pi installation, expected package versions, or an approved location, so validation can execute a stale or locally substituted runtime dependency."
  required_fix: "Before tests, verify each linked package realpath and package version against the installed Pi binary/runtime manifest (or make the linker emit and validate that mapping). Fail on mismatches, paths outside the expected global installation root, or unresolved links; record only non-secret identity evidence."
- severity: medium
  category: "artifact and evidence safety"
  confidence: medium
  evidence: "The plan requires complete records and artifact paths in details/TUI, while explicitly retaining custom executable working directories and does not define artifact-path validation, display encoding, or containment. Worker-controlled metadata can consequently surface arbitrary absolute paths or terminal-control/link payloads in renderer details and archive/test evidence."
  required_fix: "Define artifact references as validated display data: normalize and bound them, safely escape renderer output, disallow control characters and unsafe file/URL links, and expose workspace-relative paths unless an explicit approved external-path policy applies. Add renderer and provider-envelope tests with malicious path values."
- severity: low
  category: "archive evidence integrity"
  confidence: medium
  evidence: "Archive preflight sets archive_status ready before relocation, then instructs setting archived only after moving plan.md. A post-move status-write failure leaves the sole archive copy marked ready; the partial-failure instruction to preserve both paths cannot hold after a successful move that removed the source. The procedure lacks a durable recovery/evidence rule for this state."
  required_fix: "Use a recoverable archive sequence: write/validate an archived copy or temporary target including final status, atomically rename it, verify content identity, then remove the active copy only after verification. Define the exact recovery state and evidence if any step fails."
