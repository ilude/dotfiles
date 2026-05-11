---
created: 2026-04-30
updated: 2026-05-11
status: completed
completed: 2026-05-11
  - T0
  - T1
  - T2
  - T3
  - V1
  - T4
  - T5
  - T6
  - V2
  - T7
  - T8
  - V3
---

# Plan: Local X research pipeline MVP

## Context & Motivation

Goal: give local agents programmatic access to X.com (Twitter) data for research workflows, starting with the immediate need: keep a local following list current and check whether candidate handles are already followed.

MVP scope is intentionally separate from menos, Birdclaw, MCP, services, and deployment. Build a local-first Python CLI with SQLite storage under `private/x/`. Use `twitterapi.io` for bulk data where credentials are available. Use browser-agent only for bounded occasional reads and validation, not graph-scale crawling.

## Decisions

- **MVP storage:** local SQLite under `private/x/x-data.sqlite`.
- **Primary MVP workflow:** following-list sync/import and candidate follow checks.
- **Bulk provider:** `twitterapi.io`.
- **Occasional provider:** browser agent against an authenticated browser session, bounded and read-only.
- **Python package model:** create an installable package at `src/x_research/`; imports use `x_research`, not `pi.x_research`.
- **CLI entrypoint:** `x-research = "x_research.cli:main"` in `pyproject.toml`.
- **PII policy:** plaintext runtime data stays gitignored under `private/`; repo-backed portable snapshots must be encrypted with `age` under `private-encrypted/` as `*.age` only.
- **Deferred integrations:** menos persistence, FastAPI service, Claude MCP, Ansible/deploy, Birdclaw compatibility, official X/xurl, and twscrape/Webshare.

## Constraints

- Windows 11 is the primary dev environment; Git Bash and PowerShell must both be considered for user-facing commands.
- Keep MVP local: no service, queue, deployment, or menos schema work.
- No X write actions: no posts, follows, likes, DMs, forms, or browser clicks that mutate account state.
- `twitterapi.io` keys and local browser/session data must never be committed.
- Browser-agent extraction must use fixed budgets, dedupe, and explicit partial-result status.
- Default test suite must be offline/mocked. Live tests are opt-in and must skip with evidence when credentials/browser state are unavailable.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| twitterapi.io REST | Managed bulk reads, no local burner-account/proxy pool | Paid provider, third-party dependency, API coverage must be verified | Selected for bulk MVP |
| Browser agent | Uses authenticated browser session, already worked for feed/profile checks | Brittle DOM, not safe for unbounded graph crawling | Selected for bounded occasional reads |
| Birdclaw | Local SQLite/archive/search direction | Follow graph support is unreleased PR code; xurl/auth friction | Reference only |
| Official X Pay-Per-Use/xurl | Sanctioned and stable | App auth and graph-scale read costs | Deferred fallback |
| twscrape + Webshare | High-volume capable, exact endpoints | Burner account/proxy operations and suspension risk | Deferred fallback |

## Objective

When the MVP is complete:

1. `uv run x-research sync following <handle> --source twitterapi-io` can populate a local following set in `private/x/x-data.sqlite`.
2. `uv run x-research check-following @a @b @c` can answer from local SQLite without live network calls.
3. A minimal provider boundary exists so browser-agent and future providers can normalize into the same models.
4. Plaintext local data remains under `private/`; encrypted snapshots can be created under `private-encrypted/x/*.age`.
5. A staged-file scanner and hook contract prevent accidental plaintext PII staging, including forced-add cases.
6. Offline tests, lint, scanner checks, and encryption round-trip evidence are written under `.specs/x-research-pipeline/evidence/`.

## Data Layout

```text
private/x/
  x-data.sqlite                 # plaintext local SQLite, gitignored
  config.local.json             # optional local provider config, gitignored
  exports/                      # plaintext temporary exports, gitignored

private-encrypted/x/
  x-data.sqlite.age             # optional encrypted snapshot, tracked
  following.json.age            # optional encrypted derived export, tracked
```

