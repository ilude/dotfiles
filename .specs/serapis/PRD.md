# Serapis — Secure .env File Management

## Overview

A system for securely managing `.env` files between machines using SSH key authentication, with an optional YubiKey FIDO2 second factor. Built for personal use first, designed to expand to team use.

## Name

Serapis — Egyptian god of the vault.

## Core Principles

- **KISS** — simplest thing that works at every stage
- **Cross-platform** — Windows, Linux, macOS from day one
- **SSH keys for auth** — no API tokens, no passwords, no OAuth; authenticate with keys already on the machine
- **Zero-knowledge server** — secrets are encrypted client-side before leaving the machine; the server never sees plaintext
- **Defense in depth** — client-side encryption + server-side envelope encryption (DEK → KEK); multiple layers must be compromised to reach plaintext
- **Manual sync by default** — `push` and `pull`, not background daemons

## Architecture

```
┌──────────────┐          ┌─────────────────────────────────────┐
│  Any machine │          │  Docker host                        │
│              │   TLS    │  ┌───────────────────────────────┐  │
│  seractl CLI │◄────────►│  │  serapisd (distroless, non-   │  │
│  (Go binary) │  1.3+    │  │  root, cap_drop: ALL)         │  │
│              │          │  │  ┌─────────┐  ┌────────────┐  │  │
└──────────────┘          │  │  │ SQLite  │  │ Audit Log  │  │  │
                          │  │  │ (data)  │  │            │  │  │
                          │  │  └─────────┘  └────────────┘  │  │
                          │  └───────────────────────────────┘  │
                          │  Volumes:                            │
                          │    /data          (SQLite, rw)       │
                          │    /secrets       (KEK file, ro)     │
                          │    /keys          (authorized, ro)   │
                          └─────────────────────────────────────┘
```

- **Client**: Single Go binary (`seractl`)
- **Server**: Go binary (`serapisd`) in a Docker container
- **Database**: SQLite (pure Go via `modernc.org/sqlite`, no CGo) with envelope encryption
- **Auth**: SSH ed25519 challenge-response with short-lived session tokens

## Threat Model

**What this protects against:**
- Secrets leaking into git, Slack, logs, or terminal history
- Server compromise — server never sees plaintext; attacker gets ciphertext encrypted by the client's key, then further encrypted by server-side envelope encryption. Requires client key material + server KEK + team private key to reach plaintext
- Backup leakage — encrypted SQLite file is useless without the KEK AND the client-side key
- Unauthorized access — SSH key authentication, not shared passwords
- Replay attacks — challenge-response with nonce + timestamp + server URL binding
- Man-in-the-middle — secrets are encrypted before leaving the client, TLS is an additional layer not the only layer

**What this does NOT protect against:**
- Compromised client machine — if an attacker has your SSH private key, they can decrypt anything you can
- Lost KEK + lost client keys — if both the server KEK and client key material are lost, data is unrecoverable
- Revoked team member with cached keys — a removed member who kept the team encryption key can decrypt any secrets they previously pulled. Mitigation: team key rotation on member removal (re-encrypt all secrets)

**Why not SOPS/age/1Password/Vault?**
- SOPS/age: no central sync, no audit trail, no push/pull workflow
- 1Password CLI: paid, third-party cloud dependency
- Vault: massive operational overhead for "5 .env files across 3 machines"
- Serapis provides zero-knowledge server security (like 1Password) with a self-hosted push/pull workflow (like SOPS) — without the operational weight of Vault

## Encryption Architecture

Three-layer encryption model. Client-side encryption ensures the server never sees plaintext. Server-side envelope encryption adds defense in depth.

```
Layer 1 (client-side):
  plaintext → encrypted with client key → ciphertext₁
  (single user: user's SSH private key; team: team encryption key)

Layer 2 (server-side, per-team):
  ciphertext₁ → encrypted with team private key → ciphertext₂
  (team private key held by server only)

Layer 3 (server-side, envelope):
  ciphertext₂ → encrypted with DEK → encrypted DEK with KEK → stored in SQLite
```

**Pull reverses the layers:**
```
SQLite → decrypt DEK with KEK → decrypt ciphertext₂ with DEK
       → decrypt with team private key → ciphertext₁
       → send ciphertext₁ to client over TLS
       → client decrypts with client key → plaintext
```

