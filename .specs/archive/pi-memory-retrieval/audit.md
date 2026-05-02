# Pi Memory Retrieval T1 Audit

Audited files:

- `pi/multi-team/expertise/gh/ilude/dotfiles/orchestrator-mental-model.json`
- `pi/multi-team/expertise/gh/ilude/dotfiles/orchestrator-mental-model.state.json`

## Summary

| Disposition | Count | Fields |
| --- | ---: | --- |
| learned | 1 | `categories` |
| config | 5 | `schema_version` (snapshot), `summary_format_version`, `agent`, `similarity`, `schema_version` (state) |
| unused | 7 | `rebuilt_at`, `covers_through_timestamp`, `source_entry_count`, `dirty`, `rebuild_status`, `last_attempt_at`, `last_success_at` |

## Field Decisions

### `orchestrator-mental-model.json`

| Field | Disposition | Target | Notes |
| --- | --- | --- | --- |
| `schema_version` | config | `pi/multi-team/agents/orchestrator.md` / `frontmatter:schema_version` | Structural schema identifier; preserve only if a replacement contract still needs it. |
| `summary_format_version` | config | `pi/multi-team/agents/orchestrator.md` / `frontmatter:summary_format_version` | Rendering/interpretation version for summary snapshots. |
| `agent` | config | `pi/multi-team/agents/orchestrator.md` / `frontmatter:name` | Stable agent identity belongs in the agent definition. |
| `rebuilt_at` | unused | n/a | Derived snapshot build timestamp. |
| `covers_through_timestamp` | unused | n/a | Derived snapshot watermark; retrieval/index freshness should replace it. |
| `source_entry_count` | unused | n/a | Derived count, recomputable from JSONL truth. |
| `similarity` | config | `pi/multi-team/agents/orchestrator.md` / `frontmatter:expertise.similarity` | Provider/model/threshold/timeout settings are config; counters are derived. |
| `categories` | learned | `.specs/pi-memory-retrieval/retrieval-index` / JSONL-derived retrieval entries | Learned decisions, observations, patterns, key files, and questions should be replaced by retrieval over JSONL logs. |

### `orchestrator-mental-model.state.json`

| Field | Disposition | Target | Notes |
| --- | --- | --- | --- |
| `schema_version` | config | `pi/multi-team/agents/orchestrator.md` / `frontmatter:state_schema_version` | Versioning for state/index contracts belongs outside the deletable state snapshot if still needed. |
| `dirty` | unused | n/a | Old snapshot rebuild dirty bit. |
| `rebuild_status` | unused | n/a | Old snapshot generation status; superseded by retrieval index rebuild/fingerprint status. |
| `last_attempt_at` | unused | n/a | Old snapshot rebuild telemetry. |
| `last_success_at` | unused | n/a | Old snapshot rebuild telemetry. |

## T10 Guard Notes

- `config` entries in `audit-manifest.json` all include non-null `target_file` and `target_anchor`.
- `learned` content is isolated to `categories` and should be sourced from JSONL retrieval, not migrated as procedural config.
- `unused` fields are derived snapshot/state maintenance metadata and should not block deletion after the replacement retrieval/index path exists.
