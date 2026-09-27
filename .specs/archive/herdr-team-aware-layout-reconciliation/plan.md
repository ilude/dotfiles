---
created: 2026-09-27
status: ready
completed: null
---

# Keep Herdr subagent layouts sane through lifecycle and team changes

## Goal and scope

- User requirements and settled decisions:
  - Replace the current flat four-per-row layout policy with lifecycle-triggered, observed-state reconciliation for visible Herdr subagents. Do not add polling or a model-driven layout monitor.
  - Ordinary direct subagents fill shared rows left-to-right, up to five panes per row. One occupied agent row uses the top third and leaves the original orchestrator the lower two-thirds. A second occupied row uses the middle third and leaves the orchestrator the bottom third. The eleventh ordinary descendant begins overflow placement.
  - Every visible Team Lead reserves an exclusive team row immediately. The Team Lead is the leftmost pane and all visible descendants in its subtree fill to its right, up to four additional panes in that row. The team may use a second wholly available row. If no second row is available when needed, move the entire live team to a dedicated tab. On a dedicated tab, treat the Team Lead as that tab's orchestrator-like bottom pane and place descendants in one or two five-pane rows above it.
  - Nested Team Leads and all their visible descendants form their own team groups under the same policy. Ordinary direct subagents never occupy a Team Lead's reserved row.
  - A dedicated team may automatically return to available parent-tab rows after shrinking. Keep this enabled for the initial implementation and make its actual movement part of bounded live evaluation; changing that policy later requires user approval.
  - Compact surviving ordinary panes leftward after departures. Preserve live pane/process identities during all reflow and migration. Never recreate a running agent pane.
  - A manual geometry change marks the affected managed tab dirty. Continue ownership reconciliation, cleanup, and safe title handling, but suspend automatic resizing and structural migration for that dirty tab. Do not poll to discover changes; compare observed geometry with the last controller-applied snapshot at lifecycle boundaries.
  - Only the original orchestrator pane, owned visible subagent panes, and tabs created by this layout owner may be resized, moved, renamed, or closed. Preserve focus best-effort under the existing non-atomic Herdr limitation. Never mutate unrelated panes or tabs.
  - If topology or migration cannot be repaired safely, leave live panes intact and expose one bounded, inspectable degraded-layout diagnostic. Do not repeatedly retry or generate chat notification noise.
  - Exercise isolated live Herdr behavior through twelve visible panes, including team migration and return, nested teams, and varied departure orders.
- Non-goals:
  - No autonomous monitoring subagent, periodic daemon, general-purpose tiling engine, cross-origin layout management, pane recreation, or recovery across Pi process restart/reload.
  - Do not change headless subagent behavior, delegation authority, result transport, direct Pi tabs, unrelated Herdr tools, or the rule that active subagents are unsupported across `/reload`.
  - Attached-client visual acceptance remains operator-observed and non-blocking; automated checks must not claim to prove it.
- Authorization: this plan authorizes planning only. A later `/do-it` authorizes local implementation, task commits, archival, local integration, and task-worktree cleanup under the closeout contract. Push, deployment, Herdr server replacement, and production plugin relinking are not authorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read current applicable `AGENTS.md` files before acting. Ignore `pi/profiles/legacy/`.

- Owning repository and boundary: the dotfiles repository owns the default Pi profile and Herdr integration. Keep all changes under this repository; `modules/onclave/` is out of scope.
- Required reading:
  - `pi/profiles/default/docs/subagents.md`
  - `pi/profiles/default/docs/herdr.md`
  - `pi/profiles/default/lib/subagents/layout.ts`
  - `pi/profiles/default/lib/subagents/visible.ts`
  - `pi/profiles/default/lib/subagents/runtime.ts`
  - `pi/profiles/default/lib/subagents/rpc.ts`
  - `pi/profiles/default/lib/subagents/herdr-layout-api.ts`
  - `pi/profiles/default/tests/subagent-layout.test.ts`
  - `pi/profiles/default/tests/subagent-ux-live.test.ts`
  - `pi/profiles/default/skills/testing/SKILL.md` before changing tests
  - `pi/profiles/default/skills/typescript/SKILL.md` before changing TypeScript
