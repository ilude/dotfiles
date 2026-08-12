# Menos Infisical Migration Report

| Key | Source path | Destination path | Status | Verification command |
| --- | --- | --- | --- | --- |
| `SURREALDB_PASSWORD` | legacy repo-root env | `/menos/SURREALDB_PASSWORD` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `SURREALDB_NAMESPACE` | legacy repo-root env | `/menos/SURREALDB_NAMESPACE` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `SURREALDB_DATABASE` | legacy repo-root env | `/menos/SURREALDB_DATABASE` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `S3_ACCESS_KEY` | legacy repo-root env | `/menos/S3_ACCESS_KEY` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `S3_SECRET_KEY` | legacy repo-root env | `/menos/S3_SECRET_KEY` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `S3_BUCKET` | legacy repo-root env | `/menos/S3_BUCKET` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `GARAGE_RPC_SECRET` | legacy repo-root env | `/menos/GARAGE_RPC_SECRET` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `GARAGE_ADMIN_TOKEN` | legacy repo-root env | `/menos/GARAGE_ADMIN_TOKEN` | pending live migration | `scripts/menos-infisical-env.py --validate` |
| `SEARXNG_SECRET` | legacy repo-root env | `/menos/SEARXNG_SECRET` | pending live migration | `scripts/menos-infisical-env.py --validate` |
