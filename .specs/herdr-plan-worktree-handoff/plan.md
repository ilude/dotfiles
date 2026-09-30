---
created: 2026-09-30
status: ready
completed: null
---

# Run plans in Herdr worktree workspaces with an Integrator closeout handoff

## Goal and scope

Make a plan launched with `d` in `/plans` visibly belong to its task worktree in Herdr. Start the new Pi orchestrator in that worktree, not in the original checkout. At closeout, launch an Integrator in a new pane of the same tab, with its cwd set to the recorded parent checkout. After successful integration, the Integrator survives the orchestrator's graceful exit, removes the task worktree, and gives the final operator report from its remaining pane.

Settled user requirements:

- Leave the `/plans` interface unchanged. Its keys, picker, preview, selection, launch acknowledgment, and repeat-input handling stay intact. The behavior behind `d` changes.
- Prepare the worktree before launching the new Pi instance. Use Herdr's native worktree grouping, not a parallel plan dashboard or a tab label standing in for Git provenance.
- Show the live orchestrator in the worktree context, using existing Herdr Pi lifecycle reporting.
- Put the Integrator in a new pane of the orchestrator's existing tab, running in the parent checkout and branch. Do not put it in another workspace or overflow tab.
- The Integrator performs local integration and closeout. Once integration and completion metadata have succeeded, it closes its orchestrator gracefully, cleans up the task worktree, and owns the final report. Keep the Integrator pane available to the user after reporting.
- If integration or a consequential closeout decision prevents that success boundary, preserve both panes and the worktree so the user can deal with it. Continue routine agent-owned conflict resolution within the existing closeout contract.
- After the task is integrated, worktree removal is routine cleanup. A removal failure leaves the surviving Integrator reporting `CLEANUP PENDING` and the exact retained path. It does not justify rollback machinery or another approval ceremony. An orchestrator already closed is not recreated just to restore a two-pane display.

Preserved behavior and non-goals:

- This integrated lifetime applies to the prepared Herdr worktree run launched by `d`. Direct `/do-it`, `/plans` run-here, ordinary new/resumed/branched Pi instances, and non-Herdr execution retain their existing paths unless needed to consume the same preparation contract correctly.
- `--no-merge` still means no mutating Integrator dispatch and intentional worktree retention. Do not retire that orchestrator as though integration occurred.
- Preserve explicit plan authorization for push/deployment. The Integrator remains local-only; do not give it push, deployment, branch deletion, or broad terminal-control authority.
- Preserve ordinary subagent ownership, parent-loss behavior, user intervention, automatic pane cleanup, and team/overflow layouts. The closeout successor is an explicit, narrow exception, not a general detach option.
- Do not change Herdr itself, upgrade or restart the production server, relink a disposable worktree into production, introduce Onclave coordination, create a durable orchestration service, or add a second plan-status registry.
- Do not redesign Git conflict handling, add rollback, run a general safety audit, or require manual UI acceptance before authorized completion.

Authorization: this plan authorizes no implementation or Git mutations by itself. `/do-it` execution authorizes implementation, dedicated task worktrees, local commits, and local integration into the recorded originating checkout unless `--no-merge` or a later user restriction applies. Push and deployment are not authorized for this plan.

## Fresh-context handoff

All paths below are relative to the dotfiles repository root unless stated otherwise. This is dotfiles-owned default-profile runtime work. No module changes or legacy-profile work are in scope. Read current applicable `AGENTS.md` files before acting.

Verified planning environment, 2026-09-30:

