---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "severity_rationale: file-backed objectives can expose arbitrary local files into prompts/session state. Plan AC says paths may be “under cwd or explicitly supplied safe path” but never defines safe roots, symlink handling, max file size, binary rejection, or secret-file denial. In a dotfiles repo, cwd contains keys/config-like files and generated runtime state."
  required_fix: "Define path policy before implementation: resolve realpath, require regular text files under repo/workspace or an explicit allowlisted absolute path, reject symlinks escaping root, reject oversized/binary files, and add tests for traversal, symlink escape, and secret-like paths."
- severity: medium
  category: "substantive defect"
  confidence: high
  evidence: "severity_rationale: disabling a package by grep is brittle and can miss the actual active load path. Evidence: T2 verify excludes `_disabled*` but `pi/settings.json` can contain nested/variant package arrays; V1 only checks repo registrations, not runtime extension/package registry diagnostics. Result can be duplicate `/goal` or first-registration-wins `goal_complete`."
  required_fix: "Require a deterministic settings parser check that enumerates active package entries exactly, plus a runtime/startup validation or mock extension registry assertion proving only the local `/goal` and `goal_complete` are registered."
- severity: medium
  category: "process defect"
  confidence: medium
  evidence: "severity_rationale: rollback says “git diff ... then reverse or revert local changes” while the plan states unrelated uncommitted work already exists in `pi/settings.json`. Without a patch/snapshot of the pre-change relevant JSON entry, rollback can discard or entangle user changes."
  required_fix: "Add preflight capture of targeted file state: `git diff -- pi/settings.json` saved as evidence, then use a minimal JSON edit. Rollback must restore only the package-entry change, not reset the whole file."
- severity: medium
  category: "substantive defect"
  confidence: medium
  evidence: "severity_rationale: the command will intentionally inject objective text into agent prompts. Plan tests compactness, but no rule prevents closeout/continuation prompts or evidence logs from echoing secret objective contents or full file text. Telemetry contract asks for evidence summaries but lacks redaction requirements."
  required_fix: "Specify redaction policy: never log full objective/file contents in telemetry or checklist evidence; closeout should summarize user-provided objective without verbatim large text; tests should assert long/file objective content is not emitted after startup except bounded preview/hash/path."
- severity: low
  category: "process defect"
  confidence: high
  evidence: "severity_rationale: archive gate F5 is listed but undefined. The archive rule says do not archive until F5 passes, yet no command/check defines archive preflight. Executors may mark it complete subjectively or get blocked."
  required_fix: "Define F5 explicitly, e.g. verify all checklist items have evidence, required validations passed, no failed status remains, review findings resolved/deferred with rationale, and no secret evidence was recorded."
