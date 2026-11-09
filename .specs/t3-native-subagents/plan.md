---
created: 2026-11-09
status: ready
completed: null
---

# Complete named-role subagents for T3-hosted Pi

## Goal and scope

Build a working T3 subagent system, not a presentation patch. A default-profile Pi orchestrator in T3 must commission the existing named roles with their actual model/effort/skill/tool/delegate policies, observe progress, handle questions and unfinished outcomes, receive final results, follow up, cancel, and resume durable history. T3 must show the real app-owned children and their lifecycle.

Settled user requirements:

- A single default Pi profile does not require a single execution backend. A separate T3 execution backend is permitted.
- Preserve standalone Pi and Herdr execution, role definitions, settings, useful delegation policy, and working native lifecycle behavior.
- Role restrictions must be enforced, not reduced to prose prepended to `delegate_task`.
- Cover execution, ownership, permissions, nested work, waiting, questions, results, follow-ups, cancellation, goals, restarts/history, workspaces, UI, and usable build/setup instructions.
- Investigate discoverable details instead of handing the investigation back to the user. Do not assume an open upstream PR is merged, installed, or compatible.

Selected architecture: **T3 owns execution and durable lifecycle; the default Pi profile owns named-role definitions and Pi-specific policy.** Share policy and resource selection with the native backend, not its subprocess manager. This is the implementation approach for the permitted separate backend, not a prerequisite to merge any upstream patch.

Non-goals: replacing the native backend; migrating historical native children into T3 threads; implementing T3 equivalents of Herdr panes or same-tab retirement; rewriting `/plans` or remote-environment management; adding a new provider-neutral workflow engine; changing role defaults or delegation rules; replacing T3's existing generic/cross-provider `delegate_task`; adding custom-message rendering patches; production deployment, publication, or installed-app replacement.

Authorization: this is planning only. No implementation, branch creation, commit, merge, install, or restart is authorized by producing this plan. A later `/do-it` authorizes this selected plan's implementation, dedicated task worktrees, local commits, and merge into the recorded targets unless `--no-merge` or a later restriction applies. Push, PR creation, deployment, and replacement of the operator's installed/running T3 require separate explicit authorization.

## Fresh-context handoff

### Repositories and paths

Path roots: **D:** = `C:/Users/mglenn/.dotfiles`; **P:** = D:`pi/profiles/default`; **T:** = D:`modules/t3code`, an independently owned repository. Consecutive paths in one list retain the stated root until another prefix appears. Proposed files are explicitly marked below.

- Dotfiles owns role definitions, profile extensions, shared policy, setup integration, and this coordinating spec.
- T3 owns application contracts, durable child/task state, orchestration services, its Pi adapter, and shared/client UI.
- Keep this entire spec in dotfiles. T3's `AGENTS.md` forbids committing plans/research there. Do not duplicate module source in dotfiles or add its files directly to a parent commit.
- Preserve other module repositories and the historical `pi/profiles/legacy` boundary. Do not inspect or operate through `~/.pi/agent` to reach legacy. Do not inspect `.repos` reference checkouts for this task.

Required reading, in order:

1. Current applicable `AGENTS.md` files, including D:`pi/profiles/default/AGENTS.md` and T:`AGENTS.md`.
2. [Research and source map](research.md), particularly the named-role gap and host/launch traps.
3. P:`docs/subagents.md`; `lib/subagents/{definitions,options,guidance,launch}.ts`; `extensions/{subagents,subagent-child,goal}.ts`.
4. T:`docs/orchestration-v2/orchestrator-mcp-server.md`; `packages/contracts/src/{orchestratorMcp,orchestrationV2}.ts`; `apps/server/src/mcp/OrchestratorMcpService.ts`.
5. T:`packages/provider-core/src/server/ProviderAdapter.ts`; `packages/provider-pi/src/server/{adapter,mcpInjection,mcpExtensionSource}.ts`.
6. Before editing those surfaces, the active Pi extension/TypeScript/testing skills and relevant installed Pi docs; T3's Effect-service/testing docs and `evals/README.md`. Read full applicable documents rather than relying on this path list.

### Verified baseline and limits

Planning date: 2026-11-09.

- D: `main`, HEAD `d128af12d161a3abe230c8a9c33838fc701d2210`.
- T: `main`, HEAD `e455200077ce60806a01c8f28435b58860dcfc74`, clean at the final planning check.
- Installed CLI: `0.1.8-nightly.20261108.4380`. The checked-out fork is not necessarily the installed server/desktop code.
- Verified planning profile: `C:/Users/mglenn/.dotfiles/pi/profiles/default`, installed Pi `1.5.0`. Intended execution/validation profile: that default profile, with isolated T3 development state and deterministic test fixtures where possible.
- The prior presentation work passed 159 tests in 13 focused files plus typecheck. That is not backend acceptance. No proposed T3 role-child lifecycle was live-tested during planning.
- App-owned T3 children already have durable task/thread ownership, completion delivery, workspace handling, permission ceilings, and cancellation. The missing link is a durable, enforced named-role execution contract, plus the native role-specific parent/goal/closeout semantics.

### Preserve existing work

Recheck status before editing. There are uncommitted presentation changes across D:`CHANGELOG.md`, `pi/README.md`, profile host/presentation/command extensions and tests, including untracked P:`lib/host-presentation.ts`. Do not overwrite or silently absorb that entire patch.

Known unrelated work includes P:`commands/commit/reviewer.ts`, `tests/commit-staging.test.ts`, untracked `commands/commit/repositories.ts`, `skills/t3code/references/validated-workflows.md`; D:`config/herdr-app/update-notes-cache.md` and changed `modules/hatchery`/`modules/homelab-infra` gitlinks. Preserve it without staging, reverting, or operating inside those modules.

