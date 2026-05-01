---
date: 2026-04-30
status: synthesis-complete
---

# Plan Review Synthesis: Self-hosted Infisical for shared secret storage

## Methodology Note

The harness available in this session does not expose a Task/Agent spawn tool for
parallel sub-agents (only TeamCreate, which spawns interactive teammate processes
unsuited to a single-shot review). Rather than fail or stall, the coordinator
applied all six reviewer personas itself in a single context, with strict
verification of every CRITICAL/HIGH claim against the actual repository
(menos/infra/ansible, pi/, scripts/, .pre-commit-config.yaml, etc.) using
Read/Grep/Bash. Findings the plan already addresses or that the codebase
disproves are explicitly marked Dismissed.

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| R1 Completeness & Explicitness | Plan-only-context staff engineer | 6 | 4 |
| R2 Adversarial / Red Team | Failure-mode hunter | 5 | 3 |
| R3 Outside-the-Box / Simplicity | Principal engineer | 4 | 2 |
| R4 Security & Access Control | Security engineer | 7 | 5 |
| R5 Operational Risk / SRE | SRE | 6 | 4 |
| R6 Database & Data Integrity | DB engineer | 5 | 4 |
| Total (deduplicated) | | 33 raw -> 18 unique | 11 bugs + 7 hardening |

## Outside-the-Box Assessment

The plan is well-scoped, names the right alternatives, and explicitly defers the
custom Serapis vault. Self-hosted Infisical is a defensible choice for the stated
constraints (machine identities, Python SDK, web UI, OSS, fits compose+Ansible
pattern). The biggest "is this the right approach" risks are NOT about the choice
of Infisical itself but about (a) the plan assumes a reverse proxy on the menos
host that does not exist in the repo today, and (b) the cache encryption design
("key derived from the client secret") is novel and under-specified for what is
fundamentally a credential-at-rest problem. Recommendation: Keep Infisical, but
fix the proxy assumption and replace the bespoke cache encryption with OS keyring
or age recipient key.

## Bugs (must fix before executing)

### B1. CRITICAL -- Plan assumes a reverse proxy on the menos host that does not exist

- Flagged by: R1 (Completeness), R5 (SRE), R4 (Security)
- Verification: Inspected `menos/infra/ansible/files/menos/docker-compose.yml`
  via grep. The file declares only `ports:` directives binding container ports
  directly to the host. There are NO Caddy/Traefik/nginx services, NO compose
  labels indicating service-discovery for a proxy, and the inventory
  (`menos/infra/ansible/inventory/hosts.yml`) does not reference one.
  Confirmed: the menos host today exposes services on raw HTTP ports such as
  `:8000`. The plan's Constraint section says "TLS termination: reuse the
  existing reverse proxy on the menos host (whatever menos uses today -- detect
  during T1)." There is no reverse proxy to reuse.
- Why this is a bug: T1's "research" step will return "no proxy exists." T3
  ("update the reverse proxy from T1's notes to route infisical.<host-domain>")
  then has nothing to update. The acceptance criterion "curl /api/status returns
  200 with valid TLS chain" cannot be satisfied. The whole TLS-termination
  branch is unspecified.
- Fix: Replace T1 with "Decide reverse-proxy strategy" (Caddy is the simplest
  off-the-shelf fit for compose+Let's-Encrypt; Traefik is the second option).
  Replace T3 with "Stand up Caddy in the menos compose stack, add a Caddyfile
  that fronts both menos-api and infisical with automatic Let's Encrypt certs,
  and migrate menos-api off raw port 8000 to be behind Caddy as well." Note
  this enlarges scope -- explicitly call that out, or scope down T3 to "Caddy
  fronts Infisical only on a sub-domain, menos-api stays on its current port
  for now."

### B2. CRITICAL -- Cache encryption "key derived from the client secret" is dangerous and unspecified

- Flagged by: R4 (Security), R6 (Data Integrity)
- Source: T6 acceptance text in plan: "Cache to ~/.cache/dotfiles/infisical-cache.age
  (age-encrypted with key derived from client secret)."
- Why this is a bug: (a) The client secret is rotated -- the moment it rotates,
  the cache becomes undecryptable, defeating the "offline resilience" purpose.
  (b) "Derived" is unspecified -- no KDF, no salt, no iteration count. (c) age
  uses asymmetric (X25519) or scrypt-passphrase modes; you cannot just feed it
  a 32-byte secret as a "key" without specifying which mode. (d) Storing the
  encrypted cache next to the only thing that can decrypt it (the client_secret
  file at `~/.config/dotfiles/infisical.env`) provides almost no defense in
  depth -- an attacker with FS read gets both.
- Fix: Two acceptable designs:
  1. Generate a separate age recipient key on first run, store in OS keyring
     (Windows Credential Manager / macOS Keychain / libsecret on Linux), use
     that to encrypt the cache. Keyring access requires user session.
  2. Scrap the encrypted cache. Use plain JSON with `chmod 600` (or NTFS ACL
     equivalent) inside the user's home directory. The threat model is
     already "attacker has user-level FS read" = game over either way; the
     encryption is theatre.
  Pick (2) for KISS unless threat model genuinely includes backups/cloud-sync
  exfiltration of `~/.cache`.

### B3. HIGH -- Backup misses Infisical encryption keys; restore drill cannot succeed as written

- Flagged by: R6 (Data Integrity), R5 (SRE)
- Source: T4 says "dump the Infisical Postgres database... encrypts (age or
  gpg)... copies to existing backup target." V2 says "restore drill into
  throwaway Postgres on dev box, log in to restored Infisical with root,
  confirm a T5 secret is present."
