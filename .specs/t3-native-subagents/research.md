# T3/Pi subagent research

Checked 2026-11-09. This is implementation evidence for [plan.md](plan.md), not authorization to execute it.

## Repositories and runtime

- Dotfiles: `C:/Users/mglenn/.dotfiles`, `main`, `d128af12d161a3abe230c8a9c33838fc701d2210`; origin `git@github.com:ilude/dotfiles.git`.
- Owning T3 checkout: `modules/t3code`, `main`, `e455200077ce60806a01c8f28435b58860dcfc74`; origin `https://github.com/ilude/t3code.git`. Its worktree was clean at the final planning status check.
- Installed T3 CLI reported `0.1.8-nightly.20261108.4380`. That is not evidence that local source changes are installed.
- Verified planning profile: `C:/Users/mglenn/.dotfiles/pi/profiles/default`. Pi runtime links point to installed Pi `1.5.0`.
- This conversation's T3 configuration read reported the `pi` instance, `openai-codex/gpt-6.1-sol`, `thinking=xhigh`, full-access/default modes. These are observations, not proposed child defaults.
- `scripts/t3-code-setup.mjs` selects the default Pi profile and sets `HERDR_ENV=0` for T3. It does not install a source fork, grant project trust, move sessions, or prove child execution.
- No legacy-profile files or `.repos` reference checkout were inspected for this plan. No provider, desktop, live database, installed binary, or running conversation was changed.

## What T3 already owns

Principal sources:

- `apps/server/src/mcp/OrchestratorMcpService.ts`, especially `delegateTask`, task reads/cancellation, and thread sending.
- `apps/server/src/mcp/toolkits/orchestrator/tools.ts`.
- `packages/contracts/src/orchestratorMcp.ts`.
- `docs/orchestration-v2/orchestrator-mcp-server.md` and `docs/user/outside-agents.md`.
- `apps/server/src/orchestration-v2/{Orchestrator,ThreadManagementService,RunExecutionService}.ts`.

The paths above are relative to `modules/t3code`.

App-owned delegation already creates durable child threads/tasks, supports provider/model/options selection, checks runtime/interaction-mode ceilings, supports shared or isolated workspaces, deduplicates `clientRequestId`, delivers results, wakes the owner, and controls task cancellation. Sending to a finished child starts a new delegated task in its saved thread. The thread and each assignment's task therefore must not be represented by one interchangeable ID.

`task_cancel` stops running/queued work and descendant delegates, including later runs in that child thread; an already terminal task retains its result. A parent-run end is not necessarily overall completion when delegated work remains. Existing `DelegatedCompletionDelivery.test.ts`, `SubagentProjection.test.ts`, `ThreadManagementService.test.ts`, and replay/restart testkits are the useful behavioral extension points.

Existing `t3_pending_request` handles user questions, not permission approval. Do not repurpose it to approve a child permission request. A native Pi parent question has additional semantics: it yields, remains pending during ordinary discussion, supports explicit cancellation, and is answered by the commissioning parent. A blocking Pi `ctx.ui.input` alone does not implement that contract.

The installed host CLI's `thread` commands are `list`, `start`, `send`, and `show`. Do not invent CLI equivalents for the complete MCP lifecycle.

## The verified named-role gap

The orchestration documentation describes optional role instructions, and the public `delegate_task.role` classifies generic work such as review or research. Its implementation in `apps/server/src/mcp/delegatedTaskModes.ts:taskPrompt` prefixes task text with `Act as the ... sub-agent`.

That is not the default profile's named-role contract:

1. `packages/contracts/src/orchestrationV2.ts` defines `delegated_task.request` with task/title/model selection/modes/workspace inputs, but no frozen Pi execution profile.
2. `Orchestrator.ts` makes the app-owned child thread and dispatches the assignment as child message text. There is no demonstrated role-authority transfer there.
3. `OrchestrationV2AppThread` has identity, model, modes, workspace, lineage, and history fields, but no observed named-role snapshot.
4. `ProjectionStore.ts` handles `thread.created`, reconstructs thread projections, and writes `orchestration_v2_projection_threads`. `WireProjection.ts` is the boundary for public thread data. Durable role data must survive both event replay and projection reads, not just exist in a tool result.
5. `ProviderSessionManager.ts`, around line 2205, passes thread/session IDs, model selection, runtime policy, and resume identifiers into `adapter.openSession`. No execution-profile input is present.
6. `packages/provider-core/src/server/ProviderAdapter.ts` defines the corresponding open/ensure/turn interfaces. A role-aware launch needs explicit typed propagation through these interfaces and restarts.
7. `packages/provider-pi/src/server/adapter.ts` starts/resumes Pi RPC processes. `mcpInjection.ts` constructs arguments/environment and the generated `mcpExtensionSource.ts` registers MCP tools and blocks disallowed T3-runtime tool calls. None of those inspected paths supplies the workstation's named Pi role authority today.

A prompt-only wrapper around `delegate_task` would therefore retain a broad profile's tools/extensions and lose the native role's enforcement. It would not meet the request.

## Reusable Pi role policy

Sources relative to dotfiles:

- `pi/profiles/default/agents/*.md`.
- `pi/profiles/default/lib/subagents/{definitions,options,guidance,launch,runtime,rpc}.ts`.
- `pi/profiles/default/extensions/{subagents,subagent-child,goal}.ts`.
- `pi/profiles/default/lib/damage-control/{enforcement,plan-integration-authority}.ts` and `extensions/damage-control/index.js`.

Verified behavior:

- Definitions contain name, description, allowed tools/delegates, model, effort, skills, prompt, and source/file identity. Trusted project overrides replace profile definitions. Invalid project overrides tombstone a matching profile name rather than falling back to its broader profile definition.
- Explicit model/effort requests override role defaults. Effort otherwise falls back to `low`; Luna-specific Strategist/Steward restrictions are already implemented. Aliases resolve through Pi's actual model registry.
- Requested skills add to role defaults. Trusted project skills can override profile skills. Invalid/missing skills fail; paths are not arbitrary model-supplied extension paths.
- Native children isolate discovery using `--no-extensions`, role-dependent skill flags, `--no-prompt-templates`, and `--no-themes`, then load selected resources explicitly. Team Lead receives its existing codemode/skill treatment. Bedrock children load provider/accounting support without operator commands.
- Native `subagent-child.ts` freezes tool/delegate authority, applies `setActiveTools`, and independently blocks unauthorized `tool_call` events. Catalog visibility is not dispatch authority.
- `subagent_parent` distinguishes `question`, `cancel-question`, `partial`, and `blocked`. Successful completion is a normal final reply. A question returns an ID and terminates/yields that turn rather than waiting in a polling loop.
- Native Integrator launches require a validated closeout manifest and runtime provenance. Damage Control's scoped integration authorization independently checks that provenance and checkout identity.
- Explorer's nonmutating inspection policy currently detects the role from `PI_SUBAGENT_AUTHORITY`, including an early check in `extensions/damage-control/index.js`. A new T3 authority representation must preserve those checks rather than merely copying the role prompt.
- `goal.ts` directly binds to `getSubagentRuntime`/`GoalBinding`; native children relay admission/accounting through the native parent endpoint. App-owned children would otherwise escape goal descendant accounting and stop propagation.

Current role defaults, for orientation only; execution must read the role files rather than duplicate this table in code:

| Role | Model alias | Effort | Delegation |
| --- | --- | --- | --- |
| developer | luna | medium | none |
| explorer, researcher, validator | luna | low | none |
| steward | luna | high | none |
| integrator | luna | high | none; manifest required |
| reviewer, advisor, strategist, writer | sol | low | none |
| teamlead | astra | low | its declared leaf-role allowlist |
| council | astra | low | its declared non-writing allowlist; explicit user request only |

No claim is made that these tool restrictions constitute an operating-system sandbox. Preserve the actual native tool policy and shell checks, including Explorer's special inspection behavior.

## Host and launch traps

