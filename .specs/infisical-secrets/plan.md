---
created: 2026-04-30
status: draft
completed:
review-rounds: 1
---

# Plan: Self-hosted Infisical for shared secret storage

## Context & Motivation

The X-research pipeline (`.specs/x-research-pipeline/plan.md`) needs runtime access to:

- 5+ X.com burner-account credentials (handle, password, email, email-app-password)
- Webshare proxy credentials (gateway host/port + auth) and per-account sticky-session IDs
- Fallback API keys for SocialData.tools and the official X Pay-Per-Use API

These secrets must be:
- Reachable by both `pi` (developer machine) and the FastAPI `x-research` service running on the menos Docker host (`192.168.16.241`)
- Rotatable without redeploying the service
- Never present in the repo, in `.env` files committed by accident, or baked into Docker images
- Pulled at runtime, with short-lived service tokens rather than long-lived static keys

There is an existing in-flight design for a custom secret vault at `.specs/serapis-env-vault/` (Serapis -- Go binary + SQLite + ed25519 SSH-key auth). The user explicitly chose Infisical for THIS plan. Rationale:
- Off-the-shelf, OSS, audited; no custom code to maintain
- Native Python SDK (`infisical-python` on PyPI), REST API, and a CLI
- Native concept of "machine identities" with short-lived service tokens
- Self-hostable via Docker Compose; matches the existing menos host deployment pattern
- Web UI for non-CLI rotations

This plan deploys a self-hosted Infisical instance, integrates it with `pi` and the X-research service, and provides a path for migrating any existing scattered secrets into it. It deliberately stays narrow.

## Constraints

