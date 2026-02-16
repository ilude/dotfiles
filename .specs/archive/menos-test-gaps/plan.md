---
created: 2026-02-15
completed: 2026-02-15
---

# Team Plan: Menos Missing Test Gaps

## Objective

Close real test gaps that can hide production regressions, while removing stale tasks that are already complete.

## Current State Audit (Verified)

- Existing test suite already includes coverage for:
  - `tests/unit/test_llm_pricing.py`
  - `tests/unit/test_llm_metering.py`
  - `tests/unit/test_usage_router.py`
  - `tests/test_frontmatter.py`
- Existing tests already cover core `exclude_tags` behavior in content router/storage (`tests/unit/test_content_tags.py`).
- Remaining gaps are concentrated in:
  - `menos/services/youtube_metadata.py`
  - migration CLI/service behavior (`scripts/migrate.py`, `menos/services/migrator.py`)
  - content list endpoint hardening (`GET /api/v1/content`)
  - search endpoint guard coverage (`POST /search`, `embedding != NONE`, default exclusion behavior)

## Scope Changes From Previous Draft

- Removed stale "create new tests" work for pricing/metering/usage/frontmatter.
- Narrowed `exclude_tags` work to uncovered behavior in search endpoint integration with vector query.
- Corrected naming mismatches:
  - Use `published_at` (not `published_date`)
  - Use `tests/conftest.py` (not `tests/unit/conftest.py`)
- Clarified migration testing scope to avoid conflicting expectations:
  - Service-level failures should raise (`MigrationService.migrate`)
  - CLI-level commands should return expected exit codes and output

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Content list endpoint hardening | 1-2 | feature (extend tests) | sonnet | builder |
| T2: youtube_metadata unit tests | 1-2 | mechanical (new test file) | haiku | builder-light |
| T3: Search exclude/guard tests | 1 | feature (extend tests) | sonnet | builder |
| T4: migrator + migrate script tests | 2 | mechanical (new test files) | haiku | builder-light |
| V1: Wave validation | 0 | validation | sonnet | validator-heavy |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| tests-builder-1 | builder | sonnet | T1 content list hardening |
| tests-builder-2 | builder-light | haiku | T2 youtube metadata tests |
| tests-builder-3 | builder | sonnet | T3 search exclude/guard tests |
| tests-builder-4 | builder-light | haiku | T4 migration service/script tests |
| tests-validator-1 | validator-heavy | sonnet | V1 validation and lint/test gate |

## Execution Waves

### Wave 1 (parallel) - Highest Risk Gaps

- **T1: Content list endpoint hardening (`GET /api/v1/content`)** [sonnet] - builder, blockedBy: []
  - Target files: extend/create tests around content router behavior
    - Prefer `tests/unit/test_content_tags.py` and/or new `tests/unit/test_content_list.py`
  - Add tests for:
    1. `chunk_count` mapping from `get_chunk_counts()` into each response item
    2. router passes deterministic ordering `order_by="created_at DESC"` to repository
    3. response shape guarantees for required fields (`id`, `content_type`, `created_at`, `chunk_count`),
       including explicit assertion that `chunk_count` defaults to `0` when no chunks exist
  - **Acceptance Criteria**
    1. [ ] At least 2 tests verify `chunk_count` values for mixed content IDs (non-zero and zero)
       - Verification: `cd menos/api && uv run pytest tests/unit/test_content_tags.py -v -k "chunk_count or content_list"`
    2. [ ] At least 1 test verifies list endpoint calls repo with `order_by="created_at DESC"`
       - Verification: `cd menos/api && uv run pytest tests/unit/test_content_tags.py -v -k "order_by or list_content"`
    3. [ ] At least 1 test verifies response fields are present and typed correctly
       - Verification: `cd menos/api && uv run pytest tests/unit/test_content_tags.py -v -k "content_list or response"`

- **T2: `youtube_metadata.py` unit tests** [haiku] - builder-light, blockedBy: []
  - Target files:
    - new `tests/unit/test_youtube_metadata.py`
    - source `menos/services/youtube_metadata.py`
  - Add tests for:
    1. `parse_duration_to_seconds()` with representative ISO 8601 values
    2. `format_duration()` for hour+minute+second and minute+second paths
    3. `extract_urls()` (multiple URLs, punctuation cleanup, dedupe)
    4. `fetch_metadata()` and `fetch_metadata_safe()` with mocked YouTube API client
       (`googleapiclient.discovery.build`) so tests are fully offline
  - **Acceptance Criteria**
    1. [ ] Duration parsing/formatting tests pass (>= 5 assertions total)
       - Verification: `cd menos/api && uv run pytest tests/unit/test_youtube_metadata.py -v -k "duration or format"`
    2. [ ] URL extraction tests pass for multi-URL + no-URL + dedupe cases
       - Verification: `cd menos/api && uv run pytest tests/unit/test_youtube_metadata.py -v -k "extract_urls"`
    3. [ ] Metadata fetch tests pass for success + missing video + safe error handling
       - Verification: `cd menos/api && uv run pytest tests/unit/test_youtube_metadata.py -v -k "fetch_metadata"`

