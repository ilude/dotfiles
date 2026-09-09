---
created: 2026-09-08
status: completed
completed: 2026-09-08
---

# Human-readable subagent tools and stable Herdr placement

## Goal and scope

Improve the default profile's subagent tool-call transcript and visible child layout. Give children familiar human names, expose meaningful launch and result information, and keep the orchestrator below its children without stealing focus.

Authorization: planning only. Execution, when authorized, includes isolated implementation, agreed validation, local commits, archive, and merge into the recorded target. No push, deployment, production plugin relinking, or legacy implementation changes.

Non-goals: redesigning `/subagents` into a dashboard, rebuilding the passive widget, importing legacy orchestration, changing authority/delivery semantics, adding capacity quotas or silent headless overflow, usage telemetry infrastructure, or a persistent registry. Existing widget rows may use the same human identity; their layout is not being redesigned.

## Context for a fresh session

All source paths are relative to the dotfiles repository root. Read applicable AGENTS.md files before acting.

- Repository: `C:/Users/mglenn/.dotfiles`; planning baseline `325d7a4a`, branch `main`.
- Proposed execution worktree: `.worktrees/subagent-transcript-and-pane-ux`; branch `feature/subagent-transcript-and-pane-ux`; merge target: originating `main` checkout. Create only when execution is authorized.
- Owning current contract: `pi/profiles/default/docs/subagents.md`, especially Agreed UX changes and Visibility and lifetime. Navigation: `pi/README.md`.
- Current sources: `pi/profiles/default/extensions/{subagents,subagent-child}.ts`, `pi/profiles/default/lib/subagents/{rpc,runtime,visible,status,child-surface}.ts`, `pi/profiles/default/lib/herdr-cli.ts`, and `scripts/pi-herdr-launch.mjs`.
- Narrow legacy presentation reference: `pi/profiles/legacy/extensions/subagent/index.ts`, `renderCall`/`renderResult` near lines 5470 onward. Do not port its workflow or usage machinery wholesale.
- Lifecycle authority: `.specs/archive/default-subagents-and-council/plan.md`, Required behavior / Temporary panes. The older cancelled `.specs/archive/herdr-visible-subagents/plan.md` is only historical layout/API evidence. Its failed-pane retention, zoom deferral, fifth-worker threshold, and capacity limits are superseded.
- Read the installed Pi extension/TUI rendering docs and relevant examples completely before implementation; resolve them from the actual linked package. For Herdr, follow the local skill and installed CLI help. Read the default testing skill before adding tests.
- Preserve existing uncommitted work: Bedrock accounting changes, associated tests/docs, `CHANGELOG.md`, `pi/README.md`, default `.gitignore`, and untracked `NUL`/Bedrock source observed at planning. Do not include those changes. Carry only this plan and task-owned subagent documentation/AIF-020 edits into the worktree, preserving concurrent edits to shared files.

### Profile provenance

Planning profile verified from `PI_CODING_AGENT_DIR`: `C:/Users/mglenn/.dotfiles/pi/profiles/default`. `scripts/pp` maps bare `pp` to default. Intended implementation and validation use the task worktree's absolute `pi/profiles/default` path, not a launcher accidentally resolving to the lasting checkout. Legacy stays unchanged.

| Date | Actual profile | Work | Result |
| --- | --- | --- | --- |
| 2026-09-08 | lasting checkout default | Source/archive inspection and installed Herdr CLI help | Plan only; no runtime tests or pane mutations |

## Decisions and contracts

### Preserved lifecycle, not a new question

Capture results and prove owned process settlement before closing finished ordinary panes immediately, including failures. Do not defer closure for zoom. `retain: true` and acknowledged direct user intervention keep their existing conversation/process semantics. An outstanding question is not finished work. Do not reinterpret a reported terminal blocked result as an indefinitely running process. Preserve origin-scoped delivery, same-process reload/chat continuity, `/clear` cleanup, and current parent-exit behavior.

The assistant initially cited the older cancelled plan incorrectly. That was not a user decision to change cleanup. The current owning docs and feedback entry were corrected during planning.

### Human identity

