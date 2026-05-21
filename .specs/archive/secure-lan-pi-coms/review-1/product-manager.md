# Product Manager Simplicity Review

## Finding 1: High - MVP scope is too large for the stated smallest outcome

**Evidence:** The plan calls the MVP "two local test hubs" but includes one-machine hub lifecycle, local multi-instance registration, UDP discovery, self-signed TLS/WSS, Ed25519 challenge-response, replay protection, prompt send/await, Pi tool registration, and audit logging across three waves. This is effectively a full product slice, not a minimal security proof.

**Required fix:** Split into a smaller MVP milestone: isolated two-hub loopback auth + message exchange + untrusted rejection + audit metadata. Defer UDP broadcast discovery, multi-local-instance hub convergence, and Pi tool surface to follow-up milestones unless the PRD explicitly requires them before any value is usable.

## Finding 2: High - WSS/self-signed TLS may duplicate Ed25519 trust without a clear user benefit

**Evidence:** The selected transport is `wss://` with self-signed TLS, while hub identity/authorization is already Ed25519 challenge-response against configured authorized keys. Managing self-signed cert generation, trust, and tests adds complexity that may not materially improve the MVP if the Ed25519 handshake authenticates and the LAN threat model is limited.

**Required fix:** Add a decision checkpoint that justifies TLS beyond encryption-in-transit. If confidentiality is required, specify the simplest implementation path. If not required for MVP, use plain local/loopback WebSocket plus Ed25519 auth for the first milestone and defer WSS/TLS hardening.

## Finding 3: Medium - Custom authorized_keys parser risks unnecessary security surface

**Evidence:** The plan selects `@noble/ed25519` plus a custom narrow OpenSSH parser, while also requiring rejection of options, malformed base64, unsupported key types, and wrong wire types. Parser bugs become security bugs, and this is not the differentiating feature.

**Required fix:** Prefer a small existing parser if dependency validation shows acceptable maintenance/runtime fit, or further constrain the MVP input format to a dedicated `trusted_keys.json`/line format that stores raw base64 public keys and comments. Defer full `authorized_keys` compatibility until after the communication contract works.

## Finding 4: Medium - Plan lacks an automation wrapper for a complex validation sequence

**Evidence:** Validation repeats multiple pnpm install/test/typecheck commands plus `make check-pi-ci`, with focused tests run in several gates. This invites inconsistent execution and wastes time, especially under `/do-it`.

**Required fix:** Add a single wrapper target/script for this plan, e.g. `make check-coms-lan` or `pi/tests` package script, that runs focused Vitest, extension typecheck, full Pi tests, and Pi CI in the required order. Update gates to call the wrapper plus only targeted reruns during development.

## Finding 5: Low - Static endpoint fallback is deferred despite being the simplest way to test real LAN behavior

**Evidence:** UDP broadcast is selected because it matches Joyride, while static/manual endpoint fallback is explicitly deferred. Broadcast is often blocked or flaky on real networks; a static endpoint option is simpler than broadcast and would make manual/diagnostic testing easier.

**Required fix:** Either swap the first real-network path to static peer endpoints and defer UDP broadcast, or include a minimal static endpoint override as a low-cost fallback for environments where broadcast fails.