- **T3: Search exclude-tags and NONE embedding guards** [sonnet] - builder, blockedBy: []
  - Target files: extend `tests/unit/test_search_router.py`
  - Add tests for:
    1. default exclude behavior when `exclude_tags` is omitted (defaults to `['test']`)
    2. `tags=['test']` removing `test` from effective exclusions
    3. explicit empty exclude list (`exclude_tags=[]`) disables exclusion clause
    4. vector query includes `embedding != NONE` guard
    5. query params include/exclude tags as expected
  - **Acceptance Criteria**
    1. [ ] At least 1 test verifies omitted `exclude_tags` produces `CONTAINSNONE $exclude_tags` with `['test']`
       - Verification: `cd menos/api && uv run pytest tests/unit/test_search_router.py -v -k "exclude_tags and default"`
    2. [ ] At least 1 test verifies `tags=['test']` removes `test` from exclusions
       - Verification: `cd menos/api && uv run pytest tests/unit/test_search_router.py -v -k "tags and test and override"`
    3. [ ] At least 1 test verifies explicit `exclude_tags=[]` omits `CONTAINSNONE` clause
       - Verification: `cd menos/api && uv run pytest tests/unit/test_search_router.py -v -k "exclude_tags and empty"`
    4. [ ] At least 1 test verifies query string contains `embedding != NONE`
       - Verification: `cd menos/api && uv run pytest tests/unit/test_search_router.py -v -k "NONE or embedding"`

- **T4: Migration tests (service + CLI separation)** [haiku] - builder-light, blockedBy: []
  - Target files:
    - new `tests/unit/test_migrator.py` for `menos/services/migrator.py`
    - new `tests/unit/test_migrate_script.py` for `scripts/migrate.py`
  - Add tests for service behavior:
    1. migration discovery includes valid `.surql` names only
    2. pending migrations sorted by timestamp prefix
    3. migration failure raises `RuntimeError` and does not silently continue
  - Add tests for CLI behavior:
    1. `status` output formatting for applied/pending/none
    2. `create` normalizes filename and writes template
    3. `up` reports applied count / no pending
  - **Acceptance Criteria**
    1. [ ] Service discovery/order tests pass
       - Verification: `cd menos/api && uv run pytest tests/unit/test_migrator.py -v -k "discovery or order"`
    2. [ ] Service failure path test verifies `RuntimeError`
       - Verification: `cd menos/api && uv run pytest tests/unit/test_migrator.py -v -k "failure or error"`
    3. [ ] CLI command tests pass with mocked db/migrator
       - Verification: `cd menos/api && uv run pytest tests/unit/test_migrate_script.py -v`

### Wave 1 Validation

- **V1: Validate all new/updated tests** [sonnet] - validator-heavy, blockedBy: [T1, T2, T3, T4]
  - Run targeted files first:
    - `cd menos/api && uv run pytest tests/unit/test_youtube_metadata.py -v`
    - `cd menos/api && uv run pytest tests/unit/test_search_router.py -v`
    - `cd menos/api && uv run pytest tests/unit/test_migrator.py -v`
    - `cd menos/api && uv run pytest tests/unit/test_migrate_script.py -v`
  - Then run broad checks:
    - `cd menos/api && uv run pytest -v`
    - `cd menos/api && uv run ruff check .`

## Deferred / Already Complete (Do Not Re-Implement)

- `tests/unit/test_llm_pricing.py` exists and covers bootstrap, stale metadata, unknown model, refresh failure.
- `tests/unit/test_llm_metering.py` exists and covers usage write path, provider failure handling, context override.
- `tests/unit/test_usage_router.py` exists and covers aggregates, filters, empty results, auth.
- `tests/test_frontmatter.py` exists and covers parse/tag/title/malformed YAML cases.
- `tests/unit/test_content_tags.py` already covers much of content exclude-tag behavior; only search-specific parity remains in scope.

## Dependency Graph

```
Wave 1: T1, T2, T3, T4 (parallel) -> V1
```

## Notes

- Prefer reusing fixtures from `tests/conftest.py` (`mock_surreal_repo`, `mock_minio_storage`, `AuthedTestClient`).
- Use `MagicMock` for sync DB methods and `AsyncMock` for async boundaries.
- Keep tests deterministic (no network, no real clock dependency without freezing/mocking).
- Follow lint profile (`ruff` rules E/F/I/UP, max line length 100).
- Keep `completed:` frontmatter empty until all wave tasks and V1 are done.
