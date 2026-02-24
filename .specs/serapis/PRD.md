# Serapis — Secure .env File Management

## Overview

A system for securely managing `.env` files between machines using SSH key authentication, with an optional YubiKey FIDO2 second factor. Built for personal use first, designed to expand to team use.

## Name

Serapis — Egyptian god of the vault.

## Core Principles

- **KISS** — simplest thing that works at every stage
- **Cross-platform** — Windows, Linux, macOS from day one
- **SSH keys for auth** — no API tokens, no passwords, no OAuth; authenticate with keys already on the machine
- **Server-side encryption at rest** — local `.env` files are plaintext; the server encrypts stored data via envelope encryption
- **Manual sync by default** — `push` and `pull`, not background daemons
- **Honest threat model** — this is a convenience vault, not a fortress. It protects against backup leakage and casual exposure, not a determined attacker who owns the server host

## Architecture

```
┌──────────────┐          ┌─────────────────────────────────────┐
│  Any machine │          │  Docker host                        │
│              │   TLS    │  ┌───────────────────────────────┐  │
│  envault CLI │◄────────►│  │  envaultd (distroless, non-   │  │
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

- **Client**: Single Go binary (`envault`)
- **Server**: Go binary (`envaultd`) in a Docker container
- **Database**: SQLite (pure Go via `modernc.org/sqlite`, no CGo) with envelope encryption
- **Auth**: SSH ed25519 challenge-response with short-lived session tokens

## Threat Model

**What this protects against:**
- Secrets leaking into git, Slack, logs, or terminal history
- Backup leakage — encrypted SQLite file is useless without the KEK
- Unauthorized access — SSH key authentication, not shared passwords
- Replay attacks — challenge-response with nonce + timestamp + server URL binding

**What this does NOT protect against:**
- Full server host compromise — attacker with root on the Docker host can extract the KEK from the mounted volume and decrypt everything. This is the accepted tradeoff of a centralized vault vs. distributed encryption (SOPS/age)
- Lost KEK — if the Key Encryption Key is lost and not backed up, all data is unrecoverable

**Why not SOPS/age/1Password/Vault?**
- SOPS/age: no central sync, no audit trail, no push/pull workflow
- 1Password CLI: paid, third-party cloud dependency
- Vault: massive operational overhead for "5 .env files across 3 machines"
- Serapis trades distributed security for centralized convenience. That's an explicit, acknowledged tradeoff.

## Encryption Architecture

Envelope encryption, inspired by HashiCorp Vault's layered key model:

```
Secret values → encrypted by → DEK (Data Encryption Key, per project/environment)
                                encrypted by → KEK (Key Encryption Key, master)
```

### Key Encryption Key (KEK)

- Generated once on first server boot, stored as a file
- Mounted into the container as a **read-only volume**, separate from the data volume
- **Never stored as an environment variable** (visible in `docker inspect`, process listings, crash dumps)
- Used only to encrypt/decrypt DEKs, never touches secret data directly
- Rotation: re-encrypt all DEKs with new KEK (fast, no secret re-encryption needed)
- **Backup is critical** — document procedure on first run, store separately from data backups

### Data Encryption Keys (DEKs)

- One per project/environment pair, generated on first push
- Stored in the SQLite database, encrypted by the KEK
- AES-256-GCM with random 12-byte nonces (`crypto/rand.Read()`)
- Associated Authenticated Data (AAD) includes project name + environment name (prevents ciphertext swapping between environments)

### Key Derivation

- KEK → DEK wrapping uses HKDF-SHA256 (`golang.org/x/crypto/hkdf`) with domain separation per project/environment
- Nonces are always random, never sequential or time-based
- DEKs are domain-separated: project A's DEK cannot decrypt project B's data

### Rotation Procedures

- **KEK rotation**: Decrypt all DEKs with old KEK, re-encrypt with new KEK, atomic database transaction. No secrets are re-encrypted.
- **DEK rotation**: Decrypt all secrets in an environment with old DEK, re-encrypt with new DEK. Triggered on key compromise or as periodic hygiene.
- **Secret rotation**: Application concern — user rotates the credential externally, then `envault push` to update the vault.

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
- File owned by root inside container, readable by envault user (chmod 444)

### Key Management (v2)

- Database-backed key storage with named users
- `envault admin add-key`, `envault admin revoke-key` CLI commands
- Per-project/environment ACLs

## Self-Describing .env Files (Shebang)

`.env` files carry their origin as a comment on the first line:

```bash
#!envault://vault.example.com/myapp/staging
DATABASE_URL=postgres://...
STRIPE_KEY=sk_test_...
```

- `#` is a comment in all major `.env` parsers — invisible to consumers
- URL encodes server, project, and environment — no separate config file needed
- CLI reads the shebang for `push`/`pull` operations

