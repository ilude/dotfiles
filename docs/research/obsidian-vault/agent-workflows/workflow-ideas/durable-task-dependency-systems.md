---
status: research-note
source:
  - local-session-019ff192-037a-7934-ab53-5ccb67721edb
  - ../../../../../.specs/pi-durable-work-activation/plan.md
  - ../../../../../pi/docs/orchestration-telemetry.md
  - web-and-academic-research-2026-08-12
---

# Durable Task and Dependency Systems for Pi Subagents

## Why this matters

Pi now has a useful separation of concerns:

- `task` stores durable intent, lifecycle state, scope, and dependency edges.
- `subagent` executes isolated work and can correlate a run with an existing running task through `taskId`.
- The parent agent selects work, validates results, and owns terminal task transitions.
- Active-turn compaction writes a bounded conversational handoff.
- Plans under `.specs/` remain the human-readable execution ledger for planned changes.

This is a stronger foundation than a task tool that also tries to be a process manager. The remaining question is how far to extend it if real use shows that task activation, crash recovery, execution provenance, result validity, or graph repair still fail.

The answer should not be "build Temporal inside Pi." The useful direction is a sequence of optional systems, each justified by a measured failure mode and each preserving the current task/subagent authority boundary.

## Evidence from the analyzed session

The source session is the Pi JSONL file ending in `019ff192-037a-7934-ab53-5ccb67721edb`. A read-only DuckDB query and direct JSONL count were taken during this note's preparation. Because the session was still active, these are a dated snapshot rather than final lifetime totals.

The bounded snapshot covers the first 514 JSONL entries through `2026-08-12T13:25:48.397Z` in:

```text
~/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/
2026-08-11T16-05-06-042Z_019ff192-037a-7934-ab53-5ccb67721edb.jsonl
```

The counts can be reproduced by reading only those first 514 lines, grouping entries by `type`, grouping message roles, and grouping `message.toolName` where `message.role == "toolResult"`. That snapshot contained:

- 514 entries and 496 messages.
- 316 tool results, including 102 Bash calls, 99 reads, 42 edits, 38 web fetches, 30 web searches, and 2 subagent invocations.
- One compaction at 235,874 tokens.
- No `task` tool calls.
- Before compaction, 157 tool results and one subagent research delegation without durable task creation.
- A compaction summary containing the goal, constraints, completed work, in-progress state, decisions, changed files, validation results, and next steps.
- Continued work after compaction that later produced and reduced a plan, implemented the bounded change, and ran the full Pi test suite.

The source session continued after this boundary, so rerunning an unbounded query will produce higher totals. This snapshot demonstrates both sides of the current design:

1. **The compaction handoff was useful.** It carried enough structured information for the session to continue.
2. **Durable task activation did not happen.** Recovery depended on the summary, repository state, and later plan artifact rather than a durable task frontier.

This is not evidence that the newly implemented compaction and `taskId` changes failed. They were written during the same session and require reload before normal use. It is evidence for the original activation problem and a baseline against which later sessions can be compared.

The earlier cohort analysis recorded in the compaction summary used a large-work proxy of at least 50 tool calls, at least 3 subagent calls, or any compaction. It reported:

- 12 parent sessions after task/subagent separation.
- 11 matching the proxy.
- 3 of those 11 using tasks.
- 4 parent sessions compacting, with 2 of those using tasks.

These cohort figures are historical analysis notes rather than a frozen dataset: the corpus changes, the post-refactor sample is small, and commit timing confounds comparisons with older task implementations. They support measuring activation and recovery, not estimating a stable task-adoption rate.

## Current Pi architecture

### Durable task graph

The current registry in [`pi/lib/task-registry.ts`](../../../../../pi/lib/task-registry.ts) stores one file per task. It supports:

- Lifecycle states.
- Workspace assignment.
- Optional worktree-relative scope.
- `blockedBy` dependencies and derived reverse edges.
- Same-batch aliases for creating a small graph in one operation.
- Complete prospective validation for cycles, missing or tombstoned blockers, duplicate dependencies, and workspace boundaries in graph-aware batch creation. Single-record create and update paths apply narrower validation and do not provide the same batch-wide guarantee.
- A conservative ready projection in which `completed` and `skipped` satisfy dependencies while missing, tombstoned, failed, cancelled, pending, blocked, and running blockers remain unmet.
- Atomic replacement for each task file, but not a graph-wide transaction across all files.

The public extension in [`pi/extensions/tasks.ts`](../../../../../pi/extensions/tasks.ts) intentionally does not start, wait for, stop, or capture output from workers. The parent performs:

```text
ready -> running -> execute -> validate -> terminal
```

This boundary was deliberately restored after an earlier mixed DAG runner made the task extension responsible for fan-out, waiting, stop semantics, ownership, orphan classification, and artifacts. The history is captured in:

- [Pi tasks control-plane PRD](../../../../../.specs/archive/pi-tasks-control-plane/PRD.md)
- [Pi task ready dependency UX](../../../../../.specs/archive/pi-task-ready-deps/plan.md)
- [Durable mixed task DAG runner](../../../../../.specs/archive/pi-task-dag-runner/plan.md)
- [Task/todo boundary](../../../../../.specs/pi-task-todo-boundary/plan.md)

The lesson from that history is important: execution features are not individually large, but together they create a scheduler and recovery system.

### Transient subagent execution

[`pi/extensions/subagent/index.ts`](../../../../../pi/extensions/subagent/index.ts) launches separate Pi processes with isolated contexts. It currently supports:

- Foreground single and parallel execution.
- Detached background execution with a bounded follow-up.
- Deferred chain, continuation, and read-only fan-out modes.
- Optional persisted child sessions with `continuable`.
- Optional output artifacts.
- Structured output with one bounded correction attempt.
- A process-local concurrency limit.
- `taskId` linkage for an existing non-deleted running task in the effective workspace.

The linked ID flows into the existing run manager, result details, and orchestration telemetry. It is correlation only. Child success, failure, or cancellation does not mutate the task.

[`pi/extensions/subagent/run-manager.ts`](../../../../../pi/extensions/subagent/run-manager.ts) owns live process status, cancellation, bounded transcript state, and recent run display. It is intentionally process-local. Session shutdown aborts active children and clears the manager. A continuable child session may survive on disk, but its session path is not a durable task-attempt record.

### Compaction, plans, and telemetry

[`pi/extensions/active-turn-compaction.ts`](../../../../../pi/extensions/active-turn-compaction.ts) asks the compactor to preserve objective, constraints, decisions, changed files, validation, blockers, task IDs and states, remaining frontier, and exact next action. Its hidden continuation tells the model to inspect durable tasks and create a minimal missing frontier before resuming unfinished multi-step work.

This is deterministic scaffolding around model-authored content. Tests can prove that the instructions are present; they cannot prove that a model will obey them.

Plans and tasks serve different purposes:

- `.specs/<slug>/plan.md` is a bounded, human-readable plan and resume ledger.
- The task registry is a workspace-level durable todo and dependency projection.
- A plan is not mirrored into tasks by default.
- A task graph is not automatically executed.

[`pi/docs/orchestration-telemetry.md`](../../../../../pi/docs/orchestration-telemetry.md) already defines explicit `orchestrationId`, `runId`, optional `taskId`, status, usage, model, duration, and output-byte metadata. It is observational and best-effort, not lifecycle authority. [`pi/docs/workflow-eval-telemetry.md`](../../../../../pi/docs/workflow-eval-telemetry.md) records workflow dispatch, but not the complete plan, validation, repair, archive, and terminal lifecycle.

## What the external systems actually teach

### 1. Definitions, runs, attempts, and acceptance are different things

Mature workflow systems consistently separate a reusable definition from a particular run and from an execution attempt:

- [Temporal](https://docs.temporal.io/workflow-definition) distinguishes Workflow Definitions, Workflow Executions, Activities, and Activity attempts. External and non-deterministic operations belong in Activities rather than replayed workflow code.
- [Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html) distinguishes DAG/task definitions, DAG runs, task instances, and retry attempts.
- [Prefect](https://docs.prefect.io/v3/concepts/tasks) distinguishes task definitions from task runs and their state histories.
- [GitHub Actions](https://docs.github.com/en/actions/reference/variables-reference) exposes a stable `GITHUB_RUN_ID` and a separate incrementing `GITHUB_RUN_ATTEMPT`.

Pi currently has stable task IDs and transient subagent run IDs, but no durable ordered attempt history between them. `retryCount` records a lifecycle decision, not what actually ran.

For agent work, acceptance must remain a separate decision. The academic [Contract Net Protocol](https://doi.org/10.1109/TC.1980.1675516) separates announcement, award, execution, and result reporting. A worker report is evidence to the manager, not proof that the shared objective is complete. This supports Pi's current rule that a subagent must not complete its own durable task.

### 2. A dependency DAG is a partial-order plan, not necessarily a scheduler

Partial-order planning introduces only the orderings needed for support or conflict resolution, leaving independent actions unordered. See Weld, [An Introduction to Least Commitment Planning](https://doi.org/10.1609/aimag.v15i4.1071).

HTN planning adds another layer: compound tasks are decomposed through named methods into primitive or further compound tasks. See:

- Erol, Hendler, and Nau, [HTN Planning: Complexity and Expressivity](https://doi.org/10.1016/0004-3702(94)00005-F)
- Georgievski and Aiello, [HTN Planning: Overview, Comparison, and Lessons Learned](https://doi.org/10.1016/j.artint.2015.02.002)

Pi's `blockedBy` graph is analogous to the precedence component of a partial-order plan: it preserves independence when no ordering edge exists. It is not a partial-order planner because it does not model causal support, threats, or conflict-resolution orderings. It is also not an HTN because `parentId` does not identify a decomposition method, applicability assumptions, alternative methods, or parent completion semantics.

The useful implication is not to add an HTN planner now. It is to preserve independence in the DAG and later add small named recipes only for repeated workflows such as:

```text
implement -> focused validation -> independent review
research -> source verification -> synthesis
incident diagnosis -> canary recovery -> endpoint validation -> rollout continuation
```

### 3. Prospective and retrospective provenance should not be collapsed

Scientific workflow provenance distinguishes:

- **Prospective provenance:** the intended recipe, dependencies, parameters, and plan.
- **Retrospective provenance:** what actually ran, with which agent, inputs, environment, outputs, failures, and validations.

See Davidson and Freire, [Provenance and Scientific Workflows](https://doi.org/10.1145/1376616.1376772), and the [W3C PROV data model](https://www.w3.org/TR/prov-dm/).

A practical Pi mapping is:

- Plan and task definition: prospective provenance.
- Subagent attempt, changed paths, artifact references, and validation results: retrospective provenance.
- Parent acceptance or rejection: the bridge from execution evidence back to durable task state.

The task file should not become a transcript or artifact store. It should reference bounded evidence owned elsewhere.

### 4. Checkpointing is more than a summary

[Anthropic's long-running agent harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) is an engineering case study that reports failures in long-running coding work even when compaction was available, then reports success with a durable feature inventory, progress file, Git history, one bounded increment per context, and explicit testing before marking completion. It is not a controlled comparison proving the independent effect of each mechanism.

[LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) distinguishes thread-scoped checkpoints from cross-thread durable stores. [OpenAI Agents SDK sessions](https://openai.github.io/openai-agents-python/sessions/) maintain conversation history under a session identity. These are product contracts, not evidence that Pi should embed either framework.

Recovery research provides useful analogies, with different assumptions from Pi:

- Chandy and Lamport's [Distributed Snapshots](https://doi.org/10.1145/214451.214456) concerns distributed processes and communication channels; its relevant analogy is that independently captured component state can omit in-flight work.
- ARIES [transaction recovery](https://doi.org/10.1145/128765.128770) uses write-ahead logging, log sequence numbers, repeating history during redo, and compensation log records during undo. The Pi analogy is that recoverable mutation needs durable operation identity and explicit recovery records, not that Pi should copy database recovery.

A Pi compaction summary is a conversational recovery capsule. It is not an atomic workflow checkpoint because it does not atomically capture task files, live subagent attempts, pending results, and pending validations.

### 5. Completion and freshness are different

Build systems provide the clearest model for stale work:

- [Build Systems a la Carte](https://doi.org/10.1145/3236774) separates dependency discovery, rebuild decisions, and scheduling.
- [Sound and Optimal Incremental Build Systems with Dynamic Dependencies](https://doi.org/10.1145/2814270.2814316) addresses avoiding unnecessary work without leaving outputs inconsistent with changed inputs.
- [Bazel remote caching](https://bazel.build/remote/caching) associates actions with declared inputs, commands, environment, outputs, and content hashes.
- [Ninja](https://ninja-build.org/manual.html) keeps the low-level executor deliberately small and expects a higher-level generator to make policy decisions.

Pi currently treats `completed` as a lifecycle fact. It does not know whether the accepted result remains valid after the base commit, declared inputs, dependency output, or configuration changes.

The useful build-system idea is selective invalidation, not automatic replay. A completed mutating task that becomes stale should be marked `stale` or `needs_validation`; it should not rerun automatically.

### 6. Durable execution implies at-least-once risk

[Temporal Activities](https://docs.temporal.io/activities) may retry from their initial state unless heartbeat details provide a checkpoint. With configured retries or acknowledgement loss, an Activity can perform an external effect more than once, so Temporal recommends idempotent Activity design where duplication matters. The exact delivery behavior depends on timeout and retry configuration.

For Pi this means:

- A lost acknowledgement does not prove a worker performed no side effect.
- Lease expiry proves loss of ownership, not absence of mutation.
- Automatic retry is safe only when the task has an idempotency or resumability contract.
- Mutating agent work should default to manual retry.
- Exactly-once external effects must never be claimed from a task state machine alone.

### 7. Parallelism needs resource policy, not just dependency readiness

[GitHub Actions concurrency groups](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [GitLab resource groups](https://docs.gitlab.com/ci/yaml/#resource_group), Airflow pools, Dagster pools, Prefect concurrency limits, and Ninja pools all separate dependency readiness from resource admission.

Pi currently caps process-local subagent concurrency, but `scope` is advisory rather than a lock or sandbox. Two graph-ready tasks can still conflict by editing the same worktree or mutating the same service.

If this becomes a repeated problem, explicit resource keys are safer than guessing from path globs:

```text
worktree:dotfiles-main
service:forgejo
resource:production-dns
```

Read-only tasks can overlap. Conflicting writers should serialize or use separate worktrees.

### 8. Multi-agent systems are most useful for breadth, not dense dependency graphs

[Anthropic's multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) uses a lead agent and parallel isolated researchers. Anthropic reports a 90.2 percent improvement on its internal breadth-heavy research evaluation and says its multi-agent systems use about 15 times the tokens of ordinary chats. These are vendor-reported, non-independent figures from different comparisons, not general performance or cost ratios. The same report warns that domains with many dependencies or shared context are a poor fit.

Its most transferable lessons are:

- Give each worker a specific objective.
- Define task boundaries and output format.
- Specify source and tool expectations.
- Scale worker count to problem complexity.
- Let the parent synthesize and validate.

Pi already implements the orchestrator-worker shape. The next improvement should be a more explicit assignment contract for linked durable work, not more fan-out by default.

[AutoGen GraphFlow](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html) demonstrates sequential, parallel, conditional, fan-in, and loop graphs, but its API is marked experimental. Pi should borrow graph vocabulary only when a repeated fixed workflow needs deterministic control. Embedding a second graph runtime would create competing owners for tasks, sessions, subagents, loops, and schedules.

### 9. More context is not reliable recovery

[Lost in the Middle](https://doi.org/10.1162/tacl_a_00638) found that long-context models often use relevant information near the beginning or end more reliably than information in the middle. [MemGPT](https://arxiv.org/abs/2310.08560) explores tiered context and external memory.

The conservative Pi implication is:

- Keep recovery capsules bounded and salient.
- Retrieve current task and artifact detail just in time.
- Do not inject the entire task history or graph into every model turn.
- Do not introduce autonomous memory paging or another vector store solely for task recovery.

## Possible additional systems

The systems below are an unordered design menu, not a roadmap or commitment. Each is parked behind its own evidence gate. The integration seams describe what would need examination if an idea is promoted; they are not approved implementation scope.

### System A: Deterministic task rehydration

**Problem addressed:** A compaction summary exists, but the continuation may fail to inspect or materialize the durable frontier.

**Mechanism:** Before the hidden continuation is sent, deterministically query the current workspace's running and ready tasks and include a bounded projection:

```text
running: id, summary
ready: id, summary, blocker count
failed: id, summary, explicit recovery needed
```

**Subagent interaction:** No subagent changes. The parent receives current task IDs before deciding whether to delegate.

**Integration seams if promoted:**

- Extend active-turn compaction continuation construction.
- Reuse task registry list/ready projections.
- Add strict count and byte bounds.
- Keep full details behind `task get`.

**Evidence gate:** Post-change session logs still show compaction followed by incorrect frontier reconstruction, duplicate task creation, or user correction.

**Complexity:** Low. This is the strongest next increment if the current prompt-only continuation misses.

### System B: Workflow lifecycle correlation

**Problem addressed:** Goal, plan, review, execution, task, orchestration, and closeout records cannot be joined reliably across session replacement.

**Mechanism:** Add one lightweight `lifecycleId` or `workRunId` that links existing records without replacing their owners:

```text
lifecycle
  -> optional goal
  -> optional plan path and revision
  -> workflow command episodes
  -> task IDs
  -> orchestration IDs
  -> terminal closeout
```

**Subagent interaction:** Pass the lifecycle ID into orchestration telemetry and linked run metadata. Continue using `taskId` and `runId` for their existing scopes.

**Integration seams if promoted:**

- Workflow command dispatch and session-transfer metadata.
- Workflow telemetry schema.
- Orchestration event correlation.
- Goal closeout and plan execution handoff.
- No new scheduler and no automatic task creation.

**Evidence gate:** Repeated analysis requires timestamp inference, or `/do-it` session replacement loses the active objective and linked artifacts.

**Complexity:** Low to medium. This is useful for observability and handoff, not execution durability.

### System C: Durable task-attempt ledger

**Problem addressed:** A task can be retried or delegated several times, but Pi has no durable ordered history connecting task, run, worker, output reference, and validation.

**Mechanism:** Keep `TaskRecordV1` as the intent projection and retain a durable attempt record for every dispatch. Prior attempts are never overwritten or discarded, while the current attempt record may advance through explicit execution and validation states:

```text
TaskAttempt
  attemptId
  taskId
  attemptNumber
  lifecycleId or planRevision
  orchestrationId
  runId
  agent and resolved model
  effective cwd
  assignment contract hash
  prerequisite attempt or artifact references
  startedAt and settledAt
  execution outcome
  artifact references
  validation outcome
  acceptance decision
```

A retry appends another attempt. It does not erase earlier failure evidence.

**Subagent interaction:**

1. Parent marks a ready task running.
2. Parent creates the attempt.
3. `subagent` receives `taskId` and `attemptId`.
4. Run manager and telemetry carry both IDs.
5. Worker settlement records execution outcome only.
6. Parent validates and records accepted, rejected, or waived.
7. Parent transitions the durable task.

**Likely subagent updates:**

- Optional `attemptId` in single and parallel items, normally generated by the parent workflow rather than invented by the child.
- Include task and attempt identity in the child environment for trace correlation.
- Return attempt identity in foreground results and background follow-ups.
- Persist continuable `sessionPath` and artifact references against the attempt.
- Show linked attempt in `/subagents` detail.
- Never auto-complete the task.

**Storage:** Start with a bounded append-only JSONL attempt stream plus compact projections only if one writer remains authoritative. If multiple processes must claim attempts, use SQLite or another transactional local store rather than treating per-file rename as compare-and-swap.

**Evidence gate:** Running tasks become orphaned after restart, retries lose prior evidence, or operators cannot identify which child produced an accepted result.

**Complexity:** Medium. This is the most useful foundation for later recovery.

### System D: Artifact and validation provenance

**Problem addressed:** A subagent can save output, but tasks do not have a durable, typed record of what was produced and why it was accepted.

**Mechanism:** Store bounded artifact manifests outside task notes:

```text
ArtifactRef
  artifactId
  path or URI
  sha256
  size and media type
  producing attemptId
  repository revision
  declared input and dependency artifact digests
  validation record IDs
  retention policy
```

A validation record should identify the check, command or evaluator contract, result, timestamp, and evidence reference. Process success is not validation success.

**Subagent interaction:** Require linked workers to return a structured handoff containing deliverable, changed paths, checks run, unresolved issues, and artifact references. The parent verifies evidence and decides acceptance.

**Integration seams if promoted:**

- A small artifact-manifest library.
- Output finalization in subagent.
- Task detail and `/subagents` detail links.
- Optional required output schema for high-risk linked tasks.
- Retention and secret-scanning rules.

**Evidence gate:** Compaction or restart loses child results, users repeatedly inspect full child transcripts to discover outputs, or accepted tasks cannot be tied to validation.

**Complexity:** Medium.

### System E: Typed dependency outcomes and freshness

**Problem addressed:** Every current edge has one meaning, and `completed` or `skipped` always satisfies it. Accepted results can become stale without changing task state.

**Mechanism:** Add only edge types demonstrated by real ambiguity:

```text
requires_accepted_output
ordered_after
requires_terminal
uses_artifact
soft_block
```

Separate four dimensions:

- Readiness: ready, waiting, held.
- Execution: not started, running, interrupted, finished.
- Acceptance: unvalidated, accepted, rejected, waived.
- Freshness: current, stale, needs validation.

A changed accepted artifact invalidates only the downstream cone that consumed it. Mutating tasks do not rerun automatically.

**Subagent interaction:** Assignment packets name the prerequisite attempt/artifact versions consumed. Worker results identify actual inputs used. Parent acceptance records the resulting provenance.

**Integration seams if promoted:**

- Dependency schema and readiness projection.
- Artifact digest linkage.
- Stale propagation and task rendering.
- Plan revision or supersession metadata.

**Evidence gate:** `skipped` incorrectly unblocks work that required an output, or completed downstream tasks are reused after their inputs changed.

**Complexity:** Medium to high. Do not add typed edges speculatively.

### System F: Resource claims and concurrency admission

**Problem addressed:** Dependency-independent tasks can still conflict over a worktree, service, environment, or external resource.

**Mechanism:** Add explicit resource keys and a deterministic admission check:

```text
resources: [worktree:dotfiles-main, service:forgejo]
mode: read | write | exclusive
```

**Subagent interaction:** The parent acquires resources before dispatch. The run manager exposes the claim while live. Settlement or cancellation releases it. An expired process-local claim is not a durable lease and must not imply that external side effects are absent.

**Integration seams if promoted:**

- Task or attempt resource declarations.
- Admission logic before worker launch.
- `/subagents` and task detail rendering.
- Separate worktree support for independent writers.

**Evidence gate:** Real parallel runs overlap mutation scope or damage each other's validation state.

**Complexity:** Medium for one-process claims; high for cross-process claims.

### System G: Durable background execution and recovery

**Problem addressed:** A linked background worker is cancelled on parent shutdown, and a running task can survive without a durable execution pointer.

**Mechanism:** Introduce claims, leases, heartbeats, and checkpoints only for a dedicated durable execution mode:

```text
claim
  attemptId
  ownerId and process identity
  claimedAt
  leaseExpiresAt
  lastHeartbeatAt
  checkpointRef
```

Startup reconciliation compares durable attempts with verified process identity and durable artifacts:

- Worker alive: restore correlation.
- Worker gone, final artifact present: `awaiting_validation`.
- Worker gone, no final artifact: `interrupted` or `orphaned`.
- Never automatically replay a mutating attempt.

**Subagent interaction:** A durable worker must heartbeat through a parent-independent channel or be supervised by a process manager outside the transient session. Continuable child sessions become attempt checkpoints, not merely convenience files.

**Integration seams if promoted:**

- Durable attempt store.
- Parent-independent worker supervisor or one durable scheduler owner.
- Heartbeat/checkpoint protocol.
- Startup reconciliation.
- Explicit retry-safety and idempotency policy.
- Resource claim persistence.

**Evidence gate:** Process restart recovery is a repeated requirement and users need work to continue without the parent Pi process.

**Complexity:** High. This is where Pi becomes a durable execution engine.

### System H: Append-only lifecycle events and projections

**Problem addressed:** Latest task snapshots cannot explain how state was reached, and graph-wide updates are not transactional.

**Mechanism:** Record immutable events and derive compact projections:

```text
TaskCreated
TaskDefinitionRevised
DependencyChanged
AttemptClaimed
AttemptStarted
AttemptCheckpointed
ArtifactProduced
AttemptFinished
ValidationAccepted
ValidationRejected
TaskCompleted
TaskInvalidated
PlanRepaired
```

This resembles event sourcing, but Pi should not copy Temporal replay. LLM calls, file edits, shell commands, and external effects are not deterministic workflow code.

**Subagent interaction:** Subagent and parent actions append events with explicit operation, lifecycle, task, attempt, orchestration, and run IDs. The model sees only bounded projections and retrieves history on demand.

**Storage:** A transactional local store is justified if events and projections must update atomically or if several processes write. JSONL remains suitable for telemetry and a one-writer audit log, but not for uncoordinated multi-process claims.

**Evidence gate:** Attempt history, recovery, graph revisions, or multi-process ownership cannot be made reliable with a small attempt ledger.

**Complexity:** High.

### System I: Versioned plan repair and lightweight HTN recipes

**Problem addressed:** A failure or changed assumption can require local graph repair, but the current graph has no plan revision or decomposition rationale.

**Mechanism:** Represent graph changes as a new `planRevision` with reason and supersession links. Preserve unaffected accepted work, invalidate only the dependent cone, and choose between local repair and replanning.

Research on plan repair supports localized change when causal support is known, while also warning that reuse is not always cheaper than replanning:

- Kambhampati and Hendler, [A Validation-Structure-Based Theory of Plan Modification and Reuse](https://doi.org/10.1016/0004-3702(92)90031-B)
- Nebel and Koehler, [Plan Reuse versus Plan Generation](https://doi.org/10.1016/0004-3702(94)00082-C)

Add named HTN-like recipes only for repeated stable workflows. Each recipe would define applicability assumptions, decomposition, acceptance, and parent completion. It should generate or suggest a validated task DAG; it should not directly become the worker scheduler.

**Subagent interaction:** Assignment packets carry `planRevision`. Results produced under a superseded revision remain historical evidence but cannot satisfy current dependencies without explicit acceptance.

**Evidence gate:** Repeated work modifies graphs mid-run, session forks create ambiguous global task state, or the same decomposition is recreated manually across many projects.

**Complexity:** Medium for revisions; high for a general planner. Keep recipes small and explicit.

## Reference model for comparing the options

This conceptual model is a vocabulary for evaluating the parked systems, not a target schema or promised architecture:

```text
WorkflowLifecycle
  -> PlanRevision
       -> TaskDefinition / durable task projection
            -> TaskAttempt
                 -> SubagentRun
                 -> ArtifactManifest
                 -> ValidationRecord
       -> DependencyEdge
       -> ResourceRequirement
  -> Checkpoint
  -> TerminalCloseout
```

Identity scopes:

- `lifecycleId`: one user objective across command and session boundaries.
- `planRevision`: one version of the decomposition and dependency graph.
- `taskId`: stable logical deliverable.
- `attemptId`: one try to execute that deliverable.
- `orchestrationId`: one subagent tool invocation.
- `runId`: one worker process.
- `artifactId`: one durable output.
- `validationId`: one acceptance check.

These IDs must be joined explicitly. Timestamps, summaries, model names, and agent names are not reliable joins.

## Detailed subagent contract for durable work

If attempts and artifacts are introduced, a linked dispatch should become an assignment packet rather than only a prose prompt:

```text
identity
  lifecycleId
  planRevision
  taskId
  attemptId

assignment
  objective
  concrete deliverable
  allowed scope and mutation policy
  prerequisite artifact or attempt references
  acceptance checks
  required output schema
  resource keys
  stop condition

return
  result summary
  changed paths
  artifact references
  checks run and outcomes
  unresolved issues
  scope deviations
  resumable session reference, when enabled
```

The parent remains responsible for:

1. Selecting a ready task.
2. Marking or claiming it for execution.
3. Creating the attempt.
4. Dispatching the worker.
5. Validating returned evidence.
6. Accepting, rejecting, waiving, or retrying.
7. Updating the durable task projection.

The subagent remains responsible for:

1. Staying within the assignment boundary.
2. Producing the requested deliverable.
3. Reporting actual outputs and checks truthfully.
4. Writing large output to approved artifacts.
5. Checkpointing only when durable mode requires it.
6. Never deciding that the parent task is complete.

This preserves the strongest existing design decision while adding provenance and recovery.

## What not to build yet

- Do not re-add task-owned `execute_many`, `await`, `stop`, and output capture merely because the old code existed.
- Do not embed Temporal, Airflow, LangGraph, or AutoGen beside Pi's current task, session, loop, schedule, and subagent owners.
- Do not add an event-sourced store before a small attempt ledger proves insufficient.
- Do not add leases without a parent-independent durable worker mode.
- Do not treat lease expiry as proof of no side effects.
- Do not automatically complete tasks from child exit code.
- Do not automatically replay mutating work after a crash or stale-input detection.
- Do not hash the entire repository for every semantic task.
- Do not add critical-path scheduling before Pi has reliable duration observations by task class. Critical path is a priority hint, not a readiness or safety rule.
- Do not inject the complete graph or event history into every model call.
- Do not require durable tasks for disposable one-off delegation.
- Do not add worker-to-worker messaging before claims, bounded artifact exchange, deduplication, retention, and permission isolation exist.

## Measurement plan before promotion

Use the existing session and orchestration streams first. Measure:

- Large sessions with and without durable task activation.
- Compactions preceded by a usable task frontier.
- First post-compaction action: inspect tasks, create tasks, resume exact work, duplicate work, or user correction.
- Running tasks with no live or durable attempt reference.
- Linked subagent runs by foreground, background, and parallel mode.
- Linked runs whose parent task never reaches a terminal state.
- Retries with no distinguishable attempt history.
- Child outputs that require transcript recovery because no artifact reference exists.
- Parallel write conflicts or overlapping resource scope.
- User corrections caused by forgotten constraints, decisions, validation state, or next action.

The success metric is not more task calls. It is:

> Large work has a bounded, current, durable frontier and recoverable execution evidence before conversational context or process state is lost.

## KISS recommendation

The next step is observational: reload the current changes, then use post-reload session logs to measure whether compaction resumes the correct frontier and whether linked subagent work remains attributable to its task.

All other systems remain an unordered parking lot. Promote only the smallest option whose evidence gate is repeatedly met. In particular, leases, checkpoints, event sourcing, or autonomous scheduling require an explicit repeated need for execution to survive process loss.

## Source notes

### Local sources

- [Durable work activation plan](../../../../../.specs/pi-durable-work-activation/plan.md)
- [Task/todo boundary plan](../../../../../.specs/pi-task-todo-boundary/plan.md)
- [Archived mixed DAG runner plan](../../../../../.specs/archive/pi-task-dag-runner/plan.md)
- [Archived task readiness plan](../../../../../.specs/archive/pi-task-ready-deps/plan.md)
- [Task registry](../../../../../pi/lib/task-registry.ts)
- [Task extension](../../../../../pi/extensions/tasks.ts)
- [Subagent extension](../../../../../pi/extensions/subagent/index.ts)
- [Subagent run manager](../../../../../pi/extensions/subagent/run-manager.ts)
- [Active-turn compaction](../../../../../pi/extensions/active-turn-compaction.ts)
- [Subagent/task contract](../../../../../pi/skills/pi-extension/references/contracts/subagents-and-tasks.md)
- [Orchestration telemetry](../../../../../pi/docs/orchestration-telemetry.md)
- [Workflow dispatch telemetry](../../../../../pi/docs/workflow-eval-telemetry.md)

### Agent and long-context sources

- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- LangChain, [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- OpenAI, [Agents SDK sessions](https://openai.github.io/openai-agents-python/sessions/)
- OpenAI, [Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/)
- Microsoft, [AutoGen GraphFlow](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html)
- Liu et al., [Lost in the Middle](https://doi.org/10.1162/tacl_a_00638)
- Packer et al., [MemGPT](https://arxiv.org/abs/2310.08560)

### Workflow and build-system sources

- Temporal, [Workflow definitions](https://docs.temporal.io/workflow-definition), [Workflow executions](https://docs.temporal.io/workflow-execution), [Activities](https://docs.temporal.io/activities), and [Event History](https://docs.temporal.io/encyclopedia/event-history)
- Apache Airflow, [DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html), [DAG runs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html), and [tasks](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html)
- Dagster, [assets](https://docs.dagster.io/guides/build/assets), [asset versioning](https://docs.dagster.io/guides/build/assets/asset-versioning-and-caching), and [runs](https://docs.dagster.io/guides/operate/runs)
- Prefect, [flows](https://docs.prefect.io/v3/concepts/flows), [tasks](https://docs.prefect.io/v3/concepts/tasks), and [states](https://docs.prefect.io/v3/concepts/states)
- Bazel, [remote caching](https://bazel.build/remote/caching) and [Build Event Protocol](https://bazel.build/remote/bep)
- Ninja, [manual](https://ninja-build.org/manual.html)
- GitHub Actions, [variables](https://docs.github.com/en/actions/reference/variables-reference), [artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts), and [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- GitLab CI, [`needs`, retries, resource groups, and artifacts](https://docs.gitlab.com/ci/yaml/)

### Academic foundations

- Erol, Hendler, and Nau, [HTN Planning: Complexity and Expressivity](https://doi.org/10.1016/0004-3702(94)00005-F)
- Weld, [An Introduction to Least Commitment Planning](https://doi.org/10.1609/aimag.v15i4.1071)
- Davidson and Freire, [Provenance and Scientific Workflows](https://doi.org/10.1145/1376616.1376772)
- W3C, [PROV-DM](https://www.w3.org/TR/prov-dm/)
- Mohan et al., [ARIES](https://doi.org/10.1145/128765.128770)
- Chandy and Lamport, [Distributed Snapshots](https://doi.org/10.1145/214451.214456)
- Mokhov, Mitchell, and Peyton Jones, [Build Systems a la Carte](https://doi.org/10.1145/3236774)
- Erdweg et al., [Sound and Optimal Incremental Build Systems with Dynamic Dependencies](https://doi.org/10.1145/2814270.2814316)
- Smith, [The Contract Net Protocol](https://doi.org/10.1109/TC.1980.1675516)
- Grosz and Kraus, [Collaborative Plans for Complex Group Action](https://doi.org/10.1016/0004-3702(95)00103-4)
- Kambhampati and Hendler, [Plan Modification and Reuse](https://doi.org/10.1016/0004-3702(92)90031-B)
- Nebel and Koehler, [Plan Reuse versus Plan Generation](https://doi.org/10.1016/0004-3702(94)00082-C)

## Related notes

- [Pipelines and policies](pipelines-and-policies.md)
- [Goal closeout handoff](goal-closeout-handoff.md)
- [Adaptive plan review telemetry](adaptive-plan-review-telemetry.md)
- [Specs workflow trajectory](specs-workflow-trajectory.md)
- [KISS Pi workflow ideas](kiss-pi-workflow-ideas.md)
- [Agent terminal workspaces](../patterns/agent-terminal-workspaces.md)