The host-client helpers this plan references include uncommitted work in P:`lib/herdr-host.ts`, `lib/host-presentation.ts`, and their profile tests. A fresh task checkout does not contain that work merely because the origin does. Carry only the exact required prerequisite hunks/files, record their source, and preserve their source copies. Do not pull in unrelated command/presentation changes as a shortcut. Update overlapping documentation/changelog sections without erasing the origin's edits.

### Worktrees and targets

- Recorded originating integration target: `C:/Users/mglenn/.dotfiles`, branch `main`.
- Module integration target: the owning `modules/t3code` checkout, branch `main`; preserve its existing attachment. Never rewrite published history or force-push.
- Proposed task branch: `feat/t3-native-subagents`; task path: a dedicated sibling worktree selected by the execution runtime. Record actual coordinates before editing. Runtime-prepared coordinates supersede this proposed path, not the recorded originating target.
- Work on the task's independent module checkout, not the origin's module worktree. Commit/integrate module changes first, then commit the corresponding parent gitlink. A task-module initialization must not switch the origin checkout's branch or substitute a different repository.
- Local module/parent integration does not require publication. Do not pull, merge remote changes, or change branch bases automatically merely to make a local pin commit.

## Decisions and implementation contract

### 1. Backend selection and responsibility

| Concern | Standalone Pi / Herdr | T3-hosted Pi |
| --- | --- | --- |
| Definitions, trust, model/effort/skills, role policy | Existing profile sources | Same sources and resolver |
| Child process/session/pane lifecycle | Existing native runtime | T3 provider sessions and app-owned child threads |
| Durable task/result/question ownership | Existing native runtime | T3 event/projection/outbox path |
| UI | Existing native renderer/status/panes | Existing T3 task/lineage/thread views |
| Goal accounting/policy | Existing goal implementation | Same goal policy through a T3 transport adapter |

Select the backend before native runtime initialization or lifecycle subscriptions. Plain RPC is not evidence of T3. Use the actual immediate-client integration signal, and negotiate the new role capability with T3.

In T3, do not start/bind/reset the native child manager as a hidden side effect of loading `extensions/subagents.ts`, goal support, clear, or reload. Do not emit native result custom messages for T3-owned assignments. An explicit `/clear` uses the selected backend to cancel this owner's pending/running child work and parent requests before replacing its Pi session, preserving historical tasks and unrelated owners. Resource reload/provider reconnect is not clear: it retains app-owned children, frozen profiles, and pending delivery. In non-T3 clients, retain the current native backend and behavior.

A T3 role child uses a **distinct T3 execution marker**, not `PI_SUBAGENT_AUTHORITY` with its native endpoint assumptions. Normalize both representations through shared authority helpers where role-dependent checks need them. A native child inheriting T3 environment markers must still be recognized as native RPC; a real T3-owned role child must remain a T3 client.

Unsupported-version behavior: expose a precise capability/version error for named-role execution. Do not silently fall back to unrestricted `delegate_task`, hidden native subprocesses, another model, or another profile. Existing generic T3 delegation remains available and accurately described.

### 2. Frozen execution profile

Add a typed, versioned server-owned `AgentExecutionProfile` contract. Names below are implementation names, not requirements to invent a general plugin framework.

A public request selects a named role plus supported overrides. The parent Pi runtime resolves it from trusted profile/project definitions and its actual model registry. T3 accepts the resulting snapshot only through the authenticated provider-runtime control path, never as model-supplied role JSON.

The resolved profile carries:

- Driver/kind/version; role name, source identity and definition fingerprint.
- Frozen role prompt, tool/delegate authority, relevant resource selection and resolved skill identities/source references. Bind project-relative resources to the child's actual checkout; profile-owned resources remain profile paths.
- Resolved provider-qualified Pi model and effort/options. Explicit request > role default; retain existing fallback and Strategist/Steward constraints. Do not inherit the root's expensive model/thinking as a substitute for role defaults.
- A permitted-role catalog snapshot for coordinating children, so restart/follow-up does not widen delegation by rereading changed definitions. Leaf roles have no dispatch authority even when a catalog is visible.
- Canonical workspace/working-directory context and the parent's project-trust decision; preserve normal scoped instruction/context-file discovery. Resolve the actual workspace before binding launch resource paths. Missing selected resources fail explicitly rather than falling back to a different source.
- Optional existing goal scope and validated Integrator manifest/provenance, when applicable.

Persist the full execution profile in T3's server-owned per-thread event/projection state before launching the child. Expose only a small role descriptor on public thread/task DTOs. Do not send full prompts, resource paths, catalogs, or credentials through every client snapshot. Authentication tokens/endpoints are never persisted in this profile.

The snapshot follows the child conversation through process restart, adapter resume, follow-up assignments, and terminal history reads. Include execution-profile identity in runtime compatibility/restart decisions; never reuse a broad root or differently restricted runtime as a role child. New children can pick up newly resolved definitions; a retained child's authority does not silently change. Old events/threads without a profile retain existing behavior. Migration and event decoding must handle that absent field explicitly.

Provider support: the first execution-profile kind is Pi. Other adapters keep existing generic delegation. A Pi-role request targeting an incompatible driver is rejected before child creation, not run with prompt-only restrictions.

### 3. Profile/runtime control transport

Use the existing Pi RPC connection and injected T3 extension rather than launching an extra role-discovery process or opening a new native parent server.

- Add a private, versioned extension control command and correlated response envelope for capability/catalog discovery, role resolution, and bounded policy callbacks. The profile supplies the handlers; the T3 Pi adapter owns transport/correlation.
- Verify the command is registered via `get_commands` before invoking it. Unknown slash commands can otherwise become ordinary model prompts.
- A private command runs extension code only, produces no model turn, and replies through a reserved structured extension-UI envelope consumed by the adapter at **session scope**, before active-turn filtering/wake buffering. It is not visible card state and is not persisted as a chat custom message.
- The generated bridge forwards a typed in-process extension event to profile handlers, avoiding another HTTP client/authentication implementation in dotfiles. Child-to-server operations use the existing per-thread authenticated MCP bridge.
- Correlate protocol version, request ID, thread/session ownership, and cancellation. Bound requests by existing RPC deadlines; teardown rejects outstanding requests. Do not retry a possibly committed launch under a fresh identity.
- Publish capability only after handshake. A missing profile handler, missing resource, incompatible protocol, or unavailable model fails clearly before any unrestricted child turn.

