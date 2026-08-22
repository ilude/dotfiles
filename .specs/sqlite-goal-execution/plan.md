---
status: ready
slug: sqlite-goal-execution
---

# SQLite Goal Execution

## Objective

Replace the one-file-per-task registry with a process-shared SQLite Goal Execution store that preserves the existing `task` interface, represents Tasks and explicit Dependencies as a Dependency Graph, and uses optional metadata to improve deterministic task selection without requiring metadata or scheduling work.

## Completion Evidence

- Evidence: A summary-only task retains every supported create, query, update, transition, and removal workflow; existing JSON records migrate losslessly; explicit dependencies remain cycle-safe hard prerequisites; optional `goalId`, `produces`, `consumes`, and `priority` metadata can refine `task ready` ordering without changing readiness or transitions; separate Pi processes observe committed SQLite changes; and the active task prompt and domain documentation consistently distinguish Goal Execution from Prompt Scheduling.
- Fails when: Metadata becomes mandatory, inferred relationships hard-block work, `task list` changes its default ordering, task records execute or schedule work, migration loses supported or recoverable records, rollback cannot preserve post-cutover mutations, concurrent writers expose partial state, a tree presentation restricts the underlying graph, or operational guidance requires a `pi/AGENTS.md` change.

## Boundaries

- Goal Execution uses the terms Goal, Task, Dependency, and Dependency Graph. Prompt Scheduling remains the separate owner of timed prompts and the `schedule` tool.
- A Task still requires only `summary`. Goal association and all new metadata are optional. Existing state, workspace, session, scope, dependency, transition, correlation, rendering, and security behavior remain supported.
- A Dependency is an explicit hard prerequisite created through `blockedBy`. Prose and optional metadata never create a Dependency.
- The Dependency Graph supports multiple prerequisites and shared prerequisites. A dependency tree is only a presentation of part of that graph.
- `task list` retains newest-created-first ordering. `task ready` returns tasks with no incomplete hard dependencies using this total order: numeric priority descending (absent equals zero), a producer before a candidate consuming the same exact case-sensitive resource name, count of incomplete direct dependents descending, creation time descending, then task ID ascending. This projection changes presentation only.
- Existing omitted-versus-empty behavior remains unchanged. New empty `produces` and `consumes` collections normalize to absent values.
- The existing goal identifier may be carried as optional `goalId`; this plan does not redesign the goal extension.
- No new task command, scheduler, lease, run, attempt, event-sourcing ledger, artifact ledger, outbox, workflow DSL, graph database, or `pi/AGENTS.md` rule is included.
- Use built-in `node:sqlite` only after proving the exact production runtime boundary at Pi's Node floor. Do not silently add a native database package or fallback path.
- Live migration is a quiescent operator boundary. Stop before import until every other Pi process is closed. Preserve unrelated working-tree changes, including `.specs/remote-agent-platform/` work.

## Tasks

- [x] **T1: Establish the SQLite store and reversible migration boundary**
  - Files: `pi/lib/task-registry.ts`, `pi/lib/operator-state.ts`, new focused schema/store modules under `pi/lib/`, `pi/scripts/task-store-migrate.ts`, and focused registry, dependency, migration, and process-concurrency tests.
  - Change: Prove Node 22.19-compatible `node:sqlite` `DatabaseSync` open/close, explicit transactions, WAL, foreign keys, busy timeout, rollback, and two-process visibility using the exact production runtime command. Implement one process-held connection at `${PI_OPERATOR_DIR:-~/.pi/agent/operator}/tasks.sqlite3` with tasks, dependency edges, and schema/migration metadata. Keep lifecycle and cycle rules in the domain layer. Enforce the dependent-task foreign key while retaining missing or tombstoned prerequisite IDs during migration so currently recoverable records remain lossless. Make batch creation and tool-level update-plus-transition atomic; retain the existing batch failure shape with no persisted IDs after rollback. Add `import --operator-dir <path>` and `export --operator-dir <path>` migration modes with an inter-process lock, stable-snapshot checks, documented exit codes, transactional authority marker, staged semantic verification, and atomic legacy-directory replacement. Do not dual-write or silently fall back.
  - Done when: Import is idempotent and field-preserving; supported dangling dependencies remain diagnosable; invalid new dependencies and cycles remain rejected; failed batches and transitions leave no partial state; separate processes observe committed state; export represents every supported post-cutover record; and import/export refuse unstable, locked, duplicate, cyclic, unsupported, or unrepresentable state without changing the authoritative store.
  - Verify: Run the exact-runtime capability slice and focused Vitest files. Spawn real `process.execPath` children against one disposable database to prove simultaneous-writer serialization, committed visibility, no dirty reads, bounded lock failure, injected rollback, termination/reopen recovery, and Windows path handling. Run disposable JSON import -> query -> post-cutover mutation -> export -> legacy reopen and require semantic equality.

