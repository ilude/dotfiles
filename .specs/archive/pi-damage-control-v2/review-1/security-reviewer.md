---
reviewer: security-reviewer
status: complete
---

# Findings

## 1. Severity: high
Evidence: T5 allows session approvals for ask-level rules, but the plan does not define canonicalization, expiry, or exact matching of approved commands/replay payloads. Shell wrapper work in T6 means small string differences can materially change behavior.
required_fix: Require session approvals to bind to normalized tool name, cwd/scope, canonical command/path, rule id, and action; expire at session end; never use substring/prefix matching; add tests proving modified wrapped commands do not inherit approval.

## 2. Severity: high
Evidence: Fail-closed is required “if rules cannot load,” but rollback says `git checkout -- pi/damage-control-rules.yaml ...` and manual validation allows test-only local rules. A broken or malicious project-local rule source could disable protection or create unsafe prompts if source precedence is wrong.
required_fix: Specify trusted rule-source precedence, schema validation, and fail-closed behavior for malformed project-local rules. Doctor/status must show exact source path and failure. Tests must cover missing, malformed, and hostile local rules.

## 3. Severity: medium
Evidence: Denied decisions should store replay payloads with `toolName`, `input`, and `cwd`, while also avoiding secrets. Raw bash input can contain inline secrets, tokens, or copied private key material, so command metadata alone is not automatically safe.
required_fix: Define redaction before persistence/logging for command strings, paths, env-like values, URLs with credentials, key material markers, and `.env`/SSH contents. Add tests that denial payloads redact representative secrets while preserving enough replay metadata.

## 4. Severity: medium
Evidence: T6 prioritizes secret-read and exfil patterns, but acceptance criteria focus on `cat`, `base64`, IMDS, and obvious pipelines. Common bypasses include `sed`, `awk`, `head`, `tail`, `python -c`, `node -e`, command substitution, and curl POST bodies.
required_fix: Add a minimal adversarial matrix for alternate readers and wrapper/exfil compositions. Either block high-confidence equivalents or explicitly document unsupported cases and ensure status/doctor does not claim Claude-equivalent coverage until covered.

## 5. Severity: medium
Evidence: The plan requires manual live validation before archive, but allows “implemented-awaiting-manual-validation.” It does not define how operators are prevented from treating that state as complete or from committing/rolling out without the live prompt/status check.
required_fix: Add an explicit final gate that fails closure/archive and labels the plan incomplete until manual validation evidence is recorded. Include expected artifact location/status text and require commit/final summary to state “awaiting manual validation” when not passed.
