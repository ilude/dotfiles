---
created: 2026-05-03
status: draft
completed:
---

# Plan: Joyride DNS and Caddy DNS-01 certs for Infisical

## Objective

Unblock `.specs/infisical-secrets/plan.md` Wave 2 by adding a concrete DNS/TLS plan for `infisical.ilude.com`:

1. Joyride/CoreDNS resolves the Infisical hostname on the local network.
2. Caddy obtains and renews a Let's Encrypt certificate using Cloudflare DNS-01.
3. Cloudflare API credentials are supplied through Ansible vault/runtime env only, never committed, never rendered into shared Infisical env, and never exposed by Ansible diffs/logs.
4. The Infisical Ansible role can deploy a reproducible Caddy build with the Cloudflare DNS plugin and validate HTTPS without `--insecure`.

## Context

Joyride repo: `C:/Projects/Personal/joyride`

Relevant findings:

- Joyride is a custom CoreDNS image with Docker-label based DNS records, static hosts support, and optional SWIM cluster record sharing.
- `CLUSTER_ENABLED` and `DNS_UNKNOWN_ACTION` belong in the Joyride/CoreDNS container environment.
- `JOYRIDE_DOCKER_TAG` is not consumed inside the Joyride repo today; use it in the consuming compose/deploy layer as the image tag, e.g. `ghcr.io/traefikturkey/joyride:${JOYRIDE_DOCKER_TAG:-coredns}`.
- Joyride has no Cloudflare, Caddy, or DNS-01 config. It provides local/split DNS only.
- Caddy DNS-01 belongs in the Infisical Ansible role under `menos/infra/ansible/roles/infisical/`.
- Confirmed Infisical hostname: `infisical.ilude.com`.
- Confirmed Joyride host: menos host (`192.168.16.241`).
- Confirmed Caddy Cloudflare plugin image does not exist yet; build it as part of the Infisical Ansible role/compose project.
- Confirmed `DNS_UNKNOWN_ACTION=drop` should remain because the upstream DNS server handles real client request sorting/parallel upstream behavior.

Current requested Joyride env:

```bash
JOYRIDE_DOCKER_TAG=coredns
CLUSTER_ENABLED=true
DNS_UNKNOWN_ACTION=drop
```

## Constraints

- Do not commit Cloudflare API tokens, rendered env files, or validation evidence containing secret values. Use Ansible vault or operator-local env only.
- Cloudflare token scope: limit to the `ilude.com` zone with `Zone:Read` and `DNS:Edit`. Document whether Caddy discovers the zone via Zone Read or whether an explicit zone ID is configured.
- Cloudflare token handling must be Caddy-only: render a dedicated Caddy env/secret file with mode `0600`, mount/load it only in the Caddy service, never place it in shared `infisical.env`, and set `no_log: true` plus `diff: false` on all Ansible tasks that touch token-bearing files or variables.
- Do not run `--diff` on secret-bearing tasks unless those tasks are proven to use `no_log: true`/`diff: false`; validation must prove token values are absent from logs and generated artifacts.
- Keep Joyride and Infisical responsibilities separate:
  - Joyride: local/split DNS resolution.
  - Cloudflare: public authoritative DNS and ACME DNS-01 TXT validation.
  - Caddy: TLS termination and certificate renewal.
- Keep the existing Infisical Ansible-in-Docker deployment pattern.
- Preserve the Infisical plan's secure output/logging policy.
- Use `infisical.ilude.com` as the concrete domain in generated defaults/runbooks, while allowing `infisical_domain` override.
- Build a local Caddy image with `xcaddy` and `github.com/caddy-dns/cloudflare` in the Infisical compose project. Pin builder image, runtime image, Caddy version, `xcaddy` version, and Cloudflare DNS module version/commit; validate the built image includes the module.
- Exposure decision: Infisical is intended for LAN/VPN access via `infisical.ilude.com` unless explicitly changed. Bind 443 for clients, treat port 80 as optional with a preflight conflict check, and document firewall rules/bind scope before live deploy.
- First certificate issuance should support an optional Let's Encrypt staging mode to avoid production rate limits during iteration.