- Verified starting behavior, 2026-09-27 at `72224acf`:
  - `SubagentLayout` owns only panes it opens, serializes operations per origin, reconciles disappeared panes before placement, and balances remembered two-by-four slots after placement and close.
  - `CHILDREN_PER_ROW` is four and `CHILDREN_PER_TAB` is eight. The ninth child starts a generic overflow tab. Layout state uses incremental vacancy bookkeeping (`halfVacancies`, `rightSplitLowerSlots`) and does not model team ancestry or dirty/degraded states.
  - `LaunchSpec` and `ChildRecord` already carry `parentId`, and role definitions identify `teamlead`; `VisibleChild` currently passes neither fact into `SubagentLayout.place()`.
  - The installed matching Herdr client/server is `0.9.1-preview.2026-09-21-0ff0f27e2226`, protocol 22. Its CLI advertises `pane move <pane> --tab <tab> --split right|down [--target-pane ...]` and `pane move <pane> --new-tab [--workspace ...]`, as well as exact-pane split, swap, resize, close, and layout inspection. Same-workspace multi-pane migration, returned identity behavior, focus behavior, and process preservation have not yet been accepted in the isolated test harness.
  - Existing focused unit and opt-in isolated tests cover the old flat 1/4/5/8/9 geometry, focus preservation, vacancy refill, overflow naming, and exact caller/process identity. They do not cover five-wide rows, group-aware placement, live tab migration, dirty detection, or shrink return.
  - External design evidence informing the controller shape: Zellij reapplies pane-count-constrained layouts and suspends auto-layout after manual changes; tmux recomputes canonical layouts after pane changes; i3 separates logical placeholders from current occupants; Kubernetes-style reconcilers compare current state with desired state idempotently. These are patterns only, not assumed Herdr features.
- Work to preserve: the planning checkout already has unrelated modifications in `CHANGELOG.md`, command/reload implementation, documentation, and tests. Recheck status before execution and do not edit, stage, overwrite, or revert those changes from the planning checkout. Use a dedicated task worktree. A task-owned changelog edit must be integrated without discarding the existing unrelated `CHANGELOG.md` work.
- Worktree and integration target: originating checkout is `C:/Users/mglenn/.dotfiles`, branch `main`, at the revision recorded above. During execution record the actual task worktree, task branch, current target revision, and any target movement before edits.
- Profiles: planning was performed with the repository-owned default profile at `C:/Users/mglenn/.dotfiles/pi/profiles/default`, model `gpt-5.6-sol`, on 2026-09-27. Execute with the default profile. Record actual runs separately; intended profile and static inspection are not test evidence.

## Decisions and implementation contract

### Desired layout model

- Make current live ownership and ancestry the source for group membership. Events only request reconciliation; each pass must inspect current owned/live panes rather than assuming the event completely describes the state.
- Preserve a stable logical ordering for each group and derive desired slots from that ordering. Physical Herdr split history must not be the sole source of truth. Ordinary groups compact leftward. Team membership includes all visible descendants in the Team Lead's subtree; nested Team Leads establish their own nested group rather than being flattened into the ancestor's ordinary child slots.
- The main orchestrator tab has at most two managed agent rows. Ordinary agents can share a row of five. A Team Lead row is exclusive to that team. Do not displace unrelated live panes repeatedly to make a partially grown team fit: reserve the row when the Team Lead is placed, use a second wholly available row when its subtree exceeds the first row's capacity, and migrate the team when that capacity cannot be provided.
- A dedicated team tab has one stable leader pane acting as the bottom anchor. With one descendant row, that row occupies the top third and the leader receives the lower two-thirds. With two descendant rows, each uses one third and the leader receives the bottom third. The leader remains the leftmost member only while represented in a shared parent-tab team row; it is not duplicated when it becomes the dedicated tab anchor.
- Generic overflow remains available for ordinary agents that exceed the main tab's free shared-row capacity. Tab allocation and naming may be refactored as needed, but caller and unrelated tabs remain untouched and existing manual-title protection remains effective.

### Reconciliation and movement

