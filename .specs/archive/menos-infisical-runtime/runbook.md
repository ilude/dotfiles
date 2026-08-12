# Menos Infisical Runtime Runbook

## Preflight Checklist

1. Confirm `ansible_host` is `192.168.16.241` and `deploy_path` is `/apps/menos`.
2. Confirm `menos_infisical_project`, `menos_infisical_environment`, and `menos_infisical_path` point to the intended Infisical namespace.
3. Confirm vault-backed `vault_menos_infisical_machine_client_id` and `vault_menos_infisical_machine_client_secret` are available.
4. Build the Ansible image: `docker compose -f menos/infra/ansible/docker-compose.yml build ansible`.

## Remove repo-root /project/.env Dependency

1. Copy existing runtime key names from the legacy repo-root source into Infisical under `menos_infisical_path`.
2. Render only from Infisical with `uv run python scripts/menos-infisical-env.py --project dotfiles --environment prod --path /menos --out /tmp/menos.env --write`.
3. Do not copy `/project/.env` during deploy. The playbook installs the rendered file to `/apps/menos/.env`.
4. Mark the legacy repo-root source retired after the health check and redeploy checks pass.

## Deploy Sequence

1. Run ansible-lint and syntax-check in the Ansible container.
2. Run preflight without `--diff`: `ansible-playbook playbooks/deploy.yml --check --tags preflight`.
3. Run deploy with one vault auth mode, for example `ansible-playbook playbooks/deploy.yml --ask-vault-pass`.
4. Verify `curl -fsS http://192.168.16.241:8000/health` returns JSON.

## Rollback

1. Pause new deployments.
2. Restore `/apps/menos/.env.bak` to `/apps/menos/.env` with mode `0600` if the new rendered file breaks startup.
3. Remove any rendered temp directory such as `/dev/shm/menos` on the controller.
4. Re-run `docker compose up -d` from `/apps/menos` and inspect `docker compose ps`.

## Validation Commands

- `uv run python -m pytest test/menos_infisical_env_test.py -q`
- `uv run python .specs/menos-infisical-runtime/validation-helpers.py`
- `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-lint playbooks/deploy.yml`
- `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-playbook --syntax-check playbooks/deploy.yml`

## Defaults Review

`DATA_PATH`, `UNIFIED_PIPELINE_*`, and `S3_ENDPOINT_URL` remain compose or template defaults unless explicitly supplied by Infisical. Required secrets have no local placeholder fallback.
