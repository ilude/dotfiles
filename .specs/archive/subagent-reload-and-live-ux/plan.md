---
created: 2026-09-08
status: completed
completed: 2026-09-09
---

# Make reloaded subagents match the requested live UX

## Goal and scope

Repair the default-profile subagent experience reported after the previous UX implementation was merged. Reload must activate the new implementation; children must have human names and readable tool rows, use the operator-approved downward four-per-tab layout, and never pull the user back from another tab or workspace.

Authorization: implementation, bounded live acceptance, local commits, provisional merge, archival, and final integration were authorized. Push and deployment remain unauthorized. Preserve all unrelated changes.

User requirements:

- The operator will not run `/reload` while a subagent is running. Do not preserve executable runtime instances across reload merely to support that unwanted scenario.
- Retain the original UX contract: familiar human names, role/assignment separately, readable launch/activity/control/outcome rows, and bounded expanded details.
- Operator revision, 2026-09-09: put children below the unchanged orchestrator, left to right, four per tab. Child five starts an owned overflow tab. This supersedes the upper two-row requirement.
- Preserve the user's current focus, including tab switches during asynchronous launch, work, and cleanup. Restoring an earlier focus snapshot is not equivalent to preserving focus.
- Capture results, prove process settlement, and close ordinary finished panes immediately. Preserve existing origin/direct-child authority, explicit retention and intervention during normal operation, and no silent headless fallback.

Non-goals: dashboard/widget redesign, new orchestration framework, telemetry, durable process registry, legacy changes, general Herdr product changes, or another broad test campaign.

## Context for a fresh session

All source paths are repository-root-relative under `C:/Users/mglenn/.dotfiles` unless explicitly absolute. Read applicable AGENTS.md files before execution.

- Actual worktree: `C:/Users/mglenn/.dotfiles/.worktrees/subagent-reload-and-live-ux`.
- Actual branch: `fix/subagent-reload-and-live-ux`.
- Actual baseline at documentation pass: `fa1c29765037fd2da36e2e948b9fe04f900f2c9a`; parent integration target remains the originating checkout's `main`, not authorized here.
- Actual profile: `PI_CODING_AGENT_DIR=C:\\Users\\mglenn\\.dotfiles\\pi\\profiles\\default`; `scripts/pp` maps bare `pp` to default.
- Working-tree precondition: initial inspection found `pi/profiles/default/lib/subagents/names.ts` as a concurrent runtime leaf change, not unrelated baseline work. It is preserved. Runtime/extension changes from other specialists are also preserved, not authored or validated by this documentation owner.
- Intended implementation/test profile: the task worktree's absolute `pi/profiles/default` directory. Live activation testing must load that source explicitly, not accidentally test the lasting checkout or an old in-memory owner.
- Preserve existing changes to `CHANGELOG.md`, default Bedrock ledger/tests, and `skills/agent-process/references/failure-log.md`. Reinspect status before execution/integration. No stash/discard/commit of unrelated changes.

Required reading:

- `pi/README.md`, `pi/profiles/default/docs/{subagents,herdr}.md`.
- `pi/profiles/default/extensions/{subagents,subagent-child,clear}.ts`.
- `pi/profiles/default/lib/subagents/{runtime,visible,layout,presentation,rpc,child-surface,status}.ts` and `lib/herdr-cli.ts`.
- `scripts/{pi-herdr-launch,pi-subagent-host}.mjs` for actual exit and plugin behavior.
- `pi/profiles/default/tests/subagent-{runtime,layout,presentation,ux-live}.test.ts` and existing clear/reload tests found by source references.
- Installed Pi `docs/extensions.md`, `docs/tui.md`, relevant rendering examples and lifecycle references; read completely before implementing. Do not assume `session_shutdown` errors veto reload.
- Local Herdr/testing skills; installed Herdr help for any changed operations. Experiments use named isolated sessions only.
- `.specs/archive/subagent-transcript-and-pane-ux/plan.md`: previous scope and historical checks, not proof of successful operator acceptance.
- AIF-020/AIF-019 and APR-008/APR-002 in the default agent-process feedback/failure logs.

### Authorization decision and current status

