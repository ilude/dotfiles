# QA Verification Review

## Finding 1
- severity: high
- evidence: The plan's MVP boundary allows "two local test hubs can simulate LAN discovery" and T4/V2 focus on in-process loopback WSS. UDP broadcast is accepted if packet serialization/parsing is safe, but there is no acceptance criterion that binds an actual UDP socket, sends a broadcast/datagram, receives it, and updates peer cache/lifecycle state. This can pass with pure mocks while real Windows/Git Bash UDP binding, broadcast flags, address-family handling, and shutdown behavior are broken.
- required_fix: Add a focused integration acceptance criterion and validation command for real local UDP sockets using isolated temp state and ephemeral ports. It must exercise broadcast or a Windows-safe loopback/datagram substitute through the production discovery implementation, assert peer cache update and clean shutdown, and document any non-broadcast fallback used only for test determinism.

## Finding 2
- severity: high
- evidence: WSS transport is listed as required, but the tests only require an "in-process two-hub integration test over loopback WSS" and message delivery. There is no explicit assertion that the production client rejects `ws://`, performs TLS certificate handling as designed, or actually traverses the network WebSocket stack rather than directly invoking hub handlers.
- required_fix: Require an end-to-end WSS test that starts real hub listeners on ephemeral localhost ports and connects through the same production transport path used by remote hubs. Assert the negotiated endpoint is `wss://`, plaintext `ws://` is rejected/unused, and test helpers cannot bypass auth by calling message handlers directly.

## Finding 3
- severity: high
- evidence: Auth tests cover unknown keys, invalid signatures, stale handshakes, and replayed nonces, but the plan does not require a fixture strategy proving the authenticated remote node identity is bound to the key and runtime handshake. The context explicitly says public keys must not be machine identity because keys may be reused across machines. Tests could authorize a trusted key and then accept messages claiming any node ID.
- required_fix: Add negative tests for identity/key confusion: same trusted public key reused by two generated node IDs, a signed handshake whose claimed node ID differs between challenge and message envelope, and post-auth message envelopes with spoofed sender IDs. Define the expected behavior and assert audit records identify the stable generated node ID without deriving it from the key fingerprint.

## Finding 4
- severity: medium
- evidence: Test isolation is mentioned via `PI_COMS_LAN_DIR`, but the plan does not require verifying filesystem lock behavior across separate processes. The high-risk one-hub-per-machine lifecycle can pass in a single-process mock while real Windows file locking, stale hub-state cleanup, and concurrent startup under Git Bash fail.
- required_fix: Add a process-level lifecycle test or script that launches two independent Node/Vitest helper processes with the same temp `PI_COMS_LAN_DIR`, asserts only one hub owns the lock/listener, both instances register, stale state is replaced, and rerunning the test twice leaves no persistent state dependency.

## Finding 5
- severity: medium
- evidence: Audit safety acceptance checks say to omit private keys, bearer tokens, prompt bodies, and raw absolute cwd paths, but they do not require adversarial fixture values that would reveal false-positive sanitization. A test could pass by inspecting normal events while prompt-like secrets or Windows paths leak in error/audit fields.
- required_fix: Require audit tests to inject sentinel secrets and Windows/Git Bash absolute paths into prompts, cwd/project metadata, auth failure reasons, and transport errors, then scan serialized audit files for those exact sentinel strings. The test must fail on any raw secret/path occurrence and should run against persisted audit log files, not just in-memory event objects.
