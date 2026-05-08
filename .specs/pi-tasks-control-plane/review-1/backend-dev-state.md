# Backend-dev state/data-integrity PRD readiness review

## Findings

### 1. Severity: High — `skipped` lifecycle semantics are underspecified and conflict with current terminal/retry model

**Evidence:** PRD requires “Add a `skipped` state that unblocks dependents without implying work was completed” and asks open question “Should skipped tasks be terminal forever, or retryable back to pending/running?” Current registry states are `pending`, `running`, `blocked`, `completed`, `failed`, `cancelled`, with `completed` and `cancelled` terminal in `pi/lib/operator-state.ts`.

**Required fix:** Resolve `skipped` before planning implementation: define whether it is terminal, allowed transitions into/out of it, whether `TaskStop` can produce it, whether `retry` applies, and how terminal filtering treats it. Add acceptance criteria for invalid transitions involving `skipped`.

### 2. Severity: High — Dependency edge ownership and mutation invariants are not precise enough to prevent graph corruption

**Evidence:** PRD requires dependency edges, bidirectional `blocks` / `blockedBy`, intra-batch dependencies, DFS cycle detection, skipped blockers unblocking dependents, and no partial graph corruption. It does not define canonical storage ownership for edges, atomic update behavior across multiple task files, duplicate edge handling, dangling references, or rollback/repair when one side of a bidirectional update persists and the other fails.

**Required fix:** Specify canonical dependency representation and invariants: valid edge references, no self-edge, no duplicate edge, bidirectional consistency rules, cycle rejection timing, and all-or-nothing behavior for `TaskCreateMany`/edge updates. Require tests for partial write failure during bidirectional edge creation and deletion of a task referenced by others.

### 3. Severity: High — Migration/backward-compatibility requirements are too vague for a schema-changing canonical registry

**Evidence:** PRD says “Preserve existing task registry compatibility,” “Version schema and test old record loading,” and extend `TaskRecordV1`, while current `readTaskFile()` only accepts `schemaVersion === 1` and silently returns `null` on parse/schema failures. The PRD does not say whether the new schema remains v1 with optional fields, becomes v2, or how unknown/legacy records are rewritten.

**Required fix:** Add explicit migration contract: source versions accepted, target version written, required defaults for missing fields, preservation of unknown fields, and visible diagnostics for unreadable/corrupt versus legacy records. Add fixture-based acceptance criteria using current v1 task JSON and corrupt JSON.

### 4. Severity: Medium — Delete/clear semantics are unresolved, making stale-ID and dependency behavior impossible to implement safely

**Evidence:** PRD requires auto-clear warnings, cleared ID tracking, distinguishing “missing” vs “deleted/cleared,” and asks “Should `TaskUpdate(status: "deleted")` hard-delete records or mark tombstones?” It also requires dependents to use completed prerequisite outputs, but does not define what happens when a prerequisite is deleted/cleared.

**Required fix:** Decide tombstone versus hard delete. Define how cleared/deleted tasks affect dependencies, output retrieval, `TaskGet`, `TaskUpdate`, and stale ID reminders. Require that clearing a task with dependents either be rejected, cascade with explicit warnings, or preserve a tombstone/output summary sufficient for graph integrity.

### 5. Severity: Medium — Idempotent write and persistence-failure behavior lacks concrete API shape

**Evidence:** PRD says “Never report task mutation success if persistence failed,” “recreate missing task directories,” and “distinguish update outcomes: updated, missing, deleted/cleared, and failed to persist.” Current registry mutators throw on missing/write failure and return a record on success; `readTaskFile()` swallows errors. The PRD does not define whether tools return result unions, throw typed errors, retry writes, or verify read-after-write.

**Required fix:** Specify mutation result contracts for registry APIs and LLM tools, including typed outcome codes, user-visible warning propagation, atomic temp-file/rename requirements, read-after-write or fsync expectations, and idempotency keys for `TaskCreateMany`/execution output writes to avoid duplicate records after retries.
