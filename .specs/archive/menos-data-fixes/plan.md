---
created: 2026-02-15
completed: 2026-02-15
---

# Team Plan: Menos Data Quality Fixes

## Objective

Fix 4 interconnected data quality issues in the menos API discovered during `/yt list` investigation:
1. `refetch_metadata.py` silently fails due to RecordID bug (never updates SurrealDB)
2. 1,317 old YouTube records lack `resource_key`, breaking dedup on re-ingestion
3. 7 confirmed stale duplicate records with bad metadata pollute listing results
4. No fallback dedup when `resource_key` lookup misses old records

Chunking restoration (Issue 1 from investigation) is explicitly **out of scope** — it's a feature addition, not a data fix.

## Project Context
- **Language**: Python 3.12+ (FastAPI, Pydantic, SurrealDB)
- **Test command**: `uv run pytest` (from `api/` directory)
- **Lint command**: `uv run ruff check menos/`
- **Migration pattern**: `YYYYMMDD-HHMMSS_description.surql` in `api/migrations/`
- **Key gotcha**: SurrealDB `WHERE id = $param` requires `RecordID` objects, not plain strings. Plain strings silently match nothing.
- **Deploy**: Ansible via Docker, migrations run automatically on app startup

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Fix refetch_metadata.py RecordID bug | 2 | mechanical | haiku | builder-light |
| T2: Migration: backfill resource_key | 1 (new) | mechanical | haiku | builder-light |
| T3: Migration: delete stale duplicates | 1 (new) | mechanical | haiku | builder-light |
| T4: Add video_id fallback dedup in ingest | 3 | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| fix-builder-1 | builder-light | haiku | T1: refetch_metadata.py RecordID fix |
| fix-builder-2 | builder-light | haiku | T2: resource_key backfill migration |
| fix-builder-3 | builder-light | haiku | T3: delete stale duplicates migration |
| fix-builder-4 | builder | sonnet | T4: video_id fallback dedup |
| fix-validator-1 | validator-heavy | sonnet | Wave 1 validation |

## Execution Waves

### Wave 1 (parallel)

All 4 implementation tasks are code-independent and can run simultaneously.

- **T1**: Fix `refetch_metadata.py` RecordID bug [haiku] — builder-light
- **T2**: Create migration to backfill `resource_key` [haiku] — builder-light
- **T3**: Create migration to delete stale duplicate records [haiku] — builder-light
- **T4**: Add `video_id` fallback dedup in ingest [sonnet] — builder

### Wave 1 Validation
- **V1**: Validate all wave 1 changes [sonnet] — validator-heavy, blockedBy: [T1, T2, T3, T4]

## Dependency Graph
Wave 1: T1, T2, T3, T4 (parallel) → V1

## Task Details

### T1: Fix refetch_metadata.py RecordID bug

**File**: `api/scripts/refetch_metadata.py`

**Change**: Line 126 passes `"id": item.id` (plain string) to `WHERE id = $id`. Must pass a SurrealDB `RecordID` object.

Important nuance: `item.id` may be either `abc123` or `content:abc123` depending on source path/tests. Normalize before constructing RecordID:
- `raw_id = str(item.id).split(":")[-1]`
- `"id": RecordID("content", raw_id)`

Also add `from surrealdb import RecordID` import.

**Acceptance Criteria**:
1. [ ] `from surrealdb import RecordID` is imported in `refetch_metadata.py`
    - Verification: `grep "from surrealdb import RecordID" api/scripts/refetch_metadata.py`
    - Expected: Line found
2. [ ] The UPDATE query parameter uses normalized RecordID (`RecordID("content", raw_id)`) instead of raw `item.id`
    - Verification: Read `refetch_metadata.py` UPDATE parameter construction
    - Expected: ID normalization step exists and final param is a `RecordID`
