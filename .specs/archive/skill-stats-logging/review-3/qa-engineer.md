# QA adversarial review: skill stats logging plan

## Finding 1

- **severity:** high
- **evidence:** T5 requires malformed custom content and invalid records, but the plan does not require asserting parser diagnostics/counters for skipped JSONL lines or skipped event payloads. A parser can silently drop malformed JSON, missing `content.skill`, unknown shapes, or timestamp parse failures while still producing the expected happy-path count matrix. That masks fixture drift against real session logs and makes future regressions hard to detect.
- **required_fix:** Add an explicit parser result contract and tests for `skippedMalformedJson`, `skippedInvalidSkillLoad`, `skippedInvalidTimestamp`, and `unknownShapeCount` (or equivalent). The smoke evidence must assert both usage counts and skip counters for malformed JSON, malformed `customType` payloads, missing skill fields, unknown sources, and invalid timestamps.

## Finding 2

- **severity:** high
- **evidence:** The de-duplication key is `{sessionFile, turnIdOrLineNumber, skill}` "when no better turn ID exists", and T5 mentions adjacent line numbers, but the plan does not define how line-number fallback groups multi-line same-turn evidence. In JSONL, the same skill can appear as structured `skill-load`, expanded `<skill name>`, and `/skill:name` on different adjacent entries without a shared turn id. A naive line-number key will count each entry once, so tests can pass for exact same-line duplicates while production double-counts same-turn evidence.
- **required_fix:** Define deterministic same-turn grouping for records without turn IDs (for example, bounded line adjacency plus timestamp/session message grouping) and add fixtures where the same skill appears across structured, expanded, and explicit-command evidence on adjacent lines with missing turn IDs. Assert structured evidence wins and total usage remains 1.

## Finding 3

- **severity:** medium
- **evidence:** The plan requires deterministic 1/7/30-day window boundaries with injected `now`, but does not specify inclusive/exclusive boundary semantics or timestamp normalization. A parser can pass broad tests while off-by-one-counting events exactly at `now - 1d`, `now - 7d`, or from timezone-offset ISO strings. This directly affects rolling reports.
- **required_fix:** State the window contract explicitly, e.g. count events with `timestamp >= now - windowDays` and `timestamp <= now`, parse ISO timestamps with offsets to UTC, and skip invalid/future timestamps according to a defined rule. Add fixtures for exact boundary, just-before-boundary, just-after-boundary, timezone offset, missing timestamp, and future timestamp.

## Finding 4

- **severity:** high
- **evidence:** Redaction requirements focus on evidence artifacts and output labels, but T4 forward logging can persist sensitive content if `event.systemPromptOptions.skills` includes raw skill paths, descriptions, expanded content, base dirs, or user-provided command text. T4 only says persist allowed metadata; it does not require a negative fixture/control proving disallowed fields are stripped from actual append payloads.
- **required_fix:** Add a forward-logging unit/smoke test with a mocked `before_agent_start` event containing raw absolute paths, prompt-like text, expanded skill content, token-like strings, and tool arguments. Assert the mocked `pi.appendEntry("skill-load", data)` payload contains only `schemaVersion`, normalized `skill`, safe `source`, timestamp, optional session/turn IDs, and safe `skillPathLabel`; assert no forbidden keys or sensitive substrings are present.

## Finding 5

- **severity:** medium
- **evidence:** T5 says at least one fixture mirrors real observed JSONL field names, but the plan allows proceeding if `discovery.txt` documents no real examples. That leaves the parser validated mostly against invented shapes, and a smoke import/register test will not prove it can parse actual Pi session records. The plan depends on real log shape grounding.
- **required_fix:** Make real-shape grounding a required gate for any supported evidence type. For each evidence type counted in default usage totals (`skill-load`, expanded skill block, explicit `/skill:name`), require either a redacted shape summary from real JSONL or mark that evidence type unsupported/experimental and exclude it from default totals until a real fixture exists.