### Layer 1: Client-Side Encryption

**Single-user mode:**
- User's SSH ed25519 private key is used to derive a symmetric encryption key (via HKDF-SHA256)
- Client encrypts secrets locally before sending to server
- Server only ever receives ciphertext
- Decryption happens on the client using the same SSH private key

**Team mode:**
- Server generates an ed25519 keypair when a team is created
- The public half is the **team encryption key** — distributed to all team members as a shared secret. Despite being generated as a "public key," it MUST be treated as confidential (it is the shared encryption secret, not a publishable identity)
- Team members derive a symmetric key from the team encryption key (via HKDF-SHA256) for client-side encryption/decryption
- Ed25519 keypair is used for convenient key generation and distribution, not asymmetric encryption

### Layer 2: Team Private Key (Server-Side)

- Per-team ed25519 private key, held by the server only
- Used to add a second encryption layer on top of client-encrypted data
- Symmetric key derived from the team private key (via HKDF-SHA256)
- In single-user mode: the server uses the user's public key (from `authorized_keys`) to derive this layer
- An attacker who compromises only client key material still can't decrypt stored data (missing layer 2)
- An attacker who compromises only the server still can't decrypt data (missing layer 1)

### Layer 3: Envelope Encryption (Server-Side)

Inspired by HashiCorp Vault's layered key model.

#### Key Encryption Key (KEK)

- Generated once on first server boot, stored as a file
- Mounted into the container as a **read-only volume**, separate from the data volume
- **Never stored as an environment variable** (visible in `docker inspect`, process listings, crash dumps)
- Used only to encrypt/decrypt DEKs, never touches secret data directly
- Rotation: re-encrypt all DEKs with new KEK (fast, no secret re-encryption needed)
- **Backup is critical** — document procedure on first run, store separately from data backups

#### Data Encryption Keys (DEKs)

- One per project/environment pair, generated on first push
- Stored in the SQLite database, encrypted by the KEK
- AES-256-GCM with random 12-byte nonces (`crypto/rand.Read()`)
- Associated Authenticated Data (AAD) includes project name + environment name (prevents ciphertext swapping between environments)

### Key Derivation

- All symmetric keys derived via HKDF-SHA256 (`golang.org/x/crypto/hkdf`) with domain separation
- Client key: `HKDF(SSH private key bytes, "serapis-client-v1/" + server_url)`
- Team key (client): `HKDF(team encryption key bytes, "serapis-team-v1/" + team_id)`
- Team key (server): `HKDF(team private key bytes, "serapis-team-server-v1/" + team_id)`
- KEK → DEK wrapping: `HKDF(KEK, "serapis-dek-v1/" + project + "/" + environment)`
- Nonces are always random, never sequential or time-based
- DEKs are domain-separated: project A's DEK cannot decrypt project B's data

### Rotation Procedures

- **KEK rotation**: Decrypt all DEKs with old KEK, re-encrypt with new KEK, atomic database transaction. No layer 1 or layer 2 re-encryption needed.
- **DEK rotation**: Decrypt all secrets in an environment with old DEK, re-encrypt with new DEK. Triggered on key compromise or as periodic hygiene.
- **Team key rotation** (member removal): Generate new team keypair, distribute new public key to remaining members, re-encrypt all team secrets through all three layers. This is the expensive operation — triggered only on member revocation.
- **Secret rotation**: Application concern — user rotates the credential externally, then `seractl push` to update the vault.

### What an Attacker Needs

| Compromised | Can decrypt? | Missing |
|-------------|-------------|---------|
| Client key only | No | Layer 2 (team private key) + Layer 3 (DEK/KEK) |
| Server only (KEK + team private key + DEKs) | No | Layer 1 (client key) |
| Client key + server KEK | No | Layer 2 (team private key) or DEKs |
| Client key + team private key + KEK + DEKs | **Yes** | — |
| SQLite backup file only | No | KEK + team private key + client key |

## Authentication

### Challenge-Response with SSH Keys

Simple challenge-response protocol using ed25519 SSH keys. No RFC 9421 canonicalization complexity.

