---
created: 2026-09-09
status: completed
completed: 2026-09-09
---

# Preserve Onclave deliveries across handling failures

## Goal and scope

User-authorized planning for receiver deduplication/retry correctness and transport-neutral task-status validation. Preserve inert informs, correlated status behavior, bounded session-local delivery state and no duplicate turn injection within retained dedup history.

This belongs to the default-profile workstream because `pi/profiles/default/extensions/onclave-pi.ts` loads the shared adapter from `modules/onclave`. Fix the owning adapter, not a profile-local duplicate. Legacy and any other consumers receive the same shared contract changes; that compatibility impact does not authorize legacy-specific customization, migration or a separate legacy test campaign.

Non-goals: broker redesign, durable exactly-once processing, new disposition API, global correlation-store cleanup, service deployment, loader expansion, live peer messages or broad protocol migration. No rollback work.

Authorization: plan creation only. Separate execution authorization includes local task worktrees, commits and merges into the recorded targets. Push and deployment are separate. Module publication is required before the parent pins a new module commit; report that integration boundary rather than publishing without authorization.

## Context for a fresh session

This coordinating plan belongs to dotfiles. Implementation paths below are relative to `modules/onclave/` unless explicitly labeled dotfiles. Read both repositories' current `AGENTS.md` files, Onclave `README.md`, `docs/extensions/onclave-pi/{PRD,status,implementation-plan}.md`, and the default planning/testing skills.

Sources: `extensions/onclave-pi/src/onclave-pi.ts`, `src/lib/{delivery,dedup,correlation,http-client}.ts` under that adapter; `packages/envelope/src/{a2a,amqp,index}.ts`; `services/core/src/{agent-delivery,rpc}.ts` and task-store creation behavior reached from RPC. Tests: adapter `tests/{dedup-summary,communication,extension}.test.ts`, envelope `tests/amqp.test.ts`, core `tests/agent-delivery.test.ts`.

Verified 2026-09-09:
- IDs enter `SeenIds` before processing. `consume()` defaults to reject and disposes in `finally`, including on failures.
- Explicit reject is `nack(..., false, false)`: dead-letter/no requeue. Lease expiry requeues; default lease is 30 seconds. Therefore the earlier review's assumption that rejection causes retry was incorrect.
- Correlation changes can resolve waiters before display/turn injection. A single undifferentiated completed bit is insufficient if a later effect fails.
- HTTP task statuses are object-checked then cast. AMQP reconstruction validates some headers but coerces some optional values. One parser should own the complete normalized contract.
- No tests or live broker/model calls ran during this planning task.

### Worktrees and repository integration

- Dotfiles proposed worktree `../.dotfiles-worktrees/onclave-delivery-reliability`, branch `fix/onclave-delivery-reliability`, merge target dotfiles `main`; changes limited to coordination docs/changelog and final gitlink.
- Onclave proposed independent worktree `../.dotfiles-worktrees/onclave-delivery-reliability-module` (relative to dotfiles root), branch `fix/pi-delivery-reliability`; merge target Onclave `feature/v2-broker-core`, tracking `origin/feature/v2-broker-core`.
- Current canonical Onclave checkout is detached at `fcc6868`, equal to the locally known remote-tracking tip. Local `feature/v2-broker-core` is `ceed8c3`, verified an ancestor, not a divergent branch. No branch was changed during planning.
- At authorized execution preflight, inspect current work/status/remote and restore the canonical checkout to the required tracking branch with fast-forward-only reconciliation if still safe. Pull within the module before any parent pin update. Do not force, reset, rebase/amend published commits or switch to another target branch. If intervening divergence/dirty work prevents this, preserve it and report the concrete blocker.
- Commit/integrate the module first. Without push authorization, stop publication-dependent parent integration with module implementation/validation recorded separately. Never pin an unpublished module commit or mark the coordinating plan completed prematurely.

Planning profile: default verified by orchestrator environment. The target user-facing behavior is default's Onclave integration. Execution uses Onclave's own pnpm package and focused adapter/envelope tests because the implementation is shared; both Pi profile loaders remain thin and unchanged. Preserve the shared API for other consumers without expanding into legacy-profile work. Preserve all existing open dotfiles plans and module work.

