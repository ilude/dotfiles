# Wave 2 Validation Evidence

## Structural checks

Run:

```bash
uv run python .specs/menos-infisical-runtime/validation-helpers.py
```

Expected: `PASS menos Infisical runtime structural validation`.

## Container checks

Run after building the Ansible image:

```bash
docker compose -f menos/infra/ansible/docker-compose.yml build ansible
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-lint playbooks/deploy.yml
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-playbook --syntax-check playbooks/deploy.yml
```

## Live checks

Pending user-controlled deployment validation:

1. Run preflight without `--diff` and with the selected vault auth mode.
2. Confirm `/apps/menos/.env` exists on `192.168.16.241` with mode `0600`.
3. Confirm `curl -fsS http://192.168.16.241:8000/health` returns JSON.
4. Redeploy without a repo-root `.env` and confirm the same health result.