## Task Breakdown

| # | Task | Files | Type | Depends On |
|---|------|-------|------|------------|
| T1 | Joyride deployment/runbook for Infisical DNS | `.specs/infisical-dns-certs/joyride-runbook.md` | docs | -- |
| T2 | Infisical Caddy Cloudflare DNS-01 role changes | `menos/infra/ansible/roles/infisical/*` | feature | -- |
| T3 | Infisical Wave 2 runbook updates | `.specs/infisical-secrets/runbook-bootstrap.md`, `.specs/infisical-secrets/plan.md` | docs | T1,T2 |
| V1 | Local syntax/lint validation | -- | validation | T1,T2,T3 |
| V2 | Live DNS/TLS validation | evidence files | validation/manual | V1 |

## Execution Waves

### Wave 1: Local implementation

#### T1: Joyride deployment/runbook for Infisical DNS

Create `.specs/infisical-dns-certs/joyride-runbook.md` documenting:

1. Joyride env values:
   ```bash
   JOYRIDE_DOCKER_TAG=coredns
   CLUSTER_ENABLED=true
   DNS_UNKNOWN_ACTION=drop
   ```
2. How to run Joyride on the menos host in cluster/host mode using `docker-compose.host.yml` or an equivalent consuming compose.
3. How to provide `NODE_NAME`, `HOSTIP=192.168.16.241` override if auto-detection is wrong, and optional `CLUSTER_SEEDS` if broadcast discovery fails.
4. How to register `infisical.ilude.com`:
   - primary/simple path: add a static host entry to Joyride `etc/joyride/hosts.d/hosts` pointing `infisical.ilude.com` at `192.168.16.241`;
   - optional label path: label the Caddy container with `coredns.host.name=infisical.ilude.com` only after proving Joyride is using `HOSTIP=192.168.16.241` and returns that address for label records.
5. How to test DNS:
   ```bash
   dig @192.168.16.241 -p 54 infisical.ilude.com A
   dig infisical.ilude.com A
   dig example.com A
   ```
   Expected: `infisical.ilude.com` resolves to `192.168.16.241`; unrelated public names still resolve with acceptable latency through the real client resolver path.

Acceptance criteria:

- Runbook states Joyride does not perform DNS-01 or certificate issuance.
- Runbook documents static-host primary path and Docker-label optional path.
- Runbook documents risk that `DNS_UNKNOWN_ACTION=drop` requires an upstream resolver that can tolerate/parallelize timeouts.
- Runbook includes validation for both known `infisical.ilude.com` and an unknown/non-local hostname through the real client resolver path, not only direct `dig @192.168.16.241 -p 54`.

#### T2: Infisical Caddy Cloudflare DNS-01 role changes

Update the Infisical Ansible role:

1. Add a Caddy image build to the Infisical compose project because no Caddy Cloudflare image currently exists. Build from a role-rendered `Dockerfile.caddy` with pinned builder image, runtime image, Caddy version, `xcaddy` version, and `github.com/caddy-dns/cloudflare` module version/commit. The build must copy the resulting binary into the pinned runtime image and include a validation command proving the Cloudflare DNS module is present.
2. Add defaults:
   - `infisical_domain: infisical.ilude.com`
   - `infisical_caddy_acme_dns_provider: cloudflare`
   - `infisical_caddy_dns01_enabled: true`
   - `infisical_caddy_dns_resolvers` if needed
   - `infisical_caddy_build_enabled: true`
   - `infisical_caddy_letsencrypt_staging: true` for first deploy/test, switch to false after validation
   - `infisical_caddy_bind_http: false` by default unless HTTP redirect/public HTTP reachability is explicitly desired
3. Add required vault variable:
   - `vault_infisical_cloudflare_api_token`