- Why this is a bug: Infisical encrypts secret values in Postgres using the
  `ENCRYPTION_KEY` (and signs JWTs with `AUTH_SECRET` / `JWT_AUTH_SECRET`)
  defined in its `.env`. If the backup is only the Postgres dump, restoring
  without the original `ENCRYPTION_KEY` yields a database where every secret
  value is a ciphertext nobody can decrypt. The V2 drill step "confirm a T5
  secret is present" will fail unless those keys are also restored.
- Fix: T4 must back up BOTH the Postgres dump AND the Infisical `.env` (or at
  minimum `ENCRYPTION_KEY`, `AUTH_SECRET`, `ENCRYPTION_KEY_FALLBACK` if used).
  These can be in the same encrypted bundle. The restore runbook in T8 must
  document that without these keys the database is useless. The bootstrap
  secrets (per Handoff Notes) must live in the password manager AND be
  reproducible from the encrypted backup -- losing the password manager
  shouldn't lose the cluster.

### B4. HIGH -- pg_dump vs volume snapshot is unspecified; consistency implications differ

- Flagged by: R6 (Data Integrity)
- Source: T4 "dumps Infisical Postgres" is ambiguous.
- Why this is a bug: A `docker exec ... pg_dump` is application-consistent and
  the right answer. A `tar` of `/var/lib/postgresql/data` while the container
  is running is corrupt. The plan does not specify which.