- Serialize placement, closure, migration, and reconciliation through the origin-owned layout queue. Coalesce lifecycle bursts with a short bounded debounce only where doing so does not delay launch identity assignment or pane cleanup; do not add a perpetual timer.
- A reconciliation pass must: inspect live owned panes and relevant managed tabs; remove disappeared owned panes from placement state without selecting stale anchors; derive desired grouping and slots; detect dirty tabs against the last successfully applied controller geometry; apply only safe ownership-bounded moves/resizes/title changes; reinspect once; and either record convergence or one degraded diagnostic.
- Treat movement as successful only after Herdr returns an exact identity and inspection proves the same live process/agent occupies the intended destination. Update every runtime/layout reference if Herdr changes a pane ID. A failed or ambiguous move must be inspected before any retry. Never replay a movement blindly.
- Team migration and automatic return remain enabled only if T1 proves process/agent continuity and controllable focus for the needed same-workspace operations. If that proof fails, stop the dependent migration work, preserve the independent five-wide/reconciliation work, and ask the user whether to change the settled migration policy. Do not silently substitute dedicated tabs from launch, another workspace, process recreation, or disabled return.
- Dirty detection is boundary-based because polling was rejected. A controller-applied geometry snapshot needs cell-rounding tolerances so ordinary Herdr rounding does not become a false manual edit. Once dirty, skip geometry and structural moves for that tab while continuing cleanup and non-geometric ownership reconciliation. No reset command is required in this scope.
- A nonrepairable topology or ambiguous mutation is a degraded state, not permission to reconstruct live processes. Surface a sanitized bounded diagnostic through existing subagent inspection/outcome records without repeated chat chatter. Successful later reconciliation may clear a transient degraded state only when current inspection proves convergence.

### Documentation and compatibility

- Update the current behavior descriptions in `pi/README.md`, `pi/profiles/default/docs/subagents.md`, and `pi/profiles/default/docs/herdr.md`; do not leave the old two-by-four contract described as current. Retain historical evidence as historical and label new live evidence by date/version/scope.
- Update root `CHANGELOG.md` because this is a material operator-facing layout and workflow change. Preserve concurrent changelog content during integration.
- Do not add dependencies unless implementation evidence makes one necessary and the user approves the scope change.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Preserve unrelated work and carry task-owned uncommitted plan content without deleting its source.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt technical mechanisms when repository evidence requires it, but do not change user intent, scope, settled decisions, or acceptance without approval. When blocked, continue independent tasks and ask only for the specific consequential input or external prerequisite. Do not add audits, optional improvements, speculative fixes, or acceptance requirements. At meaningful phase boundaries, remove only task-introduced drift and resume the next required step.

Keep checkbox state, concise evidence, current blockers, and the next action accurate. Leave unfinished integration/cleanup checkboxes unchecked. For blockers, record the specific issue, next action, and who must act; archival and passing tests alone are not whole-plan completion. Do not stop at a phase boundary or substitute a promise for available work. Fix demonstrated task-relevant failures and stop testing when the finite agreed checks pass.

## Tasks

- [x] **T1: Prove Herdr live-pane migration primitives in isolation**
  - Depends on: none.
  - Parallel with: T2.
  - Files/inputs: `pi/profiles/default/tests/subagent-ux-live.test.ts`; proposed `.specs/herdr-team-aware-layout-reconciliation/experiments.md`; installed Herdr CLI help and a fresh isolated named server only.
  - Change: add a bounded opt-in inert-pane scenario that creates a representative caller, Team Lead, descendants, and unrelated focused pane; moves a complete live team into a new same-workspace tab using the installed exact CLI primitives; builds leader-bottom geometry; moves it back into target rows; and records exact returned IDs, source-tab retirement behavior, process identities, agent/pane labels, layout geometry, and focus before/after. Cover sequential multi-pane migration and an intentionally interrupted/failed move sufficiently to establish the inspect-before-retry boundary. Record commands, Herdr version, observed identity semantics, and result in `experiments.md` without production-server mutation.
  - Complexity / split hints: the important judgment is whether IDs, process identity, and focus remain trustworthy across a series of moves, not merely whether the CLI exits zero. Keep the experiment finite and cleanup its isolated server even on failure.
  - Verify: from `pi/profiles/default`, run the new focused case with `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts` against the isolated server and inspect its bounded evidence.
  - Done when: same-workspace migration to a dedicated tab and return either pass with exact identity/process/focus evidence, or the plan records a concrete unsupported behavior and blocks only migration-dependent tasks pending the user's policy decision.
  - If blocked: do not test against or restart the shared production server. Record the failing command/result and continue T2 plus any ordinary-layout work independent of migration.
  - Evidence: Isolated Herdr 0.9.1-preview raw and production-layout movement scenarios passed with stable terminal identities and preserved unrelated focus; see `experiments.md`.

