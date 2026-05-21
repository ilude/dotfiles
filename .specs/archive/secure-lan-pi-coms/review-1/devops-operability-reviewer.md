---
reviewer: devops-operability-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "stale-state-locks"
  confidence: high
  evidence: "T3 requires a local hub state file, startup lock, health check, ephemeral port binding, and clean shutdown, but the acceptance criteria only assert that simulated concurrent starts converge on one hub. There is no required behavior for stale lock files, stale state pointing at a dead PID/port, half-written state files, or crashed hubs leaving `~/.pi/coms-lan/` runtime files behind. Under the adversarial partial-failure case, later Pi sessions can block on a dead lock or attempt to register with a nonexistent listener."
  required_fix: "Add explicit stale runtime recovery requirements and tests: atomic state writes, PID/process and port liveness checks, lock acquisition timeout, stale lock/state removal after verified-dead owner, corrupt state rejection/rewrite, and a second-start-after-crash test using isolated `PI_COMS_LAN_DIR`."

- severity: high
  category: "listener-lifecycle"
  confidence: high
  evidence: "The plan creates UDP discovery listeners and WSS hub listeners, but only says `clean shutdown`; no validation gate proves sockets are closed, timers are stopped, or background discovery loops are cancelled. T4/T6 integration tests may pass while leaving listeners active, which can break subsequent Pi sessions/tests through lingering ports or duplicate UDP broadcasts."
  required_fix: "Define a hub lifecycle contract with idempotent start/stop, tracked disposables for UDP sockets, WSS server/client sockets, intervals, and pending message timers. Add tests that start/stop hubs repeatedly in one process, verify ports can be rebound immediately, and assert no active handles/listeners remain after shutdown."

- severity: medium
  category: "port-binding-and-endpoint-validity"
  confidence: high
  evidence: "T3 says `ephemeral port binding` and T4 says discovery advertises endpoint metadata, but the plan does not require binding to loopback vs LAN interfaces intentionally, detecting bind failures, validating that advertised host/port are reachable, or handling endpoint changes after restart. A stale advertised ephemeral endpoint or wrong interface selection will make peers authenticate/connect to dead or unintended listeners."
  required_fix: "Add implementation criteria for deterministic bind policy, explicit bind failure errors, state update after successful bind only, advertised endpoint validation, and restart tests showing the old endpoint is retired and the new endpoint is discoverable. Document Windows/Git Bash firewall expectations and fail with an actionable diagnostic when inbound WSS/UDP is blocked."

- severity: medium
  category: "audit-log-retention"
  confidence: high
  evidence: "The plan requires audit logs for discovery, auth, trust, inbound, and outbound events under `~/.pi/coms-lan/`, but no task or validation covers rotation, retention, maximum record size, disk-full handling, or cleanup commands. Discovery/auth failures can generate unbounded logs on a noisy LAN and eventually break hub startup or normal Pi usage."
  required_fix: "Add log rotation/retention requirements: JSONL max record size, file size cap, rotated file count or age retention, bounded peer-provided fields, explicit behavior on write failure, and tests that force rotation and disk/write errors via temp directories. Provide a cleanup command that removes old logs without deleting identity/trust material."

- severity: low
  category: "rollback-cleanup-operator-commands"
  confidence: high
  evidence: "Rollback is described as reverting code and removing generated `~/.pi/coms-lan/` state if needed, but there are no exact safe cleanup commands and no distinction between disposable runtime state, audit logs, trusted public keys, node identity, TLS certs, and app signing keys. An operator trying to recover from partial failure may either leave stale state/listeners or delete trust/identity material unintentionally."
  required_fix: "Add documented operator commands or tools for `status`, `stop`, `cleanup-runtime`, `rotate-logs`, and `reset-all`, with dry-run output and clear preservation/deletion semantics. Include validation that cleanup removes stale locks/state and does not remove identity/trust files unless `reset-all` is explicitly requested."
