---
created: 2026-09-09
status: planned
completed: null
---

# Create the Bedrock accounting baseline exactly once

## Goal and scope

User-authorized planning for the review finding: preserve the first successfully published personal Bedrock baseline even when two sessions reconcile concurrently. The storage mutation boundary, not a prior command check, must enforce create-once semantics.

Non-goals: pricing/model changes, ledger redesign, monthly automatic rollover, live AWS queries, account access, historical baseline repair, or a generic storage framework. No rollback work.

Authorization: plan creation only. Implementation requires separate authorization; authorized execution includes local task commits and merge into dotfiles `main`, not push or deployment.

## Context for a fresh session

All code paths are dotfiles-root-relative. Read current root/default `AGENTS.md`, `pi/README.md`, default `docs/bedrock.md`, and the testing skill before implementation.

- Existing sources: `pi/profiles/default/extensions/bedrock/index.ts`, `lib/bedrock/{ledger,cloudwatch-snapshot}.ts` under the default profile.
- Existing tests: default `tests/bedrock-accounting.test.ts`, `tests/bedrock-reporting.test.ts`.
- Proposed worktree: `../.dotfiles-worktrees/bedrock-baseline-create-once`; branch `fix/bedrock-baseline-create-once`; merge target `main`.
- Verified on 2026-09-09: `/bedrock reconcile` calls `readBaseline()` before AWS work, then `writeBaseline()`; the latter acquires a lock but unconditionally renames over the destination. It also creates an empty destination before locking. Existing reporting coverage only checks sequential reconciliation.
- The cutoff controls which later local records are counted. The first successful snapshot must not be overwritten, including by a different month's snapshot.
- Evidence is source inspection, not an executed concurrent reproduction. Five other open plans were already untracked; preserve them and any concurrent work.

### Profiles

Planning profile: verified default via `PI_CODING_AGENT_DIR=.../pi/profiles/default`. Intended implementation and offline checks: default. Legacy unchanged. No tests, AWS calls, or baseline mutations were performed during planning.

## Decisions and contracts

- Keep the early command check as an inexpensive diagnostic, but enforce the rule at final publication too.
- Proposed `createBaseline(baseline, file?)` validates input and either publishes the complete baseline once or reports an existing destination without altering it. Route the command and fixture callers through this operation; remove the unconditional production writer if no legitimate caller remains.
- Use the existing file-locking dependency with a stable lock target that does not require creating an empty baseline. Recheck existence while holding the lock. Publish complete JSON atomically, with non-replacing semantics where supported. Do not hold the lock across AWS queries.
- An existing malformed or empty destination is not absence: report it without replacing or deleting it. Only missing state permits creation. A failed creation must not leave an empty baseline or task-owned temporary file that blocks later legitimate work.
- Preserve schema, permissions, active-profile path resolution, principal/month/capturedAt, command failure reporting, and matching-month cutoff calculations. Preserve append-only usage and legacy read-only fallback.
- One contender wins; other contenders report already-existing state. No automatic recapture or retry loop.

## Execution guidance

Create/resume the dedicated worktree at execution start and carry this uncommitted plan without discarding its original or other plans. Keep the baseline transition together rather than applying only another preflight check. Ask before changing accounting semantics. If a mechanism fails, choose a simpler in-scope publication mechanism, not a new service. Remove only unnecessary task-created detours. Stop at the finite checks below.

## Tasks

- [ ] **T1 - Implement transactional baseline creation**
  - Depends on: execution authorization/worktree setup.
  - Files: default `lib/bedrock/ledger.ts`, `extensions/bedrock/index.ts`.
  - Do: replace unconditional baseline publication with the create-once operation, use a suitable stable lock, and retain the command's early check. Keep locks out of network work and ensure failure cleanup preserves pre-existing content.
  - Verify: author T2 cases against the actual filesystem/lock implementation, including the currently failing concurrent scenario.
  - Done when: every production baseline mutation enforces create-once at publication and an unsuccessful attempt cannot alter a prior snapshot.
  - Evidence: Not started.

- [ ] **T2 - Cover contention and accounting through public boundaries**
  - Depends on: T1.
  - Files: existing `tests/bedrock-accounting.test.ts`, `tests/bedrock-reporting.test.ts`; proposed `tests/bedrock-baseline.test.ts` only if isolation improves clarity.
  - Do: use a temporary profile and real filesystem/locks. Exercise two competing creators, existing valid/malformed state, failed publication cleanup, and unchanged cutoff totals. Add a command case whose inert AWS response is delayed while another creator publishes; ensure the command cannot replace the winner.
  - Verify: first publication remains byte-identical after rejected later writes; exactly one contender succeeds; rejected commands surface failure; no real AWS or operator files are touched.
  - Done when: both the mutation and command paths demonstrate the invariant, not merely a mocked writer call count.
  - Scope checkpoint: no pricing, catalog, monthly rollover, or historical repair changes.
  - Evidence: Not started.

- [ ] **T3 - Document, validate, archive and integrate**
  - Depends on: T2.
  - Files: default `docs/bedrock.md`, root `CHANGELOG.md`, this plan.
  - Do: document concurrent create-once behavior; run the agreed checks, record actual source/profile/results, archive and merge locally.
  - Done when: required checks pass and `main` contains the implementation and dated archive, or integration is explicitly blocked with the task worktree retained.
  - Evidence: Not started.

## Agreed validation and finish

From task worktree `pi/profiles/default`:

```sh
pnpm test bedrock-accounting.test.ts bedrock-reporting.test.ts
pnpm run typecheck
node scripts/bedrock-smoke.mjs
```

If T2 creates `bedrock-baseline.test.ts`, add that exact filter before running the final test command. Author implementation/tests before the final phase. Classify unrelated failures; fix only relevant demonstrated failures and rerun affected checks. No live AWS or billing-accuracy acceptance. Stop after the agreed checks pass.

## Current handoff and dependencies

- Status: planned; implementation not authorized or started. No open operator decisions.
- Next: T1 after authorization.
- Independent of other default correctness plans. No blanket dependency on or from the revised default DRY draft: baseline publication and model-selection helpers are different contracts. Any later selected refactor must establish a dependency from actual source/contract overlap before requiring this plan's code in its worktree.

## Completion and archive

Set actual completed date after implementation/checks, then move this directory to `.specs/archive/bedrock-baseline-create-once/` in the task branch without overwriting an archive. Repair links. Commit implementation, changelog and archive together; merge to `main` preserving unrelated target changes. Reconcile the task-owned original plan only. Verify target implementation/archive and absence of the active copy. Recheck only behavior affected by merge resolution. Retain the worktree if integration is blocked; remove it only when clean and integrated. Do not push.
