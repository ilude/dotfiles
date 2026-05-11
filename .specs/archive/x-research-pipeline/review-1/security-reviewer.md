# Security Review

## Finding 1
severity: HIGH
evidence: Plan stores X profiles, tweets, follow graphs, raw_json, and home/feed snapshots in plaintext SQLite under private/x/x-data.sqlite. It relies on .gitignore and a pre-commit hook, but hooks are bypassable (--no-verify, alternate clients, direct git add -f) and no CI/validation secret/PII scan is required before commit.
required_fix: Add mandatory repository validation that fails on tracked plaintext under private/ or non-*.age under private-encrypted/, including staged and already-tracked files. Document git add -f is blocked by policy and add tests for forced staging attempts.

## Finding 2
severity: HIGH
evidence: BrowserAgentBackend uses an authenticated browser session for X home timeline/profile checks. The plan only excludes posting/DMs/write actions, but does not specify a read-only browser profile, domain allowlist, cookie/session isolation, prompt-injection controls from page content, or safeguards against clicking/following/navigation side effects.
required_fix: Define a browser-session safety contract: dedicated read-only profile, x.com-only allowlist, no clicks/forms/keyboard except navigation/scroll, no credential/cookie export, redact tokens/cookies from logs, and tests proving write-like operations are impossible.

## Finding 3
severity: MEDIUM
evidence: API keys are loaded from private/x/config.local.json; acceptance only says tests prove defaults under private/x/. The plan does not require file permission checks, schema redaction, environment override precedence, log redaction, or prevention of copying config into encrypted snapshots/exports.
required_fix: Specify credential loading order and redaction rules. Validate config permissions where practical, never serialize keys into DB/raw_json/logs/errors/dry-runs, add tests for redacted exceptions/logs, and exclude local config from encrypt/export helpers unless explicitly requested.

## Finding 4
severity: MEDIUM
evidence: raw_json fields preserve full provider/browser responses for profiles and tweets. X/provider responses may include unexpected PII, internal IDs, URLs, emails in bios, protected-status metadata, or session-correlated fields. The plan lacks minimization, retention, or field-level filtering before storage/encryption.
required_fix: Define a raw payload policy: either store only allowlisted fields or gate full raw_json behind an explicit flag. Add retention/export deletion guidance, tests that sensitive fields are dropped/redacted, and CLI warnings when exporting/encrypting full raw payloads.

## Finding 5
severity: MEDIUM
evidence: Rollback is underspecified. Decrypt helper, encrypted snapshots, and SQLite migrations can create plaintext outputs under private/x/exports/, but the plan lacks cleanup-on-failure, atomic writes, backup/restore tests, or instructions for revoking/removing leaked snapshots and rotating age recipients/API keys.
required_fix: Require atomic temp-file writes, failure cleanup, dry-run/no-overwrite defaults, restore validation, and a rollback runbook covering plaintext cleanup, age recipient rotation, API key rotation, and removal of accidentally tracked PII from git history.
