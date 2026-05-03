---
date: 2026-05-03
status: synthesis-complete
---

# Review: Joyride DNS and Caddy DNS-01 certs for Infisical

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | Assume implementers lack conversation context and will follow ambiguous text literally |
| security-reviewer | security-reviewer | Adversarial secret/DNS exposure reviewer | Mandatory standard reviewer | Assume tokens leak through env files, diffs, logs, or public bindings |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer | Challenge custom image/DNS complexity and require simpler paths where adequate |
| devops-pro | devops-pro | Docker/Ansible/Caddy rollout safety reviewer | Plan changes Compose, Ansible, Caddy, and live deployment | Assume remote builds, diffs, ports, and idempotency fail under real deploy conditions |
| qa-engineer | qa-engineer | DNS/TLS validation realism reviewer | Success depends on DNS, ACME DNS-01, and cert validation | Assume checks pass locally while clients, ACME, or renewals fail |
| backend-dev | backend-dev | CoreDNS/Joyride integration contract reviewer | Plan integrates Joyride label DNS with Caddy service registration | Assume Joyride cannot see the intended daemon or resolver path is not actually using Joyride |

## Standard Reviewer Findings
### reviewer
- Cloudflare token handling is ambiguous and may place the token in shared `infisical.env`.
- Joyride label registration needs explicit proof it resolves to `192.168.16.241`.
- Caddy/xcaddy/plugin versions are not pinned enough for reproducible builds.
- Port 80/443 exposure and port-conflict behavior are underspecified.
- Resolver validation does not prove unknown names remain usable with `drop`.

### security-reviewer
- Token may leak via rendered env files, container inspection, Ansible diffs, or logs.
- Public 80/443 binding is not explicitly justified for an internal Infisical service.
- DNS-01 validation needs Cloudflare authoritative TXT checks, not just local Joyride A records.
- `DNS_UNKNOWN_ACTION=drop` needs real client resolver validation.
- Caddy plugin build needs version pinning and update procedure.

### product-manager
- Static host entry may be simpler and safer than relying on Docker labels if Caddy is host-published.
- Dedicated Caddy-only token env file is required; shared Infisical env is unnecessary risk.
- Secure logging policy needs concrete acceptance criteria.
- Build pinning and deterministic TLS validation need to be explicit.

## Additional Expert Findings
### devops-pro
- `--check --diff` is dangerous unless secret-bearing tasks use `no_log`/`diff: false`.
- Remote Caddy build needs pinned builder/runtime/plugin versions.
- Plan needs firewall/bind-scope and port conflict preflight.
- Live deploy instructions need vault password handling.

### qa-engineer
- Validation should test actual client resolver path and unknown-name behavior.
- Cert validation should inspect issuer/SAN/chain, not only `curl` success.
- Add Let's Encrypt staging guidance to avoid rate limits during first deployment.
- Validate built Caddy image contains the Cloudflare DNS module.

### backend-dev
- Token permissions should include Cloudflare Zone Read plus DNS Edit for `ilude.com` or document zone lookup requirements.
- Caddyfile should conditionally render DNS-01 and fail fast if enabled without token.
- Joyride labels should be validated against `HOSTIP` behavior or static host fallback should become primary.
- Live commands need explicit Ansible vault password mechanism.

## Suggested Additional Reviewers
- devops-pro -- relevant for Ansible, Docker Compose, Caddy image build, rollout, ports, and remote-host deployment.
- qa-engineer -- relevant for DNS/TLS/ACME validation realism and avoiding false-positive acceptance checks.
- backend-dev -- relevant for CoreDNS/Joyride service-discovery contracts, labels, host IP behavior, and resolver assumptions.

