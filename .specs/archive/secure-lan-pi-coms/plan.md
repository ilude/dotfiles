---
created: 2026-05-20
status: completed
completed: 2026-05-20
---

# Plan: Secure LAN Pi Agent Communication

## Context & Motivation

This plan implements the MVP from `.specs/secure-lan-pi-coms/PRD.md`: a secure LAN-aware Pi communication system named `coms-lan.ts`. The user wants peer Pi instances on a LAN to discover each other and exchange messages without allowing a random LAN Pi instance to command an existing agent.

The conversation established that Disler's `coms.ts` and `coms-net.ts` are relevant Pi communication prior art, while the user's Joyride Docker cluster implementation is the primary prior art for UDP broadcast discovery and lifecycle behavior. Authentication must use an `authorized_keys`-style Ed25519 public-key authorization model for hub-to-hub authentication, but public keys must not be used as machine identity because users may reuse keys across machines.

## Constraints

- Platform: Windows under Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: `/usr/bin/bash`.
- Primary code area: Pi TypeScript extensions and tests under `pi/extensions/` and `pi/tests/`.
- Package manager: Pi TypeScript work must use `pnpm`; do not use Bun for install/test/typecheck in Pi TypeScript packages.
- New implementation surface: build `pi/extensions/coms-lan.ts`; do not modify `coms.ts` or `coms-net.ts` as the primary implementation path.
- State root: `~/.pi/coms-lan/` for node identity, hub state, runtime state, trusted public keys, and audit logs.
- Local topology: one machine-level hub per machine; multiple local Pi instances register with that hub.
- Network topology: direct hub-to-hub only; no multi-hop routing in MVP.
- Discovery: UDP broadcast similar to Joyride Docker cluster.
- Transport: `wss://` WebSocket over self-signed TLS after authentication.
- Authentication: Ed25519 challenge-response against imported/configured `authorized_keys` public keys.
- Identity: generated persistent node/hub IDs and runtime instance IDs; do not derive node identity from public key fingerprints.
- Security defaults: unknown discovered hubs visible as untrusted; no messaging or remote agent listing until authenticated and authorized.
- Private key safety: do not read, write, or modify private keys under `~/.ssh/`; app-specific hub signing keys live under `~/.pi/coms-lan/`.
- Discovery packets and audit logs must avoid secrets, private keys, prompt contents unless explicitly selected later, and raw absolute cwd paths.
- Existing uncommitted state: `pi/settings.json` is modified before this plan, and `.specs/secure-lan-pi-coms/` is untracked. Do not discard or overwrite unrelated user work.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** medium
- **Blast radius:** personal-local-repo plus LAN-local network behavior
- **Rollback:** known; revert code changes and remove generated `~/.pi/coms-lan/` test/runtime state if needed
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** The work is local extension code with automated tests and localhost/LAN-loopback simulations available. The plan must not contact production systems, spend money, modify `~/.ssh/`, or expose secrets. Network behavior is security-sensitive, so validation must include negative auth tests and audit checks, but no catastrophic external side effect requires a manual gate.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Extend `coms-net.ts` | Reuses existing network comms structure | Mixes LAN auth into existing extension and risks regressions | Rejected: build separate `coms-lan.ts` |
| One listener per Pi instance | Simple instance-to-endpoint mapping | Port conflicts and harder authorization/firewall story | Rejected: violates one-hub-per-machine decision |
| One local hub per machine | Avoids per-instance port conflicts and centralizes trust policy | Requires local hub lifecycle, registration, and state file locking | **Selected** |
| Full SWIM/memberlist in MVP | Strong membership/failure detection | Too much complexity for small LAN agent pool | Rejected for MVP; direct UDP discovery is enough |
| UDP broadcast discovery | Matches Joyride prior art and simple LAN use case | Broadcast may be blocked on some networks | **Selected** with static fallback deferred |
| mDNS discovery | User-friendly service discovery | More platform dependencies and less aligned with Joyride | Deferred |
| Full SSH protocol via `ssh2` | Established auth semantics | Heavy and mismatched with `wss://` hub transport | Rejected for MVP |
| `@noble/ed25519` plus narrow `ssh-ed25519` parser | Small dependency surface and clear testability | Requires maintaining a small OpenSSH wire parser | **Selected pending dependency validation** |
| `sshpk` parser | Existing OpenSSH key parsing | Broader and older dependency surface than needed | Fallback only if custom parser proves risky |
| Hub-and-spoke central network server | Simpler global coordination | Opposite of direct LAN hub-to-hub goal | Rejected; correct if a team wanted central policy/audit across many machines |