`.gitignore` must enforce:

```gitignore
private/
private-encrypted/**
!private-encrypted/
!private-encrypted/**/
!private-encrypted/**/*.age
```

`private/x/config.local.json` MVP schema:

```json
{
  "twitterapi_io": {
    "api_key": "<local secret>",
    "base_url": "https://api.twitterapi.io"
  },
  "database": {
    "path": "private/x/x-data.sqlite"
  }
}
```

Age recipient rules:

- Default public recipient file: `config/age/x-research-recipients.txt` (tracked; public recipients only).
- Private age identities must live under `private/age/` or another gitignored local path.
- Encrypt helpers must fail closed when recipients are missing or invalid.

Config rules:

- Read local config only from `private/x/config.local.json` or an explicit `--config` path.
- Never write API keys into SQLite, logs, raw payloads, dry-run output, or encrypted exports.
- Error messages and evidence files must redact credential values.

## Proposed SQLite Tables

MVP tables and constraints:

- `schema_migrations(version integer primary key, applied_at text not null)` or `PRAGMA user_version`; choose one in T2 and test it.
- `profiles(id text primary key, handle text unique not null, name text, bio text, url text, followers_count integer, following_count integer, raw_json text, updated_at text not null)`.
- `tweets(id text primary key, author_id text references profiles(id), text text not null, created_at text, raw_json text, updated_at text not null)`.
- `follow_edges(observer_id text not null references profiles(id), subject_id text not null references profiles(id), direction text not null check(direction in ('followers','following')), is_active integer not null check(is_active in (0,1)), first_seen_at text not null, last_seen_at text not null, updated_at text not null, primary key(observer_id, subject_id, direction))`.
- `follow_snapshots(id text primary key, observer_id text not null references profiles(id), direction text not null check(direction in ('followers','following')), provider text not null, complete integer not null check(complete in (0,1)), item_count integer not null, page_count integer not null default 0, next_cursor text, created_at text not null)`.
- `follow_events(id text primary key, observer_id text not null, subject_id text not null, direction text not null, event text not null check(event in ('started','ended')), event_at text not null, snapshot_id text references follow_snapshots(id), unique(observer_id, subject_id, direction, event, snapshot_id))`.
- `sync_runs(id text primary key, provider text not null, operation text not null, status text not null, started_at text not null, finished_at text, error text)`.

Indexes:

- `follow_edges(observer_id, direction, is_active)`.
- `follow_edges(subject_id, direction, is_active)`.
- `profiles(handle)`.
- `tweets(author_id, created_at)`.

Graph rules:

- `direction='following'`: observer follows subject.
- `direction='followers'`: subject follows observer.
- Only a complete snapshot may mark missing edges inactive and emit `ended` events.
- Partial/capped/browser snapshots may upsert observed active edges but must not emit `ended` events.
- `event_at` is local observation time.

Raw payload policy:

- Store normalized allowlisted fields by default.
- Full provider raw payload storage requires an explicit `--store-raw` flag.
- Raw payloads must include provenance if stored: provider, operation, fetched_at, source_run_id/snapshot_id, and provider cursor/page metadata.

## Provider Interface

Use a typed async protocol in `src/x_research/protocol.py`.

```python
class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    is_terminal: bool = True
    complete: bool = True
    source: str
    warnings: list[str] = []

class XClient(Protocol):
    async def user_by_handle(self, handle: str) -> XUser: ...
    async def following(self, handle: str, *, cursor: str | None = None, limit: int | None = None) -> Page[XUser]: ...
    async def followers(self, handle: str, *, cursor: str | None = None, limit: int | None = None) -> Page[XUser]: ...
```

Deferred protocol methods for tweets/search/home timeline may be stubbed but are not required for the first follow-list milestone unless T0 confirms they are needed.