### 4. Enforced role bootstrap and permissions

Share the native backend's **resource/prompt/authority policy**, not its entire launch command.

T3 constructs a durable Pi RPC launch with its own session/resume flags and permission mapping. It disables broad extension/prompt/theme discovery for role children and loads only the selected profile resources plus the trusted T3 bridge. Preserve role-specific skill behavior, Team Lead's codemode support, scoped instructions, Damage Control, provenance, web/analytics tools, and Bedrock provider/accounting selection.

Do not copy native `--approve`, native parent endpoint flags, ephemeral-session settings, or pane flags into this launch. The current `disableExtensions` helper also removes the T3 bridge, so add a distinct role-isolation path instead of setting that flag blindly. User launch arguments cannot re-enable unrelated extensions or replace frozen tools.

Apply authority through both declared/active tools and blocking dispatch checks. Deferred tools and calls routed through tool search/codemode must meet the same policy. For T3 application mutations, validate the authenticated caller's execution profile server-side as well: a nondelegating role cannot bypass its allowlist by directly calling raw `delegate_task` or a top-level thread-launch tool; a coordinator cannot commission an unnamed/unrestricted child to evade its permitted roles. Reuse existing caller/lineage permissions for control operations.

Runtime/interaction modes remain at or below the parent's existing T3 ceilings. Full access does not remove role restrictions or Pi Damage Control. Approval-required must still function through T3's user approval UI. Parent answers cannot grant tool permission. Do not add a new operating-system sandbox or stronger shell policy than the comparable native role has.

### 5. Public tools, identities, workspaces, and waiting

Keep the profile's named-role entry points (`subagent`, `subagent_control`, `subagent_parent`) as host-specific facades. In T3 they call app-owned service operations, not `getSubagentRuntime`. Extend `delegate_task` with an optional named-role selector for callers that explicitly use that tool. Keep its generic `role` category separate from the named execution profile.

Return distinct IDs: an opaque backend-tagged `subagentId` identifying the saved child conversation, its `childThreadId`/link, the **current assignment's** `taskId`, and actual native Pi session identity only when established. Never invent a Pi UUID or treat it as a T3 task ID. Stable child-handle lookup must be scoped to the commissioning parent and resolved server-side, without an in-memory dotfiles task registry.

- `subagent` accepts the existing named-role settings, preserving model/effort/skills precedence. T3 additionally uses its existing shared/worktree isolation facilities. Never create a shell worktree to pretend it is attached to an app-owned child.
- An explicit `cwd` must be honored through T3's actual workspace/working-directory contract. Extend the named-role delegation input with the existing typed workspace strategy and a separate working-directory value where needed; do not conflate provider cwd with worktree root. Reuse existing-worktree resolution for a recorded checkout, including an Integrator's target; retain branch/worktree metadata. A subdirectory remains a working directory inside its bound workspace, not a fabricated new worktree. Validate the destination before launch. Do not silently ignore unsupported/out-of-environment paths or spawn a native fallback.
- Strategist remains a foreground call. Other foreground launches retain the required `blockingReason`; background work returns handles immediately and completes through automatic delivery.
- Implement waiting through T3's existing event-driven delegate wait/return semantics, not status polling, timers, or schedules. A wait timeout/interruption returns a still-live handle and never marks or cancels the child. An aborted launch request after its command commits must not implicitly cancel the child.
- `inspect` reads canonical task/thread state. `message` resumes the same frozen role conversation; after terminal completion it starts a **new task** and returns the new task ID. Active-run steering/queue behavior uses T3's existing message semantics. New review/re-check assignments retain T3's fresh-delegation guidance.
- `cancel` resolves the stable child handle to its current work, stops queued/running work and descendants through T3, and leaves completed history intact. Do not accidentally cancel only an obsolete terminal task while its follow-up runs.
- Do not fake native pane concepts. `surface:visible`, native escalation/cleanup controls, and same-tab successor retirement are not silently emulated. T3-facing schemas/guidance describe actual app-owned controls and provide the child thread link for human inspection; native-only arguments receive a clear host-specific response.

The adapter must not also infer a provider-native child from the facade's `subagent` tool call/result. Negotiated app-owned delegation produces exactly one canonical task/lineage entry, not a native card plus an app-owned card.

### 6. Questions, reports, completion, and nested work

Add typed delegated-parent requests/reports to T3's existing durable command/event/projection/outbox machinery. Reuse existing request infrastructure where it fits; do not create a second filesystem task database.

- `subagent_parent.question` creates a request addressed to the commissioning parent, records its ID, and cleanly yields the child turn. The assignment remains waiting, not successfully completed merely because Pi emitted `agent_end`.
- Wake/notify the owner with the question, separately from final completion delivery. A foreground delegate call returns the pending-question state instead of waiting indefinitely for itself to answer it.
- Ordinary parent discussion may resume the child without disposing the question. `answer` names and resolves the outstanding request and resumes the same assignment. `cancel-question` explicitly resolves it when discussion has answered it. Both survive server/provider restart.
- Missing/stale/already-resolved request IDs return exact disposition; never route an answer to an unrelated pending permission dialog or another child.
- `partial` and `blocked` are structured unfinished outcomes/reports, not success. Preserve the report and final text distinctly in task results/UI. A normal final reply with no unresolved parent request is successful completion.
- A coordinator's ended turn is not overall completion while its permitted descendants continue or their results still need delivery. Reuse T3's delegated-work settlement/completion-delivery logic.
- Final results are durably delivered to the owner through T3 once per assignment; history/result reads acknowledge the same delivery. No parallel native `sendMessage` result injection. Parent idleness, interrupted waits, reconnect, and provider restart must not lose the result or awaken the wrong thread.
- A child question is not a permission approval. Existing human approval/secret flows stay on their owning T3 surfaces.