4. Render the token only into a dedicated Caddy env/secret file with mode `0600`; mount/load it only in the Caddy service. Do not put `CLOUDFLARE_API_TOKEN` in `infisical.env` or any env file consumed by the Infisical app. All token render/copy tasks must use `no_log: true` and `diff: false`.
5. Update `Caddyfile.j2` conditionally: render the DNS-01 block only when `infisical_caddy_dns01_enabled` is true; fail fast in Ansible if DNS-01 is enabled and `vault_infisical_cloudflare_api_token` is missing. Use staging ACME endpoint when `infisical_caddy_letsencrypt_staging` is true. Example production block:
   ```caddyfile
   {{ infisical_domain }} {
     encode zstd gzip
     tls {
       dns cloudflare {env.CLOUDFLARE_API_TOKEN}
     }
     reverse_proxy infisical:8080
   }
   ```
6. Add Joyride DNS label to the Caddy service only as an optional convenience, not the primary DNS path:
   ```yaml
   labels:
     - "coredns.host.name={{ infisical_domain }}"
   ```
   Validation must confirm the label resolves to `192.168.16.241`; otherwise use the static hosts entry.
7. Add port/firewall preflight: verify 443 is available and intentionally exposed on the LAN/VPN path; verify whether 80 is needed, available, and allowed. DNS-01 does not require inbound port 80.

Acceptance criteria:

- `ansible-lint roles/infisical/ playbooks/deploy-infisical.yml` passes in the Ansible Docker image.
- Syntax check passes with `ANSIBLE_ROLES_PATH=/ansible/roles`.
- Templates contain no hardcoded Cloudflare token value and no token-bearing task can emit diffs/logs.
- README documents Cloudflare token scope/storage: Zone:Read + DNS:Edit for `ilude.com`, Caddy-only env/secret file, `0600`, no Infisical app access, and `docker inspect` exposure risk if env vars are used.
- Compose template builds or references a Caddy binary containing the Cloudflare DNS module; it must not silently use stock `caddy:2.8-alpine` when DNS-01 is enabled.
- Caddy builder/runtime/plugin versions are pinned, and validation proves the Cloudflare module is present.
- Port/firewall preflight and Let's Encrypt staging toggle are documented.

#### T3: Infisical Wave 2 runbook updates

Update `.specs/infisical-secrets/runbook-bootstrap.md` and `.specs/infisical-secrets/plan.md` to include:

1. DNS prerequisites using Joyride.
2. Cloudflare DNS-01 prerequisites.
3. Caddy Cloudflare token vault variable and dedicated Caddy-only token handling.
4. Validation commands:
   ```bash
   dig @192.168.16.241 -p 54 infisical.ilude.com A
   dig @1.1.1.1 _acme-challenge.infisical.ilude.com TXT
   curl --resolve infisical.ilude.com:443:192.168.16.241 -fsS https://infisical.ilude.com/api/status
   openssl s_client -connect infisical.ilude.com:443 -servername infisical.ilude.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -ext subjectAltName
   docker logs infisical-caddy --tail=200
   ```
5. Explicit Ansible vault password handling (`--ask-vault-pass`, vault password file mount, or equivalent local operator flow) without logging secrets.
6. Rollback steps for failed DNS-01/Caddy deploy: switch back to staging, disable DNS-01, use static Joyride record fallback, stop Caddy, and remove failed challenge records if needed.

Acceptance criteria:

- Infisical plan no longer has an unspecified `infisical.ilude.com` DNS/TLS gap.
- Runbook says DNS-01 TXT records are managed by Caddy/Cloudflare, not Joyride.
- Runbook includes token redaction, vault password handling, staging, cert inspection, and rollback instructions.

### Wave 1 -- Validation Gate

Run:

```bash
docker compose -f menos/infra/ansible/docker-compose.yml build ansible
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible ansible-ansible:latest ansible-lint roles/infisical/ playbooks/deploy-infisical.yml
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/menos/infra/ansible:/ansible" -w /ansible -e ANSIBLE_ROLES_PATH=/ansible/roles ansible-ansible:latest ansible-playbook --syntax-check playbooks/deploy-infisical.yml
# Static inspection: confirm token tasks use no_log/diff false, Caddy build versions are pinned, and stock caddy image is not used when DNS-01 is enabled.
```

