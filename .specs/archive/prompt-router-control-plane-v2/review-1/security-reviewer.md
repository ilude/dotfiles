---
reviewer: security-reviewer
status: complete
---
# Findings
- severity: high
  evidence: Automation Plan archive preflight command `grep -RInE "(sk-[A-Za-z0-9]|api[_-]?key|token|secret|https?://|C:/Users|/home/[^/]+)" ... || true`
  required_fix: Make archive preflight fail closed on matches by capturing grep output, redacting match text if needed, and exiting nonzero unless every finding is explicitly allowlisted by path/pattern. Remove `|| true` or replace it with logic that distinguishes “no matches” from “matches found”.
- severity: high
  evidence: T8 accepts “owner-only permission best effort” for telemetry/evidence logs, while constraints prohibit leaking prompts, credentials, account IDs, private paths, and endpoints.
  required_fix: Define mandatory permission enforcement for files that may contain routing telemetry or evidence, including exact mode/ACL expectations, validation tests, and fail-closed behavior when permissions cannot be applied or verified.
- severity: medium
  evidence: T8 allows “opt-in redacted excerpts” but the Constraints only say default logs/evidence must not include raw prompts/prompt excerpts; no approval boundary, storage location, retention, or archive exclusion rule is specified.
  required_fix: Specify an explicit user opt-in gate, maximum excerpt length, deterministic redaction rules, retention/purge behavior, tests proving excerpts are absent from archiveable evidence by default, and an archive blocker for any excerpt-bearing artifact unless separately approved.
- severity: medium
  evidence: T2 says runtime subprocess failures for valid modes produce safe `null-fallback` metadata, but the plan does not require timeout/resource-limit handling for classifier subprocesses.
  required_fix: Add bounded timeout, output-size limits, and cancellation/cleanup requirements for classifier/eval subprocess calls, with tests proving timeout and oversized-output cases fail closed without stale route state or prompt leakage.
- severity: medium
  evidence: T3/T6 mention missing credentials and denied cross-provider fallback, but no credential-source inventory or provider-boundary validation is required before dispatch.
  required_fix: Add a credential/provider inventory check that records only sanitized provider family and availability state, validates selected provider/model before dispatch, and tests that missing/ambiguous credentials and provider mismatches fail closed without falling back across providers or logging secrets.