Typed errors:

- `ProviderAuthError`
- `ProviderQuotaError`
- `ProviderRateLimitError`
- `ProviderCapabilityError`
- `ProviderTemporaryError`

## Task Breakdown

| # | Task | Files | Type | Depends On |
|---|------|-------|------|------------|
| T0 | Superseded helper cleanup check | 1 doc | research | -- |
| T1 | Python package skeleton, dependencies, CLI entrypoint, models/protocol | 5-8 | feature | T0 |
| T2 | SQLite schema, migrations, repository layer | 4-6 | feature | T1 |
| T3 | Local PII storage, scanner, hooks, age encryption guardrails | 4-7 | feature | -- |
| V1 | Validate foundation | -- | validation | T1, T2, T3 |
| T4 | twitterapi.io following/followers backend | 3-5 | feature | V1 |
| T5 | Sync CLI for following/followers | 2-4 | feature | T4 |
| T6 | Query CLI for check-following and graph summary | 2-4 | feature | T2 |
| V2 | Validate follow-list MVP | -- | validation | T5, T6 |
| T7 | Browser-agent bounded parser and optional live smoke | 2-4 | feature | V2 |
| T8 | Seed/candidate follow analysis recipe | 1-3 | docs/feature | V2 |
| V3 | Final MVP validation | -- | validation | T7, T8 |

## Execution Waves

### Wave 0: Reuse Spike

**T0: Superseded helper cleanup check**

- Description: Confirm the previous Birdclaw-oriented helper experiment is not part of the MVP. If `scripts/x-following-sync` or `scripts/x-following-check` exist, either delete them or document why they are intentionally retained outside MVP scope.
- Files: `.specs/x-research-pipeline/reuse-decision.md`.
- Acceptance Criteria:
  1. [ ] Decision note exists and states whether any old helper remains.
     - Verify: `test -f .specs/x-research-pipeline/reuse-decision.md && grep -i 'helper' .specs/x-research-pipeline/reuse-decision.md`
  2. [ ] Birdclaw is explicitly out of MVP scope unless the plan is changed.
     - Verify: `grep -i 'birdclaw.*out of MVP\|out of MVP.*birdclaw' .specs/x-research-pipeline/reuse-decision.md`
  3. [ ] No Birdclaw helper scripts remain unless justified in the decision note.
     - Verify: `test ! -e scripts/x-following-sync && test ! -e scripts/x-following-check`

### Wave 1: Foundation

**T1: Python package skeleton, dependencies, CLI entrypoint, models/protocol**

- Description: Create `src/x_research/` package. Add package config and console entrypoint. Add dependencies: `pydantic`, `httpx`, and async test tooling such as `pytest-asyncio` if async tests need it. Keep CLI `main(argv: Sequence[str] | None = None) -> int` testable without subprocess-only coupling.
- Files: `pyproject.toml`, `src/x_research/__init__.py`, `src/x_research/models.py`, `src/x_research/protocol.py`, `src/x_research/cli.py`, `tests/x_research/test_models.py`, `tests/x_research/test_protocol_stubs.py`.
- Acceptance Criteria:
  1. [ ] Clean environment sync works.
     - Verify: `uv sync`
  2. [ ] Protocol imports from package path.
     - Verify: `uv run python -c "from x_research.protocol import XClient; print(XClient)"`
  3. [ ] CLI entrypoint resolves.
     - Verify: `uv run x-research --help`
  4. [ ] Models/protocol tests pass.
     - Verify: `uv run pytest tests/x_research/test_models.py tests/x_research/test_protocol_stubs.py`

**T2: SQLite schema, migrations, repository layer**

