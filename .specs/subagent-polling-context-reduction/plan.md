---
created: 2026-08-24
status: ready
---

# Prevent Subagent Polling and Context Pollution

## Objective

Prevent repeated `subagent_status` polling and bound exceptional subagent and shell-command output before it repeatedly enters provider context. Preserve exact diagnosis after real activity, completion delivery, failure evidence, source reads, full recoverable output, and ordinary small-result behavior.

## Completion Evidence

- Evidence: Hook-integrated tests show that an unchanged exact-process or orchestration status attempt is blocked before a second inspection and aborts the current model run; actual activity permits later diagnosis; oversized parent-visible subagent output is bounded to 16 KiB with a private full-output artifact; and matching Bash and `pwsh` results at or above 16 KiB are reduced in their first `tool_result` while small, unmatched, source-read, and failure-fallback cases retain current behavior.
- Fails when: An unchanged status target can be polled repeatedly, list-all model calls remain available, actual progress cannot reopen diagnosis, completion or recovery behavior changes, oversized output is discarded without an artifact, ordinary small results change, source reads are eagerly reduced, ignored reducer results are rewritten, or unrelated cache-telemetry files are touched.

## Boundaries

- Planning is complete in primary `.specs/subagent-polling-context-reduction/plan.md`. `/do-it` must materialize this spec in its owned `workflow/subagent-polling-context-reduction` worktree before implementation.
- Keep `subagent_status` root-only and keep `/subagents` as the operator listing and cancellation surface.
- Do not add a watchdog timer, watchdog delivery queue, new persistent state, model summarization pass, public output mode, or telemetry schema.
- Preserve existing background completion delivery, broker admission, authority, task lifecycle, model routing, child transcript retention, explicit `file-only` behavior, and artifact security.
- Do not eagerly reduce `read`, web, or subagent tool results through the generic command reducer. Do not change the retrospective emergency reduction mechanism.
- Update `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md` only for accepted status and provider-visible result behavior. Leave cache telemetry contracts and `pi/lib/metrics.ts` unchanged.

## Tasks

- [ ] **T1: Stop semantic status polling and bound exceptional subagent results**
  - Files: `pi/extensions/subagent/index.ts`, `pi/tests/subagent.test.ts`, and the affected status/result sections of `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`. Leave `pi/extensions/subagent/run-manager.ts`, broker code, completion storage, and unrelated contracts untouched unless the representative slice proves the existing hook-local state cannot implement the guard.
  - Change: First dispatch one exact-process status observation through the `tool_call` hook, follow it with an unchanged attempt, and prove the second attempt is blocked before `subagent_status.execute`. Generalize that hook-local semantic guard to orchestration IDs; key progress by current run status plus `activityVersion`; reject model-facing no-target listing in favor of `/subagents`; reset on interactive input or real activity; and terminate the repeated model run through existing `ctx.abort()` behavior. Do not add proactive watchdog delivery. Then replace the 50 KB ordinary provider-visible subagent boundary with one 16 KiB aggregate boundary for single, parallel, and background results: leave smaller and explicit `file-only` results unchanged, save complete oversized final text through the existing private artifact mechanism, and return deterministic bounded content plus the artifact reference. If artifact saving fails, preserve the existing 50 KB/2000-line fallback with an explicit error rather than discard evidence.
  - Done when: A hook-integrated 50-attempt simulation performs one status inspection, blocks the next unchanged attempt, and calls `ctx.abort()` once; activity-version or terminal-status change permits another inspection; model-facing no-target status is rejected while `/subagents` remains unchanged; no timer or normal-progress follow-up is introduced; representative oversized single, parallel, and background results remain at or below 16 KiB with byte-accurate readable artifacts; and small inline, explicit `file-only`, structured, failed, completion-delivery, and artifact-save-failure behavior remains compatible.
  - Verify: Run `cd pi && pnpm test subagent.test.ts` after the status-guard slice. Then run `cd pi && pnpm run typecheck` before expanding to output bounding. Run the focused test again after output changes and inspect for leaked timers, duplicate completion delivery, and incorrect artifact or parent-visible byte accounting.

- [ ] **T2: Eagerly reduce large Bash and `pwsh` results**
  - Files: `pi/extensions/tool-reduction.ts`, `pi/tests/tool-reduction.test.ts`, and existing rules under `pi/tool-reduction/rules/` only if the representative command lacks a deterministic rule. Leave native `read`, web/subagent results, retrospective thresholds, corpus retention, and telemetry schemas untouched.
  - Change: Extend eager reduction from Bash to `pwsh` by deriving command argv from each tool's existing input. At or above a 16 KiB candidate threshold, invoke the existing local reducer and rewrite the first `tool_result` only when it returns `reduction_applied`; do not duplicate rule matching in TypeScript. Reuse `details.fullOutputPath` or the existing private raw-output writer. Preserve complete failures, relevant evidence, counts, and the result tail in the representative slice before applying the path to both shells.
  - Done when: Matching large Bash and `pwsh` results are reduced before their first provider request, contain the reduction marker and full-output locator, and are not reduced again; candidate-sized unmatched results pass through byte-for-byte after local reducer evaluation; small results bypass the reducer; reducer timeout/error and artifact-save failure return the original result; and source reads never enter eager command reduction.
  - Verify: Run `cd pi && pnpm test tool-reduction.test.ts`. If a reducer rule changes, run only its matching `uv run pytest` tests from `pi/tool-reduction`. Run `cd pi && pnpm run typecheck` after both tasks compose.

The tasks have no hard dependency and own separate mechanisms. T1 starts with the smallest status-loop slice; if the hook cannot block before execution, stop and revise that mechanism rather than expanding it. T2 remains in scope as explicitly requested, but its first large Bash/`pwsh` fixture must prove that existing deterministic reduction preserves actionable evidence before broader application.

## Validation

- [ ] T1 status-loop, activity-reset, listing rejection, output-bound, artifact, and compatibility assertions pass.
- [ ] T2 Bash/`pwsh` ingestion, passthrough, recovery, and source-read exclusion assertions pass.
- [ ] Early and final `cd pi && pnpm run typecheck` checks pass at their stated barriers.
- [ ] `git diff --check` passes and the workflow diff excludes unrelated cache-telemetry files.

## Retention

Keep this canonical plan at primary `.specs/subagent-polling-context-reduction/plan.md` until `/do-it` materializes it in the owned implementation worktree. After every task and validation item passes, `/do-it` must archive the completed spec to `.specs/archive/subagent-polling-context-reduction/`, commit `workflow/subagent-polling-context-reduction`, merge it with `--no-ff` into the primary branch, verify merged `HEAD`, and remove only the owned worktree and branch. Dirty, unmerged, or conflicting state preserves recovery.

## Execution Status

- State: ready
- Blockers: none
- Resume: `/do-it .specs/subagent-polling-context-reduction/plan.md`