3. [ ] Unit test coverage validates RecordID usage when input ID includes table prefix (`content:...`)
    - Verification: `grep -n "RecordID\|content:" api/tests/unit/test_refetch_script.py`
    - Expected: Test asserts DB query receives RecordID-compatible ID handling for prefixed IDs

### T2: Migration: backfill resource_key on old YouTube records

**File**: `api/migrations/20260216-010000_backfill_resource_key.surql` (new)

**Change**: UPDATE all YouTube content records that have `metadata.resource_key IS NONE` to set `metadata.resource_key = string::concat("yt:", metadata.video_id)`. Only update records where `metadata.video_id IS NOT NONE`.

**Acceptance Criteria**:
1. [ ] Migration file exists at `api/migrations/20260216-010000_backfill_resource_key.surql`
   - Verification: `ls api/migrations/20260216-010000_backfill_resource_key.surql`
   - Expected: File exists
2. [ ] SQL updates `metadata.resource_key` using `string::concat("yt:", metadata.video_id)`
   - Verification: `cat api/migrations/20260216-010000_backfill_resource_key.surql`
   - Expected: Contains UPDATE with correct concat and WHERE guards
3. [ ] Only targets `content_type = 'youtube'` AND `metadata.resource_key IS NONE` AND `metadata.video_id IS NOT NONE`
    - Verification: Read migration file
    - Expected: All 3 WHERE conditions present
4. [ ] Migration is idempotent (safe to run multiple times)
    - Verification: Read WHERE guards
    - Expected: Re-running does not change rows already backfilled

### T3: Migration: delete stale duplicate records

**File**: `api/migrations/20260216-010100_delete_stale_duplicates.surql` (new)

**Change**: Delete the 7 confirmed stale duplicate content records identified by investigation. These are records with generic titles ("YouTube: {id}") that are duplicates of existing good records.

Known stale duplicate record IDs (from investigation agents):
- `uyeyshacj06fk7pgnsvn` (wmIpFQdkPJQ duplicate, 2026-02-10)
- `u0fpb8dkryc9r6jm2r2q` (Sf4oD_1p88Y duplicate, 2026-02-10)
- `vs5kvmwpp12ulku994b3` (4_2j5wgt_ds duplicate)
- `tjqk2zu3udixpzhjlncl` (T9DB2HF4VTE duplicate)
- `rg3e4ry6x6qmgypetmi2` (rMADSuus6jg duplicate)
- `tq417yl4e7aibvm6kem5` (RpvQH0r0ecM duplicate)
- `iy8xs1d8brupwqa39ki5` (QzZ97noEapA duplicate, failed pipeline)

Also delete any chunks associated with these records.

**IMPORTANT**: Use `content:` prefix for content records, e.g., `DELETE content:uyeyshacj06fk7pgnsvn`. SurrealDB DELETE uses `table:id` format directly, NOT `WHERE id = $param` with RecordID.

Also remove associated chunks with a deterministic bulk delete by `content_id` using the same ID list.

**Acceptance Criteria**:
1. [ ] Migration file exists at `api/migrations/20260216-010100_delete_stale_duplicates.surql`
    - Verification: `ls api/migrations/20260216-010100_delete_stale_duplicates.surql`
    - Expected: File exists
2. [ ] Deletes all 7 known stale duplicate records by explicit ID
    - Verification: `grep -n "uyeyshacj06fk7pgnsvn\|u0fpb8dkryc9r6jm2r2q\|vs5kvmwpp12ulku994b3\|tjqk2zu3udixpzhjlncl\|rg3e4ry6x6qmgypetmi2\|tq417yl4e7aibvm6kem5\|iy8xs1d8brupwqa39ki5" api/migrations/20260216-010100_delete_stale_duplicates.surql`
    - Expected: All 7 IDs appear in DELETE logic
3. [ ] Also deletes associated chunks for those content IDs
    - Verification: `grep -n "DELETE .*chunk\|content_id" api/migrations/20260216-010100_delete_stale_duplicates.surql`
    - Expected: Chunk delete uses the same 7-ID set (directly or via `INSIDE` list)