- Description: Implement schema initialization, ordered migrations, and idempotent repository methods for profiles, snapshots, current follow edges, and follow events. Use `pathlib.Path`, explicit UTF-8 for JSON files, automatic directory creation, and `--db-path` support for CLI/tests.
- Files: `src/x_research/db.py`, `src/x_research/repository.py`, `tests/x_research/test_repository.py`.
- Acceptance Criteria:
  1. [ ] Fresh DB initializes all MVP tables, constraints, and indexes.
     - Verify: `uv run pytest tests/x_research/test_repository.py -k init`
  2. [ ] Duplicate upserts leave one edge row and do not duplicate events.
     - Verify: `uv run pytest tests/x_research/test_repository.py -k idempotent`
  3. [ ] Partial snapshots do not emit `ended` events; complete snapshots do.
     - Verify: `uv run pytest tests/x_research/test_repository.py -k snapshot_completeness`
  4. [ ] Older fixture DB migrates successfully.
     - Verify: `uv run pytest tests/x_research/test_repository.py -k migration`

**T3: Local PII storage, scanner, hooks, age encryption guardrails**

- Description: Implement privacy guardrails before live data collection. Add `.gitignore` allowlist rules, a scanner used by validation and hooks, optional hook installer, and age encrypt/decrypt helpers. Private age identities must be gitignored; public recipients come from a tracked recipient file or a documented local config path chosen in this task.
- Files: `.gitignore`, `scripts/x-private-scan`, `scripts/x-private-encrypt`, `scripts/x-private-decrypt`, `scripts/git-hooks/pre-commit-x-private`, `scripts/install-x-private-hook`, `.specs/x-research-pipeline/private-data.md`, `tests/x_research/test_private_data_scripts.py`.
- Contracts:
  - `scripts/x-private-scan --staged` reads `git diff --cached --name-only -z` and rejects `private/**` plus any non-`.age` under `private-encrypted/**`.
  - `scripts/x-private-scan --paths-from <file>` accepts NUL-delimited fixture paths for tests without mutating the real index.
  - Exit `0` means allowed; exit non-zero means blocked with redacted path-only evidence.
  - Encrypt/decrypt helpers use atomic temp files, no-overwrite by default, cleanup-on-failure, and no plaintext content in logs.
- Acceptance Criteria:
  1. [ ] Ignore/allowlist behavior is correct.
     - Verify: `git check-ignore private/x/test.json && git check-ignore private-encrypted/x/test.json && ! git check-ignore private-encrypted/x/test.json.age`
  2. [ ] Scanner rejects forced-added private files and non-age encrypted-dir files using fixture input.
     - Verify: `uv run pytest tests/x_research/test_private_data_scripts.py -k scanner`
  3. [ ] Hook installer is idempotent and verifiable.
     - Verify: `scripts/install-x-private-hook --dry-run` and documented `git config --get core.hooksPath` or `.git/hooks/pre-commit` check
  4. [ ] Age recipient missing/invalid cases fail closed; round-trip succeeds with a test recipient.
     - Verify: `uv run pytest tests/x_research/test_private_data_scripts.py -k age_round_trip`
  5. [ ] Git Bash and PowerShell can run dry-run scanner/encrypt commands.
     - Verify: commands documented in `.specs/x-research-pipeline/private-data.md`

### Wave 1 Validation Gate

**V1: Validate foundation**

- Run all T0-T3 acceptance criteria.
- Run `uv run ruff check src/x_research tests/x_research`.
- Run shell lint for new shell scripts when `shellcheck` is available: `shellcheck scripts/x-private-* scripts/install-x-private-hook scripts/git-hooks/pre-commit-x-private`.
- Write evidence files:
  - `.specs/x-research-pipeline/evidence/v1-uv-sync.txt`
  - `.specs/x-research-pipeline/evidence/v1-pytest.txt`
  - `.specs/x-research-pipeline/evidence/v1-ruff.txt`
  - `.specs/x-research-pipeline/evidence/v1-private-scan.txt`
  - `.specs/x-research-pipeline/evidence/v1-shellcheck.txt` or `.specs/x-research-pipeline/evidence/v1-shellcheck-skipped.txt`

