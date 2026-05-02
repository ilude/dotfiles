# read_expertise Focused Retrieval Contract

Status: design contract for T2. Scope: API/output contract only; no implementation code.

## Existing Files and Source of Truth

- Tool schema/handler: `pi/extensions/agent-chain.ts` (`read_expertise`).
- Snapshot builder/read helpers: `pi/lib/expertise-snapshot.ts`.
- Existing docs: `pi/docs/expertise-layering.md`, `pi/README.md`.
- Tests: `pi/tests/agent-chain.test.ts`, `pi/tests/expertise-layering.test.ts`.
- Canonical data: expertise JSONL logs, including global `{agent}-expertise-log.jsonl` and project-local layered logs under `pi/multi-team/expertise/...` or runtime equivalents.
- Derived data: snapshots and any retrieval index/cache are disposable and rebuildable.

## API Inputs

`read_expertise` preserves current callers. Existing `{ agent, mode }` calls and no-query output remain valid.

| Parameter | Type | Default | Bounds / Values | Behavior |
|---|---:|---:|---|---|
| `agent` | string | required | non-empty after trim; existing agent-name rules apply | Selects expertise files. Invalid input returns a tool error; it must not create files. |
| `mode` | string | `concise` | `concise`, `full`, `debug`; unknown values coerce to `concise` as today | Controls baseline snapshot verbosity. |
| `query` | string | omitted | trim length `1..500`; empty after trim means omitted | Activates focused retrieval when present. |
| `max_results` | integer | `5` when `query` is present | min `1`, max `20`; non-integer invalid | Caps focused retrieved items after deduplication. |

Invalid input behavior:

- Missing/empty `agent`: return validation error before filesystem reads/writes.
- `query` over 500 characters: return validation error; do not truncate silently.
- `max_results` absent: use default. `max_results < 1`, `> 20`, non-integer, `NaN`, string, or float: return validation error.
- Unknown extra fields are ignored only if the existing Pi tool framework already ignores them; implementation must not depend on them.

## Output Contract

Without `query`, output is unchanged: one text content item containing the compact snapshot or first-session message, plus existing `details` fields.

With `query`, output still returns one text content item. The text must be deterministic and use these sections, in this order:

1. Existing compact snapshot text for the selected `mode` and layers.
2. A blank line.
3. `Focused retrieval for: <query>`.
4. Up to `max_results` bullet items, each rendered as concise expertise prose. If no matches: `No focused matches found; using baseline expertise only.`

Focused item metadata such as score, source path, index state, and hash must not be included in LLM-facing text. In `debug` mode, diagnostics may appear only in `details.retrieval`.

`details.retrieval` when `query` is present:

```json
{
  "query": "string",
  "max_results": 5,
  "strategy": "lexical",
  "entry_count_considered": 0,
  "result_count": 0,
  "used_index": false,
  "rebuilt_index": false,
  "fallback_reason": "none"
}
```

Allowed `fallback_reason`: `none`, `missing_index`, `stale_index`, `corrupt_index`, `partial_index`, `rebuild_failed`, `provider_disabled`, `no_matches`, `invalid_cache_version`.

## Ranking, Deduplication, and Merge Semantics

MVP strategy is deterministic local lexical retrieval. Vector DB/provider work is not approved for T4 unless tests prove lexical retrieval cannot meet focus/token goals.

Candidate fields:

- JSONL record `category`, `timestamp`, `entry.topic`, `entry.summary`, `entry.details`, `entry.discovery`, `entry.path`, `entry.decision`, `entry.why_good`, and any string leaf values.
- Snapshot summary items may be used for rendering, but source JSONL remains canonical for retrieval/index invalidation.

Scoring order:

1. Normalize query and candidate text with lowercase Unicode text, punctuation split, and stopword-light tokenization.
2. Score exact phrase match highest.
3. Score token overlap next, weighted: `topic/decision/path` > `summary/details/discovery` > other fields.
4. Tie-break deterministically by layer precedence, category precedence, newer `timestamp`, then stable source ordinal.

Layer precedence for focused results matches current read precedence: project-local, drift if present, then global. Category precedence for ties: `strong_decision`, `key_file`, `pattern`, `observation`, `open_question`, `system_overview`.

Deduplication:

- Dedup before applying `max_results`.
- Dedup key is normalized best prose summary when available, otherwise normalized `(category + topic/decision/path + details/summary)`.
- Higher-ranked duplicate wins. If tied, earlier layer precedence wins.
- A focused item may duplicate content already shown in the baseline snapshot only if it is needed to answer the query; exact duplicate focused bullets must not repeat.

## Cache and Index Policy

Cache/index format is implementation-defined JSON, but must include:

- `index_version` fixed by implementation and bumped on schema/scoring changes.
- `agent`, `layer`, source JSONL path identity, source JSONL `mtimeMs`, byte size, and SHA-256 hash.
- Built timestamp and entry count.
- Normalized tokens/candidate references only; do not cache secrets or external provider payloads.

Invalidation:

- Rebuild when cache missing, `index_version` mismatches, source JSONL hash/mtime/size differs, source entry count differs, or cache JSON is corrupt/partial.
- Writes must be atomic using temp file then rename, matching snapshot behavior.
- Failed rebuild must not delete a last-known-good cache unless it is unreadable; fallback to direct JSONL lexical scan.
- Generated caches must be gitignored and never staged. JSONL logs remain source of truth.

## Security and Privacy

- Local deterministic retrieval is the default and required MVP gate.
- External embedding providers, vector databases, or network calls are disabled by default and require explicit opt-in in a later approved design. This T2 contract does not approve provider use.
- Do not edit `.env` files, secrets, keys, or provider credentials.
- LLM-facing output must not expose cache paths, hashes, source file paths, raw JSON, provider errors, or secrets-like strings beyond what existing expertise text already exposes.
- If corrupt, partial, or stale index data is detected, recover by rebuilding or direct JSONL scan; never throw an unhandled error for cache state.

## Fallback Behavior

- No `query`: current snapshot behavior exactly.
- `query` with missing/stale/corrupt/partial cache: rebuild; if rebuild fails, direct JSONL lexical scan; if that fails, return baseline snapshot with `details.retrieval.fallback_reason = "rebuild_failed"`.
- Provider/vector unavailable: ignore provider path and use local lexical retrieval with `fallback_reason = "provider_disabled"` only if a provider path was requested by future config.
- No matches: return baseline snapshot plus the no-matches focused line; this is not an error.
- No expertise entries: preserve first-session message; with `query`, details may include retrieval result count `0`.

## MVP Gate Decision

Approve T4 for deterministic local lexical retrieval only. It is sufficient for the MVP because it is private, reproducible, dependency-light, cacheable, and directly testable with JSONL fixtures. Revisit vector/embedding retrieval only after tests or usage show lexical retrieval misses important paraphrased expertise or fails agreed focus/token targets.

Option 3, a retrieval-first expertise system, remains future-only. Revisit it only if layered snapshot-plus-focused-retrieval cannot keep outputs focused and bounded without losing critical stable knowledge.