### 7. Goals and Integrator authority

Goals are part of compatibility, not an optional later patch. Replace direct native-runtime coupling with a small backend-facing goal interface while leaving the existing goal state/budget policy canonical.

A T3 child captures its existing goal owner/run scope at commission time; descendants inherit that same scope. Before additional model work, route admission to the owning goal policy through the authenticated runtime bridge. Attribute finalized child usage/session membership through existing accounting paths, deduplicate existing usage identities, and preserve the existing incomplete-accounting behavior. Do not make a separate token/cost ledger from T3 UI totals. Goal pause/stop/budget denial cancels the scope's live T3 descendants through app-owned cancellation. Provider restart restores the binding; a new T3 thread does not inherit another thread's goal. Follow existing clear/new-session semantics rather than silently carrying an old goal into a replacement conversation.

Preserve Integrator's exceptional, manifest-bound authority. A T3 Integrator is an ordinary app-owned role child with a validated closeout manifest and T3 runtime provenance bound to child, owner, and exact target checkout. Update the shared authority/Damage Control adapters so this is equivalent to the native checked handoff, without pretending there is a native parent endpoint. Reject a missing/forged/mismatched/no-merge handoff as native policy already requires. The T3 parent remains responsible for user questions and final reporting; do not port Herdr same-tab retirement as part of this plan.

### 8. Presentation and delivery

Use existing T3 child-thread/task/lineage projections as the single UI source. Populate the real role, actual resolved model/effort, workspace, running/waiting/terminal state, recent activity, question/report disposition, result, and error. Preserve direct parent/child navigation, nested work, cancel, and continuation behavior.

Put shared selectors/state changes in `packages/client-runtime`; web/desktop and mobile consume the same semantics. Add client-specific code only where the existing view lacks an actionable question/status/control. Use existing permission guards, environment routing, and typed RPC operations. Do not render full role catalogs or a continuously streaming duplicate transcript in parent snapshots.

No dependency on PRs #32079, #23786, or #32458. Useful patterns may be reused with attribution and focused tests, but do not cherry-pick their community-specific protocols wholesale. Private role-control envelopes must remain private even if later T3 versions render `display:true` custom messages.

## Execution guidance

Create or resume the dedicated task worktree and record actual branch/path/origin before editing. Consume matching runtime-prepared coordinates without making another checkout or taking the task branch as the integration target. Carry this task-owned spec without deleting its source.

Before delegating implementation-plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead retains its own Strategist-first workflow. Use only active roles; assign at most one named task below per subagent and split further if a bounded context cannot cover its outcome. Reviewer/validator assignments, if used, are read-only and return evidence, not files. This plan does not mandate a review sequence or council.

Integrate interface prerequisites before their consumers. Useful initial concurrency is T2, T3, and T4 after T1; later T7, T8, T9, and T10 can proceed on their named disjoint files once their prerequisites are integrated. The parent owns coordination of edits to shared service registration/schema/export files; do not have parallel workers rewrite them. Task numbering alone is not a dependency.

Adapt ordinary mechanisms to current repository evidence while preserving this contract. Continue independent tasks around a real blocker. Ask before changing scope, settled behavior, or acceptance; do not ask the user to discover source facts. Keep task evidence/blockers/next actions accurate. Fix demonstrated task-related defects, then stop when the finite checks pass. No extra audit, rollout gate, backup scheme, or new telemetry project.

## Tasks

- [ ] **T1: Establish the typed role and parent-interaction interfaces**
  - Depends on: none.
  - Ownership: T:`packages/contracts/src/{orchestratorMcp,orchestrationV2}.ts`, proposed `agentExecution.ts`, exports, and T:`packages/provider-core/src/server/ProviderAdapter.ts` signatures only.
  - Change: define the versioned frozen execution profile, small public descriptor, capability/catalog result, role selector/overrides, workspace strategy/working-directory binding, distinct handles, parent-question/report contracts, and optional goal/closeout payloads. Define optional provider-runtime discovery/resolution/policy methods and propagate typed execution-profile input through open/ensure/turn/resume contracts. Default absent fields for existing events/adapters. Public tools cannot submit a trusted snapshot. Keep generic `role` separate.
  - Verify: focused contract decode/compatibility tests, including old profile-less events, invalid profiles, and public/private DTO boundaries. Run affected-package checks, not repo-wide tests.
  - Done when: T2/T3/T4 can implement against concrete interfaces without redesigning field ownership; other providers compile and retain their old path.
  - Complexity: coupled public/internal schemas. Resolve authority provenance and nullable/backward decode behavior here; leave SQL representation and transport mechanics to their tasks.
  - Evidence: Not started.

- [ ] **T2: Extract reusable Pi role/resource/authority policy without changing native execution**
  - Depends on: T1 interfaces.
  - Parallel with: T3, T4.
  - Ownership: P:`lib/subagents/{definitions,options,guidance,launch}.ts`; proposed `execution-profile.ts`, `authority.ts`, and `resource-policy.ts` there; native child use sites; corresponding focused tests.
  - Change: factor the existing trusted role/model/effort/skill resolver, frozen prompt/authority normalization, and role resource selection for both backends. Preserve project tombstones, coordinator allowlists, Team Lead resources, Bedrock support, and scoped instructions. Keep native spawn/session/approval/pane choices native. Include typed support for the two provenance variants without enabling a T3 child by setting native markers.
  - Verify: existing definition/model/skill/launch-prompt/child-outcome tests plus targeted equivalence assertions for native launch selection and frozen authority. No behavior-only snapshot churn.
  - Done when: native policy/results are unchanged and T3 can request an explicit resolved profile from the same code.
  - Evidence: Not started.