- Fix: T4 acceptance must say "uses `docker exec infisical-postgres pg_dumpall
  -U <user>`" (or `pg_dump <db>`) and verify by restoring into a sibling
  container. Reject volume-tar approaches.

### B5. HIGH -- "Reuse menos Postgres if it exists" instruction is wrong; menos does not run Postgres

- Flagged by: R1 (Completeness), R6 (Data Integrity)
- Verification: `menos/infra/ansible/files/menos/docker-compose.yml` declares
  SurrealDB and Garage (S3-compatible). No Postgres service. The Constraints
  section already calls out "do NOT share a DB instance with menos's SurrealDB
  (different engine)" -- correct -- but the Handoff Notes contradict this:
  "If menos already runs Postgres, T2 should reuse instance (separate
  database/role) rather than spinning a second container."
- Why this is a bug: The two pieces of guidance disagree, and the second is
  factually wrong about the host's state. Implementer following Handoff Notes
  may waste time looking for Postgres or build a "reuse" path that will never
  be exercised.
- Fix: Delete the "If menos already runs Postgres" line from Handoff Notes.
  T2 simply stands up a dedicated `infisical-postgres` container. State this
  unconditionally.

### B6. HIGH -- pi/secrets/ does not exist; T6 references it as if pre-existing; helper test path needs creation

- Flagged by: R1 (Completeness)
- Verification: `ls /c/Users/mglenn/.dotfiles/pi/secrets/` returns nothing
  (directory does not exist). The Project Context section says "Test command:
  `uv run pytest pi/secrets/`" as if the path were established.
- Why this is a bug: Minor but real -- T6 must create the directory, the
  package `__init__.py`, and decide whether `pi/secrets/` is a Python package
  inside the existing `pi/` workspace (with its own `pyproject.toml`?), a
  module inside an existing package, or a standalone tool. The plan does not
  specify and `pi/` has its own justfile/auth.json/etc. that suggest it is
  already structured.
- Fix: T6 acceptance must include "directory created with `__init__.py`,
  registered in pi's existing pyproject.toml dependency list (or its own
  pyproject if standalone), `uv run pytest pi/secrets/` command works from
  repo root."

### B7. HIGH -- No .pre-commit-config.yaml exists; T7 must create not extend

- Flagged by: R1 (Completeness)
- Verification: `ls .pre-commit-config.yaml` -> not found. The plan says
  "gitleaks (or detect-secrets if existing)" implying detection of existing
  config; there is none.
- Fix: T7 must explicitly say "Create `.pre-commit-config.yaml` with gitleaks
  hook," document `pre-commit install` in repo README/AGENTS.md, and ensure
  CI runs `pre-commit run --all-files` (or accept that this is local-only).

### B8. HIGH -- Bootstrap is interactive and the plan never says how V2 deploy completes unattended

- Flagged by: R2 (Adversarial), R5 (SRE)
- Source: T3 acceptance: "root admin created interactively, credentials in
  password manager." The Ansible deploy is otherwise unattended.
- Why this is a bug: Infisical's first-run UI is a one-shot signup form. If
  the operator doesn't complete it within the same window as deploy, the
  next deploy run may fail health checks. There's no documented sequence
  of: (1) deploy compose, (2) wait for /api/status, (3) operator visits
  signup URL, (4) creates account, (5) operator manually runs T5 bootstrap
  script using new admin token. The plan implies all this but never
  enumerates it.
- Fix: T3 must include an explicit ordered runbook: deploy -> verify -> sign
  up -> capture creds -> run T5 -> capture machine-identity client_ids/
  secrets -> store in password manager. T5 cannot run before T3's interactive
  signup is complete -- mark this dependency clearly (T5 blockedBy: signup
  step, not just V2).

### B9. HIGH -- Machine identity client_secret retrieval is unaddressed

- Flagged by: R4 (Security), R2 (Adversarial)
- Source: T5 acceptance: "Outputs client IDs (NOT secrets) to stdout. Script
  never prints client_secret/secretValue."
- Why this is a bug: The deployed FastAPI service (Constraint: "Docker secret
  or runtime-injected env var") needs the client_secret. The pi-developer
  identity needs a client_secret on the dev machine. If T5 never prints them
  and never stores them anywhere, how does the operator obtain them? The
  Infisical UI does show client_secrets at creation time only -- if T5 ran
  in a CLI that didn't surface them, you must rotate immediately to recover.
- Fix: T5 must write client_secrets to a path designated by an operator-
  supplied flag (e.g. `--secrets-out=/run/user/1000/infisical-bootstrap.env`,
  tmpfs only), with explicit instructions "copy these immediately into the
  password manager and into the Docker secret on the menos host, then
  shred this file." Alternatively, T5 prints client_secrets ONCE, with a
  big warning, requiring `--show-secrets` flag. Don't pretend the problem
  doesn't exist.

### B10. HIGH -- Infisical going down silently bricks every cold-start of x-research

- Flagged by: R5 (SRE)
- Source: Success Criterion 5 says "Cache makes helper resilient to brief
  Infisical outages" but T6 says "Cache opt-in for prod, default off for
  service deploys."
- Why this is a bug: For the deployed FastAPI service, cache-default-off means
  every cold start hard-depends on Infisical. If Infisical is rebooting,
  upgrading, or its Postgres is in recovery, x-research won't start. The
  plan's stated goal of resilience is contradicted by its own configuration.
- Fix: Either (a) flip the default: cache opt-in everywhere, default 5-min
  TTL, last-known-good fallback for service deploys with metric/alert when
  serving from stale cache; or (b) make the contradiction explicit in the
  plan -- "service deploys depend on Infisical; we accept this; pi developer
  cache is for offline dev only."

### B11. HIGH -- gitleaks "over git log --all" cannot be made clean retroactively without history rewrite

- Flagged by: R2 (Adversarial), R4 (Security)
- Source: Success Criterion 2: "No credential of any kind exists in the repo
  (gitleaks over git log --all clean)."
- Verification: The repo root contains a `.env` file (per ls output) and the
  Constraints section says secrets must "Never present in the repo, in `.env`
  files committed by accident." Need to confirm whether `.env` is gitignored
  but the existing git history may contain prior credentials. Cannot verify
  full history without `git log -p` scan.
- Why this is a bug: If gitleaks finds anything in history, the only fixes
  are git filter-repo (rewrites SHAs, breaks all clones) or accepting the
  finding. The success criterion is unachievable as a hard gate.
- Fix: Soften the criterion to "gitleaks on current HEAD clean; existing
  history audited separately and any findings rotated and documented in
  T9 migration report. History rewrite out of scope unless an active
  credential is found." Run gitleaks in audit mode FIRST (T0 / before T1)
  to know what's actually there.

## Hardening Suggestions (optional improvements)

### H1. MEDIUM -- Bootstrap encryption keys rotation strategy missing

R4. The `ENCRYPTION_KEY` / `AUTH_SECRET` are bootstrap secrets in the password
manager. Plan never addresses rotating them. Add a runbook section in T8 even
if the answer is "documented as a once-a-year manual procedure."

### H2. MEDIUM -- Container hardening claims in V2 are vague

R5. V2 says "confirm Infisical container is non-root with read-only root FS
where possible." Infisical's official image may not support read-only root
out of the box. State the expected outcome: which user UID, which mounts are
writable. Otherwise "where possible" becomes "skipped silently."

### H3. MEDIUM -- No Postgres volume monitoring; full disk silently kills writes

R5, R6. Add a simple `df` check / alert (or document it as a known limitation)
for the Infisical postgres data volume. Disk-full is the most common Postgres
outage mode.

### H4. MEDIUM -- Service token TTL "default short (1h) and refresh" needs concrete number for service deploys

R5. A 1h TTL with refresh is fine for a long-running service, but the helper
must implement refresh ahead of expiry (e.g. refresh at 75 percent of TTL)
and handle clock skew. Specify in T6 acceptance.

### H5. MEDIUM -- SMTP for password reset is itself an attack surface and is unspecified

R4. Plan says "recover root admin via password reset email or DB dance if no
SMTP." Decide: SMTP yes/no. If no, document the DB dance in T8 step-by-step.
If yes, document SMTP creds also live in password manager + the relay used
+ TLS settings.

### H6. LOW -- ASCII-only constraint not enforced

R1. CLAUDE.md mandates ASCII punctuation but plan does not require a CI check.
Optional: add `pre-commit-hooks/check-merge-conflict` plus a small custom
script. KISS, probably not worth a check.

### H7. LOW -- Nightly is not "nightly enough" for high-rotation secrets

R6. Nightly backups + a same-day rotation == up to 24h of secret-state delta
lost on disaster restore. Acceptable for personal-scale, document the
acceptance.

## Dismissed Findings

- **D1.** R3 floated "use 1Password Secrets Automation managed instead." The
  Alternatives Considered section already rejects this on the self-hosted
  constraint. Dismissed -- Constraint Violation.
- **D2.** R4 asserted "service tokens leak via process list / env-var
  inspection." Plan already specifies Docker secrets / runtime-injected env
  vars in production and `chmod 600` (NTFS-equivalent) file on dev.
  Dismissed -- already addressed.
- **D3.** R2 floated "Infisical may not have a Python SDK." Verified false;
  `infisical-python` exists on PyPI. Dismissed -- false claim.
- **D4.** R3 questioned "why both pi-developer and x-research-service
  identities, just use one." Plan correctly scopes pi-developer to broader
  read access for debugging vs x-research-service narrow read on `/x-research/**`.
  Least-privilege is exactly the right call. Dismissed -- valid as designed.
- **D5.** R1 flagged "Windows NTFS chmod 600 has no effect." Partial truth
  but Git Bash on Windows DOES translate chmod to NTFS ACLs via the
  msys2/mingw layer. Effect is non-zero though imperfect. Downgraded to a
  one-line note in T6 docs rather than a bug.
- **D6.** R6 worried about Postgres major-version compatibility on restore.
  Mitigated by pinning the Postgres major in T2's compose template (must
  ensure that pin is present -- promote to H if missing). Dismissed assuming
  T2 implementer pins versions.
- **D7.** R2 flagged "Webshare credentials still in `.env` during transition."
  T9 explicitly handles this. Dismissed -- in scope already.

## Positive Notes

- Alternatives table is thorough and the Serapis-deferral rationale is
  explicit. Good discipline.
- Wave structure with parallelizable T1/T2, T3/T4, T5/T6 is correct given
  declared dependencies.
- Least-privilege scoping (`x-research-service` cannot read `/shared/*`) is
  validated in V3 with an actual deny-test, not just an assumption.
- Out-of-scope list (SSO, KMS, multi-org) is appropriately ruthless for a
  personal-scale deployment.
- Bootstrap-secrets-in-password-manager is the right pattern -- the plan
  correctly avoids the "Infisical secret stored in Infisical" trap.
- Cache TTL of 5 min is sane for the use case.
- Pre-commit secret scanner is bundled into the deliverable rather than left
  as future work.

## Verification Trail

Direct repo checks executed:
- `ls /c/Users/mglenn/.dotfiles/menos/infra/ansible/` -> flat playbooks, no
  `roles/` directory exists. Plan creates roles/infisical/ -> ok, but new
  pattern in this repo (callout, not blocker).
- `grep -i caddy|traefik|nginx` over `menos/infra/ansible/files/menos/
  docker-compose.yml` -> no matches. Confirms B1.
- `ls .pre-commit-config.yaml` -> not found. Confirms B7.
- `ls pi/secrets/` -> not found. Confirms B6.
- `cat menos/infra/ansible/inventory/hosts.yml` -> confirms `192.168.16.241`
  / user `anvil` / `deploy_path: /apps/menos` / `data_path: /apps/menos/data`.
- `head menos/infra/ansible/files/menos/docker-compose.yml` -> SurrealDB +
  Garage stack, no Postgres. Confirms B5.
- Existing `.env` file at repo root noted (per `ls`). T9 must address.