- Checkout: `C:/Users/mglenn/.dotfiles`, branch `main`, revision `00398570`.
- Planning profile: `pi/profiles/default/`, installed Pi documentation version `0.99.1`.
- Herdr client: `0.9.2-preview.2026-09-29-8e78f929d8f0`; running server: `0.9.1-preview.2026-09-21-0ff0f27e2226`. Read-only `worktree list` succeeded. The native create/open/grouping behavior is documented at the exact server revision; no live worktree mutation or attached-client acceptance was performed during planning.
- Pre-existing dirty file: `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`. Preserve it and recheck status before writing. Other sessions can change the checkout.
- Intended implementation profile: default. Record actual execution cwd/profile, date, and checks separately from these planning observations.
- Proposed implementation worktree/branch for this plan itself: `.worktrees/herdr-plan-worktree-handoff`, `task/herdr-plan-worktree-handoff`. Record actual values and the originating checkout/branch before editing. Preserve task-owned uncommitted spec content and its source.

Required source reading:

- `pi/profiles/default/extensions/plans.ts`
- `pi/profiles/default/extensions/session-launch.ts`
- `scripts/pi-herdr-launch.mjs`, `scripts/pi-subagent-host.mjs`
- `pi/profiles/default/lib/plans.ts`, `lib/plan-events.ts`, `lib/herdr-resume.ts`
- `pi/profiles/default/lib/subagents/{closeout-handoff,launch,runtime,visible,child-surface,transport}.ts` and `extensions/subagent-child.ts`
- `pi/profiles/default/lib/plan-integration/{contracts,closeout}.ts`, `scripts/plan-integration.mjs` within the default profile
- `pi/profiles/default/lib/damage-control/plan-integration-authority.ts`
- Default `prompts/do-it.md`, `agents/integrator.md`, and `skills/plan-integration/SKILL.md`
- Default `docs/herdr.md`, `docs/subagents.md`, and the relevant installed Pi extension APIs/examples. Load the Pi-extension, Herdr, TypeScript, testing, and prompting guidance as applicable rather than copying it into this plan.

Verified starting behavior:

1. `extensions/plans.ts:253` calls `createHerdrPiTab(root, plan.stub, undefined, plan.relativePath)`. It launches in the picker checkout and caller's current workspace.
2. `createHerdrPiTab` already accepts a cwd and an explicit destination workspace ID. It passes the lasting active-profile directory, opens the real Pi plugin process, and explicitly focuses the returned tab.
3. The bootstrap validates a direct-child `.specs/<stub>/plan.md` under launch cwd and constructs `/do-it` itself. Consequently the selected spec must exist in the task worktree before the new instance starts.
4. `/do-it` currently directs the model to create/resume the worktree and record its integration target. It is a native prompt template, not a deterministic worktree-preparation command.
5. Herdr's `worktree create` creates both checkout and grouped workspace; `worktree open` opens an existing checkout with native provenance. These workspaces normally include an initial shell. Herdr's default checkout path differs from the existing Integrator's repository-local `.worktrees/` requirement.
6. The current Integrator already starts in the recorded parent checkout, merges, restores preserved work, commits completion metadata, removes the worktree, and returns a typed result to its orchestrator. The orchestrator owns user questions and final reporting.
7. Ordinary visible children depend on the originating runtime's authenticated application/host channels. Parent quit cancels ordinary children; child turn settlement closes non-retained panes. The role/skill and injected handoff explicitly prohibit direct user questions. Merely retaining an Integrator or moving its pane does not implement the requested successor lifetime.
8. The canonical closeout entrypoint and Damage Control allowance validate child provenance and the exact helper/hash/argv. Changes to closeout phases or authority must update these consumers together, not bypass them.
9. The bootstrap and new Pi process will both have the task worktree cwd. Deleting it before orchestrator exit leaves an invalid shell cwd; installed Pi's shell tool explicitly rejects nonexistent cwd. Whether Windows also blocks directory removal was not tested and is not an extra acceptance requirement.
10. Existing authorized plans can require orchestrator-owned actions after integration, such as publishing the integrated parent branch. Preserve those obligations without granting publication authority to the Integrator.

## Decisions and implementation contract

### Preparation before launch

Separate task-run preparation from model execution. A small repository-owned helper prepares or locates the selected plan's task checkout and returns its actual coordinates. A proposed home is `pi/profiles/default/lib/plan-run.ts`; use existing helpers when suitable.

