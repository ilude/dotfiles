# Serapis — Related Work & References

## Prior Art: AI-Aware Secret Protection

### ENVeil (GreatScott/enveil)

**Repo**: https://github.com/GreatScott/enveil
**Stars**: ~362 | **Language**: Rust | **License**: MIT

CLI tool that protects `.env` secrets from AI coding assistants by ensuring plaintext never exists on disk. Per-project encrypted stores with runtime injection.

**How it works:**
1. `enveil init` — creates `.enveil/` directory with encrypted store per project
2. `enveil set key_name` — interactive-only secret entry (avoids shell history)
3. `.env` uses `ev://` protocol references: `DATABASE_URL=ev://database_url`
4. `enveil run -- npm start` — decrypts on-demand, injects into subprocess environment

**Crypto:**
- AES-256-GCM with authenticated ciphertext
- Argon2id key derivation (64 MB memory, 3 iterations)
- Fresh random 12-byte nonce on every write
- 31 automated security tests

**Relevance to Serapis:**
- Solves the same "AI reads .env" problem but client-side only — no sync, no server, no team sharing
- `ev://` protocol reference pattern is similar to Serapis's `#!serapis://` shebang — both replace plaintext with symbolic references
- Runtime injection model (`enveil run --`) is identical to what Ergo would provide via `ergo run`
- No audit trail, no central management, no push/pull workflow
- Validates the threat model: AI tools scanning project directories for `.env` files is a recognized attack vector

**HN Discussion** (Show HN): https://news.ycombinator.com/item?id=47133055

Key takeaways from the thread:
- **Critique**: encryption at rest doesn't prevent runtime access — agents can `printenv`, read `/proc/self/environ`, or write scripts to extract env vars
- **Better pattern**: "surrogate credentials + proxy" — move trust boundary outside the agent's process entirely, scoped tokens that resolve at a user-controlled chokepoint
- **Consensus**: enveil addresses accidental file ingestion (the common case) but isn't defense against a determined agent with code execution
- **Alternative tools raised**: SOPS + age, dotenvx, 1Password CLI, Vault, pass/system keyrings
- **Philosophical split**: some argue production secrets shouldn't exist on dev machines at all; others accept dev-only credentials locally

### Filip Hric's Blog Post: "Don't let A.I. read your .env files"

**URL**: https://filiphric.com/dont-let-ai-read-your-env-files

Inspiration for enveil. Proposes using 1Password CLI to replace plaintext `.env` values with `op://` vault references:

```bash
# Before (plaintext on disk):
STRIPE_KEY=sk_test_abc123

# After (reference only):
STRIPE_KEY=op://Work/Stripe/api_key
```

Run with `op run -- npm start` — 1Password resolves references at runtime, secrets exist only in memory.

**Relevance to Serapis:**
- Same problem statement, different solution (cloud SaaS vs self-hosted)
- `op://` reference syntax is directly analogous to Serapis's `#!serapis://` shebang and enveil's `ev://`
- Validates the pattern: replace plaintext with references, inject at runtime
- 1Password dependency = paid, third-party cloud trust (exactly what Serapis avoids)
- No self-hosting option, no zero-knowledge guarantee on the user's terms

### William Callahan: "How to Secure Environment Variables for LLMs, MCPs, and AI Tools"

**URL**: https://williamcallahan.com/blog/secure-environment-variables-1password-doppler-llms-mcps-ai-tools

Broader survey of the problem space. Covers 1Password and Doppler approaches to securing env vars specifically in the context of LLM agents and MCP servers.

---

## Architectural References

### HashiCorp Vault — Seal/Unseal Architecture

**URL**: https://developer.hashicorp.com/vault/docs/concepts/seal

Inspiration for Serapis's envelope encryption model (KEK → DEK). Vault uses Shamir's Secret Sharing for the unseal process; Serapis simplifies to a single KEK file (appropriate for single-server personal use, with KMS integration planned for v2).

### menos Auth — RFC 9421 HTTP Signatures

**Path**: `../menos/api/menos/auth/`

Reference implementation of ed25519 HTTP message signing. Serapis chose simpler challenge-response auth instead (fewer canonicalization footguns, ~50 lines vs ~300).

### menos Signing Client

**Path**: `../claude/commands/yt/signing.py`

Python reference for SSH key signing patterns.

### age Encryption

**URL**: https://age-encryption.org/

Considered and rejected for Serapis — age is client-side only, no server-side encryption layer. SOPS uses age for its encryption backend.

### Convex Sync Architecture

**URL**: https://stack.convex.dev/how-convex-works

Query subscription model, inspiration for Serapis v1 `--watch` feature design.

---

## Competitive Landscape (Client-Side Only)

| Tool | Approach | Sync | Team | Self-Hosted | AI-Aware |
|------|----------|------|------|-------------|----------|
| **enveil** | Encrypted local store, `ev://` refs | No | No | N/A (local) | Yes (primary goal) |
| **1Password CLI** | `op://` refs, cloud vault | Yes | Yes | No | Yes (side effect) |
| **SOPS + age** | Encrypted files in git | Git | Yes (multi-recipient) | Yes | No |
| **dotenvx** | Encrypted `.env` files | Git | Yes | Yes | Partial |
| **Doppler** | Cloud SaaS, `doppler run` | Yes | Yes | No | No |
| **Vault** | Full secrets engine | Yes | Yes | Yes | No |
| **Serapis** | Zero-knowledge server, `#!serapis://` shebang, push/pull | Yes | v2 | Yes | Yes (by design) |

### Where Serapis Fits

Serapis occupies a unique position: self-hosted zero-knowledge with push/pull sync. enveil and 1Password validate that "replace plaintext with references, inject at runtime" is the right UX pattern. Serapis adds what they lack: central sync across machines without cloud dependency.

The HN discussion on enveil reinforces an important nuance for Serapis's threat model: **file-level protection stops accidental ingestion (the 90% case) but cannot stop a determined agent with code execution**. Serapis's shebang approach has the same limitation — if an agent can run `seractl pull`, it can access secrets. Defense-in-depth (audit logging, rate limiting, anomaly detection) addresses the remaining 10%.
