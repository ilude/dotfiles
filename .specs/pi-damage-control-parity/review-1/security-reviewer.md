---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "safety-system failure mode"
  evidence: "Plan recommends loading Claude patterns.yaml as canonical while deferring AST bash analysis, semantic git analysis, taint/sequence detection, and post-tool secret/injection detection to a ledger. Success criteria still emphasize parity, risking false assurance where regex-only normalization cannot match Claude runtime decisions."
  required_fix: "Define a hard parity boundary before implementation: enumerate unsupported Claude safety mechanisms as non-parity gaps, add tests proving Pi fails closed or emits explicit unsupported decisions for those classes, and prohibit final claims of parity unless those mechanisms are implemented."
- severity: high
  category: "underblocking risk"
  evidence: "T2 says missing `ask` maps to hard block, but the Claude schema may include context/dry-run/allowlist semantics outside `bashToolPatterns`. A simple YAML adapter can silently drop unknown fields and normalize complex policy into allow/ask/block incorrectly."
  required_fix: "Require schema validation that rejects or loudly reports unknown/unsupported Claude policy fields. Add inventory tests asserting every Claude policy section is either enforced by Pi or listed as unsupported with a failing/skip-linked regression case."
- severity: medium
  category: "secret exposure risk"
  evidence: "Evidence collection includes git diffs, policy inventory, test logs, typecheck logs, and archive preflight. The plan says no real secrets but only checks evidence after logs are already written; preexisting diffs could contain secret-like paths/content from local edits."
  required_fix: "Add a pre-write and post-write evidence scrub step. Before archiving diffs/logs, scan staged output for secret patterns and redact or abort. Use synthetic fixture names only and explicitly avoid dumping file contents from zero-access/secret path tests."
- severity: medium
  category: "dangerous-operation test safety"
  evidence: "The plan forbids executing dangerous shell commands, but T4 covers actual `tool_call` handlers for bash/pwsh. Without an explicit mocked executor boundary, handler tests could accidentally pass commands through while validating confirmation behavior."
  required_fix: "Mandate a fake tool executor in tests and assert no shell/pwsh process is spawned. Add a canary dangerous command test that fails if execution is attempted, while still verifying ask/block decisions and UI confirmation calls."
- severity: medium
  category: "rollback gap"
  evidence: "Rollback says revert changed files or restore from git, while T0 notes preexisting uncommitted edits in two Pi files. If implementation intermixes those edits with broader parity changes, simple revert can destroy user work or lose the initial narrow patch."
  required_fix: "Require a named backup patch and restoration procedure for preexisting edits, plus final diff attribution separating preexisting changes from new plan changes. Rollback instructions must preserve or reapply the saved preexisting patch unless user explicitly discards it."