```
1. Client → Server:  POST /v1/auth/challenge
                     Body: { "fingerprint": "SHA256:abc123" }

2. Server → Client:  { "nonce": "<random-32-bytes>", "expires": "<timestamp+30s>" }
                     Server stores nonce, marks as single-use

3. Client → Server:  POST /v1/auth/verify
                     Body: {
                       "fingerprint": "SHA256:abc123",
                       "nonce": "<nonce>",
                       "signature": Sign("serapis-auth-v1/" + nonce + timestamp + server_url)
                     }

4. Server:           Look up public key by fingerprint in authorized_keys
                     Verify signature over "serapis-auth-v1/" + nonce + timestamp + server_url
                     Verify nonce is unused and not expired
                     Return short-lived session token (opaque, 1 hour TTL)

5. Client:           Uses token in Authorization header for subsequent requests
```

**Security properties:**
- SSH private key never leaves the client
- Nonce is single-use (prevents replay)
- Server URL is signed into the response (prevents token reuse across servers)
- 30-second challenge window (limits attack surface)
- Session token is short-lived (1 hour, configurable)
- Go stdlib only: `crypto/ed25519`, `golang.org/x/crypto/ssh`

### Key Management (v0)

- `authorized_keys` file mounted read-only into the container
- Standard SSH `authorized_keys` format — add a public key line to grant access, remove to revoke
- File owned by root inside container, readable by serapis user (chmod 444)

### Key Management (v2)

- Database-backed key storage with named users
- `seractl admin add-key`, `seractl admin revoke-key` CLI commands
- Per-project/environment ACLs

## Self-Describing .env Files (Shebang)

`.env` files carry their origin as a comment on the first line:

```bash
#!serapis://vault.example.com/v1/myapp/staging/.env
DATABASE_URL=postgres://...
STRIPE_KEY=sk_test_...
```

```bash
#!serapis://vault.example.com:8443/v1/myapp/staging/.env.local
LOCAL_OVERRIDE=true
```

```bash
#!serapis://vault.example.com/v1/myapp/staging/database.env
DATABASE_URL=postgres://...
DATABASE_POOL_SIZE=10
```

- Path format: `/v{api_version}/{project}/{environment}/{filename}`
- `#` is a comment in all major `.env` parsers — invisible to consumers
- URL encodes server, project, environment, and filename — no separate config file needed
- Supports `*.env` and `.env.*` patterns (multiple env files per environment)
- Port is optional (default: 8443)
- CLI reads the shebang for `push`/`pull` operations

**Note:** The shebang is a reference to a vault, not a credential by itself. Without an authorized SSH key, the shebang is useless. However, it does reveal the vault server address and project/environment names if the `.env` file leaks.

## Client Configuration

All client configuration and secrets stored in `~/.config/serapis/`:

```
~/.config/serapis/
├── config.yaml           # Server URL, default project, preferences
├── session.token         # Current session token (short-lived, 1 hour)
└── team-keys/            # Team encryption keys (one per team, confidential)
    └── <team-id>.key
```

- Directory permissions: `700` (owner only)
- Key files: `600` (owner read/write only)
- Session token: overwritten on each auth, deleted on expiry
- XDG-compliant path (`$XDG_CONFIG_HOME/serapis/` if set)

## CLI UX

```bash
# Link a .env to the vault and push current contents
seractl init myapp staging

# Pull latest from vault (reads shebang)
seractl pull

# Push local changes (reads shebang)
seractl push

# Browse the vault
seractl list
seractl show myapp staging

# Backup/restore (v0)
seractl admin backup --output backup.db
seractl admin restore --input backup.db

# Export/import (database-agnostic format)
seractl admin export --output secrets.json.enc
seractl admin import --input secrets.json.enc
```

## Audit Logging

Every operation is logged. This is not optional — it ships in v0.

**Logged fields:**
- Timestamp (UTC)
- Key fingerprint (who)
- Client IP address
- Operation (push, pull, list, show, auth)
- Project/environment (what)
- Success/failure

**Storage:** Append-only table in the SQLite database. Audit rows are never deleted or modified. Export via `seractl admin audit` for external analysis.

**What is NOT logged:**
- Secret values (plaintext or ciphertext)
- SSH private keys or session tokens
- Full request/response bodies

## Container Hardening

### Dockerfile (distroless, non-root)

