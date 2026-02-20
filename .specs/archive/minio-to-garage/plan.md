---
created: 2026-02-20
completed: 2026-02-20
---

# Team Plan: Migrate menos from MinIO to Garage

## Objective

Replace MinIO object storage with [Garage](https://garagehq.deuxfleurs.fr/) in the menos content vault. Garage is a lightweight, Rust-based S3-compatible storage system ideal for self-hosted deployments (~50MB RAM vs MinIO's 500MB+). All existing data in MinIO must be migrated to Garage with zero data loss.

**Key design decision**: Keep the `minio` Python SDK. Despite its name, it's a standard S3 client that works with any S3-compatible endpoint (Garage included). This avoids rewriting the storage layer while still fully migrating off the MinIO server. All class names and config variables will be renamed from `minio_*`/`MinIO*` to `s3_*`/`S3*` to reflect the vendor-neutral reality.

## Project Context

- **Language**: Python 3.12+
- **Test command**: `make test` (or `uv run pytest` from `api/`)
- **Lint command**: `uv run ruff check`
- **Server**: 192.168.16.241 (user: anvil), deploy path: /apps/menos
- **Current MinIO usage**: Basic CRUD only (put_object, get_object, remove_object, bucket_exists). No versioning, policies, or advanced features.

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| Infrastructure (docker-compose, garage.toml, Ansible, .env) | 4 | feature | sonnet | builder |
| Core app code (config, storage, DI, health) | 4 | feature | sonnet | builder |
| Utility scripts (3 scripts with MinIO imports) | 3 | mechanical | haiku | builder-light |
| Tests (unit tests, smoke conftest) | 2 | mechanical | sonnet | builder |
| Data migration script + Ansible task | 2 | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| garage-builder-1 | builder | sonnet | Infrastructure changes |
| garage-builder-2 | builder | sonnet | Core application code |
| garage-builder-3 | builder-light | haiku | Utility scripts |
| garage-builder-4 | builder | sonnet | Test updates |
| garage-builder-5 | builder | sonnet | Data migration |
| garage-validator-1 | validator-heavy | sonnet | Wave validation |

## Execution Waves

### Wave 1 (parallel)

- **T1: Infrastructure — Replace MinIO with Garage in Docker and Ansible** [sonnet] — builder
  - Files: `menos/infra/ansible/files/menos/docker-compose.yml`, `menos/infra/ansible/files/menos/garage.toml` (new), `menos/infra/ansible/playbooks/deploy.yml`, `menos/infra/ansible/files/menos/.env.example`
  - Changes:
    - Replace `minio` service in docker-compose.yml with `garage` service (`dxflrs/garage:v2.2.0`)
    - Map port 3900 (S3 API) and 3903 (admin API). Remove ports 9000/9001.
    - Volume mount: `${DATA_PATH}/garage/meta` and `${DATA_PATH}/garage/data` plus `garage.toml:/etc/garage.toml:ro`
    - Create `garage.toml` with: `replication_factor = 1`, `db_engine = "sqlite"` (safer for single node), `s3_region = "garage"`, S3 API on port 3900, admin API on port 3903. Use env vars for secrets (`GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`).
    - Update `menos-api` service: change `MINIO_URL=minio:9000` to `S3_ENDPOINT_URL=garage:3900`, rename env vars from `MINIO_*` to `S3_*`, change `depends_on` from `minio` to `garage`
    - Update `deploy.yml`: change data directory from `minio` to `garage` (both `garage/meta` and `garage/data`)
    - Update `.env.example`: rename `MINIO_*` vars to `S3_*`, add `GARAGE_RPC_SECRET` and `GARAGE_ADMIN_TOKEN`
    - Add `S3_REGION=garage` to the env vars
  - Acceptance Criteria:
    1. [ ] `docker-compose.yml` has no references to `minio` (service, image, ports, env vars)
       - Verification: `grep -i minio menos/infra/ansible/files/menos/docker-compose.yml` returns empty
       - Expected: No matches
    2. [ ] `garage.toml` exists with valid config
       - Verification: `test -f menos/infra/ansible/files/menos/garage.toml`
       - Expected: File exists with `replication_factor = 1`, `s3_region`, port configs
    3. [ ] `deploy.yml` creates `garage/meta` and `garage/data` directories instead of `minio`
       - Verification: `grep -c 'garage' menos/infra/ansible/playbooks/deploy.yml`
       - Expected: At least 2 matches (meta + data directories)
    4. [ ] `.env.example` uses `S3_*` naming
       - Verification: `grep -c 'S3_' menos/infra/ansible/files/menos/.env.example`
       - Expected: At least 3 (endpoint, access key, secret key)

- **T2: Core application code — Rename MinIO references to S3** [sonnet] — builder
  - Files: `menos/api/menos/config.py`, `menos/api/menos/services/storage.py`, `menos/api/menos/services/di.py`, `menos/api/menos/routers/health.py`
  - Changes:
    - `config.py`: Rename settings:
      - `minio_url` → `s3_endpoint_url` (default `"localhost:3900"`)
      - `minio_access_key` → `s3_access_key` (default `"minioadmin"`)
      - `minio_secret_key` → `s3_secret_key` (default `"changeme"`)
      - `minio_secure` → `s3_secure` (default `False`)
      - `minio_bucket` → `s3_bucket` (default `"menos"`)
      - Add `s3_region: str = "garage"`
    - `storage.py`: Rename `MinIOStorage` → `S3Storage`, update docstrings/error messages from "MinIO" to "S3"
    - `di.py`: Update imports (`MinIOStorage` → `S3Storage`), update function names (`get_minio_storage` → `get_s3_storage`), update `Minio()` constructor calls to use new config names, pass `region` to Minio client
    - `health.py`: Rename `check_minio` → `check_s3`, update `Minio()` constructor to use new settings, update readiness check key from `"minio"` to `"s3"`
  - Acceptance Criteria:
    1. [ ] No references to `minio_url`, `minio_access_key`, `minio_secret_key`, `minio_secure`, `minio_bucket` in config.py
       - Verification: `grep -c 'minio_' menos/api/menos/config.py`
       - Expected: 0 matches
    2. [ ] `MinIOStorage` class renamed to `S3Storage` in storage.py
       - Verification: `grep -c 'class S3Storage' menos/api/menos/services/storage.py`
       - Expected: 1 match
    3. [ ] `di.py` imports and uses `S3Storage`, references `s3_*` settings
       - Verification: `grep -c 'MinIO' menos/api/menos/services/di.py`
       - Expected: 0 matches
    4. [ ] Health check uses `check_s3` and reports `"s3"` key
       - Verification: `grep -c 'check_s3\|"s3"' menos/api/menos/routers/health.py`
       - Expected: At least 2 matches
    5. [ ] `uv run ruff check menos/api/menos/` passes clean
       - Verification: `cd menos/api && uv run ruff check menos/`
       - Expected: No errors

### Wave 1 Validation

- **V1**: Validate wave 1 [sonnet] — validator-heavy, blockedBy: [T1, T2]
  - Run `cd menos/api && uv run ruff check menos/` — lint must pass
  - Run `cd menos/api && uv run pytest tests/unit/ -x -q` — existing tests may fail (expected, tests updated in wave 2)
  - Grep for stale `minio` references in modified files (case-insensitive, excluding import of `minio` SDK package itself)
  - Verify `garage.toml` has valid TOML syntax
  - Verify docker-compose.yml is valid YAML

### Wave 2 (parallel)

- **T3: Utility scripts — Update MinIO references** [haiku] — builder-light, blockedBy: [V1]
  - Files: `menos/api/scripts/classify_content.py`, `menos/api/scripts/classify_transcript.py`, `menos/api/scripts/reprocess_content.py`
  - Changes:
    - Update `Minio()` constructor calls to use `settings.s3_endpoint_url` etc.
    - Update any "MinIO" strings in log messages to "S3"
    - Keep `from minio import Minio` (SDK import, not vendor-specific)
  - Acceptance Criteria:
    1. [ ] No references to `settings.minio_*` in any script
       - Verification: `grep -r 'settings\.minio' menos/api/scripts/`
       - Expected: 0 matches
    2. [ ] Scripts still import `Minio` from `minio` package (SDK is kept)
       - Verification: `grep -c 'from minio import Minio' menos/api/scripts/classify_content.py`
       - Expected: 1 match
    3. [ ] `uv run ruff check menos/api/scripts/` passes clean
       - Verification: `cd menos/api && uv run ruff check scripts/`
       - Expected: No errors

- **T4: Tests — Update mocks and references** [sonnet] — builder, blockedBy: [V1]
  - Files: `menos/api/tests/unit/test_storage.py`, `menos/api/tests/smoke/conftest.py`
  - Changes:
    - `test_storage.py`: Update `MinIOStorage` references to `S3Storage`, update mock paths, update error message assertions from "MinIO" to "S3"
    - `conftest.py`: Update `Minio()` constructor to use new config var names, update any "minio" fixture names
  - Acceptance Criteria:
    1. [ ] All unit tests pass
       - Verification: `cd menos/api && uv run pytest tests/unit/ -x -q`
       - Expected: All tests pass (0 failures)
    2. [ ] No references to `MinIOStorage` in test files
       - Verification: `grep -r 'MinIOStorage' menos/api/tests/`
       - Expected: 0 matches
    3. [ ] `uv run ruff check menos/api/tests/` passes clean
       - Verification: `cd menos/api && uv run ruff check tests/`
       - Expected: No errors

### Wave 2 Validation

- **V2**: Validate wave 2 [sonnet] — validator-heavy, blockedBy: [T3, T4]
  - Run full test suite: `cd menos/api && uv run pytest tests/unit/ -x -q`
  - Run lint: `cd menos/api && uv run ruff check`
  - Grep entire `menos/api/` for stale `minio_` config references (excluding `from minio import` SDK imports)
  - Verify no broken imports

### Wave 3

- **T5: Data migration script** [sonnet] — builder, blockedBy: [V2]
  - Files: `menos/api/scripts/migrate_s3_data.py` (new), `menos/infra/ansible/playbooks/migrate-s3.yml` (new), `menos/infra/ansible/files/menos/docker-compose.migration.yml` (new)
  - Changes:
    - This wave runs before the cutover deploy that applies T1's Garage-only compose changes.
    - Create `migrate_s3_data.py`: Python script that reads all objects from old MinIO endpoint and writes them to new Garage endpoint. Uses `minio` SDK for both source and destination. Includes:
      - `--source-endpoint`, `--dest-endpoint` CLI args (with defaults)
      - `--dry-run` flag to list objects without copying
      - Progress reporting (object count, bytes transferred)
      - Verification step: compare object counts and sizes between source and dest
    - Create `migrate-s3.yml` Ansible playbook that:
      1. Stops `menos-api` to enforce offline migration consistency (no writes during copy)
      2. Starts Garage alongside existing MinIO using `docker-compose.migration.yml` override
      3. Initializes Garage cluster layout (`garage layout assign` + `garage layout apply`)
      4. Creates the `menos` bucket (`garage bucket create menos`)
      5. Provisions predefined app credentials from env (`S3_ACCESS_KEY`, `S3_SECRET_KEY`)
      6. Grants permissions (`garage bucket allow --read --write --owner menos --key <S3_ACCESS_KEY>`)
      7. Runs the migration script
      8. Verifies migration
    - Include instructions in script docstring for manual execution
  - Acceptance Criteria:
    1. [ ] Migration script exists and is syntactically valid
       - Verification: `cd menos/api && uv run python -c "import ast; ast.parse(open('scripts/migrate_s3_data.py').read())"`
       - Expected: No syntax errors
    2. [ ] Migration script has `--dry-run` flag
       - Verification: `grep -c 'dry.run' menos/api/scripts/migrate_s3_data.py`
       - Expected: At least 1 match
    3. [ ] Ansible playbook exists and references Garage commands
       - Verification: `grep -c 'garage' menos/infra/ansible/playbooks/migrate-s3.yml`
       - Expected: At least 5 matches
    4. [ ] `uv run ruff check menos/api/scripts/migrate_s3_data.py` passes
       - Verification: `cd menos/api && uv run ruff check scripts/migrate_s3_data.py`
       - Expected: No errors

### Wave 3 Validation

- **V3**: Validate wave 3 [sonnet] — validator-heavy, blockedBy: [T5]
  - Run full test suite: `cd menos/api && uv run pytest tests/unit/ -x -q`
  - Run lint on new files
  - Verify migration script imports resolve
  - Verify Ansible playbook YAML syntax

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3, T4 (parallel, after V1) → V2
Wave 3: T5 (after V2) → V3
```

## Migration Deployment Sequence

After all code changes are committed, the production migration follows this order:

1. **Commit & push** all code changes
2. **Predefine Garage app credentials in `.env`** — set `S3_ACCESS_KEY` and `S3_SECRET_KEY` values that migration will provision in Garage
3. **Run `migrate-s3.yml` (pre-cutover, offline)** — stops `menos-api`, starts Garage with migration compose override, initializes cluster, migrates data from live MinIO, verifies object parity
4. **Update production `.env` for cutover** — rename `MINIO_*` to `S3_*`, add `GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`, set `S3_ENDPOINT_URL=garage:3900`, `S3_REGION=garage`
5. **Deploy** with `make deploy` — applies T1 Garage-only compose, rebuilds app with S3 config, starts services on Garage
6. **Verify** — `curl /ready` should show `"s3": "ok"`
7. **Remove MinIO** — after confirming everything works, remove the old MinIO container and data

## Notes

- Garage `replication_factor = 1` is appropriate for single-node deployment
- Using `db_engine = "sqlite"` instead of default `lmdb` for safer single-node operation (tolerates unclean shutdown)
- The `minio` Python SDK remains as a dependency — it's a standard S3 client despite the name
- Garage requires cluster layout initialization before it will serve requests (the migration playbook handles this)
- `s3_region` must be set to `"garage"` in both `garage.toml` and application config, or signature verification fails
