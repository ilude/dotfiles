# Joyride DNS Runbook for Infisical

## Scope

Joyride provides local/split DNS for `infisical.ilude.com`. It does not perform Cloudflare DNS-01, create ACME TXT records, issue certificates, or terminate TLS. Caddy and Cloudflare handle DNS-01 certificate issuance.

## Target settings

Run Joyride on the menos host (`192.168.16.241`) with:

```bash
JOYRIDE_DOCKER_TAG=coredns
CLUSTER_ENABLED=true
DNS_UNKNOWN_ACTION=drop
```

`DNS_UNKNOWN_ACTION=drop` is intentional. The upstream DNS server must handle real client request sorting/parallel upstream behavior so unrelated names do not become user-visible timeouts.

## Start Joyride on menos

From the Joyride repo on the menos host:

```bash
cd /path/to/joyride
export JOYRIDE_DOCKER_TAG=coredns
export CLUSTER_ENABLED=true
export DNS_UNKNOWN_ACTION=drop
export NODE_NAME=menos
export HOSTIP=192.168.16.241

docker compose -f docker-compose.host.yml up -d
```

If broadcast cluster discovery does not work, add static seeds:

```bash
export CLUSTER_SEEDS=node1.example:7946,node2.example:7946
```

## Register Infisical DNS

### Primary path: static host entry

Add this line to Joyride's static hosts file:

```text
192.168.16.241 infisical.ilude.com
```

In the Joyride repo this file is:

```text
etc/joyride/hosts.d/hosts
```

Joyride watches static host changes; restart only if the record does not appear.

### Optional path: Docker label

The Infisical Caddy service may also carry:

```yaml
labels:
  - "coredns.host.name=infisical.ilude.com"
```

Use this only after confirming Joyride is using `HOSTIP=192.168.16.241` and label records return `192.168.16.241`.

## DNS validation

Run direct Joyride validation:

```bash
dig @192.168.16.241 -p 54 infisical.ilude.com A
```

Expected: A record `192.168.16.241`.

Run real client resolver validation from a client that should use the upstream DNS path:

```bash
dig infisical.ilude.com A
dig example.com A
```

Expected:

- `infisical.ilude.com` resolves to `192.168.16.241`.
- unrelated public names still resolve with acceptable latency while `DNS_UNKNOWN_ACTION=drop` remains enabled.

## DNS-01 boundary

Do not look for ACME TXT records in Joyride. Caddy creates `_acme-challenge.infisical.ilude.com` in Cloudflare through the Cloudflare API token. Validate DNS-01 with public authoritative resolvers, for example:

```bash
dig @1.1.1.1 _acme-challenge.infisical.ilude.com TXT
```

During Caddy issuance, a TXT record should appear. It may be removed after validation completes.

## Troubleshooting

- If direct Joyride lookup fails, check the static hosts file, `HOSTIP`, and Joyride container logs.
- If real client lookup fails but direct Joyride lookup works, check the upstream DNS server forwarding/parallel resolution configuration.
- If unrelated public names hang, confirm clients are not using Joyride as their sole general resolver or add an upstream-forwarding design before continuing.
- If DNS-01 fails, check Caddy logs and Cloudflare token scope; Joyride is not involved in TXT record creation.