### Wave 2: Follow-list MVP

**T4: twitterapi.io following/followers backend**

- Description: Implement only the follow-list provider surface needed for MVP: `user_by_handle`, `following`, and `followers`. Load API key from `private/x/config.local.json` or explicit `--config`. Map provider responses into local models. Preserve raw payloads only when `--store-raw` is set. Add retry/backoff for 429/5xx and typed auth/quota errors.
- Files: `src/x_research/backends/twitterapi_io_backend.py`, `src/x_research/config.py`, `tests/x_research/fixtures/twitterapi_io/*.json`, `tests/x_research/test_twitterapi_io_backend.py`.
- Acceptance Criteria:
  1. [ ] Config schema loads from `private/x/config.local.json` and redacts key in errors.
     - Verify: `uv run pytest tests/x_research/test_twitterapi_io_backend.py -k config_redaction`
  2. [ ] Mocked user/following/followers responses map to models.
     - Verify: `uv run pytest tests/x_research/test_twitterapi_io_backend.py -k mapping`
  3. [ ] Pagination fields and terminal-page semantics are tested.
     - Verify: `uv run pytest tests/x_research/test_twitterapi_io_backend.py -k pagination`
  4. [ ] 429/5xx retry then raise typed errors.
     - Verify: `uv run pytest tests/x_research/test_twitterapi_io_backend.py -k retry`

**T5: Sync CLI for following/followers**

- Description: Add CLI commands that call `TwitterApiIoBackend`, write complete snapshots to SQLite, and never emit `ended` events for incomplete pages.
- Commands:
  - `uv run x-research sync following <handle> --source twitterapi-io --db-path <path>`
  - `uv run x-research sync followers <handle> --source twitterapi-io --db-path <path>`
- Files: `src/x_research/cli.py`, `tests/x_research/test_cli_sync.py`.
- Acceptance Criteria:
  1. [ ] CLI writes mocked following/followers pages into a temp SQLite DB.
     - Verify: `uv run pytest tests/x_research/test_cli_sync.py`
  2. [ ] `--db-path` temp DB works on Windows paths.
     - Verify: `uv run pytest tests/x_research/test_cli_sync.py -k db_path`
  3. [ ] Incomplete sync exits non-zero or records partial status without marking missing edges inactive.
     - Verify: `uv run pytest tests/x_research/test_cli_sync.py -k partial`

**T6: Query CLI for check-following and graph summary**

- Description: Add offline query commands over local SQLite.
- Commands:
  - `uv run x-research check-following @a @b @c --db-path <path>`
  - `uv run x-research graph summary --db-path <path>`
  - `uv run x-research graph mutuals --db-path <path>`
  - `uv run x-research graph non-mutual-following --db-path <path>`
- Files: `src/x_research/cli.py`, `tests/x_research/test_cli_query.py`.
- Acceptance Criteria:
  1. [ ] `check-following` returns following/not-following from local DB.
     - Verify: `uv run pytest tests/x_research/test_cli_query.py -k check_following`
  2. [ ] Graph summary/mutuals/non-mutuals work from synthetic fixtures.
     - Verify: `uv run pytest tests/x_research/test_cli_query.py -k graph`
  3. [ ] CLI smoke works through console entrypoint.
     - Verify: `uv run x-research --help`

### Wave 2 Validation Gate

**V2: Validate follow-list MVP**

- Run all T4-T6 acceptance criteria.
- Run `uv run ruff check src/x_research tests/x_research`.
- Run `scripts/x-private-scan --staged` and save output.
- Run shell lint for changed shell scripts when `shellcheck` is available.
- Write evidence files:
  - `.specs/x-research-pipeline/evidence/v2-pytest.txt`
  - `.specs/x-research-pipeline/evidence/v2-ruff.txt`
  - `.specs/x-research-pipeline/evidence/v2-cli-smoke.txt`
  - `.specs/x-research-pipeline/evidence/v2-private-scan.txt`
  - `.specs/x-research-pipeline/evidence/v2-shellcheck.txt` or `.specs/x-research-pipeline/evidence/v2-shellcheck-skipped.txt`