- `lib/herdr-host.ts:resolvePiClient` intentionally treats `PI_SUBAGENT_AUTHORITY` children as generic RPC even if they inherit T3 markers. Reusing that marker unchanged would misclassify a real T3-owned role child. Use distinct transport identity and shared normalized authority policy.
- `extensions/subagents.ts` currently initializes/binds the native runtime on `session_start`, delivers custom-message results, and shuts down native children on native lifecycle transitions. Selecting a T3 backend must happen before those side effects, not only inside the launch tool.
- `mcpInjection.ts:buildPiRpcLaunch` currently couples `disableExtensions` with omission of the injected T3 extension. Setting that existing flag for a role child would also remove T3's own bridge. Role resource isolation must retain the trusted T3 bridge while excluding unrelated profile extensions.
- Native launch arguments include native-process/session/approval details. Share resource/role policy, not the native subprocess argv wholesale; T3 owns session paths and permission mapping.
- `adapter.ts` routes extension UI events differently with and without an active turn. Private role-control replies must be handled at session scope, before turn filtering or wake buffering.
- Installed Pi `1.5.0` source confirms extension commands execute before normal streaming/compaction/model prompt handling. RPC `prompt` acknowledges a handled command through preflight. A private registered command can service a bounded control request without starting an LLM turn, even while an ordinary tool call waits on T3. First check `get_commands`: an unknown slash command can otherwise fall through into a model prompt.
- Correlate a private response with request ID and protocol version. Never treat absence of a widget/status as completion, and never put full policy or credentials into visible chat.

## UI and upstream patches

Existing app-owned threads already feed shared `packages/client-runtime/src/state/subagentRuntime.ts`, `subagentDisplay.ts`, and web lineage/lifecycle/relationship components. Reuse that lifecycle. Extend only missing role/outcome/question metadata and existing controls; do not maintain a parallel card store.

Public upstream evidence checked earlier in this planning conversation on 2026-11-09:

| Item | Status when checked | Relevance and limitation |
| --- | --- | --- |
| [#17363](https://github.com/pingdotgg/t3code/issues/17363) | issue | Exact asynchronous Pi-card symptom. |
| [#32079](https://github.com/pingdotgg/t3code/pull/32079), head `9544d42c0f58e6ddb9d2bdc6c201f9b18fc549d5` | open, unmerged | Widget snapshots for community `pi-subagents`; can infer completion from disappearance, has null-result/hierarchy limitations. Not this role backend. |
| [#23786](https://github.com/pingdotgg/t3code/pull/23786), head `87b5fa6ec0d9fb67bfc6e38ca8cdddac078e9fb9` | open, unmerged | Useful session-owned late-event/result ingestion and continuing-child-turn ideas. Still assumes community async IDs/messages. Not a drop-in patch. |
| [#32458](https://github.com/pingdotgg/t3code/pull/32458) | open, unmerged | Rendering `display:true` custom messages could duplicate existing command fallbacks or expose expanded prompts. Do not make this a dependency. |

Claude's `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` consumes actual task-start/progress/notification events keyed by task ID. It is a useful lifecycle reference, not authority to fabricate Pi task events from launch-tool completion.

No PR branch was installed, merged, or live-tested. Recheck current upstream status only if implementation intends to reuse code; it is not an implementation prerequisite.

## Evidence limits and validation route

- The preceding presentation work passed 159 tests across 13 focused files plus default-profile typecheck. Those results do not validate the proposed backend.
- Planning inspected the installed Pi RPC command implementation and current T3 source/configuration. It did not launch a T3 role child, exercise questions/cancellation/restarts, or perform live visual acceptance.
- Existing native `tests/fixtures/plan-closeout-provider.ts` provides a deterministic real-Pi provider pattern. Prefer that pattern and existing T3 provider/service testkits over a new test framework or paid-model-only acceptance.
- T3's module instructions require focused behavior tests, event/effect synchronization rather than polling, changed-file checks, relevant MCP evals when model-facing instructions change, and one integrated client pass for visible changes. Use `.agents/skills/test-t3-app/SKILL.md` and isolated ignored `.t3` state. Never run a source server against live `~/.t3/userdata`.
- `docs/t3-code.md` documents source builds and separate CLI/desktop artifacts. A bundle build is not installation, a packaged artifact is not GUI acceptance, and refreshing a provider does not update an already loaded Pi process.
