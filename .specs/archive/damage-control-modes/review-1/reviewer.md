---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "artifact-recovery"
  confidence: high
  evidence: "Recovery reviewer reported no artifact/write tool available in subagent and could not create `.specs/damage-control-modes/review-1/reviewer.md`."
  required_fix: "Coordinator persisted the recovery reviewer's inline findings via constrained review_artifact_write; note recovery in synthesis artifact status."
- severity: high
  category: "completeness"
  confidence: high
  evidence: "Plan requires `/damage-control` and `/dc` slash-command registration but does not identify Pi command registration API shape or existing extension registration pattern to follow."
  required_fix: "Add exact existing file/function/API references for registering commands in `pi/extensions/damage-control.ts`, including `ExtensionAPI.registerCommand` and command handler signature."
- severity: medium
  category: "acceptance-criteria"
  confidence: high
  evidence: "Whitelist behavior says known-safe commands but does not define the complete allowlist or matching semantics beyond examples."
  required_fix: "Specify initial allowlist entries and whether matching is exact command, prefix, regex, or parsed executable/verb."
- severity: medium
  category: "testability"
  confidence: medium
  evidence: "PowerShell dangerous rules include broad categories like download-and-execute and Defender weakening without exact regex/pattern expectations."
  required_fix: "List required rule names/pattern intents and at least one positive/negative test case per category."
- severity: medium
  category: "backward-compatibility"
  confidence: high
  evidence: "Plan says pwsh dangerous commands use same configurable rule engine as bash with tool-targeted rules, but does not specify behavior for rules with no `tools` metadata."
  required_fix: "Explicitly state whether unscoped rules apply to all shell tools, bash only, or legacy behavior only."