The handoff must contain the selected spec identity/path, task worktree/branch, originating checkout/branch, and starting target commit when known. Capture the integration target before switching cwd; never infer it from the new task checkout or assume `main`.

Use a small machine-readable execution record associated with the selected spec to support subsequent resume and launch. Its representation is an implementation choice, not another plan registry. Keep proposed coordinates distinct from actual recorded execution. Do not treat arbitrary plan prose or a stub-matching directory as proof that an existing checkout belongs to this run. Existing explicit task coordinates must be respected or reconciled with a precise explanation rather than silently overwritten. Default new coordinates can be `.worktrees/<stub>` and `task/<stub>` when unoccupied and not superseded by the selected plan's recorded target.

Carry the selected whole spec directory, including task-owned uncommitted plan/supporting files, without deleting its source or copying unrelated dirty repository work. Reuse verified task content on resume rather than overwriting newer execution progress with the source copy. Preparation does not initialize unrelated modules or implement the plan.

Open the prepared Git checkout through Herdr's native `worktree open`, with explicit repository-local paths. Reuse an already-open matching worktree workspace instead of making duplicate workspace groups. Launch Pi in that workspace with the task cwd and existing explicit plan title. Reuse the current plugin/bootstrap/profile machinery. Do not switch the runtime profile to a disposable checkout or relink `local.pi`.

Remove only a known initial shell pane created for this workspace once the real Pi pane is successfully established. Do not close existing user panes. Focus the created run as `d` does today. Preserve existing handling of ambiguous launches: inspect returned identities instead of automatically relaunching. A preparation/launch failure reports any retained checkout/workspace rather than erasing useful prepared state or starting another run blindly.

The new orchestrator receives runtime-issued preparation context and uses that checkout directly. `/do-it` must not create a second worktree or record the task branch as its integration target. Keep direct invocation's existing preparation behavior when no prepared run context exists. Preserve the selected plan's scope and module boundaries; any additional owning-repository worktrees remain plan-execution responsibilities.

### Staged local closeout

Reuse the existing Git closeout procedure, splitting it only at the necessary lifetime boundary:

1. Integrate and restore unrelated work; commit and verify completion metadata using the current manifest contract.
2. Establish an integration-ready result with actual target commit, archive/active-spec evidence, preservation state, and task-worktree state. This intermediate result is not whole-run `COMPLETED` while cleanup remains unfinished.
3. Finish any remaining explicitly authorized orchestrator-only post-integration obligations before retiring it. The Integrator can notify the orchestrator of readiness while retaining its pane; the orchestrator releases the final handoff after those obligations are fulfilled. Do not parse prose into a new runtime publication system or broaden Integrator permissions.
4. On the successful handoff, close the exact originating orchestrator gracefully and observe its Pi/bootstrap exit and pane retirement.
5. Remove the exact manifest task worktree from the parent checkout and report the overall result in the surviving Integrator pane.

Keep the existing one-shot closeout path available for ordinary/direct execution. A local staged helper may expose separate operations or a phase option; choose a simple interface and update the canonical entrypoint, source-hash allowance, and tests together. Existing task-branch retention, stash preservation/restoration, conflict ownership, and no-merge behavior remain unchanged.

If integration, restoration, metadata, or a consequential user decision blocks the successful handoff, keep both panes and the worktree. The Integrator explains the issue in its pane and can continue with direct user input. The orchestrator remains available but does not concurrently mutate the integration target or duplicate the final report. A new approval ceremony for already-authorized local closeout is not required.

After successful integration, failure to exit the exact orchestrator or remove its worktree is a cleanup issue, not a reason to undo integration. Report verified delivery separately from retained cleanup artifacts. Never close unrelated panes or stop the Herdr server.

### Successor lifetime and reporting

The integrated-run Integrator is a restricted closeout successor, not an ordinary parent-dependent leaf. It keeps the same bounded local manifest, model/effort defaults, tools, and no-delegation contract, with only the runtime capability required for the exact originating session handoff.