- [x] **T2: Establish a pure group-aware desired-layout contract**
  - Depends on: none.
  - Parallel with: T1.
  - Files/inputs: `pi/profiles/default/lib/subagents/layout.ts` or proposed focused modules under `pi/profiles/default/lib/subagents/`; `pi/profiles/default/lib/subagents/rpc.ts`; `pi/profiles/default/lib/subagents/runtime.ts`; `pi/profiles/default/tests/subagent-layout.test.ts` or a proposed focused pure-model test.
  - Change: define the minimum typed metadata passed to layout ownership for role, parent identity, and ancestry; derive ordinary groups, Team Lead subtrees, nested teams, reserved rows, dedicated-team layouts, stable ordering, five-wide slots, and shrink-return destinations independently from Herdr mutation commands. Ensure the model distinguishes leader-as-shared-row-member from leader-as-dedicated-tab-anchor and can update pane identities after a move. Replace special-case vacancy state where the pure model makes it obsolete, while retaining ownership evidence needed for cleanup.
  - Complexity / split hints: ancestry can change only through known runtime launches/settlements, but visible descendants may start concurrently. Keep pure allocation deterministic and testable without a Herdr fixture before integrating mutations.
  - Verify: run the focused pure/unit tests covering ordinary counts 1, 5, 6, 10, 11, and 12; Team Lead plus 0/1/4/5/9 descendants; reservation beside ordinary agents; nested Team Lead grouping; departures and left compaction; and desired migration/return decisions.
  - Done when: a deterministic tested desired-state API produces the agreed rows/tabs/groups from current live ownership and ancestry without consulting physical split history.
  - Evidence: Added `layout-model.ts` and 14 passing deterministic cases covering ordinary boundaries, reservation, growth, migration choice, nested teams, and shrink return.

- [x] **T3: Reconcile ordinary five-wide layouts and dirty/degraded state**
  - Depends on: T2's desired-state API.
  - Parallel with: migration-specific implementation in T4 only after shared interfaces from T2 are integrated and write ownership is separated; otherwise execute serially.
  - Files/inputs: `pi/profiles/default/lib/subagents/layout.ts`; `pi/profiles/default/lib/subagents/herdr-layout-api.ts` if a narrowly typed inspection helper is needed; `pi/profiles/default/lib/subagents/visible.ts`; `pi/profiles/default/lib/subagents/rpc.ts`; relevant focused tests.
  - Change: make lifecycle events request serialized observed-state reconciliation; implement five-pane ordinary rows, dynamic one-row/two-row orchestrator height, left compaction, generic overflow after capacity, bounded burst coalescing where safe, and one verification read. Add controller geometry snapshots and tolerant dirty detection at lifecycle boundaries. Add bounded degraded-state reporting through existing records while keeping completed pane cleanup honest and avoiding repeated notices. Preserve exact focus behavior, title protection, already-absent cleanup, caller identity, and unrelated panes/tabs.
  - Complexity / split hints: avoid coupling launch readiness to a debounce that can hide the exact created pane. Layout correction after close must distinguish successful pane closure from later reconciliation degradation, as the current cleanup contract does.
  - Verify: from `pi/profiles/default`, run `pnpm test subagent-layout.test.ts subagent-cleanup.test.ts`; add focused cases for 1/5/6/10/11/12 ordinary panes, simultaneous departures, several close orders, manual resize becoming dirty, rounding not becoming dirty, degraded topology reporting once, and no mutation of unrelated panes.
  - Done when: ordinary lifecycle churn converges to the agreed five-wide geometry when clean, preserves manual geometry when dirty, and leaves unsafe layouts intact with inspectable bounded diagnostics.
  - Evidence: Five-wide production placement, lifecycle-boundary dirty detection, serialized reconciliation, stale-caller rebinding guarded by terminal identity, existing bounded lifecycle error reporting, and focused layout/cleanup checks pass.

