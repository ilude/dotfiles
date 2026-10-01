---
created: 2026-09-30
status: completed
completed: 2026-10-01
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

## Approved correction, 2026-10-01

The operator authorized completing the bounded correction after adversarial reviews and Steward triage. The original local commits and cleanup remain historical facts, but the original whole-workflow completion claim is withdrawn: launch acceptance substituted an extension command for native `/do-it`, and closeout acceptance substituted controller construction and origin lifecycle handlers for the production facade. The vanished operator pane does not establish why no selected plan was visible.

Retain T1/T3/T4 and their component evidence. Reopened T2/T5/T6/T7/T8 cover only the established launch/admission/release defects, faithful integration acceptance, and corrected delivery accounting. Original evidence below describes the earlier execution, not current corrected acceptance. No old-plan coordinate compatibility work, redesign, manual UI gate, production replay/relink/restart, push, deployment, module changes, or legacy-profile work is added.

Actual correction checkout: `C:/Users/mglenn/.dotfiles/.worktrees/herdr-plan-worktree-handoff-correction`, branch `task/herdr-plan-worktree-handoff-correction`. Recorded target: `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `879055df2d7262ff721d7b790a814f285cc1e5aa`. The earlier implementation branch remains retained. Only the five task-owned uncommitted corrective files were copied and byte-verified before their identical origin edits were restored; the unrelated feedback edit and `usage-ranked-command-autocomplete` source/worktree remain untouched. The entire archived spec was reopened only in this correction checkout.

- [x] **R1: Make prepared admission session-owned**
  - Retain the bootstrap receipt-delivery correction and real native-template launch test already implemented. Consume the environment receipt at the owning Pi admission point, persist session metadata for reload, and exclude new ordinary sessions from inherited prepared status.
  - Own `extensions/subagents.ts` admission/metadata and focused `tests/prepared-plan-session.test.ts` plus the prepared-receipt assertion in `tests/plans-herdr-live.test.ts`. R2 starts after this shared production file is relinquished.
  - Done when ownership, metadata restoration, ordinary-session exclusion and affected bootstrap/native launch assertions pass. No pre-spawn receipt deletion.
- [x] **R2: Make release suppress all originating-model continuation**
  - Depends on R1's admitted-session interface. Preserve exact, graceful shutdown at settlement and observed origin retirement before cleanup. Handle Pi's mixed tool-batch semantics rather than assuming one `terminate: true` stops the batch.
  - Own release/lifecycle portions of `extensions/subagents.ts` and focused `tests/closeout-release.test.ts`; no R3 test-file edits.
  - Done when a successful production release cannot generate another originating-model response, including mixed batches, while ordinary lifecycle behavior remains intact. Do not add process killing or recovery machinery.
- [x] **R3: Verify the production closeout route in installed Pi**
  - Fixture construction may run concurrently with R1/R2; final acceptance depends on both repairs. Own `tests/plan-closeout-herdr-live.test.ts` and explicitly required test-only helpers.
  - Use actual production origin extension, prepared admission, frozen Integrator model/effort resolution, `closeout_successor` launch/inspect/release, readiness delivery and settlement shutdown. Retain the real successor host/surface, native panes and canonical Git helper.
  - Deterministic providers may replace external reasoning/network, not native `/do-it`, admission, production tool facade or lifecycle wiring. Existing lower-layer tests remain valid with bounded component claims.
  - Done when isolated success, integration blocker, post-delivery cleanup failure and mixed-batch release prove the promised task/origin identity, same-tab placement, delivery, exact retirement, cleanup/retention and single surviving final-report owner. No new shared-server or manual acceptance gate.
- [x] **R5: Keep successor-only discovery inert in ordinary Pi**
  - Faithful R3 discovery exposed unconditional restricted binding during ordinary startup. Parent added only the `PI_CLOSEOUT_SUCCESSOR === "1"` activation check in `extensions/closeout-successor.ts`; the authenticated surface and its rejection behavior remain unchanged.
  - Five focused activation tests pass. The real production closeout scenarios discover the same extension ordinarily without filtering it out, then exercise authenticated successor activation. This is a demonstrated preservation repair, not a new mode or authority.
- [ ] **R4: Reconcile evidence, archive, commit, integrate and verify cleanup**
  - Parent owns plan/evidence, `CHANGELOG.md`, failure-log correction, finite combined checks and task commit. Integrator owns authorized local delivery, completion metadata and exact correction-worktree cleanup under the ordinary runtime actually active here.
  - Retain historical commits and original component results, clearly label replaced acceptance, and close reopened parent tasks only with actual corrective evidence. Preserve unrelated origin work and the user's existing task worktree.
  - Done when the corrected whole spec and implementation are committed and delivered to the recorded target, completion accounting is accurate, and correction-worktree cleanup is verified or reported as pending. No push or deployment.

Corrected implementation and acceptance evidence, 2026-10-01:

- Admission/bootstrap/session/guidance selection initially passed 50 tests; seven release tests exercise the registered production facade and actual installed SDK loop, including parallel/sequential mixed batches, real codemode nested release, failed-release continuation and exact settlement ownership. Five activation tests reproduce ordinary-discovery failure before its guard and preserve restricted rejection afterward.
- Final affected ten-file selection passed 72 tests: `prepared-plan-session`, `closeout-release`, `closeout-successor-extension`, `herdr-launch`, `session-launch`, `plan-integration-guidance`, `plan-closeout-handoff`, `subagent-session-lifecycle`, `subagent-messaging-lifecycle`, and `subagent-integration-handoff`. A test-adapter nullable Map lookup was corrected after typecheck; final typecheck and seven release tests pass.
- Native picker/launch acceptance passed one case (11.31 seconds scenario; 18.15 seconds total) with actual `/do-it` expansion, production admission, consumed environment input and exact-session metadata, native grouped cwd, real process and pane identity.
- All four production closeout scenarios have passing current evidence. The final combined run passed success, cleanup failure and mixed release; blocker stalled during canonical integration without a result before the 60-second observation limit. The same unchanged blocker passed its isolated rerun (34.95 seconds scenario; 49.94 seconds total). The stall cause is not established, no production workaround or timeout widening was added, and failure diagnostics now include the actual successor pane. Earlier worker runs also passed blocker and the three corrected release cases.
- Closeout acceptance uses real native input/prepared context, production launch/inspect/readiness/release/shutdown, actual frozen Luna/high resolution with authenticated deterministic provider replacement, canonical helper and surviving host/Pi. It asserts model-input transcript context and manifest, same-tab parent cwd, exact process/pane exit before cleanup, retained blocker/cleanup paths, sole successor final report and no post-release origin request. Fixture-owned commands/controllers/lifecycle handlers no longer replace the route under test.
- Installed-Pi runtime smoke passes, as do final typecheck and whitespace checks. External provider reasoning, attached-client UX, and reconstruction of the vanished operator pane remain explicitly unverified; they are not new completion gates. User's existing task/work remains preserved. R4 delivery/metadata/cleanup is still pending.

Correction checks from default profile: affected bootstrap/session/guidance/lifecycle/handoff tests including `prepared-plan-session.test.ts`, `closeout-release.test.ts` and `closeout-successor-extension.test.ts`; `pnpm run typecheck`; `pnpm run check:runtime`; `PI_PLANS_HERDR_LIVE=1 pnpm test plans-herdr-live.test.ts`; `PI_PLAN_CLOSEOUT_HERDR_LIVE=1 pnpm test plan-closeout-herdr-live.test.ts`; root `git diff --check`. Use final integrated prerequisites for live closeout acceptance. Reuse unrelated original checks and rerun only stale affected results.

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

- [x] **T1: Prepare and identify the plan task worktree before Pi launch**
  - Depends on: none.
  - Parallel with: T3 and T4 with disjoint files.
  - Files/inputs: proposed `pi/profiles/default/lib/plan-run.ts`, associated focused tests, existing plan/path helpers as needed. Own the preparation/run-coordinate contract; do not edit the picker UI.
  - Change: implement create/resume, origin capture, task-coordinate association, and whole-spec carry-forward. Preserve existing work and newer resumed progress. Return a compact prepared-run receipt for launch and model context.
  - Verify: real disposable Git repositories covering fresh preparation, reuse, uncommitted spec files, a non-`main` integration target, and a mismatched occupied task path. No mutation of the production checkout in tests.
  - Done when: the selected spec is available in the verified task checkout and the receipt identifies its real task and integration coordinates without implementing the plan.
  - Evidence: Four disposable-Git tests pass, including the final `pnpm test plan-run.test.ts plan-integration/closeout.test.ts damage-control/plan-integration-authority.test.ts --maxWorkers=2` run (47 tests total). Coverage includes dirty whole-spec and nested untracked supporting files, non-main origin, resume, occupied path, malformed receipts, explicit coordinate conflicts, selected-spec identity mismatch, and direct-child selection. Resume verifies common Git directory and registered worktree membership. The private raw record captures sorted file-byte SHA256 or symlink-target identities before copying; the public launch receipt remains compact. Final typecheck passed.

- [x] **T2: Launch the prepared orchestrator in its native Herdr worktree workspace**
  - Depends on: T1's prepared-run receipt and resume contract.
  - Files/inputs: `extensions/plans.ts`, `extensions/session-launch.ts`, `scripts/pi-herdr-launch.mjs`, relevant launch/picker tests, and a small launch adapter if needed.
  - Change: replace only `d`'s launch backend with preparation, native worktree open/reuse, correct plugin cwd/workspace, constrained preparation handoff, and exact focus. Handle the workspace's initial shell without touching existing panes. Preserve profile/preflight/process identity and current picker/failure semantics.
  - Verify: focused picker/bootstrap/session-launch tests proving one launch, unchanged keys/rendering, correct task cwd and origin receipt, relative plan delivery, known prelaunch failure, and ambiguous-created-run behavior.
  - Done when: `d` starts one new orchestrator in the task checkout and grouped worktree workspace, not in the originating checkout or a second task worktree.
  - Evidence: Initial picker/session/bootstrap run passed 87 focused tests. Real installed-Pi isolated Herdr launch exposed initial-shell retention: a registered checkout was mistaken for an already-open workspace. Fixed by requiring native `open_workspace_id`, preserving reused user panes and clearing inherited receipt context on ordinary launches. Follow-up focused run passed 72 tests (live case skipped), then `PI_PLANS_HERDR_LIVE=1 pnpm test plans-herdr-live.test.ts` passed one real-Pi case proving native grouping, task cwd/session, fixture-command argument delivery and only the Pi pane remaining. It did not load the native `/do-it` template or production preparation hook; that acceptance claim was insufficient. No production server/plugin changes.

- [x] **T3: Expose the integration-ready boundary before task-worktree removal**
  - Depends on: none; the staged result contract above supplies the interface.
  - Parallel with: T1 and T4 with disjoint files.
  - Files/inputs: default `lib/plan-integration/{contracts,closeout}.ts`, `scripts/plan-integration.mjs`, `lib/damage-control/plan-integration-authority.ts`, and corresponding Git/authority tests.
  - Change: split integration/metadata from cleanup for successor runs while retaining ordinary one-shot closeout. Report the intermediate state accurately and keep cleanup bounded to the existing manifest. Update canonical helper argv/hash validation and existing allow-path tests with the change.
  - Verify: real disposable Git closeout tests for successful staged integration with the task worktree still present, later removal, an integration blocker, and removal failure after delivery. Existing one-shot and no-merge tests continue passing. Authority tests reject mismatched provenance/helper/argv without widening the allowance.
  - Done when: the Integrator can finish integration and completion metadata before orchestrator retirement, then clean up afterward using the same exact authority.
  - Evidence: The final preparation/closeout/authority run passed 47 tests (26 closeout, 17 authority, four preparation). Real staged CLI, one-shot/no-merge, restoration, blockers, and post-delivery locked-worktree removal remain covered. Prepared-source retirement verifies the exact committed raw receipt and whole unchanged source before consuming task-owned tracked/untracked inputs; tests retain changed, new, missing, divergent staged, and mismatched-receipt source without merge or stash. Current typecheck, runtime smoke and whitespace checks pass.

- [x] **T4: Host a restricted Integrator successor that survives its orchestrator**
  - Depends on: none; use the existing manifest and the successor lifetime contract above. Do not wait for unrelated launch/UI work.
  - Parallel with: T1 and T3 with disjoint files.
  - Files/inputs: proposed dedicated successor host/lifetime module, existing child launch/transport code where useful, restricted role loading, and focused process-lifecycle tests. Coordinate edits to the shared bootstrap with T2 rather than assigning it concurrently to two writers.
  - Change: establish the successor's independent launch-owned lifetime and frozen local closeout authority. Maintain a real Pi process, restricted tools, no delegation, native operator input, and visible settlement without automatic pane closure. Keep ordinary parent-loss/retention/intervention semantics unchanged. Update Damage Control authority consumers only after T3's ownership is integrated.
  - Complexity / split hints: host process ownership, surviving authenticated authority, and restricted Pi resource loading are coupled. If oversized, split independent host startup/lifetime from restricted successor application loading before assignment; never generalize all subagents just to obtain survival.
  - Verify: bounded process fixtures for orchestrator exit without successor termination, successor exit cleanup, and unchanged ordinary child parent-loss behavior. Test actual host handles/lifetimes rather than mocking the survival being asserted.
  - Done when: an admitted Integrator successor can keep accepting direct user input and perform bounded closeout after its originating orchestrator exits.
  - Evidence: `pnpm test closeout-successor-lifetime.test.ts` passed three actual-process tests: authenticated closeout authority and direct input survive real origin exit; successor exit closes its host endpoint; ordinary visible parent-loss cleanup still terminates its child. Successor admission rejects non-Integrator and altered frozen definitions, with no delegation. The successor-only CLI tool ceiling includes exactly its handoff tool in addition to frozen role tools. Process fixtures strip inherited live Herdr/subagent identities so ordinary cleanup cannot close the developer pane, record the actual spawned host PID before readiness, and use bounded startup/cleanup. Real installed-Pi behavior is separately covered by T7.

- [x] **T5: Wire same-tab closeout placement, graceful retirement, and final-report ownership**
  - Depends on: T3's integration-ready/cleanup operations and T4's surviving successor host/authority.
  - Files/inputs: proposed closeout handoff extension/module, exact session/pane identity resolution, successor pane placement and application lifecycle, relevant handoff tests, and shared runtime files only where necessary.
  - Change: dispatch the Integrator in the same live tab with parent cwd. Coordinate integration readiness and any remaining orchestrator-only obligations; retire only the exact origin on successful handoff. Observe exit before worktree cleanup. Keep both panes available before retirement on blocked closeout and keep the successor's pane/tab open afterward without losing the report. Preserve the explicit plan title and lifecycle reporting.
  - Verify: success transition, integration blocker with both panes retained, exact-target shutdown, parent shutdown not killing the successor, post-retirement cleanup failure, and ordinary subagent layout/cleanup regressions for any affected code.
  - Done when: the required two-pane handoff reaches a surviving user-facing Integrator without duplicate reports or a Pi instance left running in the removed checkout.
  - Evidence: Four focused handoff tests and 50 ordinary integration/cleanup/session/layout regressions passed. Same-tab frozen-origin controller is independent of ordinary children; focused mocks asserted event-driven readiness and settlement shutdown, but did not establish production facade release under Pi's mixed tool-batch semantics. Prepared context is scoped to the originating session with metadata restore on reload, not new chats. Runtime smoke and scoped whitespace checks passed. Original T7 real-process transitions used fixture-owned origin handlers; they did not establish the production origin facade/lifecycle route.

- [x] **T6: Route prepared runs through the new handoff and reconcile instructions/docs**
  - Depends on: T2's prepared-run context and T5's closeout workflow.
  - Files/inputs: default `prompts/do-it.md`, `agents/integrator.md`, conditional child/successor prompt composition, `skills/plan-integration/SKILL.md`, affected planning/Git closeout guidance, `pi/README.md`, default `docs/herdr.md`, `docs/subagents.md`, root `CHANGELOG.md`, and guidance tests.
  - Change: consume preprepared worktrees without duplicate creation; select successor closeout only for the integrated prepared-run mode. Replace conflicting parent-only report/question instructions conditionally rather than adding contradictory exceptions. Keep ordinary closeout, run-here/direct invocation, `--no-merge`, explicit authorization, and module boundaries intact. Document workflow and cleanup limits without duplicating the Git procedure.
  - Verify: composed guidance for ordinary Integrator versus successor, prepared versus direct `/do-it`, no-merge exclusion, and unchanged ordinary role/tool boundaries. Record static prompt-size/placement changes honestly; no cache-performance claim without provider evidence.
  - Done when: a fresh-context executor follows the correct path from the selected run's runtime context, and docs describe both successor and preserved ordinary behavior consistently.
  - Evidence: Seven guidance tests passed, with deterministic receipt ordering and audience/prepared/direct/no-merge separation. Ordinary Integrator role remains 366 bytes unchanged; successor replacement 1,635 bytes (2,509-byte affected fixture composition), prepared conditional context 1,252 bytes, caller catalog/guidance 3,733 bytes. `/do-it` grew 6,387 to 7,912 bytes; integration skill 3,798 to 5,138 bytes after the prepared-source retirement clarification. The seven guidance tests passed again after that clarification. Actual inherited context, assignments and provider serialization remain dynamic. No provider cache-performance measurement or claim. Scoped whitespace check passed.

- [x] **T7: Verify the complete Herdr worktree and closeout handoff**
  - Depends on: T2, T5, and T6's integrated workflow.
  - Files/inputs: existing isolated Herdr test helpers/fixtures, updated `tests/plans-herdr-live.test.ts`, proposed `tests/plan-closeout-herdr-live.test.ts`, and focused acceptance evidence in this spec.
  - Change: add a bounded isolated acceptance scenario using disposable Git, an isolated Herdr server/config/plugin registry with an explicitly pinned test socket, and the installed real Pi CLI. Use deterministic fixture inputs/events where model reasoning is irrelevant. Do not replace the host/process lifetime under test with mocks or relink production.
  - Verify: native grouped workspace provenance; orchestrator launch cwd and session identity; same-tab Integrator with parent cwd; success retires the exact orchestrator, delivers commits/metadata and removes the worktree, leaving a live report pane; a pre-retirement integration blocker leaves both panes and checkout; a cleanup failure after retirement reports delivered changes and retained path. Distinguish actual Pi integration evidence from inert-host or mocked-unit coverage.
  - Done when: the finite automated checks below pass and their evidence/limits are recorded. Attached-client visual experience and provider reasoning are non-blocking manual verification limits, not extra completion gates.
  - Evidence: `PI_PLANS_HERDR_LIVE=1 pnpm test plans-herdr-live.test.ts` passed one real installed-Pi 0.99.1 case (10.01 seconds). The final `PI_PLAN_CLOSEOUT_HERDR_LIVE=1 pnpm test plan-closeout-herdr-live.test.ts` run passed all three isolated scenarios (103.96 seconds): same-tab real successor in parent cwd and a distinct durable session; delivery/metadata, exact origin settlement shutdown and pane retirement, then task-worktree removal with a surviving report process; pre-retirement merge blocker retaining both panes/task checkout; post-retirement cleanup failure retaining the exact path and reporting delivered changes. The earlier source-receipt deletion workaround is removed: unchanged prepared source retires naturally and untracked selected-spec support is verified in the archive. Deterministic fixture provider/commands exercised production host/handoff/helper and real Pi/bootstrap lifetimes without external reasoning or network. Direct controller construction and fixture-owned readiness/release/settlement handlers bypassed the production origin tool facade, so those passes are component integration evidence, not complete routing acceptance. Native grouped provenance is asserted. Attached-client visual experience and provider reasoning remain non-blocking manual limits. No shared Herdr restart, production plugin relink, or module changes.

- [ ] **T8: Archive, commit, and integrate this implementation plan**
  - Depends on: T1-T7 and the agreed checks.
  - Change: record actual results and limitations, archive this entire spec, repair links, and commit the implementation/archive on this plan's task branch. Use the authorized closeout contract below, preserving unrelated target work. Activate through the normal settled-only boundary; do not assume the already-running session acquired new lifecycle code.
  - Done when: implementation and archive are delivered to the recorded target, completion metadata is committed, task-worktree cleanup is accurately verified or reported, and no unauthorized push/deployment occurred.
  - Evidence: The complete spec was archived with task commit `c49f2f5eaa15f2aea09929dfd2a0d92e0174bd93` and integrated locally into `main` at `8b33279feca367875e061d26d52f30777fabc86c`; completion metadata was committed in that target commit. The canonical ordinary closeout helper first committed delivery/metadata but Git worktree removal failed with Windows `Filename too long`; Git had deregistered the exact worktree. A second canonical-helper pass verified absent registration and removed only the exact `.worktrees/herdr-plan-worktree-handoff` remnant. Final result: `COMPLETED`, metadata committed, archive present, active spec absent, task worktree absent from registration and filesystem, task branch retained, no stash needed, no push/deployment.

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

- Status: Original delivery completed 2026-09-30; functional completion withdrawn. Approved correction in progress 2026-10-01, default profile.
- Actual task checkout: `C:/Users/mglenn/.dotfiles/.worktrees/herdr-plan-worktree-handoff`, branch `task/herdr-plan-worktree-handoff`.
- Recorded integration target: `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `12ed41afa33584f08a7bb51052ec96fe064989fb`.
- Whole source spec copied without deleting its source. The origin advanced from the initial observation to `12ed41af` before worktree creation, committing the spec and unrelated command edits; the task uses that recorded base. Target changes remain untouched. Strategist execution consultation completed.
- Historical work: T1-T8 source and archive were integrated and the original task checkout removed using ordinary runtime closeout. Those Git delivery/cleanup facts do not establish the complete production routing; T2/T5/T6/T7/T8 are reopened for the approved correction above.
- Environment: frozen default-profile dependency install completed. Concurrent runtime link setup reported an EEXIST collision; all five runtime package links resolve and `pnpm run check:runtime` passed in the task checkout.
- Checks: the finite 14-file aggregate passed 203 tests with two existing 15-second Git fixture timeouts; those demonstrated budgets were increased to 30 seconds and their targeted rerun passed. Subsequent source-retirement changes passed the affected preparation/closeout/authority selection (47 tests, 168.54 seconds). Dedicated actual-process lifetime tests passed all three cases; final guidance rerun passed seven. Final typecheck/runtime smoke and whitespace checks pass. Native launch passed its one real-Pi case; the corrected live closeout fixture passed all three cases without source-receipt deletion. No optional verification gate was added.
- Task-related defects resolved: native workspace initial-shell retention, successor-only CLI tool ceiling, fixture inheritance of live pane identity, and unchanged prepared-source retirement. The source fix preserves divergent/new operator work and relies on the exact archived task record, rather than treating prepared support as unrelated stash content. This implements the settled whole-spec/closeout workflow.
- The process-churn diagnostic stalled in its performance-counter query; bounded sampling showed no hot LSM/CryptSvc. No unrelated processes were changed. The two failed parent lifetime fixture directories were removed after their owned processes exited.
- Delivery and cleanup: the task branch was merged locally, completion metadata committed, and the registered worktree plus exact filesystem remnant removed through the canonical closeout helper. The unrelated target edit in `pi/profiles/default/skills/agent-process/references/instruction-feedback.md` remains intact. Task branch retained; no push/deployment.
- Current remaining work: R4 correction delivery, completion metadata and exact worktree cleanup. R1/R2/R3/R5 and corrected T2/T5/T6/T7 implementation/acceptance pass with evidence above. Original delivery/cleanup remain historical facts; corrective whole-plan completion is not yet claimed.
- Open user decisions: none in the approved correction. The speculative older-coordinate compatibility question was withdrawn; preserve the settled verified-coordinate behavior. Equivalent repair mechanisms remain implementer choices.
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

## Historical integration evidence, not corrected production acceptance

Agreed finite unit selection and affected reruns passed; final preparation/closeout/authority 47 tests, actual-process lifetime 3, guidance 7; typecheck, runtime smoke and whitespace checks passed. Original installed-Pi launch fixture 1 and isolated controller-based closeout 3 scenarios passed without source-receipt deletion. Those fixtures bypassed native template/prepared admission or production origin facade/lifecycle and did not establish complete workflow acceptance. Attached-client visual experience and provider reasoning are non-blocking manual limits. No push/deployment authorized.

## Integration evidence

Approved correction:72 affected tests,1 installed-Pi native launch,4 production closeout scenarios with unchanged blocker serial retry; final typecheck/runtime/whitespace and SDK mixed/nested release checks pass. Prior completion withdrawn; historical delivery retained. No push/deployment/production replay.
