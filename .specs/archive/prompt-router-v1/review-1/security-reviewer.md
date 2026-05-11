---
reviewer: security-reviewer
status: complete-inline-recovery
---

# Findings

- severity: high
  evidence: Plan requires writing evidence from `grep -RIn ... > .specs/.../P0-preflight.md` and later evidence files, while also saying evidence must not include secrets. Grepping broad router/test paths can capture tokens, raw prompts, model/provider credentials, or synthetic sentinel strings before sanitization.
  required_fix: Replace broad evidence capture with allowlisted summaries or sanitize-before-write pipeline; add a mandatory secret/sentinel scan immediately after every evidence write, not only archive preflight.

- severity: high
  evidence: Rollback plan says “revert targeted files with normal git checkout only after user approval” but does not define a pre-change patch/snapshot or exact rollback file set, while planned changes span TS, Python, tests, docs, settings, and fixtures.
  required_fix: Add a rollback checkpoint before Wave 1: record `git status --short`, exact owned paths, and create a patch with `git diff --binary > .specs/.../rollback-prechange.patch` excluding secrets/evidence; define targeted restore commands per path group.

- severity: medium
  evidence: Telemetry task allows “redacted only on explicit opt-in” excerpts but the plan does not define the opt-in setting, redaction algorithm, retention scope, or verification that opt-in cannot be enabled accidentally.
  required_fix: Default to no excerpts for V1; if opt-in remains, require a named config key defaulting false, tests proving raw prompt absence in default mode, and docs warning about local privacy risk.

- severity: medium
  evidence: Manual validation uses representative real Pi prompts and then checks logs, but the plan does not require using synthetic non-sensitive prompts only.
  required_fix: Amend manual validation to use fixed synthetic prompts with no secrets/customer data and verify those exact raw strings are absent from telemetry/evidence.

- severity: medium
  evidence: Cross-provider fallback is “explicit” but the plan lacks a safety check that provider/model profile changes do not route sensitive prompts to an untrusted provider family after config drift.
  required_fix: Add tests and status/explain output for provider trust class, fallback-denied reason, and config validation that fails closed when route profile provider family is unknown or untrusted.