- [x] **T2: Route task consumers through one Dependency Graph projection**
  - Files: `pi/extensions/tasks.ts`, `pi/lib/task-registry.ts`, the new store/query modules, `pi/lib/task-renderer.ts`, `pi/extensions/operator-status.ts`, `pi/extensions/herdr-metadata.ts`, `pi/extensions/goal.ts`, `pi/extensions/subagent/`, `pi/lib/orchestration-telemetry.ts`, and their focused tests.
  - Change: Preserve every existing task action and accepted legacy argument while routing tools, status, reminders, pruning, goal materialization, subagent correlation, telemetry, and Herdr metadata through current committed SQLite state. Extend create, batch, and update schemas with optional `goalId`, `produces`, `consumes`, and `priority`. Keep default list ordering unchanged and apply the exact Dependency Graph comparator only to `task ready`. Queue nonessential initial status and Herdr projections after `session_start`; model-facing task operations must never observe partial initialization or a process cache requiring cross-process invalidation.
  - Done when: Summary-only calls retain current fields and behavior; `blockedBy` remains the only input creating hard prerequisites; optional metadata independently changes only ready-result order; shared and multiple prerequisites work; migrated dangling references remain repairable; exact ties are deterministic; separate processes observe commits; and no task path invokes or claims the behavior of Prompt Scheduling.
  - Verify: Run parsed-schema and handler tests plus focused task tool, dependency, registry, renderer, operator-status, Herdr, goal, subagent, telemetry, session-resume, and process tests. Cover existing empty arrays, omitted and empty new metadata, each optional field independently, absence neutrality, metadata never changing readiness or transitions, exact comparator ties, atomic failures, user correction, `/clear` filtering, and startup with `--session`.

- [ ] **T3: Document the domain, validate, and perform the quiescent cutover**
  - Files: new `pi/docs/goal-execution-domain.md`, `pi/README.md`, the `task` tool schema/description/prompt surfaces in `pi/extensions/tasks.ts`, migration/operator documentation, and `.specs/sqlite-goal-execution/`.
  - Change: Document the bounded context, terms, scenarios, invariants, Dependency Graph semantics, optional metadata, transaction boundary, migration, rollback, rejected alternatives, and evolution triggers. Keep model-operational rules in the task tool surface, detailed rationale in the domain document, and concise operation in the README. Stop before live import and ask the operator to close every other Pi process; freeze mutations in the executing process, import a stable snapshot, validate SQLite state, and retain legacy JSON through the verification boundary. Rollback after any SQLite mutation requires quiescence, successful export, semantic comparison, and prior-code restoration.
  - Done when: The active task tool makes summary-only creation, optional metadata, explicit hard dependencies, and non-executing behavior discoverable; maintainers can trace domain and rollback decisions without `pi/AGENTS.md`; current documentation never calls Goal Execution a scheduler; the quiescent import passes; and all completion evidence is satisfied.
  - Verify: Exercise parsed tool schemas and handlers for behavior rather than prose spelling. Run `cd pi && pnpm run typecheck`, `cd pi && pnpm run biome:check`, relevant focused Vitest suites, full task/goal/subagent integration tests, and `git diff --check`; manually inspect terminology and migration instructions. Confirm the live SQLite state matches the stable legacy snapshot before allowing new task mutations.

## Validation

- [x] Focused SQLite capability and migration checks pass on the exact supported Node runtime.
- [ ] Focused and integration task, goal, subagent, status, Herdr, renderer, telemetry, resume, and real child-process tests pass.
- [ ] `cd pi && pnpm run typecheck`, `cd pi && pnpm run biome:check`, and `git diff --check` pass with no new failures.
- [ ] Quiescent live import and semantic comparison pass before SQLite becomes the mutable authority.

## Retention

Keep incomplete work at `.specs/sqlite-goal-execution/plan.md`. After every task and validation item passes, `/do-it` archives the entire directory to `.specs/archive/sqlite-goal-execution/`.

## Execution Status

- State: T1 and T2 complete; T3 in progress
- Blocker: quiescent live-migration gate in T3
- Next: T3 documentation, validation, and quiescent cutover
- Resume: `/do-it .specs/sqlite-goal-execution/plan.md`
