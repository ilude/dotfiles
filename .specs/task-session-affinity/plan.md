---
created: 2026-08-24
status: ready
---

# Task-Linked Subagent Session Affinity

## Objective

Allow the root to explicitly continue a completed Luna subagent session for a later related durable task, using a prior task ID as an affinity hint, so serial work in the same code area can reuse context and provider cache without making affinity automatic or weakening task, workspace, authority, and concurrency boundaries.

## Completion Evidence

- Evidence: A representative two-task serial workflow can assign task B to the eligible Luna child session previously used for task A through the modern subagent interface; task B remains the current task correlation; cache telemetry directly distinguishes fresh and continued child first requests; and focused tests prove deterministic candidate selection plus rejection of stale, incompatible, missing, ambiguous, or concurrently active candidates before spawn.
- Fails when: Task B cannot select task A's latest eligible saved-session generation deterministically, the continued run remains correlated to task A, continuation can cross root session, canonical workspace, Luna model, agent profile, role, skill/authority, or live-session boundaries, or telemetry cannot join a child cache request directly to its run and current task.

## Boundaries and Assumptions

- Pi owns this behavior. Changes remain under `pi/` plus this specification.
- Affinity is an explicit root-supplied prior task ID on a single-item modern `subagent_read` or `subagent_write` call. Any affinity field in a multi-item or Team Lead request rejects the complete invocation before spawn.
- The task registry does not choose an agent, mutate run lifecycle, store child session paths, or infer affinity from task dependencies or paths.
- The process-local run manager remains authoritative for session paths. Affinity is unavailable after Pi process exit; no durable session registry, retry system, scoring model, path index, or cleanup lifecycle is added.
- Resolution uses the run manager's authoritative settlement order to select the latest successfully settled eligible run for the prior task. Different session identities at the same authoritative order are ambiguous and reject. Records that reference one canonical session resolve to that session's latest settled state by scanning retained runs; no alias or generation index is added.
- Initial dispatch records one canonical execution-identity fingerprint containing only normalized values compared during eligibility: effective agent profile identity, skills, role/depth, OpenAI Codex Luna model and effort, and effective tool authority. Affinity compares that immutable fingerprint with the prepared new request rather than reconstructing old identity from the current catalog.
- A candidate requires a saved session plus present and exact root-session and canonical-workspace identities. Missing identity metadata is ineligible; `cwd` is not a workspace fallback.
- A process-local lease is keyed by canonical saved-session identity, acquired atomically before asynchronous spawn work, and held through child settlement and session persistence. Different run or task aliases cannot resume one session concurrently. Lease state is not copied into task records, telemetry, fingerprints, or session metadata.
- `taskId` identifies the new assigned task B. The separate affinity-source task ID selects task A's session only; it does not create a dependency or change either task record. Internal continuation must carry task B's correlation into the new run.
- Continued sessions remain excluded from routing-outcome sampling. Existing task ownership, root-only task transitions, tree depth, cancellation, output, damage-control, and governed filesystem boundaries remain unchanged.
- Existing unrelated primary-repository changes, including current `.specs/` archive changes, remain untouched. `/do-it` must create and own the implementation worktree before changing implementation files.

## Tasks

- [ ] **T1: Implement and prove explicit affinity continuation**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/run-manager.ts`, the existing continuation-resolution path in `pi/extensions/subagent/index.ts`, focused subagent contract/runtime tests, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`.
  - Change: Add a separately named optional affinity-source task ID to single-item modern read/write requests. Record the minimal canonical execution fingerprint and settlement information required by the eligibility rules. Resolve the source by scanning process-local runs and reuse the existing saved-session executor while carrying task B's `taskId`. Add one canonical-session lease map in the run manager; do not create a second executor or persistent affinity store.
  - Done when: A focused test continues one successful Luna leaf from task A while assigning and recording task B. Parameterized eligibility tests prove latest-session selection and reject missing session/identity, failed or active run, ambiguous selection, non-Luna or changed model/effort, wrong root/workspace, changed profile/skills/role/authority, and multi-item or Team Lead use before spawn. One canonical-session race test proves aliases cannot resume concurrently and that the lease lasts through settlement.
  - Verify: From `pi/`, run the narrow subagent test file(s), then `pnpm run typecheck` because the shared modern request contract changes. Stop expansion and document the blocker if the existing continuation executor cannot preserve every named boundary.

- [ ] **T2: Attribute cache behavior and finalize the bounded workflow**
  - Dependencies: T1.
  - Files: `pi/extensions/session-configuration-fingerprint.ts`, the child launch environment and orchestration telemetry schema where needed for the direct run join, `pi/extensions/codex-status.ts` or its bounded cache-summary helper, focused telemetry/status tests, `pi/docs/orchestration-telemetry.md`, and modern subagent field documentation.
  - Change: Propagate the minimum cache attribution metadata: child `runId`, current `taskId`, continuation status, and provider-request ordinal. A missing child run ID identifies a root request. Define the first request as ordinal 1 for a child run and its cache-read share as `cacheRead / (input + cacheRead)`; retain reported zero and exclude and count unavailable input/cache-read pairs. Join child cache requests to orchestration records only by `runId`, never time, agent, or model. Extend the bounded report to separate root, fresh-child, and continued-child first requests without recording prompts, paths, tool arguments, or output.
  - Done when: Deterministic tests prove complete unique child joins, task B correlation, ordinal reset per run, deduplication, zero versus unavailable handling, and fresh/continued grouping. A representative task-A/task-B serial check exercises the modern interface and both tasks' direct validation passes. Optional matched trials may collect directional cache evidence in `.tmp/`, but they do not add production fields or gate the explicit mechanism.
  - Verify: From `pi/`, run the focused cache, telemetry, status, and subagent tests plus `pnpm run typecheck`. Run the representative serial check through the real modern interface. Documentation and contracts must match the final process-local, serial-only behavior; no automatic routing, durable affinity state, or task lifecycle mutation may exist.

## Validation

- [ ] T1 proves task-B correlation, deterministic eligibility, exact authority checks, and canonical-session lease exclusion through focused tests and typecheck.
- [ ] T2 proves direct cache attribution, fresh/continued first-request grouping, and the representative serial workflow through focused tests, typecheck, and direct task validation.
- [ ] The final implementation adds no automatic routing, durable affinity state, path scoring, task lifecycle mutation, or cross-process session registry.

## Retention

Keep this plan at `.specs/task-session-affinity/plan.md` while work remains. After all tasks and validation pass, `/do-it` archives the directory to `.specs/archive/task-session-affinity/`. Keep optional experiment captures under `.tmp/` and untracked.

## Workflow Completion

`/do-it` must materialize this specification in its owned implementation worktree, implement and validate the tasks, archive the completed specification to `.specs/archive/task-session-affinity/`, commit the workflow branch, merge it with `--no-ff` into the clean primary branch, verify merged HEAD, and remove only its owned worktree and branch. Ignored specification files remain untracked and return to the primary local archive after a successful merge; no workflow may force-add an ignored plan. Any dirty, unmerged, or conflict state preserves the implementation worktree and recoverable plan.

## Execution Status

- State: Ready; implementation has not started. Resume with `/do-it .specs/task-session-affinity/plan.md`.
