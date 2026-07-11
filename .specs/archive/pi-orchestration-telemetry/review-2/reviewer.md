---
reviewer: reviewer
status: complete
finding_count: 4
---

# Findings

- severity: high
  category: "blocker: rollback safety"
  confidence: high
  evidence: "The rollback command snapshots only the listed implementation/docs/test paths. It omits `.specs/pi-orchestration-telemetry/plan.md`, even though `/do-it` must edit its checklist and `## Execution Status`; it also does not restore/remove execution-evidence files. The required postcondition is `git status` equal to `status-before.txt`, so a tracked plan edit makes the documented rollback fail and leaves the plan mutated."
  required_fix: "Include the plan and every `/do-it`-mutated tracked path in the byte-for-byte baseline, or explicitly snapshot/restore the plan and evidence state. Add a fail-fast comparison that verifies both bytes and status, while preserving unrelated dirty files."
- severity: high
  category: "blocker: live smoke isolation"
  confidence: high
  evidence: "The live command interpolates `${episode_id}` but never defines it and does not clear the target before writing. In a fresh shell it becomes `.tmp/orchestration-telemetry-smoke/`, and any prior contents are reused; metrics are append-only. The success criterion requiring exactly one joinable run cannot be established because stale events can satisfy or contaminate the count."
  required_fix: "Generate a unique episode ID in the documented command (for example from a validated UTC timestamp plus randomness), fail if it is absent/unsafe, remove only that newly selected scratch directory before creation, and assert the resulting metrics set contains exactly the expected event counts and joins."
- severity: high
  category: "blocker: archive/evidence gate"
  confidence: high
  evidence: "The archive-preflight command checks only that two capture files are nonempty, `git diff --check` passes, and a small secret regex is absent. It does not verify execution-events.jsonl, checklist evidence/status completeness, all required logs, exact live event joins/counts, scratch-vs-real-home isolation, or the rollback result, despite those being explicit archive-rule requirements. Its evidence column merely claims all fields are populated."
  required_fix: "Make archive preflight machine-check every required evidence artifact and execution-event field, all checklist items, exact smoke assertions, isolation assertions, and recorded rollback result; fail closed before archive when any is absent or mismatched."
- severity: medium
  category: "hardening: rollback telemetry purge"
  confidence: high
  evidence: "The rollback row says non-scratch metrics require a backup and removal of only identified orchestration lines, but supplies no executable command, event-identification rule, or verification. This is especially important because `git revert` cannot remove append-only metrics and the live/test contracts forbid real-home writes."
  required_fix: "Document an exact, non-destructive purge procedure for identified orchestration envelopes plus backup and before/after verification, and make rollback fail unless the procedure's evidence is recorded."
