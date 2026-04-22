# Mental Model Skill

Manage your expertise memory -- a raw append-only history plus a compact mental-model snapshot that grows across sessions.

## Source of Truth vs Snapshot

Each agent has a **two-layer** expertise system. Each layer has its own log and snapshot:

```text
# Global layer (legacy path -- always present)
{agent}-expertise-log.jsonl          # global append-only source of truth
{agent}-mental-model.json            # global snapshot
{agent}-mental-model.state.json      # global snapshot state

# Project-local layer (one directory per repo ID slug)
{repo-id-slug}/
  repo-id.json                       # persisted remote identity for drift detection
  {agent}-expertise-log.jsonl        # project-local append-only source of truth
  {agent}-mental-model.json          # project-local snapshot
  {agent}-mental-model.state.json    # project-local snapshot state
```

- The **JSONL log** is the source of truth in each layer. `append_expertise` only appends; it never rewrites.
- The **mental-model snapshot** is derived from the raw log and is the preferred read path for `read_expertise`.
- The snapshot exists to reduce token use and remove repetition without deleting historical evidence.
- Any future model-assisted similarity remains provider-gated, optional, and disabled by default.

Full layering spec (repo ID derivation, read order, dedupe rules, migration, safety):
`pi/docs/expertise-layering.md`

### Write routing

| Condition | Write destination |
|---|---|
| Inside a git repo, `sensitive_repo` not set | Project-local layer (`{repo-id-slug}/`) |
| Inside a git repo, `sensitive_repo: true` | Global layer only |
| Not inside a git repo | Global layer only |

`sensitive_repo` is read from `.pi/settings.json` at the repo root or `SENSITIVE_REPO=true` env var.
It is checked on every call -- no session-level caching.

### Read order: project-local first

`read_expertise` merges both layers before returning:

1. Project-local snapshot (rebuilt synchronously if stale or missing)
2. Global snapshot (appended after deduplication)

**Dedupe rule**: project-local wins on matching summary dedupe key. Global entries that
duplicate a project-local entry are suppressed from the rendered output (not deleted from disk).

**Conflict rule by category**:

| Category | Conflict resolution |
|---|---|
| `strong_decision` | Project-local entry wins; global duplicate suppressed |
| `key_file` | Project-local entry wins on matching path (case-insensitive) |
| `pattern` | Project-local entry wins on matching dedupe key |
| `observation` | Project-local entry wins; dedupe key includes project prefix |
| `open_question` | Both preserved unless dedupe key is identical |
| `system_overview` | Both preserved; project-local appears first |

### Migration and drift

Existing global files are never moved or deleted. Dual-reading begins automatically from
the first session that has a project-local directory for the current repo ID.

If the repo's remote URL or `preferredRemote` config changes (repo ID drift), the old
project-local directory is kept as a read-only dual-read source. New writes go to the new
slug directory. Drift is detected via `repo-id.json` and surfaced in `read_expertise` details.

### Safety

- **Secret redaction**: entries matching API key / private key / high-entropy patterns are
  blocked at write time. The entire entry is rejected; no partial write.
- **Sensitive-repo disable**: blocks project-local writes for the current repo; routes all
  expertise to the global layer.
- **Rollback**: the global layer is always intact. Disabling or rolling back the layered
  system restores single-layer behavior immediately -- no data loss in either direction.

## When to Read

**Always read your mental model at task start**, before doing any work. It should contain:
- System architecture you've already mapped
- Key files and their roles
- Patterns you've discovered
- Strong decisions with why they were made
- Open questions you were tracking

Load it first. It prevents re-discovering what you already know.

### Freshness rules

`read_expertise` must handle four states explicitly:

1. **Fresh snapshot** → return the compact mental model
2. **Stale snapshot** → rebuild synchronously or return the documented safe fallback; do not silently return stale knowledge
3. **Missing snapshot** → rebuild synchronously from raw history
4. **Failed prior rebuild** → keep the last known-good snapshot only if the read path also surfaces stale/failed status or repairs it before returning

Snapshot metadata should make freshness explicit, for example:
- `rebuilt_at`
- `covers_through_timestamp`
- `source_entry_count`
- `dirty` or equivalent stale/failed status

## When to Update

**Update your expertise memory after completing work**, before ending the session. Add raw entries for:
- New patterns discovered during this session
- Strong decisions made (always include `why_good`)
- Files you touched and their purpose
- Observations about system behavior
- Open questions you couldn't resolve

## Update Format

Raw history is appended as one JSONL record per discovery, for example:

```json
{"timestamp":"...","category":"strong_decision","entry":{"decision":"chose X over Y","why_good":"specific reason this was the right call"}}
{"timestamp":"...","category":"key_file","entry":{"path":"path/to/file.py","role":"what this file does","notes":"important details"}}
```

The mental-model snapshot is derived from those records and should preserve durable categories while consolidating noisy repetition.

## Merge Policy

Compaction must be category-aware:
- `strong_decision` → preserve durable decisions; do not over-merge on loose similarity
- `key_file` → preserve by path/role with latest useful notes
- `pattern` → consolidate repeated formulations of the same durable pattern
- `observation` → deduplicate noisy repetition conservatively
- `open_question` → preserve unresolved questions distinctly unless they are truly duplicates
- `system_overview` → keep the current high-value overview without replaying all session variants

### Optional provider-gated similarity contract

If a future similarity provider is enabled, it must stay subordinate to deterministic compaction:
- Feature/config surface is explicit and disabled by default: `expertise_similarity.enabled`, `expertise_similarity.provider`, `expertise_similarity.model`, `expertise_similarity.timeout_ms`, `expertise_similarity.min_confidence`.
- Deterministic pre-grouping is required before any model call. Do not send the whole category history to a provider.
- Allowed categories are **only** `observation`, `pattern`, and `open_question` unless the docs are explicitly expanded later.
- Prohibited categories are `strong_decision` and `key_file`; they must never enter the provider-assisted path.
- Confidence must be explicit. Results below the configured threshold, low-confidence judgments, or malformed provider output must be treated as `keep separate` and fall back to deterministic compaction.
- Provider timeout, unavailability, rate limiting, or any other failure must not break rebuilds. Continue with deterministic compaction synchronously.
- Deterministic compaction remains both the default behavior and the guaranteed fallback behavior.
- Raw JSONL remains the source of truth, and no background orchestration may append, rewrite, or delete expertise history during compaction.

## Concurrency and Safety

Concurrent agents may append to the JSONL log if the append path is serialized safely.
The snapshot, however, must be rebuilt in a way that is:
- atomic
- idempotent
- safe under interruption
- observable when stale or failed

Never replace the last known-good snapshot with a partial rebuild.

## Growth Over Sessions

Session 1: Basic patterns discovered
Session 5: Growing context, team dynamics, file ownership
Session 10: Rich patterns, complex interactions, edge cases
Session 20+: Tribal knowledge -- institutional wisdom

Each session builds on the last. The mental model is how you become smarter, not just faster.
