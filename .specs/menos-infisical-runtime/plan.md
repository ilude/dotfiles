---
created: 2026-05-03
status: draft
completed:
---

# Plan: Bring menos deployment into Infisical runtime secret flow

## Context & Motivation

`menos/infra/ansible/playbooks/deploy.yml` still builds the runtime environment by copying the repository root `.env` file into `/apps/menos/.env` before launching the stack. With Infisical now deployed for `infisical.ilude.com`, we should switch menos to an Infisical-backed deploy-time secret workflow and remove this repo-root copy path.

This plan is intentionally constrained:

- keep the existing Ansible-in-Docker deployment model
- keep `192.168.16.241` as the target host
- do not introduce a parallel orchestrator
- do not add extra services for menos in this phase
- keep logs and diffs redacted for all token/secret-bearing steps

## Constraints

- **Do not copy `/project/.env`** into deploy path anymore.
- **No secret values** in tracked files, diffs, command output, or evidence artifacts.
- `menos` deploy remains via `menos/infra/ansible/` with playbook-driven `docker compose`.
- Infisical runtime identity/token management follows `.specs/infisical-secrets/plan.md` (machine identity + least privilege).
- Keep changes minimal and deterministic so `ansible-lint` + `--syntax-check` remain fast and stable.
- No AI/marketing wording in code/docs; ASCII punctuation only.

## Alternatives Considered (problem: "How to stop managing menos secrets via repo-root `.env` copy and still keep current Ansible flow?")

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep copy of `/project/.env` but read values from Infisical manually before deploy | Small diff today, quick workaround | Still creates a repo-root-driven deploy path and perpetuates manual secret handling | **Rejected** |
| **Generate a deployment `.env` at deploy time from Infisical and sync only that file to `{{ deploy_path }}/.env`** | Keeps existing compose semantics, minimal service disruption, no extra runtime dependency inside containers | Adds one deploy-time fetch step plus key allow-list validation | **Selected** |
| Use Docker secrets and rework all services to consume only secrets files | Best secret-at-rest isolation and rotation ergonomics | Requires deeper menos compose rewrite and broader service touch than requested in this phase | Deferred to later hardening task |

## Objective

After this plan:

1. menos deploy does not reference `/project/.env`.
2. A deploy-time helper pulls menos secrets from Infisical and renders `/apps/menos/.env` with mode `0600`.
3. Deploy tasks fail closed if required keys are missing.
4. Infisical secret source, required keys, and token redaction policy are documented and reviewable.
5. A dedicated runbook records migration steps and rollback for the `.env` workflow change.

## Project Context

- **Language/Stack**: YAML/Jinja2 (Ansible), Bash/Python (helper utility), Docker Compose
- **Target host**: `192.168.16.241` (`anvil`), path `/apps/menos`
- **Deploy entrypoints**: `menos/infra/ansible/playbooks/deploy.yml`, `menos/infra/ansible/roles/infisical/*`
- **Validation commands (docs/lint)**:
  - `docker compose -f menos/infra/ansible/docker-compose.yml build ansible`
  - `MSYS_NO_PATHCONV=1 docker run ... ansible-lint playbooks/deploy.yml`
  - `MSYS_NO_PATHCONV=1 docker run ... ansible-playbook --syntax-check playbooks/deploy.yml`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Define menos Infisical namespace + required key contract | `.specs/menos-infisical-runtime/secret-contract.md` | mechanical | haiku | builder-light | -- |
| T1 | Add deploy-time env renderer utility | `scripts/menos-infisical-env.py`, `test/menos_infisical_env_test.py` | feature | sonnet | builder | T0 |
| T2 | Add ansible config/vars for menos secret fetch | `menos/infra/ansible/group_vars/all.yml`, `menos/infra/ansible/group_vars/all.example.yml` | feature | haiku | builder-light | T0 |
| T3 | Replace repo-root `.env` copy in `deploy.yml` with Infisical render + strict validation | `menos/infra/ansible/playbooks/deploy.yml` | feature | sonnet | builder | T1, T2 |
| T4 | Make menos env loading explicit and deterministic in compose | `menos/infra/ansible/files/menos/docker-compose.yml` | feature | sonnet | builder | T3 |
| T5 | Document migration + rollback runbook for the new workflow | `.specs/menos-infisical-runtime/runbook.md`, `.specs/menos-infisical-runtime/migration-report.md` | docs | haiku | builder-light | T3 |
| V1 | Validate wave 1 | -- | validation | haiku | validator | T0, T1, T2 |
| V2 | Validate wave 2 | -- | validation | sonnet | validator-heavy | T3, T4, T5 |