## Decisions and contracts

- Use a bounded per-ID delivery record with explicit completed effects, rather than recording an ID as done on receipt. Key message/status domains separately if needed to avoid collisions. A concurrent pending duplicate must not be acknowledged as fully processed.
- Track task preparation, correlation application and Pi delivery sufficiently to resume only missing effects. Successful correlation must not disappear from retry decisions; successful turn/inert/status injection must not repeat merely because audit or ACK later fails.
- Preserve the dedup retention bound (currently 1,000 IDs) and never evict an active record to admit another. Under capacity pressure leave the new delivery unacknowledged for the existing lease mechanism; no unbounded local backlog. The existing finite dedup horizon is not a durable exactly-once guarantee.
- On transient failure before required delivery effects complete, do not issue terminal reject. Leave the delivery for the existing lease-expiry redelivery and propagate a bounded error through existing connection handling. Do not add a busy retry loop, schedule prompts, or sleep until expiry. For completed delivery with audit failure, retain delivered state and acknowledge without replay; report audit failure without turning a successful injection into a second turn. An ACK transport failure retains completed state for duplicate acknowledgement.
- Malformed protocol payloads remain invalid, not permissively coerced into retryable valid work. Use one envelope parser for protocol version, required identities/routes/state/timestamp and supported optional fields. Preserve valid wire representations; pin exact existing producer fixtures before tightening conversion. No new version or fields.
- Task preparation must reuse known created task identity on retry. T1 establishes existing create-task idempotency/unknown-response behavior; do not claim network-wide exactly-once task creation or broaden into task-service redesign without a demonstrated requirement.
- Keep whole-session correlation cleanup outside this task. Only the delivery-specific effect bookkeeping necessary for correct retry is added or changed. Session shutdown cancels work and clears session-owned records under existing rules.

## Execution guidance

Create the isolated worktrees only after execution authorization; carry the coordinating plan without losing the original or unrelated changes. Follow owning repository instructions and module-first integration. Inspect the complete failure transition before choosing a helper or state representation. Prefer a small typed record over a framework. At scope checkpoints exclude global correlation pruning, protocol/API redesign, persistent ledgers and deployment. If the existing boundary cannot distinguish delivery from failure, report that exact limit and ask before changing external semantics. Remove only task-created detours. No Onclave peer communication is needed.

## Tasks

- [x] **T1 - Establish retry and side-effect checkpoints**
  - Depends on: execution authorization and repository/worktree preflight.
  - Inputs: adapter consume/delivery/correlation; core delivery leases and create-task implementation/tests.
  - Do: document the narrow transition table in this plan and author deterministic regressions for pre-effect failure, post-correlation failure, post-send audit failure, failed ACK, and concurrent duplicates. Establish task-creation reuse and the point where Pi accepts an injected message. Use actual production handlers with inert Pi/API boundaries.
  - Verify: the tests expose terminal rejection on transient failure and early seen-ID suppression without live broker calls. Include core lease/disposition behavior using its existing controllable channel/timer fixtures.
  - Done when: each required effect has a retry/commit rule and irreversible effects cannot be retried blindly.
  - Evidence: Regression coverage committed in Onclave `9ce7599`; focused tests passed 2026-09-09.

- [x] **T2 - Implement bounded effect-aware delivery handling**
  - Depends on: T1.
  - Files: adapter `src/lib/{dedup,delivery,correlation}.ts`, `src/onclave-pi.ts`; narrowly scoped proposed helper only if simpler.
  - Do: replace early seen insertion with effect-aware records, resume missing effects, preserve correlation results, use lease-based redelivery for transient failures and ACK completed duplicates. Reuse known task identity, preserve inert/status routing and surface bounded failures.
  - Verify: T1 regression matrix plus capacity, shutdown cleanup and duplicate pending handling. No global correlation-store redesign.
  - Done when: transient failure cannot silently dead-letter valid work or suppress unfinished delivery, while post-delivery failure does not cause another turn within retained history.
  - Evidence: Effect-aware bounded delivery records and retry/ACK behavior committed in Onclave `9ce7599`; focused tests passed 2026-09-09.

