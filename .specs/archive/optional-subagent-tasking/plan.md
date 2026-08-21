---
created: 2026-08-20
revised: 2026-08-20
status: complete
completed: 2026-08-21
source_sessions:
  - 01a02022-26fe-7473-a367-9355b8c255b9
  - 01a0208f-7100-71d4-94d3-06254fa395de
---

# Plan: Keep Subagents Flexible and Tasking Optional

## Objective

Preserve Pi's lightweight direct subagent workflow while making multi-team delegation reliable. The conversational root remains the program orchestrator. It may start direct leaves or one package-scoped team lead per independent work package. Tasks remain optional durable coordination owned by the root.

The implementation must fix coordinator/leaf deadlocks, deliver independent team results promptly, provide exact operator controls and accurate status, preserve explicit routing choices, and work within the Claude/Fable capability boundary without forcing durable orchestration onto ordinary calls.

## Required behavior

### Root and team roles

- The conversational root owns program decomposition, dependencies, task transitions, validation, integration, follow-up decisions, and the final response.
- A team lead is optional and owns one independently verifiable work package.
- A team lead may delegate bounded leaves. It never becomes the umbrella orchestrator for the complete program.
- Direct leaves remain available without a team lead.
- `orchestrator` remains a compatibility alias for the delegated `teamlead` profile. Existing calls must not fail only because the profile was renamed.
- Role, background mode, model, and effort come from explicit invocation arguments and ordinary defaults. Naming an agent must not silently activate a durable workflow.

### Tasks

- `task` remains the only durable obligation store.
- Tasks work without subagents, and subagents work without tasks.
- `taskId` is optional correlation. A subagent call does not create or transition a task.
- The root explicitly creates, starts, validates, completes, fails, cancels, or extends tasks.
- Follow-on work uses the existing task dependency model. It does not require a second task registry, package mailbox, actor inbox, or orchestration DAG.
- Compaction carries task and run references only when they already exist. Direct task-free delegation requires no durable reconstruction.

### Execution and capacity

- The existing cross-process tree broker is the shared execution authority for admission, the global descendant ceiling, process parentage, scope leases, and cancellation.
- The run manager remains the transcript and status projection.
- A coordinator waiting for leaves must not consume capacity needed by those leaves.
- Yielding coordinator capacity is runtime bookkeeping only. It does not create durable joins, continuation records, assignment attempts, or fresh model invocations.
- Waiting coordinators may continue requesting their own leaves. They resume ordinary active accounting after their direct children settle.
- Cancellation and cleanup remain independent of admission capacity.

### Completion and follow-up

- Foreground calls return normally.
- A direct background invocation emits one bounded completion.
- Independently started team leads report independently. One completed team must not wait for unrelated siblings.
- Completion is push-based. The root should not poll status repeatedly.
- On each team completion, the root may validate its result, transition its linked task, create follow-on tasks, and start newly ready work while other teams continue.
- Ordinary completion does not require a persistent result store, delivery revisions, acknowledgement state, or transactional outbox.

### Control and status

- `/subagents` defaults to the current session and shows complete copyable run, tree, orchestration, task, and parent IDs when available.
- The operator can gracefully cancel an exact run or tree and explicitly force-terminate an exact live process boundary.
- The root can reconcile an exact terminal run or demonstrably absent process boundary when stale broker accounting remains. Reconciliation releases that boundary's capacity and scope leases and returns the affected IDs and released resources.
- Reconciliation must reject live processes, ambiguous liveness, prefixes, unknown IDs, and boundaries with live descendants. It must not infer process absence from a quiet transcript or elapsed time.
- Prefixes and ambiguous selectors are rejected.
- Cancelling or reconciling one boundary preserves unrelated siblings.
- A small root-only `subagent_control` tool may expose `cancel`, `force_terminate`, and `reconcile` for non-TUI and restricted Claude roots. It must operate on the live broker rather than a second dispatcher.
- The footer updates when runs start or settle. It must not require a later dispatch to repair stale counts.
- Footer order remains Onclave, subagents, tasks, then throughput.
- Do not invent acknowledgement state from unrelated interactive input.

### Routing and providers

- Explicit per-child model and effort override invocation defaults, agent frontmatter, and recommendations.
- Explicit invocation model and effort override ordinary defaults.
- Valid explicit choices execute without advisory mismatch warnings or confirmation.
- Team leads normally use Sol low; Luna low through high remains available for workers and explicit alternatives.
- Avoid Terra in maintained defaults, but do not add a hidden runtime prohibition.
- Max effort requires explicit operator permission.
- Claude Fable and Opus roots remain the selected root orchestrator. They may use permitted GPT subscription leaves and workflows.
- When the selected Claude root is authoring a plan, goal, or architecture artifact, it performs the synthesis and writing itself. Delegated leaves may investigate and validate.
- Provider restrictions remain a capability policy. They do not change the lifecycle of ordinary non-restricted subagent calls.

