---
created: 2026-10-29
status: draft
completed: null
---

# Native agent sidebar entries and instance activity

## Goal and fixed scope

Implement the operator's sidebar organization and activity visibility in the default Pi profile, using existing installed Herdr capabilities only.

- Team Leads and subagent overflow appear as indented sidebar entries beneath their owning project, like the highlighted `task/commit-co…` child beneath `.dotfiles` in `C:/Users/mglenn/Pictures/Screenpresso/2026-10-28_19h12_19.png`. Separate top-level workspaces with descriptive names are not an acceptable substitute.
- Every Team Lead gets a dedicated entry from launch and retains it throughout its lifetime, including reopened follow-ups. Free space at the caller never moves it back inline. Preserve ancestry-based grouping of its descendants and team overflow.
- Preserve ordinary-agent inline placement, existing readable two-pane geometry, caller lower-half placement, ordinary overflow compaction, focus preservation, manual-layout protection, user-created tabs, and ownership-scoped cleanup.
- Show `agents: N active` next to Onclave in the footer for all active descendants belonging to chats in this Pi process, including inactive chats and nested leaves. Use a noticeable theme color distinct from the token statistics that follow it. Hide the indicator at zero. Results and questions still belong to the originating chat/coordinator.
- Explicitly distinguish stopped partial/blocked attempts from completed assignments. The orchestrator evaluates unfinished work, answers questions or resumes the saved child with concrete remaining work when possible. A partial result is not a reason to abandon the assignment or claim work is continuing.
- Preserve normal automatic closure. When completed agents are allowed to persist, the orchestrator should attempt cleanup through existing controls once they are no longer needed, preserving explicit user ownership and unrelated content.

Excluded: Herdr Rust/source changes, native builds, replacement binaries, Herdr deployment, Git worktrees/branches/checkouts as a layout mechanism, changes to agents' assigned working directories, cross-process activity registries, automatic runtime retry loops, and legacy-profile changes. Do not silently substitute flatter sidebar organization or broaden these exclusions to obtain a passing implementation.

Planning does not authorize implementation. A later `/do-it` authorizes this plan's Pi changes, normal implementation task-worktree/local-commit/integration workflow, unless `--no-merge` applies. That implementation isolation is distinct from creating Git worktrees to organize agents. Push and deployment are not authorized.

## Fresh-context handoff

Paths below are relative to `C:/Users/mglenn/.dotfiles` unless absolute. Integration target: this checkout's `main`; planning baseline `bd1e2c9ed07a01f7fc5e3430b112bb0be830dfdc`. Recheck state before execution. Planning profile verified through `pi_session`: `default`, session `01a187c8-e9f3-7507-af87-7d7ffde3b3c5`. Intended execution profile: default only.

Read applicable `AGENTS.md`, `pi/README.md`, `pi/profiles/default/docs/subagents.md`, `pi/profiles/default/docs/herdr.md`, and the installed Pi extension documentation for APIs actually changed. Use the pi-extension, TypeScript, testing, and prompting skills where applicable. Do not read historical legacy implementation to perform this work.

Relevant existing ownership:
- `pi/profiles/default/lib/subagents/layout-model.ts`: pure desired placement, ancestry, capacity.
- `pi/profiles/default/lib/subagents/layout.ts` and `herdr-layout-api.ts`: workspace destinations, pane migration, focus, names, cleanup.
- `pi/profiles/default/lib/subagents/runtime.ts`: process-local children across origins, status publication, saved-session follow-ups, origin-scoped mailboxes.
- `pi/profiles/default/extensions/subagents.ts`: binding current chat, footer status, automatic outcome delivery.
- `pi/profiles/default/lib/subagents/status.ts`, `presentation.ts`, `guidance.ts`: outcome text, UI presentation, coordinator instructions.
- `pi/profiles/default/extensions/session-launch.ts`, `lib/plan-run.ts`, and `scripts/pi-herdr-launch.mjs`: existing `/plans d` native worktree-open path. Evidence to investigate, not permission to copy its Git workflow into agent layout.
- Existing focused `subagent-*.test.ts` files and `subagent-ux-live.test.ts` own regression coverage.

Preserve unrelated changes, specifically incidental edits to `pi/profiles/default/skills/agent-process/references/failure-log.md`. Do not reuse the discarded native-Herdr implementation. No implementation or runtime acceptance has been performed for this replacement.

## Verified starting behavior and unresolved mechanism

