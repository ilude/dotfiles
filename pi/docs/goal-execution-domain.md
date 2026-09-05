# Goal Execution domain

## Purpose

Goal Execution stores durable work state for Pi workflows. It represents Goals, Tasks, and explicit Dependencies as a Dependency Graph. It does not execute work and it does not schedule prompts.

Prompt Scheduling is a separate domain owned by the `schedule` tool and `scheduler.ts`. Scheduling controls when Pi receives a prompt. Goal Execution records what work exists, what it depends on, and its lifecycle state.

## Terms

- **Goal** - an optional durable objective that may group Tasks through `goalId`.
- **Task** - a durable unit of work. Only `summary` is required.
- **Dependency** - an explicit hard prerequisite created through `blockedBy`.
- **Dependency Graph** - the directed graph formed by Tasks and their Dependencies. It permits multiple prerequisites and shared prerequisites. A tree is only one presentation of part of this graph.
- **Resource metadata** - optional case-sensitive `produces` and `consumes` names used only to order ready Tasks.
- **Priority** - an optional numeric ready-order hint. Absence equals zero.

## Scenarios and invariants

A summary-only Task can be created, queried, updated, transitioned, removed, migrated, and exported without metadata. Create a Task only for a checkpoint that must survive compaction, interruption, or later continuation, or when tracking is explicitly requested; mandatory unattended goals retain their required root tasks. Delegation or independent verifiability alone does not require a record. Metadata never creates a Dependency and never changes readiness or an allowed lifecycle transition.

`blockedBy` is the only input that creates a hard prerequisite. New Dependencies must reference an existing non-tombstoned Task in the same workspace and must not create a cycle. Migrated dangling Dependencies are retained because they are recoverable historical state; they remain visible and can be repaired through `task update`.

`task list` remains newest-created-first. `task ready` includes only unassigned Tasks with no incomplete hard Dependency and applies this total order:

1. Numeric priority descending, with absence equal to zero.
2. A producer before a candidate consuming the same exact case-sensitive resource name.
3. Count of incomplete direct dependents descending.
4. Creation time descending.
5. Task ID ascending.

This ordering is a projection. It does not reserve, execute, schedule, lease, or transition a Task. Readiness selects eligible work only; it never dispatches it.

Lifecycle transitions remain defined by `pi/lib/operator-state.ts`. For tracked work, a parent records and assigns the task, invokes a root tool or separate process, validates the result, and records the terminal state. Assignment means selected work, not live process activity. Child processes do not own Task transitions. Create, batch, and assignment acknowledgements report recording only and do not monitor work.

## Storage and transaction boundary

The process-shared store is `${PI_OPERATOR_DIR:-~/.pi/agent/operator}/tasks.sqlite3`. It uses SQLite WAL mode, foreign keys, a bounded busy timeout, and one process-held connection. Task records and dependency edges commit together.

Batch creation is atomic. Combined tool-level update and transition is atomic. Dependency validation, readiness validation, and the associated mutation run inside the same write transaction. Separate Pi processes read committed state directly from SQLite; there is no task cache requiring invalidation.

The store records its schema and authority metadata. Normal Task operations refuse a database that is not marked authoritative. They do not silently fall back to legacy JSON and do not dual-write.

## Migration and rollback

The migration CLI is `pi/scripts/task-store-migrate.ts`:

```bash
node --experimental-strip-types pi/scripts/task-store-migrate.ts import --operator-dir <path>
node --experimental-strip-types pi/scripts/task-store-migrate.ts export --operator-dir <path>
```

Exit codes are printed by `--help`: 2 for usage, 3 for an active migration lock, 4 for a conflicting migration destination, 5 for semantic refusal, and 1 for other I/O or commit failures.

Import is a quiescent operator boundary. Close every other Pi process before import so the legacy directory is stable and no Task mutation is in flight. Import validates supported records, identifiers, duplicate IDs and edges, cycles, representability, and snapshot stability before publishing SQLite authority. It preserves omitted fields and dangling historical prerequisites. The retained legacy directory is the pre-cutover rollback source.

Export takes a stable SQLite snapshot while the migration lock blocks new Task mutations and a SQLite write barrier drains prior writers. It stages and semantically verifies every record before atomically replacing the legacy directory. Existing rollback directories are retained rather than silently deleted.

After any post-cutover SQLite mutation, rollback requires quiescence and a successful export. Compare the exported JSON records semantically with the SQLite snapshot before restoring code that reads legacy JSON. Never restore prior code against the stale pre-cutover directory.

## Rejected alternatives

- One JSON file per Task cannot provide one atomic process-shared graph mutation.
- Dual-write creates two authorities and ambiguous recovery.
- Silent fallback can split mutations across SQLite and JSON.
- Inferred Dependencies from prose or metadata would make readiness nondeterministic.
- A graph database adds operational complexity without improving this bounded local graph.
- Event sourcing, leases, attempts, artifact ledgers, and workflow DSLs are outside this domain.

## Evolution triggers

Revisit this boundary only when a concrete workflow requires distributed ownership, remote coordination, durable execution attempts, artifact provenance, or query scale that SQLite cannot serve. Additions must preserve summary-only Tasks, explicit hard Dependencies, deterministic projections, and the separation from Prompt Scheduling.