D1 is resolved by the parent: `/reload` guarantees that no subagent runtime, conversation, or process remains active, including idle retained children. There is no special unsupported-active migration or cleanup behavior to document. This is an explicit reload lifecycle boundary, distinct from normal retention and intervention during ordinary operation.

T5 is complete. After the Herdr 0.9.0 server restart and `/reload`, the operator observed two bounded three-child runs using the merged runtime and reported that everything appeared to work as expected. All children completed and their panes closed; server inspection confirmed the requested downward geometry and exact cleanup.

### Verified findings and limits

1. The operator's screenshot shows the orchestrator above vertically stacked children, generic `Pi` titles, and UUID-based widget rows. The operator reports repeated focus theft from another tab and confirms a reload was performed. Screenshot reference: `C:/Users/mglenn/AppData/Local/Temp/pi-clipboard-c4f81db2-6efb-444c-8e98-6ffc438bdfdb.png`. Focus movement itself is not provable from a still image.
2. The three launch responses in this conversation omitted the newly introduced `displayName` and resolved metadata. This supports stale-owner execution. It does not prove that stale ownership explains every focus or layout defect.
3. `runtime.ts` retains a `SubagentRuntime` instance on `globalThis[Symbol.for("dotfiles.pi.default.subagents.v1")]`. The extension captures it during factory evaluation. Shutdown only calls `runtime.shutdown()` on quit, not reload. Its compatibility check only tests whether `runtime.wait` exists, so an older runtime with that method appears current.
4. Current `layout.ts` also issues explicit workspace/tab/pane focus commands from `restoreFocus()` after asynchronous operations. `visible.ts` saves `focusBeforeStop` before waiting for process exit. A user switching tabs during either interval can be pulled back to that old snapshot. Fix this independently of stale runtime activation.
5. Current `balance()`/`balanceHeight()` read `pane.rect` through `pane get`, but the existing live fixture itself documents that `pane get` omits rectangles. Both balancing methods can silently return without sizing anything. Current second-row creation splits one first-row child, not an established full-width upper row region. Physical geometry must decide whether the composition meets the contract; logical row/column fields do not establish it.
6. Existing live geometry assertions check slot numbers, positive rectangles, row counts and minimum y positions after creating 17 children. They do not establish aligned row tops, equal columns, full caller-region width, or intermediate 1/3/4/5/8 layouts. Existing focus assertions keep an unrelated pane stationary and check final focus, not a tab switch during mutation.
7. Current renderer headers only consume raw arguments and ignore row context. Expanded assignment text is still collapsed/truncated; start timestamps and collapsed finished durations are absent; automatic outcome details omit timing/result fields. These are remaining gaps in the existing transcript requirement, not a dashboard request.
8. Previous automated checks passed, including an isolated model-backed child run. The subsequent user-facing test failed acceptance. Prior declarations of complete live UX were too broad. This follow-up must correct the historical completion summary without deleting genuine test evidence.
9. T1 Herdr specialist evidence for installed Herdr 0.8.2 reports a concrete second-full-width-row blocker: same-tab move returned `changed=false`, while a down split under one column produced the wrong geometry. No temporary-tab migration or extra placeholder panes were used. Exact command/response evidence and validator preflight are still pending; do not claim the physical grid is proven.

| Date | Actual profile/path | Work | Result |
| --- | --- | --- | --- |
| 2026-09-08 | lasting checkout default | Planning source/test inspection and screenshot review | No new runtime launches or live mutations; findings above are source evidence and operator report |

## Decisions and contracts

### Reload lifetime

Required: a completed `/reload` must use newly loaded runtime/layout/renderer code without requiring `/clear`, restart, or a second reload. Do not retain old class instances or closures as the reload owner.

Proposed mechanism: dispose the old runtime during reload teardown and construct the replacement from the newly evaluated module during startup, not inside an old module's shutdown callback. Shared access needed by `/clear` and session switching must not become another indefinitely cached executable singleton. Preserve ordinary `/new`/`resume` origin-scoped delivery separately from explicit reload; this task does not authorize dropping active children on every session switch.

Keep safe plain data needed for same-origin human-name non-reuse and undelivered outcomes across reload. Do not keep dead process objects, timers, listeners, or old implementation methods to retain that data. Existing transcript entries remain readable. Already acknowledged completions must not replay merely because reload occurred.

