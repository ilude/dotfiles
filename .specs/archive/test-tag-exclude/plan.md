---
created: 2026-02-15
completed: 2026-02-15
---

# Team Plan: Remove YouTube Router & Add Default Test Tag Exclusion

## Objective

Remove the YouTube-specific API endpoints (`/api/v1/youtube/*`) and consolidate onto the unified content endpoints. Add `exclude_tags` support with a default of `["test"]` so test content (like the Rick Astley video) is hidden from production listings and searches unless explicitly requested. Update CLI scripts, tests, and documentation accordingly.

## Project Context

- **Language**: Python 3.12+ (FastAPI, Pydantic, SurrealDB)
- **Test command**: `cd menos/api && uv run pytest`
- **Lint command**: `cd menos/api && uv run ruff check menos/`

## Key Technical Decisions

- **SurrealQL**: Use `tags CONTAINSNONE $exclude_tags` when `exclude_tags` is non-empty
- **Default behavior**: Omitted `exclude_tags` means `exclude_tags=["test"]` on unified list/search endpoints
- **Override behavior**:
  - `exclude_tags=` (empty string) means no tag exclusion
  - if include filter contains `test` (for example `tags=test`), remove `test` from effective exclusions so test content can be returned
- **YouTube video_id lookup**: After removing the YouTube router, video_id lookup is lost. The ingest response already returns content IDs. For follow-up queries, use `GET /api/v1/content/{id}`. The `/yt` skill will store the content_id from ingest responses.

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Add exclude_tags to API | 4 | feature | sonnet | builder |
| T2: Remove YouTube router | 3 | mechanical | haiku | builder-light |
| T3: Migration to tag test content | 1 | mechanical | haiku | builder-light |
| T4: Update CLI scripts + /yt skill | 3 | feature | sonnet | builder |
| T5: Update tests | 5+ | feature | sonnet | builder |
| T6: Update docs/rules | 3 | mechanical | haiku | builder-light |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| test-tag-builder-1 | builder | sonnet | Add exclude_tags to storage + routers |
| test-tag-builder-2 | builder-light | haiku | Remove YouTube router + migration |
| test-tag-builder-3 | builder | sonnet | Update CLI scripts + tests |
| test-tag-builder-4 | builder-light | haiku | Update docs/rules |
| test-tag-validator-1 | validator-heavy | sonnet | Wave validation |

## Execution Waves

### Wave 1 (parallel) — Backend API Changes

**T1: Add exclude_tags support to storage layer + routers** [sonnet] — builder

Files: `menos/api/menos/services/storage.py`, `menos/api/menos/routers/content.py`, `menos/api/menos/routers/search.py`, `menos/api/menos/models.py` (if SearchQuery is there)

Changes:
1. `storage.py` — `list_content()` method:
   - Add param `exclude_tags: list[str] | None = None`
   - Default to `["test"]` if None at the service level
   - Add SurrealQL WHERE clause: `tags CONTAINSNONE $exclude_tags`
   - If caller passes `exclude_tags=[]` explicitly, skip the clause entirely

2. `storage.py` — search query builder (vector search):
   - Same exclude_tags pattern in the WHERE clause for chunk/content queries

3. `content.py` — `list_content()` endpoint:
   - Add query param: `exclude_tags: str | None = Query(default=None, description="Comma-separated tags to exclude (default: test when omitted). Pass empty string to include all.")`
   - Parse rules:
     - omitted (`None`) → `["test"]`
     - empty string (`""`) → `[]` (no exclusion)
     - non-empty string → split on comma, trim whitespace, drop empty values
   - If `tags` include filter contains `test`, remove `test` from effective exclusions before calling storage
   - Pass to `surreal_repo.list_content(exclude_tags=...)`

4. `search.py` — `SearchQuery` model:
   - Add field: `exclude_tags: list[str] | None = None`
   - In the search handler, default to `["test"]` only when field is omitted; respect explicit empty list
   - If `tags` include filter contains `test`, remove `test` from effective exclusions
   - Thread through to storage query

Acceptance Criteria:
1. [ ] `GET /api/v1/content?content_type=youtube&tags=test` returns test-tagged results
   - Verification: `cd menos/api && PYTHONPATH=. uv run python scripts/signed_request.py GET "/api/v1/content?content_type=youtube&tags=test"`
   - Expected: Response includes Rick Astley video when `tags=test` is passed
2. [ ] `GET /api/v1/content` without params excludes test-tagged content
   - Verification: `cd menos/api && PYTHONPATH=. uv run python scripts/signed_request.py GET "/api/v1/content?content_type=youtube"` omits test-tagged videos
   - Expected: Rick Astley video not in response
3. [ ] `GET /api/v1/content?exclude_tags=` (empty) returns all content including test
   - Verification: Pass empty exclude_tags param
   - Expected: All content returned
4. [ ] `POST /api/v1/search` mirrors tag/include exclusion behavior
   - Verification: `cd menos/api && uv run pytest tests/integration/ -k "search and exclude_tags" -x -q`
   - Expected: Search excludes `test` by default, and returns `test` content when include tags contain `test`
