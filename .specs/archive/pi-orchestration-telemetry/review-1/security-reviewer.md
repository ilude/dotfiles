---
reviewer: security-reviewer
status: complete
finding_count: 4
---

# Findings

- severity: high
  category: "privacy / local file permissions / rollback"
  confidence: high
  evidence: "Severity rationale: The stream is enabled by default and can contain model, provider, session, task, and usage metadata; a readable log is a real local disclosure, and append-only writes cannot be removed by a code rollback. Evidence: `pi/lib/metrics.ts:76-80,106` creates the metrics directory with default permissions and appends files without setting file mode; the plan says `metrics.enabled` defaults on, storage is under `~/.pi/agent/logs/`, and its rollback claim is only \"new JSONL events are additive and ignorable\". The plan also explicitly defers retention/purge tooling."
  required_fix: "Make the telemetry writer establish a private directory/file mode (0700/0600 where supported) and define behavior for an existing insecure path; add an explicit purge/removal procedure or state that rollback does not remediate already-written metadata. Add a test or live check for permissions on the supported platform, and document that `PI_METRICS_DIR` must not point at a shared/synced directory."
- severity: medium
  category: "sanitization / privacy boundary"
  confidence: medium
  evidence: "Severity rationale: The stated invariant is that no prompt/output/failure text can persist, but the plan permits arbitrary retained agent/model/provider strings and relies on a sanitizer whose actual patterns are narrower than common credential forms. Evidence: `pi/lib/task-security.ts:3-8` matches private-key blocks, AKIA keys, selected token prefixes, and key-like assignments, but not bearer tokens, JWTs, Azure/GCP-style credentials, URL userinfo, or arbitrary secret values; T2 only requires bounded strings to pass through `sanitizeTaskValue`, while T3/T5 accept producer-supplied model/provider metadata. A producer wiring mistake can therefore persist content or a secret under an allowed string field, and the planned synthetic test covers only one known pattern."
  required_fix: "Treat allowed identity fields as strict metadata: validate them against an explicit model/provider/agent identifier grammar and reject values that look like content or credentials, rather than relying solely on redaction. Add tests for representative bearer/JWT/cloud/URL credentials and for prompt/error text supplied in every retained string position; assert the builder rejects or omits them."
- severity: medium
  category: "reader resource exhaustion / malformed data handling"
  confidence: high
  evidence: "Severity rationale: `/orchestration-stats` reads locally accumulated files, and malformed or unexpectedly large logs can cause material memory/latency failure rather than merely reducing report quality. Evidence: T2 specifies a \"streaming multi-day reader\" that enumerates daily files, but only says it parses lines and counts malformed/unsupported lines; it defines no maximum line size, per-file size, total bytes, file count, or malformed-line limit. The existing `pi/lib/metrics.ts:106-108` appends indefinitely and its 32 MiB setting is a soft marker, not hard rotation or truncation. T6 then exposes this reader synchronously through the slash command."
  required_fix: "Implement bounded reading: enforce maximum file/line/total input bytes and file count, skip/count over-limit records, and make the report terminate deterministically with a diagnostic. Test a truncated/oversized line and a large set of daily files; do not rely on the existing soft cap as an input bound."
- severity: low
  category: "test isolation / archive gate / evidence handling"
  confidence: high
  evidence: "Severity rationale: A missed isolation path can mutate the user's real telemetry, while the archive gate can pass without proving that evidence is safe or complete. Evidence: the plan requires redirecting `PI_METRICS_DIR` and `PI_OPERATOR_DIR`, but T3 acceptance only requires teardown inspection of the real current daily file; T2 also supports legacy `metrics.jsonl`, and no teardown check covers that file or all files touched by the reader. Separately, F5 is only an unchecked label (`Archive preflight complete`) with no command or acceptance criteria, while the telemetry/evidence contract permits recording a scratch metrics file path and test summaries in the plan."
  required_fix: "Set isolation variables before all relevant imports and snapshot/assert both the daily and legacy real metrics paths (and operator paths) before/after focused and full tests. Define F5 as an executable pre-archive check that scans evidence/artifacts for secrets and disallowed absolute paths, verifies no real-home mutation, and records its result before archive."