- Allocate familiar human names from a checked-in pool, independent of role, to both visible and headless children. Display name, role, and assignment separately, for example `Clara · explorer`.
- Allocate before asynchronous spawn, unique case-insensitively across the root origin's descendants. Keep the same name across follow-ups and reload; do not reuse names within that originating session. Coordinator leaves share the root's namespace.
- Keep UUIDs as canonical transport/ownership IDs. Extend root and coordinator control lookup to accept an exact human name without broadening origin/direct-child authority. Preserve UUID/prefix compatibility. Do not rename the existing `agent` role argument into a person's name.
- Proposed bounded-pool fallback: after first names are exhausted, use a human first/last-name combination from checked-in lists, with a readable numeric suffix only after combinations are exhausted. Exhaustion must not reject work or collide.
- Pane titles, tool headers/results, automatic completion messages, and control responses use the same display name. Herdr-native agent registration is not required; names are scoped to Pi ownership, not assumed globally unique in Herdr.

### Transcript information

- Start: name when allocated, role, assignment preview, resolved model/effort, actual surface, foreground/background wait state, start time, and cwd (particularly worktrees). Retention and parent identity are available as relevant metadata.
- During an attached wait: update the same row with phase/tool, elapsed assignment time and last observed activity age. No invented progress, inactivity timeout, transcript scraping, or progress messages to the model.
- Background launch returns `started` rather than `complete`. A detached wait explicitly says the child continues. Automatic outcome messages provide the same readable identity/result presentation later; they do not retrospectively rewrite a launch acknowledgement as completion.
- Result: distinguish complete, partial, blocked, failed, cancelled and pending questions; put bounded result/error ahead of internal state. Keep successful output alongside cleanup errors. Freeze finished duration rather than calculating ever-growing elapsed time.
- Collapsed view is short; expanded view exposes full available assignment, resolved metadata, and bounded result in readable sections. Render Markdown results appropriately; do not show raw JSON as the primary UX.
- Control calls identify action plus the name/role/assignment when available. Use the same renderers in coordinator tool surfaces where supported.
- Usage is not currently collected in ChildRecord. Do not invent counters or add telemetry collection just for parity. Expose only real available data.

Proposed supporting record fields: `displayName`, assignment text, resolved `model`, `effort`, `cwd`, `skills`, and a per-assignment settled timestamp. Existing `assignmentStartedAt`, `phase`, `toolName`, `lastActivityAt`, `surface`, `waitState`, `retained`, `parentId`, `result`, and `error` supply other display data. Preserve backward-compatible rendering for existing records without new fields. Keep transport tokens and process objects out of display details. Retained follow-ups update assignment/timing but retain identity.

### Pane topology

- First child splits above the original orchestrator; subsequent children fill the upper area left to right, four per row, with a second row for children five through eight. Keep the orchestrator's pane/process identity, full available caller-region width, and bottom position. Do not rearrange unrelated existing panes.
- More than eight moves to a new tab without focusing it. Planning interpretation: children 9–16 occupy the next owned tab (two rows of four), then additional groups of eight get further owned tabs. Existing first-eight children remain above the orchestrator; do not migrate them merely because the ninth starts. This preserves the user's stated stable bottom layout. If operator direction changes this interpretation, update it before implementation rather than silently selecting a different migration policy.
- Root-owned visible descendants, including coordinator leaves, use one placement group instead of splitting whichever pane happens to be focused or the coordinator's own child pane.
- Proposed sizing: one-third-height child band for one row, two-thirds for two rows, with equal columns within each row. Ratios are implementation defaults, not user-mandated pixel sizes. Do not continuously override manual resizing.
- Serialize placement/cleanup mutations within an owned group so concurrent starts cannot allocate the same slot or derive conflicting layouts. This is a layout lock, not a model scheduler or admission quota.
- Reuse available slots left to right; avoid moving other children between tabs merely because counts shrink. Remove owned empty overflow tabs; when the final upper child closes the original pane may naturally expand. Never close an unrelated tab or its panes.
- Use explicit returned pane/tab/workspace IDs and preserve the actual current user focus even when it is elsewhere. `--no-focus` is required; never restore focus to the caller as a substitute. No silent headless fallback.

## Verified technical starting point

Default launch/control tools have no custom renderers and serialize snapshots into text. `VisibleChild.start` splits the environment's caller pane right/down according to geometry for every child. There is no shared layout group. `SubagentRuntime` retains process-local children/contexts across reload and has an unused optional status binding suitable for UI subscriptions. Coordinator control currently looks up exact UUIDs directly and needs the same name resolution with narrower ownership.

Installed Herdr CLI help exposes plugin split directions only `right`/`down`, exact-source/target pane swap, pane move with `--new-tab` or exact tab/target/split/ratio and `--no-focus`, and pane resize. Thus top placement requires composition, not an unsupported `up` argument. The older archive demonstrates down-split plus swap and same-workspace move, but this is historical evidence, not a current live pass. Verify the current topology seam in T1 without changing the user's session.