Inspected on 2026-10-29 at the baseline above:
- `layout.ts: destinationWorkspace()` creates one ordinary `<origin title> · agents` workspace with `workspace create --cwd ... --label ... --no-focus`, shared by dedicated team and overflow tabs. This is not the requested individual child sidebar entries.
- `desiredLayout()` currently permits a sufficiently small first Team Lead group at the origin and recalculates that choice as membership changes. This conflicts with permanent dedicated placement.
- Runtime `list()` already accepts no origin to enumerate process-local children. `publish(origin)` currently supplies only `list(origin)` to that origin's status binding; the extension counts only `status === running`. The delivery mailbox is separately origin-scoped and must remain so.
- Existing records distinguish running, waiting, settled and terminal outcomes complete, partial, blocked, failed, cancelled. Follow-ups already reopen the same saved conversation within its owning runtime. Do not invent a second resumption system.
- The supplied screenshot proves installed Herdr renders the requested child structure. Installed `0.9.5-x86_64-pc-windows-msvc/herdr.exe` help was inspected directly: `worktree open` opens an existing Git worktree, accepts workspace/cwd plus path/branch and label/focus options; `workspace create` accepts cwd/label/env/focus, without a parent option; `workspace report-metadata` describes display-only tokens. None of these help outputs establishes an arbitrary workspace-parent association. Do not convert this evidence limit into a claim that the requested layout is impossible, or into authorization for Herdr changes.

**Readiness:** draft until the native association mechanism is documented with actual installed CLI/API/source evidence. The operator has answered the behavior questions; this is agent-owned technical investigation, not another product-approval question. Do not execute the sidebar task based on invented flags or an unverified metadata convention.

## Implementation contracts

### Sidebar ownership

Use the existing native child-entry mechanism once verified. Maintain exact owned workspace/tab/pane identities, preserving assigned child cwd independently of sidebar association. Each Team Lead and each ordinary/team overflow group has its own recognizable child entry beneath the correct owning project. Do not use the shared agents workspace as a disguised substitute. Keep existing lifecycle cleanup semantics: remove empty owned entries; preserve unrelated user content and manual names. Reopened leaders use the same logical grouping but need not retain an empty native workspace while their processes are closed.

### Activity

Count unique current child records across the instance once each, not parent-plus-descendant recursive sums. Count working/starting and waiting assignments while they remain unfinished, including parent/user/children waits. Exclude settled outcomes and mere retained cleanup records. A resumed assignment re-enters the count. Zero clears the status segment. Publish on lifecycle changes and bind/chat switches, without filesystem scanning, polling, or exposing another origin's result. Do not count children of independent Pi instances.

### Unfinished assignments

Report actual terminal state: a partial attempt has stopped; its text is available; it is not still running. Preserve explicit cancellation and user intervention. Describe the existing saved-session `subagent_control message` route and put follow-through responsibility with orchestrators/coordinators. Diagnose missing prerequisites rather than blindly retrying. Do not add automatic resumption, scheduled retries, extra approval gates, or overwrite the first attempt's evidence with later follow-up results.

## Execution guidance

Use runtime-prepared task coordinates when present. Otherwise record normal task-worktree coordinates and the original `main` integration target before implementation. Do not recreate the retired task worktree. Before delegating execution consult Strategist unless the operator explicitly requests a single-agent handoff; Team Leads retain their own Strategist-first workflow. At most one named task per worker. Keep disjoint owners concurrent and sequence shared-file changes.

Adapt routine mechanisms within fixed scope. Continue independent tasks around technical blockers. Ask before changing behavior, scope, or acceptance. Keep evidence/checklists accurate; neither passing unit tests nor accepted API calls establish visible sidebar rendering. No new review ceremony or unrelated fixes.

## Tasks

- [ ] **T1: Permanent dedicated Team Lead placement**
  - Depends on: none. Parallel with T2 and T3.
  - Own `layout-model.ts` and `tests/subagent-layout-model.test.ts`.
  - Remove origin-row eligibility for Team Leads; preserve ordinary origin capacity/overflow compaction, team descendant placement and existing minimum geometry. Establish the desired-slot/group-key contract consumed by T4, including team overflow keys.
  - Verify: from `pi/profiles/default`, `pnpm test subagent-layout-model.test.ts`.
  - Done: a leader is dedicated with zero or many descendants, after ordinary agents settle, and in narrow windows; ordinary behavior remains covered.
  - Evidence: not started.

- [ ] **T2: Instance-wide active footer, origin-scoped delivery**
  - Depends on: none. Parallel with T1 and T3.
  - Own `runtime.ts`, `extensions/subagents.ts`, and runtime/session-lifecycle tests.
  - Expose a process-local activity snapshot/count independently of delivery bindings. Refresh the active UI for changes from any origin; bind immediately on chat switch. Use the activity contract above, including nested/waiting/resumed records. Preserve mailbox ownership, acknowledgement and reload/shutdown rules. Use the existing footer status integration, not a new widget. Render active status in a noticeable theme color distinct from following token statistics; hide it at zero.
  - Verify: `pnpm test subagent-runtime.test.ts subagent-session-lifecycle.test.ts` in default profile.
  - Done: chat B shows work launched from A, receives no A results, nested children count once, settled children disappear, and follow-ups become active again.
  - Evidence: not started.