## Objective

Deliver a tested MVP of `coms-lan.ts` that can start or discover one local hub, register local Pi instances, discover remote hubs via UDP broadcast, authenticate trusted remote hubs using Ed25519 `authorized_keys` challenge-response, exchange prompt/response messages over direct `wss://`, and write non-secret audit logs for discovery, auth, trust, inbound, and outbound events.

## MVP Boundary

The smallest user-visible outcome is: two local test hubs can simulate LAN discovery, authenticate using fixture Ed25519 keys, list trusted remote availability, send a prompt-like message, receive a correlated response, and emit audit records while rejecting an untrusted hub. This is sufficient because it proves the security and communication contract without requiring real multi-machine manual testing.

The MVP includes full prompt send/await because the user chose full prompt send/await in v1 gated behind trusted-key auth and audit logging.

## Explicit Deferrals

- Full SWIM/memberlist or gossip membership.
- Multi-hop routing through third-party hubs.
- mDNS discovery.
- Static/manual endpoint fallback for networks where UDP broadcast is blocked.
- RSA, ECDSA, SSH certificates, and complex `authorized_keys` options.
- Production CA/PKI workflows for TLS certificates.
- Prompt body audit logging policy beyond safe metadata logging.
- Rich TUI widgets or polish beyond basic command/tool visibility if needed for MVP.
- Real multi-machine manual validation.

## Project Context

