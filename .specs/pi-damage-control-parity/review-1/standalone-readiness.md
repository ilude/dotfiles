---
reviewer: standalone-readiness
status: complete
finding_count: 2
---

# Findings

- severity: critical
  category: "blocker: archive/evidence gate"
  confidence: high
  evidence: "F5 requires evidence manifest with exit codes, fixture counts, mismatch count, and secret-scan result, but the manifest template only writes timestamp, HEAD, git status, diff stat, and file list. The tee-piped validation commands also do not capture per-command exit codes for the manifest."
  required_fix: "Add exact F5 commands/wrapper to run final validations with captured exit codes (pipefail + status files or script), extract/record fixture counts and mismatch count, run secret scan, and fail F5 unless all required manifest fields are present."
- severity: critical
  category: "blocker: secret-scan gate"
  confidence: high
  evidence: "Plan says to run a local synthetic secret scan before F5 and redact/abort on real secret-looking values, but provides no concrete command, pattern set, or pass/fail criterion. A fresh /do-it session would need to invent the credential-flow/evidence-scan gate."
  required_fix: "Specify the exact secret-scan command or script for evidence/, the patterns/tool to use, where to write the scan log, and exact pass/fail behavior for findings/redaction before archive preflight can be marked complete."