**Note:** The shebang is a reference to a vault, not a credential by itself. Without an authorized SSH key, the shebang is useless. However, it does reveal the vault server address and project/environment names if the `.env` file leaks.

## CLI UX

```bash
# Link a .env to the vault and push current contents
envault init myapp staging

# Pull latest from vault (reads shebang)
envault pull

# Push local changes (reads shebang)
envault push

# Browse the vault
envault list
envault show myapp staging

# Backup/restore (v0)
envault admin backup --output backup.db
envault admin restore --input backup.db

# Export/import (database-agnostic format)
envault admin export --output secrets.json.enc
envault admin import --input secrets.json.enc
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

**Storage:** Append-only table in the SQLite database. Audit rows are never deleted or modified. Export via `envault admin audit` for external analysis.

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
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o envaultd ./cmd/envaultd

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/envaultd /envaultd
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
USER nonroot:nonroot
EXPOSE 8443
ENTRYPOINT ["/envaultd"]
```

### Docker Compose

```yaml
services:
  envaultd:
    image: envaultd:latest
    ports:
      - "8443:8443"
    volumes:
      - envault-data:/data
      - ./secrets/encryption.key:/run/secrets/encryption.key:ro
      - ./authorized_keys:/etc/envault/authorized_keys:ro
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
      test: ["CMD", "/envaultd", "healthcheck"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
    restart: unless-stopped

volumes:
  envault-data:
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

- `envault admin backup` calls a server endpoint that runs SQLite `.backup` (hot backup, no locks)
- Backup file contains encrypted data — useless without the KEK
- **KEK must be backed up separately** (password manager, GPG-encrypted file, printed on paper in a safe)

### Restore Procedure

1. Provision new Docker host
2. Restore KEK file from secure backup
3. Restore SQLite backup to data volume
4. Mount both into container, start
5. Verify with `envault list`

### Failure Scenarios

| Scenario | Impact | Recovery |
|----------|--------|----------|
| Container crash | ~30s downtime (auto-restart) | Automatic via restart policy |
| Host VM dies | Minutes–hours | Restore from backup + KEK |
| SQLite corruption | Restore from last backup | `envault admin restore` |
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
POST   /v1/auth/challenge     # Get a nonce
POST   /v1/auth/verify        # Sign nonce, get session token

# Core (v0)
GET    /v1/secrets/{project}/{env}        # Pull
PUT    /v1/secrets/{project}/{env}        # Push
GET    /v1/secrets                        # List all project/env pairs

# Admin (v0)
GET    /v1/admin/backup                   # Download encrypted SQLite backup
POST   /v1/admin/restore                  # Upload backup to restore
GET    /v1/admin/audit                    # Export audit log

# Health
GET    /healthz                           # Health check
```

## Input Validation

- **Project names**: alphanumeric + hyphens, 1-64 chars, validated server-side
- **Environment names**: alphanumeric + hyphens, 1-32 chars, validated server-side
- **.env key names**: validated against `^[A-Za-z_][A-Za-z0-9_]*$` — reject anything else
- **Request size limits**: maximum .env file size (1MB default, configurable)
- **Rate limiting**: 10 requests/second per fingerprint, burst of 50 (via `golang.org/x/time/rate`)

## Versioning Roadmap

### v0 — Core Loop (Personal Use)

Single-user, whole-file storage with proper security foundations.

**Scope:**
- CLI: `init`, `push`, `pull`, `list`, `show`, `admin backup`, `admin restore`
- Server: Docker image (distroless, non-root, hardened)
- Database: SQLite with envelope encryption (KEK → DEK → secrets)
- Auth: SSH ed25519 challenge-response, authorized_keys file
- Shebang: URL-style (`#!envault://...`)
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
- `--watch` flag for live sync (WebSocket/SSE, push notification on change)
- Export/import commands (database-agnostic JSON format)
- KEK rotation command (`envault admin rotate-key`)
- Postgres compatibility testing (run integration tests against both SQLite and Postgres)