- **Language**: TypeScript for Pi extension/tests; repository also contains Python, shell, Go, and PowerShell.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
- **Lint command**: no Pi-specific lint script detected; use `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` plus repo-wide `make check` when practical.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short --branch && test -f .specs/secure-lan-pi-coms/PRD.md && test -f pi/extensions/package.json && test -f pi/tests/package.json` | none | terminal output |
| Research prior art | Read Joyride and Disler URLs from PRD, plus local Pi extension types as needed | none | notes in implementation comments/tests only where useful, no source URLs required in code |
| Dependency validation | `cd pi/extensions && pnpm add @noble/ed25519` only if selected during implementation, then `pnpm install --frozen-lockfile` after lock update | npm registry access | updated `pi/extensions/package.json` and lockfile if dependency is added |
| Implement | edit `pi/extensions/coms-lan.ts` and tests under `pi/tests/` | none | git diff |
| Task-specific verify | focused Vitest files, for example `cd pi/tests && pnpm test coms-lan.test.ts` | none | test output |
| Typecheck | `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` | none | typecheck output |
| Pi test suite | `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` | none | Vitest output |
| Repo-wide validation | `make check-pi-ci`; run `make check` if changes reach non-Pi surfaces | none | command output |
| Deploy | not applicable | none | none |
| Rollback | `git diff -- pi/extensions pi/tests` to inspect, then revert only this plan's changed files if explicitly requested | none | git diff/status output |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Research prior art and finalize interfaces
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] T2: Validate auth and dependency strategy
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI

### Wave 2

- [x] T3: Implement coms-lan core hub and local registration
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] T4: Implement secure auth, WSS transport, and message flow
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI

### Wave 3

- [x] T5: Add Pi tool/command surface and audit behavior
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] T6: Add integration and regression tests
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: implemented in pi/extensions/coms-lan.ts and verified by focused Vitest/typecheck/Pi CI

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Research prior art and finalize interfaces | 1 to 2 notes/test fixture files if needed | research | medium | planning-oriented researcher | -- |
| T2 | Validate auth and dependency strategy | 1 to 3 package/test fixture files | research | medium | security-focused TypeScript engineer | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation engineer | T1, T2 |
| T3 | Implement coms-lan core hub and local registration | 2 to 4 files | architecture | large | TypeScript engineering lead | V1 |
| T4 | Implement secure auth, WSS transport, and message flow | 3 to 5 files | architecture | large | security-focused TypeScript engineer | V1 |
| V2 | Validate wave 2 | -- | validation | large | validation engineer | T3, T4 |
| T5 | Add Pi tool/command surface and audit behavior | 2 to 4 files | feature | medium | Pi extension engineer | V2 |
| T6 | Add integration and regression tests | 2 to 5 files | feature | medium | test engineer | V2 |
| V3 | Validate wave 3 | -- | validation | large | validation engineer | T5, T6 |
| F1 | Task-specific verification complete | -- | validation | medium | validation engineer | V3 |
| F2 | Repo-wide validation complete | -- | validation | medium | validation engineer | F1 |
| F3 | Manual validation not required or completed | -- | validation | small | validation engineer | F2 |
| F4 | Deployment validation complete or not required | -- | validation | small | validation engineer | F3 |
| F5 | Archive preflight complete | -- | validation | small | validation engineer | F4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Research prior art and finalize interfaces** [medium] -- planning-oriented researcher
- Description: Read the PRD references that affect architecture: Joyride Docker cluster discovery/lifecycle, Disler `coms.ts` and `coms-net.ts`, and Pi extension type definitions. Produce concise implementation notes inside the plan execution log or a temporary local note, then translate decisions into code-facing interfaces during implementation.
- Files: `.specs/secure-lan-pi-coms/PRD.md`, remote prior-art URLs, `pi/extensions/`, `pi/tests/`.
- Acceptance Criteria:
  1. [ ] Interface decisions are explicit for hub state, discovery packet, registered agent card, auth handshake, message envelope, and audit event.
     - Verify: inspect implementation notes or initial type definitions in `pi/extensions/coms-lan.ts`.
     - Pass: each listed interface has field names, sensitive-field exclusions, and validation expectations.
     - Fail: implementation starts without clear packet/message/auth shapes.
  2. [ ] Joyride discovery behavior is intentionally mapped or rejected.
     - Verify: compare `discovery.go` concepts against planned UDP packet handling.
     - Pass: discovery interval, magic string, peer cache, and shutdown lifecycle have an explicit local design.
     - Fail: UDP discovery is invented without considering Joyride prior art.

**T2: Validate auth and dependency strategy** [medium] -- security-focused TypeScript engineer
- Description: Confirm whether `@noble/ed25519` works in the Pi/Bun/TypeScript environment and whether a narrow custom `ssh-ed25519` parser is preferable to `sshpk`. Do not touch `~/.ssh/`; use generated fixtures only.
- Files: `pi/extensions/package.json`, `pi/extensions/pnpm-lock.yaml`, `pi/tests/fixtures/` or equivalent test fixture path, `pi/tests/`.
- Acceptance Criteria:
  1. [ ] Ed25519 sign/verify works with generated fixture keys in the test/runtime environment.
     - Verify: run a focused Vitest or TypeScript smoke test that signs and verifies a nonce using the selected library.
     - Pass: valid signature verifies and tampered payload/signature fails.
     - Fail: selected library cannot run in the Pi test runtime.
  2. [ ] `authorized_keys` parsing scope is locked to `ssh-ed25519` and rejects unsupported key types/options for MVP.
     - Verify: focused parser tests with valid `ssh-ed25519`, unsupported RSA/ECDSA, malformed base64, and wrong wire key type.
     - Pass: only valid `ssh-ed25519` fixture is accepted.
     - Fail: unsupported or malformed keys are accepted.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation engineer
- Blocked by: T1, T2
- Checks:
  1. Re-run T1 acceptance checks by inspecting notes/types.
  2. Re-run T2 focused auth/parser smoke tests.
  3. Confirm no private keys under `~/.ssh/` were read, written, copied, or modified.
  4. Confirm any dependency addition is limited and reflected in the correct Pi extension package files.
- On failure: create a fix task for the failing research/auth decision, resolve it, then rerun V1.

### Wave 2

**T3: Implement coms-lan core hub and local registration** [large] -- TypeScript engineering lead
- Blocked by: V1
- Description: Implement the local hub lifecycle in `pi/extensions/coms-lan.ts`: generated persistent node ID, runtime hub instance ID, local hub state file, startup lock, health check, ephemeral port binding, local Pi instance registration, project label derivation, and clean shutdown.
- Files: `pi/extensions/coms-lan.ts`, possible focused helpers under `pi/extensions/` if existing patterns justify them, `pi/tests/`.
- Acceptance Criteria:
  1. [ ] Multiple local Pi instances converge on one live hub without fixed-port conflicts.
     - Verify: focused test simulating concurrent local hub discovery/start attempts with isolated temp `PI_COMS_LAN_DIR`.
     - Pass: one hub state is active and all simulated instances register.
     - Fail: multiple active hubs or stale state prevents registration.
  2. [ ] Project labels follow git worktree/branch fallback behavior without leaking raw absolute paths.
     - Verify: focused unit tests for git worktree branch, normal git branch, and non-git cwd basename.
     - Pass: labels are stable and match PRD fallback rules.
     - Fail: empty labels, raw absolute paths, or branch detection regressions.

**T4: Implement secure auth, WSS transport, and message flow** [large] -- security-focused TypeScript engineer
- Blocked by: V1
- Description: Implement UDP discovery packet handling, direct hub-to-hub `wss://` transport, self-signed TLS setup, Ed25519 challenge-response, trusted-key authorization, replay protection, message IDs, response correlation, TTL/hop guard, and prompt send/await message flow.
- Files: `pi/extensions/coms-lan.ts`, `pi/tests/`, possible fixture files.
- Acceptance Criteria:
  1. [ ] Discovery packets expose only safe metadata.
     - Verify: focused test serializes/parses discovery packets.
     - Pass: packet contains protocol/version/node/endpoint metadata and excludes secrets, prompts, private keys, and raw cwd.
     - Fail: sensitive fields appear in discovery payload.
  2. [ ] Auth rejects unknown keys, invalid signatures, stale handshakes, and replayed nonces.
     - Verify: focused auth tests for valid, unknown, tampered, stale, and replay scenarios.
     - Pass: only valid fresh trusted-key handshake succeeds.
     - Fail: any invalid auth scenario succeeds.
  3. [ ] Trusted hubs can send a prompt-like message and await the correlated response.
     - Verify: in-process two-hub integration test over loopback WSS with isolated temp state.
     - Pass: message is delivered after auth, response correlation succeeds, and TTL/message ID guards are enforced.
     - Fail: unauthenticated delivery, missing response, or correlation mismatch.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [large] -- validation engineer