- [ ] **T3: Persist and propagate app-owned role execution context**
  - Depends on: T1 interfaces.
  - Parallel with: T2, T4.
  - Ownership: T:`apps/server/src/mcp/OrchestratorMcpService.ts` role-resolution/launch path; `apps/server/src/orchestration-v2/{Orchestrator,ProjectionStore,WireProjection,ProviderSessionManager}.ts`; proposed `AgentExecutionProfiles.ts`; required next persistence migration and adjacent tests.
  - Change: resolve trusted named-role input through the parent runtime before committing child creation; validate driver/model/options/workspace/mode ceilings; persist the snapshot and public descriptor atomically with child creation. Hydrate it on normal reads, event replay, provider opens/restarts, retained-thread follow-ups, and historical task reads. Bind ownership to authenticated thread lineage. Keep I/O in services/effects, not the pure decision layer. Enforce role delegation authority for direct MCP launch variants as well as the facade.
  - Verify: focused orchestration/projection/migration/provider-session tests. Cover old threads, missing capability, incompatible driver, raw-delegation bypass, explicit model/effort, snapshot survival, private-data omission, and duplicate client request IDs producing one child.
  - Done when: the exact frozen profile reaches every child provider lifecycle input and cannot be widened by a model-authored request.
  - Complexity: event/projection/restart consistency. Keep transport callbacks optional until T4 supplies them; do not mock away persistence in replay tests.
  - Evidence: Not started.

- [ ] **T4: Implement the session-scoped Pi runtime control channel**
  - Depends on: T1 interfaces.
  - Parallel with: T2, T3.
  - Ownership: T:`packages/provider-pi/src/server/{adapter,rpc,mcpExtensionSource}.ts`, proposed `agentRuntime.ts`, and adjacent adapter/bridge tests. No role launch-argument construction in this task.
  - Change: implement capability handshake, registered-command detection, correlated private command responses and in-process handler dispatch. Service requests while idle or during an active tool call without a model turn. Handle responses before turn filtering/wake buffering. Advertise named-role capability only on a successful matching handler handshake. Scope teardown rejects pending requests and leaves no private widgets/messages in UI/history.
  - Verify: existing adapter/MCP bridge testkits. Cases: idle/active/late reply, unrelated envelope, wrong ID/version, absent command, cancellation/timeout/teardown, and two requests without cross-routing. An absent command must never fall through to a model prompt.
  - Done when: T3 services can discover/resolve the actual profile and perform bounded callbacks through the same Pi connection with no extra process or native endpoint.
  - Evidence: Not started.

- [ ] **T5: Launch and enforce isolated T3 role children**
  - Depends on: T2 resolver/resources, T3 durable context, T4 control transport.
  - Ownership: T:`packages/provider-pi/src/server/{mcpInjection,adapter}.ts` bootstrap path; D: proposed `pi/profiles/default/extensions/t3-subagent-runtime.ts`; shared authority consumers in P:`lib/damage-control/enforcement.ts` and `extensions/damage-control/index.js`; focused tests.
  - Change: register profile-side resolution/control handlers and bootstrap frozen role children with selected resources plus the T3 bridge. Preserve actual T3 session/resume/approval flags. Apply prompt and tool/delegate restrictions before the first model turn and on reload/resume. Preserve Explorer inspection and Bedrock child behavior. Restrict deferred/tool-search/codemode dispatch with the same normalized authority; use T3-side guards from T3 for app mutations.
  - Verify: focused Pi launch/bridge tests and deterministic real-Pi role bootstrap using the existing fixture-provider pattern. Demonstrate a permitted read, blocked undeclared write/delegation, Explorer mutation denial, coordinator's permitted delegate, forbidden nested coordinator/role, and retained restrictions after restart. Inspect actual declared tools and loaded resources, not only a prompt string.
  - Done when: a T3-owned role child really executes with native-equivalent role policy and no native child manager or unrelated operator extensions.
  - Complexity: bridge injection and role isolation currently share flags; authority must work before asynchronous Damage Control initialization.
  - Evidence: Not started.

- [ ] **T6a: Route named-role launch/control through T3 without a native manager**
  - Depends on: T3 app-owned context, T4 bridge, T5 enforced children.
  - Ownership: P:`extensions/subagents.ts`, `extensions/clear.ts`, proposed `lib/subagents/t3-backend.ts` and narrow backend interface, host helpers/tests; T:`packages/provider-pi/src/server/mcpExtensionSource.ts` facade dispatch and MCP service control wiring. Coordinate the generated bridge file with T6b, not simultaneous edits.
  - Change: select backend before native lifecycle side effects. Register T3 facades for named launch, canonical inspection, event-driven waits, active messages, retained-role follow-up/new task IDs, and current-work cancellation. Honor actual workspace/cwd and expose precise unsupported native-only controls. Prevent adapter-native duplicate cards. Preserve tool/API semantics; T6b owns the composed guidance rather than appending a second policy here.
  - Verify: backend-routing and facade tests with the real bridge boundary; wait interruption does not cancel, completion returns once, terminal follow-up gets a new task, cancellation reaches current follow-up/descendants, explicit clear cancels only owned work, reload/reconnect preserves it, wrong-owner/backend handles fail, and unsupported T3 versions do not fall back.
  - Done when: callers can use named roles in T3 without operating the native runtime, while standalone/Herdr keep their existing tools/semantics and no duplicate cards are inferred.
  - Complexity: native command/session hooks must be bypassed before initialization, including clear/reload use sites, not just launch dispatch.
  - Evidence: Not started.

