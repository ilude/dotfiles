---
reviewer: reviewer
status: complete
finding_count: 2
---

# Findings

- severity: high
  category: "blocker: rollback safety"
  confidence: high
  evidence: "Automation Plan rollback snapshots execution-evidence only as a directory entry. If that directory existed at preflight, newly created evidence files remain after copying the baseline directory back. The final instruction is only 'compare git status' and supplies no executable byte/status assertion. See plan.md:147,153."
  required_fix: "Snapshot every pre-existing file under execution-evidence (or record a manifest and remove post-run files), and add an exact fail-closed command comparing both bytes/manifests and git status to status-before.txt while preserving unrelated work."
- severity: medium
  category: "hardening: telemetry purge"
  confidence: high
  evidence: "Rollback says non-scratch metrics require backup plus removal of only identified orchestration event lines, but still gives no executable backup, selection, restoration, or before/after verification procedure. Append-only real-home telemetry therefore cannot be safely rolled back. See plan.md:153 and the rollback paragraph in the Risk section."
  required_fix: "Document an exact non-destructive purge workflow with a backup path, envelope/event identity selection rule, verification of retained lines, and evidence that no unrelated metrics were removed; make archive/rollback status depend on that record when real-home writes occur."
