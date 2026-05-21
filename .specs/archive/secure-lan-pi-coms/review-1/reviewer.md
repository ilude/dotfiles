---
reviewer: independent-completeness-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  evidence: "plan.md requires `wss://` over self-signed TLS and auth challenge-response, but no step defines TLS certificate generation, storage, validation policy, or how the handshake prevents MITM when self-signed certs are accepted."
  required_fix: "Add explicit TLS design: cert/key file paths under `~/.pi/coms-lan/`, generation/rotation rules, Node/WebSocket client verification behavior, and tests proving MITM/unknown cert handling is intentionally safe or auth-bound."
- severity: high
  evidence: "Authentication depends on imported/configured `authorized_keys`, but the plan never specifies the trust file path, import command/tool, record schema, permissions, or how a user obtains/adds a remote hub public key without touching `~/.ssh/`."
  required_fix: "Define exact trusted-key configuration surface: e.g. `~/.pi/coms-lan/authorized_keys`, key generation/export location, import/list/remove tools, file permissions, and tests for trust changes and invalid/missing trust files."
- severity: medium
  evidence: "T3 says implement a startup lock/state file for one hub per machine, but no locking primitive, stale-lock recovery, PID/process liveness check, or cross-platform Windows/MSYS path behavior is specified."
  required_fix: "Add concrete local hub coordination algorithm: atomic lock mechanism, state file schema, stale detection, retry/backoff behavior, cleanup on shutdown/crash, and tests for concurrent start, stale state, and Windows path normalization."
- severity: medium
  evidence: "The plan validates only `@noble/ed25519` in T2, but MVP also needs UDP sockets, WSS client/server, self-signed TLS, and possibly `ws` dependency compatibility in Pi extension/tests."
  required_fix: "Expand dependency/runtime validation before implementation to prove required Node APIs/packages work in `pi/extensions` and `pi/tests`, including UDP bind/broadcast loopback and WSS server/client over self-signed TLS."
- severity: medium
  evidence: "T1 requires reading remote Joyride and Disler URLs, but the automation plan provides no offline fallback, pinned snapshot, or exact expected source versions. A fresh `/do-it` session can block on network access or get changed upstream behavior."
  required_fix: "Pin prior-art inputs: copy required excerpts/URLs with commit SHAs into the spec, or make remote research optional with an explicit fallback to local PRD summaries and record inaccessible URLs as non-blocking evidence."
