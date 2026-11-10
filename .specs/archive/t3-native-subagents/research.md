# Evidence for Pi-backed subagents on unchanged T3

Checked 2026-11-09. Supports [plan.md](plan.md). Source inspection and read-only runtime discovery are not a completed child-lifecycle test.

## Scope of the corrected design

T3 is an integration dependency, not an implementation target. The earlier inference that Pi role data must be added to T3 contracts/persistence was not established by the evidence. A missing native role field does not prevent Pi extensions from binding and enforcing a role before their model turn.

No T3 source, generated extension, installed binary, live settings/database, or running conversation was modified. The module remains a read-only reference. No legacy-profile files or `.repos` reference checkout were inspected.

## Verified checkout and runtime

- Dotfiles: `C:/Users/mglenn/.dotfiles`, `main`, HEAD `723e4ef979b41180c43106f21983e3907c7b26e9` at this revision's check. Earlier research used `d128af12d161a3abe230c8a9c33838fc701d2210`; do not confuse those baselines.
- T3 reference: `modules/t3code`, `main`, `e455200077ce60806a01c8f28435b58860dcfc74`, clean. It is not the code revision of the installed Nightly.
- Actual planning Pi profile: `C:/Users/mglenn/.dotfiles/pi/profiles/default`, installed Pi `1.5.0`.
- The current Pi process reports `T3_PI_MCP_EXTENSION_PATH=C:/Users/mglenn/.t3/caches/pi-t3-mcp-extension.ts`. Its generated source was inspected read-only; it registers both qualified T3 tool-name variants and owns its HTTP credentials.
- Bare PowerShell `t3` resolves to `C:/Users/mglenn/.local/bin/t3.cmd`, version **0.1.7**.
- The desktop launcher uses `C:/Users/mglenn/.t3/bin/t3.cmd` through `T3CODE_CLI_PATH`, version **0.1.8-nightly.20261108.4380**. Both `serve --help` outputs support `--base-dir`, `--host`, `--port`, and `--no-browser`. Use the desktop-selected version for affected-runtime verification, not the older bare command.
- The current tool registry exposes delegation, status, thread-send, and pending-request tools. A read-only `orchestrator_capabilities` call confirms app-owned subagents, cancellation, thread management, and an enabled `pi` instance. Pi's model options include `thinking`; the active parent uses full-access/default modes. This proves discovery, not successful named-role execution.

## Existing T3 APIs and behavior

Paths in this section are relative to `modules/t3code`.

### Delegation

`packages/contracts/src/orchestratorMcp.ts:OrchestratorMcpDelegateTaskInput` accepts task text, provider/model/options, title, generic role category, shared/worktree isolation, wait/async mode, timeout, request identity, and permission/interaction modes. It does not accept arbitrary child environment variables, a Pi role snapshot, cwd, or an existing-worktree strategy.

`apps/server/src/mcp/OrchestratorMcpService.ts:delegateTask`:

- Requires an active caller-owned parent run.
- Resolves the target and mode ceilings.
- Rejects a different local project through `target.projectId`.
- Maps worktree isolation to a new checkout based on the parent's HEAD.
- Creates app-owned task/thread/run state and dispatches the task text.
- Uses different completion-wake policies for async and blocking calls; an incomplete wait upgrades delivery to a later automatic wake.

`apps/server/src/mcp/delegatedTaskModes.ts:taskPrompt` preserves `task` exactly when generic `role` is absent or `general`. Other categories prepend `Act as the ... sub-agent`, which would prevent a leading private Pi slash command from being dispatched. Therefore the proposed wrapper must omit that field or use `general`, putting the named role in its title and Pi-owned metadata instead.

The unchanged APIs already provide IDs, ownership, results, notifications, workspace creation, and cancellation. No new T3 lifecycle database or UI protocol is needed for those capabilities.

### Questions

- `packages/provider-pi/src/server/adapter.ts:handleExtensionUiRequest` maps Pi `ctx.ui.input/select/editor` to a T3 `user_input` request; `confirm` is a permission request instead.
- `apps/server/src/orchestration-v2/DelegatedTaskQuestionReactor.ts` already notifies the commissioning parent about pending child questions. Blocking delegate waits return the question themselves; the reactor handles asynchronous/catch-up notification.
- `apps/server/src/mcp/toolkits/thread/tools.ts:PendingRequestTool` provides `list`, `read`, and `respond` through `t3_pending_request`. It cannot approve permissions and has no question-cancellation action.
- Task results expose `hasPendingQuestion`, `pendingApproval`, and whether child work continues.