Its lifetime and closeout authority must remain valid after orchestrator exit. A launch-owned host/local endpoint is sufficient; do not add a durable service, generic detach API, polling monitor, unrestricted Herdr tool access, or parent-loss exemption for ordinary subagents. Do not implement this by pretending the child is under manual user intervention. An authenticated successor handoff may reuse the existing manifest envelope and transports where appropriate, but must not depend on a listener that dies with the orchestrator.

The runtime, not arbitrary model-generated shell commands, owns the exact shutdown request and successor admission. Bind it to the originating session and current verified pane/process identity. Reuse normal graceful Pi shutdown and bootstrap pane retirement. The purpose is to avoid terminating the successor or another session, not to introduce elaborate recovery gates.

Place the successor in a new pane in the same live tab, with parent-checkout cwd, readable Integrator identity, and existing lifecycle state reporting. It must remain a real OS-visible Pi process. Default split geometry can follow the available tab layout; no particular left/right or up/down arrangement was requested. Preserve ordinary managed subagent layout behavior outside this special closeout placement.

On success the Integrator is the remaining live pane and owns the final operator report. Do not close it on normal assistant settlement or send a result back to a dead parent. Existing tab naming must not replace the explicit plan title or mislabel the successor as the original orchestrator. Worktree cleanup must not close the workspace/tab containing the surviving Integrator. Its actual cwd remains the parent checkout even if the workspace was originally created for the now-removed worktree; no workspace-display redesign is required.

Keep the current outcome-first response labels: `COMPLETED`, `NOT COMPLETE: MERGE BLOCKED`, `NOT COMPLETE: USER INPUT REQUIRED`, `IMPLEMENTED: MERGE SKIPPED AS REQUESTED`, and `CLEANUP PENDING`, with the existing symbols and explicit text. A cleanup failure after retirement leaves the Integrator and retained path, not an automatic recreation of the orchestrator. No rollback or restart recovery is required.

## Execution guidance

Create or resume this plan's dedicated task worktree. Record its actual path/branch and originating integration target before editing; carry the entire spec without discarding its source. Preserve the pre-existing feedback-file edit and unrelated concurrent work.

Before delegating implementation, consult Strategist unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead retains its own Strategist-first workflow. Assign at most one named plan task per subagent; split oversized work further, preserve disjoint write ownership, and use the active role catalog. Reviewer and validator assignments are read-only and return normal evidence, not filesystem artifacts. No mandatory reviewer sequence is added.

Use technical judgment for equivalent implementation details. Continue independent work around blockers. Changes to requested behavior, scope, ownership, or acceptance require user approval; routine API and module choices do not. Fix demonstrated task-related defects and stop testing when the agreed checks pass. Keep evidence and unfinished integration/cleanup checkboxes accurate.

## Tasks

- [ ] **T1: Prepare and identify the plan task worktree before Pi launch**
  - Depends on: none.
  - Parallel with: T3 and T4 with disjoint files.
  - Files/inputs: proposed `pi/profiles/default/lib/plan-run.ts`, associated focused tests, existing plan/path helpers as needed. Own the preparation/run-coordinate contract; do not edit the picker UI.
  - Change: implement create/resume, origin capture, task-coordinate association, and whole-spec carry-forward. Preserve existing work and newer resumed progress. Return a compact prepared-run receipt for launch and model context.
  - Verify: real disposable Git repositories covering fresh preparation, reuse, uncommitted spec files, a non-`main` integration target, and a mismatched occupied task path. No mutation of the production checkout in tests.
  - Done when: the selected spec is available in the verified task checkout and the receipt identifies its real task and integration coordinates without implementing the plan.
  - Evidence: Not started.