```dockerfile
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache ca-certificates git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o serapisd ./cmd/serapisd

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/serapisd /serapisd
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
USER nonroot:nonroot
EXPOSE 8443
ENTRYPOINT ["/serapisd"]
```

### Docker Compose

```yaml
services:
  serapisd:
    image: serapisd:latest
    ports:
      - "8443:8443"
    volumes:
      - serapis-data:/data
      - ./secrets/encryption.key:/run/secrets/encryption.key:ro
      - ./authorized_keys:/etc/serapis/authorized_keys:ro
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=64M
    ulimits:
      core: 0        # no core dumps
      memlock: -1     # allow mlock() for key material
    healthcheck:
      test: ["CMD", "/serapisd", "healthcheck"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
    restart: unless-stopped

volumes:
  serapis-data:
```

### TLS Configuration

- **TLS 1.3 minimum** — no negotiation of older versions
- Cipher suites: `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`
- Curve: X25519
- Certificate via Let's Encrypt (ACME) or self-signed for internal networks
- **No `InsecureSkipVerify`** in the client — ever

### Memory Safety

- Use `github.com/awnumar/memguard` for KEK material in memory (`mlock()`, auto-zero on destruction)
- Disable swap on the Docker host (`vm.swappiness=0`) or at minimum prevent the container from swapping key material
- No core dumps (`ulimits.core: 0`)

## Backup & Disaster Recovery

### Backup

- `seractl admin backup` calls a server endpoint that runs SQLite `.backup` (hot backup, no locks)
- Backup file contains encrypted data — useless without the KEK
- **KEK must be backed up separately** (password manager, GPG-encrypted file, printed on paper in a safe)

### Restore Procedure

1. Provision new Docker host
2. Restore KEK file from secure backup
3. Restore SQLite backup to data volume
4. Mount both into container, start
5. Verify with `seractl list`

### Failure Scenarios

| Scenario | Impact | Recovery |
|----------|--------|----------|
| Container crash | ~30s downtime (auto-restart) | Automatic via restart policy |
| Host VM dies | Minutes–hours | Restore from backup + KEK |
| SQLite corruption | Restore from last backup | `seractl admin restore` |
| KEK lost | **Permanent data loss** | Push all secrets from local `.env` files to a fresh vault |
| Network outage | Can't sync | Local `.env` files still work — last-pulled state |

### SQLite Durability

- WAL mode enabled (`PRAGMA journal_mode=WAL`)
- Full sync (`PRAGMA synchronous=FULL`)
- Graceful shutdown on SIGTERM (flush WAL checkpoint)
- Named Docker volume (not bind mount) for predictable fsync
- **Avoid NFS/CIFS volumes** — page cache coherency issues with SQLite

## API Routes

```
# Authentication
POST   /v1/auth/challenge                          # Get a nonce
POST   /v1/auth/verify                             # Sign nonce, get session token

# Core (v0)
GET    /v1/secrets/{project}/{env}/{filename}       # Pull
PUT    /v1/secrets/{project}/{env}/{filename}       # Push
GET    /v1/secrets                                  # List all project/env/file entries
GET    /v1/secrets/{project}                        # List environments for a project
GET    /v1/secrets/{project}/{env}                  # List files for an environment

# Admin (v0)
GET    /v1/admin/backup                             # Download encrypted SQLite backup
POST   /v1/admin/restore                            # Upload backup to restore
GET    /v1/admin/audit                              # Export audit log

# Health
GET    /healthz                                     # Health check
```

## Input Validation

- **Project names**: alphanumeric + hyphens, 1-64 chars, validated server-side
- **Environment names**: alphanumeric + hyphens, 1-32 chars, validated server-side
- **.env key names**: validated against `^[A-Za-z_][A-Za-z0-9_]*$` — reject anything else
- **Request size limits**: maximum .env file size (1MB default, configurable)
- **Rate limiting**: 10 requests/second per fingerprint, burst of 50 (via `golang.org/x/time/rate`)

## Versioning Roadmap

### v0 — Core Loop (Personal Use)

Single-user, whole-file storage with zero-knowledge encryption from day one.

