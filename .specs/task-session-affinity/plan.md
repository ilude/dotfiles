# Task-Linked Subagent Session Affinity

## Objective

Allow the root to explicitly continue a completed Luna subagent session for a later related durable task, using a prior task ID as an affinity hint, so serial work in the same code area can reuse context and provider cache without making affinity automatic or weakening task, workspace, authority, and concurrency boundaries.

## Completion Evidence

Evidence: A representative two-task serial workflow can assign task B to the eligible Luna child session previously used for task A through the modern subagent interface; task B remains the current task correlation; cache telemetry directly identifies fresh and continued child requests; and focused tests prove deterministic candidate selection plus rejection of stale, incompatible, missing, ambiguous, or concurrently active candidates before spawn. Matched isolated trials provide directional evidence about first-request cache reuse and repeated exploration, but are not a prerequisite for preserving the explicit operator-selected mechanism.

Fails when: Task B cannot select task A's latest eligible saved-session generation deterministically, the continued run remains correlated to task A, continuation can cross root session, canonical workspace, Luna model, agent profile, role, skill/authority, or live-session boundaries, telemetry cannot join child cache requests directly to their run and task, or either experiment arm fails the same task validation.

## Boundaries and Assumptions

- Pi owns this behavior. Changes remain under `pi/` plus this specification.
- Affinity is an explicit root-supplied prior task ID on a single-item modern `subagent_read` or `subagent_write` call. Any affinity field in a multi-item or Team Lead request rejects the complete invocation before spawn.
- The task registry does not choose an agent, mutate run lifecycle, store child session paths, or infer affinity from task dependencies or paths.
- The process-local run manager remains authoritative for session paths. Affinity is unavailable after Pi process exit; no durable session registry, retry system, scoring model, path index, or cleanup lifecycle is added.
- Resolution selects the latest successfully settled eligible run for the prior task by an explicit deterministic settlement ordering. Multiple records that resolve to different session generations at the same authoritative order are ambiguous and reject. Aliases of one canonical session resolve to that session's latest generation.
- Initial dispatch records an immutable execution-identity fingerprint covering the effective agent profile/source, trust-relevant catalog identity, added skills, role/depth, OpenAI Codex Luna model and effort, and effective tool authority. Affinity compares that recorded fingerprint with the prepared new request rather than reconstructing old identity from the current catalog.
- A candidate requires a saved session plus present and exact root-session and canonical-workspace identities. Missing identity metadata is ineligible; `cwd` is not a workspace fallback.
- A lease is keyed by canonical saved-session identity, acquired atomically before asynchronous spawn work, and held through child settlement and session persistence. Different run or task aliases cannot resume one session concurrently.
- `taskId` identifies the new assigned task B. The separate affinity-source task ID selects task A's session only; it does not create a dependency or change either task record. Internal continuation must carry task B's correlation into the new run.
- Continued sessions remain excluded from routing-outcome sampling. Existing task ownership, root-only task transitions, tree depth, cancellation, output, damage-control, and governed filesystem boundaries remain unchanged.
- Existing unrelated primary-repository changes, including current `.specs/` archive changes, remain untouched. `/do-it` must create and own the implementation worktree before changing implementation files.

## Tasks

- [ ] **1. Prove explicit affinity continuation with the smallest internal slice**
  - Files/targets: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/run-manager.ts`, the existing continuation-resolution path in `pi/extensions/subagent/index.ts`, focused subagent contract/runtime tests, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`.
  - Action: Add a separately named optional affinity-source task ID to single-item modern read/write requests. Record the immutable execution fingerprint and deterministic settlement generation needed by the stated eligibility rules. Resolve the source against process-local runs and reuse the existing saved-session executor while carrying task B's `taskId`. Add canonical-session leasing; do not create a second executor or persistent affinity store.
  - Done when: A focused test continues one successful Luna leaf from task A while assigning and recording task B. Tests also prove latest-generation selection and reject missing session/identity, failed or active run, ambiguous generation, non-Luna or changed model/effort, wrong root/workspace, changed agent profile/trust/skills/role/authority, multi-item or Team Lead use, and concurrent requests through different aliases of one session. Every preflight rejection produces zero spawns, and the session lease is released only after settlement.
  - Verify: From `pi/`, run the narrow subagent test file(s), then `pnpm run typecheck` because the shared modern request contract changes. Stop expansion and document the blocker if the existing continuation executor cannot preserve every named boundary.

