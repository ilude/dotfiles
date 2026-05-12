---
reviewer: security-reviewer
status: complete
finding_count: 3
---

# Findings

- severity: high
  category: "secret-handling"
  confidence: high
  evidence: "No-secret check scans `.specs/.../evidence` while writing output into that same directory and suppresses grep exit with `|| true`; diagnostics may be missed and clean output can be empty."
  required_fix: "Write scan output to a temp file outside evidence, capture stderr, then move a non-secret sentinel/log into evidence; update success criteria accordingly."
- severity: medium
  category: "auditability"
  confidence: high
  evidence: "Mode transition audit requirement exists, but acceptance criteria do not force previous/new mode and alias to be asserted in tests."
  required_fix: "Add T3 acceptance criterion requiring audit/metrics/status event contains previousMode, newMode, alias, and invalid args record no transition."
- severity: medium
  category: "safety-scope"
  confidence: medium
  evidence: "Expanded pwsh rules can create confidence in coverage, but evasion limits are only loosely documented as tests or non-goals."
  required_fix: "Require explicit non-goal text in rules or tests for unsupported PowerShell obfuscation forms not handled by regex."