5. [ ] `cd menos/api && uv run ruff check menos/services/storage.py menos/routers/content.py menos/routers/search.py` passes
   - Expected: No lint errors

---

**T2: Remove YouTube router** [haiku] — builder-light

Files: `menos/api/menos/routers/youtube.py` (delete), `menos/api/menos/main.py` (edit)

Changes:
1. Delete `menos/api/menos/routers/youtube.py`
2. `main.py` — Remove `youtube` from router imports (line ~24) and remove `app.include_router(youtube.router, prefix="/api/v1")` (line ~192)

Acceptance Criteria:
1. [ ] `menos/api/menos/routers/youtube.py` does not exist
   - Verification: `python -c "from pathlib import Path; assert not Path('menos/api/menos/routers/youtube.py').exists()"`
   - Expected: Command exits successfully
2. [ ] `youtube` not referenced in main.py
   - Verification: `python -c "from pathlib import Path; text=Path('menos/api/menos/main.py').read_text(); assert 'from menos.routers import youtube' not in text; assert 'app.include_router(youtube.router, prefix=\"/api/v1\")' not in text"`
   - Expected: YouTube router import and include call are removed
3. [ ] `cd menos/api && uv run ruff check menos/main.py` passes
   - Expected: No lint errors

---

**T3: SurrealDB migration to tag test content** [haiku] — builder-light

Files: New migration file in `menos/api/migrations/`

Changes:
1. Create migration: `YYYYMMDD-HHMMSS_tag_test_content.surql`
2. SurrealQL (idempotent): `UPDATE content SET tags += "test" WHERE metadata.video_id = "dQw4w9WgXcQ" AND (tags = NONE OR NOT (tags CONTAINS "test"));`
3. Follow existing migration naming convention (check latest migration for next sequence)

Acceptance Criteria:
1. [ ] Migration file exists with correct naming convention
   - Verification: `python -c "from pathlib import Path; import re; files=[p.name for p in Path('menos/api/migrations').glob('*.surql')]; assert any(re.match(r'^\d{8}-\d{6}_tag_test_content\.surql$', f) for f in files)"`
   - Expected: At least one migration matches `YYYYMMDD-HHMMSS_tag_test_content.surql`
2. [ ] Migration contains UPDATE statement targeting video_id dQw4w9WgXcQ
   - Verification: `python -c "from pathlib import Path; p=next(Path('menos/api/migrations').glob('*tag_test*.surql')); assert 'dQw4w9WgXcQ' in p.read_text()"`
   - Expected: Match found
3. [ ] Migration uses `tags +=` to append (not overwrite)
   - Verification: `python -c "from pathlib import Path; p=next(Path('menos/api/migrations').glob('*tag_test*.surql')); assert 'tags +=' in p.read_text()"`
   - Expected: Match found
4. [ ] Migration is idempotent and does not duplicate `test` tag
   - Verification: `python -c "from pathlib import Path; p=next(Path('menos/api/migrations').glob('*tag_test*.surql')); t=p.read_text(); assert 'tags = NONE' in t and 'NOT (tags CONTAINS \"test\")' in t"`
   - Expected: Guard condition exists

### Wave 1 Validation

- V1: Validate wave 1 [sonnet] — validator-heavy, blockedBy: [T1, T2, T3]
  - Verify all acceptance criteria for T1, T2, T3
  - Run: `cd menos/api && uv run ruff check menos/`
  - Run: `cd menos/api && uv run pytest tests/integration/ -k content -x -q` (targeted validation for changed API behavior)
  - Check no import errors from removed youtube router
  - Note: Full unit suite is validated in Wave 2 after T5 updates/removals

---

### Wave 2 (parallel) — CLI, Tests, Docs

**T4: Update CLI scripts and /yt skill** [sonnet] — builder

Files: `~/.claude/commands/yt/list_videos.py`, `~/.claude/commands/yt/ingest_video.py`

Changes:
1. `list_videos.py`:
   - Switch from `GET /api/v1/youtube?limit=N` to `GET /api/v1/content?content_type=youtube&limit=N`
   - Response shape changes: adapt field mapping (ContentList has `items` array with `ContentItem` objects)
   - Add `--all` flag to pass `exclude_tags=` (empty) to include test content
   - Add `--test` flag to pass `tags=test&exclude_tags=` to show only test content
   - Display tags in output for visibility

2. `ingest_video.py`:
   - Add `--test` flag that passes tags=["test"] to the ingest request body
   - Check how ingest endpoint accepts tags (query params vs body)

Acceptance Criteria:
1. [ ] `cd ~/.claude/commands/yt && uv run python list_videos.py 5` runs without error
   - Verification: `cd ~/.claude/commands/yt && uv run python list_videos.py 5`
   - Expected: Lists up to 5 videos, no Rick Astley (after deploy)
2. [ ] `list_videos.py --all` shows all videos including test-tagged
   - Verification: `cd ~/.claude/commands/yt && uv run python list_videos.py 5 --all`
   - Expected: Output includes test-tagged videos
