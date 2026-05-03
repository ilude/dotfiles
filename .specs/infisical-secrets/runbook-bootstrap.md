# Infisical Bootstrap Runbook

## Prerequisites

- DNS for `infisical.<host-domain>` points at `192.168.16.241`.
- Ports 80 and 443 are reachable from the public internet for Let's Encrypt HTTP-01/TLS-ALPN validation.
- Required Ansible vault variables are populated: `vault_infisical_encryption_key`, `vault_infisical_auth_secret`, `vault_infisical_postgres_password`.
- Root admin credentials will be stored in the operator's password manager, not in this repository.

## Procedure

1. Build the Ansible validation/deploy image:
   ```bash
   docker compose -f menos/infra/ansible/docker-compose.yml build ansible
   ```
2. Dry-run the Infisical deploy:
   ```bash
   cd menos/infra/ansible
   docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml --check --diff
   ```
3. Deploy the Infisical stack:
   ```bash
   cd menos/infra/ansible
   docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml
   ```
4. Wait for Caddy to obtain a certificate and for Infisical to report healthy:
   ```bash
   curl -fsS https://infisical.<host-domain>/api/status
   ```
5. Open the signup page in a browser:
   ```text
   https://infisical.<host-domain>/signup
   ```
6. Create the root admin account once. Store the email, password, and recovery notes in the password manager.
7. Confirm the web UI loads with a valid TLS chain and no browser certificate warning.
8. Stage the T5 bootstrap inputs. T5 requires either an interactive root-admin login flow or an admin API token supplied as `INFISICAL_ADMIN_TOKEN`.
9. After T5 creates machine identities, copy each one-time client secret into the password manager and the appropriate Docker secret on the menos host, then shred the tmpfs handoff file:
   ```bash
   shred -u /run/infisical-bootstrap-secrets.txt
   ```

## Expected success signals

- `curl -fsS https://infisical.<host-domain>/api/status` exits 0.
- Browser shows a valid Let's Encrypt certificate.
- Root admin account can log in.
- No root admin credentials or machine-identity secrets are written to the repo.
