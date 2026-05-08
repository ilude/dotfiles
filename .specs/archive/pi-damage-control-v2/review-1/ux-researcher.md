# UX Review Findings

## 1. Severity: high
Evidence: Manual validation expects status text but does not define persistent visibility when a dangerous command is being evaluated or after a denial. In a live risky session, the user may miss a transient prompt/status update and assume protection is still active.
Required_fix: Specify exact status-bar states for active, evaluating, blocked, denied, allowed-once, and failed. Require tests or manual screenshots/transcripts proving the status remains visible long enough to diagnose the current safety state.

## 2. Severity: high
Evidence: Ask prompts are required, but the plan does not mandate prompt copy that names the matched rule, action severity, command/path, and consequences of confirm vs deny.
Required_fix: Add acceptance criteria for confirmation wording: include “DANGEROUS COMMAND”, matched rule id/pattern, normalized command, cwd, decision scope (“allow once/session”), and explicit safe default. Tests should assert key prompt strings.

## 3. Severity: medium
Evidence: `/doctor --verbose` reports health/rule counts, but the plan does not require remediation guidance when damage-control fails or rules are missing.
Required_fix: Require `/doctor` failure output to include rule source path, load error, enforcement mode “fail-closed”, affected tool categories, and next commands/files to inspect. Add test assertions for actionable remediation text.

## 4. Severity: medium
Evidence: `/permissions` records decisions and replay payloads, but discoverability for diagnosing a surprising allow/block is underspecified.
Required_fix: Require `/permissions` output to show latest damage-control decisions with timestamp, tool, command/path summary, matched rule id, outcome, provenance, scope, and replay-safe payload location. Include a filtered view or clear section header for damage-control.

## 5. Severity: medium
Evidence: Manual validation allows using `docker compose down` if safe, which is risky and ambiguous during validation.
Required_fix: Replace with a mandatory harmless test-only ask rule in a scratch directory, with exact setup/removal steps and expected prompt/status/permissions outputs. Keep real destructive examples for automated mocks only.
