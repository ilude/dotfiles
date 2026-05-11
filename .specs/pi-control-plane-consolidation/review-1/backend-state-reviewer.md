## Finding 1
severity: high
evidence: Plan T7 requires adding `skipped`, but `pi/lib/operator-state.ts` currently has only pending/running/blocked/completed/failed/cancelled and T7/T8 do not specify allowed transitions, terminal/non-terminal status, timestamp behavior, retry semantics, or `/tasks skip` idempotency. T8 only says skipped unblocks dependencies.
required_fix: Define the exact `skipped` lifecycle contract before implementation: source states allowed, whether skipped is terminal, required timestamps/reasons, no-op behavior, and dependency unblocking rules. Add tests for every permitted/rejected transition and `/tasks skip` mapping.

## Finding 2
severity: high
evidence: Plan T8 requires bidirectional `blocks`/`blockedBy` and invariants across create/update/delete/clear, but the current store is one JSON file per task (`pi/lib/task-registry.ts`) with independent read-modify-write operations. The plan has no atomic multi-record transaction or rollback requirement.
required_fix: Require graph mutations to be committed atomically: write all affected task files to temp files, validate the whole graph, then rename as a batch with recovery/rollback behavior. Tests must simulate mid-write failure and prove no one-sided edges or false success outcomes remain.

## Finding 3
severity: medium
evidence: Plan T7 says legacy loading and unknown-field preservation, but T8/T11 add delete/clear/tombstones without specifying whether legacy records lacking new fields are backfilled lazily, preserved byte-for-byte, or migrated. Existing producers (`agent-team.ts`, `agent-chain.ts`, `subagent/index.ts`) already create task records and swallow registry failures in some paths.
required_fix: Add an explicit migration contract: schema version handling, default values for missing dependency/tombstone/skipped fields, top-level unknown-field round-trip preservation, and producer compatibility tests using pre-upgrade JSON fixtures from existing producers.

## Finding 4
severity: high
evidence: Plan T7 requests typed persistence outcomes, but T10/T11 introduce LLM tools and slash commands without requiring callers to gate success messages on durable writes. Existing producer wrappers catch and ignore registry errors, so dispatch can appear successful while registry state is absent.
required_fix: Define outcome codes shared by registry, tools, and `/tasks`: persisted, rejected, conflict, deferred, write_failed. Require every mutating tool/command test to assert no success notification/tool success is emitted when create/update/transition/tombstone persistence fails.

## Finding 5
severity: medium
evidence: Plan T8 mentions missing dependency handling but does not define tombstone semantics for dependency edges. T7 asks for tombstone metadata and T11 includes `clear completed`; without a contract, clearing/deleting completed blockers can leave blockedBy references dangling or incorrectly unblock dependents.
required_fix: Specify tombstone behavior for deleted/cleared tasks: retained id, final state, dependency edge retention/removal, and how dependents resolve tombstoned blockers. Add tests for clear completed with active dependents, delete blocker, delete dependent, and load graph containing tombstones.