**Scope:**
- CLI: `init`, `push`, `pull`, `list`, `show`, `admin backup`, `admin restore`
- Client-side encryption using user's SSH ed25519 private key (server never sees plaintext)
- Server: Docker image (distroless, non-root, hardened)
- Server-side: additional encryption with user's public key + envelope encryption (DEK → KEK)
- Database: SQLite with three-layer encryption
- Auth: SSH ed25519 challenge-response, authorized_keys file
- Shebang: URL-style (`#!serapis://host:port/v1/project/env/filename`)
- Whole-file storage (one encrypted blob per project/environment)
- Audit logging (every operation)
- TLS 1.3, input validation, rate limiting
- Health check endpoint

**Non-goals for v0:** roles, teams, per-key granularity, FIDO2, real-time sync

### v1 — Projects, Environments, Key-Value

Structured secret storage with history.

**Scope:**
- Key-value secret storage (individual keys, not whole-file blobs)
- Per-key audit trail (who changed what, when)
- Environment templates with per-user dynamic value generation
- `--watch` flag for live sync (WebSocket/SSE, push notification on change)
- Export/import commands (database-agnostic JSON format)
- KEK rotation command (`seractl admin rotate-key`)
- Postgres compatibility testing (run integration tests against both SQLite and Postgres)

#### Environment Templates

Templates define .env files where some values are generators instead of literals. Generated values are created server-side on first pull per user and persisted for subsequent pulls.

```yaml
# Template definition for myapp/dev
template:
  DATABASE_URL: "mysql://{{user}}:{{password:32}}@dev-db.internal/myapp_{{user}}"
  REDIS_URL: "redis://dev-redis.internal/0"
  API_KEY: "{{uuid}}"
  SESSION_SECRET: "{{base64:32}}"
```

**Built-in generators:**

| Generator | Syntax | Output |
|-----------|--------|--------|
| Password | `{{password:N}}` | Random alphanumeric + symbols, N chars |
| Alphanumeric | `{{alphanumeric:N}}` | Random `[a-zA-Z0-9]`, N chars |
| Hex | `{{hex:N}}` | Random hex string, N chars |
| UUID | `{{uuid}}` | UUIDv4 |
| Base64 | `{{base64:N}}` | Random N bytes, base64 encoded |
| Username | `{{user}}` | Authenticated user's name |

**Behavior:**
- Values generated once per user on first pull, then persisted — stable across subsequent pulls
- Literal values and static strings pass through unchanged (shared across all users)
- Templates require key-value storage (not whole-file), hence v1

### v2 — Multi-User Access Control

Team use with role-based access.

**Scope:**
- User management (SSH key registration, named users)
- Roles: admin, write, read
- Per-project and per-environment ACLs (e.g., read-only prod, write dev)
- Admin CLI (`seractl admin add-key`, `seractl admin revoke-key`, etc.)
- Database-backed key storage (replace authorized_keys file)
- Optional FIDO2/YubiKey as 2FA
- Secrets manager integration for KEK (Vault, AWS KMS) as alternative to file-based
- Multiple audit backends (file, syslog, socket) with HMAC-protected log entries for tamper evidence

### Future Research — Team Key Distribution & Revocation

The three-layer encryption model provides zero-knowledge from v0. Open questions for team scaling:

**Key distribution:**
- How does a new team member securely receive the team encryption key? Options: `seractl join <invite-code>` over authenticated TLS, out-of-band sharing, QR code
- Should the server be able to distribute the team encryption key to authenticated users, or must it always be out-of-band?

**Revocation at scale:**
- Team key rotation on member removal requires re-encrypting all team secrets through all three layers
- For large teams with many secrets, this could be slow — investigate batched/async rotation
- Consider per-project team keys (smaller blast radius on rotation) vs per-team keys (simpler model)

### v3+ — Web Interface, OAuth & Self-Service Onboarding

Transition from CLI-only admin to a web-based management interface.

**Bootstrap flow (Onyx-style):**
- On first container boot, `serapisd` generates a random admin password (cryptographically secure, base64url-encoded)
- Password printed to container logs once, hashed with Argon2id, stored in database
- `must_change` flag forces password change at first web login
- Optional `ADMIN_PASSWORD` environment variable for scripted/automated deployments
- First login also generates a short-lived enrollment token for uploading the admin's SSH public key via the web UI