- [ ] **T2: Launch the prepared orchestrator in its native Herdr worktree workspace**
  - Depends on: T1's prepared-run receipt and resume contract.
  - Files/inputs: `extensions/plans.ts`, `extensions/session-launch.ts`, `scripts/pi-herdr-launch.mjs`, relevant launch/picker tests, and a small launch adapter if needed.
  - Change: replace only `d`'s launch backend with preparation, native worktree open/reuse, correct plugin cwd/workspace, constrained preparation handoff, and exact focus. Handle the workspace's initial shell without touching existing panes. Preserve profile/preflight/process identity and current picker/failure semantics.
  - Verify: focused picker/bootstrap/session-launch tests proving one launch, unchanged keys/rendering, correct task cwd and origin receipt, relative plan delivery, known prelaunch failure, and ambiguous-created-run behavior.
  - Done when: `d` starts one new orchestrator in the task checkout and grouped worktree workspace, not in the originating checkout or a second task worktree.
  - Evidence: Not started.

- [ ] **T3: Expose the integration-ready boundary before task-worktree removal**
  - Depends on: none; the staged result contract above supplies the interface.
  - Parallel with: T1 and T4 with disjoint files.
  - Files/inputs: default `lib/plan-integration/{contracts,closeout}.ts`, `scripts/plan-integration.mjs`, `lib/damage-control/plan-integration-authority.ts`, and corresponding Git/authority tests.
  - Change: split integration/metadata from cleanup for successor runs while retaining ordinary one-shot closeout. Report the intermediate state accurately and keep cleanup bounded to the existing manifest. Update canonical helper argv/hash validation and existing allow-path tests with the change.
  - Verify: real disposable Git closeout tests for successful staged integration with the task worktree still present, later removal, an integration blocker, and removal failure after delivery. Existing one-shot and no-merge tests continue passing. Authority tests reject mismatched provenance/helper/argv without widening the allowance.
  - Done when: the Integrator can finish integration and completion metadata before orchestrator retirement, then clean up afterward using the same exact authority.
  - Evidence: Not started.

- [ ] **T4: Host a restricted Integrator successor that survives its orchestrator**
  - Depends on: none; use the existing manifest and the successor lifetime contract above. Do not wait for unrelated launch/UI work.
  - Parallel with: T1 and T3 with disjoint files.
  - Files/inputs: proposed dedicated successor host/lifetime module, existing child launch/transport code where useful, restricted role loading, and focused process-lifecycle tests. Coordinate edits to the shared bootstrap with T2 rather than assigning it concurrently to two writers.
  - Change: establish the successor's independent launch-owned lifetime and frozen local closeout authority. Maintain a real Pi process, restricted tools, no delegation, native operator input, and visible settlement without automatic pane closure. Keep ordinary parent-loss/retention/intervention semantics unchanged. Update Damage Control authority consumers only after T3's ownership is integrated.
  - Complexity / split hints: host process ownership, surviving authenticated authority, and restricted Pi resource loading are coupled. If oversized, split independent host startup/lifetime from restricted successor application loading before assignment; never generalize all subagents just to obtain survival.
  - Verify: bounded process fixtures for orchestrator exit without successor termination, successor exit cleanup, and unchanged ordinary child parent-loss behavior. Test actual host handles/lifetimes rather than mocking the survival being asserted.
  - Done when: an admitted Integrator successor can keep accepting direct user input and perform bounded closeout after its originating orchestrator exits.
  - Evidence: Not started.

- [ ] **T5: Wire same-tab closeout placement, graceful retirement, and final-report ownership**
  - Depends on: T3's integration-ready/cleanup operations and T4's surviving successor host/authority.
  - Files/inputs: proposed closeout handoff extension/module, exact session/pane identity resolution, successor pane placement and application lifecycle, relevant handoff tests, and shared runtime files only where necessary.
  - Change: dispatch the Integrator in the same live tab with parent cwd. Coordinate integration readiness and any remaining orchestrator-only obligations; retire only the exact origin on successful handoff. Observe exit before worktree cleanup. Keep both panes available before retirement on blocked closeout and keep the successor's pane/tab open afterward without losing the report. Preserve the explicit plan title and lifecycle reporting.
  - Verify: success transition, integration blocker with both panes retained, exact-target shutdown, parent shutdown not killing the successor, post-retirement cleanup failure, and ordinary subagent layout/cleanup regressions for any affected code.
  - Done when: the required two-pane handoff reaches a surviving user-facing Integrator without duplicate reports or a Pi instance left running in the removed checkout.
  - Evidence: Not started.