### v2 — Multi-User Access Control

Team use with role-based access.

**Scope:**
- User management (SSH key registration, named users)
- Roles: admin, write, read
- Per-project and per-environment ACLs (e.g., read-only prod, write dev)
- Admin CLI (`envault admin add-key`, `envault admin revoke-key`, etc.)
- Database-backed key storage (replace authorized_keys file)
- Optional FIDO2/YubiKey as 2FA
- Secrets manager integration for KEK (Vault, AWS KMS) as alternative to file-based
- Multiple audit backends (file, syslog, socket) with HMAC-protected log entries for tamper evidence

### Future Research — End-to-End Encryption for Teams

The current architecture trusts the server (it sees plaintext during encryption). For team use, investigate a zero-knowledge model where **the server never sees plaintext secrets**, similar to 1Password's design.

**Key questions to explore:**
- How to encrypt secrets so only authorized team members can decrypt, without the server holding any decryption keys
- Key distribution: how does a new team member get access to existing secrets without the server being able to read them?
- Per-user key wrapping: each secret encrypted with a symmetric key, that key wrapped per-authorized-user with their public key (like age/SOPS multi-recipient)
- Revocation: when a user is removed, re-encrypt affected secrets to new key set — who triggers this, and how?
- Server's role reduces to: storage, access control enforcement, audit logging, sync — but never decryption
- Trade-off: client-side crypto complexity increases significantly, and key loss/rotation becomes harder

**Reference models:**
- 1Password: SRP + account key + master password, server stores only encrypted blobs
- SOPS: multi-recipient encryption with age/KMS, no server at all
- Signal protocol: per-group ratcheting keys (overkill here, but the key distribution pattern is relevant)

This would be a fundamental architecture change — not a bolt-on. If pursued, design it as a separate mode or a v3 milestone, not a retrofit onto the v0-v2 architecture.

## Project Structure

```
serapis/
├── cmd/
│   ├── envault/        # CLI binary
│   └── envaultd/       # Server binary
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

## Design Proposals (Open to Change)

| Proposal | Status | Notes |
|----------|--------|-------|
| AES-256-GCM for DEK cipher | Proposed | Standard AEAD, but ChaCha20-Poly1305 is also viable |
| `#!envault://server/project/env` exact format | Proposed | Could include version or hash |
| Project structure (`cmd/`, `internal/`) | Proposed | Standard Go layout |
| 1-hour session token TTL | Proposed | Could be shorter/longer based on usage patterns |
| v1 data model (key-value secrets) | Proposed | Will be designed properly in v1 |
| SQLite → Postgres migration path | Proposed | Use migration tool (goose/migrate) supporting both |
| `memguard` for key material | Proposed | Adds a dependency, could use manual mlock() instead |

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
- [ ] No secrets in Docker logs (`docker logs envaultd` shows nothing sensitive)
- [ ] No secrets in HTTP response headers
- [ ] Audit log records all access (reads and writes)
- [ ] Core dumps disabled (`ulimits.core: 0`)
- [ ] Input validation on project names, env names, .env key names
- [ ] Rate limiting on auth endpoints
- [ ] SQLite WAL mode + FULL sync
- [ ] Graceful shutdown on SIGTERM (WAL checkpoint)
- [ ] Backup/restore commands tested end-to-end
- [ ] KEK backup procedure documented

## References

- [HashiCorp Vault seal/unseal architecture](https://developer.hashicorp.com/vault/docs/concepts/seal) — inspiration for envelope encryption model
- [menos auth implementation](../menos/api/menos/auth/) — RFC 9421 HTTP signatures (reference, not used directly)
- [menos signing client](../claude/commands/yt/signing.py) — Python reference for SSH key signing patterns
- [age encryption](https://age-encryption.org/) — considered and rejected (server-side encryption chosen instead)
- [Convex](https://www.convex.dev/) — inspiration for real-time sync concept (deferred to v1 `--watch`)
- [Convex sync architecture](https://stack.convex.dev/how-convex-works) — query subscription model for `--watch` design
