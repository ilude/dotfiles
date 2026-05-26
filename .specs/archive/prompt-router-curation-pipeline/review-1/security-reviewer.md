---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "data-leakage"
  confidence: high
  evidence: "Plan pulls public agent/session traces and writes raw/cache files plus candidates under `pi/prompt-routing/experiments/curation/...`; it only says outputs \"should be ignored by default\" and has no secret/PII scan gate before final archive or before any later manual promotion."
  required_fix: "Add mandatory `.gitignore` coverage verification and a secret/PII scan gate over all generated JSONL/cache/summary files before F5. Fail archive if any generated file is tracked/staged or contains credential patterns, private keys, tokens, emails, or local paths beyond allowed metadata."
- severity: medium
  category: "license-compliance"
  confidence: high
  evidence: "T2 requires `source_license` metadata, but no gate rejects incompatible, unknown, missing, or non-redistributable licenses. The plan includes multiple external datasets with differing terms and later retraining/promotion is an explicit future path."
  required_fix: "Add an allowlist/denylist license policy in the source registry. Rows from missing/unknown/incompatible licenses must be `reject` or skipped, and summary must include license counts. Add tests proving unknown licenses cannot be auto-accepted."
- severity: medium
  category: "network-supply-chain"
  confidence: medium
  evidence: "Network pulls are allowed from external sources, but the plan does not require pinned dataset revisions, content hashes, size/time limits, or schema validation before parsing. `--limit-per-source` limits normalized row count, not bytes downloaded or malicious/huge records."
  required_fix: "Require pinned revisions or immutable URLs where supported, per-source byte/time limits, max row/prompt sizes, and strict schema validation before writing. Tests should cover oversized records and ensure they are rejected without exhausting disk/memory."
- severity: medium
  category: "operational-safety"
  confidence: high
  evidence: "T3 says classifier dependency failure should not crash and T2 says skipped sources proceed. Combined with success criteria allowing exit 0 on skipped sources, the pipeline can produce empty/low-quality outputs and still pass final archive gates."
  required_fix: "Define minimum viable output thresholds: e.g., at least N valid candidates from at least M sources for network smoke, unless explicitly running fixture mode. Final gates must fail on all-sources-skipped, zero candidates, or router unavailable for all rows."
- severity: low
  category: "evidence-artifact-safety"
  confidence: medium
  evidence: "T4 says summary may include \"examples or hashes for each status\" while handoff says keep raw prompts local/ignored. Examples in `summary.md` are more likely to be inspected, copied, or accidentally tracked and may contain secrets from traces."
  required_fix: "For generated summaries, require hashes/IDs and aggregate counts by default, not raw prompt examples. If examples are needed, redact secrets/PII and truncate aggressively. Add tests that summaries do not contain full prompt text."