- [ ] **T6: Route prepared runs through the new handoff and reconcile instructions/docs**
  - Depends on: T2's prepared-run context and T5's closeout workflow.
  - Files/inputs: default `prompts/do-it.md`, `agents/integrator.md`, conditional child/successor prompt composition, `skills/plan-integration/SKILL.md`, affected planning/Git closeout guidance, `pi/README.md`, default `docs/herdr.md`, `docs/subagents.md`, root `CHANGELOG.md`, and guidance tests.
  - Change: consume preprepared worktrees without duplicate creation; select successor closeout only for the integrated prepared-run mode. Replace conflicting parent-only report/question instructions conditionally rather than adding contradictory exceptions. Keep ordinary closeout, run-here/direct invocation, `--no-merge`, explicit authorization, and module boundaries intact. Document workflow and cleanup limits without duplicating the Git procedure.
  - Verify: composed guidance for ordinary Integrator versus successor, prepared versus direct `/do-it`, no-merge exclusion, and unchanged ordinary role/tool boundaries. Record static prompt-size/placement changes honestly; no cache-performance claim without provider evidence.
  - Done when: a fresh-context executor follows the correct path from the selected run's runtime context, and docs describe both successor and preserved ordinary behavior consistently.
  - Evidence: Not started.

- [ ] **T7: Verify the complete Herdr worktree and closeout handoff**
  - Depends on: T2, T5, and T6's integrated workflow.
  - Files/inputs: existing isolated Herdr test helpers/fixtures, updated `tests/plans-herdr-live.test.ts`, proposed `tests/plan-closeout-herdr-live.test.ts`, and focused acceptance evidence in this spec.
  - Change: add a bounded isolated acceptance scenario using disposable Git, an isolated Herdr server/config/plugin registry with an explicitly pinned test socket, and the installed real Pi CLI. Use deterministic fixture inputs/events where model reasoning is irrelevant. Do not replace the host/process lifetime under test with mocks or relink production.
  - Verify: native grouped workspace provenance; orchestrator launch cwd and session identity; same-tab Integrator with parent cwd; success retires the exact orchestrator, delivers commits/metadata and removes the worktree, leaving a live report pane; a pre-retirement integration blocker leaves both panes and checkout; a cleanup failure after retirement reports delivered changes and retained path. Distinguish actual Pi integration evidence from inert-host or mocked-unit coverage.
  - Done when: the finite automated checks below pass and their evidence/limits are recorded. Attached-client visual experience and provider reasoning are non-blocking manual verification limits, not extra completion gates.
  - Evidence: Not started.

- [ ] **T8: Archive, commit, and integrate this implementation plan**
  - Depends on: T1-T7 and the agreed checks.
  - Change: record actual results and limitations, archive this entire spec, repair links, and commit the implementation/archive on this plan's task branch. Use the authorized closeout contract below, preserving unrelated target work. Activate through the normal settled-only boundary; do not assume the already-running session acquired new lifecycle code.
  - Done when: implementation and archive are delivered to the recorded target, completion metadata is committed, task-worktree cleanup is accurately verified or reported, and no unauthorized push/deployment occurred.
  - Evidence: Not started.

## Agreed validation and current handoff

From the execution worktree's `pi/profiles/default/`, run the following finite set. Proposed file names may change with an equivalent implementation; record the actual command without expanding the scope.