## Execution guidance

Create the dedicated worktree at execution start. Copy/reconcile task-owned planning/docs changes without stashing, discarding, or committing unrelated work. Keep each checkbox current and record actual profile/check evidence.

When an assumption fails, choose a simpler mechanism meeting the same contract. Ask only if current APIs cannot meet a required outcome without a material scope change. Do not reopen settled cleanup preferences.

Before adding work, identify the requirement and evidence that needs it. At the two checkpoints below, remove task-introduced detours without disturbing pre-existing changes, preserve required behavior, and continue. Do not start a new general audit. Test the agreed cases, repair demonstrated relevant failures, and stop when they pass.

## Tasks

- [x] **T1 — Establish worktree and prove the layout seam**
  - Depends on: execution authorization.
  - Inputs: current status/instructions, this plan, installed Herdr help, `lib/herdr-cli.ts`, `tests/herdr-background-focus.test.ts` and `tests/subagent-herdr-live.test.ts` under default.
  - Do: create/record worktree, branch and merge target; carry task-owned docs. Use a named isolated Herdr server with inert plugin processes to prove above-caller split/swap, two rows with four columns, ninth-child overflow, exact IDs, and no-focus behavior. Record chosen command sequence and response fields here. No model traffic solely to populate panes.
  - Verify: bounded isolated geometry probe; include stable orchestrator ID and unaffected focus/unowned pane. Use explicit owned cleanup in finally. Stop on a real API blocker rather than modifying Herdr product code implicitly.
  - Done when: placement mechanism is known and isolated resources are removed. Reuse this fixture for T5 rather than creating another harness.
  - Evidence: Executed in the named isolated session `layout-final-97760` with a scratch config and inert linked plugin. The composition was `plugin pane open --placement split --direction down --target-pane <caller> --no-focus`, exact `pane swap --source-pane <child> --target-pane <caller>`, successive right splits for four columns, and `plugin pane open --placement tab --workspace <workspace> --no-focus` for overflow. The bounded 17-pane run returned stable pane/tab/workspace identities, produced two rows of four with Herdr's deterministic successive-split geometry, placed children 9-16 in tab 2 and child 17 in tab 3, restored the caller or an unrelated focused workspace pane, and left only the original caller after exact reverse cleanup. No shared Herdr session or production plugin registry was used.

- [x] **T2 — Add stable human identity and display metadata**
  - Depends on: T1 worktree setup; may proceed if its layout probe is blocked.
  - Files: default `lib/subagents/{rpc,runtime,status,child-surface}.ts`; proposed new `lib/subagents/names.ts`; affected runtime/RPC/child-outcome tests.
  - Do: allocate names and preserve canonical UUIDs; retain resolved metadata in safe snapshots; update current assignment on follow-up and freeze its finish time. Resolve names for root/control commands and direct-child coordinator controls with existing ownership checks. Propagate names to completion messages and existing widget identity, without widget redesign.
  - Verify: concurrent same-role launches get distinct names; case-insensitive exact lookup; origin/direct-child isolation; follow-up and reload preserve names; later allocations do not reuse settled names; old nameless snapshots remain readable; exercise pool fallback deterministically.
  - Done when: every new child has stable useful identity and the renderer can consume real launch/result metadata without private transport data.
  - Evidence: Added a deterministic per-origin `NameAllocator`, stable `displayName` and safe assignment/model/effort/cwd/skills/settled metadata, case-insensitive exact-name lookup with existing origin/direct-child authority, and consistent names in widgets, outcomes, controls, and pane titles. Retained follow-ups keep identity while updating assignment timing; settled names are not reused. Focused allocator/runtime/RPC/status tests cover concurrency, fallback exhaustion, reload-compatible nameless records, and authority isolation.

