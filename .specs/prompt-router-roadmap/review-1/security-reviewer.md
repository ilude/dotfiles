---
reviewer: security-reviewer
role: adversarial/red-team reviewer
artifact_type: prd-readiness-review
source: .specs/prompt-router-roadmap/PRD.md
created: 2026-05-07
---

# PRD Readiness Review

## Findings

### 1. Prompt excerpts can still leak secrets by default

**severity:** high

**evidence:** Telemetry defaults include `prompt_excerpt`, while the safety requirement only says avoid full raw prompts unless explicitly enabled. Short excerpts can contain API keys, tokens, customer names, file paths, or proprietary snippets.

**required_fix:** Define excerpt minimization: default off or redacted with a documented secret/PII scrubber, maximum length, and tests using representative keys/tokens. Require opt-in raw/excerpt logging with clear local retention controls.

### 2. Context capsule may expose hidden task state

**severity:** medium

**evidence:** Logs include `unresolved_task`, `dependency_on_prior_context`, `last_effective_size`, prior route, and rule decisions. Even without raw prompts, this can reveal sensitive workflow status, urgency, or that a high-risk task occurred.

**required_fix:** Classify capsule fields as metadata with privacy impact. Add retention, local-only storage, redaction/export rules, and a setting to disable capsule logging while preserving explain output for the current turn.

### 3. Manual override safety lacks abuse and stale-pin handling

**severity:** high

**evidence:** FR7 says user-selected route/model pins override automatic routing until cleared. A stale or maliciously set cheap pin could bypass anti-downgrade, context-window safety, or safety-sensitive escalation.

**required_fix:** Specify precedence rules: explicit pins may override cost/quality routing but not hard safety floors. Add pin visibility in status/explain, expiry/session scoping, audit logging, and a warning when pinned route conflicts with detected high-risk context.

### 4. Provider/model mapping can silently cross trust boundaries

**severity:** high

**evidence:** FR2 resolves canonical routes to provider/model/thinking, with unavailable fallbacks and optional specialized profiles. The PRD does not require provider trust classification, data residency, or confirmation before fallback to a different provider/model class.

**required_fix:** Add provider allowlist and route-profile policy fields for trust tier, locality, retention assumptions, and context-window. Require explain/log output to show provider changes and require explicit configuration for cross-provider fallback.

### 5. Append-only JSONL logs need operational controls

**severity:** medium

**evidence:** Non-functional requirements mandate append-only JSONL logs and aggregates but do not define file permissions, rotation, corruption handling, deletion, or incident response for leaked logs.

**required_fix:** Add operational requirements for secure path selection, owner-only permissions, rotation/size limits, schema migration, safe parsing of corrupted lines, and a documented purge command for privacy/security incidents.