```sh
pnpm test plan-run.test.ts plans.test.ts session-launch.test.ts herdr-launch.test.ts plan-integration/closeout.test.ts damage-control/plan-integration-authority.test.ts subagent-integration-handoff.test.ts subagent-cleanup.test.ts subagent-session-lifecycle.test.ts subagent-layout.test.ts herdr-agent-state.test.ts herdr-orchestrator-label.test.ts plan-integration-guidance.test.ts plan-closeout-handoff.test.ts
pnpm run typecheck
pnpm run check:runtime
PI_PLANS_HERDR_LIVE=1 pnpm test plans-herdr-live.test.ts
PI_PLAN_CLOSEOUT_HERDR_LIVE=1 pnpm test plan-closeout-herdr-live.test.ts
```

Use shell-appropriate environment syntax on PowerShell. `PI_PLAN_CLOSEOUT_HERDR_LIVE` and its test file are proposed. Run `git diff --check` from the task checkout. Keep focused tests with the implementation task that needs them; T7 covers integrated live behavior, not a mandatory second review of every file.

Fix established task-related defects. If a check fails for an unrelated baseline issue, verify that baseline with bounded evidence and report it without silently expanding this plan. Rerun only checks made stale by subsequent relevant changes. Do not upgrade Herdr or restart the shared server as a test shortcut.

- Status: Ready for implementation; planning only.
- Completed work: read-only repository/runtime investigation and standalone plan authoring.
- Next: execute T1, T3, and T4 with disjoint ownership after authorization and the required Strategist consultation.
- Blockers/open user decisions: none in the selected scope. Equivalent execution-record format, host modules, split geometry, and staged-helper API remain implementer choices.
- Verification limits: no implementation tests, native worktree mutations, successor lifetime tests, or attached-client UX checks were run during planning. Windows directory-use behavior is unverified; cleanup does not depend on assuming deletion will work while the orchestrator is alive.

## Closeout for this plan itself

After implementation and agreed agent-owned checks pass, update task evidence and record integration pending. Confirm `.specs/archive/herdr-plan-worktree-handoff/` is unoccupied, archive the whole spec directory in the task worktree, repair links, and commit implementation and archive together. Leave unfinished delivery/cleanup checkboxes unchecked.

Use the runtime actually active in the executing session, not the source just edited. If this plan is executed under the old runtime, dispatch the existing Integrator from the recorded parent checkout with the canonical closeout manifest. That Integrator performs local merge, preservation/restoration, completion metadata, and clean-worktree removal; the originating orchestrator owns questions and final reporting. Do not switch into the unvalidated successor path mid-run just because its files exist. If executing under an already-validated integrated runtime, use its successor contract normally.

The manifest identifies this plan's exact repository root, target checkout/branch, task worktree/branch/commit, archived plan path, active stub, `noMerge`, completion date, and integration evidence, with the starting target commit when known. Preserve unrelated tracked/untracked target work using the existing bounded closeout procedure; ignored work remains excluded. Resolve routine merge conflicts within settled intent. Retain artifacts and report exact state for consequential overlaps or unresolved restoration.

With `--no-merge`, skip mutating integration and keep the committed task worktree intentionally. Push/deployment remain unauthorized. Operator manual/live observation after the agreed checks does not block archival or authorized local closeout.

Start the final response with one overall outcome, using symbol and explicit text:

- 🟢 **COMPLETED**: agreed checks passed, implementation/archive integrated, completion metadata committed, and task-worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: task committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents completion.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: implementation/checks committed under `--no-merge`; worktree retained intentionally.
- 🟡 **CLEANUP PENDING**: delivered changes and completion metadata are committed, but cleanup remains unfinished.

For blocked or cleanup-pending outcomes, immediately give **Reason** and **Action needed**, naming the concrete state, owner, and exact next action before listing successes. Then concisely report checks, archive location, branches/commits, merge result, retained artifacts, and verification limits. Do not lead a blocked outcome with a success summary, imply automatic resumption, or create rollback/recovery work outside this plan.