## Bugs (must fix before execution)
1. **Cloudflare token handling can leak secrets.** The plan allows rendering `vault_infisical_cloudflare_api_token` into `infisical.env` or a Caddy env file and still runs `ansible-playbook --check --diff`. Require a dedicated Caddy-only env/secret file, mode `0600`, mounted/loaded only by Caddy; add `no_log: true` and `diff: false` for all token/env tasks; forbid secret-bearing diffs; document `docker inspect` env exposure if env vars are used.
2. **Caddy Cloudflare build is not executable/reproducible enough.** The plan says to build with `xcaddy` but does not specify rendered file paths, builder image, Caddy version, xcaddy version, Cloudflare module version/commit, or validation that the module exists. Require pinned builder/runtime/plugin versions and a concrete `Dockerfile.caddy`/compose `build:` contract with a module-presence check.
3. **Live validation can pass without proving ACME DNS-01 and client DNS behavior.** The plan checks Joyride A records and `curl`, but not Cloudflare authoritative TXT creation, cert issuer/SAN/chain, default client resolver path, or unknown-name behavior with `DNS_UNKNOWN_ACTION=drop`. Add checks for `_acme-challenge.infisical.ilude.com` TXT propagation, `openssl s_client` or equivalent cert inspection, actual client resolver behavior, and unknown external DNS latency/success.
4. **Network exposure and port behavior are underspecified.** The plan keeps 80/443 bound by default even though DNS-01 does not require port 80 and Infisical may be intended LAN-only. Require an explicit exposure decision: bind scope, firewall rules, whether public reachability is intended, and preflight checks for 80/443 conflicts.

## Hardening
1. Make the static Joyride host entry the default path unless the runbook proves Docker label records return `HOSTIP=192.168.16.241`; Joyride code does use `hostIP`, but the plan should still validate the deployed value.
2. Add Cloudflare token permission details: Zone Read and DNS Edit limited to `ilude.com`; note whether zone ID is optional or required.
3. Add Let's Encrypt staging toggle/default for first deploy to avoid production rate limits.
4. Add explicit Ansible vault password handling for live commands (`--ask-vault-pass`, password file mount, or equivalent) without logging secrets.
5. Add rollback guidance: disable DNS-01, revert to stock Caddy/staging, static Joyride record fallback, and cleanup failed `_acme-challenge` records if needed.

## Simpler Alternatives / Scope Reductions
1. Prefer a static Joyride hosts entry for `infisical.ilude.com -> 192.168.16.241` as the initial path; Docker labels add moving parts without much value for one host-published service.
2. Keep Joyride changes as a runbook only; avoid modifying Joyride repo unless a consuming deployment file is clearly needed.
3. If Caddy image build complexity is undesirable, use a known maintained Caddy Cloudflare image only if you can pin digest and trust source; otherwise local `xcaddy` build is acceptable but must be pinned.

## Contested or Dismissed Findings
1. **Docker label resolves to container IP** -- downgraded from confirmed bug. Joyride `docker_watcher.go` adds label records using configured `dw.hostIP`, not container IP. Still keep a hardening/validation item because the deployed `HOSTIP` auto-detection may be wrong.
2. **Cloudflare zone ID is mandatory** -- not confirmed. Caddy's Cloudflare plugin can generally use token permissions to discover zones; the plan should specify Zone Read and document diagnostics rather than require zone ID unconditionally.
3. **`DNS_UNKNOWN_ACTION=drop` is inherently wrong** -- dismissed as a design decision because the user confirmed upstream DNS handles request sorting. Still requires validation against the real resolver path.

## Verification Notes
1. Token leak risk confirmed from plan lines 105-107 and 186: token is rendered to env and deploy uses `--check --diff` with no `no_log`/`diff: false` requirement.
2. Build ambiguity confirmed from plan line 99 and acceptance criteria lines 127-131: it names `xcaddy` but omits exact builder/runtime/plugin pinning and module verification.
3. DNS/TLS validation gap confirmed from plan lines 179-193: checks local `dig`, logs, and `curl`, but not Cloudflare TXT, cert chain/SAN, or unknown-name resolver behavior.
4. Joyride label behavior checked against `C:/Projects/Personal/joyride/plugins/docker-cluster/docker_watcher.go`: records are added with `dw.hostIP`, so container-IP concern is not confirmed, but deployed `HOSTIP` still needs validation.

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers completed; per-reviewer timing unavailable |
| Recovery calls | unknown | Compact recovery requested for all reviewers to preserve actionable raw findings |
| Verification | unknown | Used plan line inspection and Joyride `docker_watcher.go` inspection |
| Synthesis | unknown | Wrote `.specs/infisical-dns-certs/review-1/synthesis.md` |

## Review Artifact
Wrote full synthesis to: `.specs/infisical-dns-certs/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the must-fix plan updates before `/do-it .specs/infisical-dns-certs/plan.md`.
