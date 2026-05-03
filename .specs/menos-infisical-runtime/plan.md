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
- Secret rendering must be fail-closed and atomic: no compose/build actions before required secret validation passes.
- Secret artifacts on the controller must be ephemeral (`/run`/`/dev/shm`) and deleted on both success and failure.
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

## Operator Prerequisites (clean-session execution)

Before running any task/gate, ensure these inputs are explicitly set and available:

- **Required deploy targets**
  - `ansible_host`: `192.168.16.241`
  - `deploy_path`: `/apps/menos`
- **Required Infisical selectors**
  - `menos_infisical_project`
  - `menos_infisical_environment`
  - `menos_infisical_path`
- **Required secret-auth inputs (vault-backed)**
  - Vault-backed machine identity values (for example `vault_menos_infisical_machine_client_id`, `vault_menos_infisical_machine_client_secret`) must be resolvable at runtime.
  - Use one explicit vault auth mode per run:
    - `--ask-vault-pass`, or
    - `--vault-password-file <path>`, or
    - equivalent documented non-interactive vault flow.
- **Container/tooling baseline**
  - Build Ansible container first: `docker compose -f menos/infra/ansible/docker-compose.yml build ansible`
  - Python validations use `uv run ...` (not raw `python`).

**Minimum execution sequence in a clean session**
1. Run Wave 1 tasks (`T0`, `T1`, `T2`) and pass `V1`.
2. Run Wave 2 tasks (`T3`, `T4`, `T5`), then `T6`.
3. Run `V2` checks (without `--diff` for secret-bearing preflight).
4. Record evidence artifacts:
   - `.specs/menos-infisical-runtime/validation-wave2.md`
   - `.specs/menos-infisical-runtime/migration-report.md`
   - `.specs/menos-infisical-runtime/redaction-checklist.md`
5. Execute implementation via `/do-it .specs/menos-infisical-runtime/plan.md` once bugs/hardening are applied and validations pass.

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
| T1 | Add deploy-time env renderer utility | `scripts/menos-infisical-env.py`, `test/menos_infisical_env_test.py`, `menos/infra/ansible/Dockerfile` | feature | sonnet | builder | T0 |
| T2 | Add ansible config/vars for menos secret fetch | `menos/infra/ansible/playbooks/group_vars/all.yml`, `menos/infra/ansible/playbooks/group_vars/all.example.yml` | feature | haiku | builder-light | T0 |
| T3 | Replace repo-root `.env` copy in `deploy.yml` with Infisical render + strict validation | `menos/infra/ansible/playbooks/deploy.yml` | feature | sonnet | builder | T1, T2 |
| T4 | Make menos env loading explicit and deterministic in compose | `menos/infra/ansible/files/menos/docker-compose.yml` | feature | sonnet | builder | T3 |
| T5 | Document migration + rollback runbook for the new workflow | `.specs/menos-infisical-runtime/runbook.md`, `.specs/menos-infisical-runtime/migration-report.md` | docs | haiku | builder-light | T3 |
| T6 | Add verification helpers for plan-level checks | `.specs/menos-infisical-runtime/validation-helpers.py`, `.specs/menos-infisical-runtime/validation-wave2.md` | mechanical | haiku | validator | T3, T4 |
| V1 | Validate wave 1 | -- | validation | haiku | validator | T0, T1, T2 |
| V2 | Validate wave 2 | -- | validation | sonnet | validator-heavy | T3, T4, T5, T6 |

## Execution Waves

### Wave 1

