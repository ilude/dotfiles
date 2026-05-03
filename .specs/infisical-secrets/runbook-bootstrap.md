# Infisical Bootstrap Runbook

## Prerequisites

- Joyride runs on the menos host (`192.168.16.241`) with:
  ```bash
  JOYRIDE_DOCKER_TAG=coredns
  CLUSTER_ENABLED=true
  DNS_UNKNOWN_ACTION=drop
  ```
- Joyride static DNS maps `infisical.ilude.com` to `192.168.16.241`:
  ```text
  192.168.16.241 infisical.ilude.com
  ```
- Cloudflare manages the public authoritative `ilude.com` zone.
- Cloudflare API token is scoped to `ilude.com` with `Zone:Read` and `DNS:Edit`, and is stored only in Ansible vault as `vault_infisical_cloudflare_api_token`.
- Required Ansible vault variables are populated: `vault_infisical_encryption_key`, `vault_infisical_auth_secret`, `vault_infisical_postgres_password`, `vault_infisical_cloudflare_api_token`.
- Decide the Ansible vault password mechanism before running deploy commands: `--ask-vault-pass`, vault password file mount, or equivalent local operator flow. Do not print vault values.
- Root admin credentials will be stored in the operator's password manager, not in this repository.

## DNS validation before deploy

1. Confirm direct Joyride DNS:
   ```bash
   dig @192.168.16.241 -p 54 infisical.ilude.com A
   ```
2. Confirm real client resolver behavior:
   ```bash
   dig infisical.ilude.com A
   dig example.com A
   ```
   Expected: `infisical.ilude.com` resolves to `192.168.16.241`, and unrelated public names still resolve with acceptable latency while `DNS_UNKNOWN_ACTION=drop` remains enabled.

## Procedure

1. Build the Ansible validation/deploy image:
   ```bash
   docker compose -f menos/infra/ansible/docker-compose.yml build ansible
   ```
2. Dry-run the Infisical deploy only after confirming token-bearing tasks use `no_log: true` and `diff: false`:
   ```bash
   cd menos/infra/ansible
   docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml --check --diff --ask-vault-pass
   ```
3. Deploy the Infisical stack, keeping Let's Encrypt staging enabled for the first pass:
   ```bash
   cd menos/infra/ansible
   docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml --ask-vault-pass
   ```
4. Confirm Caddy can create ACME DNS-01 TXT records through Cloudflare:
   ```bash
   dig @1.1.1.1 _acme-challenge.infisical.ilude.com TXT
   docker logs infisical-caddy --tail=200
   ```
   The TXT record may disappear after validation completes.
5. Validate HTTPS and certificate details:
   ```bash
   curl --resolve infisical.ilude.com:443:192.168.16.241 -fsS https://infisical.ilude.com/api/status
   openssl s_client -connect infisical.ilude.com:443 -servername infisical.ilude.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -ext subjectAltName
   ```
6. After staging succeeds, set `infisical_caddy_letsencrypt_staging: false` and repeat deploy plus HTTPS/certificate validation for production Let's Encrypt.
7. Open the signup page in a browser:
   ```text
   https://infisical.ilude.com/signup
   ```
8. Create the root admin account once. Store the email, password, and recovery notes in the password manager.
9. Confirm the web UI loads with a valid TLS chain and no browser certificate warning.
10. Stage the T5 bootstrap inputs. T5 requires either an interactive root-admin login flow or an admin API token supplied as `INFISICAL_ADMIN_TOKEN`.
11. After T5 creates machine identities, copy each one-time client secret into the password manager and the appropriate Docker secret on the menos host, then shred the tmpfs handoff file:
    ```bash
    shred -u /run/infisical-bootstrap-secrets.txt
    ```

## Rollback

If Caddy/DNS-01 deployment fails:

1. Keep or switch back to `infisical_caddy_letsencrypt_staging: true`.
2. Confirm `vault_infisical_cloudflare_api_token` scope and Caddy logs.
3. Disable DNS-01 temporarily only if needed for troubleshooting.
4. Use the static Joyride record fallback for `infisical.ilude.com`.
5. Stop Caddy if it is blocking another service:
   ```bash
   docker stop infisical-caddy
   ```
6. Remove failed/stale `_acme-challenge.infisical.ilude.com` records from Cloudflare if Caddy did not clean them up.

## Expected success signals

- `dig @192.168.16.241 -p 54 infisical.ilude.com A` returns `192.168.16.241`.
- `curl --resolve infisical.ilude.com:443:192.168.16.241 -fsS https://infisical.ilude.com/api/status` exits 0.
- Certificate issuer is Let's Encrypt and SAN includes `infisical.ilude.com`.
- Browser shows a valid Let's Encrypt certificate.
- Root admin account can log in.
- No Cloudflare token, root admin credentials, or machine-identity secrets are written to the repo or printed in logs/evidence.