**Initial key enrollment:**
- Admin logs into web UI with generated password
- Uploads their SSH public key through the UI (associates key with their account)
- Short-lived enrollment token (e.g., 15 minutes) prevents the key upload endpoint from being open indefinitely
- After initial setup, SSH key auth is the primary auth mechanism; web login is secondary

**Web interface scope:**
- User self-service: upload/rotate SSH public keys, view audit log for own activity
- Admin: manage users, teams, projects, environments, roles, ACLs
- Dashboard: secret inventory, recent activity, key expiration warnings
- Served from the same `serapisd` Docker container (embedded static assets)

**OAuth/SSO:**
- OAuth2/OIDC provider integration (Google, GitHub, Azure AD, Okta) for web login
- OAuth identity linked to SSH key(s) — OAuth authenticates the user, SSH key authorizes secret operations
- SSO for team onboarding: new user signs in via OAuth, uploads SSH key, gets access to assigned projects
- SAML support if enterprise demand warrants it

**Provisioning webhooks (long-term):**
- Templates could define webhooks/hooks that fire on first generation (e.g., auto-create a database user when credentials are generated)
- This moves Serapis toward dynamic secret provisioning (Vault territory) — only pursue if there's clear demand
- Keep Serapis focused on secret management, not infrastructure provisioning

**Reference models:**
- 1Password: SRP + account key + master password, server stores only encrypted blobs
- SOPS: multi-recipient encryption with age/KMS, no server at all
- Signal protocol: per-group ratcheting keys (overkill here, but the key distribution pattern is relevant)

## Project Structure

```
serapis/
├── cmd/
│   ├── seractl/        # CLI binary
│   └── serapisd/       # Server binary
├── internal/
│   ├── auth/           # Challenge-response, session tokens, key store
│   ├── crypto/         # Envelope encryption, KEK/DEK management, HKDF
│   ├── store/          # SQLite repository (secrets, audit, DEKs)
│   ├── api/            # HTTP handlers, middleware, rate limiting
│   └── shebang/        # .env file parsing (read/write shebang line)
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── go.sum
```

## Go Package Dependencies

| Function | Package | Notes |
|----------|---------|-------|
| AES-GCM | `crypto/cipher` | Reuse GCM instance, random nonces via `crypto/rand` |
| Key derivation | `golang.org/x/crypto/hkdf` | HKDF-SHA256 with domain separation |
| ed25519 | `crypto/ed25519` | Stdlib, not x/crypto/ed25519 |
| SSH key parsing | `golang.org/x/crypto/ssh` | `ParseAuthorizedKey()`, `ParsePrivateKey()` |
| SQLite | `modernc.org/sqlite` | Pure Go, no CGo |
| Memory protection | `github.com/awnumar/memguard` | mlock() for key material |
| Rate limiting | `golang.org/x/time/rate` | Per-fingerprint rate limiting |
| HTTP | `net/http` | Stdlib, TLS 1.3 config |

---

## Design Decisions (Confirmed)

| Decision | Rationale |
|----------|-----------|
| Go for client and server | Single binary distribution, cross-platform, goroutines for future `--watch` |
| SSH keys for authentication | Already on every dev machine, no separate credential management |
| Challenge-response auth (not RFC 9421) | Simpler to implement correctly, ~50 lines vs ~300, no canonicalization footguns |
| Server URL signed into challenge | Prevents token reuse across different vault servers |
| Client-side encryption (zero-knowledge) | Server never sees plaintext; user's SSH key (single-user) or team encryption key (team) encrypts before data leaves the client |
| Three-layer encryption | Defense in depth: client key + team private key + envelope (DEK/KEK). No single layer compromise reaches plaintext |
| Envelope encryption (KEK → DEK) | KEK rotation without re-encrypting all secrets, foundation for future KMS integration |
| File-based KEK (not env var) | Env vars visible in `docker inspect`, process listings, crash dumps |
| YubiKey as optional FIDO2 2FA | Physical second factor, deferred to v2 |
| Docker for server deployment | No runtime dependencies on the host, simple `docker compose up` |
| Distroless container image | No shell, no package manager, minimal attack surface (~10MB) |
| SQLite (not Postgres) | Single-server use case, no external DB dependency |
| Audit logging in v0 | Not optional for a secrets manager — incident response requires it from day one |
| URL-style shebang | Compact, natural hierarchy, parseable, invisible to .env consumers |
| Manual push/pull default | .env files change infrequently, daemons add complexity |
| v0/v1/v2 phasing | Personal first → structured secrets → team access control |