**Resolved decision D1:** Explicit `/reload` ends idle retained conversations and every remaining owned child process. Treat reload as an explicit subagent lifecycle boundary, settle/close all owned resources with bounded cleanup, preserve captured results, then load fresh code. There is no special unsupported-active migration or cleanup behavior. If cleanup fails, report the exact unresolved ownership and do not silently reuse stale code or claim successful replacement.

The earlier assistant suggestion to reject reload on active children is not an accepted requirement. Verify lifecycle APIs before implementing; do not invent a separate migration or cancellable shutdown hook.

### Focus and geometry

- Background creation and cleanup must not issue unconditional focus restoration. Use exact non-focusing mutations. Never focus an unrelated tab temporarily to obtain geometry.
- Test the current Herdr API with caller-context environment set and a simulated user switch during the operation. A read/check/restore sequence alone is not atomic protection from user input.
- If Herdr itself changes focus during swap/exit/close and available APIs cannot satisfy the contract, record the exact command and response as a blocker. Do not silently patch the Herdr product, defer ordinary cleanup, or select headless.
- When the user is viewing the exact pane that must close, allow normal surviving-pane selection. This does not permit redirecting a user who has switched to another surviving pane/tab/workspace.
- Use actual returned pane/tab/workspace IDs and actual topology/rectangles. Keep caller ID/process and width, with one equal-width child row below it. Use owned overflow tabs in groups of four. Do not continuously override manual resizing.
- Serialize owned mutations; handle holes and empty rows/tabs without moving surviving children between tabs or disturbing unrelated panes.

### Transcript

Complete the original presentation contract rather than replacing it: allocated name in the active row, role and assignment separately, resolved defaults, actual surface/wait state, start/elapsed/activity information, honest background/detached states, questions and bounded results/errors. Expanded mode shows the full available assignment and bounded Markdown output; completion duration stops advancing. Root/coordinator controls retain authority and use the same identity. Do not add invented usage counters.

## Execution guidance

Create the dedicated worktree only after execution authorization. Carry this plan and task-owned feedback changes without losing originals or concurrent work. Record actual branch, profile and integration target.

Investigate the smallest assumption that can invalidate a fix first. Use the existing live fixture instead of another general harness. If an API cannot meet the requirement, stop that dependency with a concrete blocker and continue independent work. Ask before broadening ownership to Herdr or changing lifecycle semantics.

At the checkpoints below, remove task-introduced detours, preserve necessary behavior, and continue required tasks. Do not add speculative audits or rerun unchanged suites after they pass. Do not launch visible development subagents from the operator's current session as a substitute for controlled acceptance.

## Tasks

- [x] **T1: Prove reload lifecycle and non-focusing layout operations**
  - Depends on: execution authorization and D1 for reload implementation direction.
  - Inputs: installed Pi lifecycle docs, extension/runtime/clear sources, Herdr help, existing `subagent-ux-live.test.ts`.
  - Do: create/record the worktree; establish teardown/load ordering; extend the isolated fixture to capture actual intermediate topology and focus while a user switch occurs between operations. Verify whether exact-source swap, overflow creation, and settled-process closure are truly non-focusing with caller context set.
  - Verify: inert processes only; test 3 children above the caller and another tab/workspace focused, including a switch during launch and shutdown. Record actual commands/response geometry and explicitly clean owned resources in finally.
  - Done when: the reload implementation point and feasible non-focusing layout sequence are known, or exact API blockers are recorded. No claim based only on final focus or logical slots.
  - Evidence: Done. `evidence/layout.md` records the lifecycle/layout checks and exact API evidence. Verified: genuine 1/3/4-child first-row geometry; the initial exact caller-to-upper swap focuses the child because Herdr exposes no `pane swap --no-focus`; and the required 5+ second full-width row is physically blocked (`changed=false` on same-tab move; down split under one column produces incorrect geometry). the isolated diagnostic probe EXPECTS that focus theft and is not acceptance. No temporary-tab migration or placeholder panes were used.