Use this existing blocking question model. The native Pi helper's yield-and-discuss/cancel-question behavior is not an existing T3 guarantee. Do not invent new server request kinds or claim that a blocking dialog implements the native protocol unchanged.

Pending Pi UI requests use a live provider-session response capability. After process loss, a persisted question intent may need to be re-presented with a new runtime request ID. Do not promise that the old JavaScript promise/request remains answerable after restart.

### Follow-ups, cancellation, and UI

`t3_thread_send` supports auto/queue/steer/restart, and sending to a completed owned child can create a fresh task in its saved thread. Return the new task ID rather than reusing an old terminal task as the current assignment.

`OrchestratorMcpService.ts:cancelTask` checks child/descendant mode ceilings, stops the child thread and delegated descendants, disposes completion delivery, and removes the relevant queued turns. Preserve its refusal behavior when a user has raised a child's modes.

`packages/provider-pi/src/server/adapter.ts`, around lines 1254-1276, specifically infers provider-native child cards when a tool is named **`subagent`**. A distinctly named profile wrapper avoids that heuristic. The actual nested `delegate_task` call creates the canonical app-owned card through existing orchestration.

Role labels can use existing titles; resolved model, worktree, activity, waiting state, results, and child links already have T3-owned representations. There is no basis to promise new role badges, custom outcome enums, or new controls without changing T3. A T3 task finishing is distinct from the role reporting that its substantive work is blocked or partial.

## Supported Pi extension seams

Evidence is from the installed Pi `1.5.0` package, not a proposed SDK API.

### Composed calls

`docs/extensions.md`, “Calling Other Tools,” around line 2772:

- A registered tool's execution context exposes `ctx.executeTool(name, args, { signal, onUpdate })` and `ctx.tools`.
- Nested calls undergo normal validation, `tool_call` and `tool_result` hooks, and execution events carrying `parentToolCallId`.
- Failures return `isError: true`; they do not necessarily reject the promise.
- `reachesTools` and `prepareLoadout` support orchestrating tools and hiding internal declarations without pretending tools are unavailable.

The repository already uses this API in `pi/profiles/default/lib/subagents/successor-surface.ts:109-115`.

Therefore model-requested launch/control tools should compose the actual callable injected T3 tools. A second general-purpose MCP client for delegation is unnecessary. Resolve the callable name/source from the current runtime; do not hardcode a model-facing alias or call an unregistered replacement.

### Role binding before the model request

Installed `dist/core/agent-session.js:prompt` checks registered extension commands before the input hook, skill/template expansion, authentication checks, or starting a model run. `_tryExecuteExtensionCommand` handles the command and does not fall through to a model prompt if its registered handler fails. An unknown command can fall through, so matching profile installation/resource loading is a real assumption, not an automatic guarantee.

A profile command such as `/t3-role-bootstrap <launch-id>` can:

1. Resolve independently validated Pi-owned handoff metadata.
2. Bind the role to the actual T3 thread and Pi session.
3. Persist the snapshot with `pi.appendEntry()` and establish extension-owned state.
4. Start the actual assignment with `pi.sendUserMessage(actualAssignment)`.

The command itself does not receive `before_agent_start` prompt options. The ensuing run does. `docs/extensions.md:before_agent_start` documents mutable `systemPromptOptions`, including selected tools, custom sections, skills, cwd/context files, and prompt guidelines. `pi.setActiveTools()` there also changes executable provider tools. Apply the saved role before that request, and independently block unauthorized tool calls.

`sendUserMessage()` defaults to no command/template expansion. A brief beginning with a slash is therefore not accidentally executed as another command. Streaming calls require an explicit steer/followUp mode; the first role bootstrap is intended for a fresh app-owned child, while retained-child messages use normal T3 send semantics.

`appendEntry()` is durable extension-local session data and is not model context. Restore from the current session branch, not a global variable or unrelated historical branch. Profile-local thread-to-role bindings can additionally prevent a T3 fresh-context reset from silently becoming an unrestricted Pi session.

