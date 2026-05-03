# Menos Infisical Secret Contract

## Source

- Infisical project: `menos_infisical_project`
- Environment: `menos_infisical_environment`
- Secret path: `menos_infisical_path` (production default example: `/menos`)
- Runtime destination: `{{ deploy_path }}/.env`, rendered by `scripts/menos-infisical-env.py`.
- Reuse decision: no shared repo utility currently provides the required atomic `.env` rendering and offline fixture mode, so this plan uses a focused menos utility. If a shared Infisical helper is later added, this script should become a thin wrapper around it.

## Required Keys

| Runtime key | Infisical path | Notes |
| --- | --- | --- |
| `SURREALDB_PASSWORD` | `${menos_infisical_path}/SURREALDB_PASSWORD` | Required database root password. |
| `SURREALDB_NAMESPACE` | `${menos_infisical_path}/SURREALDB_NAMESPACE` | Required API namespace. |
| `SURREALDB_DATABASE` | `${menos_infisical_path}/SURREALDB_DATABASE` | Required API database. |
| `S3_ACCESS_KEY` | `${menos_infisical_path}/S3_ACCESS_KEY` | Required Garage access key. |
| `S3_SECRET_KEY` | `${menos_infisical_path}/S3_SECRET_KEY` | Required Garage secret key. |
| `S3_BUCKET` | `${menos_infisical_path}/S3_BUCKET` | Required bucket name. |
| `GARAGE_RPC_SECRET` | `${menos_infisical_path}/GARAGE_RPC_SECRET` | Required Garage RPC secret. |
| `GARAGE_ADMIN_TOKEN` | `${menos_infisical_path}/GARAGE_ADMIN_TOKEN` | Required admin token. |
| `SEARXNG_SECRET` | `${menos_infisical_path}/SEARXNG_SECRET` | Required SearXNG secret. |

## Optional Keys

Optional keys may be absent or empty when the corresponding integration is disabled: `WEBSHARE_PROXY_USERNAME`, `WEBSHARE_PROXY_PASSWORD`, `YOUTUBE_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CALLBACK_URL`, `CALLBACK_SECRET`, `DATA_PATH`, `UNIFIED_PIPELINE_ENABLED`, `UNIFIED_PIPELINE_PROVIDER`, `UNIFIED_PIPELINE_MODEL`, `UNIFIED_PIPELINE_MAX_CONCURRENCY`, `S3_ENDPOINT_URL`.

## Rotation

Rotate machine identity credentials via Ansible vault. Rotate runtime keys in Infisical first, then redeploy so `/apps/menos/.env` is atomically replaced. Record key names only, never values, in migration evidence.

## Validation

Required keys must be present, non-empty, and not match placeholders: `changeme`, `REPLACE_ME`, `<replace>`, `TODO`, or `example`. Secret-bearing values must not be printed in stdout, stderr, diffs, or evidence artifacts.

## Failure

Validation fails closed before compose pull/build/up. Temporary controller files are created only under `menos_infisical_tmp_dir` and removed on success and failure. Existing remote `.env` backups are restored if deployment fails after replacement.
