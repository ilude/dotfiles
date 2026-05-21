---
date: 2026-05-20
status: synthesis-complete
---

# Review: Secure LAN Pi Agent Communication

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness and explicitness reviewer | Mandatory standard reviewer for hidden assumptions and execution gaps | Assume a fresh /do-it session will lack conversation context | `.specs/secure-lan-pi-coms/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Adversarial auth and operational safety reviewer | Mandatory standard reviewer for realistic abuse and safety failure modes | Assume LAN peers and local processes are hostile within realistic bounds | `.specs/secure-lan-pi-coms/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope pressure reviewer | Mandatory standard reviewer for overbuild and smaller alternatives | Assume the plan's MVP is too broad until proven otherwise | `.specs/secure-lan-pi-coms/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript runtime and module-compatibility reviewer | The plan adds a Pi TypeScript extension using crypto, TLS, WebSocket, pnpm, and provider schemas | Assume Node/Pi/Bun runtime gaps and misplaced dependencies will break execution | `.specs/secure-lan-pi-coms/review-1/typescript-runtime-reviewer.md` |
| qa-engineer | qa-engineer | Security-sensitive integration test realism reviewer | The plan relies on automated proof of auth, transport, lifecycle, and audit behavior | Assume tests will mock too much and miss real sockets/process behavior | `.specs/secure-lan-pi-coms/review-1/qa-verification-reviewer.md` |
| devops-pro | devops-pro | Local service lifecycle and operational safety reviewer | The plan creates local hubs, state files, locks, sockets, TLS material, and logs | Assume partial failures leave stale listeners/state that break later sessions | `.specs/secure-lan-pi-coms/review-1/devops-operability-reviewer.md` |

## Standard Reviewer Findings
### reviewer
- Missing TLS certificate generation/storage/validation and MITM/channel-binding details for self-signed WSS.
- Missing exact trusted-key file path, import/list/remove surface, permissions, and trust-state tests.
- Missing concrete local hub locking, stale state, liveness, and Windows/MSYS path behavior.
- Runtime validation covers Ed25519 but not UDP sockets, WSS, TLS, or WebSocket dependencies.
- Remote prior-art research is not pinned or given an offline fallback.

### security-reviewer
- Self-signed TLS plus app-layer challenge-response lacks certificate fingerprint/channel binding.
- `~/.pi/coms-lan/` signing keys/trust files lack file permission and atomic write requirements.
- Trusted keys appear to grant blanket access to all local agents/projects.
- Audit redaction does not cover peer metadata, errors, key comments, control characters, or long values.
- Archive preflight does not scan for generated keys/runtime state/audit logs.

### product-manager
- MVP is broad; should be milestone-gated even if full v1 remains the target.
- WSS/self-signed TLS duplicates some Ed25519 trust complexity unless confidentiality/channel binding is explicit.
- Custom `authorized_keys` parser may be avoidable or should be constrained further.
- Validation sequence needs a wrapper to reduce inconsistent execution.
- Static endpoint fallback may be simpler than UDP for real-network diagnostics.

## Additional Expert Findings
### typescript-pro
- No concrete WebSocket server/client dependency or runtime API is selected.
- No certificate generation API/dependency or fixture strategy is named.
- Dependency placement between `pi/extensions` runtime and `pi/tests` test-only packages is ambiguous.

### qa-engineer
- UDP discovery can pass as serialization-only without binding real sockets.
- WSS tests can bypass the actual network transport path unless real listeners are required.
- Auth tests do not cover public-key reuse across node IDs or spoofed sender IDs.
- Hub lock behavior needs process-level testing, not just single-process simulation.
- Audit tests need sentinel secret/path fixtures against persisted logs.

### devops-pro
- Stale locks/state, half-written state, and crashed hubs are not specified.
- Socket/timer shutdown and active-handle cleanup are not validated.
- Bind policy and advertised endpoint reachability are under-specified.
- Audit logs lack rotation/retention/write-failure behavior.
- Rollback/cleanup lacks safe operator commands and deletion boundaries.

## Suggested Additional Reviewers
- typescript-pro -- relevant because Pi extension runtime, package placement, WSS/TLS dependencies, and TypeScript provider schemas are central risks.
- qa-engineer -- relevant because MVP success depends on automated security and transport tests that can easily become false positives.
- devops-pro -- relevant because one local hub per machine creates service lifecycle, state, socket, lock, and cleanup risks.

## Bugs (must fix before execution)
1. TLS/WSS and authentication are under-specified: the plan lacks certificate generation/storage, cert fingerprint or channel binding, selected WebSocket runtime, and tests that reject plaintext or MITM-style transcript mismatch.
2. Trusted-key configuration is under-specified: the plan lacks exact `authorized_keys` path, import/list/remove behavior, permissions, atomic writes, and tests for missing/invalid trust files.
3. Local hub lifecycle is under-specified: the plan lacks concrete stale lock/state recovery, process-level concurrent startup, socket/timer cleanup, and restart endpoint retirement tests.
4. Automated validation can be false-positive: the plan can pass with mocked discovery/WSS/auth paths instead of real UDP sockets, real localhost WSS listeners, identity/key-confusion negative tests, and persisted audit scans.
5. Dependency/runtime validation is incomplete: the plan validates `@noble/ed25519` but not WebSocket, TLS certificate strategy, UDP socket behavior, or deterministic dependency placement across `pi/extensions` and `pi/tests`.