### Wave 3: Optional browser validation and seed recipe

**T7: Browser-agent bounded parser and optional live smoke**

- Description: Implement a browser-agent adapter only for bounded home/profile snapshots and validation, not bulk graph sync. The first implementation may be a pure parser over captured DOM/text snapshots with an optional live wrapper.
- Browser safety contract:
  - dedicated user-approved browser session only
  - x.com URL allowlist
  - navigation and scroll only
  - no clicks on Follow/Like/Repost/Post/DM/forms
  - no cookie/token export
  - redact URLs/query params where needed in logs
- Files: `src/x_research/backends/browser_agent_backend.py`, `tests/x_research/fixtures/browser/*.txt`, `tests/x_research/test_browser_agent_backend.py`.
- Acceptance Criteria:
  1. [ ] Mocked snapshot parser returns normalized tweets/profile follow-state with partial status.
     - Verify: `uv run pytest tests/x_research/test_browser_agent_backend.py`
  2. [ ] Attempt/scroll/time budget is enforced in tests.
     - Verify: `uv run pytest tests/x_research/test_browser_agent_backend.py -k budget`
  3. [ ] Live smoke is optional and writes either PASS or SKIPPED evidence.
     - Verify: `uv run pytest -m live tests/x_research/test_browser_agent_backend.py` when prerequisites are available; otherwise write `.specs/x-research-pipeline/evidence/v3-browser-live-skipped.txt`

**T8: Seed/candidate follow analysis recipe**

- Description: Add a small documented recipe that checks candidate handles from a seed list against local following state. Use mocked data for required validation; live provider run is optional.
- Files: `.specs/x-research-pipeline/seed-list-ai-coding.md`, `.specs/x-research-pipeline/candidate-check-recipe.md`, `tests/x_research/test_seed_recipe.py`.
- Acceptance Criteria:
  1. [ ] Recipe test completes against mocked local DB/provider fixtures.
     - Verify: `uv run pytest tests/x_research/test_seed_recipe.py`
  2. [ ] Re-running the recipe is idempotent.
     - Verify: `uv run pytest tests/x_research/test_seed_recipe.py -k idempotent`
  3. [ ] Candidate follow analysis outputs followed vs not-followed counts.
     - Verify: `uv run pytest tests/x_research/test_seed_recipe.py -k candidate_counts`

### Wave 3 Validation Gate

**V3: Final MVP validation**

- Run all T7-T8 acceptance criteria.
- Run full offline validation:
  - `uv sync`
  - `uv run pytest tests/x_research`
  - `uv run ruff check src/x_research tests/x_research`
  - `scripts/x-private-scan --staged`
  - `shellcheck scripts/x-private-* scripts/install-x-private-hook scripts/git-hooks/pre-commit-x-private` when available
- Run optional live smoke only if prerequisites are present:
  - `private/x/config.local.json` exists with `twitterapi_io.api_key`
  - authenticated browser session is user-approved and available
- If prerequisites are absent, write SKIPPED evidence files and do not fail offline validation.
- Encrypt/decrypt a temp fixture with a test recipient and save non-secret pass/fail evidence.

## Validation Contract

Default validation must be offline and deterministic. Live network/browser tests are opt-in.

Required default command set:

```bash
uv sync
uv run pytest tests/x_research
uv run ruff check src/x_research tests/x_research
scripts/x-private-scan --staged
```

Live test command set, only when prerequisites are present:

```bash
uv run pytest -m live tests/x_research
```

Live prerequisites:

- `private/x/config.local.json` exists and contains a redacted-valid `twitterapi_io.api_key`.
- User has explicitly approved use of the current authenticated browser session for read-only x.com navigation/scroll.
- Evidence files must record `SKIPPED: missing <precondition>` instead of failing when live prerequisites are absent.

