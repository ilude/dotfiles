---
created: 2026-11-09
status: completed
completed: 2026-11-10
---

# Pi-backed named-role subagents using unchanged T3

## Goal, scope, and authorization

Build a complete T3-compatible subagent workflow in the default Pi profile. T3 supplies its existing app-owned children, lifecycle, results, notifications, workspaces, questions, and UI. Pi-side code supplies named-role resolution and enforced authority.

User requirements and confirmed boundaries:

- **Do not modify T3.** No fork, server/adapter/schema/client patch, generated-extension patch, custom T3 build, installer, or T3 replacement is part of this plan. The T3 module is read-only reference material, not an implementation repository.
- Phase 1 runs all named-role children through Pi. Different models/providers available through Pi remain usable. Direct Claude Code/Codex CLI children are only a possible Phase 2.
- A separate T3-compatible Pi backend is allowed; standalone Pi/Herdr keep their working native backend, role definitions, settings, and behavior.
- This is a first draft of a working system, not a minimal card fix. Cover enforced roles, model/effort/skills, nesting, progress, waiting, questions, final/unfinished results, follow-ups, cancellation, ownership/history/restarts, goals, and existing T3 presentation.
- Enforce tool/delegate restrictions in code. Task prose alone is not role authority.
- Use T3's existing blocking question flow for Phase 1, as confirmed by the user: only the questioning child pauses; the parent and other children can continue. The parent answers from existing instructions or asks the user.
- Surface a real limitation rather than silently changing T3, launching hidden native children, weakening a role, or substituting a model/provider.

This revision replaces the earlier over-scoped architecture. In particular, it removes T3 execution-profile contracts/migrations/services, custom parent-request infrastructure, client UI changes, fork builds, module commits/gitlink updates, and installation of a modified T3. Those were design choices, not approved requirements.

Non-goals: reproducing Herdr panes/same-tab retirement in T3; migrating old native children; rewriting `/plans`; adding another default profile or per-role T3 provider instances; a second task scheduler/status database; changing generic T3 delegation; exact parity with every native tool argument or UI detail; remote-environment role handoff; changing credentials, trust, permission defaults, or model defaults.

Authorization: on 2026-11-09 the user explicitly requested running this plan to completion. Implementation, the dedicated task worktree, local commits, integration into the recorded target, and cleanup are authorized. T3 product changes, publication, deployment, installation/replacement, and interruption of active work remain outside scope. No further approval is needed for authorized local Git.

## Phases

### Phase 1: Pi roles and existing T3 APIs

All implementation tasks and checks below belong to Phase 1. The detailed design is a draft, not a claim that the new backend already works. Existing T3 controls and question semantics are used rather than expanded.

### Possible Phase 2: direct Claude Code and Codex CLI children

A possible later phase would run named-role children directly through those programs. First investigate their role/tool/delegation/permission/skill support and how it fits the existing T3 lifecycle. This is not an approved implementation phase, a dependency, or an acceptance condition for Phase 1. Do not add an adapter framework now for that possibility. Generic T3 delegation to other programs remains unchanged.

## Fresh-context handoff

Path roots: **D:** = `C:/Users/mglenn/.dotfiles`; **P:** = D:`pi/profiles/default`; **T:** = D:`modules/t3code`. Consecutive paths retain the stated root until another prefix appears. Proposed files are marked as such.

### Ownership and reading

All implementation belongs in dotfiles, principally P:. T: and the installed generated T3 bridge are read-only dependencies. Do not stage/update their files or gitlinks for this task. Preserve unrelated module work and the legacy boundary; do not inspect/run/install against legacy or `.repos` reference checkouts.

Read applicable `AGENTS.md`, [research.md](research.md), P:`docs/subagents.md`, `lib/subagents/{definitions,options,guidance,launch,transport}.ts`, `extensions/{subagents,subagent-child,goal}.ts`, and the owning Damage Control/goal helpers. Load the active Pi extension, TypeScript, testing, and prompting skills before editing their surfaces. Read relevant installed Pi docs/examples in full before implementation, including command dispatch, tool composition, structured prompts, session events, and persistence.

The research links the precise read-only T3 contract/service/adapter evidence. Do not turn an absent T3 field into an assumed need to add one.

### Starting state and profile

Rechecked 2026-11-09:

- D: `main`, HEAD `723e4ef979b41180c43106f21983e3907c7b26e9`.
- T: `main`, `e455200077ce60806a01c8f28435b58860dcfc74`, clean at this revision's check.
- Planning profile: `C:/Users/mglenn/.dotfiles/pi/profiles/default`, installed Pi `1.5.0`.
- Affected desktop T3 launcher: `C:/Users/mglenn/.t3/bin/t3.cmd`, version `0.1.8-nightly.20261108.4380`, selected by `T3CODE_CLI_PATH`. Bare `t3` instead resolves to an older `0.1.7`; do not test that and claim the desktop path passed.
- Current profile, generated bridge path, registered orchestration tools, and enabled Pi/app-owned capabilities were checked read-only. No revised role child/model run or live lifecycle test was performed.
- Previous presentation checks passed 159 tests and typecheck, but they do not validate this backend.