- [x] **T3 — Render launch, activity, control, and outcome details**
  - Depends on: T2.
  - Files: default `extensions/subagents.ts`, `lib/subagents/{child-surface,status,runtime}.ts`; proposed shared `lib/subagents/presentation.ts` and `tests/subagent-presentation.test.ts`.
  - Do: implement `renderCall`/`renderResult` and matching automatic-result presentation. Feed bounded UI-only execution updates while attached, using existing progress events and elapsed refresh; clean up subscriptions when waits end. Background acknowledgements stay honest. Use native expanded controls and current theme APIs; no extra summarization model call.
  - Verify: actual components rendered at narrow and normal widths for running, background started, detached, question, complete/partial/blocked/failed/cancelled, result plus cleanup failure, and expanded multiline output. Show resolved defaults even when absent from raw tool arguments. Observe no progress-triggered model messages. Ensure name-based wait/message/cancel identifies the same child.
  - Done when: useful assignment/configuration/result information replaces generic labels and JSON on the tool surfaces; all states render without conflating tool return and child completion.
  - Evidence: Added shared `lib/subagents/presentation.ts` renderers for launch/control calls, attached activity, background/detached acknowledgements, questions, all terminal outcomes, expanded metadata, bounded Markdown results, and automatic outcome messages. Wired parent and coordinator `subagent`/`subagent_control` tools plus custom message rendering. Attached waits receive coalesced UI-only progress and one-second elapsed refreshes; subscriptions and timers are removed when waits end. Added `tests/subagent-presentation.test.ts` covering narrow/normal rendering, running/background/detached/question/complete/partial/blocked/failed/cancelled states, cleanup errors, resolved defaults, expanded multiline output, and automatic outcomes. `pnpm run typecheck` and the focused presentation/status/runtime/RPC/child-outcome tests pass with the parent authority environment removed.

Scope checkpoint: finish the transcript requirement, not a dashboard, model telemetry system, or new delegation protocol.

- [x] **T4 — Integrate stable shared pane placement and titles**
  - Depends on: T1 layout proof, T2 identity.
  - Files: default `lib/subagents/{runtime,visible}.ts`, `lib/herdr-cli.ts`; proposed `lib/subagents/layout.ts` and `tests/subagent-layout.test.ts`. Change `scripts/pi-herdr-launch.mjs` only if title/lifetime integration actually requires it.
  - Do: apply the proven layout sequence to real plugin creation, with root-origin placement ownership, serialized mutations, returned IDs, human pane titles, and eight-per-tab overflow. Preserve no-focus semantics through splits/swaps/moves/closures. Handle partial launch cleanup through exact recorded owned resources; never infer process success from topology. Keep immediate ordinary cleanup and retained/intervention behavior unchanged.
  - Verify: deterministic planner/adapter tests for 1, 4, 5, 8, 9 and 17 children; concurrent starts; vacated slots; shared coordinator placement; cleanup and empty owned tabs; unrelated panes retained; process settlement before closure; retained follow-ups; reload reuses ownership rather than reconstructing from names.
  - Done when: production visible creation follows the layout contract and never relocates or replaces the orchestrator process or silently selects headless.
  - Evidence: Added `lib/subagents/layout.ts` and integrated it into `SubagentRuntime`/`VisibleChild`. Placement is origin-scoped, serialized, exact-ID based, titles panes with the existing stable display name plus role, preserves focus through split/swap/tab mutations, allocates/reuses deterministic slots, creates at most eight children per owned tab, and closes only recorded panes/empty overflow tabs. Added `tests/subagent-layout.test.ts` covering 1/4/5/8/9/17 allocation, concurrency, vacated slots, unrelated focus, exact IDs, and owned-tab cleanup. `pnpm run typecheck` and the focused default tests pass with the parent authority environment removed; the existing `herdr-background-focus.test.ts` remains opt-in skipped. The live geometry probe establishes server-side topology and focus only, not attached-client physical keyboard acceptance.

- [x] **T5 — Validate integrated UX and document actual behavior**
  - Depends on: T3, T4.
  - Files: default `tests/subagent-*`, relevant existing Herdr tests, `docs/subagents.md`, `docs/herdr.md` if needed, `pi/README.md`, `CHANGELOG.md`, AIF-020.
  - Do: run the finite checks below. Extend the T1 isolated fixture to exercise the production layout adapter. Add one bounded real bundled-Pi visible launch/follow-up/completion case using the worktree profile to verify metadata, human title, and unchanged cleanup. Do not rerun a live council/load benchmark. Update owning docs from pending to implemented only with evidence; record limits and actual profile.
  - Verify: commands and cases in Agreed validation. Fix demonstrated relevant failures and rerun affected checks only.
  - Done when: tests pass, layout and actual child acceptance evidence is recorded, task-owned test resources are removed, and docs accurately distinguish tested behavior from physical UI acceptance.
  - Evidence: Added opt-in `pi/profiles/default/tests/subagent-ux-live.test.ts`. Its isolated named Herdr fixture uses scratch config/state, separate named caller/unrelated workspaces, an inert `layout.inert` plugin, and a separate bundled `local.pi` link; it never touches the shared server, production plugin links, or user panes. The production `SubagentLayout` adapter passed the 1/4/5/8/9/17 geometry/slot run, title and exact-pane checks, caller identity and unrelated-focus preservation, with exact pane/tab/plugin cleanup. `cd pi/profiles/default && pnpm run typecheck` passed and `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts -t 'production layout'` passed (1 test, 1 unrelated real case skipped). With the worktree's local ignored auth/model store populated, `PI_SUBAGENT_UX_LIVE=1 PI_SUBAGENT_UX_LIVE_REAL=1 pnpm test subagent-ux-live.test.ts -t 'bundled Pi'` passed (1 test, 1 geometry test skipped), including visible launch, follow-up, completion, metadata/title, exact cleanup, and unrelated-focus preservation. `SubagentLayout` now discovers actual focus from focused workspace, tab, and pane list records rather than inherited caller-context `pane current`; `subagent-layout.test.ts` includes the caller-context regression (12 tests passed). Physical attached-client keyboard/focus behavior remains untested.

