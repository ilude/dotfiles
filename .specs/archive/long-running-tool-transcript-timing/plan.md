---
created: 2026-08-25
status: complete
completed: 2026-08-25
---

# Standardize long-running tool transcript timing

## Objective

Long-running Pi tool calls use one compact scrolling-transcript timing interface that shows the represented work's local start time while running and its start time plus elapsed duration after settlement, without changing footer, dashboard, or immediate-tool output.

## Completion Evidence

- Evidence: Direct renderer or transcript-message assertions for every named in-repository GO tool show `started HH:MM:SS local` while work is represented as running and `started HH:MM:SS local | duration <value>` after settlement; detached acknowledgements and completions use the managed work's timestamp, while representative no-go tools and named non-transcript UI files remain unchanged.
- Fails when: Any covered long-running transcript omits its represented work's start time, reports tool-call time instead of detached-work time, uses `elapsed` after settlement instead of the canonical `duration`, adds timestamps to an immediate no-go tool, or changes footer or interactive dashboard output.

## Boundaries

- In scope: Scrolling tool-call, partial-result, settled-result, background-start, and background-completion transcript rendering for `bash`, `pwsh`, `subagent`, `subagent_read`, `subagent_write`, `subagent_teamlead`, `subagent_coordinate`, `subagent_continue`, interrupt-and-resume `subagent_control`, `bg_start`, `goal_complete`, `web_search`, `web_fetch`, `workflow_complete`, `plan_archive`, and the conditionally registered `commit_stage`, `commit_create`, and `commit_push` tools.
- Out of scope: Footer/status lines; `/subagents` and `/ps` interactive dashboards; Herdr and Onclave implementations owned outside `pi/`; slash-command output; scheduler records; status/list/registry/control calls; and timestamps for `read`, `edit`, `write`, structured/text editing, task/plan/goal progress, inspection, search, usage, or other immediate no-go tools.
- Preserve: Existing tool schemas, result content delivered to models, execution semantics, cancellation, timeouts, artifact handling, background completion delivery, theme behavior, and current local-time convention.
- Assumptions: Transcript renderers can share a pure formatting helper without changing persisted tool-result schemas; detached work exposes an authoritative start timestamp distinct from the short tool invocation.

## Tasks

- [x] **T1: Prove the shared transcript timing interface on every subagent entry point**
  - Files: `pi/lib/tool-timing.ts`, `pi/extensions/subagent/index.ts`, `pi/tests/subagent.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`
  - Change: Extend the existing pure timing helper with canonical running (`started`) and settled (`started | duration`) transcript forms. First prove the mechanism on the base foreground and detached `subagent` paths without adding timers or duplicate lifecycle state; running output reflects the timestamp whenever Pi naturally renders it. If that slice passes, wire the same call/result renderer behavior into `subagent_read`, `subagent_write`, `subagent_teamlead`, `subagent_coordinate`, `subagent_continue`, and only the interrupt-and-resume action of `subagent_control`. Preserve default result content and keep `/subagents`, status diagnostics, footer output, and model-facing content unchanged.
  - Done when: Direct assertions cover running and settled output for every named subagent registration, background acknowledgement/completion use the run manager's authoritative timestamp, interrupt-and-resume is timed while immediate control actions are not, and no periodic rerender lifecycle was added.
  - Verify: `cd pi && pnpm test subagent.test.ts subagent-run-manager.test.ts && pnpm run typecheck`

- [x] **T2: Create or update transcript renderers for remaining in-repository GO tools**
  - Depends on: T1
  - Files: `pi/extensions/bash-cwd.ts`, `pi/extensions/pwsh.ts`, `pi/extensions/background-terminal/index.ts`, `pi/extensions/background-terminal/manager.ts`, `pi/extensions/goal.ts`, `pi/extensions/web-tools.ts`, `pi/extensions/workflow-commands.ts`, `pi/extensions/commit.ts`, `pi/tests/bash-cwd.test.ts`, `pi/tests/pwsh.test.ts`, `pi/tests/background-terminal.test.ts`, `pi/tests/background-terminal-manager.test.ts`, `pi/tests/goal.test.ts`, `pi/tests/web-tools.test.ts`, `pi/tests/workflow-commands.test.ts`, `pi/tests/commit-extension.test.ts`, `pi/tests/commit-mutation.test.ts`, `pi/tests/commit-push.test.ts`, `pi/skills/pi-extension/references/contracts/background-terminals.md`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
  - Change: Reuse the proven helper where custom renderers exist and add minimal `renderCall`/`renderResult` implementations where the default renderer currently owns the row, always preserving existing result text. Retain Bash and PowerShell start metadata while aligning settled output. For `bg_start`, propagate manager `startedAt` and `endedAt` into the acknowledgement and bounded `background-terminal-result` follow-up content rather than timing the invocation; do not introduce a custom-message type solely for styling. Add timing only to `goal_complete`, both web tools, both workflow closeout tools, and the three commit mutation tools; leave sibling no-go registrations unchanged. Update only contracts whose accepted transcript behavior changes.
  - Done when: Direct assertions cover every named GO tool and each applicable running, acknowledgement, completion, partial, or settled state; representative immediate siblings assert the absence of `started` and `duration`; existing result and error tests continue to pass without adding unrelated error-path coverage.
  - Verify: `cd pi && pnpm test bash-cwd.test.ts pwsh.test.ts background-terminal.test.ts background-terminal-manager.test.ts goal.test.ts web-tools.test.ts workflow-commands.test.ts commit-extension.test.ts commit-mutation.test.ts commit-push.test.ts`

## Validation

- [x] `cd pi && pnpm test subagent.test.ts subagent-run-manager.test.ts bash-cwd.test.ts pwsh.test.ts background-terminal.test.ts background-terminal-manager.test.ts goal.test.ts web-tools.test.ts workflow-commands.test.ts commit-extension.test.ts commit-mutation.test.ts commit-push.test.ts` passes with a per-tool assertion matrix for every named GO registration and negative assertions for representative immediate sibling tools.
- [x] `cd pi && pnpm run typecheck` passes after all adopters are updated; T1's earlier typecheck remains the required shared-contract expansion gate.
- [x] `git diff --exit-code -- pi/extensions/subagent/ui.ts pi/extensions/background-terminal/ui.ts pi/extensions/operator-status.ts pi/extensions/scheduler.ts pi/extensions/onclave-pi.ts modules/onclave` passes, proving the excluded dashboards, footer/status, scheduler, and Onclave boundaries were not modified.

## Retention

Keep incomplete work at `.specs/long-running-tool-transcript-timing/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/long-running-tool-transcript-timing/`.

## Execution Status

- State: Complete.
- Result: All required renderer tests passed (251 tests), the Pi extension typecheck passed, and excluded UI/status/scheduler/Onclave paths are unchanged.
- Blocker: None.
- Next: Archive, commit, merge, and verify closeout.
- Resume: `/do-it .specs/long-running-tool-transcript-timing/plan.md`
