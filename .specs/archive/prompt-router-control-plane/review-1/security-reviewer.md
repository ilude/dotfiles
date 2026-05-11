# Security Reviewer Findings

## Finding 1
- **severity:** high
- **evidence:** Rollback uses `git restore -- pi/extensions/prompt-router.ts pi/lib/prompt-router pi/prompt-routing pi/tests/prompt-router.test.ts pi/settings.json`. It does not include newly created telemetry/eval/log fixture files, docs, state helpers, or generated JSONL artifacts from T8/T9. Archive preflight only says to confirm no secrets/raw prompts were introduced, without a concrete inventory command.
- **required_fix:** Define a rollback manifest for all files tasks may create/modify and add an archive gate that runs `git status --short`, inventories generated log/eval artifacts, and deletes or explicitly excludes prompt-containing runtime output before archive.

## Finding 2
- **severity:** high
- **evidence:** Manual validation requires routing real prompts in a local Pi session and preserving “pasted/status transcript or local screenshot note.” Status/explain/log output will include route metadata and possibly context flags; T9 also permits opt-in redacted excerpts. The plan does not require synthetic prompts, transcript redaction rules, or where the evidence may be safely stored.
- **required_fix:** Require synthetic non-secret validation prompts only. Add a manual evidence template that excludes prompt text, file paths containing sensitive project names, provider credentials, and raw excerpts. Store only sanitized status/explain fields or hashes.

## Finding 3
- **severity:** medium
- **evidence:** T9 says owner-only permissions should be applied “where possible,” with rotation and purge documentation, but does not specify log path, default permissions, retention limits, or failure behavior if permissions cannot be enforced. Prompt hashes and routing metadata can still expose sensitive workflow patterns or enable correlation.
- **required_fix:** Specify telemetry path, default disabled/enabled state, file mode expectations, max size/rotation, retention/purge command, and fail-closed behavior for raw excerpts. Add tests asserting no raw prompt/excerpt by default and permission warnings on unsupported platforms.

## Finding 4
- **severity:** medium
- **evidence:** T3 allows provider/model fallback and “explicit cross-provider fallback policy,” but acceptance criteria only assert route states and provider changes are not implicit. There is no requirement that fallback cannot cross trust boundaries when credentials are absent/misconfigured, or that logs avoid leaking provider/account identifiers.
- **required_fix:** Add hard tests for denied cross-provider fallback, missing credentials, unavailable `nano`, and policy-only `max`. Status/explain should show a sanitized provider family and explicit user-visible fallback reason without account IDs, tokens, endpoints, or environment variable values.

## Finding 5
- **severity:** medium
- **evidence:** Classifier mode validation rejects invalid modes, but the plan does not define safe failure behavior when Python execution fails, outputs malformed JSON, hangs, or returns unknown labels/confidence. Silent fallback is forbidden for modes, yet routing still needs a bounded fail-closed route decision.
- **required_fix:** Define timeout, parse-error, invalid-label, and subprocess-failure handling. Require tests that these cases produce canonical safe fallback metadata, no raw prompt in errors, bounded latency, and no crash that leaves stale previous-turn route state applied silently.