4. [ ] Has a comment explaining WHY each record is being deleted
    - Verification: Read migration file
    - Expected: Each DELETE has a comment with video_id and reason
5. [ ] Migration is idempotent (safe to re-run)
    - Verification: Read DELETE strategy
    - Expected: Re-running is no-op once rows are gone

### T4: Add video_id fallback dedup in ingest

**Files**: `api/menos/routers/ingest.py`, `api/menos/services/storage.py`

**Change**: In `_ingest_youtube()` (ingest.py), after `find_content_by_resource_key()` returns None, add a fallback lookup by `metadata.video_id`. Add a `find_content_by_video_id()` method to `SurrealDBRepository` in storage.py. Add/extend unit tests in `api/tests/unit/test_ingest_router.py`.

**Details**:
- New method `find_content_by_video_id(video_id: str)` in storage.py that queries YouTube content by `metadata.video_id` with deterministic ordering (for duplicate safety), e.g. `ORDER BY created_at DESC, id DESC LIMIT 1`
- In ingest.py `_ingest_youtube()`, after line ~184 where `existing` is checked, if `existing is None`, try `find_content_by_video_id(video_id)`
- If fallback finds an existing record, backfill its `resource_key` (so future lookups use the fast path) and return it as the existing record
- Use plain string for `video_id` parameter (not RecordID — `metadata.video_id` stores plain strings)

**Acceptance Criteria**:
1. [ ] `find_content_by_video_id` method exists in `storage.py`
    - Verification: `grep "find_content_by_video_id" api/menos/services/storage.py`
    - Expected: Method definition found
2. [ ] Method uses plain string parameter (not RecordID) for video_id
    - Verification: Read the method implementation
    - Expected: `$video_id` param is a plain string
3. [ ] Method is deterministic when duplicates exist
    - Verification: Read query implementation
    - Expected: Includes explicit `ORDER BY` (not just `LIMIT 1`)
4. [ ] Fallback lookup is called in `_ingest_youtube` when `resource_key` lookup returns None
    - Verification: `grep -A5 "find_content_by_video_id" api/menos/routers/ingest.py`
    - Expected: Called after resource_key check fails
5. [ ] When fallback finds existing record, backfills its `resource_key`
    - Verification: Read the fallback code path in ingest.py
    - Expected: UPDATE sets `metadata.resource_key` on the found record
6. [ ] Unit tests cover fallback hit, fallback miss, and fallback-hit resource_key backfill
    - Verification: `grep -n "find_content_by_video_id\|resource_key" api/tests/unit/test_ingest_router.py`
    - Expected: Tests exist for all three scenarios
7. [ ] Unit tests pass: `cd api && uv run pytest tests/unit/ -v`
    - Verification: Run test command
    - Expected: All tests pass
8. [ ] Lint passes: `cd api && uv run ruff check menos/`
    - Verification: Run lint command
    - Expected: No errors

## Execution Safety Checks

Run these checks before and after implementation to avoid regressions and verify outcomes:

1. Baseline before changes
   - `cd api && uv run pytest tests/unit/test_refetch_script.py -v`
   - `cd api && uv run pytest tests/unit/test_ingest_router.py -v`

2. Post-change targeted verification
   - `cd api && uv run pytest tests/unit/test_refetch_script.py -v`
   - `cd api && uv run pytest tests/unit/test_ingest_router.py -v`

3. Full required checks
   - `cd api && uv run pytest tests/unit/ -v`
   - `cd api && uv run ruff check menos/`

4. Migration sanity checks (manual query verification in staging)
   - Confirm number of YouTube records still missing `metadata.resource_key`
   - Confirm all 7 stale duplicate content IDs are absent
   - Confirm no chunk rows remain for the 7 deleted content IDs
