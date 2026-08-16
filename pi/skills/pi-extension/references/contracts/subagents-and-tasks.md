# Subagents and Durable Tasks

## Tree execution

- The selected primary model owns root orchestration. An omitted child role resolves to `leaf`, except that naming the agent `orchestrator` without a role is rejected with explicit-role guidance. A non-Fable root may request `role: "coordinator"`; a coordinator may run leaves only. Leaves and depth-two children cannot invoke delegation or workflow tools.
- The root-owned cross-process tree scheduler queues descendants and enforces eight active descendants by default. `PI_SUBAGENT_MAX_ACTIVE_DESCENDANTS` may configure a ceiling from 1 through 16.
- Every child role shares a 64-turn ceiling, including structured-output correction. If turn 64 requests more tool work, stop after that turn and return a budget-limited partial result.
- Read-only fan-out workers have an eight-minute wall-clock limit. Modifying leaves have no wall-clock hard timeout.
- Cancelling a coordinator or workflow recursively cancels queued and active descendants. A child capability may cancel only itself and its descendants; it cannot cancel or release an ancestor or sibling. Cancellation, process settlement, permit release, and scope release are idempotent.
- One blocked, failed, or cancelled child is represented as that child's result and does not cancel an unrelated sibling unless the invocation-level signal is aborted.
- `/subagents` can cancel a selected process-local tree. Run snapshots, bounded transcripts, live output, workflow state, and settled workflow results are process-local. They survive `/reload`, `/new`, `/resume`, and `/fork` in the same process and are discarded at process exit. Preserve full child output through an explicit child session or artifact when durable evidence is required.

## Callable subagent behavior

- `subagent` provides common foreground single and parallel execution. `background=true` returns immediately and delivers one bounded follow-up result when the orchestration settles.
- `subagent_status` is root-only and reports a tracked child's PID, process liveness, latest observable activity, activity version, active tools, and usage. A later check may pass the prior activity version to determine whether observable child events advanced. This is evidence of process and event progress, not proof of CPU work: a quiet live child may be waiting on a provider or a silent long-running tool. Completion remains push-based, so do not poll status in a loop.
- For non-Fable roots, `subagent_chain`, `subagent_continue`, `subagent_fanout`, and `subagent_workflow` are deferred capabilities activated through `tool_search`.
- `readOnlyFanout` is opt-in for one read-only investigation with 2 through 8 independent work items, equivalent single-generalist and parallel-specialist plans, and one required output schema. Assignment is deterministic. Do not use it for dependent work, mutations, or live operations.
- Validate every requested agent against `agentScope` before starting any worker or acknowledging background work. Project agents require `agentScope: "project"` or `"both"`; unknown names do not resolve as aliases. When `confirmProjectAgents` is requested, reject before spawn if no UI is available rather than bypassing confirmation.
- An optional `taskId` requires an existing non-deleted running task in the effective workspace and provides correlation only. Subagent calls never create or transition `TaskRecordV1` entries.
- When the exact root model is `amazon-bedrock/us.anthropic.claude-fable-5`, Fable cannot start a coordinator or continue a saved child session. Single, parallel, chain, fan-out, and typed workflow requests are preflighted after trusted agent discovery. Explicit models and agent pins must resolve to an available `openai-codex` model; omitted and size-based requests select only from available `openai-codex` models. One invalid request rejects the complete invocation before any child starts.
- Fable cannot select a custom output path. Its foreground results are bounded to 50 KB or 2000 lines. Complete truncated output is saved to a runtime-generated private temporary artifact, while internal chain handoff keeps the existing full-output or artifact-reference behavior.

## Typed workflow

- `subagent_workflow` accepts a closed map, retry, verify, and reduce specification with at most 256 unique items, two attempts by default, at most three attempts, and reduction groups of at most eight entries.
- Every item declares required capabilities. Preflight compares them with the selected agent's effective tools; missing tools reject the item without consuming an attempt.
- File analysis uses a bounded extract or repository-relative path/range input. Do not forward raw large-file content to a leaf or parent result.
- Each leaf returns a bounded envelope with `found`, `not_found`, `inconclusive`, or `error`, plus compact evidence, changed files, validation, and gaps. Retry only failed, inconclusive, schema-invalid, or verifier-contradicted items. A materially identical retry is rejected.

## Scope and durable-task boundaries

- A modifying workflow item declares normalized repository-relative scopes. Concurrent modifying items must have disjoint canonical scopes, and tree admission rejects lexical or symlink/junction overlap atomically.
- A scoped modifying leaf loses `bash` and `pwsh`; direct file mutations outside its assigned canonical scope are blocked. Existing symlinks and the nearest existing ancestor of a prospective target are resolved before containment is accepted.
- Only `task` creates durable todo records. The root selects ready work, marks it running, delegates with the existing `taskId`, validates the result, and records terminal state. Coordinators may carry that task ID; leaves and retries remain transient.
- Task and `/tasks` creation records the owning Pi session and workspace. Default list and ready views show only that session and workspace; explicit `all` views include other sessions, workspaces, and terminal records. Session startup pruning removes pre-session records that cannot be assigned safely.
- The run manager owns live process state. The task registry owns durable todo and dependency state. Neither mutates the other's lifecycle.

## Unattended goal recovery

- `subagent_workflow` keeps its bounded per-invocation retry contract. `/goal --unattended` separately tracks outcomes per linked durable root task across loop invocations.
- `error`, `inconclusive`, schema-invalid output, verifier contradiction, `not_found`, and infrastructure failure immediately suspend the affected ordinary attempt and require persisted re-evaluation. At most two materially different recovery attempts are allowed; two failures set only that item to a typed `recovery_exhausted` wait.
- Every terminal wait records one allowed reason, bounded evidence, and the required operator action. Capability rejection and damage-control denial may use an authorized alternative but are never bypassed. Cancellation and the repeated identical tool-result guard remain independent.
- `/goal --unattended` materializes one durable root task per canonical plan key with the parsed `Depends on` graph before modification. Goal ID, objective hash, canonical plan path, and task key metadata make partial batches idempotently reconcilable; child-owned task records cannot satisfy the mapping. Ordinary foreground `/goal <objective>` remains direct and session-owned unless a reviewed plan is explicitly supplied or material risk or ambiguity requires one.
- Ask-tier damage-control decisions without UI return `needs_approval` with a redacted decision reference. The active linked root task becomes blocked while independent ready tasks may continue; the denied action is never replayed automatically.