Evidence artifact requirements:

- Store validation output under `.specs/x-research-pipeline/evidence/`.
- Evidence must contain pass/fail/skip signals and command versions, but no API keys, cookies, tokens, raw private exports, or full X datasets.
- Final archive/readiness requires at least:
  - `v1-pytest.txt`, `v1-ruff.txt`, `v1-private-scan.txt`
  - `v2-pytest.txt`, `v2-cli-smoke.txt`, `v2-private-scan.txt`
  - `v3-pytest.txt` or consolidated final pytest output
  - shellcheck PASS or SKIPPED evidence
  - encryption round-trip evidence
  - live smoke PASS or SKIPPED evidence

## Success Criteria

1. [ ] Local CLI can sync and query X following/follower data without menos.
2. [ ] `twitterapi.io` is the default bulk source for follow-list MVP.
3. [ ] Candidate follow checks are answered from local SQLite.
4. [ ] Re-running syncs is idempotent and cannot create false unfollows from partial snapshots.
5. [ ] Plaintext PII stays out of git; encrypted snapshots use `age` under `private-encrypted/x/*.age`.
6. [ ] `/do-it` can resume from `## Execution Checklist` and evidence artifacts without prior conversation context.

## Execution Checklist

- [x] T0 superseded helper cleanup check complete; evidence: `.specs/x-research-pipeline/reuse-decision.md`
- [x] T1 package skeleton/deps/entrypoint/models/protocol complete; evidence: `evidence/v1-uv-sync.txt`, T1 pytest output
- [x] T2 SQLite schema/repository complete; evidence: repository pytest output
- [x] T3 private data scanner/hooks/age guardrails complete; evidence: `evidence/v1-private-scan.txt`, encryption round-trip output
- [x] V1 foundation validation complete; evidence files present under `.specs/x-research-pipeline/evidence/`
- [x] T4 twitterapi.io backend complete; evidence: backend pytest output
- [x] T5 sync CLI complete; evidence: CLI sync pytest output and temp DB smoke
- [x] T6 query CLI complete; evidence: CLI query pytest output and `uv run x-research --help`
- [x] V2 follow-list MVP validation complete; evidence: `evidence/v2-*`
- [x] T7 browser-agent bounded parser/live smoke complete or explicitly skipped; evidence: browser pytest and PASS/SKIPPED live file
- [x] T8 seed/candidate follow analysis recipe complete; evidence: seed recipe pytest output
- [x] V3 final MVP validation complete; evidence: final pytest/ruff/private-scan/encryption/live-smoke files
- [x] Archive gate satisfied: no plaintext private data staged, evidence bundle complete, and plan status updated

## Execution Status

- Current status: completed and archived on 2026-05-11 after offline MVP implementation and validation.
- Live provider/browser validation was skipped because local credentials and explicit browser-session approval were not present.
- Previous Birdclaw-oriented helper scripts remain absent; see `reuse-decision.md`.

## Deferred Follow-up Plans

- menos integration: persist local SQLite entities into menos after the MVP proves useful.
- Service/MCP: wrap the local repository/provider layer in FastAPI and expose MCP tools after the local CLI workflow stabilizes.
- twscrape/Webshare: add high-volume scraping if provider costs or coverage justify account-pool operations.
- Birdclaw compatibility: import/export local graph snapshots if Birdclaw's follow graph support merges and its schema stabilizes.
- Tweet/search/home-timeline expansion: add only after follow-list MVP is useful.

## Handoff Notes

- Use `pi/skills/x-twitter/SKILL.md` for current local X/browser/Birdclaw context.
- Keep `private/` gitignored. Do not commit local browser data, API keys, profile lists, feed exports, DMs, or SQLite databases.
- Do not extend to write actions without an explicit follow-up plan with security review.
