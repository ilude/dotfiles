---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "Severity rationale: generated artifacts are explicitly intended to be sent to GPT-5.5/Fable subagents. The plan inventories skill bodies, references, usage correlation, and model packets, but only checks for secrets at V5 after artifacts are already written and possibly after model-review execution. Evidence: T3 creates model-packet.md/subagent-tasks.json; T6 sends them to subagents; V5 later says confirm artifacts contain no secrets/API keys/.env/private keys."
  required_fix: "Add a pre-subagent secret/privacy gate before T6 steps 4-5: deterministic scan and redaction/fail-closed for artifact contents, referenced local files, session-log-derived snippets, .env/private key/token patterns, and local absolute paths. Archive must require this gate before any model packet leaves the local artifact stage."
- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "Severity rationale: the plan's write boundary can be bypassed by cwd mistakes or symlinks, causing source or external path mutation despite a read-only promise. Evidence: T4 requires writing under relative `.tmp/skill-review/{timestamp}/` from repo root/cwd, but no acceptance criterion requires realpath containment, repo-root verification, mkdir behavior that rejects symlink traversal, or tests where `.tmp`/run dir is a symlink."
  required_fix: "Require canonical repo-root detection and realpath containment checks before every write. Reject if `.tmp`, `.tmp/skill-review`, or the timestamp directory resolves outside the repo or is a symlink to another location. Add tests for cwd mismatch and symlink/path traversal attempts."
- severity: medium
  category: "process defect"
  confidence: medium
  evidence: "Severity rationale: paid model use is bounded only by qualitative policy, not by a deterministic budget. Evidence: the plan says manual approval before action is not required and model comparison uses existing Pi model configuration, while T6 sends GPT and Fable tasks for high-risk items without a max item count, token estimate, dry-run budget, or stop threshold."
  required_fix: "Add a deterministic cost gate before model execution: count packets, estimate token/input size, enforce max Fable/GPT tasks and max packet bytes, and require explicit user approval if the estimate exceeds the cap. Record skipped items and reason in decision-ledger.json."
- severity: medium
  category: "substantive defect"
  confidence: high
  evidence: "Severity rationale: allowing execution to implement/configure Fable targeting inside this plan expands mutation scope into credentials/settings and can create security regressions. Evidence: constraints say mutation scope is Pi extension/test files plus `.tmp`, but also says if Fable targeting is unavailable, `/do-it` must implement or configure the smallest Pi-native targeting path before completion. No files, permission boundaries, credential handling, or validation are specified for that configuration work."
  required_fix: "Split Fable targeting setup into a gated subtask with explicit allowed files, no credential material in repo/artifacts, validation steps, and rollback. If it touches local settings or secrets, require manual approval and keep archive blocked until the setup path is reviewed."
- severity: medium
  category: "process defect"
  confidence: medium
  evidence: "Severity rationale: archive gates require comparison artifacts but do not require schema validation before accepting model output. Evidence: T6 only checks file existence and that comparison lists agreement/disagreement; T5 tests malformed output is represented as invalid, but T6/V5 do not require validating gpt-review.json/fable-review.json against comparison-template.json before updating decision-ledger.json."
  required_fix: "Add a T6/V5 acceptance criterion that validates gpt-review.json, fable-review.json, comparison.md inputs, and decision-ledger.json against the generated schemas. Invalid model output must be recorded as invalid/not-comparable and must not satisfy the archive gate."