## Design Proposals (Resolved)

All proposals from the initial design discussion have been resolved:

| Proposal | Decision | Notes |
|----------|----------|-------|
| DEK cipher | **AES-256-GCM** | Default cipher. Implement behind a pluggable `Cipher` interface to allow future alternatives without over-engineering |
| Shebang format | **`#!serapis://host:port/v1/project/env/filename`** | API version in path, filename included to support `*.env` and `.env.*` patterns, port optional |
| Project structure | **Standard Go layout (`cmd/`, `internal/`)** | `cmd/seractl/`, `cmd/serapisd/`, shared `internal/`. Evaluate monorepo if client/server deps diverge significantly |
| Session token TTL | **1 hour** | Configurable server-side. Stored in `~/.config/serapis/session.token` with `600` permissions |
| SQLite → Postgres | **Repository pattern (`Store` interface)** | No migration tool in v0. Evaluate `goose` when Postgres work starts |
| Memory protection | **Container hardening only for v0** | Core dumps disabled, memlock ulimit set. Evaluate `memguard` if compliance or multi-tenant requirements arise |
| v1 template generation vs zero-knowledge | **Tabled** | Architectural contradiction to resolve during v1 design |

## Build & Release

- GitHub Actions CI for cross-platform `seractl` binaries:
  - `linux/amd64`, `linux/arm64`
  - `darwin/amd64`, `darwin/arm64`
  - `windows/amd64`
- `serapisd` Docker image built and published via CI
- GoReleaser or equivalent for release automation
- Binary checksums published with each release for verification

## Security Checklist (v0 Ship Gate)

- [ ] Nonces are random (`crypto/rand`), not time-based or sequential
- [ ] DEKs are domain-separated (project A's key ≠ project B's key)
- [ ] AAD includes project + environment name (prevents ciphertext swapping)
- [ ] Challenge nonces are single-use and expire within 30 seconds
- [ ] Server URL is signed into challenge response
- [ ] TLS 1.3 minimum, no `InsecureSkipVerify`
- [ ] KEK stored in read-only mounted file, not env var
- [ ] `authorized_keys` mounted read-only, owned by root, chmod 444
- [ ] Container runs as non-root (`nonroot:nonroot`)
- [ ] All capabilities dropped (`cap_drop: ALL`)
- [ ] No secrets in Docker logs (`docker logs serapisd` shows nothing sensitive)
- [ ] No secrets in HTTP response headers
- [ ] Audit log records all access (reads and writes)
- [ ] Core dumps disabled (`ulimits.core: 0`)
- [ ] Input validation on project names, env names, .env key names
- [ ] Rate limiting on auth endpoints
- [ ] SQLite WAL mode + FULL sync
- [ ] Graceful shutdown on SIGTERM (WAL checkpoint)
- [ ] Backup/restore commands tested end-to-end
- [ ] KEK backup procedure documented
- [ ] Client-side encryption verified (data leaving client is always ciphertext)
- [ ] Ed25519 keys only — reject RSA, DSA, ECDSA for encryption key derivation
- [ ] Team encryption key treated as confidential secret, not as a normal "public key"
- [ ] HKDF domain separation verified for all three encryption layers
- [ ] Client config/secrets stored in `~/.config/serapis/` with appropriate permissions

## References

- [HashiCorp Vault seal/unseal architecture](https://developer.hashicorp.com/vault/docs/concepts/seal) — inspiration for envelope encryption model
- [menos auth implementation](../menos/api/menos/auth/) — RFC 9421 HTTP signatures (reference, not used directly)
- [menos signing client](../claude/commands/yt/signing.py) — Python reference for SSH key signing patterns
- [age encryption](https://age-encryption.org/) — considered and rejected (server-side encryption chosen instead)
- [Convex](https://www.convex.dev/) — inspiration for real-time sync concept (deferred to v1 `--watch`)
- [Convex sync architecture](https://stack.convex.dev/how-convex-works) — query subscription model for `--watch` design