3. [ ] `ingest_video.py --help` shows --test flag
   - Verification: `cd ~/.claude/commands/yt && uv run python ingest_video.py --help`
   - Expected: --test flag documented in help output
4. [ ] No syntax errors in modified scripts
   - Verification: `cd ~/.claude/commands/yt && uv run python -c "import ast, pathlib; ast.parse(pathlib.Path('list_videos.py').read_text()); ast.parse(pathlib.Path('ingest_video.py').read_text())"`
   - Expected: No errors

---

**T5: Update tests** [sonnet] — builder

Files: `menos/api/tests/unit/test_youtube_router.py` (delete), `menos/api/tests/unit/test_youtube.py` (keep if service-level), `menos/api/tests/integration/test_youtube.py` (update), `menos/api/tests/smoke/test_youtube_smoke.py` (update), new test files for exclude_tags

Changes:
1. Delete `tests/unit/test_youtube_router.py` (tests the removed router)
2. Review `tests/unit/test_youtube.py` — keep if it tests the YouTube service (transcript fetching), not the router
3. Update `tests/integration/test_youtube.py` — remove tests hitting `/api/v1/youtube` endpoints, add tests using unified `/api/v1/content?content_type=youtube`
4. Update `tests/smoke/test_youtube_smoke.py` — update endpoint URLs from `/api/v1/youtube` to unified equivalents
5. Add unit tests for exclude_tags behavior:
   - Test default exclusion (no exclude_tags param → test content hidden)
   - Test explicit exclusion override (exclude_tags=[] → all content shown)
   - Test tags + exclude_tags interaction
   - Add to `tests/unit/test_content_tags.py` or new file

Acceptance Criteria:
1. [ ] `test_youtube_router.py` deleted
   - Verification: `python -c "from pathlib import Path; assert not Path('menos/api/tests/unit/test_youtube_router.py').exists()"`
   - Expected: Command exits successfully
2. [ ] `cd menos/api && uv run pytest tests/unit/ -x -q` passes
   - Expected: All unit tests pass, no import errors
3. [ ] At least 3 new test cases for exclude_tags behavior exist
   - Verification: `python -c "from pathlib import Path; n=sum(p.read_text().count('exclude_tags') for p in Path('menos/api/tests/unit').glob('test_content*.py')); assert n >= 3"`
   - Expected: 3+ matches
4. [ ] `cd menos/api && uv run ruff check menos/ tests/`
   - Expected: No lint errors

---

**T6: Update documentation and rules** [haiku] — builder-light

Files: `menos/.claude/rules/api-reference.md`, `menos/.claude/rules/troubleshooting.md`, new or updated rules file

Changes:
1. `api-reference.md`:
   - Remove entire `### YouTube` section (5 endpoints)
   - Add `exclude_tags` param documentation to Content and Search endpoint sections
   - Note default `exclude_tags=test` behavior

2. `menos/.claude/rules/troubleshooting.md` or new `menos/.claude/rules/test-content.md`:
   - Document the test tag workflow:
     - How to ingest test content (`--test` flag)
     - How to view test content (pass `exclude_tags=` or `tags=test`)
     - How to tag existing content as test (`PATCH /api/v1/content/{id}` with tags)
     - Why test content is excluded by default
   - Development vs production content visibility

3. Update `menos/.claude/rules/gotchas.md` if relevant (e.g., "test content won't appear in default queries")

Acceptance Criteria:
1. [ ] No `/api/v1/youtube` references in api-reference.md
   - Verification: `python -c "from pathlib import Path; assert '/youtube' not in Path('menos/.claude/rules/api-reference.md').read_text()"`
   - Expected: 0 matches
2. [ ] `exclude_tags` documented in api-reference.md for Content and Search endpoints
   - Verification: `python -c "from pathlib import Path; assert Path('menos/.claude/rules/api-reference.md').read_text().count('exclude_tags') >= 2"`
   - Expected: 2+ matches
3. [ ] Test content workflow documented in rules
   - Verification: `python -c "from pathlib import Path; files=[p for p in Path('menos/.claude/rules').glob('*.md') if 'test' in p.read_text().lower() and 'tag' in p.read_text().lower()]; assert files"`
   - Expected: At least one file with test tag workflow docs

### Wave 2 Validation

- V2: Validate wave 2 [sonnet] — validator-heavy, blockedBy: [T4, T5, T6]
  - Verify all acceptance criteria for T4, T5, T6
  - Run: `cd menos/api && uv run pytest tests/unit/ -x -q`
  - Run: `cd menos/api && uv run ruff check menos/ tests/`
  - Verify documentation consistency (no stale YouTube endpoint references across all rules files)

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4, T5, T6 (parallel, blockedBy V1) → V2
```

## Post-Deploy Steps (manual)

After deploying the updated API:
1. Migrations run automatically on startup — Rick Astley gets tagged "test"
2. Verify: `GET /api/v1/content?content_type=youtube` should not show Rick Astley
3. Verify: `GET /api/v1/content?tags=test` should show Rick Astley
4. Run smoke tests: `cd menos/api && uv run pytest tests/smoke/ -m smoke -v`