### Wave 2: Live validation/manual gate

Manual/operator prerequisites:

1. Use final domain name `infisical.ilude.com`.
2. Create a Cloudflare API token limited to the `ilude.com` zone with Zone:Read and DNS:Edit.
3. Add token to Ansible vault as `vault_infisical_cloudflare_api_token`; prepare the documented vault password mechanism (`--ask-vault-pass`, vault password file mount, or equivalent).
4. Confirm Joyride is running on the menos host with:
   ```bash
   JOYRIDE_DOCKER_TAG=coredns
   CLUSTER_ENABLED=true
   DNS_UNKNOWN_ACTION=drop
   ```

Live validation:

1. Deploy Joyride or confirm existing Joyride cluster is healthy.
2. Confirm local DNS and client resolver behavior:
   ```bash
   dig @192.168.16.241 -p 54 infisical.ilude.com A
   dig infisical.ilude.com A
   dig example.com A
   ```
   Expected: `infisical.ilude.com` resolves to `192.168.16.241`; unrelated public names still resolve with acceptable latency through the real client resolver path.
3. Deploy Infisical:
   ```bash
   cd menos/infra/ansible
   docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml --check --diff
   docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml
   ```
   The `--diff` dry-run is allowed only after secret-bearing tasks are confirmed `no_log: true`/`diff: false`. Include the documented vault password option when vault vars are encrypted.
4. Confirm Caddy obtained a certificate via DNS-01 and Cloudflare authoritative DNS saw the challenge:
   ```bash
   dig @1.1.1.1 _acme-challenge.infisical.ilude.com TXT
   docker logs infisical-caddy --tail=200
   curl --resolve infisical.ilude.com:443:192.168.16.241 -fsS https://infisical.ilude.com/api/status
   openssl s_client -connect infisical.ilude.com:443 -servername infisical.ilude.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -ext subjectAltName
   ```
5. After staging succeeds, switch `infisical_caddy_letsencrypt_staging` to false and repeat the certificate/API validation for production Let's Encrypt.
6. Continue `.specs/infisical-secrets/plan.md` Wave 2 root signup and backup validation.

## Success Criteria

1. Joyride resolves `infisical.ilude.com` to the menos host IP on the local network.
2. Caddy obtains a valid Let's Encrypt certificate using Cloudflare DNS-01.
3. `curl --resolve infisical.ilude.com:443:192.168.16.241 -fsS https://infisical.ilude.com/api/status` succeeds without `--insecure`.
4. No Cloudflare token or secret value is committed, rendered into shared Infisical env, exposed by Ansible diffs, or printed in logs/runbooks/evidence.
5. The built Caddy image is reproducible and contains the Cloudflare DNS module.
6. Real client resolver behavior works for both `infisical.ilude.com` and unrelated public names while `DNS_UNKNOWN_ACTION=drop` remains enabled.
7. Certificate validation proves a trusted Let's Encrypt issuer and SAN match for `infisical.ilude.com`.
8. The Infisical plan Wave 2 can resume with DNS/TLS no longer ambiguous.

## Decisions

1. Final Infisical hostname/domain: `infisical.ilude.com`.
2. No Caddy-with-Cloudflare image exists yet; add a pinned `xcaddy` build to the Infisical Ansible role/compose project.
3. Joyride will run on the menos host.
4. `DNS_UNKNOWN_ACTION=drop` remains; the upstream DNS server handles sorting out real client requests, and the runbook must validate that path.
5. Static Joyride host entry is the primary path for initial deployment; Docker label registration is optional after validation.
6. Cloudflare token is Caddy-only and must not be rendered into shared Infisical env.
## Execution Status

