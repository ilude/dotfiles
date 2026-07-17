---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "sensitive-data-handling"
  confidence: high
  evidence: "Plan directs /do-it to use all local Pi data including `~/.pi/agent/sessions/**`, `traces/**`, `metrics-*.jsonl`, multi-team sessions, and `.specs/**`, then produce evidence excerpts, episode indexes, and a final report. These logs can contain secrets, private user text, file paths, tool outputs, emails/tokens, SSH/key references, or proprietary code snippets, but the plan has no redaction/classification rules."
  required_fix: "Add a privacy protocol before inventory/coding: classify data sensitivity, redact secrets/tokens/keys/user-private content from excerpts, minimize quoted text, store only relative/non-sensitive paths where possible, and require an explicit secret scan/redaction pass before writing any report or appendix."
- severity: high
  category: "credential-log-privacy"
  confidence: high
  evidence: "Data Sources include trace/tool-call/runtime logs and session JSONL across `~/.pi/agent/**`; Measurable Signals include token/cost/time metrics and evidence of user rescue; Verification requires saving source paths and evidence excerpts. Trace/session logs often capture command arguments, environment-derived output, API/provider metadata, and authentication-related failures, but the plan does not define where derived artifacts are stored or their permissions/retention."
  required_fix: "Specify output locations, retention, and access controls for all derived inventories/indexes/reports. Require local-only storage under the spec directory, no external upload, restrictive file permissions where supported, and exclusion/redaction of command outputs or env/provider/auth metadata that could expose credentials."
- severity: medium
  category: "operational-breakage"
  confidence: medium
  evidence: "Plan says use all available local Pi data and save inventories/timelines/indexes, but only forbids mutating command/prompt files and deleting/rewriting logs. It does not forbid expensive full scans of large logs, following symlinked/submodule paths unexpectedly, or invoking tooling that updates caches/state while reading traces and git history."
  required_fix: "Constrain execution to read-only discovery plus writes only under `.specs/pi-workflow-audit/`. Add limits for file size/count, symlink traversal, submodules, and timeouts; require dry-run/listing before deep reads; prohibit commands that alter repo, runtime logs, package caches, or Pi state."
- severity: medium
  category: "rollback-gaps"
  confidence: high
  evidence: "Acceptance criteria require producing multiple intermediate artifacts and a final report, but there is no rollback/cleanup plan if sensitive material is accidentally copied into `.specs/**` or if the audit generates misleading indexes from incomplete logs."
  required_fix: "Add an incident/rollback step: if sensitive data is written, stop, remove or replace the derived artifact before commit/sharing, document affected paths, and rerun redaction. Add a validation gate that labels incomplete/corrupt logs and prevents them from being treated as authoritative."
- severity: medium
  category: "scope-control"
  confidence: medium
  evidence: "The plan includes `~/.pi/agent/sessions/**` and multi-team sessions across all projects, plus repo artifacts and git history. There is no consent or boundary rule for projects outside the current repo, even though final report examples include project names, session IDs, dates, evidence excerpts, and case studies."
  required_fix: "Define project-boundary and consent rules: either restrict to this repo by default or require explicit approval for cross-project logs. For cross-project cases, anonymize project/session identifiers and exclude content excerpts unless necessary and redacted."