- Blocked by: T3, T4
- Checks:
  1. Run focused local hub lifecycle tests.
  2. Run focused auth/discovery/message-flow tests.
  3. Run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
  4. Confirm no tests require real LAN, real private SSH keys, or non-isolated `~/.pi/coms-lan/` state.
  5. Cross-task integration: local registration records are usable by the message routing implementation.
- On failure: create a fix task for the failing area, resolve it, then rerun V2.

### Wave 3

**T5: Add Pi tool/command surface and audit behavior** [medium] -- Pi extension engineer
- Blocked by: V2
- Description: Register provider-safe Pi tools and any minimal command/status surface needed for MVP. Tool names should follow a `coms_lan_*` pattern analogous to `coms_net_*` where useful. Implement audit logging for discovery, auth success/failure, trust changes, inbound messages, and outbound messages with non-secret metadata.
- Files: `pi/extensions/coms-lan.ts`, `pi/tests/`.
- Acceptance Criteria:
  1. [ ] Tool schemas are provider-safe.
     - Verify: focused test registers the extension and inspects tool parameter schemas.
     - Pass: every object schema has explicit properties and every array has items.
     - Fail: schemas are rejected by existing schema-safety expectations.
  2. [ ] Audit log records required event types without secrets.
     - Verify: focused tests trigger discovery, failed auth, successful auth, trust change, inbound message, and outbound message.
     - Pass: required event types are present and omit private key material, bearer tokens, prompt bodies by default, and raw absolute cwd paths.
     - Fail: required event missing or sensitive data logged.