- Platform: Docker host `192.168.16.241` (Linux, user `anvil`); developer machines are Windows + WSL/Git Bash and macOS as a possibility.
- Deployment must use the existing Ansible-in-Docker pattern under `menos/infra/ansible/`; do NOT introduce a parallel orchestrator.
- Storage: PostgreSQL (Infisical's required backend). Stand up a DEDICATED `infisical-postgres` container -- menos runs SurrealDB + Garage today and has no Postgres to reuse.
- TLS termination: the menos host has NO existing reverse proxy in the repo today (verified -- `menos/infra/ansible/files/menos/docker-compose.yml` binds raw container ports). This plan introduces Caddy as the proxy, scoped to fronting Infisical only on a sub-domain. menos-api stays on its current port for now; migrating menos-api behind Caddy is explicitly future work.
- Backups: nightly encrypted backup of Postgres dump (not volume tar) PLUS the Infisical `.env` (`ENCRYPTION_KEY`, `AUTH_SECRET`, any `ENCRYPTION_KEY_FALLBACK`) in the same encrypted bundle. Without the env keys, the Postgres dump is undecryptable ciphertext.
- Auth model for clients: machine identities + short-lived service tokens. NO long-lived API keys committed anywhere. Service-token TTL: 1 hour, with refresh at 75% of remaining TTL and clock-skew tolerance of 60s.
- Bootstrap: the root admin account is created interactively in the web UI ONCE during T3, sequenced into the deploy runbook. Credentials stored in the user's password manager (1Password or equivalent), NOT in this repo or in Infisical itself.
- Machine-identity client secrets: surfaced ONCE by the bootstrap script via `--secrets-out=<tmpfs path>`. Operator copies into password manager + Docker secret on the menos host, then shreds the tmpfs file.
- The Infisical service token used by the deployed FastAPI service must be mounted as a Docker secret or a runtime-injected env var, NEVER baked into the image.
- Cache encryption (T6): use plain JSON with `chmod 600` (Git Bash on Windows translates to NTFS ACLs via msys; not perfect but non-zero). Threat model is already "user-level FS read = game over"; bespoke age-encryption keyed off the client_secret was rejected (rotation would brick the cache and the encrypted file lives next to the only thing that decrypts it). If threat model later includes backups/cloud-sync exfiltration, swap to OS keyring (Windows Credential Manager / macOS Keychain / libsecret).
- No AI mentions in code/comments. ASCII punctuation only.
- KISS: single project ("dotfiles") with environments `dev`, `prod`. Folders for grouping. Do NOT prematurely build elaborate RBAC schemes.
- Out of scope: SSO/SAML, audit-log shipping to a SIEM, multi-org setup, bring-your-own-KMS, migrating menos-api behind Caddy.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| HashiCorp Vault (self-hosted) | Industry standard; rich auth methods | Heavy operational burden; UX overkill for personal/small-team use | Rejected -- too much for the scope |
| Bitwarden Secrets Manager (self-hosted) | Familiar UI; integrated with existing Bitwarden | Less mature programmatic story than Infisical for service tokens | Rejected -- Infisical's machine-identity model is closer to fit |
| Doppler / 1Password Secrets Automation (managed) | Zero ops | SaaS, recurring cost, secrets leave the host | Rejected -- self-hosted requirement |
| `serapis-env-vault` (custom design in `.specs/serapis-env-vault/`) | Tailored to user's mental model; SSH-key auth | Brand-new code to maintain; no existing audit | Rejected for THIS plan; `pi/secrets/` package boundary is the swap point |
| `.env` files synced via `serapis push/pull` | Simple | No rotation, no machine identities, no audit log, no per-environment scoping | Rejected -- doesn't meet rotation/audit needs |
| **Self-hosted Infisical via Docker Compose + Caddy + Ansible** | **OSS, native Python SDK, machine identities, web UI, fits compose+Ansible pattern** | **Postgres dependency; Caddy added as new infra; one more service to back up** | **Selected** |

## Objective

When complete:

1. Caddy runs on `192.168.16.241` with automatic Let's Encrypt certs, fronting `infisical.<host-domain>`.
2. Infisical runs on the same host with a dedicated Postgres container, deployed via an Ansible role under `menos/infra/ansible/roles/infisical/`.
3. A `dotfiles` project exists in Infisical with `dev` and `prod` environments and a folder layout: `/x-research/accounts`, `/x-research/webshare`, `/x-research/fallback-apis`, plus `/shared/` for cross-cutting secrets.
4. A machine identity `x-research-service` exists with read-only access to `/x-research/**` in `prod` (1h token TTL).
5. A machine identity `pi-developer` exists with read access to `dev` and `prod` for hands-on debugging (1h token TTL).
6. A small Python helper (`pi/secrets/infisical.py`) wraps the Infisical SDK with `chmod 600` plain-JSON last-known-good cache, defaulting ON in service deploys with a metric/log line emitted when serving from stale cache.
7. The X-research FastAPI service uses the same helper at startup to load all credentials.
8. Documented runbooks: rotate X account credential, rotate Webshare creds, revoke a machine identity, recover root admin password (DB-edit dance -- no SMTP), restore from backup, rotate Infisical bootstrap encryption keys.
9. Backups run nightly (Postgres dump + Infisical .env in one encrypted bundle), 14-day retention, with at least one restore drill documented.
10. Pre-commit secret scanner installed; HEAD is clean. Existing git history has been audited and any active credentials rotated; history rewrite is explicitly out of scope unless an active credential is discovered.

## Project Context

- **Language**: Python 3.12+ for the client helper; YAML/Jinja for Ansible; Docker Compose for the service; Caddyfile for proxy.
- **Test command**: `uv run pytest pi/secrets/` for the helper. Manual verification for deploy.
- **Lint command**: `uv run ruff check pi/secrets/`; `ansible-lint menos/infra/ansible/roles/infisical/`.
- **Docker host**: `192.168.16.241` (user `anvil`); deploy path `/apps/menos` per `menos/infra/ansible/inventory/hosts.yml`.
- **Existing menos stack**: SurrealDB + Garage (no Postgres, no reverse proxy). Verified.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Gitleaks audit of git history (baseline) | 1 | research | haiku | Explore | -- |
| T1 | Caddy + Infisical-Postgres compose design (design doc) | 1 | research | haiku | Explore | -- |
| T2 | Ansible role `infisical` (compose, dedicated Postgres, env, volumes) | 6-10 | feature | sonnet | builder | -- |
| V1 | Validate wave 1 (audit + design + role syntax) | -- | validation | haiku | validator | T0, T1, T2 |
| T3 | Caddy + Infisical deploy + interactive root signup runbook | 5-7 | feature | sonnet | builder | V1 |
| T4 | Backup job (pg_dump + .env bundle, 14-day retention, df monitor) + restore runbook | 4-5 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 (deploy + restore drill + container hardening evidence) | -- | validation | sonnet | validator-heavy | T3, T4 |
| T5 | Bootstrap script with `--secrets-out` tmpfs handoff | 2-3 | feature | sonnet | builder | V2 |
| T6 | `pi/secrets/infisical.py` helper (chmod 600 cache, default ON, refresh@75%) | 4-6 | feature | sonnet | builder | V2 |
| V3 | Validate wave 3 (bootstrap + helper + live integration) | -- | validation | sonnet | validator-heavy | T5, T6 |
| T7 | Pre-commit secret scanner hook (create `.pre-commit-config.yaml`) | 2-3 | feature | haiku | builder-light | V3 |
| T8 | Runbooks: rotate X creds, rotate Webshare, revoke identity, recover root, restore backup, rotate bootstrap keys | 1 | docs | haiku | builder-light | V3 |
| T9 | Migrate existing scattered secrets into Infisical (incl. repo-root `.env`) | 2-4 | feature | sonnet | builder | V3 |
| V4 | Validate wave 4 (hardening + migration + HEAD gitleaks clean) | -- | validation | sonnet | validator-heavy | T7, T8, T9 |

## Execution Waves

### Wave 1 (parallel)

**T0: Gitleaks audit of git history** [haiku] -- Explore
- Description: Run `gitleaks detect --no-banner --redact --report-format json --log-opts="--all" -r .specs/infisical-secrets/gitleaks-baseline.json` against the entire git history. Classify every finding: (a) currently active credential -> MUST rotate before V4; (b) historical / already-rotated / test fixture -> note in baseline file; (c) false positive -> add to allowlist. Do NOT rewrite history. Output is the baseline JSON plus a summary at `.specs/infisical-secrets/gitleaks-baseline.md` listing each finding with classification.
- Files: `.specs/infisical-secrets/gitleaks-baseline.json`, `.specs/infisical-secrets/gitleaks-baseline.md`.
- Acceptance Criteria:
  1. [ ] Baseline files exist and every finding is classified
     - Verify: `test -s .specs/infisical-secrets/gitleaks-baseline.json && grep -c '^- ' .specs/infisical-secrets/gitleaks-baseline.md`
     - Pass: count equals number of findings in JSON
     - Fail: re-run with stricter classification prompt
  2. [ ] Any "currently active" credential is listed with its rotation owner and target completion (must be done before V4)
     - Verify: human review
     - Pass: every active credential has owner + date

**T1: Caddy + Infisical-Postgres compose design** [haiku] -- Explore
- Description: Produce a design note at `.specs/infisical-secrets/compose-design.md` covering: Caddy version + image, Caddyfile structure for `infisical.<host-domain>`, internal Docker network topology (Caddy <-> Infisical <-> infisical-postgres), volume layout (`caddy_data` for ACME state, `infisical_postgres_data`), env-var inventory for Infisical (`ENCRYPTION_KEY`, `AUTH_SECRET`, `SITE_URL`, `DB_CONNECTION_URI`, `SMTP_*` if used -- per H5 default to NO SMTP), Postgres major version pin (16.x), exposed-port plan (only Caddy binds 80/443; Infisical and Postgres on internal network only). Do NOT change any host config.
- Files: `.specs/infisical-secrets/compose-design.md` only.
- Acceptance Criteria:
  1. [ ] Design note has sections "Caddy", "Infisical", "Postgres", "Network", "Volumes", "Env vars"
     - Verify: `grep -c '^## ' .specs/infisical-secrets/compose-design.md`
     - Pass: count >= 6
  2. [ ] Postgres major version is pinned (e.g. `postgres:16.4-alpine`)
     - Verify: `grep -E 'postgres:1[0-9]+\.' .specs/infisical-secrets/compose-design.md`
     - Pass: at least one match
  3. [ ] SMTP decision is documented (default: NO SMTP; recovery via DB edit per T8)

**T2: Ansible role `infisical`** [sonnet] -- builder
- Description: Create role structure under `menos/infra/ansible/roles/infisical/`. Tasks: render `docker-compose.yml.j2` for Caddy + Infisical + dedicated Postgres (per T1 design); manage data volumes; render `infisical.env.j2` from Ansible vault variables (`ENCRYPTION_KEY`, `AUTH_SECRET`, etc.) -- secret values come from `vault_*` variables only; render `Caddyfile.j2`; pull/up the compose project. Defaults file lists every overridable variable with a comment. Pin Postgres major in the compose template. Do NOT yet wire it into any playbook.
- Files: `menos/infra/ansible/roles/infisical/tasks/main.yml`, `templates/docker-compose.yml.j2`, `templates/infisical.env.j2`, `templates/Caddyfile.j2`, `defaults/main.yml`, `handlers/main.yml`, `meta/main.yml`, `README.md` for the role.
- Acceptance Criteria:
  1. [ ] `ansible-lint menos/infra/ansible/roles/infisical/` is clean
     - Verify: command above
     - Pass: zero findings
  2. [ ] All secret values in `infisical.env.j2` come from `vault_*` variables, never hardcoded
     - Verify: hand-grep + `grep -E '^[A-Z_]+=[^{]' menos/infra/ansible/roles/infisical/templates/infisical.env.j2`
     - Pass: zero hardcoded secret-looking values
  3. [ ] Postgres major version is pinned in the compose template
     - Verify: `grep -E 'image: postgres:1[0-9]+\.' menos/infra/ansible/roles/infisical/templates/docker-compose.yml.j2`
     - Pass: at least one match
  4. [ ] README documents every required vault variable with a "what to put here" line

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [haiku] -- validator
- Blocked by: T0, T1, T2
- Checks:
  1. T0 baseline exists; any active-credential entries are tracked in a TODO.
  2. T1 design note has all required sections.
  3. Run T2 acceptance criteria.
  4. `ansible-playbook --syntax-check` against a tiny harness playbook that just includes the role.
- On failure: file fix task; re-validate.

### Wave 2 (parallel)

**T3: Caddy + Infisical deploy + interactive root signup runbook** [sonnet] -- builder
- Blocked by: V1
- Description: Add a play `menos/infra/ansible/playbooks/deploy-infisical.yml` that applies the `infisical` role. After deploy, follow the documented signup runbook (sequence: deploy compose -> wait for Caddy to obtain cert -> wait for Infisical `/api/status` 200 -> operator visits `https://infisical.<host-domain>/signup` in a browser -> creates root admin account -> records credentials in password manager -> records the `clientId` of any auto-generated identities). Document this sequence in `.specs/infisical-secrets/runbook-bootstrap.md`. The runbook explicitly lists T5 as the next step that requires the new admin's API token.
- Files: `menos/infra/ansible/playbooks/deploy-infisical.yml`, `.specs/infisical-secrets/runbook-bootstrap.md`.
- Acceptance Criteria:
  1. [ ] `ansible-playbook ... --check --diff` shows only expected diffs
     - Verify: dry-run from `menos/infra/ansible/`
     - Pass: zero unexpected diffs, zero failures
  2. [ ] Real deploy succeeds; Caddy obtains a valid Let's Encrypt cert; Infisical web UI loads over HTTPS
     - Verify: `curl -fsS https://infisical.<host-domain>/api/status`
     - Pass: 200 with valid TLS chain (no `--insecure` flag)
  3. [ ] Bootstrap runbook covers: deploy -> wait -> signup -> capture admin creds -> stage T5 inputs
     - Verify: `grep -c '^[0-9]*\.' .specs/infisical-secrets/runbook-bootstrap.md`
     - Pass: >= 6 numbered steps
  4. [ ] Manual: root admin account created; credentials in password manager (operator confirms)

**T4: Backup job + restore runbook** [sonnet] -- builder
- Blocked by: V1
- Description: Nightly cron (or systemd-timer matching menos's existing pattern -- detect during T1) that:
  (a) runs `docker exec infisical-postgres pg_dump -U <user> <db>` (NOT a volume tar);
  (b) bundles the dump together with `/apps/menos/infisical/infisical.env` (containing `ENCRYPTION_KEY`, `AUTH_SECRET`) into a single tarball;
  (c) encrypts the tarball with `age` (matching menos's existing backup encryption);
  (d) writes to the same backup target menos already uses;
  (e) maintains 14-day retention (delete artifacts older than 14 days);
  (f) emits a metric/log line on success or failure;
  (g) checks `df` on the Postgres data volume and warns to journald if usage > 80%.
  Restore runbook at `.specs/infisical-secrets/runbook-restore.md` documents the full restore: decrypt bundle -> restore `.env` -> restore `pg_dump` into a fresh Postgres -> bring Infisical up -> log in -> verify a known secret value.
- Files: `menos/infra/ansible/roles/infisical/tasks/backup.yml`, `templates/backup.sh.j2`, `.specs/infisical-secrets/runbook-restore.md`.
- Acceptance Criteria:
  1. [ ] Backup script produces a decryptable artifact containing both pg_dump output AND infisical.env
     - Verify: trigger manually on host; decrypt; `tar tf` lists both files
     - Pass: both present
  2. [ ] Old artifacts (>14d) are pruned
     - Verify: simulate via `touch -d '15 days ago'` on a test artifact and run the script
     - Pass: artifact is removed
  3. [ ] df-warn fires when volume is > 80% full
     - Verify: tmpfs-mock test
     - Pass: warning observed in journald
  4. [ ] Restore runbook lists every command (decrypt, untar, restore env, pg_restore/psql, compose up, login, verify)
     - Verify: `grep -c '```' .specs/infisical-secrets/runbook-restore.md`
     - Pass: >= 12 (six fenced blocks: decrypt, untar, env-place, restore, up, verify)

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T3, T4
- Checks:
  1. Run all T3 and T4 acceptance criteria.
  2. **Restore drill**: take the most recent backup, restore into a throwaway `infisical-postgres-test` container on a dev box plus the restored `.env`, bring up a sibling Infisical container, log in with the restored root account, confirm a pre-seeded test secret round-trips (proves `ENCRYPTION_KEY` round-trip). Document drill outcome with date in `runbook-restore.md`.
  3. **Container hardening evidence (concrete, per H2)**: run `docker inspect infisical | jq '.[0].Config.User, .[0].HostConfig.ReadonlyRootfs'` and document the actual values. Acceptable outcomes: non-root UID confirmed; if upstream image does not support read-only root, document which mounts (`/tmp`, `/var/log`, etc.) must be writable.
  4. Confirm no Infisical env file or secret is in the repo: `git ls-files | xargs grep -liE 'infisical_jwt|encryption_key' || true` -- empty.
- On failure: file fix task; re-validate.

### Wave 3 (parallel)

**T5: Bootstrap script with `--secrets-out` tmpfs handoff** [sonnet] -- builder
- Blocked by: V2 (and the interactive root signup from T3 must be complete)
- Description: A Python script `scripts/infisical_bootstrap.py` that, given root admin credentials interactively (or via `INFISICAL_ADMIN_TOKEN` env var), creates: project `dotfiles`; environments `dev`, `prod`; folders `/x-research/accounts`, `/x-research/webshare`, `/x-research/fallback-apis`, `/shared/`; machine identities `x-research-service` (read-only `/x-research/**` in prod) and `pi-developer` (read on dev + prod). Both identities have token TTL = 3600s. Idempotent: re-running on an already-bootstrapped instance is a no-op or safe update.

  Machine-identity client_id printed to stdout. Client_secret values written ONCE to the path supplied via `--secrets-out=<path>` (script REJECTS paths not under `/run/`, `/tmp/`, or `/dev/shm/` to discourage persistent storage). The output file is structured: one identity per line, format `IDENTITY_NAME=client_id:client_secret`. The script prints a banner instructing the operator to (1) copy values into the password manager, (2) install the appropriate value into the Docker secret on the menos host, (3) shred the tmpfs file with `shred -u`.
- Files: `scripts/infisical_bootstrap.py`, `scripts/tests/test_infisical_bootstrap.py` (mocked SDK).
- Acceptance Criteria:
  1. [ ] First run creates all documented resources
     - Verify: log into web UI; confirm via API
     - Pass: every resource present
  2. [ ] Second run reports "no changes" exit 0
     - Verify: re-run script
     - Pass: idempotent
  3. [ ] Script refuses `--secrets-out` paths outside tmpfs locations
     - Verify: `uv run pytest scripts/tests/test_infisical_bootstrap.py -k tmpfs_only`
     - Pass: green
  4. [ ] When `--secrets-out` is provided, client_secrets land in the file with chmod 600 and the script never echoes them to stdout/stderr
     - Verify: `uv run pytest scripts/tests/test_infisical_bootstrap.py -k secrets_out_handling`
     - Pass: green
  5. [ ] Banner instructs operator on copy + shred steps

**T6: `pi/secrets/infisical.py` helper (chmod 600 cache, default ON, refresh@75%)** [sonnet] -- builder
- Blocked by: V2
- Description: Create the `pi/secrets/` Python package (new directory; `__init__.py`; register in `pi/`'s existing `pyproject.toml` dependency block). Async helper using the official `infisical-python` SDK. Public API: `get_secret(path: str, env: str = "prod") -> str`, `get_folder(path: str, env: str = "prod") -> dict[str, str]`, `refresh()`, plus exception types `SecretsUnavailable`, `SecretNotFound`. Auth: read `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` from environment OR from `~/.config/dotfiles/infisical.env` (chmod 600; on Windows, msys/Git Bash translates this to NTFS ACLs -- imperfect but non-zero).

  Cache: plain JSON at `~/.cache/dotfiles/infisical-cache.json`, chmod 600, last-known-good model. Cache is DEFAULT ON in both dev and service deploys (resolves contradiction with Success Criterion 5). Fresh-cache TTL: 5 minutes. Stale-cache (older than TTL but < 24h) usage emits a structured log line `cache_stale=true` so observability picks it up. Cache older than 24h is treated as missing.

  Token refresh: re-auth at 75% of remaining service-token TTL, with 60s clock-skew tolerance. Single in-flight refresh (asyncio lock).
- Files: `pi/secrets/__init__.py`, `pi/secrets/infisical.py`, `pi/secrets/cache.py`, `pi/secrets/tests/test_infisical.py`, plus a stanza in `pi/pyproject.toml` adding `infisical-python` to dependencies.
- Acceptance Criteria:
  1. [ ] `uv run pytest pi/secrets/` runs from repo root and passes
     - Verify: command above
     - Pass: green
  2. [ ] `get_secret` round-trips against a mocked SDK
     - Verify: `uv run pytest pi/secrets/tests/test_infisical.py -k get_secret`
     - Pass: green
  3. [ ] Cache file is created with chmod 600 (or NTFS-equivalent on Windows)
     - Verify: `uv run pytest pi/secrets/tests/test_infisical.py -k cache_permissions`
     - Pass: green on Linux/macOS; documented exception path on Windows
  4. [ ] Offline-with-fresh-cache succeeds; offline-with-stale-cache (5min < age < 24h) succeeds AND logs `cache_stale=true`; offline-with-no-cache (or > 24h) raises `SecretsUnavailable`
     - Verify: `uv run pytest pi/secrets/tests/test_infisical.py -k offline_`
     - Pass: green
  5. [ ] Token refresh fires at 75% of TTL with 60s skew tolerance, single in-flight at a time
     - Verify: `uv run pytest pi/secrets/tests/test_infisical.py -k token_refresh`
     - Pass: green

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [sonnet] -- validator-heavy
- Blocked by: T5, T6
- Checks:
  1. Run all T5 and T6 acceptance criteria.
  2. Live integration: from a dev machine, set `INFISICAL_CLIENT_ID/SECRET` for `pi-developer`, write a test secret to `/shared/plan-validation` via the web UI, call `pi/secrets/infisical.py:get_secret("/shared/plan-validation")`, confirm correct value.
  3. Live integration: from the menos host (or a container on it), authenticate as `x-research-service`, attempt to read `/x-research/accounts/*` -> success; attempt to read `/shared/*` -> denied (verifies least-privilege). Log the actual HTTP status to `.specs/infisical-secrets/v3-deny-evidence.txt`.
  4. Live integration: stop the Infisical container; call `get_secret` against a key fetched within the last 5 minutes -> success with `cache_stale=false`; advance system clock 6 minutes (or wait); call again -> success with `cache_stale=true` log line; advance clock 25 hours; call again -> raises `SecretsUnavailable`. Restart Infisical container.
  5. `uv run ruff check pi/secrets/ scripts/` -- clean.
- On failure: file fix task; re-validate.

### Wave 4 (parallel)

**T7: Pre-commit secret scanner (CREATE config)** [haiku] -- builder-light
- Blocked by: V3
- Description: Create a new `.pre-commit-config.yaml` at the repo root (no existing config in this repo -- verified) wiring `gitleaks` as a pre-commit hook. Add a `.gitleaks.toml` with allowlist entries for the test fixtures identified in T0's baseline. Document `pre-commit install` in `AGENTS.md` (existing) under a new "Pre-commit hooks" section. CI integration is out of scope for this task; document it as future work.
- Files: `.pre-commit-config.yaml` (new), `.gitleaks.toml` (new), small `AGENTS.md` update.
- Acceptance Criteria:
  1. [ ] Hook fires on a deliberate test commit containing an obvious fake AWS key and blocks it
     - Verify: temp branch + commit attempt with `AKIAIOSFODNN7EXAMPLE`
     - Pass: commit blocked by gitleaks
  2. [ ] Hook does NOT fire on existing repo HEAD
     - Verify: `pre-commit run --all-files`
     - Pass: green (allowlist covers any T0-classified historical / fixture findings)
  3. [ ] AGENTS.md documents `pre-commit install`

**T8: Runbooks (six topics, per H1 + H5)** [haiku] -- builder-light
- Blocked by: V3
- Description: Single doc `.specs/infisical-secrets/runbooks.md` with the following H2 sections:
  1. Rotate an X.com burner-account password (Infisical UI steps + helper-cache invalidation note)
  2. Rotate Webshare credentials (UI + service restart)
  3. Revoke a compromised machine identity (UI + service rotation)
  4. Recover root admin password without SMTP (Postgres-edit dance: exec into infisical-postgres, find admin user row, set password reset token, complete reset via UI). NOTE: SMTP is intentionally not configured per Constraints; this is the only path.
  5. Full disaster restore from backup (links to `runbook-restore.md`)
  6. Rotate Infisical bootstrap encryption keys (`ENCRYPTION_KEY`, `AUTH_SECRET`) -- documented as a once-a-year manual procedure: take downtime, decrypt every secret with old key, re-encrypt with new key, update password manager, redeploy.
  Each section is step-by-step with copy-pasteable commands.
- Files: `.specs/infisical-secrets/runbooks.md`.
- Acceptance Criteria:
  1. [ ] All six runbooks present
     - Verify: `grep -c '^## ' .specs/infisical-secrets/runbooks.md`
     - Pass: >= 6
  2. [ ] Recover-root runbook explicitly states the no-SMTP DB-edit path with concrete SQL
     - Verify: `grep -A2 'recover root' .specs/infisical-secrets/runbooks.md | grep -i -E 'UPDATE|psql'`
     - Pass: at least one match

**T9: Migrate scattered secrets** [sonnet] -- builder
- Blocked by: V3
- Description: Audit the repo (especially the `.env` at repo root flagged by T0) and the user's home dir for existing secrets that should now live in Infisical. For each: move into Infisical (and replace on-disk file with a stub pointing at the Infisical path), rotate if T0 flagged it as exposed in history, or document why it should NOT move (e.g. GitHub PAT in `gh`'s keychain is fine). Report findings in `.specs/infisical-secrets/migration-report.md`.
- Files: `.specs/infisical-secrets/migration-report.md`, plus targeted edits to any consumer that currently reads moved secrets from disk; potentially deletion or stub replacement of repo-root `.env`.
- Acceptance Criteria:
  1. [ ] Migration report lists every secret found, its T0-baseline cross-reference, decision, Infisical path (if moved), and rotation status (if T0 flagged active-exposure)
     - Verify: human review of the report
     - Pass: every entry complete
  2. [ ] Any consumer touched by a move still works
     - Verify: run the consumer; confirm Infisical pull succeeds
     - Pass: green per consumer

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [sonnet] -- validator-heavy
- Blocked by: T7, T8, T9
- Checks:
  1. Run all T7, T8, T9 acceptance criteria.
  2. Re-run gitleaks on the current repo HEAD (NOT history) -- clean.
  3. Cross-check migration report against actual filesystem: every entry marked "moved" has its on-disk file either deleted or replaced with a stub.
  4. Cross-check T0 baseline: every "currently active" credential is rotated (status field in baseline.md updated).
  5. Spot-check one runbook (rotation) end-to-end: rotate a test secret, confirm consumers pick up the new value within 5 minutes (cache TTL).
- On failure: file fix task; re-validate.

## Dependency Graph

```
Wave 1:  T0, T1, T2 (parallel) -> V1
Wave 2:  T3, T4 (parallel) -> V2
Wave 3:  T5, T6 (parallel) -> V3   (T5 also blocked by interactive root signup from T3)
Wave 4:  T7, T8, T9 (parallel) -> V4
```

## Success Criteria

1. [ ] Both `pi` (dev machine) and the X-research service (Docker host) successfully read secrets from Infisical at runtime
   - Verify: from each, fetch `/shared/plan-validation` test secret
   - Pass: both return the expected value
2. [ ] No credential of any kind exists at the current repo HEAD; git history has been audited (T0 baseline) and any active-credential exposures rotated. History rewrite is OUT OF SCOPE unless T0 found something currently exploitable.
   - Verify: `gitleaks detect --no-banner --redact --report-format json` (HEAD only, NOT `--all`)
   - Pass: zero findings
3. [ ] Disaster recovery is provably possible AND captures the encryption key (not just the database)
   - Verify: V2 restore drill outcome line in `runbook-restore.md` includes "Drill completed: <date>" AND confirms a known secret round-tripped
   - Pass: both present
4. [ ] Least-privilege is enforced
   - Verify: `x-research-service` identity attempts to read `/shared/*` -> denied (per `.specs/infisical-secrets/v3-deny-evidence.txt`)
   - Pass: 403/permission-denied response captured
5. [ ] Cache makes the helper resilient to brief Infisical outages, INCLUDING in service deploys
   - Verify: stop the Infisical container; `pi/secrets/infisical.py:get_secret` against a recently-fetched key still succeeds; emits `cache_stale=true` log when serving from stale cache; restart container; confirm next call refreshes
   - Pass: all three behaviors observed
6. [ ] Pre-commit hook blocks new credentials and is documented as a setup step in AGENTS.md

## Handoff Notes

- Prerequisite for `.specs/x-research-pipeline/plan.md` task T3 (twscrape backend reads accounts from Infisical). Run this plan to V3 before starting that one in earnest. T1-V2 of this plan can run in parallel with T1-V1 of the X-research plan since the X-research interface stub doesn't yet need Infisical.
- The existing `.specs/serapis-env-vault/` design is NOT being deleted. If the user later prefers the custom Serapis vault, the swap point is the `pi/secrets/` package boundary -- swap implementations behind the same API.
- Bootstrap secrets (root admin credentials, `ENCRYPTION_KEY`, `AUTH_SECRET`, `vault_*` Ansible passphrase) live in the user's password manager (1Password / equivalent), NOT in this repo or in Infisical itself. They are also captured in the encrypted backup bundle (the `.env` half) so a password-manager loss alone doesn't lose the cluster.
- Machine-identity client_secrets are surfaced ONCE via `--secrets-out=<tmpfs path>` from the bootstrap script, then copied to (a) the password manager and (b) the Docker secret on the menos host, then shredded.
- Infisical's free OSS tier is sufficient for this scope. Paid tier (SAML, audit-log retention) is out of scope.
- **menos does NOT run Postgres today** (verified -- runs SurrealDB + Garage). T2 stands up a dedicated `infisical-postgres` container unconditionally.
- **menos host has NO existing reverse proxy today** (verified). This plan introduces Caddy fronting Infisical only; menos-api stays on raw ports for now (future work).
- Service-token TTL is 1 hour with refresh at 75% (i.e. ~15 min before expiry) and 60s skew tolerance. Do NOT pick a multi-day TTL for ergonomics.
- Nightly backups give up to 24h of secret-state delta on disaster restore. Acceptable for personal-scale; documented in `runbook-restore.md`.
- Encryption-key rotation is documented as a once-a-year manual procedure in T8 (downtime required).
- ASCII-only-content lint is NOT enforced via CI in this plan (LOW priority, KISS); standing CLAUDE.md rule remains the enforcement.
