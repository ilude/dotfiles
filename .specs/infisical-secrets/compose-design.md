# Caddy + Infisical Compose Design

## Caddy

Use `caddy:2.8-alpine` and pin the minor line in the compose template. Caddy is the only public entrypoint and binds host ports `80:80` and `443:443`. The Caddyfile serves `infisical.<host-domain>` and proxies to the Infisical app on the internal Docker network.

## Infisical

Use the upstream Infisical image pinned by variable, defaulting to `infisical/infisical:v0.119.0-postgres`. Infisical reads runtime settings from `/apps/menos/infisical/infisical.env`. Required values include `ENCRYPTION_KEY`, `AUTH_SECRET`, `SITE_URL`, and `DB_CONNECTION_URI`. SMTP is not configured by default; root-admin recovery is documented as a DB-edit procedure in the runbooks.

## Postgres

Use a dedicated Postgres container for Infisical only. Pin the major/minor image, for example `postgres:16.4-alpine`. The database is not exposed on host ports and is reachable only over the internal `infisical_internal` Docker network.

## Network

Two compose networks are used:

- `infisical_public`: Caddy-facing edge network.
- `infisical_internal`: private app-to-database network.

Caddy can reach Infisical. Infisical can reach Postgres. Postgres has no public network attachment.

## Volumes

Named volumes:

- `caddy_data`: ACME account and certificate state.
- `caddy_config`: Caddy runtime config state.
- `infisical_postgres_data`: Postgres data directory.

Host files under `/apps/menos/infisical/` hold rendered `Caddyfile` and `infisical.env`.

## Env vars

Required Infisical values:

- `ENCRYPTION_KEY`: Ansible vault value `vault_infisical_encryption_key`.
- `AUTH_SECRET`: Ansible vault value `vault_infisical_auth_secret`.
- `SITE_URL`: `https://infisical.<host-domain>`.
- `DB_CONNECTION_URI`: Postgres URI using vault-backed DB password.
- `SMTP_*`: intentionally unset by default. No SMTP is the selected design; root recovery uses the DB-edit runbook.

Required Postgres values:

- `POSTGRES_USER`: non-secret default, overridable.
- `POSTGRES_DB`: non-secret default, overridable.
- `POSTGRES_PASSWORD`: Ansible vault value `vault_infisical_postgres_password`.
