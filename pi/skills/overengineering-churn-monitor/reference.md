# Overengineering Churn Detection Screens

## Batch-file pattern

Run from the dotfiles repository root. Put each SQL block in the named file under the ignored scratch directory; do not pass these expressions through a shell argument.

```bash
mkdir -p .tmp/pi-log-analytics
uv run --no-sync --project pi/analytics python pi/analytics/pi_log_query.py \
  --source session_entries \
  batch .tmp/pi-log-analytics/SCREEN.sql --format jsonl --limit 1000
```

| Rule | Requirement |
| --- | --- |
| Source | Use canonical `session_entries`; do not union archived history. |
| Window | Screens use the most recent 14 days. |
| Output | Emit filenames, tool names, hashes, and counts only. Never select raw result content. |
| Interpretation | Every hit requires bounded manual review; a hit is not a prevalence or causality claim. |
| Malformed input | Stop on helper failure. Follow `pi-log-analytics` validation guidance rather than using `--ignore-malformed` silently. |

## RG-1 identical-edit retry loop

Save this already-verified query as `.tmp/pi-log-analytics/rg-1-identical-edit.sql`. It is a candidate screen only: result equality does not establish materially equivalent arguments, target, or relevant state.

```sql
WITH tr AS (SELECT filename, json_extract_string(message,'$.toolName') AS tool_name, md5(coalesce(json_extract_string(message,'$.content'),'')) AS result_hash, try_cast(json_extract(message,'$.isError') AS BOOLEAN) AS is_error FROM session_entries WHERE type='message' AND json_extract_string(message,'$.role')='toolResult' AND try_cast(timestamp AS TIMESTAMPTZ) >= current_timestamp - INTERVAL '14 days') SELECT filename, tool_name, result_hash, count(*) AS identical_failures FROM tr WHERE is_error AND tool_name IN ('edit','write','text_edit','structured_edit') GROUP BY 1,2,3 HAVING count(*) >= 3 ORDER BY identical_failures DESC
```

## RG-3 cross-client write

Save as `.tmp/pi-log-analytics/rg-3-cross-client-write.sql`. The RE2 expressions use no lookahead. The query joins `session_inventory` because working directory metadata belongs to the session, then emits no matched content.

```sql
WITH tr AS (
  SELECT
    e.filename,
    json_extract_string(e.message, '$.toolName') AS tool_name,
    md5(coalesce(json_extract_string(e.message, '$.content'), '')) AS result_hash,
    try_cast(json_extract(e.message, '$.isError') AS BOOLEAN) AS is_error,
    si.cwd,
    coalesce(json_extract_string(e.message, '$.content'), '') AS result_content
  FROM session_entries AS e
  JOIN session_inventory AS si ON si.source_file = e.filename
  WHERE e.type = 'message'
    AND json_extract_string(e.message, '$.role') = 'toolResult'
    AND try_cast(e.timestamp AS TIMESTAMPTZ) >= current_timestamp - INTERVAL '14 days'
)
SELECT filename, tool_name, result_hash, count(*) AS cross_client_results
FROM tr
WHERE is_error = false
  AND tool_name IN ('edit', 'write', 'text_edit', 'structured_edit')
  AND regexp_matches(lower(coalesce(cwd, '')), '(^|[\\/])\\.dotfiles[\\/]?$')
  AND regexp_matches(lower(result_content), '(^|[^a-z0-9_.-])(claude|opencode|copilot)[\\/]')
GROUP BY 1, 2, 3
ORDER BY cross_client_results DESC, filename, tool_name;
```

Review each hit for owning-client scope and explicit authorization. Authorized cross-client work is not an incident.

## RG-2 duplicate verification

Save as `.tmp/pi-log-analytics/rg-2-duplicate-verification.sql`. This deliberately screens all successful tools because validator entrypoints vary. Manually determine whether repeated results were verification and whether inputs, relevant state, or normalized failure signature changed.

```sql
WITH tr AS (
  SELECT
    filename,
    json_extract_string(message, '$.toolName') AS tool_name,
    md5(coalesce(json_extract_string(message, '$.content'), '')) AS result_hash,
    try_cast(json_extract(message, '$.isError') AS BOOLEAN) AS is_error
  FROM session_entries
  WHERE type = 'message'
    AND json_extract_string(message, '$.role') = 'toolResult'
    AND try_cast(timestamp AS TIMESTAMPTZ) >= current_timestamp - INTERVAL '14 days'
)
SELECT filename, tool_name, result_hash, count(*) AS identical_successes
FROM tr
WHERE is_error = false
GROUP BY 1, 2, 3
HAVING count(*) >= 3
ORDER BY identical_successes DESC, filename, tool_name;
```

Mandatory, user-requested, safety, and independently held-out checks are not duplicate-verification incidents merely because their output matches.

## Metadata outliers

Save as `.tmp/pi-log-analytics/metadata-outliers.sql`. The wide-margin thresholds are four times the artifact-reported post-cohort medians: 20 user messages from a median of 5, or 40,140.676 seconds from a median of 10,035.169 seconds. These are triage thresholds, not causal cutoffs.

```sql
WITH recent AS (
  SELECT
    source_file AS filename,
    entry_count,
    user_messages,
    assistant_messages,
    tool_results,
    extract(epoch FROM (last_event_at - started_at)) AS duration_seconds
  FROM session_inventory
  WHERE started_at >= current_timestamp - INTERVAL '14 days'
    AND started_at IS NOT NULL
    AND last_event_at IS NOT NULL
)
SELECT
  filename,
  entry_count,
  user_messages,
  assistant_messages,
  tool_results,
  round(duration_seconds, 3) AS duration_seconds
FROM recent
WHERE user_messages >= 20
   OR duration_seconds >= 40140.676
ORDER BY duration_seconds DESC, user_messages DESC, filename;
```

Compare flagged values with the baseline snapshot in `SKILL.md`. Do not compare `tool_results` directly with the report's `tool-call blocks`; they are different measures.

## RG-4 manual review

| Step | Procedure |
| ---: | --- |
| 1 | Use the `pi-log-analytics` workflow outcome recipe over `workflow_episodes` to identify recent explicit workflow entrypoints by command and time. |
| 2 | For candidate episodes, review bounded user-feedback records for rejection of mandatory ceremony or scope mismatch. |
| 3 | Distinguish a rejected mandate from a required or user-requested workflow. Workflow volume alone is insufficient. |
| 4 | Retain only sanitized report-style citations and metadata; do not copy raw feedback or workflow payloads into tracked files. |

RG-4-class universal mandates were already reduced by GIT-009 through GIT-011 in `pi/docs/pi-research-report.md`.