- [ ] **T6b: Compose one negotiated delegation policy and update relevant MCP eval cases**
  - Depends on: T6a settled facade/control behavior and capability response; T2 shared role guidance.
  - Ownership: P:`lib/subagents/guidance.ts` and relevant prompt composition tests; T:`packages/provider-core/src/server/orchestrationInstructions.ts`, negotiated bridge guidance, toolkit descriptions, and selected `evals/mcp-tool-use` cases.
  - Change: emit one coherent role catalog/policy section for the active backend, preserving Strategist/Steward/Writer/council rules. Distinguish named roles from generic/cross-provider delegation and describe actual T3 IDs, waiting, follow-up and host-only controls. Do not reintroduce a competing native same-provider path inside T3. Keep assignment facts out of always-loaded guidance and catalogs deterministic.
  - Verify: render the complete caller/coordinator/leaf compositions and inspect them for conflicting or duplicate instructions, including dynamic catalogs. Add the named-role eval case before the text change plus an ordinary generic-delegation control. Dry-run those cases now; T11 owns the bounded baseline/new model run. Report static composition/size changes without claiming measured cache effects.
  - Done when: each audience receives one consistent executable policy matching T6a, while non-T3 guidance retains its meaning.
  - Evidence: Not started.

- [ ] **T7: Complete durable child-to-parent questions and unfinished outcomes**
  - Depends on: T1 request/report contracts, T3 durable context, T6a facades.
  - Parallel with: T8, T9, T10 on their disjoint files. Parent integrates shared service registrations.
  - Ownership: T: proposed `apps/server/src/orchestration-v2/DelegatedParentRequests.ts`, its existing event/projection/request/completion-delivery integration points; P: proposed `lib/subagents/t3-parent.ts`; parent-tool facade binding; focused tests.
  - Change: implement question creation/yield, parent notification, answer, cancel-question, ordinary discussion while pending, and structured partial/blocked reports. Ensure an ended Pi turn with an unresolved request or continuing descendants is not successful assignment completion. Preserve request/result delivery identities through restarts and acknowledgments. Keep user approvals/secret prompts separate.
  - Verify: event-driven lifecycle tests for ask/answer, discussion/cancel, stale/foreign IDs, restart while waiting, a question during a foreground wait, partial/blocked final results, coordinator descendants, and exactly-once final delivery to an idle/resumed parent. Use existing effect-worker/Deferred synchronization, no polling loops.
  - Done when: each native parent-helper outcome has an app-owned durable equivalent and results cannot be lost, duplicated, or misclassified as success.
  - Evidence: Not started.

- [ ] **T8: Bind goals and usage to the selected backend**
  - Depends on: T2 shared policy, T4 callbacks, T5 child identity/accounting, T6a backend interface.
  - Parallel with: T7, T9, T10; no edits to their new service/helper files.
  - Ownership: P:`extensions/goal.ts`, relevant `lib/goal` and Bedrock accounting use sites; proposed `lib/subagents/goal-backend.ts`; T: proposed `apps/server/src/orchestration-v2/DelegationGoalService.ts` and narrow registration points owned by the parent.
  - Change: replace hardcoded native runtime binding with native/T3 adapters. Capture and persist goal scope, register actual Pi child sessions, route admission/accounting without a second ledger, propagate pause/stop to app-owned descendants, and restore after provider restart. Preserve native clear/new-session and budget/incomplete-attribution behavior.
  - Verify: existing goal tests plus T3 cases for scoped nested membership, duplicate usage, final accounting before admission, denial before a next turn, goal pause stopping descendants, root restart/rebind, and unrelated children unaffected. No live paid budget-exhaustion experiment.
  - Done when: choosing T3 execution cannot escape existing goal budgets/accounting/stop ownership and native goal tests retain their outcomes.
  - Evidence: Not started.

- [ ] **T9: Preserve manifest-bound Integrator execution in a T3 child**
  - Depends on: T2 normalized authority, T3 workspace/snapshot ownership, T5 enforced bootstrap, T6a launch facade.
  - Parallel with: T7, T8, T10; parent integrates any shared facade registration.
  - Ownership: P:`lib/subagents/closeout-handoff.ts`, `lib/damage-control/plan-integration-authority.ts`, proposed `lib/subagents/t3-closeout.ts`, closeout tests; the exact T3 workspace adapter call needed for an existing target checkout.
  - Change: validate the existing manifest, bind runtime-issued T3 provenance to child/owner/target, and allow only the same scoped local integration operations as native policy. Launch against the recorded target checkout, not a newly created worktree. Return typed closeout outcomes to the T3 parent. Leave Herdr successor/retirement unchanged.
  - Verify: reuse the deterministic closeout provider pattern; a valid exact-target handoff works, missing/forged/wrong-target/no-merge/non-Integrator handoffs fail, authority survives resume, and native handoff checks still pass. No real merge into the operator's checkout as a test fixture.
  - Done when: T3 role execution supports the Integrator without weakening its existing scope or emulating a native endpoint/same-tab handoff.
  - Evidence: Not started.

- [ ] **T10: Present app-owned role state through existing T3 clients**
  - Depends on: T1 public descriptors and request/report shape, T3 canonical projections. Consume T7 request events once integrated; initial selectors can proceed against the established contract.
  - Parallel with: T7/T8/T9 on client-only paths.
  - Ownership: T:`packages/client-runtime/src/state/{subagentRuntime,subagentDisplay}.ts` and existing shared selectors; affected web lifecycle/lineage/relationship components; corresponding mobile consumer only where needed.
  - Change: connect real role/model/effort/workspace, waiting/question/report/result/error metadata and existing navigation/cancel/continue behavior. Pending parent requests must be actionable/inspectable using typed, permission-checked existing client operations. No new parallel card store, duplicated native inference, unbounded transcript payload, or repainting animation.
  - Verify: focused shared state/reducer/behavior tests for running, question-waiting, partial/blocked, final success/failure/cancel, nested continuation, historical reopen and one-card-per-task. Check web/desktop/mobile applicability explicitly; do not duplicate logic tests in each UI. One integrated browser pass belongs to T11, not each worker.
  - Done when: the existing UI truthfully represents and controls the actual app-owned role lifecycle across clients.
  - Evidence: Not started.

