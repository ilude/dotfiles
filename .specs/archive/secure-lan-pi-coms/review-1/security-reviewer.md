---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "auth-design"
  confidence: high
  evidence: "Plan requires WSS over self-signed TLS and Ed25519 challenge-response, but T4 only says bind endpoint/freshness data; it does not require TLS certificate identity pinning or channel binding. A LAN MITM can terminate self-signed TLS and relay a valid app-layer challenge unless the signed transcript binds the observed TLS cert/fingerprint and expected peer endpoint."
  required_fix: "Add acceptance criteria/tests requiring certificate fingerprint pinning or explicit TLS channel binding in the signed handshake transcript. Reject if the WSS peer certificate fingerprint, endpoint, protocol version, node IDs, and instance IDs do not match the signed values."
- severity: high
  category: "credential-storage"
  confidence: high
  evidence: "State root is `~/.pi/coms-lan/` and app-specific signing keys live there, but T3/T4 acceptance criteria do not require restrictive file/directory permissions. On shared machines or loose Windows ACLs, hub private signing keys and authorized_keys could be read/modified by other local users/processes."
  required_fix: "Add implementation tasks and tests/checks for secure state creation: private key files owner-only where supported, no group/world writable state dirs on POSIX, Windows ACL best effort documented/enforced, atomic writes, and fail-closed if key/trust files are unexpectedly permissive where detectable."
- severity: medium
  category: "authorization-policy"
  confidence: high
  evidence: "Plan says trusted keys may send messages according to v1 policy and implements full prompt send/await, but does not define per-key authorization scope, allowed local agents/projects, or user-visible confirmation for prompt delivery. One imported public key appears to grant all remote messaging/listing privileges for every local Pi instance registered to the hub."
  required_fix: "Define and test an explicit v1 authorization policy: at minimum per-key allow/deny for remote agent listing and prompt send, scoped to local instance/project labels or an all-agents opt-in. Default imported keys should not silently gain blanket access unless the plan deliberately documents and tests that risk."
- severity: medium
  category: "audit-redaction"
  confidence: medium
  evidence: "Audit requirements omit prompt bodies and raw cwd paths, but acceptance criteria do not require redaction of error messages, peer-provided metadata, project labels, usernames/hostnames, or authorized key comments. Those fields can contain secrets or sensitive paths and are common log injection/redaction failure points."
  required_fix: "Add a central audit sanitization contract and tests with malicious/sensitive peer metadata: absolute paths, tokens, newlines, ANSI/control chars, key comments, and long values. Logs should be structured JSONL, length-bounded, control-character escaped, and contain only an allow-list of metadata fields."
- severity: low
  category: "archive-gate"
  confidence: medium
  evidence: "Final validation requires typecheck, Vitest, and `make check-pi-ci`, but no archive/preflight gate verifies generated runtime state, fixture private keys, audit logs, or captured packet/log artifacts are not accidentally added to git. Plan explicitly creates app keys and fixtures under Pi areas."
  required_fix: "Add F5/archive preflight checks: `git status --short`, scan staged/untracked plan files for private key headers, tokens, `.pi/coms-lan` runtime state, audit logs, and ensure any test private keys are clearly disposable fixtures in expected paths only."
