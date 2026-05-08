---
reviewer: security-reviewer
status: complete
---

# Findings

## 1. Severity: high
**Evidence:** The spike says to pass resolved provider/model/thinking into generation dispatch atomically, but it does not define an auth/credential gate at that seam. The original plan required deny-by-default cross-provider fallback and missing-credential tests; the spike omits both.
**required_fix:** Add a provider-dispatch acceptance gate that validates provider trust boundary, credential availability, and explicit fallback authorization before dispatch. Include tests proving missing credentials and cross-provider fallback fail closed without applying a previous route.

## 2. Severity: high
**Evidence:** The spike records requested classifier mode, raw route, applied route, provider/model/thinking, order, timestamps, and observer source, but does not forbid raw prompt, endpoint, account, token, or private path capture in the new provider-level harness.
**required_fix:** Specify a redacted evidence schema: synthetic prompt hash only, sanitized provider family/model label, no endpoints/account IDs/tokens/raw prompts/excerpts/private paths. Add a grep/secret-scan archive gate before any evidence is preserved.

## 3. Severity: medium
**Evidence:** The spike replaces the input-hook side effect with a pre-generation resolution layer, but does not define failure behavior for classifier timeout, malformed JSON, invalid route, resolver exception, or dispatch observer failure.
**required_fix:** Define fail-closed behavior for every pre-generation failure class. Required output must include safe null-fallback metadata, no stale previous-turn route application, user-visible status/explain reason, and tests for timeout, nonzero exit, malformed JSON, unknown label, and resolver exception.

## 4. Severity: medium
**Evidence:** “Pass the resolved provider/model/thinking into generation dispatch atomically” is not enough to prevent partial state damage if one setter or dispatch integration succeeds and the next fails. The spike has no rollback or transaction boundary description.
**required_fix:** Require a single immutable decision object consumed by dispatch, or an explicit rollback/restore path if mutable runtime state is touched. Add a test where model assignment succeeds and thinking/provider assignment fails, proving no mixed route reaches generation.

## 5. Severity: medium
**Evidence:** The spike’s next validation gate does not mention rollback manifests, generated artifact inventory, or archive preflight. The parent plan explicitly says same-turn failure must not archive; the spike could produce durable review/evidence without a safety gate.
**required_fix:** Add rollback/archive criteria: list generated files, cleanup commands, git status, raw-prompt/secret scans, and evidence retention rules. Block archive if any manual or harness evidence contains unredacted prompts, credentials, endpoints, or local private paths.