- [ ] **T11: Prove the integrated lifecycle and preserve the native path**
  - Depends on: T6a, T6b, T7, T8, T9, T10 integrated implementations.
  - Ownership: the primary agent's integration work and focused existing Pi/T3 testkits; proposed T:`apps/server/src/orchestration-v2/testkit/PiRoleDelegation.integration.test.ts` only if no existing testkit fits. Product tests use self-contained synthetic role fixtures, never imports from dotfiles. Cross-repository real-default-profile conformance belongs in a dotfiles-owned smoke entry point, proposed P:`scripts/t3-subagent-smoke.mjs`, using the existing real-Pi fixture-provider pattern and an explicit isolated T3 source/build entry path. Do not make ordinary default-profile tests require a built T3 checkout or add a standalone testing framework.
  - Change: exercise the acceptance matrix below through actual service/protocol boundaries. Build the local fork artifact before its integrated smoke. Use deterministic real Pi RPC/provider fixtures for role bootstrap/enforcement, T3 event/projection testkits for replay/delivery, and existing client tests for UI state. Fix only established task-related defects. Run relevant MCP instruction eval cases against baseline/new text on the same supported model and retain summaries outside tracked product code. Do one integrated client pass using T3's test-t3-app skill and isolated ignored `.t3` state; use Replay for generic rendering and a minimal real Pi turn only where provider behavior needs it.
  - Verify: finite commands and cases below. Capture exact default profile, source/runtime revisions, commands, results, any missing eval credentials/browser capability, and limits. Do not restart this conversation, replace the installed app, use live userdata, or claim a CLI acknowledgment proves UI/model completion.
  - Done when: agreed automated behavior/compatibility checks pass and the integrated client attempt/results are reported accurately. Unavailable operator/live testing is a non-blocking verification limit, not an invented user gate. A demonstrated task-related lifecycle defect is not waived by passing unit tests.
  - Evidence: Not started.

- [ ] **T12: Document setup, compatibility, and the runnable fork artifact**
  - Depends on: implemented interfaces from T6a/T6b/T8/T9 and integrated results from T11.
  - Ownership: D:`pi/profiles/default/docs/subagents.md`, `docs/t3-code.md`, relevant `pi/README.md`/`CHANGELOG.md` sections, `scripts/t3-code-setup.mjs` and `test/test_t3_code_setup.py` only if configuration wiring actually changes; T: relevant `docs/user/providers-pi.md`/`outside-agents.md` sections and build packaging only where required.
  - Change: replace stale claims that T3 always uses hidden native subagents. Describe named-role versus generic delegation, IDs, wait/questions/results/follow-up/cancel, host-only controls, goals/closeout, supported capability/version behavior, and how to start/verify the fork against the default profile. Document the local runnable server/web bundle produced in T11 with `vp run build:desktop:bundle`; record source SHA, artifact/start command and required matched profile. Explain that installed CLI/desktop must actually load that build; source edits/provider refresh do not update an installed server or running Pi. Preserve settings/auth/trust and existing portable setup behavior; no second default profile, copied secrets, auto-install, or live app replacement.
  - Verify: recorded T11 bundle output; `uv run pytest test/test_t3_code_setup.py` from D: if setup changes; documented commands against actual built output/help. If Windows packaging is needed for a requested install later, use the existing documented artifact pipeline, not a new installer in this task.
  - Done when: the implementation is runnable from the recorded fork build and an operator can distinguish code delivery, local verification, and a still-unperformed production install/restart.
  - Evidence: Not started.

- [ ] **T13: Archive, commit, integrate, and clean up locally**
  - Depends on: T1-T12 implemented; agreed checks passed; evidence and verification limits recorded.
  - Change: follow Closeout below. Commit/integrate the owning module first; update the parent gitlink only to that committed module revision. Archive the complete coordinating spec in dotfiles with task changes. Use the authorized Integrator from the recorded target and preserve dirty origin work. No push/PR/deployment.
  - Verify: correct module/parent commits and branches, archived spec, completion metadata, unchanged unrelated work, integration result, and clean task-worktree removal. Leave incomplete integration/cleanup unchecked with blocker, action owner and next action.
  - Done when: authorized local integration and metadata are committed and task checkout cleanup is verified. An explicit no-merge outcome is intentional retained work; a blocker does not complete unfinished integration or cleanup.
  - Evidence: Not started.

## Agreed validation and current handoff

### Acceptance matrix

Each row needs one effective behavioral test at its owning boundary, not copies at every layer. Existing tests may already cover the generic half; extend them only for the named-role delta.

| Requirement | Required evidence |
| --- | --- |
| Backend/host choice | T3 does not start native children; standalone/Herdr remain native; inherited-marker native RPC is not reclassified. |
| Role trust/settings | Profile/project override and invalid tombstone; explicit/default model/effort and skills; unavailable driver/model rejected without fallback. |
| Enforced resources | Real Pi child declared/active tools and loaded resources; forbidden write/delegate and deferred/MCP bypass denied; Explorer inspection preserved. |
| Nested delegation | Permitted leaf works; forbidden role/coordinator blocked; parent's final state accounts for continuing descendants. |
| Launch/identity | One child for duplicate launch request; task ID differs from stable child/Pi session IDs; one canonical UI entry. |
| Foreground/background | Background parent can continue; Strategist foreground result; interrupted/timed-out wait leaves child live and results deliver automatically. |
| Questions/reports | Question yields rather than completes; answer and discussion/cancel; stale/foreign ID; partial/blocked not success; permission dialogs remain distinct. |
| Completion ownership | Idle/busy/restarted owner gets one final assignment result; read acknowledges that result; unrelated thread gets none. |
| Follow-up/cancel | Same role/history retained, new terminal-follow-up task ID; cancel reaches current/queued/descendant work while old results remain readable. |
| Persistence | Restart/replay/resume retains frozen authority, request state, ownership, delivery and history; no incompatible runtime reuse; profile-less old data still decodes. Explicit clear cancels owned live work, not unrelated/history. |
| Workspace | Shared, isolated worktree, subdirectory cwd, and exact existing Integrator target actually bind to intended checkout; unsupported path fails explicitly. |
| Permissions | Runtime/interaction ceilings preserved; approval-required works; full access does not widen role/Damage Control authority. |
| Goals | Correct root/nested usage scope, idempotent attribution, admission/stop, restart rebind, no leakage to unrelated work. |
| Closeout | Valid manifest exact target succeeds; forged/missing/no-merge/wrong-role variants fail; native handoff semantics unchanged. |
| Clients/history | Shared role/progress/question/outcome state, child navigation/control, no duplicate card or private-control content, retained history after completion. |
| Delivery/runtime | Matched fork build is runnable; configuration preserves secrets/settings; installed/loaded versions and unperformed live acceptance clearly distinguished. |