**T0: Define menos Infisical contract** [haiku] -- builder-light
- Description: Create `.specs/menos-infisical-runtime/secret-contract.md` with explicit mappings:
  - Secret path in Infisical (example: `/menos/prod/*`),
  - required keys for `docker-compose.yml` (e.g., `SURREALDB_PASSWORD`, `SURREALDB_NAMESPACE`, `SURREALDB_DATABASE`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`, `SEARXNG_SECRET`, optional `WEBSHARE_*` and API keys),
  - validation and failure policy (required vs optional, prohibited placeholder patterns, TTL/rotation guidance),
  - redaction policy for logs/evidence.
  - script reuse policy: prefer reusing shared Infisical access utilities if one already exists in repo; if not, document why this utility is separate.
- Files: `.specs/menos-infisical-runtime/secret-contract.md`
- Acceptance Criteria:
  1. [ ] Contract includes `Required`, `Optional`, `Source`, `Rotation`, `Validation`, and `Failure` sections.
     - Verify: `grep -q '^## Required Keys\|^## Optional Keys\|^## Source\|^## Rotation\|^## Validation\|^## Failure' ...`
     - Pass: all headings exist.
  2. [ ] Every secret used by menos compose is mapped to a concrete Infisical key path.
     - Verify: each key in `{SURREALDB_PASSWORD,SURREALDB_NAMESPACE,SURREALDB_DATABASE,S3_ACCESS_KEY,S3_SECRET_KEY,S3_BUCKET,GARAGE_RPC_SECRET,GARAGE_ADMIN_TOKEN,SEARXNG_SECRET}` appears in the mapping table.
  3. [ ] Reuse decision is explicit.
     - Verify: contract records if a shared Infisical fetch utility is reused or why it is not.
  4. [ ] Placeholder policy excludes `changeme`, `REPLACE_ME`, `<replace>`, and empty strings for required keys.

**T1: Add deploy-time env renderer utility** [sonnet] -- builder
- Description: Add `scripts/menos-infisical-env.py` that:
  1. authenticates to Infisical via machine identity credentials,
  2. fetches the contracted secrets path,
  3. merges optional defaults from a repo-local menos template (`menos/infra/ansible/files/menos/.env.example`) after Infisical values,
  4. validates required keys are present and non-placeholder (`changeme`, empty, too short),
  5. supports deterministic output modes:
     - `--validate`: fetch and validate only, no file writes,
     - `--write`: render a file,
  6. writes to a temp file, atomically renames to output, sets `0600`, and **never prints secret values**.
  7. supports offline test mode with injectable fixture JSON to avoid network calls.

  CLI example:
  ```bash
  uv run python scripts/menos-infisical-env.py \
    --project dotfiles \
    --environment prod \
    --path /menos \
    --out /tmp/menos.env --write
  ```
- Files: `scripts/menos-infisical-env.py`, `test/menos_infisical_env_test.py`, `menos/infra/ansible/Dockerfile`
- Acceptance Criteria:
  1. [ ] Renderer validates-only mode works in tests.
     - Verify: `uv run python scripts/menos-infisical-env.py --project dotfiles --environment prod --path /menos --validate --secrets-json test/fixtures/menos-secrets.json`
     - Pass: exit 0 and printed output does not include secret values.
  2. [ ] Renderer write mode writes all required keys and enforces mode bits.
     - Verify: `uv run python scripts/menos-infisical-env.py --out /tmp/menos.env --write --secrets-json test/fixtures/menos-secrets.json`
     - Pass: command exits 0, file exists with all required keys, and `stat -c '%a' /tmp/menos.env` is `600`.
  3. [ ] Missing key or weak/placeholder values are rejected.
     - Verify: fixture tests with missing key, empty value, placeholder (`changeme`/`REPLACE_ME`), and invalid format/short-token return non-zero and mark exact key.
  4. [ ] No raw secret values appear in stdout/stderr.
     - Verify: capture output and assert regex redaction for all fixture secret values.
  5. [ ] Dependency strategy is explicit and executable in container.
     - Verify: running `uv run python scripts/menos-infisical-env.py --help` succeeds inside the Ansible container image.

**T2: Add ansible fetch settings and allow-list** [haiku] -- builder-light
- Description: Add `menos/infra/ansible/playbooks/group_vars/all.yml` (and `.example` for documentation) with:
  - `menos_infisical_project`, `menos_infisical_environment`, `menos_infisical_path`,
  - `menos_infisical_required_keys` (list from T0),
  - `menos_infisical_runtime_env_out` path in deploy context,
  - `menos_infisical_runtime_env_mode: "0600"`,
  - `menos_infisical_tmp_dir` (default `/run/menos` or `/dev/shm/menos`).

  Keep sensitive values in Ansible vault only (e.g., `vault_menos_infisical_machine_client_secret` or equivalent), not in non-vault files.
- Files: `menos/infra/ansible/playbooks/group_vars/all.yml`, `menos/infra/ansible/playbooks/group_vars/all.example.yml`
- Acceptance Criteria:
  1. [ ] Variables are explicitly documented with defaults and precedence.
     - Verify: each listed key is defined and documented in both files.
     - Pass: all listed keys present in both files.
  2. [ ] No clear-text machine secret is present in non-vault files.
     - Verify: only `vault_*` key references appear where secret-bearing input exists.
     - Pass: no secret values are stored directly in YAML literals.
  3. [ ] Vars file location is verified for loadability.
     - Verify: group_vars load location is exercised by a parser that reads `menos/infra/ansible/playbooks/group_vars/all.yml` and confirms keys are present before running deploy.
     - Pass: all required vars from this task are present in that file path.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [haiku] -- validator
- Blocked by: T0, T1, T2
- Checks:
  1. Run T0 acceptance criteria.
  2. Run T1 acceptance criteria.
  3. Run T2 acceptance criteria.
  4. Structural check: `uv run python -m pytest test/menos_infisical_env_test.py -q` (or equivalent targeted command).
- On failure: fix the failing task and re-run V1.

### Wave 2

**T3: Replace `/project/.env` copy with Infisical render in deploy playbook** [sonnet] -- builder
- Blocked by: V1
- Description: In `menos/infra/ansible/playbooks/deploy.yml`:
  - remove the current task that copies `/project/.env`.
  - add a preflight block before any remote mutation that:
    1. checks required secret inputs exist and secret-path variables are present,
    2. verifies vault password handling is provided (e.g., `--ask-vault-pass`, `--vault-password-file`, or `ansible-vault` env flow),
    3. runs `scripts/menos-infisical-env.py --validate` on `delegate_to: localhost` with `no_log: true`,
    4. runs `scripts/menos-infisical-env.py --write --out {{ menos_infisical_tmp_dir }}/menos.env` on `delegate_to: localhost`.
  - tag preflight tasks as `preflight` so `--check --tags preflight` can validate without mutating the host.
  - keep all secret-bearing tasks scoped to control-node only, with `no_log: true` and `diff: false`.
  - install `{{ menos_infisical_tmp_dir }}/menos.env` to `{{ deploy_path }}/.env` atomically (backup + chmod `0600`).
  - add rollback block:
    - restore previous `.env` backup on failure after deployment-start,
    - remove temporary outputs in both success and failure paths.
  - keep existing build/pull/start steps and version-gate logic unchanged once preflight passes.
- Files: `menos/infra/ansible/playbooks/deploy.yml`
- Acceptance Criteria:
  1. [ ] No remaining `/project/.env` sync in `deploy.yml`.
     - Verify: structured parse confirms no task source string contains `/project/.env` and no `Copy .env file` task id exists.
  2. [ ] Preflight render/validate completes before `docker compose pull`/`build`.
     - Verify: task order check parses plain-text output from `ansible-playbook --list-tasks` and confirms preflight tasks appear before compose tasks.
     - Pass: validation task names precede `compose.*` tasks.
  3. [ ] Secret validation and write are fail-closed.
     - Verify: a missing/invalid secret fixture causes non-zero exit and no `.env` install/update on deploy target.
     - Verify: running without vault pass/token fails before contact with compose actions with explicit remediation.
  4. [ ] `.env` installation is atomic and cleaned up.
     - Verify: both success/failure paths remove `{{ menos_infisical_tmp_dir }}/*` and preserve old `.env` backup semantics on failure.
     - Verify: deploy task writes to temp path then atomically renames into `{{ deploy_path }}/.env`.
  5. [ ] Compose interpolation preflight is explicit before compose actions.
     - Verify: preflight runs `cd {{ deploy_path }} && docker compose -f docker-compose.yml config` before any `docker compose pull`/`build` task.

**T4: Make env loading deterministic in menos compose** [sonnet] -- builder
- Blocked by: V1
- Description: Update `menos/infra/ansible/files/menos/docker-compose.yml` so runtime env usage is explicit and not dependent on repo checkout `.env` location:
  - add service-level `env_file: [.env]` consistently for all services that reference `${...}` interpolation values,
  - keep non-secret inline values as static defaults,
  - ensure interpolation-required vars are guaranteed by contract + deploy-time rendering (no local fallback placeholders).

  This preserves current runtime semantics while making the deploy-source explicit for future audits.
- Files: `menos/infra/ansible/files/menos/docker-compose.yml`
- Acceptance Criteria:
  1. [ ] `menos` services with `${VAR}` references explicitly reference `.env` (service-level or documented reason).
     - Verify: a scriptable scan lists every `${VAR}` in compose and maps each to env source coverage.
     - Pass: no uncovered `${VAR}` references remain for services in scope.
  2. [ ] No hard-coded secret placeholders remain in compose.
     - Verify: `grep -E 'changeme|TODO|<replace|REPLACE_ME' menos/infra/ansible/files/menos/docker-compose.yml` has no required-secret matches.
     - Pass: required secret values are not literal.
  3. [ ] Parse-time determinism check is explicit.
     - Verify: preflight includes `cd {{ deploy_path }} && docker compose -f docker-compose.yml config` and fails if interpolation is incomplete.
  4. [ ] Non-secret defaults remain in compose or explicit templates.
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
     - Verify: script scan validates a section heading mentioning `repo-root`/`/project/.env` removal and references `--write` infisical flow.
     - Pass: explicit statement present.
  2. [ ] Rollback steps include how to pause/remove rendered secret file.
     - Verify: runbook has a `## Rollback` section.
     - Pass: section exists.
  3. [ ] Migration report template lists source path, destination path, status, and verification command.
     - Verify: grep for those headers.

**T6: Add validation helpers for plan-level structural checks** [haiku] -- validator
- Blocked by: T3, T4
- Description: Add `.specs/menos-infisical-runtime/validation-helpers.py` (or equivalent command snippets) and `validation-wave2.md` updates that:
  - parse `menos/infra/ansible/playbooks/deploy.yml` and `menos/infra/ansible/files/menos/docker-compose.yml` for explicit forbidden/required patterns,
  - verify no `/project/.env` task exists and no required-secrets placeholders remain,
  - verify preflight block ordering appears before `docker compose` tasks,
  - verify `.env` tasks are tagged/scoped and `no_log`/`diff` are set,
  - verify redaction checklist artifact exists and is non-empty.
- Files: `.specs/menos-infisical-runtime/validation-helpers.py`, `.specs/menos-infisical-runtime/validation-wave2.md`, `.specs/menos-infisical-runtime/redaction-checklist.md`
- Acceptance Criteria:
  1. [ ] Script-level checks can run locally in CI-like fashion with no external secrets.
     - Verify: command exits 0 in clean repo checkout.
  2. [ ] Validation output is deterministic and non-secret.
     - Verify: repeated runs produce identical pass/fail summaries.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T3, T4, T5, T6
- Checks:
  1. Run all acceptance criteria from T3, T4, T5, T6.
  2. `ansible-lint` + syntax checks from container context:
     - `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-lint playbooks/deploy.yml`
     - `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-playbook --syntax-check playbooks/deploy.yml`
  3. Non-regression on startup flow: run `ansible-playbook playbooks/deploy.yml --check --tags preflight` and validate preflight task pass.
     - Requirement: preflight tasks that use `command`/`shell` must set `check_mode: false` (with strict `changed_when`/`failed_when`) or provide an equivalent non-check preflight command path so validation actually executes.
     - Requirement: secret-bearing preflight tasks must keep `no_log: true` and `diff: false`; do not run preflight with `--diff`.
  4. Manual/live check on a staging menos deploy:
     - generated env file exists at `{{deploy_path}}/.env` and is mode `0600`,
     - services start and `curl -fsS http://{{ ansible_host }}:8000/health` returns valid JSON,
     - redeploy without source `.env` in repo root (prove decoupling).
  5. Optional: if Infisical runtime auth is unavailable, deployment fails fast with a clear remediation line, and does not copy partial secrets.
     - Verify `ansible-playbook playbooks/deploy.yml --tags preflight` fails with non-secret remediation text.
- On failure: implement the required fix task and re-run V2.

## Dependency Graph

```text
Wave 1: T0, T1, T2 (parallel where ordering permits) -> V1
Wave 2: T3, T4, T5 (parallel where ordering permits), then T6 -> V2
```

## Success Criteria

1. [ ] No code path in `menos/infra/ansible/playbooks/deploy.yml` reads `/project/.env` for runtime secrets.
   - Verify: structural YAML+Jinja scan in `.specs/menos-infisical-runtime/validation-helpers.py` fails if any `/project/.env` usage remains.
2. [ ] Deployed runtime env is always generated from Infisical at deploy time.
   - Verify: manual runbook output includes artifact path and source marker `menos_infisical`.
3. [ ] Deploy fails fast when required secrets are missing.
   - Verify: missing-key/invalid-vault scenario returns non-zero and aborts before any compose action.
4. [ ] Deployed `.env` file permissions are `0600`, temp artifacts are cleaned, and no logs contain plain secret values.
   - Verify: `stat` plus cleanup script output + redaction checks in V2 and `validation-helpers.py` assertions.
5. [ ] menos starts successfully after switching workflow and remains restartable without repo-root `.env`.
   - Verify: successful `/health` smoke test after deploy and redeploy without repo-root `.env`.
6. [ ] Migration report + runbook capture every moved key and rollback path.
   - Verify: sections in migration artifacts exist and are non-empty.

## Execution Status

- **Completion classification**: `blocked-by-failure`
- **Date**: 2026-05-03
- **Last completed wave/gate**: Wave 1 implementation and targeted V1 checks; Wave 2 implementation and structural helper checks.
- **Next wave/gate to run**: V2 ansible-lint remediation, then live/manual menos deploy validation.
- **Implemented**:
  - Added `.specs/menos-infisical-runtime/secret-contract.md` with source, required/optional keys, rotation, validation, and failure policy.
  - Added `scripts/menos-infisical-env.py`, fixture-backed tests, and `test/menos_infisical_env_test.py`.
  - Added Ansible group vars under `menos/infra/ansible/playbooks/group_vars/`.
  - Replaced the playbook repo-root `.env` copy path with Infisical validate/render/install tasks and compose interpolation preflight.
  - Added explicit compose `env_file: [.env]` usage for services that read runtime env values.
  - Added runbook, migration report template, validation helper, validation evidence template, and redaction checklist.
- **Commands already run**:
  - `uv run ruff check scripts/menos-infisical-env.py test/menos_infisical_env_test.py .specs/menos-infisical-runtime/validation-helpers.py --fix` - passed.
  - `uv run ruff format scripts/menos-infisical-env.py test/menos_infisical_env_test.py .specs/menos-infisical-runtime/validation-helpers.py` - passed.
  - `uv run python -m pytest test/menos_infisical_env_test.py -q` - passed, 4 tests.
  - `uv run python .specs/menos-infisical-runtime/validation-helpers.py` - passed.
  - `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-playbook --syntax-check playbooks/deploy.yml` - passed with inventory warnings.
  - `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-lint playbooks/deploy.yml` - failed.
- **Why not archived**: required V2 ansible-lint failed and live/manual deploy validation remains incomplete.
- **Failing validation**:
  - `ansible-lint playbooks/deploy.yml` reports existing/basic issues in `deploy.yml`: `command-instead-of-module` for git/rsync tasks, `risky-shell-pipe` in git-dir detection, one line-length issue, and `no-relative-paths` for the compose file copy source.
- **Checks still needed**:
  - Fix or refactor the ansible-lint findings without suppressing diagnostics, then rerun ansible-lint and syntax-check.
  - Run repo-wide completion validation after V2 passes.
  - Run live/manual menos validation with vault-backed Infisical machine identity.
- **Remaining manual/live validation steps**:
  1. Build the Ansible image: `docker compose -f menos/infra/ansible/docker-compose.yml build ansible`.
  2. From `menos/infra/ansible`, run preflight without `--diff` using exactly one vault auth mode, for example `ansible-playbook playbooks/deploy.yml --check --tags preflight --ask-vault-pass`.
  3. Run the deploy with vault auth after preflight passes.
  4. On `192.168.16.241`, confirm `/apps/menos/.env` exists and mode is `0600`.
  5. Confirm `curl -fsS http://192.168.16.241:8000/health` returns valid JSON.
  6. Redeploy without repo-root `.env` and confirm the health check still passes.
  7. If any step fails, restore `/apps/menos/.env.bak` to `/apps/menos/.env`, remove controller temp dir `{{ menos_infisical_tmp_dir }}`, inspect `docker compose ps`, and rerun `/do-it .specs/menos-infisical-runtime/plan.md` after fixing the issue.
- **Rerun guidance**: rerun `/do-it .specs/menos-infisical-runtime/plan.md` after ansible-lint is fixed and live validation prerequisites are available.

## Validation Contract

Evidence should be written in:
- `.specs/menos-infisical-runtime/validation-wave2.md`
- `.specs/menos-infisical-runtime/migration-report.md`
- `.specs/menos-infisical-runtime/redaction-checklist.md`

Minimum redaction checklist content:
- command(s) executed
- confirmation that secret-bearing tasks used `no_log: true` and `diff: false`
- confirmation that no plaintext secret values appeared in captured output
- temp artifact cleanup confirmation (`{{ menos_infisical_tmp_dir }}` empty/removed)


## Handoff Notes

- This plan is intentionally post-Infisical-DNS/TLS: it assumes `infisical.ilude.com` and Caddy Cloudflare certificate path are already working and stable.
- It keeps service behavior stable (menos remains the same services, same compose, same Docker image assumptions).
- The `.env` fetch utility should be implemented to fail-safe if auth expires or machine identity is mis-scoped.
- Follow-up hardening task: move menos service env usage from file-based to Docker secrets once this migration is stable.