Intended implementation tests use the dedicated task checkout's repository-owned default-profile code, with deterministic providers and isolated T3 state. Record the actual profile/path/runtime for each run. Do not globally relink the operator's profile, copy credentials into a test profile, or treat a fresh test process as evidence that an existing process reloaded.

### Preservation and Git coordinates

The working tree at this revision had this plan modified and unrelated untracked D:`config/herdr-app/update-notes-cache.md`. Earlier presentation work has since been committed; do not carry a stale list of formerly uncommitted prerequisites. Recheck all status/diffs at execution time and preserve unrelated work.

Recorded integration target: `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `723e4ef979b41180c43106f21983e3907c7b26e9`. Actual task checkout: `C:/Users/mglenn/.dotfiles/.worktrees/t3-native-subagents`, branch `feat/t3-native-subagents`. The existing checkout was initially prepared at `C:/Users/mglenn/.dotfiles-worktrees/t3-native-subagents` and moved, not recreated, after owned workers settled so it satisfies the unchanged native closeout boundary. Preparation used the existing `preparePlanRun` helper and retained the task-owned source spec in the origin. If prepared-run context matches this spec, consume its coordinates without creating another checkout or replacing the recorded origin. Carry task-owned spec content without deleting its source. **No module branch, commit, merge, build, or pin update is needed.**

## Phase 1 design contract

### 1. Host selection and public tools

Choose the T3 backend before native child-manager creation, subscriptions, tool registration, or goal binding. Plain RPC is insufficient: retain the existing immediate-client/host distinction. A native Pi child inheriting T3 markers remains native RPC. T3 role children use Pi-side role bindings, not a forged `PI_SUBAGENT_AUTHORITY`/native endpoint identity.

Keep native `subagent`, `subagent_control`, and `subagent_parent` unchanged outside T3. Proposed T3-only tool names are **`t3_delegate_role`**, **`t3_role_control`**, and **`t3_role_parent`**. Use a distinct launch name: the current T3 Pi adapter infers provider-native children from a tool named `subagent`, which would create misleading duplicate lifecycle/card state.

Map the canonical role tool intents `subagent`, `subagent_control`, and `subagent_parent` to these T3 wrapper names without editing the shared role definitions. Store the resolved backend tool names separately from the canonical role policy.

The T3 launch/control tools call the actual injected orchestration tools through Pi's supported `ctx.executeTool()`. Resolve the callable name and bridge source from the runtime's tool inventory, including required late registration through `reachesTools`; do not guess a model-facing alias, call a replacement CLI, or edit the injected bridge. Check nested `isError`, not just promise rejection. Normal validation, permission hooks, cancellation, and execution events must remain active.

The existing raw T3 tools remain generic tools for the orchestrator. Named-role launches use the Pi role wrapper; do not silently fall back to generic delegation if role preparation fails. Restricted children can reach only the subset permitted by their frozen role and owned-child relationship.

### 2. Resolve a role and prepare a Pi-owned handoff

Reuse P:`definitions.ts`/`options.ts` rather than maintaining another role catalog. Preserve trusted project replacement/tombstones, explicit settings over defaults, Pi registry alias resolution, effort constraints, skills, and coordinator/leaf allowlists. Explicitly choose the Pi provider instance, provider-qualified model, and supported `thinking` option; do not inherit the parent's expensive model/effort in place of role defaults.

Proposed Pi-owned `T3RoleHandoff` contains a version/launch ID, frozen definition and allowed delegates, selected settings/skill sources, commissioning T3/Pi identities, workspace strategy, and optional existing goal scope or validated closeout manifest. Role prompts/catalogs stay Pi-owned, not in new T3 fields. Arbitrary model-authored role JSON is not accepted as authority.

Write only the authority/identity metadata needed for bootstrap and resume under the already ignored P:`sessions/.t3-roles/`. Validate/claim it atomically using comparable repository file-state patterns. Persist role snapshots and launch/control receipts with Pi session custom entries. T3 remains canonical for task/run status, results, delivery, and history; do not mirror that lifecycle in another database.

The launch ID is an opaque reference, not an authentication token. Validation must check actual T3 identity/lineage, selected profile, and the stored handoff. Never persist or expose T3 bearer tokens/authenticated endpoints in handoffs, session entries, task text, or logs.

### 3. Bootstrap before the first assignment request

Call the existing `delegate_task` with supported fields only:

- `task` starts with a private registered Pi command, proposed `/t3-role-bootstrap <launch-id>`, followed by the human-readable brief.
- Omit the generic `role` field or use `general`. Other existing categories prepend prose and would hide the leading command from Pi's command dispatcher.
- Use an ordinary readable title such as `[reviewer] Review the parser change`.
- Pass actual target model/options, `isolation`, wait/async mode, and a stable `clientRequestId` through the existing schema.

The profile command validates the handoff and actual caller/child context, binds the role, appends its snapshot, and then starts the stored assignment with `pi.sendUserMessage(actualAssignment)` without command/template expansion. The command does not make an LLM request itself. Its ensuing `before_agent_start` hook applies role prompt sections, selected skills/tools, and delegate policy before the model request. A registered-command failure must not dispatch the assignment.

Use a small profile-owned authenticated **metadata reader** for capabilities/current-thread/lineage when command/session hooks lack a tool execution context. Follow the existing HTTP MCP protocol and supplied in-process credentials; do not make a second general delegation client or scrape T3 databases. Model-requested mutations use composed tools. A narrowly owned cancellation callback may serve the existing goal stop policy outside model tool execution.

A matched profile/command installation is required. Missing callable tools, missing handler, invalid handoff, incompatible settings, or failed identity lookup produce an explicit unsupported/bootstrap error, not unrestricted execution. New child processes must load the updated default profile; do not assume reloading a parent updates an already running retained child. The integration check must demonstrate the actual command-to-assignment path, including failures and command-only settlement.

### 4. Enforce and restore authority in Pi

T3 launches its normal configured Pi profile; it does not offer per-task native `--no-extensions` flags. **Do not promise identical extension-discovery isolation to native child argv.** Enforce the role through Pi's actual prompt, tool-loadout, and blocking dispatch hooks, adapting only the profile lifecycle consumers that would otherwise interfere.

- Normalize native and T3 role authority through a shared Pi-side accessor. Freeze role tools/delegates and restore from the current session branch plus the thread binding before work resumes.
- Preserve loaded project context/trust while selecting the role's prompt/skill contributions. Structured prompt changes must not leave contradictory caller/coordinator/leaf guidance or unrelated skill catalogs in a leaf's model prompt.
- Set active/declared tools and independently deny unauthorized calls, including deferred tools, tool search, codemode, and raw qualified T3 tools.
- Separate a role's public authority from internal composed MCP operations. A wrapper-scoped grant can authorize only its expected nested operation/target using Pi-issued parent-call identity; it must not grant the model unrestricted raw delegation, arbitrary thread mutation, or new tool activation. Hide internal declarations through supported composition/loadout APIs where useful.
- Preserve Explorer's inspection policy even though role binding occurs after extension factories load. Its early/static native-marker check must read normalized role state at the operative boundary, not remain stuck in broad parent mode.
- Keep goal/operator/native child hooks from creating a native manager or taking over a role child. Retain provider registration and finalized usage accounting needed by Pi-supported models, without enabling operator commands as role authority.
- Restore after resource reload, native session resume/tree changes, and T3 fresh-context replacement. A fresh Pi session for an already bound T3 role thread must not silently widen into an orchestrator. Copied history must not transfer task/goal/closeout ownership to an unrelated fork.

Runtime/interaction ceilings and approvals remain T3-owned. Full access never disables Pi role/Damage Control checks. Do not suppress real T3 approvals by falsely labeling a mutating wrapper read-only. These role restrictions are not an operating-system sandbox.

### 5. Lifecycle, questions, and outcomes

Use T3's task/thread/run IDs distinctly. A profile role handle identifies the retained conversation; each later assignment has its own current task ID. Return the child link verbatim and native Pi session identity only when actually known.

- Background launches return promptly. Strategist stays foreground; other foreground launches retain the existing justified-blocking policy. Waiting composes existing event-driven T3 waits, never a status-polling loop or schedule. An interrupted/timed-out wait leaves the child live.
- T3 supplies progress, parent wakes, final results, delivery acknowledgment, and continuing-descendant settlement. Do not also inject native `subagent-result` messages or infer completion from tool launch returning/widget disappearance.
- `t3_role_control` composes status/read, permitted active messages, retained-thread follow-up, answer, and cancel. A terminal follow-up reports the newly returned task ID. New review/re-check assignments retain T3's fresh-delegation guidance.
- Cancellation uses the current owned task/child relationship and T3's existing descendant/queued-work behavior. Keep old results readable; preserve refusal if a user raised a child's modes. Native pane cleanup/escalation controls are not fabricated.
- `t3_role_parent` questions use `ctx.ui.input` and T3's existing pending-user-input path. The parent is notified by T3 and can answer through `t3_pending_request`, or the user can answer in the existing UI. Never route an answer into permission approval.
- **User-confirmed host behavior:** this blocks only the questioning child until its answer; the parent and other children can continue working. The native yield-and-discuss/cancel-question protocol is not promised. Do not expose a question-cancellation action that the existing API lacks. A process-lost dialog may need re-presentation from persisted question intent with a new request ID.
- Preserve partial/blocked reports in Pi-owned metadata and normal result text. A wrapper result distinguishes `t3Status` from substantive `roleOutcome`; an ended execution is not proof the work succeeded. Do not invent a new T3 terminal status/badge or require custom-message rendering.

### 6. Workspaces and Integrator

Use supported `shared`/`worktree` isolation. The current local delegate API does not select arbitrary cwd, another local project, or a pre-existing worktree. The T3 role tool describes that limit rather than copying unsupported native arguments, using shell `cd` as a fake binding, or silently dropping an explicit cwd request.

Bind project-relative skill/resource references against the actual child checkout after T3 prepares it; profile resources remain profile paths. Preserve the actual child's trust rules: a role selected by a trusted parent does not mark a new checkout trusted or enable its protected project configuration. Missing selected resources fail explicitly rather than falling back to a different source.

Integrator retains manifest validation and exact-checkout authority. A T3 Integrator can run with shared isolation only when its commissioning **T3 thread is already bound to the manifest target checkout**. Validate that again in the child's bootstrap. If not, report the actual mismatch; do not create an unasked top-level thread, switch workspaces, or launch a hidden native fallback. The existing instruction to dispatch closeout from the recorded target remains important.

Keep Herdr same-tab successor/retirement unchanged. T3 uses ordinary parent-owned questions/reporting. A T3-bound manifest has Pi-side runtime provenance validated by the handoff, not a new T3 schema or a forged native endpoint.

### 7. Goals without another lifecycle system

Keep the existing goal state, baseline, admission evaluator, enrollment, usage ledgers, and incomplete-accounting behavior canonical. Replace `goal.ts`'s direct native-manager coupling with a small native/T3 backend boundary.

Capture goal scope in the role handoff; enroll the child's actual Pi session and nested descendants. Reuse the existing authenticated profile transport for admission/enrollment/finalized-accounting callbacks where needed, without using it to spawn/control T3 processes. Never put that transport's private credentials in T3 task text. Restore bindings when the owning Pi process resumes; absent owner/admission is a reported block, not permission to ignore a budget.

Goal pause/stop/denial cancels only the scope's owned T3 work through existing T3 cancellation. Do not compute a second budget from UI token totals or silently miss descendants. Exact usage identities prevent double accounting. Preserve existing clear/new-session policy; explicit `/clear` cleans up this owner's active work through its selected backend, while reload/reconnect does not masquerade as cancellation.

### 8. Presentation and deployment boundary

Use existing T3 task cards, titles, model/workspace/activity, pending questions, results, and child navigation. This plan does not add role badges, custom statuses, frontend selectors, new buttons, or mobile/web/desktop code. Progress is not a duplicate transcript.

Setup already selects the default Pi profile and disables inherited Herdr-pane management. No T3 build or installation is required for this design. After dotfiles integration, affected idle Pi processes may need resource reload/restart to load new profile code. State that specifically; do not replace/restart the user's T3 app or this conversation as a validation shortcut.

## Execution guidance

Before delegation, consult Strategist unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead keeps its own Strategist-first workflow. Use active roles, at most one named task per subagent, and read-only reviewer/validator roles if used. No council or mandatory reviewer sequence is added.

Implement in the recorded dedicated task checkout, preserving unrelated work. Ready independent work can run concurrently after its interface prerequisite is integrated; shared extension registration/exports belong to the parent integrator, not competing workers. Continue independent work around a genuine blocker. Adapt mechanisms within this scope, but ask before changing behavior/acceptance or proposing any T3 modification. Passing isolated tests does not justify ignoring a demonstrated task defect. Stop when the finite checks pass.

## Phase 1 tasks

- [x] **T1: Establish the Pi-only backend and authority contracts**
  - Depends on: none.
  - Ownership: P:`lib/subagents/{definitions,options,guidance}.ts`, proposed `authority.ts` and `t3/contracts.ts`; host-selection boundary and `extensions/subagents.ts` native-side guard.
  - Change: share trusted role/settings resolution, canonical-to-backend tool-intent mapping, and normalized authority; define the Pi-owned handoff/binding/result types and selected-backend interface. Select T3 before native registration/initialization. Preserve native args, prompts, role defaults, and lifecycle outside T3. No T3 contract exports.
  - Verify: existing definition/model/skill/host/native-guidance tests plus focused contract and backend-selection cases.
  - Done when: downstream tasks have concrete Pi-owned interfaces and the native path remains unchanged.
  - Evidence: Implemented shared resolver/authority/backend contracts and early native guard. T1 focused 7 files / 97 tests passed; downstream interfaces are integrated. Final finite validation is tracked in T8.

- [x] **T2: Implement scoped role handoffs and authenticated context lookup**
  - Depends on: T1 types and role resolver.
  - Ownership: proposed P:`lib/subagents/t3/{handoffs,context}.ts` and focused tests.
  - Change: store only immutable authority/identity bindings and receipts under ignored profile session state; validate/claim a handoff against actual T3 identity/lineage, snapshot/source/trust and destination. Add the narrow public-MCP metadata reader for command/session contexts using existing injected credentials. Persist no bearer tokens and mirror no task lifecycle.
  - Verify: valid/wrong-owner/reused/malformed handoffs, concurrent claim, branch/session/thread mismatch, missing identity service, and credential-free persisted/error data. Use a boundary fixture, not a T3 product import.
  - Done when: bootstrap and control can resolve trusted role data and actual ownership without a T3 database patch or model tool call.
  - Evidence: Implemented strict handoff/claim/binding/receipt/outcome and private goal-endpoint storage, real JSON/SSE metadata lookup, and narrowly owned cancellation. Handoff/contracts 14 tests, goal-store 3 tests, metadata-control 6 tests passed. Public parent activity resolves canonical task IDs before a blocking delegation returns; no opaque-ID derivation, status mirror, or bearer persistence.

- [x] **T3: Bootstrap, enforce, and restore T3 role children in Pi**
  - Depends on: T1 authority, T2 handoff/context APIs.
  - Ownership: proposed P:`extensions/t3-subagents.ts` bootstrap/lifecycle registration and `lib/subagents/t3/bootstrap.ts`; necessary Damage Control/role-dependent consumers; focused tests.
  - Change: register the private bootstrap command, validate/bind/persist before dispatching the actual brief, and apply structured prompt/tool/skill authority before the first request. Deny deferred/raw/nested bypasses, preserve Explorer inspection/provider accounting, suppress inappropriate native/goal/operator side effects, and restore frozen authority after resume/reload/fresh context. Parent integrates shared registration edits with T4.
  - Verify: deterministic installed-Pi command-to-model fixture records first-request prompt/tools, permitted read, blocked write/delegation/codemode escape, selected skills, invalid handoff causing no assignment request, and persistence/restoration. Check actual hooks/loadout, not merely prompt text.
  - Done when: a role is enforced before execution and cannot widen on a retained conversation reset. No claim of per-task CLI extension isolation.
  - Complexity: command context binds state; agent-start context changes prompt/loadout. Avoid relying on a thrown input hook as the only fail-closed mechanism.
  - Evidence: Implemented bootstrap, frozen settings/resources/loadout, dispatch grants, restoration, and dynamic Explorer policy. Installed-Pi/bootstrap 8 tests and focused DC 55 tests passed. Production installed-Nightly reviewer read/report passed. Added shutdown/start authority resubscription regression; expanded lifecycle acceptance remains T8.

- [x] **T4: Compose existing T3 launch, control, and question tools**
  - Depends on: T1-T3 role/bootstrap contracts.
  - Ownership: proposed P:`lib/subagents/t3/{launch,control,parent}.ts`, tool registration in `extensions/t3-subagents.ts`, and behavior tests.
  - Change: implement distinct T3 role tool names using `ctx.executeTool` and existing schemas. Preserve settings/defaults, generic-role prefix avoidance, mode ceilings, current-task identity, readable titles/links, waits, follow-ups/cancel, and T3-native question/answer behavior. Scope internal composed operations and expose true host capabilities. Record blocked/partial outcomes without new T3 statuses or duplicate native notifications/cards.
  - Verify: composed-tool validation/errors/approval denial, one actual app-owned launch, async/wait interruption, question return/answer, terminal follow-up/new ID, current-work cancellation, ownership rejection, wrong callable tool, prefix-free bootstrap text, and no tool named `subagent` in this path.
  - Done when: complete named-role commissioning/control works through the existing T3 tools and no general replacement MCP delegation client is required.
  - Evidence: Tools are registered and compose actual source-verified bridge operations. Current Pi instance, supported option projection, blocking/default policy, outcome/run identity, freshContext, historical reads and current-task refusal are covered by 14 focused tests. First production app-owned launch/read/report/result passed. Expanded question/follow-up/cancel/reload/restart smoke remains T8.

- [x] **T5: Preserve goal scope, accounting, and stop propagation**
  - Depends on: T2 identity bindings, T3 native session identity, T4 task/control mappings.
  - Ownership: P:`extensions/goal.ts`, goal/backend integration, proposed `lib/subagents/t3/goal.ts`; existing transport/accounting use sites as needed.
  - Change: bind existing goal callbacks to the selected backend; reuse authenticated profile callback transport without native process management. Capture/enroll nested scope, account finalized usage once, restore owner bindings, deny unavailable admission, and cancel scoped T3 work on pause/stop/budget denial. Replace native-only clear/reset coupling where needed.
  - Verify: existing goal tests plus nested T3 membership, duplicate accounting, denial before further work, owner reload/unavailability, pause/stop scope, clear versus reload, and unchanged native outcomes. No live paid budget-exhaustion experiment or second usage ledger.
  - Done when: T3 execution cannot escape the existing goal budget/stop policy and unrelated work remains untouched.
  - Evidence: Implemented selected goal backend, authenticated callbacks, nested native-session enrollment/admission/accounting, owned stop/clear, non-cancelling T3 restore, and per-attempt compaction gate. `pnpm test goal compaction`: 9 files / 79 tests passed. Existing native restore default remains unchanged.

- [x] **T6: Preserve manifest-bound Integrator authority within real workspace limits**
  - Depends on: T2-T4 bootstrap/control and actual workspace identity.
  - Parallel with: T5 on disjoint closeout helpers; parent owns shared registrations.
  - Ownership: P:`lib/subagents/closeout-handoff.ts`, `lib/damage-control/plan-integration-authority.ts`, proposed `lib/subagents/t3/closeout.ts`, closeout tests.
  - Change: validate the existing manifest and Pi-side T3 provenance; require the inherited T3 checkout to match its exact target. Preserve native handoffs and no-merge restrictions. Return normal typed closeout outcomes to the parent; do not port Herdr retirement or invent an existing-worktree delegate argument.
  - Verify: deterministic fixture for valid target, missing/forged/wrong-role/no-merge/wrong-workspace handoffs, resume, and unchanged native checks. No fixture merge into the operator's repository.
  - Done when: a correctly bound T3 Integrator has the existing scoped authority, and unsupported workspace requests fail honestly rather than launch elsewhere.
  - Evidence: Implemented exact-target prepare/bootstrap validation, typed runtime provenance, T3-only authenticated helper endpoint and cross-loader DC authority. Focused 54 tests passed, including real temporary Git helper integration. Existing native `.worktrees` boundary is preserved. An early additional native closeout run exceeded 180 seconds; the later finite validator completed those suites within its longer bound.

- [x] **T7: Compose backend-specific guidance and document real capabilities**
  - Depends on: T4 tool behavior; integrate T5/T6 specifics before finalizing docs.
  - Ownership: P:`lib/subagents/guidance.ts`, prompt/tool descriptions and tests; P:`docs/subagents.md`; D:`docs/t3-code.md`, relevant `pi/README.md` and `CHANGELOG.md` sections.
  - Change: keep one coherent named-role/catalog policy per host, preserving Strategist/Steward/council/writer rules. Explain existing-T3 generic delegation versus Pi-enforced roles, blocking questions, outcomes, actual workspace limits, IDs, goals, and exact-checkout closeout. Describe profile reload, not T3 installation. No T3-generated prompt edits or module docs/evals.
  - Verify: full caller/coordinator/leaf compositions, required inclusion/unrelated exclusion, deterministic catalog ordering, and static size comparison without cache-performance claims. Check documented tool names/settings against implementation.
  - Done when: callers receive consistent instructions for supported operations, not competing native/T3 paths or promises of unavailable UI features.
  - Evidence: Backend caller/coordinator/leaf composition and request projections are registered; shared role definitions and native composition remain unchanged. Guidance 2 files / 24 tests passed. Docs/changelog describe real tools, blocking questions, effort projection, workspace/goal/closeout limits and profile reload, not a T3 installation.

- [x] **T8: Validate the integrated default-profile path on installed T3**
  - Depends on: T3-T7 integrated behavior.
  - Ownership: existing P: test/fixture infrastructure, proposed P:`scripts/t3-subagent-smoke.mjs` if needed, and primary-agent integration fixes.
  - Change: run the finite checks below and one isolated protocol/lifecycle smoke with the existing desktop-selected Nightly and deterministic real-Pi provider fixture. Verify actual child linkage, bootstrap, question/answer, result delivery, continuation, cancel, and restart. Keep any rendered-card inspection attributable to that isolated run. Fix only demonstrated task-related defects.
  - Verify: exact commands/results/profile/version; no T3 source/generated bridge/binary/live userdata modifications. An ordinary default-profile test run must not require a T3 source checkout/build. Reuse cross-platform subprocess helpers and actual CLI help; do not guess Windows shim behavior.
  - Done when: agent-owned automated checks pass and integrated smoke results/limits are recorded accurately. Missing external/live/manual verification is not an invented operator acceptance gate; a demonstrated failure remains task work.
  - Evidence: **Passed.** From the relocated default profile: `pnpm run typecheck`; the finite command below plus directly affected inspection/compaction/closeout filters with `--maxWorkers=1` (56 files passed, 3 skipped; 593 tests passed, 14 existing opt-in tests skipped); and `node scripts/native-composition-smoke.mjs` on Pi 1.5.0. The same filters run concurrently with live smoke had subprocess timeouts; no production/test timeout values were raised. Installed smoke passed on T3 `0.1.8-nightly.20261108.4380` / actual Pi `1.5.0` with 46 deterministic requests, 18 enforced child requests, exactly 3 existing T3 delegations, real questions/worktree/follow-up/partial/cancel/reload/process-resume, and no native result injection. Command: `node scripts/t3-subagent-smoke.mjs --t3-cli C:/Users/mglenn/.t3/bin/t3.cmd --pi-binary C:/Users/mglenn/AppData/Local/pnpm/bin/pi.cmd --keep`. Isolated profile/evidence: `C:/Users/mglenn/AppData/Local/Temp/pi-t3-role-smoke-dDvef6/profile` and its parent directory. That run used the task checkout before relocation; final typecheck/unit/native checks used the relocated checkout with matching dependency links. No paid model requests, T3 modifications, live userdata changes, or rendered desktop-card inspection.

- [x] **T9: Archive, commit, integrate, and clean up dotfiles locally**
  - Depends on: T1-T8 complete with agreed checks and accurate limits.
  - Change: follow Closeout. Archive the whole spec and commit the dotfiles implementation. Dispatch the authorized Integrator from the recorded target; preserve unrelated work. Do not commit/update a T3 module pin or publish/install anything.
  - Verify: target/task commits, archived spec, completion metadata, preserved unrelated changes, no task-introduced T3 modifications, and task-worktree removal. Keep unfinished integration/cleanup unchecked with blocker, owner and next action.
  - Done when: authorized integration, metadata, and cleanup are verified, or a deliberate no-merge outcome retains the committed worktree. A blocker is not completion.
  - Evidence: **Completed 2026-11-10.** Task commit `42ba7a34e02db0d33370c73d896aae225505c16c` was merged into target `main` at `269b7a536de95221f8722d6d43260ec810026c4e`, preserving its independent starting state through `a79f882ff7eca12e4dd8d1999d312c83c9c52adc`. The task-owned active receipt was retired in `764eef2e11a5b85b1fdf85da1c36bc8013925cdf` after verifying its only difference from the archived receipt was the known pre-relocation worktree coordinate; the source spec directory is absent. Canonical manifest-bound closeout committed completion metadata as `09508d0e09afea8e6d73154c3f28a109e1bb8fcc` and verified cleanup: `.worktrees/t3-native-subagents` is absent and deregistered, while `feat/t3-native-subagents` is retained. The archived plan and research remain; the active spec stub is absent. Target is clean, unrelated `.dotfiles-worktrees/commit-workflow` remains registered, and no push or installation occurred.

## Phase 1 validation and current handoff

### Finite checks

From the task checkout's P: directory:

```sh
pnpm run typecheck
pnpm test t3-role subagent goal herdr-host runtime-reload profile-reload-integration damage-control/enforcement damage-control/plan-integration-authority
node scripts/native-composition-smoke.mjs
```

Include directly changed tests not matched by those filters. Filters go directly after `pnpm test`, never after `--`. Preserve existing opt-in live-test behavior and report actual skips. Add task cases at the lowest effective boundary, not duplicated test layers or a new test framework.

The integration smoke uses the **installed** desktop-selected T3 executable with an isolated temporary `--base-dir`, loopback host/available port, and `--no-browser`, plus the task checkout's default-profile code and deterministic fixture provider. Use existing configuration helpers/fixtures without copying credentials or touching live `~/.t3/userdata`. Record the final smoke command and retained evidence. The existing Nightly is the subject, not a locally built T3 server. Do not start a server against live state, replace the user's app, or restart the working conversation.

Finite behavior coverage: enforced first-request role/settings/skills; trusted role override/tombstone; leaf/coordinator/nested-call restrictions; one app-owned child/card source; foreground/background/question/result handling; retained follow-up identity; cancellation/ownership; reload/resume/fresh-context authority; shared/new-worktree behavior and explicit unsupported cwd; goal scope/accounting/stop; valid/invalid Integrator authority; unchanged native Pi/Herdr path.

T3 questions intentionally use its blocking input model. T3 execution status and the role's substantive outcome are distinct. Exact native question-cancellation and arbitrary-cwd parity are not acceptance promises. Do not add fake server fields or custom rendering to make those claims.

No T3 build, schema migration, module-wide check, module eval, custom package, or installer check belongs here. A live/model/browser limitation is reported honestly and does not become a mandatory user test; passing mocks alone does not prove a failed integration path works.

### Current handoff

- Status: **COMPLETED** on 2026-11-10. T1-T8 implementation and agreed checks passed; archive, merge, completion metadata and exact task-worktree cleanup are verified.
- Planning evidence: installed Pi composition/command/prompt/persistence APIs; actual generated bridge/tool discovery; read-only T3 delegation/question/cancel/workspace source; distinct installed CLI versions/help; proposed ignored metadata path. See research.
- T1-T7 implementation is delivered and shared registration is integrated. Current production smoke passed using installed Nightly `0.1.8-nightly.20261108.4380`, actual Pi `1.5.0` at `C:/Users/mglenn/AppData/Local/pnpm/bin/pi.cmd`, and isolated default-profile code. Evidence: `C:/Users/mglenn/AppData/Local/Temp/pi-t3-role-smoke-ytXXPG`. This proves real role bootstrap/read/skill/report/result, not every lifecycle path.
- Expanded installed smoke **passed** with 46 deterministic requests, including 18 child requests with reviewer authority, testing skill and exact low effort. It verifies async return, non-cancelling timeout, real question/list/read/answer while an independent worktree sibling finishes, partial fresh-context follow-up/new task, question-held cancellation, command-only in-place reload and actual process restart/resume. Evidence: `C:/Users/mglenn/AppData/Local/Temp/pi-t3-role-smoke-dDvef6`. No paid model requests or rendered-card claim. Restart exposed a JSON undefined-field comparison defect; both saved-entry and durable-binding values now use the same validated parser.
- Final finite validation passed after correcting native host/authority fixtures and waiting for real dispatch before the presentation abort. Resource-contended subprocess timeouts disappeared with the same filters run sequentially, without timeout changes. Typecheck and the faithful native-composition smoke passed at the relocated path. No additional audit or operator acceptance gate was added.
- The existing task checkout has moved into the unchanged native helper's required `D:/.worktrees/` location. Both prepared-run receipts retain the branch, origin, starting target commit and exact source snapshot with the new path. An orphaned read-only Git status process with a dead parent held the old checkout; only that verified process was stopped. No live Pi process was interrupted and no second checkout was created. Target `main` has independently advanced to `a79f882ff7eca12e4dd8d1999d312c83c9c52adc`; preserve those source/changelog/Herdr/module-pin changes.
- Scope decisions: unchanged T3, Pi-backed Phase 1, and the existing blocking child-question flow are confirmed. Direct Claude Code/Codex CLI usage remains possible Phase 2 only. Workspace limitations remain explicit in this draft, not reasons to modify T3.

## Closeout

After implementation and the agreed agent-owned checks pass, update task evidence and mark integration pending. Confirm D:`.specs/archive/t3-native-subagents/` does not contain another plan, then move this entire spec directory there in the task worktree and repair links. Commit the archived spec and implementation together on the dotfiles task branch. Do not archive unfinished implementation, stage unrelated changes, force-add ignored state, or update module pins.

For authorized `/do-it`, dispatch the Integrator after the task commit from the recorded target with the closeout manifest. Ordinary direct/T3 execution leaves questions/final reporting with the parent. Prepared Herdr execution uses its existing admitted same-tab successor: establish readiness, finish authorized parent-only obligations, release the exact origin, then let the surviving Integrator clean up/report. Do not create a second task worktree or choose a replacement target.

The Integrator verifies target/archive/preservation, records actual completion date/status/evidence, commits metadata, and removes the clean task worktree. Readiness is not completion. If blocked, retain exact worktree/process coordinates and report reason, action owner and next action. A post-integration cleanup failure is CLEANUP PENDING, not rollback or reason to recreate the orchestrator. With `--no-merge`, skip mutating integration and retain committed work intentionally. Operator manual/live testing does not block archival or authorized integration. Publication/deployment/install require separate explicit authorization; this plan never authorizes a modified T3 installation.

### Execution final response

Start with one explicit overall outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. Completion requires checks, integration, metadata, and verified cleanup. For blocked/cleanup outcomes, immediately give **Reason** and **Action needed**, naming owner and exact next action, before successes. Then report concise checks, archive, commits, merge/cleanup state, retained paths, actual profile/T3 version, and verification limits. Never describe profile-code delivery as a T3 build, installation, or already reloaded operator process.

## Integration evidence

Typecheck passed; finite selection56 files passed/3 skipped,593 tests passed/14 existing opt-in skipped with one worker; Pi1.5 native composition and installed unchanged T3 Nightly0.1.8-nightly.20261108.4380 full lifecycle smoke passed46 deterministic requests/18 enforced child requests, including real questions, independent worktree, follow-up/partial/cancel/reload/process restart. No paid smoke model requests, T3 changes, installation or publication.