### Identity outside a tool call

`executeTool` belongs to a tool execution context, not the ordinary command/session-start context. Role restoration/command validation may need current T3 identity before any model-issued tool exists.

The generated T3 extension demonstrates the standard HTTP MCP initialize/session/version-header exchange using `T3_MCP_URL` and `T3_MCP_BEARER_TOKEN`. A small profile-owned metadata reader can use that existing authenticated public endpoint for capabilities/current thread/lineage. It must not modify the generated extension, scrape databases, print credentials, or persist them. Model-requested mutations still use composed tools and their normal hooks. Existing goal stop callbacks may use a narrowly scoped owned-task cancellation operation outside a model tool call.

Despite its name, `orchestrator_capabilities.parentThreadId` identifies the calling thread as a potential delegation parent; it is not that thread's lineage parent. Read `t3_thread_read.thread.parentThreadId` for the latter. Confusing them would break bootstrap ownership validation.

This is a limited transport need, not permission to build a second delegation framework.

## Existing policy to preserve

Dotfiles sources:

- `pi/profiles/default/agents/*.md` and `lib/subagents/{definitions,options,guidance,launch}.ts`.
- `extensions/{subagents,subagent-child,goal}.ts`.
- `lib/damage-control/{enforcement,plan-integration-authority}.ts` and `extensions/damage-control/index.js`.
- `lib/subagents/transport.ts`, `lib/goal/{runtime,state,usage,budget}.ts`.

Verified policy:

- Trusted project roles override profile roles; invalid overrides tombstone the matching role.
- Models resolve through Pi's actual registry; explicit settings override role defaults. Existing Strategist/Steward effort constraints apply.
- Skills retain role defaults, requested additions, trust, and project-source precedence.
- Role tool/delegate authority is frozen and independently checked at dispatch, including deferred/nested calls. This is not an OS sandbox.
- Team Lead/council dispatch policy, writer/reviewer/steward guidance, and native foreground/background rules already exist.
- Native process isolation flags are owned by native launch. Unchanged T3 cannot be assumed to accept per-task copies of those flags. T3 role enforcement must be done through supported profile hooks without claiming identical extension-discovery isolation.
- Explorer inspection and Integrator authority currently inspect native environment authority. They need a shared normalized Pi-side authority accessor, not a forged native marker for T3 children.
- `goal.ts` directly initializes the native runtime and binds existing admission/enrollment/accounting callbacks to it. Factor a backend boundary; do not lose goals or start a native process manager in T3. Existing authenticated `ChildTransport` can carry those policy callbacks without owning T3 task lifecycle. Keep budget state and usage ledgers with the existing goal implementation.
- Native Integrator requires a validated manifest/exact checkout. With unchanged delegation APIs, a T3 Integrator can inherit that checkout only when its commissioning T3 thread is already bound there. Shell `cd` is not a T3 workspace switch.

The proposed metadata directory `pi/profiles/default/sessions/.t3-roles/` is already ignored by the profile's `/sessions/` rule, verified with `git check-ignore`. Store authority/identity bindings there, not a duplicate task-status/result database. Session JSONL remains the role snapshot/history source; T3 remains the execution/lifecycle source.

## Upstream research retained as context

Earlier on 2026-11-09, #17363 described asynchronous Pi card problems; PRs [#32079](https://github.com/pingdotgg/t3code/pull/32079), [#23786](https://github.com/pingdotgg/t3code/pull/23786), and [#32458](https://github.com/pingdotgg/t3code/pull/32458) were checked open/unmerged. Their widget/custom-message protocols were not drop-in matches for this profile. No branch was installed or live-tested. None is a dependency of the unchanged-T3 design; no new upstream-status claim is made here.

## What remains untested

No revised backend code was implemented during planning. No new child/model run, private bootstrap, question/answer round trip, goal callback, cancellation, restart, fresh-context restoration, or rendered UI acceptance was performed. The former presentation patch's 159 focused tests/typecheck are not evidence for this design.

The source supports the selected mechanisms. Their integration must be demonstrated by the plan's finite Pi/default-profile tests and one isolated smoke using the **existing desktop-selected Nightly**, with a deterministic provider where possible. No T3 build, module test suite, custom installer, or production replacement is required.