Scope checkpoint: no extra dashboard, retention policy rewrite, headless overflow, or broad verification campaign before closeout.

- [x] **T6 — Archive and integrate**
  - Depends on: T5.
  - Files: this spec directory and task-owned implementation/docs.
  - Do: set completion date/status, move the entire spec to `.specs/archive/subagent-transcript-and-pane-ux/`, update owning documentation reference, commit task changes and archive, merge into recorded `main` while preserving unrelated work. Reconcile the original task-owned plan/docs without overwriting concurrent edits. Do not push.
  - Verify: archive destination does not already exist; merged target contains implementation/archive and no active task copy; `git diff --check`; no uncommitted or unmerged task work before removing the task worktree. Rerun affected behavior only if conflict resolution changed it.
  - Done when: local integration is verified, or a concrete integration blocker is reported with the completed worktree retained.
  - Evidence: Completed implementation and agreed checks on 2026-09-08; archived the full spec and prepared the task branch for local integration into the recorded originating `main` checkout.

## Agreed validation and finish

Use existing pnpm dependencies and repository setup commands if the worktree needs dependency links. From the worktree default profile:

```sh
pnpm test subagent herdr-launch.test.ts herdr-background-focus.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts
pnpm run typecheck
pnpm run check:runtime
```

New presentation/layout tests are selected by the `subagent` filter. The opt-in `tests/subagent-ux-live.test.ts`, using `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts`, owns the isolated inert geometry and bounded real-child cases above. Reuse existing named-server/plugin isolation instead of building a general harness. Geometry checks populate 1/4/5/8/9/17 positions with inert processes, not seventeen models. The single real child checks actual bootstrap composition. Never stop the shared server, mutate production plugin links, or move the user's live panes for testing.

Run `git diff --check` from the repository root. Renderer tests establish actual component output; isolated CLI geometry proves topology and server-side focus, not physical attached-client keyboard experience. Report that limit rather than claiming human acceptance. No broad legacy suite or unrelated infrastructure testing is required.

## Current handoff

- Status: implementation and agreed historical validation completed on 2026-09-08.
- Completed: stable human identity, readable tool/outcome rendering, origin-owned pane placement, isolated geometry acceptance, and a real bundled-Pi visible launch/follow-up/completion check.
- Next: archive, commit, and integrate into the recorded originating `main` checkout.
- Verification limit: server-side geometry and focus were tested; physical attached-client keyboard experience was not claimed.
- Actual checks: agreed focused suite 95 passed with 6 opt-in skips; typecheck and runtime check passed; isolated geometry passed; separately opted-in bundled-Pi case passed.

## Post-archive correction

The historical checks above did not establish successful operator acceptance. The subsequent operator acceptance failed and reported stale reload ownership, focus/layout, and transcript defects. This archived plan must not be used as proof that the live UX was complete. The active `.specs/subagent-reload-and-live-ux/plan.md` reconciles the evidence: T1, T2, and T4 have bounded evidence, while T3 and T5 remain blocked and unfinished. The initial swap focuses the child, the 5+ child second row has incorrect physical geometry, and no model-backed or attached-client T5 run occurred. Its parent-resolved D1 requires explicit `/reload` to leave no active subagent runtime, conversation, or process, including idle retained children, with no special unsupported-active migration behavior. Source edits do not upgrade an already-running operator session, and the first transition from the earlier lifecycle was not live-tested.