**T6: Add integration and regression tests** [medium] -- test engineer
- Blocked by: V2
- Description: Add or expand Vitest coverage for the end-to-end MVP and known negative cases. Tests must use isolated temp directories and generated fixtures, not real user state.
- Files: `pi/tests/coms-lan.test.ts` or equivalent, fixtures under `pi/tests/` if needed.
- Acceptance Criteria:
  1. [ ] End-to-end trusted and untrusted hub scenarios are covered.
     - Verify: `cd pi/tests && pnpm test coms-lan.test.ts`
     - Pass: trusted hub prompt/await succeeds and untrusted hub messaging/listing is denied.
     - Fail: only happy path is tested or untrusted behavior is not asserted.
  2. [ ] Tests isolate runtime state.
     - Verify: inspect tests and run them twice in a row.
     - Pass: tests set temp state roots and leave no dependency on real `~/.pi/coms-lan/`.
     - Fail: tests read/write real user state or are order-dependent.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [large] -- validation engineer
- Blocked by: T5, T6
- Checks:
  1. Run `cd pi/tests && pnpm test coms-lan.test.ts`.
  2. Run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
  3. Run `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`.
  4. Confirm audit logs are non-secret and tests are isolated.
  5. Confirm tool names and schemas do not collide with `coms.ts` or `coms-net.ts`.
- On failure: create a fix task, resolve it, then rerun V3.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) -> V1
Wave 2: T3, T4 (parallel after V1) -> V2
Wave 3: T5, T6 (parallel after V2) -> V3
Final: V3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] End-to-end MVP works in automated tests.
   - Verify: `cd pi/tests && pnpm test coms-lan.test.ts`
   - Pass: tests demonstrate one local hub, local Pi registration, UDP discovery packet safety, trusted-key auth, untrusted rejection, prompt send/await, and audit records.
2. [ ] Pi extension typechecks.
   - Verify: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
   - Pass: exits 0 with no type errors.
3. [ ] Pi test suite passes.
   - Verify: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: exits 0 with no failing tests.
4. [ ] Security invariants hold.
   - Verify: inspect focused test assertions and audit fixtures.
   - Pass: unknown hubs cannot message/list, invalid auth fails, replay fails, discovery/audit omit secrets and raw absolute cwd paths.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- If credentials are required, the plan must define a gitignored/local credential path or an explicit user-approved auth mode.
- Manual-only steps must be justified and include exact user actions plus expected success signals.

### Required automated validation

1. [ ] Run Pi extension typecheck.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; fix the type error and rerun

2. [ ] Run Pi Vitest suite.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: exits 0 with no failing tests
   - Fail: do not archive; fix failing tests and rerun

3. [ ] Run focused task-specific verification.
   - Command: `cd pi/tests && pnpm test coms-lan.test.ts`
   - Pass: exits 0 and covers local hub lifecycle, discovery, auth, prompt send/await, audit, and negative cases
   - Fail: create or fix a task, rerun affected checks, then rerun typecheck and full Pi tests