- [x] **T4: Integrate Team Lead reservation, migration, nested groups, and automatic return**
  - Depends on: T1 passing migration evidence; T2's desired-state API; T3's serialized reconciliation and diagnostic contracts.
  - Files/inputs: `pi/profiles/default/lib/subagents/runtime.ts`; `pi/profiles/default/lib/subagents/visible.ts`; `pi/profiles/default/lib/subagents/layout.ts` and any task-introduced focused layout modules; focused unit/integration fixtures.
  - Change: pass authoritative role/parent metadata from runtime launches into layout ownership; reserve Team Lead rows at launch; place all visible subtree descendants under the correct group; expand to a second wholly available row; migrate the complete team into a dedicated tab when required; treat the leader as that tab's bottom anchor; handle nested Team Leads as their own groups; and return a shrunken team automatically when clean parent capacity exists. Update exact pane IDs atomically in both layout and child records after successful Herdr moves. Serialize concurrent launches, exits, and migrations and preserve focus/process identity.
  - Complexity / split hints: this is the highest-risk state transition. Stage a migration from an inspected source snapshot, apply one exact move at a time, update identity only from verified responses, and stop with a degraded diagnostic on ambiguity. Do not attempt compensating process recreation or an unproven rollback sequence.
  - Verify: run focused fixture tests for immediate row reservation, ordinary/team coexistence, team growth through first and second rows, migration when no row is free, leader-bottom dedicated geometry, nested Team Lead separation, shrink return, simultaneous team exits, dirty-tab suppression, and a mid-migration failure that preserves every live process and reports degradation.
  - Done when: group-aware transitions preserve every live process/pane occupant and implement the settled reservation, migration, nested-team, and automatic-return behavior under deterministic tests.
  - If blocked: if T1 disproves required Herdr movement, leave this task unchecked, preserve completed independent tasks, and ask the user for the specific policy change; do not choose a fallback silently.
  - Evidence: Runtime passes parent/role metadata; the live production layout migration/return scenario preserves terminal identities; pure nested-team tests pass.

- [x] **T5: Complete bounded automated acceptance and operator documentation**
  - Depends on: T3 and T4 complete.
  - Files/inputs: `pi/profiles/default/tests/subagent-ux-live.test.ts`; other affected focused tests; `pi/README.md`; `pi/profiles/default/docs/subagents.md`; `pi/profiles/default/docs/herdr.md`; root `CHANGELOG.md`.
  - Change: update the isolated inert live test to exercise exact geometry and identities through twelve panes, ordinary overflow, Team Lead reservation, dedicated migration, nested teams, varied upper/lower and whole-group departure orders, and automatic return. Keep the model-backed case separately opt-in. Update current documentation and changelog with the new policy, ownership limits, dirty/degraded behavior, tested Herdr version, and honest attached-client limitation. Remove or relabel stale current-contract statements without erasing historical evidence.
  - Complexity / split hints: do not turn one live test into an unbounded permutation suite. Select representative transition boundaries and failure modes; deterministic unit tests own combinatorial allocation coverage.
  - Verify from `pi/profiles/default`:
    - `pnpm test subagent-layout.test.ts subagent-cleanup.test.ts subagent-herdr-live.test.ts`
    - `pnpm test subagent herdr-launch.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts`
    - `pnpm run typecheck`
    - `pnpm run check:runtime`
    - `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts`
  - Done when: finite unit/runtime checks pass, the isolated live test proves exact geometry/process identity and cleanup through twelve panes on the recorded Herdr version, and documentation accurately states both proven behavior and remaining attached-client limits.
  - Evidence: Typecheck and the 60-test focused layout/cleanup suite pass; the isolated live suite passes four inert scenarios, including cross-workspace caller-ID resolution followed by placement, with one separately gated real-model case skipped. Documentation and changelog are updated.