- [ ] **T3: Accurate stopped-attempt outcomes and coordinator follow-through**
  - Depends on: none. Parallel with T1 and T2.
  - Own `status.ts`, `presentation.ts` if needed, `guidance.ts`, and focused status/presentation/guidance/terminal-outcome tests.
  - Make partial/blocked terminal messages explicit without mislabeling completed follow-ups or cleanup. Add concise coordinator guidance to assess unfinished results and resume/answer through existing controls when appropriate, not claim ongoing work after stop. Keep cancellation and direct-user ownership authoritative; no runtime auto-retry mechanism. Include coordinator guidance to attempt existing cleanup controls for completed agents that remain open and are no longer needed, without replacing normal automatic closure or closing user-owned resources.
  - Verify: `pnpm test subagent-status.test.ts subagent-presentation.test.ts subagent-guidance.test.ts subagent-terminal-outcomes.test.ts`.
  - Done: model and operator presentation distinguish stopped, working again, completed and blocked, and preserve the supported saved-session resumption contract.
  - Evidence: not started.

- [ ] **T4: Native project-child entries for leaders and overflow**
  - Depends on: verified native association contract below and T1's desired slots/group keys, not T2/T3.
  - Own `layout.ts`, `herdr-layout-api.ts` and layout/UX tests.
  - Replace the shared agents-workspace destination with one native grouped entry per Team Lead/overflow group using the verified installed interface. Preserve cwd, exact ownership, process identity through moves, focus, geometry, manual protection and cleanup. No native-source edits or Git layout workaround.
  - Verify: `pnpm test subagent-layout-model.test.ts subagent-layout.test.ts`; extend the existing bounded inert isolated-Herdr UX scenarios for the native association and leader/overflow lifecycle. Run `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts` using installed Herdr only. Do not enable the optional model-backed suite or build Herdr.
  - Done: native state establishes the actual parent-child relationship for each entry with unchanged child cwd and correct cleanup. Mocked workspace labels alone do not satisfy the task.
  - Evidence: not started; association contract pending planning investigation.

- [ ] **T5: Documentation and finite integrated checks**
  - Depends on T1–T4 implementations.
  - Own `pi/README.md`, default `docs/subagents.md`, relevant `docs/herdr.md` guidance, and root `CHANGELOG.md`.
  - Document actual sidebar organization, footer semantics, stopped-attempt follow-through, preserved behavior, and normal settled-only reload/restart boundary. Remove obsolete shared-agents-workspace claims only where this implementation replaces them.
  - Run the focused commands above once against integrated code and `pnpm run typecheck` from default profile. Rerun only affected checks after task-related corrections. No dependency installation unless actually required; pnpm only.
  - Record actual date, profile, commands/results and unverified attached-client rendering honestly. Operator manual UI use is non-blocking, not another approval or acceptance gate.
  - Evidence: not started.

- [ ] **T6: Authorized local integration and cleanup**
  - Depends on T5 passing agent-owned checks.
  - Update task evidence; archive the entire spec to `.specs/archive/native-agent-sidebar-and-activity/` and commit with implementation on the task branch. Do not archive unfinished work.
  - For `/do-it`, dispatch Integrator after the task commit with the exact recorded target and closeout manifest. Prepared Herdr runs use the same-tab successor: establish integration readiness, finish authorized orchestrator obligations, release exact origin, then successor cleans up and reports. Direct runs keep parent-owned communication. `--no-merge` intentionally retains the committed worktree and skips mutating integration.
  - Done: authorized merge, completion metadata commit and clean task-worktree removal verified, or explicit accurate blocked/no-merge/cleanup-pending result. No push or deployment.
  - Evidence: not started.

## Native association contract

Not yet established. Direct read-only help on the installed Herdr 0.9.5 executable confirms the existing commands above. Read-only inspection of local `src/app/api/worktrees/reads.rs` shows worktree-open resolves an entry from Git's existing-worktree list; `src/app/api/worktrees.rs` records that entry as workspace membership. This establishes how the existing plan-launch path obtains grouping, but not a compliant agent-workspace association independent of Git worktrees. The local source checkout contains rejected-plan changes in client/sidebar files, so those changed files are not evidence of installed capability.

Further investigation must identify a supported installed association/rendering mechanism while preserving the fixed restrictions. No installed server mutation or attached-client acceptance was attempted. Do not manufacture parent tokens, falsify Git membership, edit persisted Herdr state, or interpret failure to find an interface as permission for native changes. Keep this plan draft until the actual mechanism is established; no additional behavior decision is being requested from the operator.

## Current handoff and final response

Status: draft. No replacement implementation performed. Next: finish the existing native grouping investigation and resolve the association contract before setting ready. Independent footer/model/outcome task boundaries are specified, not executed.

At execution closeout lead with one explicit overall result: 🟢 COMPLETED, 🔴 NOT COMPLETE: MERGE BLOCKED, 🔴 NOT COMPLETE: USER INPUT REQUIRED, 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED, or 🟡 CLEANUP PENDING. For blockers state reason, action and owner before successes. Report checks, commits, integration result, spec and retained paths. Do not label the plan completed while integration or required cleanup remains unfinished.
