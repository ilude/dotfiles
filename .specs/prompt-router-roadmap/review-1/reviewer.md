---
reviewer: reviewer
role: completeness and explicitness reviewer
artifact_type: prd-readiness-review
source: .specs/prompt-router-roadmap/PRD.md
created: 2026-05-07
---

# PRD Readiness Review

## Findings

### 1. Runtime integration point is not explicit enough for planning

**severity:** high

**evidence:** The Risks section says model switching may apply too late and asks whether implementation should stay in the current `input` hook architecture or include a provider spike. FR2/FR4 still require resolved model/thinking to be applied and explained.

**required_fix:** State the required v1 integration surface before `/plan-it`: current hook, logical provider, or spike-first. Add a verification that the selected route affects the same prompt turn, not only later status/log output.

### 2. Existing code/data prerequisites are missing

**severity:** high

**evidence:** Requirements mention settings, `/router-status`, `/router-explain`, logs, eval runner, classifier modes, and labeled eval data, but the PRD does not identify current files, commands, schemas, or fixtures that already exist versus must be created.

**required_fix:** Add an implementation-context section listing current router entrypoints, classifier invocation path, status/explain command locations, log path/schema, eval script path, and available eval fixture files or explicitly mark each as new.

### 3. Acceptance criteria rely on manual slash-command behavior without deterministic test hooks

**severity:** medium

**evidence:** AC1-AC4 use `/router-status`, `/router-explain`, routed prompts, and manual pinning. These are valid user checks but weak for autonomous planning because expected command syntax, test harness, and inspectable artifacts are not specified.

**required_fix:** For each acceptance criterion, add a deterministic verification path: unit/integration test names or exact CLI/script commands, fixture input, expected JSON/log fields, and where the evidence should be inspected.

### 4. Compatibility and migration behavior is underdefined

**severity:** medium

**evidence:** FR1 says translate Haiku/Sonnet/Opus and keep `low/mid/high` only as compatibility state “if needed.” Acceptance criteria fail legacy names as primary output, but do not define accepted input/config/log migration behavior.

**required_fix:** Define legacy compatibility rules explicitly: accepted legacy config keys/values, deprecation behavior, migration/default behavior, log schema versioning, and tests proving old state does not break routing.

### 5. Privacy requirements conflict around prompt excerpts

**severity:** medium

**evidence:** Non-functional requirements say default logging must avoid full raw prompts, while telemetry requires `prompt_excerpt` by default. The PRD does not specify excerpt length, redaction, disabling, hashing algorithm, or whether excerpts may contain secrets.

**required_fix:** Define privacy-safe logging defaults: hash method/scope, maximum excerpt length, redaction rules, opt-out/opt-in setting, and verification that full prompts/secrets are not logged by default.