- [x] **T2: Replace executable runtime state on reload**
  - Depends on: T1 lifecycle findings and D1.
  - Files: `extensions/{subagents,clear}.ts`, `lib/subagents/runtime.ts`, related runtime/clear tests; add a focused reload test only if existing tests cannot cover it.
  - Do: dispose the old owner, detach its subscriptions/timers/transport, create from fresh code on reload, and carry only necessary inert name/outcome state. Remove the obsolete `typeof runtime.wait` upgrade heuristic. Preserve normal session-switch ownership/delivery and clear semantics.
  - Verify: actual loader lifecycle with a before/after implementation marker, old owner no longer serving launches, no duplicate outcomes, names not reused within the same origin, existing nameless transcript compatibility, clear and ordinary session replacement behavior. Cover agreed residual-process cleanup and failure reporting.
  - Done when: one reload activates changed launch/layout code with no stale instance fallback or restart requirement in the supported new lifecycle.
  - Evidence: Done. Repaired `evidence/runtime.md` proves the actual registered-owner loader/ACK/new-resume/name-nonreuse source reload path, cleanup guard, fresh owner rejection of the disposed old tool, and exactly-once journal acknowledgement. The repaired test ran with the absolute task profile and installed Pi 0.85.1 dependencies. No credential copies were made; shared `.codex` catalog fallback was available.

- [x] **T3: Remove focus theft and establish physical grid placement**
  - Depends on: T1 Herdr findings; independent of T2 code edits.
  - Files: `lib/subagents/{layout,visible}.ts`, `lib/herdr-cli.ts` if needed, existing layout/live tests; host/launcher changes only if process-exit behavior requires them.
  - Do: replace saved-focus restoration with the proven non-focusing operations; remove the long-lived `focusBeforeStop` behavior. Use the approved downward four-per-tab construction and real geometry acquisition; retain exact resource identity as soon as creation succeeds so partial failure can settle processes before pane closure.
  - Verify: rectangles at 1/3/4 children; overflow tab membership at 5/9/17; aligned tops, left-to-right equal columns, caller width and top position, holes/empty tabs, concurrent launch/cleanup, and unrelated panes intact. Include focus switches during launch and delayed settlement. Reuse existing tests rather than adding a second planner harness.
  - Done when: the physical layout and no-focus contract pass, not just returned slot records.
  - Evidence: Done under the operator-approved revision. The isolated production-adapter run passed 1/3/4-child equal-width geometry below the unchanged caller, preserved unrelated focus during launch and cleanup, and placed children 5/9/17 in owned overflow tabs 1/2/4. No swap or focus-restoration command remains.

Scope checkpoint: reload and background layout repair only; no persistent worker manager, focus-restoration controller, or Herdr product rewrite.

- [x] **T4: Finish the transcript details and identity wiring**
  - Depends on: T2 for active-runtime integration; renderer work can proceed independently.
  - Files: `lib/subagents/{presentation,status,child-surface}.ts`, `extensions/{subagents,subagent-child}.ts`, existing presentation/runtime tests.
  - Do: show allocated/resolved metadata in the same active tool row and control header; complete start/frozen duration and expanded assignment/output presentation; share readable outcomes including errors and questions. Keep old transcript compatibility and UI-only activity updates.
  - Verify: registered tool execution plus actual component output at narrow and normal widths, not only fabricated records. Cover resolved defaults, background/detached/question/terminal states, expanded full assignment, result with cleanup error, and name-based controls. Confirm no progress-triggered model messages.
  - Done when: the original transcript contract works through loaded tools and is not merely present in an unused helper.
  - Evidence: Done. T4 implementation and scoped registered-tool/component checks completed in the task default profile; see `evidence/presentation.md`. The affected scoped rerun passed 17/17. Real inert RPC launches exercise active header identity/config, detach, background, questions, terminal output and name controls at narrow/normal widths. The concurrent task-layout type error is distinct from the baseline commit-whitespace TS7016 error. No attached-client acceptance is implied.