## Non-goals

Do not add or retain any of the following without a separate concrete requirement:

- A second orchestration task registry
- Durable package phases or acceptance state
- Assignment-attempt identities for ordinary delegation
- Persistent joins or fresh teamlead continuation invocations
- Package mailboxes, actor inboxes, poison queues, or transactional outboxes
- Persistent result acknowledgement or replay for ordinary completions
- Automatic reconciliation, lease expiry, or timeout-based cleanup of ambiguous live boundaries
- A second dispatcher or process lifecycle authority
- Name-based forced coordinator, background, model, or effort selection
- Mandatory task creation for subagent calls
- Plan archival or workflow-state ceremony as a runtime requirement

## Design constraints

Use patterns to keep responsibilities clear, not to create a framework.

### Ownership and SOLID boundaries

- **Single responsibility:** the tree broker owns admission, capacity, parentage, scope leases, and tree cancellation; the run manager owns transcripts and observable projection; the existing task registry owns durable tasks; the subagent entrypoint owns invocation validation and child execution.
- **Open/closed:** add variation only at existing boundaries. Capacity accounting and process signalling may use small strategy interfaces when tests or platforms genuinely vary. Do not add extension points for hypothetical schedulers, stores, or transports.
- **Liskov substitution:** the `orchestrator` compatibility alias resolves to the same agent profile as `teamlead` and must not alter role, background, model, or effort behavior.
- **Interface segregation:** live control exposes only exact cancel and force-terminate operations. TUI and model-facing adapters do not depend on inbox, acknowledgement, task mutation, or result persistence.
- **Dependency inversion:** isolate the operating-system process signal boundary where Windows and Unix behavior differ. Keep in-process broker and run-manager calls direct rather than injecting every collaborator.

### Bounded GoF pattern use

| Pattern | Approved use | Explicit limit |
| --- | --- | --- |
| State | Broker node lifecycle: queued, active, waiting, settled, cancelled | One authoritative lifecycle; no parallel dispatcher state |
| Strategy | Capacity-counting/admission policy and platform process termination | Use pure functions or narrow interfaces only where behavior varies |
| Observer | Broker/run-manager events driving completion, footer, and dashboard updates | Observers project state; they never become lifecycle authorities |
| Command | Validated exact cancel, force-terminate, and safe reconcile requests | Three operations only; no command bus or persisted command log |
| Adapter | TUI and root tool adapters over the same live control service | No separate control semantics per surface |
| Facade | A small live control service over broker and process signalling | No inbox, acknowledgement, task, mailbox, or result-store facade |

Do not introduce Abstract Factory, Builder, Composite task graphs, Mediator, Memento, Repository, actor mailboxes, event sourcing, transactional outboxes, or additional persistence. Existing code remains direct unless a required behavior varies at a real process, platform, provider, or UI boundary.

### Churn controls

- Port and validate one vertical behavior at a time against the live entrypoint.
- Preserve unrelated working-tree changes and separately motivated model-default changes.
- Do not combine runtime lifecycle changes, broad routing migrations, and documentation cleanup in one implementation step.
- Do not delete a duplicate-stack test until its useful scenario passes against the live broker or is explicitly classified as outside scope.
- Do not run another architecture review after this plan is accepted unless a stated invariant fails or the live boundary disproves the design.
- Stop after the canary and required validation pass. Do not add durability, diagnostics, configuration, or abstractions for unobserved failures.

## Salvage map

Port behavior and test intent, not the duplicate classes or schemas.

| Duplicate-stack behavior | Disposition | Live destination |
| --- | --- | --- |
| Coordinator suspension releases capacity | Port as non-durable broker waiting/yield state | `tree-runtime.ts` |
| Leaves receive admission before new coordinators when constrained | Port the smallest deterministic queue selection rule | `tree-runtime.ts` |
| Capacity-one and eight-team saturation scenarios | Port tests before deleting dispatcher tests | `subagent-tree-runtime.test.ts` and entrypoint tests |
| Exact run/tree selectors and sibling preservation | Port | live control service over tree broker |
| Explicit force termination | Port | existing process-tree signal boundary |
| Cleanup precedes terminal projection | Port ordering invariant | `index.ts`, tree broker, run manager tests |
| Scope release after cancellation or failure | Preserve and extend live coverage | tree broker tests |
| Independent team completion | Port without persistence | existing background completion path |
| Cancellation and cleanup evidence | Keep only bounded returned evidence needed by operator output | live control result |
| Durable joins and continuations | Remove | none |
| Orchestration task registry and assignment attempts | Remove | existing `TaskRegistry` remains authoritative |
| Mailboxes, envelopes, outbox relay, and topology revisions | Remove | existing task dependencies and direct events |
| Persistent result delivery and acknowledgement | Remove | existing one-shot background completion |
| Dispatcher liveness, orphan, starvation, and fault machinery | Remove unless a current live regression independently requires one item | none |
| Dispatcher snapshots and second lifecycle map | Remove | run manager remains projection of live broker activity |