- [ ] **2. Add direct cache attribution and run bounded matched trials**
  - Dependencies: Task 1.
  - Files/targets: `pi/extensions/session-configuration-fingerprint.ts`, the child launch environment and orchestration telemetry schema only where needed for a direct join, `pi/extensions/codex-status.ts` or its bounded cache-summary helper, focused telemetry/status tests, `pi/docs/orchestration-telemetry.md`, and isolated experiment artifacts under `.tmp/`.
  - Action: Propagate bounded `orchestrationId`, `runId`, current `taskId`, child/root role, continuation status, and provider-request ordinal into each child `prompt_cache_request`; never join by time, agent, or model. Define the first request as ordinal 1 for the child run. Define its cache-read share as `cacheRead / (input + cacheRead)`, retain reported zero, and exclude and count unavailable input/cache-read pairs. Keep task IDs and run IDs as correlation metadata; do not record prompts, paths, tool arguments, or output. Extend the bounded report to separate root, fresh-child, and continued-child first requests.
  - Done when: Deterministic tests prove complete unique joins, ordinal reset per run, deduplication, zero versus unavailable handling, and fresh/continued grouping. Run at least two matched pairs comparing task B only from identical repository snapshots with the same model, effort, tools, authority, task instructions, task-A handoff, validation command, and configuration fingerprints; alternate arm order and record it. For each arm, record first-request cache-read share, processed tokens, turns, validation outcome, and read/search tool calls before the first modifying tool or child settlement when no modification occurs. Treat results as directional and report provider-cache/order limitations rather than claiming causation.
  - Verify: From `pi/`, run focused cache, telemetry, and subagent tests plus `pnpm run typecheck`; run the existing isolated Pi smoke entrypoint before provider calls; then run only the bounded matched trials. Both arms must pass the same direct task validation. Any missing join or failed validation makes the experiment inconclusive and blocks claims of benefit, not the already-proven explicit mechanism.

- [ ] **3. Integrate the explicit workflow and complete repository validation**
  - Dependencies: Task 2.
  - Files/targets: modern subagent schemas and descriptions, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/docs/orchestration-telemetry.md`, directly affected tests, and existing operator documentation that enumerates modern subagent fields. Leave the durable task schema and automatic scheduler unchanged.
  - Action: Finalize the explicit affinity-source field, concise eligibility failures, process-local serial semantics, direct cache attribution, and experiment result. Remove temporary experiment code and any mechanism not needed for the explicit workflow or its bounded telemetry. Do not add automatic selection based on the directional trials.
  - Done when: The modern interface exposes the explicit root-selected Luna continuation workflow with all eligibility failures covered; documentation and contracts match behavior; task B owns the continued run correlation; and no automatic routing, durable affinity state, or task lifecycle mutation exists.
  - Verify: From `pi/`, run all directly affected Vitest files and `pnpm run typecheck`. Run broader Pi or repository gates only when required by the changed shared surface or repository policy. Run `git diff --check` and verify unrelated primary changes are absent from the workflow diff.

## Workflow Completion

`/do-it` must materialize this specification in its owned implementation worktree, implement and validate the tasks, archive the completed specification to `.specs/archive/task-session-affinity/`, commit the workflow branch, merge it with `--no-ff` into the clean primary branch, verify merged HEAD, and remove only its owned worktree and branch. Ignored specification files remain untracked and return to the primary local archive after a successful merge; no workflow may force-add an ignored plan. Any dirty, unmerged, or conflict state preserves the implementation worktree and recoverable plan.