- [ ] **T6: Archive, commit, integrate, and clean up the authorized task**
  - Depends on: T1-T5 complete with agreed checks passing and no unresolved migration-policy blocker.
  - Files/inputs: all task-owned implementation, tests, documentation, changelog, and `.specs/herdr-team-aware-layout-reconciliation/`.
  - Change: update evidence and handoff state; archive the complete spec; commit implementation and archived spec on the task branch; then use the authorized Integrator workflow from the recorded target checkout for local integration and worktree cleanup. Preserve concurrent target changes and resolve ordinary merge conflicts without dropping either side.
  - Verify: inspect task and target status, archive location, task commits, integrated diff, completion metadata commit, and worktree removal. Rerun checks only if integration changes executable content or earlier evidence became stale.
  - Done when: implementation and completion metadata are integrated into the recorded target, the task worktree is removed, and push/deployment remain untouched.
  - Evidence: Not started.

## Agreed validation and current handoff

- Agent-owned checks are the finite commands in T1-T5. Unit tests own allocation/group edge cases; the isolated inert Herdr test owns live mutation, identity, geometry, focus, and cleanup evidence. The separately opt-in model-backed test is not required unless implementation changes model/session behavior beyond layout metadata transfer.
- Live acceptance must use a fresh isolated named Herdr server, isolated config/plugin registry, inert processes, and an explicit test socket. Never stop, relink, or mutate the shared production server during tests.
- Automated evidence does not prove attached-client rendering or whether automatic shrink-return movement feels distracting. That operator observation is a non-blocking verification limit after integration. The settled initial behavior remains automatic return unless the user later asks to disable it.
- Status: implementation and agent-owned checks complete; task commit/integration pending.
- Completed work and evidence: T1-T5 are complete. `pnpm run typecheck`, `pnpm run check:runtime`, 60 focused layout/model/cleanup tests, and the isolated live Herdr suite (4 passed, 1 separately gated real-model case skipped) pass. The broader requested subagent command produced 293 passes and 11 skips, plus seven environment/pre-existing failures: unavailable authenticated Codex model resolution and existing session/strategist result-shape assertions unrelated to the touched layout paths. Focused task checks remained green afterward.
- Next: archive and commit the task, then dispatch Integrator from the recorded target checkout.
- Blockers/open decisions: none.
- Verification limits: attached-client rendering and whether automatic return feels distracting remain operator-observed, non-blocking limits. The isolated suite proves same-workspace migration/return, five-wide geometry, dirty-state unit behavior, focus, cleanup, and exact terminal identity on the recorded Herdr preview.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/herdr-team-aware-layout-reconciliation/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together on the task branch. Do not archive unfinished implementation.

For authorized `/do-it` execution, after the task commit dispatch the Integrator from the recorded target checkout with the closeout manifest. The Integrator owns local integration and cleanup; the orchestrator owns user questions and final reporting. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery. If `--no-merge` applies, do not dispatch the Integrator for mutation; keep the committed worktree and report integration as intentionally pending.

The Integrator verifies the target and archive, records the actual completion date, status, and evidence, commits that metadata, then removes the clean task worktree. It reports CLEANUP PENDING if integration or metadata succeeded but cleanup did not. Push and deployment require explicit user authorization, which has not been given. Operator manual testing does not block closeout.

### Final response

Start with one overall outcome, using the colored symbol and explicit text together:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing; state the precise question and recommendation where applicable.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under `--no-merge`; retained worktree is intentional, not a failure or required fix.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are already on the target, but worktree cleanup is unfinished.

For blocked or cleanup-pending outcomes, immediately give **Reason** and **Action needed**, naming the issue, who must act, and the exact next action before successes. Do not imply automatic resumption or hand available agent-owned work to the user. If several issues remain, lead with the blocking outcome and list required actions. Then give concise checks, spec location, branch/commits, merge result, and retained worktree or cleanup remnants. Never rely on color alone or lead a blocked result with a success summary. These are response labels, not new frontmatter states.