## Work

- [x] **T1: Lock the live contract and port salvage tests**
- [x] **T2: Make the live broker deadlock-safe and independently deliver team results**
- [x] **T3: Add exact live controls and accurate status**
- [x] **T4: Simplify routing, compatibility, and provider policy**
- [x] **T5: Delete duplicate authorities and finish the cutover**

### T1: Lock the live contract and port salvage tests

Before deleting duplicate code:

- Add or adapt live-path tests for direct task-free calls, optional `taskId` correlation, foreground/background behavior, and explicit role/model/effort precedence.
- Port capacity-one, saturation, sibling-preserving cancellation, cleanup ordering, and scope-release scenarios from duplicate-stack tests to the existing broker and entrypoint tests.
- Classify every remaining duplicate-stack test as `ported` or `outside scope` in the final deletion diff; do not create a separate tracking artifact.
- Remove stale mandatory durable-orchestration wording that would make the tests enforce the wrong contract.

Done when:

- The live tests fail for the known deadlock/control gaps but preserve current direct delegation and task behavior.
- Every useful duplicate test scenario has a named live destination.
- No production behavior has changed yet.

### T2: Make the live broker deadlock-safe and independently deliver team results

Adapt the existing tree broker rather than adding another dispatcher:

- Add one authoritative `waiting` state to the broker node lifecycle.
- When a coordinator requests children, yield its capacity accounting without releasing its identity, parentage, cancellation authority, or required scope ownership.
- Permit a waiting coordinator to request additional direct children.
- Restore active accounting only after its direct children settle and capacity is available.
- Select queued leaves before new coordinators when capacity is constrained. Preserve deterministic order within the same class.
- Keep cancellation and cleanup independent of admission capacity.
- Complete broker cleanup before the run manager projects terminal state.
- Deliver independently started background team results independently, without a durable result store.
- Keep each direct background invocation one-shot and bounded.

Done when:

- A capacity-one coordinator can run a leaf and finish.
- Eight packages cannot deadlock by filling every slot with waiting coordinators.
- Multiple leaves from one waiting coordinator run within the shared ceiling.
- One team completion is delivered while unrelated teams remain active.
- Cancellation during queued, active, and waiting states leaves no permit or scope lease.
- Direct task-free calls create no durable orchestration state.

### T3: Add exact live controls and accurate status

Use one small control facade over the existing broker and process signal boundary:

- Define exact cancel, force-terminate, and safe reconcile commands with validated run or tree selectors.
- Reconcile only a terminal run or a process boundary whose registered PID is demonstrably absent, and only when it has no live descendants. Release stale broker capacity and scope leases atomically with terminal broker projection.
- Make the facade return the selected IDs, final state, and bounded cleanup, stop, or released-resource evidence.
- Wire the same facade into `/subagents` and, if required by the Fable boundary, a root-only `subagent_control` tool containing only `cancel`, `force_terminate`, and `reconcile`.
- Default `/subagents` to the current session; retain an explicit all-sessions view.
- Show complete identifiers and parentage.
- Drive footer and dashboard recomputation through existing broker/run-manager observer events.
- Preserve Onclave, subagents, tasks, throughput ordering.

Done when:

- Exact run cancellation preserves siblings.
- Tree cancellation reaches queued, active, and waiting descendants.
- Force termination reports whether the process stopped.
- Reconciliation releases a stale permit and scope lease after the registered process is proven absent, allowing an overlapping replacement to start.
- Reconciliation rejects a live process, ambiguous liveness, and any boundary with live descendants without releasing capacity or leases.
- Prefix and ambiguous selectors fail before mutation.
- TUI and non-TUI adapters target the same facade and live authority.
- Footer and dashboard agree immediately after settlement and cancellation.

### T4: Simplify routing, compatibility, and provider policy

Keep this step separate from lifecycle changes:

- Remove advisory mismatch rendering and telemetry that has no active decision consumer.
- Remove forced coordinator model, effort, background, and role selection based solely on the profile name.
- Keep explicit selection precedence and max-effort approval.
- Preserve maintained Luna or Sol agent defaults as configuration, not runtime gates.
- Resolve `orchestrator` as a compatibility alias for `teamlead` through one catalog/lookup adapter.
- Keep Claude root-authorship and allowed-tool restrictions separate from ordinary routing.
- Remove `subagent_control` from Fable capability declarations if T3 determines a non-TUI tool is unnecessary; otherwise expose only the implemented lightweight actions.

Done when:

- Explicit parent model and effort execute unchanged and without advisory UI.
- Omitted choices use agent frontmatter or ordinary invocation defaults.
- Both delegated profile names resolve to the same profile without changing invocation semantics.
- Direct calls remain foreground unless `background: true` is supplied.
- Restricted Claude roots perform permitted delegation while writing their own plan artifacts.

### T5: Delete duplicate authorities and finish the cutover

Only after T1 through T4 pass:

- Delete `pi/extensions/subagent/dispatcher.ts`.
- Delete `pi/extensions/subagent/control.ts` after the lightweight live control facade has a distinct name/path, or replace it in place if that produces the smaller diff.
- Delete `pi/extensions/subagent/result-store.ts`.
- Delete `pi/lib/orchestration-task-registry.ts`.
- Delete their isolated tests after the salvage classification is satisfied.
- Remove duplicate mailbox artifacts if any remain.
- Remove stale capability, prompt, instruction, and documentation claims for deleted behavior.
- Confirm no production or test import references a deleted authority.

Done when:

- The tree broker is the only admission, capacity, process-tree, scope, and cancellation authority.
- The existing task registry is the only durable task authority.
- The run manager is the only transcript and status projection.
- Direct subagent, task, Fable, typecheck, full-suite, canary, and diff checks pass.
- `taskId` remains optional correlation and disposable delegation remains task-free.

## Canary matrix

| Scenario | Expected result |
| --- | --- |
| Direct foreground leaf without task | Returns normally; no durable task or orchestration record is created |
| Direct background leaf without task | Returns an ID and emits one bounded completion |
| Parallel direct leaves | Share the broker ceiling and all settle |
| Direct team lead with leaves | Waiting team lead yields capacity; no durable join is created |
| Several concurrent team leads | Leaves continue to receive capacity; no hold-and-wait deadlock occurs |
| Task created without subagent | Task remains fully usable |
| Subagent linked with `taskId` | Correlation is recorded; task state changes only when the root changes it |
| One team finishes before siblings | Its completion is delivered and can trigger follow-up immediately |
| Exact run cancellation | Selected subtree stops; unrelated sibling remains active |
| Tree force termination | Target processes stop or report explicit failure evidence |
| Stale terminal or absent-process boundary | Exact reconciliation releases its permit and scope lease; an overlapping replacement can start |
| Live or ambiguous boundary reconciliation | Fails without releasing capacity, scope leases, or descendants |
| Fable or Opus root | Only provider-prohibited operations are blocked; selected root authors its own plan |
| Reload or compaction | Direct work needs no orchestration reconstruction; existing task references remain usable |

## Validation

Run the smallest affected tests after each task. Final validation:

```text
cd pi && pnpm run typecheck
cd pi && pnpm test subagent-tree-runtime.test.ts subagent-run-manager.test.ts subagent.test.ts subagent-workflow.test.ts tasks.test.ts operator-status.test.ts active-turn-compaction.test.ts fable.test.ts
cd pi && pnpm test
git diff --check
```

The provider-backed live smoke was explicitly deferred by the operator on 2026-08-21 in favor of validating the workflow on the next real work issue. The deterministic broker, entrypoint, background completion, cancellation, and reconciliation tests are the completion gate for this execution.

## Completion Evidence

- [x] `cd pi && pnpm run typecheck`
- [x] Required focused suite: 222 tests passed across the named subagent, task, status, compaction, workflow, and Fable files.
- [x] `cd pi && pnpm test`: 1607 passed, 1 skipped.
- [x] `git diff --check`
- [x] Broker canary tests cover capacity-one delegation, eight saturated coordinators, independent background completion, exact sibling-preserving cancellation, stale absent-boundary reconciliation, live-boundary rejection, and scope reacquisition.
- [x] Provider-backed smoke deferred by explicit operator decision to the next real work issue.

## Execution Status

- State: complete
- Completed: 2026-08-21
- Execution status: complete
- Durable tracking task: `c2df47fa-1737-4afc-81f7-358fb0a6de5a`
