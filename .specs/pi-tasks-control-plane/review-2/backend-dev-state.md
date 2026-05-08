# Backend Dev State-Machine/Data-Integrity Review

## 1. HIGH — Migration contract is backward-compatible in name only

**Evidence:** T1 says “Legacy records load with defaults” and “Preserve legacy v1 fixture loading and unknown fields,” while the implementation target remains the canonical `TaskRecordV1` in `pi/lib/task-registry.ts`. The plan does not require an explicit version decision: whether MVP fields are still `schemaVersion: 1`, become `TaskRecordV2`, or are normalized through a migration boundary. It also does not require a round-trip test proving unknown legacy fields survive `updateTask`, `transitionTask`, dependency rewrites, and tool updates after defaults are injected.

**Required fix:** Add a T1 acceptance criterion for explicit schema-version/migration policy and round-trip preservation across every mutating path. Include fixtures for v1-with-unknown-fields and v1-with-missing-new-fields, then verify list/get/update/transition/dependency operations do not drop opaque fields or rewrite corrupt/unsupported records as valid migrated tasks.

## 2. HIGH — Batch dependency creation lacks a real atomicity protocol

**Evidence:** T5 requires `TaskCreateMany` invalid dependency batches to fail “without silent partial graph corruption,” and T3 says partial writes either roll back or leave repair state/warning. The current registry stores one JSON file per task, and the plan does not require a lock, manifest, write-ahead intent, transaction journal, or two-phase edge application for multi-task/multi-file updates. A process crash after writing task A but before task B or before reverse `blocks`/`blockedBy` edges can leave durable partial state while still satisfying many unit-level validation checks.

**Required fix:** Before T3/T5 implementation, choose and document one batch atomicity model: all-or-nothing with rollback/journal, or explicit repair-state with deterministic reconciliation. Add crash/interruption tests that inspect persisted files after injected failures at each write step, not only returned error objects.

## 3. HIGH — Redaction is ordered after schema/persistence work, creating an integration gap

**Evidence:** Wave 1 runs T1 and T2 in parallel. T2 says registry integration is “optional” and “after T1 shape is known,” but the objective requires metadata/output not persist or display secrets. T1 adds metadata/stats/tombstone persistence paths, T3 adds dependency metadata, T5 adds tool mutation paths, and T6 adds rendering. The plan never creates a mandatory gate that every persistence and render path calls the redaction helper before durable write/output.

**Required fix:** Make redaction integration non-optional. Add a V1/V3 criterion that seeds representative secrets through `createTask`, `updateTask`, `transitionTask` usage/metadata, `TaskCreateMany`, `TaskGet`, `TaskList`, and `/tasks show/list`, then asserts raw values are absent from both JSON files and rendered/tool outputs.

## 4. MEDIUM — `skipped` transition semantics remain underspecified for dependency unblocking

**Evidence:** T1 only requires “skipped lifecycle transitions are enforced” and says skipped can be “explicitly reopened to pending.” T3 validates graph invariants, but no criterion defines what happens to dependents when a blocker is `skipped`: whether `skipped` satisfies `blockedBy`, keeps descendants blocked, tombstones the edge, or requires an explicit override. T6 hides skipped tasks by default as terminal, which can mask blocked descendants if skipped does not satisfy dependency readiness.

**Required fix:** Define `skipped` dependency semantics in the plan before execution. Add tests for a chain A -> B where A transitions to skipped, including list/render/tool readiness behavior and whether B may start. If skipped is terminal-but-not-satisfying, require visible blocked-reason output that names the skipped dependency.

## 5. MEDIUM — Persistence failure outcomes are required but idempotency semantics are missing

**Evidence:** T1 requires typed `persist_failed`, and the PRD-derived plan requires not reporting success on failed writes. However, the plan does not define retry/idempotency behavior for failed creates/updates, especially `TaskCreateMany`. With random UUID creation, a write failure followed by retry can duplicate partially persisted tasks or create different IDs while the caller believes the first operation failed completely.

**Required fix:** Add idempotency requirements for mutation outcomes. For create/batch create, require client-supplied keys or returned repair handles for partial failures, and test retry after injected failure. For update/transition, require that a returned `persist_failed` means durable state is either unchanged or marked repairable with an explicit conflict outcome.