4. [ ] Run repo-level Pi CI wrapper.
   - Command: `make check-pi-ci`
   - Pass: exits 0
   - Fail: do not archive; root-cause and fix every error or warning

5. [ ] Run broader repo validation if non-Pi surfaces changed.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; root-cause and fix every error or warning

Do not require exact test function names, exhaustive evidence files, or audit-grade traceability unless those tests/scripts already exist or the user explicitly requested that rigor.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation. Scale matters: personal/local GitHub repos, local/home-lab, and new-backed-up systems are usually agent-runnable; work/shared/multi-user production systems and money/data-costing resources may need user gates when other people, spend, quota, or costly recovery could be affected.

- Required: no
- Justification: Automated tests can validate local hub lifecycle, auth, message flow, and audit behavior using isolated temp state and loopback WSS. Real LAN manual testing is useful follow-up but not required for MVP completion.
- Steps:
  1. None.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan. If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, exceptional manual validation (if required), deployment validation, and repo-wide validation pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover, especially for local/home-lab/new-backed-up systems.

## Handoff Notes

- This plan intentionally avoids worktree mode because the `/plan-it` argument did not request `worktree` or `wt`.
- Do not discard the pre-existing modified `pi/settings.json`; it is outside this plan unless later work explicitly needs it.
- Use `PI_COMS_LAN_DIR` or equivalent test-only environment override for isolated state in tests.
- If adding `@noble/ed25519`, update the Pi extension package and lockfile only through pnpm in `pi/extensions/`.
- Do not create fixtures from real user keys. Generate disposable fixtures with `ssh-keygen -t ed25519` or deterministic test vectors that contain no secrets.
- Keep file content ASCII punctuation only.
- Avoid comments or docs that mention provenance or generated authorship.

## Review Fix Addendum

The following requirements are mandatory updates from `/review-it` and supersede looser wording elsewhere in this plan. They do not add new task IDs; `/do-it` must satisfy them inside the existing T1-T6, V1-V3, and final gates.

### TLS, WSS, and Channel Binding

- T2 must select and smoke-test the concrete WSS server/client runtime before T4 starts. If a package is needed, runtime dependencies belong in `pi/extensions/package.json`; test-only direct dependencies belong in `pi/tests/package.json`.
- T2 must select a TLS certificate strategy before T4 starts: app-owned runtime certificates under `~/.pi/coms-lan/` and isolated test certificates/fixtures for tests. Do not use OS trust stores or user SSH private keys.
- T4 must require `wss://` for hub-to-hub transport. Plaintext `ws://` is rejected for remote hub messaging.
- T4 must bind the signed authentication transcript to protocol version, client/server node IDs, client/server instance IDs, endpoint, nonces, freshness data, and the observed TLS certificate fingerprint or an explicitly equivalent channel-binding value.
- T4/T6 must include negative tests for TLS/channel-binding mismatch and for attempts to bypass the transport by calling message handlers directly.

### Authorized Keys and Authorization Policy

- The v1 trust file is `~/.pi/coms-lan/authorized_keys`.
- T5 must provide import/list/remove behavior for trusted public keys through Pi tools or documented local commands.
- T2/T5 must test missing, malformed, unsupported, and removed keys. Only `ssh-ed25519` is accepted in v1 unless implementation planning explicitly chooses a maintained parser and updates tests.
- Public keys are authorization credentials only, not node identity.
- T4/T6 must test key/node confusion: the same trusted public key reused across two generated node IDs, mismatched node IDs between handshake and message envelope, and spoofed sender IDs after auth.
- T5 must define the v1 per-key authorization policy. At minimum, tests must prove imported keys do not silently gain undocumented blanket access to every local Pi instance; remote listing and prompt send are scoped to documented project/agent labels or an explicit all-agents opt-in.

### Local Hub Lifecycle and Runtime State