- [x] **T5: Run bounded reload-to-live acceptance and reconcile documentation**
  - Depends on: T2, T3, T4.
  - Files: existing `tests/subagent-ux-live.test.ts`, owning subagent docs, `pi/README.md`, `CHANGELOG.md`, AIF-019/AIF-020, and a correction note in the previous archived plan.
  - Do: run the finite checks below. Use an isolated real Pi parent with the task profile, exercise one reload after children settle, then launch three concurrent bounded children through its registered tools. Verify names/titles/tool rows, downward row/top caller, and user focus on a different tab through launch and closure. Do not substitute three agents running source unit tests for testing this runtime.
  - Verify: record loaded source/profile and before/after owner identity, screenshots or rendered transcript evidence, actual geometry, and focus changes during work. An attached-client test is required for the reported keyboard/tab behavior; coordinate its bounded execution with the operator instead of mutating their current panes unannounced. If only server automation is available, leave this acceptance item pending rather than declare complete UX.
  - Update: distinguish historical passing checks from failed operator acceptance, document the new reload boundary, and remove superseded restart-only advice for the fixed lifecycle. Determine from T1 whether the first transition out of the already-loaded old lifecycle needs special handling; do not claim the running session was upgraded by merging files.
  - Done when: agreed automated and live checks pass with exact resource cleanup and truthful documentation.
  - Evidence: Done. After provisional merge `a04620e`, Herdr 0.9.0 server restart, and `/reload`, six model-backed children completed in two groups of three with human names, readable outcomes, downward three-column geometry under the unchanged orchestrator, process settlement, and pane cleanup. The operator reported that everything appeared to work as expected. See `evidence/live-acceptance.md`.

Scope checkpoint: stop after these repairs and checks pass; no additional benchmark, council run, or verification campaign.

- [x] **T6: Archive and integrate**
  - Depends on: T5.
  - Do: set actual completion date, archive the whole directory to `.specs/archive/subagent-reload-and-live-ux/`, repair links, and commit implementation and evidence together in the task branch. Merge into the recorded parent branch while preserving unrelated work. No push.
  - Verify: target contains code/archive and no active copy, `git diff --check`, task branch merged and clean before worktree removal. Keep a blocked worktree and report integration separately if needed.
  - Evidence: Not started. T6 is explicitly unauthorized.

## Final validation and evidence

Exact integrated sanitized task-profile command and outcomes are recorded in `evidence/validation.md`: focused default-profile suite **118 passed, 6 skipped, 0 failed across 19 passing files and 4 skipped files**; typecheck failed only on baseline `tests/commit-whitespace.test.ts:5:40` TS7016 for `commands/commit/trim-trailing-whitespace.mjs`; `check:runtime` passed **335 rules, 8 schemas**; and `git diff --check` passed. No model-backed or attached-client T5 run occurred. These results do not upgrade the already-running operator session, and the first transition from the earlier lifecycle was not live-tested. No unsupported active-child migration was built.

## Proposed validation and finish

From the task worktree's default profile:

```sh
pnpm test subagent herdr-launch.test.ts herdr-background-focus.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts
pnpm run typecheck
pnpm run check:runtime
PI_SUBAGENT_UX_LIVE=1 PI_SUBAGENT_UX_LIVE_REAL=1 pnpm test subagent-ux-live.test.ts
```

Include the existing clear/reload test file identified in T1 if not selected above. Extend the existing opt-in fixture for the missing reload/geometry/focus cases, not a new test flag that quietly skips required acceptance. Verify local ignored authentication/catalog setup before spending a model deadline; do not log or commit credentials. Use inert processes for geometry counts, three bounded children only for the requested visible acceptance. Run `git diff --check` from the root. Repeat only affected checks after relevant fixes.

## Current handoff

- Status: completed. T1-T6 passed under the revised operator-approved layout contract; completion and archival are dated 2026-09-09.
- Completed: applicable instructions, owning docs, AIF-019/AIF-020, APR-008/APR-002, prior archive, actual cwd/branch/baseline/profile, and existing-change precondition inspected. Historical checks are separated from failed operator acceptance.
- D1: resolved by parent. Explicit `/reload` is invoked only when no subagent runtime, conversation, or process remains active, including idle retained children; no unsupported active-child migration or special cleanup behavior was added.
- Next: archive this completed spec, commit the final documentation state, and remove the clean task worktree. No push or deployment is authorized.
- Stale documentation corrected in this pass: `pi/profiles/default/docs/subagents.md`, `pi/profiles/default/docs/herdr.md`, `pi/README.md`, `CHANGELOG.md`, AIF-019/AIF-020 entries, and the archived plan correction note. Runtime, layout, transcript, test, and documentation changes are present. The unfinished plan is not archived or merged; no push or deployment was performed.
- Remaining coordination risk: none for local integration. The work remains unpushed and undeployed.