## Execution Waves

### Wave 1

**T0: Define menos Infisical contract** [haiku] -- builder-light
- Description: Create `.specs/menos-infisical-runtime/secret-contract.md` with explicit mappings:
  - Secret path in Infisical (example: `/menos/prod/*`),
  - required keys for `docker-compose.yml` (e.g., `SURREALDB_PASSWORD`, `SURREALDB_NAMESPACE`, `SURREALDB_DATABASE`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`, `SEARXNG_SECRET`, optional `WEBSHARE_*` and API keys),
  - validation and failure policy (required vs optional, allowed placeholder strings, TTL/rotation guidance),
  - redaction policy for logs/evidence.
- Files: `.specs/menos-infisical-runtime/secret-contract.md`
- Acceptance Criteria:
  1. [ ] Contract includes `Required`, `Optional`, `Source`, `Rotation`, and `Failure` sections.
     - Verify: `grep -q '^## Required Keys\|^## Optional Keys\|^## Source\|^## Rotation\|^## Failure Policy' ...`
     - Pass: all headings exist.
  2. [ ] Every secret used by menos compose is mapped to a concrete Infisical key path.
     - Verify: each key in `{SURREALDB_PASSWORD,SURREALDB_NAMESPACE,SURREALDB_DATABASE,S3_ACCESS_KEY,S3_SECRET_KEY,GARAGE_RPC_SECRET,GARAGE_ADMIN_TOKEN,SEARXNG_SECRET}` appears in the mapping table.
  3. [ ] Secret handling policy explicitly says no repo-root `.env` copy and forbids token redaction violations.
     - Verify: grep for `repo-root .env` and redaction tokens (`CLOUDFLARE_API_TOKEN` style language, `no_log`, `diff: false`).

**T1: Add deploy-time env renderer utility** [sonnet] -- builder
- Description: Add `scripts/menos-infisical-env.py` that:
  1. authenticates to Infisical via machine identity credentials,
  2. fetches the contracted secrets path,
  3. merges optional public defaults from `.env.example`-style values,
  4. writes a deterministic `KEY=value` file to a target path,
  5. validates required keys are present,
  6. writes `0600` permissions and **never prints secret values**.

  CLI example:
  ```bash
  python scripts/menos-infisical-env.py \
    --project dotfiles \
    --environment prod \
    --path /menos \
    --out /tmp/menos.env
  ```
- Files: `scripts/menos-infisical-env.py`, `test/menos_infisical_env_test.py`
- Acceptance Criteria:
  1. [ ] Renderer succeeds in test mode and writes all required keys.
     - Verify: `python scripts/menos-infisical-env.py --out /tmp/menos.env --dry-run` (fixture-backed).
     - Pass: command exits 0 and file contains every required key.
  2. [ ] Missing required keys are rejected.
     - Verify: test fixture with one missing key returns non-zero and prints which key is missing.
  3. [ ] `--out` file is `0600`.
     - Verify: `stat -c '%a' /tmp/menos.env`
     - Pass: `600`.
  4. [ ] No raw secret values in stdout/stderr.
     - Verify: regex audit in unit tests checks redaction behavior for sample values.

**T2: Add ansible fetch settings and allow-list** [haiku] -- builder-light
- Description: Add `menos/infra/ansible/group_vars/all.yml` (and `.example` for documentation) with:
  - `menos_infisical_project`, `menos_infisical_environment`, `menos_infisical_path`,
  - `menos_infisical_required_keys` (list from T0),
  - `menos_infisical_runner` path,
  - `menos_infisical_runtime_env_out` path in deploy context,
  - `menos_infisical_runtime_env_mode: "0600"`.

  Keep sensitive values in Ansible vault only (e.g., `vault_menos_infisical_machine_client_secret` or equivalent).
- Files: `menos/infra/ansible/group_vars/all.yml`, `menos/infra/ansible/group_vars/all.example.yml`
- Acceptance Criteria:
  1. [ ] Variables are explicitly documented with comments and defaults.
     - Verify: `grep -q 'menos_infisical_' meno*` across both files.
     - Pass: all documented variable names appear.
  2. [ ] No clear-text machine secret is present in non-vault files.
     - Verify: grep for `vault_` prefix in variable names where secrets are expected.
     - Pass: secret values are not stored directly in YAML literals.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [haiku] -- validator
- Blocked by: T0, T1, T2
- Checks:
  1. Run T0 acceptance criteria.
  2. Run T1 acceptance criteria.
  3. Run T2 acceptance criteria.
  4. Structural check: `python -m pytest test/menos_infisical_env_test.py -q` (or equivalent targeted command).
- On failure: fix the failing task and re-run V1.

### Wave 2

**T3: Replace `/project/.env` copy with Infisical render in deploy playbook** [sonnet] -- builder
- Blocked by: V1
- Description: In `menos/infra/ansible/playbooks/deploy.yml`:
  - remove the current task that copies `/project/.env`.
  - add a task that runs `scripts/menos-infisical-env.py` on the control side (`delegate_to: localhost`) and fails closed on render errors.
  - add `no_log: true` and `diff: false` around secret-bearing tasks.
  - sync the rendered file to `{{ deploy_path }}/.env` with mode `0600`.
  - assert required keys by quick shell check against the rendered file.
  - keep all existing build/pull/start steps and version-gate logic unchanged.
- Files: `menos/infra/ansible/playbooks/deploy.yml`
- Acceptance Criteria:
  1. [ ] No remaining `/project/.env` sync in `deploy.yml`.
     - Verify: `grep -q 'Copy .env file' -n menos/infra/ansible/playbooks/deploy.yml` (must fail).
     - Pass: no copy task remains.
  2. [ ] Render+copy tasks are marked `no_log: true` and `diff: false`.
     - Verify: grep for both flags around env file operations.
     - Pass: both present and scoped to secret render/copy.
  3. [ ] Required-key check runs before `docker compose pull`/`build`.
     - Verify: inspect task order in file (render/assert precede compose pull).
     - Pass: ordering check in plan review is explicit.
  4. [ ] Deployed file path has secure mode.
     - Verify: rendered and remote `.env` tasks include `mode: "0600"`.
     - Pass: explicit permissions are mode `0600`.

**T4: Make env loading deterministic in menos compose** [sonnet] -- builder
- Blocked by: V1
- Description: Update `menos/infra/ansible/files/menos/docker-compose.yml` so service environment usage is explicit and not dependent on repo checkout `.env` location:
  - add service-level `env_file: [.env]` (or equivalent shared file notation),
  - keep non-secret inline values as static defaults,
  - remove any environment assumptions that silently fallback to local placeholders.

  This preserves current runtime semantics while making the deploy-source explicit for future audits.
- Files: `menos/infra/ansible/files/menos/docker-compose.yml`
- Acceptance Criteria:
  1. [ ] `menos` services reference a single shared runtime env source.
     - Verify: grep `env_file` occurrences in compose.
     - Pass: at least one service-wide env_file declaration exists and is applied consistently.
  2. [ ] No hard-coded secret placeholders remain in compose.
     - Verify: `grep -E 'changeme|TODO|<replace|REPLACE_ME' menos/infra/ansible/files/menos/docker-compose.yml`
     - Pass: no matches.
  3. [ ] Non-secret defaults remain in compose or explicit templates.
     - Verify: section review in runbook for `DATA_PATH`, `UNIFIED_PIPELINE_*`, `S3_ENDPOINT_URL` defaults.
     - Pass: defaults present and unchanged by task.

**T5: Document migration and rollback for menos secret-source switch** [haiku] -- builder-light
- Blocked by: V1
- Description: Write `.specs/menos-infisical-runtime/runbook.md` with:
  - preflight checklist,
  - one-time Infisical migration steps (copy existing keys to `/menos` path, mark legacy `.env` source as retired),
  - deploy command sequence,
  - rollback behavior (`revert` to previous `.env` file and pause updates),
  - required validation commands.

  Add a short migration record template in `.specs/menos-infisical-runtime/migration-report.md` for every moved key.
- Files: `.specs/menos-infisical-runtime/runbook.md`, `.specs/menos-infisical-runtime/migration-report.md`
- Acceptance Criteria:
  1. [ ] Runbook contains explicit steps to remove repo-root `.env` dependency.
     - Verify: `grep -q 'repo-root' .specs/menos-infisical-runtime/runbook.md`
     - Pass: at least one explicit statement.
  2. [ ] Rollback steps include how to pause/remove rendered secret file.
     - Verify: runbook has a `## Rollback` section.
     - Pass: section exists.
  3. [ ] Migration report template lists source path, destination path, status, and verification command.
     - Verify: grep for those headers.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T3, T4, T5
- Checks:
  1. Run all acceptance criteria from T3, T4, T5.
  2. `ansible-lint` + syntax checks from container context:
     - `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-lint playbooks/deploy.yml`
     - `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-playbook --syntax-check playbooks/deploy.yml`
  3. Non-regression on startup flow: run `ansible-playbook playbooks/deploy.yml --check --diff` and inspect that rendered secret tasks are redacted.
  4. Manual/live check on a staging menos deploy:
     - generated env file exists at `{{deploy_path}}/.env` and is mode `0600`,
     - services start and `curl -fsS http://{{ ansible_host }}:8000/health` returns valid JSON,
     - redeploy without source `.env` in repo root (prove decoupling).
  5. Optional: if Infisical runtime auth is unavailable, deployment fails fast with a clear remediation line, and does not copy partial secrets.
- On failure: implement the required fix task and re-run V2.

## Dependency Graph

```text
Wave 1: T0, T1, T2 (parallel where ordering permits) -> V1
Wave 2: T3, T4, T5 (parallel) -> V2
```

## Success Criteria

1. [ ] No code path in `menos/infra/ansible/playbooks/deploy.yml` reads `/project/.env` for runtime secrets.
   - Verify: grep check in V2.
2. [ ] Deployed runtime env is always generated from Infisical at deploy time.
   - Verify: manual deployment runbook output includes generated artifact path and source marker.
3. [ ] Deploy fails fast when required secrets are missing.
   - Verify: missing-key scenario returns non-zero and aborts before `docker compose build`.
4. [ ] Deployed `.env` file permissions are `0600` and no logs contain plain secret values.
   - Verify: `stat` and redaction checks in V2 plus grep of ansible output.
5. [ ] menos starts successfully after switching workflow and remains restartable without repo-root `.env`.
   - Verify: successful `/health` smoke test after deploy.
6. [ ] Migration report + runbook capture every moved key and rollback path.
   - Verify: sections in migration artifacts exist and are non-empty.

## Execution Status

- **Completion classification**: `not-started`
- **Date**: 2026-05-03
- **Last completed wave/gate**: none
- **Remaining blockers**: live menos deploy and secrets path in Infisical must be ready (machine identity/token and source folder paths).

## Validation Contract

Evidence should be written in:
- `.specs/menos-infisical-runtime/validation-wave2.md`
- `.specs/menos-infisical-runtime/migration-report.md`

## Handoff Notes

- This plan is intentionally post-Infisical-DNS/TLS: it assumes `infisical.ilude.com` and Caddy Cloudflare certificate path are already working and stable.
- It keeps service behavior stable (menos remains the same services, same compose, same Docker image assumptions).
- The `.env` fetch utility should be implemented to fail-safe if auth expires or machine identity is mis-scoped.
- Follow-up hardening task: move menos service env usage from file-based to Docker secrets once this migration is stable.