- **Completion classification**: `implemented-awaiting-manual-validation`
- **Date**: 2026-05-03
- **Last completed wave/gate**: Wave 1 local implementation and V1 local validation passed.
- **Next wave/gate to run**: Wave 2 live DNS/TLS validation and then resume `.specs/infisical-secrets/plan.md` Wave 2.
- **Implemented**:
  - Created `.specs/infisical-dns-certs/joyride-runbook.md` with Joyride env, static-host primary DNS registration, optional Docker-label path, resolver validation, and DNS-01 boundary notes.
  - Updated Infisical Ansible role defaults for `infisical.ilude.com`, Caddy DNS-01, pinned local Caddy/xcaddy/Cloudflare module build, staging default, and optional HTTP binding.
  - Added `Dockerfile.caddy.j2` and `caddy-env.j2` templates.
  - Updated `docker-compose.yml.j2` to build/use the Caddy Cloudflare image, load Caddy-only env, add optional Joyride label, and avoid binding port 80 by default.
  - Updated `Caddyfile.j2` to render DNS-01 conditionally and support Let's Encrypt staging.
  - Updated `tasks/main.yml` to assert token presence, render Caddy env with `no_log: true`/`diff: false`, render Caddy Dockerfile, run port preflights, build/validate Caddy module, and start compose.
  - Updated role README with Cloudflare token scope/storage, Caddy build, staging, network exposure, and Joyride DNS notes.
  - Updated `.specs/infisical-secrets/runbook-bootstrap.md` and `.specs/infisical-secrets/plan.md` with concrete `infisical.ilude.com` DNS/TLS validation and remaining V2 steps.
- **Commands run and results**:
  - `ansible-lint roles/infisical/ playbooks/deploy-infisical.yml` in Ansible Docker image -> passed.
  - `ANSIBLE_ROLES_PATH=/ansible/roles ansible-playbook --syntax-check playbooks/deploy-infisical.yml` in Ansible Docker image -> passed with expected no-inventory warnings.
  - Static inspection for `no_log: true`, `diff: false`, no Cloudflare token in `infisical-env.j2`, no stock `caddy:2.8-alpine` in compose, pinned Caddy/xcaddy/module defaults, and `dns.providers.cloudflare` validation -> passed.
- **Why not archived**: Wave 2 requires live operator actions: Joyride running on menos, Cloudflare API token in Ansible vault, DNS-01 certificate issuance, HTTPS validation, and production Let's Encrypt validation. These require external services/secrets and were not run in this session.
- **Checks still needed**:
  1. On menos/Joyride, add or confirm static host entry:
     ```text
     192.168.16.241 infisical.ilude.com
     ```
  2. Validate DNS from a real client path:
     ```bash
     dig @192.168.16.241 -p 54 infisical.ilude.com A
     dig infisical.ilude.com A
     dig example.com A
     ```
  3. Create Cloudflare token scoped to `ilude.com` with `Zone:Read` and `DNS:Edit`; store only as `vault_infisical_cloudflare_api_token` in Ansible vault.
  4. Dry-run and deploy with the documented vault password mechanism:
     ```bash
     cd menos/infra/ansible
     docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml --check --diff --ask-vault-pass
     docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy-infisical.yml --ask-vault-pass
     ```
  5. Validate staging DNS-01/HTTPS/certificate:
     ```bash
     dig @1.1.1.1 _acme-challenge.infisical.ilude.com TXT
     docker logs infisical-caddy --tail=200
     curl --resolve infisical.ilude.com:443:192.168.16.241 -fsS https://infisical.ilude.com/api/status
     openssl s_client -connect infisical.ilude.com:443 -servername infisical.ilude.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -ext subjectAltName
     ```
  6. Set `infisical_caddy_letsencrypt_staging: false`, redeploy, and repeat HTTPS/certificate validation for production Let's Encrypt.
  7. Resume `/do-it .specs/infisical-secrets/plan.md` to complete root signup, backup/restore, and V2 evidence.
- **Remaining manual/user steps**: Cloudflare token creation/vault storage, Joyride live DNS confirmation, live deploy, staging then production certificate validation, and Infisical root signup are still required.
- **Resume instruction**: Rerun `/do-it .specs/infisical-dns-certs/plan.md` only if you want this active plan to record the live validation results; otherwise proceed to `/do-it .specs/infisical-secrets/plan.md` after DNS/TLS validation passes.
