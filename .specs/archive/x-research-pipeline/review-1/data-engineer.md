# Data Engineer Review: SQLite / Idempotency / Graph Integrity

## Finding 1 — HIGH: Complete snapshots can falsely mark active edges as unfollowed when pagination/cursor traversal is incomplete

**Evidence:** The plan defines `follow_snapshots.complete` and browser partial reporting, but the provider interface returns `Page[XUser]` with only `cursor` input shown and no required `next_cursor`, terminal-page marker, page count, provider total, or persisted cursor state. T2 requires “Follow edge changes emit started/ended events,” but does not gate ended events on a proven complete traversal.

**Required fix:** Define `Page` cursor semantics explicitly (`items`, `next_cursor`, `is_terminal`, optional provider total/raw page metadata). Repository logic must only emit `ended` events / set `is_active=false` after a snapshot is marked complete by exhausting all pages for `(observer_id, direction, provider)`. Persist snapshot page/cursor progress or `sync_runs` cursor metadata so retries cannot treat partial data as a full snapshot.

## Finding 2 — HIGH: `follow_edges` has no stated primary key/unique constraint, so duplicate edges can corrupt current graph state and event emission

**Evidence:** Proposed `follow_edges` columns are `observer_id`, `subject_id`, `direction`, `is_active`, timestamps. The plan says upserting the same edge twice is idempotent, but does not specify `PRIMARY KEY (observer_id, subject_id, direction)` or a unique index. Duplicate active rows would make `check-following`, mutuals, and non-mutuals inconsistent.

**Required fix:** Specify schema constraints: `follow_edges PRIMARY KEY(observer_id, subject_id, direction)`, `CHECK(direction IN ('followers','following'))`, foreign keys to `profiles(id)`, and indexes for `(observer_id, direction, is_active)` and `(subject_id, direction, is_active)`. Tests must assert duplicate inserts/upserts leave exactly one row and do not duplicate events.

## Finding 3 — MEDIUM: Event semantics are underdefined and can create duplicate or contradictory follow history

**Evidence:** `follow_events` has no primary key or uniqueness rule and only stores `event`, `event_at`, `snapshot_id`. T2 says changes emit started/ended events, but the plan does not define allowed event values, whether `event_at` is observation time vs provider time, or how repeated runs/same snapshot avoid duplicate events.

**Required fix:** Define event contract: `event IN ('started','ended')`, `event_at` means local observation time, and events are emitted only on state transitions. Add a uniqueness rule such as `UNIQUE(observer_id, subject_id, direction, event, snapshot_id)` plus repository transition tests for repeated syncs, reactivated edges, and out-of-order snapshot processing.

## Finding 4 — MEDIUM: Raw payload handling lacks provider/version/page provenance, making audits and remapping unreliable

**Evidence:** `profiles` and `tweets` include `raw_json`, while snapshots only store `provider`, `complete`, and `item_count`; `sync_runs` stores no raw request/response metadata. Provider responses are volatile, and normalized rows alone may not explain why a graph state changed after remapping bugs or provider schema changes.

**Required fix:** Store raw JSON with enough provenance: provider name, provider schema/version if available, fetched_at, source operation, and either per-row raw payload metadata or a `raw_pages`/`provider_pages` table keyed by `sync_run_id`/`snapshot_id`/cursor. At minimum, include `provider`, `source_run_id`, and raw page cursor metadata for follow snapshots.

## Finding 5 — MEDIUM: Migration/versioning requirements are too vague for durable local SQLite data

**Evidence:** T2 says “schema creation/migration helpers,” but the proposed tables omit a schema version table, migration ordering, or compatibility tests. Local encrypted snapshots may outlive code changes, so a schema drift bug could silently misread graph state.

**Required fix:** Add `schema_migrations(version PRIMARY KEY, applied_at)` or `PRAGMA user_version` policy with ordered migrations. Acceptance tests should create an older fixture DB, run migrations, and verify constraints/data survive, including follow edges, snapshots, and events.