### Finite checks

From D:`pi/profiles/default`:

```sh
pnpm run typecheck
pnpm test subagent goal herdr-host host-presentation damage-control/enforcement damage-control/plan-integration-authority
```

Run the T11 dotfiles-owned real-Pi/T3 smoke separately with the explicit isolated source/build entry path and record its actual invocation. Keep that opt-in cross-repository check out of ordinary profile test discovery. Include each additional directly changed test file if its name is not matched above. Pass filters directly after `pnpm test`, never after `--`. Preserve existing environment-gated native live tests; record which actually ran rather than treating skipped live coverage as exercised.

From T:, run focused tests beside changed contracts/services/projections/provider/clients during their tasks. The final integrated set must include the changed Pi adapter/bridge/injection tests, `ProviderSessionManager.test.ts`, `DelegatedCompletionDelivery.test.ts`, `SubagentProjection.test.ts`, relevant projection/migration/replay tests, the real-Pi role integration case, and changed shared-client tests. Then:

```sh
vp run check:changed
vp run build:desktop:bundle
```

Use `vp test run <exact-files>` for targeted iterations. Do not run repo-wide `vp check`, recursive tests, or recursive typecheck. `check:changed` supplies affected-package typechecking and other changed-file checks. T3 uses its own pinned Vite+/pnpm toolchain, not the default profile's package manager version. Do not add test polling, time-based retries, or per-test timeout overrides; await persisted events/Deferreds or drain the effect worker.

For changed MCP guidance, use the existing `evals/mcp-tool-use` harness with a new named-role case and an ordinary generic-delegation control. Check the cases with `--dry-run`, then compare baseline/new text with the same supported inexpensive model and three samples per selected case, following `evals/README.md`. Use existing available authentication; do not print keys or add an evaluation provider framework. Missing external credentials are a recorded limit, not permission to copy secrets or invent a passing result.

One primary-agent integrated browser attempt follows T:`.agents/skills/test-t3-app/SKILL.md`, isolated development state, and current tool availability. No production installation, operator manual approval gate, or paid multi-provider sweep is required. Report any unperformed live/browser/model eval honestly. A local bundle and test fixture do not prove the operator's installed Nightly is updated.

### Current handoff

- Status: **ready for implementation**, not implemented.
- Completed planning: source trace through request, durable thread/projection, provider startup/resume, Pi launch/injection, native authority/resources, parent messaging, goals, closeout, and shared-client state. Research is linked above.
- Next: on execution authorization, record task coordinates and preserve required uncommitted prerequisites, then start T1.
- Blockers/open operator decisions: **none for this selected implementation scope**. Deployment/publication/installed-app replacement are outside authorization, not implementation prerequisites.
- Actual validation: only the preceding presentation patch's recorded checks. No backend tests, fork build, instruction eval, child lifecycle run, or new UI acceptance has been performed during planning.

## Closeout

After implementation and the agreed agent-owned checks pass, update task evidence and mark integration pending. Confirm D:`.specs/archive/t3-native-subagents/` does not contain a different plan, then move this entire spec directory there in the task worktree and repair links. Do not archive unfinished implementation. Commit module code from its owning repository first; commit the archived spec, dotfiles changes, and updated module gitlink in the parent task branch. Do not stage unrelated changes or force-add ignored artifacts.

For authorized `/do-it`, after the task commit dispatch the Integrator from the recorded target checkout with the closeout manifest covering both owning repositories and module-before-parent order. Ordinary direct/T3 execution keeps questions and final reporting with the parent. A runtime-prepared Herdr execution uses its admitted same-tab successor: establish integration readiness, complete explicitly authorized parent-only obligations, release the exact origin for graceful retirement, then let the surviving Integrator clean up/report. Do not create another worktree or change the recorded origin. Readiness alone is not completion.

The Integrator verifies targets/archive, records actual completion date/status/evidence, commits metadata, and removes the clean task worktree. Preserve both worktrees/processes if integration is blocked before retirement; report exact retained paths and the agent-owned next action. Cleanup failure after successful integration is CLEANUP PENDING, not rollback or reason to recreate the orchestrator. Under `--no-merge`, do not dispatch a mutating Integrator: retain committed worktrees and report intentional skipped integration. Local Git needs no second approval; push/deployment/install still need explicit authorization. Operator manual/live testing never blocks archival or authorized integration.

### Execution final response

Start with the overall outcome and explicit text:

- 🟢 **COMPLETED**: checks passed, both repositories integrated as applicable, completion metadata committed, task cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed but integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential input/prerequisite prevents finishing; state the exact question and recommendation.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and committed under `--no-merge`; retained worktrees are intentional.
- 🟡 **CLEANUP PENDING**: integration/metadata committed, task cleanup incomplete.

For blocked/cleanup outcomes, immediately state **Reason** and **Action needed**, with owner and exact next action, before successes. Then give concise checks, archived spec path, module/parent commits, merge result, retained paths, and installed-runtime verification limits. Never present source delivery as an already updated operator installation.