- [x] **T3 - Centralize task-status validation**
  - Depends on: T1; may be authored independently of T2 before combined acceptance.
  - Files: envelope `src/{a2a,amqp,index}.ts`; adapter `src/lib/http-client.ts`; envelope/adapter tests.
  - Do: export one normalized status parser and route AMQP reconstruction and HTTP status responses through it. Remove unsafe casts/coercions for malformed optional fields, preserving valid producer output.
  - Verify: valid shared fixtures accepted through both transports; wrong version/state/identity/timestamp and invalid optional body/usage rejected before correlation or UI calls. Use proposed `extensions/onclave-pi/tests/http-client.test.ts` for the HTTP boundary.
  - Done when: both transports enforce one maintained normalized status contract.
  - Scope checkpoint: no protocol version change, new retry disposition or unrelated envelope rewrite.
  - Evidence: Shared parser and HTTP/AMQP validation tests committed in Onclave `9ce7599`; focused tests passed 2026-09-09.

- [x] **T4 - Validate, document and integrate module then parent**
  - Depends on: T2/T3.
  - Files: owning adapter docs, dotfiles `CHANGELOG.md`, this plan and final parent gitlink.
  - Do: run finite offline checks; record module commit/profile results and lease/dedup limitations. Integrate into the required module branch. Publish only if separately authorized; then update the parent gitlink, archive the coordinating plan and integrate dotfiles.
  - Done when: module implementation/checks and publication-dependent parent archive/integration are complete, or the exact remaining publication/integration blocker is reported. No deployment is required.
  - Evidence: Onclave implementation commit `9ce7599` merged into `feature/v2-broker-core` as `8f73446` and pushed to `origin/feature/v2-broker-core`. Six focused files (53 tests) and `pnpm run typecheck` passed 2026-09-09. The parent gitlink and changelog are prepared for archival and dotfiles integration.

## Agreed validation and finish

From the Onclave task worktree:

```sh
pnpm exec vitest run packages/envelope/tests/amqp.test.ts extensions/onclave-pi/tests/dedup-summary.test.ts extensions/onclave-pi/tests/communication.test.ts extensions/onclave-pi/tests/extension.test.ts extensions/onclave-pi/tests/http-client.test.ts services/core/tests/agent-delivery.test.ts
pnpm run typecheck
```

The HTTP test is proposed. Add a proposed delivery-specific test filter only if the new cases are not placed in the named existing files; record actual paths before final execution. Exercise real lease/state/validation implementations, mocking only broker channel, remote HTTP and Pi injection. No live broker, credentials, model calls or deployment acceptance. Author code/tests before final validation; classify failures, repair only relevant defects and rerun affected checks. Stop when agreed checks pass.

## Current handoff and dependencies

- Status: completed 2026-09-09. Onclave implementation and module integration are published; the dotfiles target contains the archived plan and changelog with no active duplicate.
- Independent of dotfiles correctness/refactoring plans; can run in its own module worktree concurrently. Parent changelog/gitlink merges remain serialized.
- Known execution preflight: restore required Onclave tracking checkout safely; publication needs separate push authorization. No branch/publication changes made now.

## Completion and archive

When module work/checks and required publication are complete, update the parent gitlink in the dotfiles task worktree. Set actual completion date and move this directory to dotfiles `.specs/archive/onclave-delivery-reliability/`, never overwriting an archive; repair links. Commit coordinating docs/changelog/gitlink/archive and merge into dotfiles `main` preserving unrelated work. Verify both owning targets and the archived plan, with no active duplicate. Keep worktrees if integration/publication is blocked. Remove only clean, fully integrated worktrees. Never force-push or amend/rebase published module commits. Deployment remains unauthorized.

Closeout evidence: Onclave `9ce7599` was merged and pushed as `8f73446` on `feature/v2-broker-core`. Dotfiles archived this plan on `main`; focused validation passed 53 tests and `pnpm run typecheck`. No live broker, model call, deployment, or operator manual acceptance was performed.