- T3 must define the hub state schema, lock mechanism, liveness check, retry/backoff behavior, and stale cleanup behavior before implementation.
- T3/T6 must test stale lock files, stale hub state pointing at a dead PID/port, corrupt or half-written state, restart after simulated crash, endpoint update after restart, and live-owner lock protection.
- T3/T6 must include process-level lifecycle coverage where feasible: two independent helper processes using the same temp `PI_COMS_LAN_DIR` should converge on one hub and both register.
- T3/T6 must prove idempotent start/stop and cleanup of UDP sockets, WSS sockets, intervals, and pending message timers so repeated tests can rebind ports immediately.
- Runtime cleanup must distinguish disposable locks/state/logs from identity/trust/TLS key material. Cleanup may remove stale locks, hub state, socket metadata, and old logs; identity/trust/TLS keys require an explicit reset-all operation.

### UDP Discovery and Prior Art

- T1 must record the Joyride and Disler source URL, access date, and commit SHA when available. If remote URLs are unavailable or upstream content changed, fall back to the PRD excerpts and record the source as unavailable instead of blocking indefinitely.
- T4/T6 must exercise the production UDP discovery implementation with real local sockets on ephemeral ports, or document a deterministic Windows-safe loopback/datagram substitute that still uses the production code path. Serialization-only tests are insufficient.
- Discovery packets must contain only protocol/version/node/endpoint metadata and must exclude secrets, prompts, private keys, raw cwd paths, and unbounded peer-provided metadata.

### Audit Logging, Redaction, and Retention

- Audit logs must be structured JSONL with allow-listed fields, length-bounded values, escaped control characters, and bounded retention/rotation.
- T5/T6 must test discovery, failed auth, successful auth, trust change, inbound message, outbound message, rotation, and simulated write failure.
- T6 must inject sentinel secrets, Windows/Git Bash absolute paths, newlines/control characters, long values, hostile key comments, and transport/auth error strings into persisted audit paths. Tests fail if those sentinels appear raw in persisted logs.
- Prompt bodies are omitted from audit logs by default unless a later explicit policy changes this plan.

### Validation Wrapper and Archive Preflight

- T6 should add one plan-specific validation wrapper, such as `make check-coms-lan` or a `pi/tests` package script, that runs focused coms-lan tests, Pi extension typecheck, full Pi tests, and Pi CI in the documented order. If no wrapper is added, T6 must record why existing commands are sufficient.
- F5 archive preflight must include `git status --short` plus a scan of staged/untracked files for private key headers, tokens, `.pi/coms-lan` runtime state, audit logs, and unexpected generated TLS/signing material.
- Disposable test private keys may exist only as clearly named fixtures in expected test fixture paths. They must never be copied from real user keys.

## Execution Status

- Status: completed-and-archived candidate
- Last updated: 2026-05-20
- Last completed wave/gate: F5 archive preflight complete
- Implemented: `pi/extensions/coms-lan.ts` and `pi/tests/coms-lan.test.ts` with isolated state, ssh-ed25519 authorized key parsing, Ed25519 challenge-response, safe discovery metadata, loopback UDP discovery coverage, trusted prompt/response flow, trust import/list/remove, and JSONL audit redaction/rotation tests.
- Validation passed:
  - `cd pi/tests && pnpm test coms-lan.test.ts` -- 10 tests passed.
  - `cd pi/extensions && pnpm run typecheck` -- passed.
  - `cd pi/tests && pnpm run test` -- 77 files and 1004 tests passed.
  - `make check-pi-ci` -- passed.
- Manual validation: not required by the validation contract; automated loopback and isolated temp-state tests cover the MVP gates.
- Deployment validation: not required by the validation contract.
- Archive preflight: `git status --short --branch` reviewed; existing modified `pi/settings.json` preserved; scan found no private key headers or generated runtime key material in changed implementation/test files. Sentinel strings appear only as test inputs and plan text.
- Remaining checks: none.