## Hardening
1. Add audit sanitization and retention requirements: structured JSONL, allow-listed fields, length bounds, escaped control characters, rotation/retention, and write-failure behavior.
2. Add archive preflight scans for private-key headers, tokens, runtime `.pi/coms-lan` state, audit logs, and accidental fixture leakage.
3. Add milestone/checkpoint language so `/do-it` can implement in a controlled sequence without confusing the full product slice with an unbounded MVP.
4. Add a validation wrapper target or script requirement to consolidate focused tests, typecheck, full Pi tests, and Pi CI.
5. Add prior-art fallback guidance when remote URLs are unavailable or upstream content changes.

## Simpler Alternatives / Scope Reductions
1. Consider a dedicated `trusted_keys.json` or raw-base64 public-key format if full `authorized_keys` parsing becomes the blocking complexity; defer broader OpenSSH compatibility.
2. Keep WSS in v1 only because the PRD requires it, but explicitly justify it as confidentiality plus channel-bound transport rather than redundant identity proof.
3. Keep UDP broadcast in v1 due to Joyride alignment, but add a static endpoint diagnostic/fallback decision checkpoint instead of pretending broadcast always works.

## Automation Readiness
- Agent-runnable operational steps: mostly present, but needed concrete dependency/runtime smoke tests, validation wrapper, and real socket/process tests.
- Credential/auth flow clarity: incomplete before fixes; must define app-specific keys, `~/.pi/coms-lan/authorized_keys`, key import/list/remove, permissions, and no `~/.ssh/` private key reads.
- Evidence and archive gates: incomplete before fixes; must include persisted log scans, `git status`, and private-key/token/runtime-state checks.
- Manual-only steps and justification: no manual gate is required if real LAN testing remains deferred and automated loopback/process tests cover MVP behavior.

## Contested or Dismissed Findings
1. Product-manager recommendation to remove WSS from MVP is dismissed because the PRD explicitly requires `wss://` after auth. The plan should clarify and test it, not defer it.
2. Product-manager recommendation to defer UDP broadcast is dismissed because Joyride-style UDP discovery is a core user requirement. A static fallback can be a hardening/checkpoint item, not a replacement.
3. Full SWIM/memberlist remains deferred; no reviewer provided evidence it is required for the MVP.

## Verification Notes
1. TLS/WSS/auth underspecification verified by reading `Objective`, `T4`, and `T2`: WSS is required but no certificate generation, WebSocket dependency, or channel-binding acceptance criterion exists.
2. Trusted-key underspecification verified by `Constraints`, `T2`, and `T4`: `authorized_keys` is named conceptually but no path/import/tool/permission semantics are specified.
3. Local hub lifecycle gaps verified by `T3` and `V2`: startup lock/state and clean shutdown are named, but stale/corrupt state, active handle cleanup, and process-level concurrency are absent.
4. False-positive validation risk verified by `T4`, `T6`, and `Success Criteria`: tests can be in-process/serialization-focused without requiring actual UDP sockets and localhost WSS listeners.
5. Dependency/runtime gaps verified by `Automation Plan` and `T2`: only `@noble/ed25519` add/validation is explicit; WebSocket/TLS/cert strategy is not.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/secure-lan-pi-coms/review-1/reviewer.md` | read | artifact usable |
| security-reviewer | `.specs/secure-lan-pi-coms/review-1/security-reviewer.md` | read | artifact usable |
| product-manager | `.specs/secure-lan-pi-coms/review-1/product-manager.md` | read | artifact usable |
| typescript-pro | `.specs/secure-lan-pi-coms/review-1/typescript-runtime-reviewer.md` | read | artifact usable |
| qa-engineer | `.specs/secure-lan-pi-coms/review-1/qa-verification-reviewer.md` | read | artifact usable |
| devops-pro | `.specs/secure-lan-pi-coms/review-1/devops-operability-reviewer.md` | read | artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unavailable | 6/6 reviewers succeeded; per-reviewer timing unavailable |
| Artifact reads | unavailable | all expected reviewer artifacts read |
| Recovery calls | not run | no missing/unusable artifacts |
| Verification | unavailable | plan read/static inspection used |
| Synthesis | unavailable | `.specs/secure-lan-pi-coms/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/secure-lan-pi-coms/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed after plan edit; required headings present exactly once and checklist items remain unchecked
- Standalone-readiness result: STANDALONE READY; `.specs/secure-lan-pi-coms/review-1/standalone-readiness.md` reported zero blocker findings
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/secure-lan-pi-coms/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply plan fixes before `/do-it`.
- After auto-apply and standalone readiness pass, execute via `/do-it .specs/secure-lan-pi-coms/plan.md`.
