---
created: 2026-07-15
status: complete
completed: 2026-07-15T23:07:12Z
---

# Plan: Durable mixed task DAG runner

## Context & Motivation

Pi's unified `task` tool already persists task records, models dependencies, identifies ready tasks, runs optional subagent executions in the background, preserves lifecycle and cancellation behavior, and keeps model-visible results compact. `TaskRecordV1.execution` is optional, so the registry can represent work owned directly by the main thread and work delegated to subagents in one graph.

Two gaps prevent the tool from serving as a practical mixed task DAG runner. First, `batch` cannot reference tasks created in the same call because dependencies require existing UUIDs, forcing create-then-update round trips. Second, the parent must execute and observe workers one at a time or poll task actions; there is no bounded fan-out action or one-shot event-driven join. Current prompt guidance also overstates the restriction on direct single-threaded work and can discourage legitimate user-requested or cross-turn main-thread task lists.

The target is one optional durable work graph, not separate planning and orchestration systems. Manual tasks and executable subagent tasks can coexist in one DAG. Ordinary short-lived planning can remain prose, while users and the main thread may choose durable task records whenever persistence, dependencies, resumability, or explicit tracking adds value.

## Constraints

- Platform: Windows 11 repository checkout with cross-platform runtime support.
- Shell: Git Bash for repository commands; Pi TypeScript remains pnpm-only.
- Preserve the existing `task` tool and optional `TaskRecordV1.execution` model.
- Preserve lifecycle, readiness, retry, cancellation, orphan reconciliation, `failed_to_stop`, workspace scoping, legacy import, telemetry, and TUI rendering behavior.
- Route every public task lifecycle mutation through `TaskLifecycleService` and its registry/coordinator delegates. Command, tool-update/stop, and execution paths must not implement competing transition, cancellation, retry, or ownership rules.
- Preserve compact model-visible mutation and collection results and full renderer details.
- Support main-thread-only task lists, executable subagent tasks, and mixed DAGs without requiring execution metadata on every task.
- Do not make task creation mandatory for ordinary multi-step work.
- Do not poll `list`, `ready`, `get`, or `output` in the intended workflow.
- New multi-ID execution actions may operate only on records with no workspace or the current resolved workspace. They must not execute or await foreign-workspace IDs.
- A task's explicitly stored execution working directory remains supported for compatibility; new multi-ID actions do not broaden this existing capability. Foreign task records are rejected before their stored execution fields are read or passed to the coordinator.
- Graph-aware batch accepts at most 16 tasks. New multi-ID execution actions accept at most eight unique IDs. Every new or extended action produces bounded deterministic results.
- Do not add exact-whitespace tests.
- Do not add worker-to-worker messaging in this MVP.
- Do not commit or push unless separately requested.
- Plan-owned tracked paths are `Makefile`, `CHANGELOG.md`, `pi/AGENTS.md`, `pi/PI-INSTRUCTIONS.md`, `pi/README.md`, `pi/extensions/tasks.ts`, `pi/extensions/tasks/execution.ts`, `pi/lib/task-registry.ts`, `pi/lib/task-renderer.ts`, `pi/lib/workflow-friction.ts`, `pi/tests/task-registry.test.ts`, `pi/tests/task-dependencies.test.ts`, `pi/tests/task-tools.test.ts`, `pi/tests/task-execution.test.ts`, `pi/tests/task-renderer.test.ts`, `pi/tests/tasks.test.ts`, and `pi/tests/workflow-friction.test.ts`. Mutate only task-DAG contract blocks in those paths.
- Preserve unrelated working-tree changes through targeted edits. In currently modified shared files, this plan authorizes only the task-guidance block in `pi/AGENTS.md`, task-tool documentation in `pi/README.md`, and one append-only entry in `CHANGELOG.md`; capture before/after diffs and preserve every other hunk.
- Use ASCII punctuation in repository files.

## Risk & Manual Gate Decision

- **Risk level:** medium
- **Blast radius:** personal-local-repo
- **Rollback:** known and localized through targeted inverse edits to plan-owned paths
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** The change is a cross-cutting local runtime workflow modification with concurrency and state-machine risk, but it is reversible, has no external deployment or paid-resource mutation, and can be validated deterministically with isolated registries, controlled runners, focused tests, and the repository's canonical Pi validation target.

## Review Profile

- **plan_profile:** architectural-workflow
- **review_panel_decision:** six-reviewer panel completed; material auto-applied changes require one post-change panel
- **expected reviewer count:** 6 initial, 6 post-change, 1 standalone-readiness reviewer
- **selected reviewer personas and reasons:** completeness for fresh-session execution; security for workspace and durable-state boundaries; scope for MVP size; TypeScript API for TypeBox, signals, and renderer contracts; durable state for write ordering and execution ownership; validation for concurrency and no-poll proof
- **complexity score:** 8/10 after contract hardening
- **risk score:** 5/10
- **expected high-risk areas:** prospective DAG validation, partial I/O failure, mixed manual/executable readiness, concurrent start results, abortable waiting, foreign or failed-to-stop ownership, provider envelopes, TUI detail parity, and context bounds

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep sequential create, execute, and output calls | No API changes | Repeats context, cannot express same-batch dependencies, and encourages polling | Rejected: does not solve the observed workflow cost |
| Build a separate DAG or team extension | Strong isolation | Duplicates registry, lifecycle, rendering, and persistence; risks recreating retired runtime surfaces | Rejected: optional execution records already model the domain |
| Extend the unified task tool with graph-aware batch, bounded fan-out, and one-shot wait | Reuses current state, preserves manual tasks, and adds only missing primitives | Requires exact state, provider, renderer, and cancellation contracts | **Selected** |
| Add automatic scheduling, leases, claims, pagination, and messaging now | More complete scheduler | Expands recovery and ownership before basic mixed-DAG usage is proven | Rejected for MVP: defer until measured need |
| Add a transaction journal for batch creation now | Crash-recoverable multi-file publication | Adds persistent transaction state, startup recovery, cleanup, and compatibility work | Rejected for MVP: expose non-atomic I/O failure honestly and keep readiness conservative |

## Objective

Deliver a backward-compatible `task` tool that can create a dependency graph containing manual and executable tasks in one request, launch a bounded set of ready executable tasks concurrently, wait once for same-session background executions without polling, and return compact terminal state plus artifact references. Main-thread tasks remain first-class and advance manually through the existing lifecycle.

Durability means successfully created task records and dependencies persist across sessions. It does not mean that a failed multi-file batch write is transactionally rolled back in this MVP. Deterministic graph validation is all-or-nothing before writes; any I/O failure is explicit, returns no successful batch result, and may leave inspectable partial records whose forward `blockedBy` edges remain authoritative for readiness.

## MVP Boundary

The MVP adds three capabilities:

1. Graph-aware `batch` input with unique request-local `key` values and `blockedByKeys` references resolved to durable UUIDs after complete deterministic validation.
2. A bounded `execute_many` action that accepts one to eight unique IDs, starts eligible ready executable tasks concurrently, leaves manual and ineligible tasks unchanged, and returns one deterministic classification per ID.
3. An abortable `await` action that accepts one to eight unique IDs, joins same-coordinator active executions once, returns immediate classifications for terminal and non-waitable records, and never cancels workers merely because waiting is aborted.

The representative behavioral fixture is:

```text
batch mixed graph -> complete a ready manual task -> ready once -> execute_many -> await once -> ready once -> complete the downstream manual task
```

The fixture proves same-request dependencies, concurrent execution, one event-driven join, downstream readiness, and manual ownership. It is not a required graph shape.

## Public Action Contract

### Shared schema and compatibility

- Keep the existing action union and add `execute_many` and `await`.
- Keep `additionalProperties: true` for resumed-session compatibility, but explicitly advertise every new field in TypeBox and reject malformed values used by the new actions at runtime.
- Add top-level `ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 8 })`.
- Keep batch `tasks` at `minItems: 0, maxItems: 16`. An omitted or empty array preserves the current successful empty-batch result; graph keys cannot exist without an item. Tests cover omitted, empty, one-item, and over-limit calls.
- For graph-aware batch items, cap both `blockedBy` and `blockedByKeys` at 16 entries in TypeBox and runtime validation. Preserve legacy single-task `blockedBy` behavior outside graph batch.
- Runtime validation rejects duplicate IDs, duplicate dependency entries after normalization, and more than 16 graph tasks rather than silently truncating, starting, or waiting twice.
- Preserve request order in every returned `results` array.
- Truncate each model-visible error to 200 characters and require `content[0].text` to remain at or below 4,096 UTF-8 bytes for each new action.
- Full records remain in `details`; prompts, notes, timestamps, usage, execution prompts, worker output, and full errors do not enter model-visible content.

### Graph-aware batch

Each `tasks[]` item may add:

```text
key?: ASCII string matching ^[A-Za-z0-9_-]{1,32}$, request-local and unique
blockedByKeys?: string[], at most 16 request-local keys
blockedBy?: string[], existing durable UUIDs, current workspace only
```

Rules:

1. A `blockedByKeys` entry must resolve to a unique `key` in the same request.
2. `blockedBy` and `blockedByKeys` may coexist, but any duplicate after UUID resolution is rejected before writes; no dependency input is silently deduplicated.
3. Existing blockers must exist, must not be tombstoned, and must have no workspace or the current workspace.
4. Reject duplicate keys, duplicate IDs after resolution, unknown keys, unknown/tombstoned/foreign existing blockers, self-dependencies, and cycles before the first write.
5. Generate all durable UUIDs before graph validation.
6. Successful publication is two-phase: write every new record with complete forward `blockedBy` edges, then reconcile every affected reverse `blocks` edge from the complete prospective graph.
7. Reverse declaration order must produce the same forward and reverse graph as topological declaration order.
8. A write or rename failure returns `write_failed` with an actionable bounded recovery envelope: `{ outcome, operationId, failedPhase, generated: [{ key?, id }], persistedIds, error }`. It returns no success envelope. Generated and persisted ID arrays preserve request order and remain within the 4,096-byte content bound.
9. Recovery after `write_failed` is explicit and deterministic: for each `persistedId` in reverse request order, clear its `blockedBy` through the existing update path, then tombstone it through remove. Tests prove this sequence restores affected existing blockers' derived `blocks` edges and leaves no active partial batch record. No automatic retry or rollback occurs.
10. Forward `blockedBy` is authoritative; derived `blocks` may be incomplete until the explicit recovery sequence finishes.
11. Model-visible success content is `{ outcome, count, tasks: [{ key?, id, state }] }`. The 16-task limit plus 32-character ASCII key bound must fit the complete alias list within 4,096 UTF-8 bytes; tests measure the worst-case valid response and runtime still enforces the byte bound before writes.
12. Renderer details are `{ outcome, records, aliases }`, where `records` contains complete durable records and `aliases` maps request keys to IDs.

### Multi-task result vocabulary

Both `execute_many` and `await` return one result per unique supplied ID, preserving request order:

```text
started            - executable task entered running; next action: await this ID
manual_ready       - pending ready task has no execution; parent performs work then update
manual_running     - running task has no execution metadata and remains parent-owned; parent completes, blocks, or fails it through update
pending            - executable task is not active; next action: execute when ready
blocked            - unmet dependencies; next action: complete blockers, then call ready once
active             - active in this coordinator unless durable status is failed_to_stop; next action: await this ID
terminal           - completed, failed, cancelled, or skipped; inspect state/artifact as needed
external_running   - running but not owned by this coordinator; do not poll or restart here
failed_to_stop     - prior stop could not prove termination; this classification overrides active-map ownership; call stop to reconcile ownership before any retry
start_failed       - current execute_many call could not persist ownership and started no runner; if compensation succeeded later reads show blocked, otherwise they show ownership_unknown
orphaned           - valid running or stop_requested execution has a dead/missing owner; next action: call stop to reconcile blocked/orphaned before retry
ownership_unknown  - running record has malformed or inconsistent execution metadata; next action: call stop when metadata is valid, otherwise use update to block only after confirming no parent owns it
missing            - no record exists; correct the ID
foreign_workspace  - record is outside current workspace; no state change or runner call
aborted             - only await was aborted; workers continue and may be awaited later
```

Public details use one positional typed envelope: `{ outcome, results: Array<{ id, classification, state?, error?, record? }> }`. `record` is present only for authorized existing records and omitted for `missing` and `foreign_workspace`. The renderer must support this envelope and show per-ID classifications plus available artifact paths in compact and expanded modes without placing complete data in model-visible content.

### `execute_many`

- Accepts current `cwd` plus one to eight unique IDs.
- Classifies every supplied record before mutation.
- Starts only current-workspace pending/blocked/failed tasks that have executable metadata and pass the existing registry readiness/start gate.
- A ready manual task is `manual_ready`, not an error.
- Blocked, terminal, active, external-running, failed-to-stop, missing, and foreign-workspace records are not mutated.
- Eligible records may start even when other supplied IDs are ineligible; top-level outcome is `accepted` when all are started, `partial` for mixed results, and `rejected` when none start.
- Concurrent start reuses the synchronous single-task `start` path. Duplicate IDs are rejected before classification.
- Execution ownership metadata is persisted before the runner starts. If that write fails after the lifecycle entered running, compensate to blocked with reason `execution metadata persistence failed`, return `start_failed` for this execute_many call, and do not invoke the runner. After successful compensation, later `await` returns `blocked`, not `start_failed`. If compensation also fails, the current call returns `start_failed` with durable state plus recovery error; later calls classify the inconsistent running record as `ownership_unknown` until stop reconciles it. Later supplied IDs remain classifiable.

### `await`

- Calls `wait(taskIds, signal?: AbortSignal)` with the real tool signal.
- Captures active promises synchronously, attaches settlement handlers before awaiting, and rereads each durable record after its captured promise settles.
- Does not poll files or timers for completion.
- Already terminal records return immediately.
- Pending/manual, pending executable, blocked, external-running, failed-to-stop, missing, and foreign-workspace records return immediately with their stable classification. An active-map record persisted as `failed_to_stop` returns `failed_to_stop` immediately rather than joining its still-unsettled promise.
- An already-aborted signal returns `aborted` for same-coordinator active IDs without touching worker controllers or task state.
- A mid-wait abort returns promptly with terminal classifications for work already settled and `aborted` for work still active. All captured promises retain handlers so later completion cannot create an unhandled rejection.
- Repeated await is idempotent: active work may later become terminal, and terminal records always return their current durable state.

## Wait and Ownership Truth Table

| Record at call time | Coordinator ownership | `execute_many` | `await` | Mutation |
|---------------------|-----------------------|----------------|---------|----------|
| missing | none | `missing` | `missing` | none |
| foreign workspace | any | `foreign_workspace` | `foreign_workspace` | none |
| pending ready manual | none | `manual_ready` | `manual_ready` | none |
| pending ready executable | none | `started` | `manual_ready` is invalid; return `pending` | execute only |
| pending or blocked with unmet blockers | none | `blocked` | `blocked` | none |
| running executable, status `failed_to_stop` | active or inactive, any owner liveness | `failed_to_stop` | `failed_to_stop` immediately; do not join active promise | none; this row precedes active-map classification and caller invokes stop until it reports orphaned/blocked or settlement proves ownership gone |
| running | this coordinator active map, status other than `failed_to_stop` | `active` | wait captured promise, then classify reread state | await none |
| running manual | no active entry, `execution` absent | `manual_running` | `manual_running` | none; parent uses update to complete, fail, or block |
| running malformed executable | no active entry, `execution` present but invalid | `ownership_unknown` | `ownership_unknown` | none; after confirming no parent/worker owns it, caller updates state to blocked |
| running executable, status `running` or `stop_requested` | no active entry, owner PID live | `external_running` | `external_running` | none |
| running executable, status `running` or `stop_requested` | no active entry, owner PID dead/missing | `orphaned` | `orphaned` | none; caller invokes stop to persist blocked/orphaned |
| running executable, status `pending`, `stopped`, `completed`, `failed`, or `orphaned` | no active entry | `ownership_unknown` | `ownership_unknown` | none; valid metadata uses stop to reconcile, malformed metadata uses confirmed parent update |
| ownership metadata write failed and compensation succeeded | none; runner not started; durable state blocked | current call `start_failed` | later call `blocked` | no runner; retry only after normal blocked readiness rules |
| ownership metadata write failed and compensation failed | none; runner not started; durable state running/inconsistent | current call `start_failed` | later call `ownership_unknown` | valid metadata uses stop; otherwise confirm ownership and update blocked |
| failed executable with dependencies satisfied | none, prior execution status failed | `started` through existing retry transition | `terminal` until execute_many starts retry | execute only; retry count remains registry-owned |
| blocked executable with no unmet blockers | none | `started` | `blocked` until execute_many starts it | execute only |
| completed/cancelled/skipped | none | `terminal` | `terminal` | none |
| any same-coordinator active record when wait signal aborts | this coordinator | `active` | `aborted` unless already settled | none |

Model-visible multi-task content is `{ outcome, count, results: [{ id, classification, state?, error?, outputPath? }] }`. Every response must preserve all supplied IDs, classifications, request order, and valid JSON within 4,096 UTF-8 bytes. Build and serialize the mandatory base envelope first with `{ id, classification, state? }` only; the one-to-eight ID and enum bounds must prove that base always fits. Add optional fields in two deterministic request-order passes: authorized `outputPath` values first, then errors already limited to 200 Unicode code points. For each optional field, try the full value, measure the complete serialized envelope with `Buffer.byteLength(json, "utf8")`, and, when needed, use code-point-safe binary search for the largest prefix plus `...` that keeps the complete envelope within 4,096 bytes. Omit the field when even `...` does not fit. Never remove or truncate IDs, classifications, or result entries, and assert the final serialized byte length before returning. Full authorized values remain available only in typed `details`, subject to renderer bounds.

`outputPath` appears only for authorized terminal records with a persisted artifact. For `execute_many`, top-level `outcome` is `accepted` when every ID starts, `partial` when at least one starts and at least one does not, and `rejected` when none start. For `await`, top-level `outcome` is `persisted` when the requested classifications are returned and `aborted` when the wait signal interrupts at least one active join. Missing, foreign, manual, blocked, and external classifications are normal per-ID results, not thrown tool errors.

Classification precedence is: missing, foreign workspace, non-running task state, running `failed_to_stop`, active-map ownership, then running-record execution shape/status/owner liveness. This makes the table total over every `TaskExecutionStatus` and over absent or malformed optional execution metadata. The exported result union must use these exact classification strings. V1 confirms the Public Action Contract and truth table remain internally consistent before integration starts.

## Explicit Deferrals

- Automatic scheduling of newly ready tasks after each completion.
- Durable claims, leases, self-claiming workers, and restartable execution queues.
- Cursor pagination for `list` and `ready` beyond the current bounded collection.
- Worker-to-worker messaging, mailboxes, or direct teammate coordination.
- Configurable concurrency scheduling. The MVP accepts at most eight IDs and starts all eligible supplied tasks.
- Cross-process waiting or execution ownership recovery.
- Crash-atomic batch transactions, journals, rollback, or startup reconciliation. Revisit only after interrupted batch recovery is observed; until then use explicit `write_failed` behavior.
- Absolute-path hiding or removal of custom executable task working directories. Existing behavior remains, but foreign-workspace IDs cannot trigger it through new actions.
- Broad credential-format or sanitizer redesign. Test only fields newly exposed by the new envelopes.
- New durable queue or claim states.
- Broad task-registry schema migration unless implementation proves one unavoidable.

## Project Context

- **Language**: TypeScript 5.9, ESM, TypeBox, Vitest
- **Test command**: `cd pi && pnpm test <test-file>.test.ts`; focused Pi gate is `make check-pi-extensions`; repository completion gates are `make check` and truth-preserving root `make test-ci`
- **Lint command**: `cd pi && pnpm exec biome check <changed TypeScript files>`
- **Runtime dependency setup**: `scripts/pi-deps-link-setup` links globally installed runtime packages into `pi/node_modules`; tests fail explicitly when links are absent
- **Renderer contract**: `pi/lib/task-renderer.ts` currently handles `record`, `records`, and `output`

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight state | `git status --short --branch && test ! -e .git/MERGE_HEAD && test ! -d .git/rebase-merge && test ! -d .git/rebase-apply` | none | terminal output recorded in execution report |
| Repository/linker target | `test "$(cd "$(git rev-parse --show-toplevel)" && pwd -P)" = "$(cd "${HOME}/.dotfiles" && pwd -P)"` | none | active repository is the linker's hardcoded target |
| Dependency setup | Run Repository/linker target, then `cd pi && pnpm install --frozen-lockfile && cd .. && scripts/pi-deps-link-setup` | no credentials; globally installed Pi packages required | target assertion, linker output, and package existence check |
| Owned-path baseline | `mkdir -p .tmp && test ! -e .tmp/pi-task-dag-baseline.patch && git diff -- Makefile CHANGELOG.md pi/AGENTS.md pi/PI-INSTRUCTIONS.md pi/README.md pi/extensions/tasks.ts pi/extensions/tasks/execution.ts pi/lib/task-registry.ts pi/lib/task-renderer.ts pi/lib/workflow-friction.ts pi/tests/task-registry.test.ts pi/tests/task-dependencies.test.ts pi/tests/task-tools.test.ts pi/tests/task-execution.test.ts pi/tests/task-renderer.test.ts pi/tests/tasks.test.ts pi/tests/workflow-friction.test.ts > .tmp/pi-task-dag-baseline.patch && test -f .tmp/pi-task-dag-baseline.patch` | none | immutable pre-mutation patch referenced by checklist evidence |
| Dependency existence | `for p in pi/node_modules/@earendil-works/pi-coding-agent pi/node_modules/@earendil-works/pi-agent-core pi/node_modules/@earendil-works/pi-ai pi/node_modules/@earendil-works/pi-tui pi/node_modules/@sinclair/typebox; do test -e "$p" || { printf 'missing runtime package: %s\n' "$p"; exit 1; }; done` | none | all five paths exist or command exits nonzero |
| Focused registry verification | `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts` | none | Vitest output |
| Focused integration verification | `cd pi && pnpm test task-tools.test.ts task-execution.test.ts task-renderer.test.ts tasks.test.ts workflow-friction.test.ts` | none | Vitest output |
| Type verification | `cd pi && pnpm run typecheck` | none | TypeScript exit status |
| Targeted lint | `cd pi && pnpm exec biome check extensions/tasks.ts extensions/tasks/execution.ts lib/task-registry.ts lib/task-renderer.ts tests/task-registry.test.ts tests/task-dependencies.test.ts tests/task-tools.test.ts tests/task-execution.test.ts tests/task-renderer.test.ts lib/workflow-friction.ts tests/workflow-friction.test.ts` | none | Biome exits 0 with no diagnostics |
| Repository focused Pi verification | `make check-pi-extensions` | none after dependency setup | relinking, typecheck, and complete Pi Vitest output |
| Repository completion verification | `make check && make test-ci` | none | aggregate lint/tests/Pi output plus independently truth-preserving root pytest exit status |
| Diff verification | `bash -c 'status=0; git diff --check || status=$?; git diff --stat || status=$?; git status --short --branch || status=$?; exit "$status"'` | none | whitespace result plus changed-path inventory even on failure |
| Checklist ledger verification | `python -c 'import re,sys; s=open(sys.argv[1], encoding="utf-8").read(); expected=["T0","V0","T1","T2","V1","T3","V2","T4","V3","F1","F2","F3","F4","F5"]; markers=re.findall(r"^- \[[ x]\] ([TVF][0-9]+):",s,re.M); blocks=re.findall(r"^- \[x\] ([TVF][0-9]+):[^\n]*\n  - Status: ([^\n]+)\n  - Evidence: ([^\n]+)$",s,re.M); table=re.findall(r"^\| ([TVF][0-9]+) \|",s,re.M); details=re.findall(r"^\*\*([TVF][0-9]+): .+\*\*",s,re.M); assert markers==expected==table==details; assert len(blocks)==len(expected) and [x[0] for x in blocks]==expected; assert all(x[1]=="complete" and x[2].strip()!="--" for x in blocks); assert len(re.findall(r"^  - Status:",s,re.M))==len(expected)==len(re.findall(r"^  - Evidence:",s,re.M))' <plan-path>` | none | exact 14-ID checklist, task-table, and executable-section sets match; every ID has one checked block, one complete status, and one non-placeholder evidence value |
| Deploy | `not applicable` | none | no deployment |
| Source rollback | Use checklist-recorded owned hunks to apply targeted inverse edits only; then write the same exact owned-path `git diff` to `.tmp/pi-task-dag-rollback.patch` and run `cmp .tmp/pi-task-dag-baseline.patch .tmp/pi-task-dag-rollback.patch` before rerunning focused/full gates | none | byte-identical baseline patch proves all pre-existing hunks were preserved |
| Dependency-link recovery | Restore missing global runtime packages, rerun `scripts/pi-deps-link-setup`, then run the Dependency existence command; if a target is a non-link, stop and report that exact path rather than deleting it | none | linker output and five verified paths |

## Dependency Truth Table

| Dependency | Exists before use | Evidence |
|------------|-------------------|----------|
| Pi package scripts | yes | `pi/package.json` defines `typecheck` and `test` |
| Runtime package linker | yes | `scripts/pi-deps-link-setup`; dependency existence command prevents silent skip |
| Canonical Pi wrapper | exists, corrected by T3 | `Makefile` defines `check-pi-extensions`; T3 adds linker execution after its frozen install before typecheck/tests |
| Optional execution records | yes | `TaskRecordV1.execution` is optional in `pi/lib/task-registry.ts` |
| Dependency readiness | yes | `getUnmetBlockers`, `isTaskReady`, and `partitionReadyTasks` exist |
| Background lifecycle | yes | coordinator start, stop, output, orphan reconciliation, and shutdown exist |
| Compact results | yes | compact operation and collection helpers exist in `pi/extensions/tasks.ts` |
| Renderer details | yes, limited | `formatTaskToolResult` supports `record`, `records`, and `output`; T3 extends only if selected envelope needs it |
| Focused test seams | yes | injectable runner and mock Pi/context helpers exist |
| Workflow-friction execution predicate | yes, extended by T3 | `isTaskExecutionTrace` recognizes single `execute`; T3 adds `execute_many` as one invocation and leaves `await` excluded |
| Planned graph batch helper | no, created by T1 | T3 is blocked by V1 |
| Planned multi-start/wait and public actions | no, created together by T3 | exact workflow T4 is blocked by V2 |

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Prepare and verify Pi runtime dependencies | -- | setup | small | coding-light | -- |
| V0 | Validate execution preflight | -- | validation | small | validator | T0 |
| T1 | Add prospective mixed-DAG batch creation | 3 | feature | medium | typescript-pro | V0 |
| T2 | Correct durable task guidance for main-thread use | 2 | mechanical | small | coding-light | V0 |
| V1 | Validate registry graph creation, public contract, and guidance | -- | validation | medium | validator | T1, T2 |
| T3 | Implement bounded fan-out, wait, workspace, renderer, and canonical validation contracts | 9 | architecture | large | coding-heavy | V1 |
| V2 | Validate coordinator and public tool integration | -- | validation | large | validator-heavy | T3 |
| T4 | Prove the exact mixed manual and subagent workflow | 3 | feature | medium | coding-medium | V2 |
| V3 | Validate the complete MVP workflow and documentation | -- | validation | medium | validation-lead | T4 |
| F1 | Task-specific verification complete | -- | validation | medium | validator | V3 |
| F2 | Repo-wide validation complete | -- | validation | medium | validator | F1 |
| F3 | Manual validation not required or completed | -- | validation | small | coding-light | F2 |
| F4 | Deployment validation complete or not required | -- | validation | small | coding-light | F3 |
| F5 | Archive preflight complete | -- | validation | small | coding-light | F4 |

## Execution Waves

### Wave 0

**T0: Prepare and verify Pi runtime dependencies** [small] -- coding-light
- Description: Capture current repository state and an exact baseline patch for all plan-owned tracked paths, fail on an unresolved merge/rebase or wrong linker target, install frozen Pi development dependencies, run the runtime-package linker, and verify every required runtime package path before implementation edits.
- Files: none tracked; `pi/node_modules`, link targets, and named `.tmp/pi-task-dag-*` evidence files may change.
- Mutation boundary: Dependency installation/links under `pi/node_modules`, named scratch evidence under `.tmp`, and checklist evidence. Do not modify tracked source.
- Acceptance Criteria:
  1. [ ] Repository state, host tools, exact owned-path baseline, and unrelated changes are recorded before implementation.
     - Verify: `git status --short --branch && test ! -e .git/MERGE_HEAD && test ! -d .git/rebase-merge && test ! -d .git/rebase-apply && for cmd in git bash file date node pnpm make uv shellcheck rg grep cp diff cmp mv rm mkdir ln readlink find sort head tail basename dirname python; do command -v "$cmd" >/dev/null || { printf 'missing host tool: %s\n' "$cmd"; exit 1; }; done && if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || -n "${WINDIR:-}" ]]; then command -v cygpath >/dev/null && command -v cmd >/dev/null || exit 1; fi` then run Repository/linker target from Automation Plan.
     - Pass: Status is captured, no merge/rebase marker exists, every executable used by focused, aggregate, linker, diff, and archive commands is available for the active platform, and the active checkout is `${HOME}/.dotfiles`.
     - Fail: Stop before source mutation and resolve repository state or the named missing host tool outside this plan.
  2. [ ] The pre-mutation patch for every plan-owned tracked path is durable scratch evidence.
     - Verify: Run Owned-path baseline from Automation Plan and record `.tmp/pi-task-dag-baseline.patch` in T0 evidence.
     - Pass: The file exists before T1/T2 and is not overwritten during execution.
     - Fail: Stop before source mutation; do not infer the baseline from a later aggregate diff.
  3. [ ] Frozen dependencies and all runtime links exist.
     - Verify: Run Dependency setup and Dependency existence commands from Automation Plan.
     - Pass: Both commands exit 0 and all five paths exist.
     - Fail: Stop before T1/T2; restore missing global packages and rerun the idempotent linker. If any target is a non-link, report that exact path and do not delete it.

### Wave 0 -- Validation Gate

**V0: Validate execution preflight** [small] -- validator
- Blocked by: T0
- Checks:
  1. Re-run dependency existence command without reinstalling.
  2. Confirm `pi/package.json`, `pi/pnpm-lock.yaml`, `scripts/pi-deps-link-setup`, and `Makefile` exist.
  3. Confirm the recorded unrelated changed-path inventory and `.tmp/pi-task-dag-baseline.patch` reference are present in checklist evidence.
- Mutation boundary: Checklist evidence only.
- On failure: Keep T1/T2 blocked and record the missing prerequisite.

### Wave 1 (parallel)

**T1: Add prospective mixed-DAG batch creation** [medium] -- typescript-pro
- Blocked by: V0
- Description: Add a registry-owned batch operation that generates durable UUIDs, validates the complete prospective graph before writes, writes every new record with authoritative forward `blockedBy` edges, then reconciles derived reverse `blocks` edges from the full graph. Local keys exist only for request-time resolution.
- Files: `pi/lib/task-registry.ts`, `pi/tests/task-registry.test.ts`, `pi/tests/task-dependencies.test.ts`
- Mutation boundary: Batch types/helpers, a narrow injectable filesystem seam for failure tests if needed, and focused tests. Do not change lifecycle states, single-task creation, tombstones, readiness, or legacy import.
- Alternative: Create then patch dependencies. Rejected because deterministic errors would follow partial logical creation and require extra context.
- Acceptance Criteria:
  1. [ ] Valid batches mix manual and executable records, same-request keys, and existing current-workspace UUID blockers.
     - Verify: `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts`
     - Pass: Forward and reverse edges match for topological and reverse declaration order.
     - Fail: Any edge differs by declaration order or single-create behavior changes.
  2. [ ] Duplicate keys, duplicate resolved IDs, unknown keys, unknown/tombstoned/foreign existing blockers, self-dependencies, and cycles fail before the first write.
     - Verify: `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts`
     - Pass: Every deterministic invalid batch leaves isolated task count and existing records unchanged.
     - Fail: Any deterministic validation failure persists or rewrites a record.
  3. [ ] I/O failure is explicit, locatable, and recoverable through existing public mutations without claiming rollback.
     - Verify: `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts`
     - Pass: Each injected write/rename phase returns bounded `operationId`, `failedPhase`, generated aliases/IDs, and ordered `persistedIds`; no success result is produced; forward edges remain readable and conservative; clearing dependencies then tombstoning persisted IDs restores affected existing reverse edges and leaves no active partial batch record.
     - Fail: Partial records cannot be identified, failure is reported as success, recovery requires a broad scan, forward records are unreadable, or a dependent becomes ready incorrectly.

**T2: Correct durable task guidance for main-thread use** [small] -- coding-light
- Blocked by: V0
- Description: State that task records are optional and valid for user-requested lists, main-thread tracking, dependencies, cross-turn work, and background execution. Ordinary multi-step work does not automatically require records; lifecycle changes occur only when state changes and public task actions are not polled.
- Files: `pi/AGENTS.md`, `pi/PI-INSTRUCTIONS.md`
- Mutation boundary: Replace only task-use guidance paragraphs; preserve unrelated edits. After editing, write the exact owned-path diff to `.tmp/pi-task-dag-after-t2.patch`, run `bash -c 'status=0; diff -u .tmp/pi-task-dag-baseline.patch .tmp/pi-task-dag-after-t2.patch || status=$?; test "$status" -le 1'`, and record the T2-owned hunks in checklist evidence.
- Acceptance Criteria:
  1. [ ] Guidance permits durable main-thread-only lists without requiring tasks for every plan.
     - Verify: `rg -n "task|durable|main-thread|poll" pi/AGENTS.md pi/PI-INSTRUCTIONS.md`
     - Pass: Both files distinguish optional prose from durable main-thread, dependency, cross-turn, and background use.
     - Fail: Guidance remains binary, mandatory, or polling-oriented.

### Wave 1 -- Validation Gate

**V1: Validate registry graph creation, public contract, and guidance** [medium] -- validator
- Blocked by: T1, T2
- Checks:
  1. Run preflight state, dependency setup, and dependency existence commands.
  2. Run every T1 and T2 acceptance command.
  3. `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts tasks.test.ts` -- all pass.
  4. `cd pi && pnpm exec biome check lib/task-registry.ts tests/task-registry.test.ts tests/task-dependencies.test.ts` -- no diagnostics.
  5. Inspect Public Action Contract and Wait Truth Table and confirm every classification uses the exact exported vocabulary and has one caller action.
  6. Inspect the focused diff and confirm unrelated shared-file blocks remain intact.
- Mutation boundary: Validation and deterministic plan-contract corrections only; no implementation outside T1/T2 paths.
- Alternative: Defer contract resolution to T3. Rejected because T3 is a large integration task and must begin from one validated vocabulary.
- On failure: Add one focused fix task, preserve passing work, and rerun V1 before Wave 2.

### Wave 2

**T3: Implement bounded fan-out, wait, workspace, renderer, and canonical validation contracts** [large] -- coding-heavy
- Blocked by: V1
- Description: Implement `startMany` and race-safe `wait`, expose `execute_many` and `await` in the unified tool, enforce current-workspace ownership, preserve compact provider content, render the positional results envelope, reject direct restart of `failed_to_stop` for both legacy and multi-ID execute paths, recognize `execute_many` as one task-execution invocation in workflow-friction metrics without counting `await`, and make the canonical Pi validation target relink runtime packages after its frozen install. Use the exact Public Action Contract and Wait Truth Table validated by V1.
- Files: `pi/extensions/tasks.ts`, `pi/extensions/tasks/execution.ts`, `pi/lib/task-renderer.ts`, `pi/lib/workflow-friction.ts`, `pi/tests/task-tools.test.ts`, `pi/tests/task-execution.test.ts`, `pi/tests/task-renderer.test.ts`, `pi/tests/workflow-friction.test.ts`, `Makefile`
- Mutation boundary: New action schemas/routing, coordinator fan-out/wait and ownership compensation, mandatory renderer support, extending only the workflow-friction task-execution action predicate and focused tests, splitting the existing combined frozen-install/typecheck recipe line in `check-pi-extensions` plus inserting exactly one linker command between install and typecheck, and focused tests. Do not change runner transport, stop timeout, telemetry event count, orphan reconciliation, shutdown, existing output bounds, or unrelated Make targets. The legacy `execute` path changes only to reject `failed_to_stop` until explicit stop/orphan reconciliation proves the prior owner is gone.
- Alternative: Separate coordinator and public tool waves. Rejected because exact signal, ownership, details-envelope, and renderer contracts are one integration boundary and splitting them caused prerequisite ambiguity.
- Trend bias: This task extends the unified task/coordinator pattern. A separate scheduler fits only when claims, cross-process ownership, or autonomous graph advancement become required.
- Acceptance Criteria:
  1. [ ] Public TypeBox schema and runtime validation expose every new field/action, cap graph batch at 16 tasks, and enforce one to eight unique execution IDs while preserving unknown-property compatibility.
     - Verify: `cd pi && pnpm test task-tools.test.ts`
     - Pass: Registered schema tests, 16-task alias response, and malformed/duplicate/over-limit calls match the Public Action Contract and 4,096-byte bound.
     - Fail: Runtime accepts an unadvertised shape, provider schema omits a field, batch or ID bounds differ, or a valid response exceeds the byte cap.
  2. [ ] Concurrent start uses controlled runner barriers and preserves lifecycle, readiness, workspace, and ownership.
     - Verify: `cd pi && pnpm test task-execution.test.ts task-tools.test.ts`
     - Pass: All eligible runner entries occur before release; no-workspace and matching-workspace records run; foreign records are filtered before coordinator calls; mixed requests preserve order; blocked/manual/foreign/failed-to-stop IDs do not mutate or invoke runners; ownership-write failure starts no runner, compensates state, and returns `start_failed`; each started ID settles once.
     - Fail: Starts serialize, dependencies are bypassed, a foreign task reaches the coordinator, ownership failure starts a runner or leaves unexplained running state, or stale metadata is overwritten.
  3. [ ] Wait is event-driven, deterministic, idempotent, workspace-safe, and abort-safe.
     - Verify: `cd pi && pnpm test task-execution.test.ts task-tools.test.ts`
     - Pass: No-workspace, matching, foreign, and mixed workspace rows; request ordering; every truth-table row; completion races; already-aborted and mid-wait abort; repeated await; one post-abort runner resolution and one rejection all pass without polling timers or unhandled rejection.
     - Fail: Wait hangs, polls, calls coordinator for foreign IDs, cancels a worker, loses/rejects an unhandled settlement, changes task state, or returns nondeterministic order.
  4. [ ] Model-visible and TUI contracts remain bounded and useful.
     - Verify: `cd pi && pnpm test task-tools.test.ts task-renderer.test.ts`
     - Pass: Mandatory IDs/classifications/order always remain in valid JSON; deterministic two-pass optional-field budgeting keeps every new or extended action at or below 4,096 UTF-8 bytes for eight Unicode errors and eight long artifact paths without splitting code points; positional details omit records for missing/foreign IDs; every classification and authorized artifact path renders in mixed output capped at 4,096 UTF-8 bytes compact and 16,384 UTF-8 bytes expanded.
     - Fail: Prompts, notes, timestamps, execution prompts, worker output, foreign records, full errors, or unbounded arrays enter content/details incorrectly, or classifications disappear in the TUI.
  5. [ ] Existing retry, cancellation, orphan, shutdown, output, and `failed_to_stop` behavior remains truthful through one shared lifecycle policy.
     - Verify: `cd pi && pnpm test task-tools.test.ts task-execution.test.ts tasks.test.ts`
     - Pass: Command, tool-update/stop, legacy execute, execute_many, and coordinator paths delegate lifecycle decisions to `TaskLifecycleService` and its registry/coordinator delegates; parity fixtures cover blocked starts, skip reasons, retries, active cancellation, and failed-to-stop preservation; legacy execute and execute_many both reject `failed_to_stop`; active-plus-failed-to-stop and later inactive-plus-failed-to-stop fixtures both classify `failed_to_stop`; await does not join the timed-out active promise; explicit stop reports still-live or reconciles dead ownership to orphaned/blocked before a later start; stale runner settlement cannot overwrite a new attempt; all existing assertions pass.
     - Fail: Any public path duplicates lifecycle policy, parity fixtures diverge, wait abort behaves like stop, failed-to-stop restarts directly, or stale settlement overwrites ownership.
  6. [ ] Workflow-friction metrics recognize DAG fan-out without treating joins as new execution.
     - Verify: `cd pi && pnpm test workflow-friction.test.ts`
     - Pass: A `task` trace with `action: "execute_many"` increments the existing invocation-level `subagentCount` once; `execute` remains unchanged; `await`, `batch`, and other task actions do not increment it; per-worker counts remain owned by orchestration-run telemetry.
     - Fail: Fan-out remains invisible, one fan-out call is counted as multiple invocation traces, a join is counted as execution, or existing direct execution metrics change.
  7. [ ] Canonical Pi validation relinks runtime packages after frozen install.
     - Verify: Run `make -n check-pi-extensions > .tmp/check-pi-extensions.commands && python -c 'import sys; s=open(sys.argv[1], encoding="utf-8").read(); terms=["pnpm install --frozen-lockfile", "scripts/pi-deps-link-setup", "pnpm run typecheck", "pnpm test"]; pos=[s.index(x) for x in terms]; assert pos == sorted(pos)' .tmp/check-pi-extensions.commands`, then run `make check-pi-extensions && for p in pi/node_modules/@earendil-works/pi-coding-agent pi/node_modules/@earendil-works/pi-agent-core pi/node_modules/@earendil-works/pi-ai pi/node_modules/@earendil-works/pi-tui pi/node_modules/@sinclair/typebox; do test -e "$p" || exit 1; done`
     - Pass: The target runs frozen install, then `scripts/pi-deps-link-setup`, then typecheck and full Vitest against that linked state; all five paths still exist afterward.
     - Fail: Linker runs before install, is absent, silently skips a package, any path is absent after the target, or the target exits nonzero.

### Wave 2 -- Validation Gate

**V2: Validate coordinator and public tool integration** [large] -- validator-heavy
- Blocked by: T3
- Checks:
  1. Run all T3 acceptance commands.
  2. `cd pi && pnpm test task-tools.test.ts task-execution.test.ts task-renderer.test.ts task-dependencies.test.ts task-registry.test.ts tasks.test.ts workflow-friction.test.ts` -- all task suites pass.
  3. `cd pi && pnpm run typecheck` -- exits 0.
  4. Run targeted Biome command from Automation Plan -- no diagnostics.
  5. Verify the exact public handler passes its signal only to `await`, workspace checks occur before coordinator calls, and abort never calls `stop`.
  6. Verify mandatory multi-result fields always survive, optional paths are budgeted before errors in request order, complete serialized envelopes use UTF-8 byte measurement, truncation is code-point-safe, and worst-case eight-result Unicode/path fixtures remain valid JSON at or below 4,096 bytes.
- Mutation boundary: Validation only, except checklist evidence updates.
- Alternative: Unit tests only. Rejected because schema, coordinator, signal, workspace, renderer, and provider envelopes meet at the public handler.
- On failure: Stop Wave 3, isolate one boundary, add one repair task, and rerun V2.

### Wave 3

**T4: Prove the exact mixed manual and subagent workflow** [medium] -- coding-medium
- Blocked by: V2
- Description: Add one behavioral test using an isolated registry and controlled runner barriers. Create a representative graph with an initial manual task, two executable tasks blocked by it, and a downstream manual task blocked by both workers. Advance the first manual task through `running` to `completed`, call `ready` once, launch both workers with `execute_many`, call `await` once, confirm artifacts and terminal states, call `ready` once, then advance the downstream manual task through `running` to `completed`. Update user-facing documentation and changelog through targeted edits.
- Files: `pi/tests/task-tools.test.ts`, `pi/README.md`, `CHANGELOG.md`
- Mutation boundary: One end-to-end behavioral test, targeted README edits, and an append-only changelog entry inserted without replacing existing entries. Write the exact owned-path diff to `.tmp/pi-task-dag-after-t4.patch`, compare it with `.tmp/pi-task-dag-baseline.patch` using the same status-preserving `diff -u` pattern, record T4-owned hunks in checklist evidence, preserve every unrelated hunk, and avoid exact-whitespace assertions.
- Alternative: Rely on unit tests. Rejected because the requested contract is the exact mixed parent/subagent sequence.
- Acceptance Criteria:
  1. [ ] The public workflow completes without public action polling and preserves manual ownership.
     - Verify: `cd pi && pnpm test task-tools.test.ts`
     - Pass: An action spy observes exactly `batch`, two initial manual lifecycle updates, one `ready`, `execute_many`, one `await`, one `ready`, and two final manual lifecycle updates; every later ID comes from the batch response alias mapping; aliases cover every request key; zero `list`, `get`, and `output` actions; no polling timer; both runner entries precede release; final graph is complete.
     - Fail: Extra public reads are required, workers serialize, a manual task starts, or downstream readiness is wrong.
  2. [ ] Abort remains distinct from stop in the public workflow.
     - Verify: `cd pi && pnpm test task-tools.test.ts task-execution.test.ts`
     - Pass: Abort occurs while two runners are pending, wait returns promptly, worker controllers remain live, both later settle normally once, and artifacts/telemetry persist.
     - Fail: Abort cancels work, leaves an unhandled rejection, or loses later completion.
  3. [ ] Documentation presents optional durable main-thread lists, mixed graphs, bounded fan-out, one-shot wait, and explicit non-transactional I/O failure.
     - Verify: `rg -n "main-thread|mixed|execute_many|await|write_failed|poll" pi/README.md pi/AGENTS.md pi/PI-INSTRUCTIONS.md`
     - Pass: All surfaces agree and do not imply every plan needs durable tasks.
     - Fail: Guidance is binary, omits the no-poll flow, or overclaims crash atomicity.

### Wave 3 -- Validation Gate

**V3: Validate the complete MVP workflow and documentation** [medium] -- validation-lead
- Blocked by: T4
- Checks:
  1. Run every T4 acceptance command.
  2. Run all focused task suites, typecheck, targeted Biome, and `git diff --check`.
  3. Inspect lifecycle parity for retry, blocked starts, cancellation, orphan reconciliation, shutdown, output, and `failed_to_stop`.
  4. Inspect documentation and changelog diffs for preservation of unrelated edits.
- Mutation boundary: Validation only, except checklist evidence updates.
- Alternative: Proceed directly to broad suite. Rejected because focused diagnosis must pass first.
- On failure: Keep final gates blocked, add one focused repair task, rerun affected gate, then rerun V3.

## Final Gates

**F1: Task-specific verification complete** [medium] -- validator
- Blocked by: V3
- Mutation boundary: Validation only, except checklist evidence.
- Verify: `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts task-tools.test.ts task-execution.test.ts task-renderer.test.ts tasks.test.ts && pnpm run typecheck`
- Pass: All focused suites and typecheck exit 0 after final source edit.
- Fail: Add a focused fix task and rerun affected wave gate.
- Alternative: Trust prior wave results. Rejected because later integration/docs edits can invalidate evidence.

**F2: Repo-wide validation complete** [medium] -- validator
- Blocked by: F1
- Mutation boundary: Frozen pnpm install may update `pi/node_modules`; tracked source remains unchanged except checklist evidence.
- Verify: `make check && make test-ci && for p in pi/node_modules/@earendil-works/pi-coding-agent pi/node_modules/@earendil-works/pi-agent-core pi/node_modules/@earendil-works/pi-ai pi/node_modules/@earendil-works/pi-tui pi/node_modules/@sinclair/typebox; do test -e "$p" || exit 1; done`
- Pass: Repository aggregate lint/tests, independently truth-preserving root pytest, frozen Pi install/relink, typecheck, complete Pi Vitest suite, and post-target package checks all exit 0.
- Fail: Do not archive; root-cause changed-boundary failures and record unrelated failures separately only when they do not invalidate the workflow.
- Alternative: Pi-focused suites only. Rejected because this plan changes root/shared files and repository completion requires `make check`.

**F3: Manual validation not required or completed** [small] -- coding-light
- Blocked by: F2
- Mutation boundary: Checklist evidence only.
- Verify: Record that automated mixed-DAG, workspace, cancellation, type, lint, and full-suite evidence passed.
- Pass: `Required: no` remains justified.
- Fail: If implementation introduces destructive, external, paid, secret, hardware, or subjective risk, amend plan before archive.

**F4: Deployment validation complete or not required** [small] -- coding-light
- Blocked by: F3
- Mutation boundary: Checklist evidence only.
- Verify: Confirm no deployment or external runtime mutation occurred.
- Pass: Record `not applicable`.
- Fail: Add deployment procedure and gate before archive.

**F5: Archive preflight complete** [small] -- coding-light
- Blocked by: F4
- Mutation boundary: Update only this plan's frontmatter and Execution Status after all prior checklist items are checked and evidenced.
- Verify: Set frontmatter `status: complete`, Execution Status `status: complete`, `archive_status: ready`, and `completed_at` to the current ISO timestamp; run the Diff verification command from Automation Plan; then run `test -f .specs/pi-task-dag-runner/plan.md && test -d .specs/pi-task-dag-runner/review-1 && test -f .specs/pi-task-dag-runner/review-1/synthesis.md && test -f .specs/pi-task-dag-runner/review-1/standalone-readiness.md && rg -n '^Result: STANDALONE READY$' .specs/pi-task-dag-runner/review-1/standalone-readiness.md && rg -n '^status: complete$' .specs/pi-task-dag-runner/plan.md && rg -n '^- \*\*status:\*\* complete$' .specs/pi-task-dag-runner/plan.md && rg -n '^- \*\*archive_status:\*\* ready$' .specs/pi-task-dag-runner/plan.md && test ! -e .specs/archive/pi-task-dag-runner && test ! -e .specs/archive/.pi-task-dag-runner.tmp`.
- Pass: F1-F4 are checked with complete non-placeholder evidence, all status fields read back independently, the readiness artifact says `STANDALONE READY`, intended and preserved unrelated edits are identified, active plan plus required review artifacts exist, and final/temporary archive targets are absent.
- Fail: Keep `archive_status: active`, record the blocker, and do not copy or move anything.

## Dependency Graph

```text
Wave 0: T0 -> V0
Wave 1: T1, T2 (parallel) -> V1
Wave 2: T3 -> V2
Wave 3: T4 -> V3
Final:  V3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] One graph-aware batch of at most 16 tasks creates a valid mixed manual/executable graph with same-request dependencies and actionable compact key-to-ID output.
   - Verify: `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts task-tools.test.ts`
   - Pass: Valid graphs persist declaration-order-independent edges; every later workflow action uses IDs from returned aliases without a read call; deterministic invalid graphs write nothing; I/O failure identifies generated/persisted IDs and the recovery sequence restores derived edges.
2. [ ] The exact public workflow runs two ready subagents concurrently and joins them once while manual tasks remain parent-owned.
   - Verify: `cd pi && pnpm test task-tools.test.ts task-execution.test.ts`
   - Pass: Action sequence, runner barrier, one await, abort ownership, terminal artifacts, downstream readiness, and no polling timer assertions pass.
3. [ ] New actions enforce workspace, ownership, provider-size, and TUI-detail contracts.
   - Verify: `cd pi && pnpm test task-tools.test.ts task-execution.test.ts task-renderer.test.ts`
   - Pass: Every truth-table row and content/details assertion passes.
4. [ ] Existing behavior remains compatible and every public lifecycle surface remains policy-equivalent.
   - Verify: `cd pi && pnpm test task-registry.test.ts task-dependencies.test.ts task-tools.test.ts task-execution.test.ts task-renderer.test.ts tasks.test.ts workflow-friction.test.ts`
   - Pass: Lifecycle, retry, cancellation, orphan, shutdown, output, workspace, legacy, renderer, and execution-invocation metrics tests pass; command, tool-update/stop, and execution parity regressions prove the shared lifecycle policy remains authoritative.
5. [ ] Complete repository surface remains healthy.
   - Verify: Run the exact F2 `make check && make test-ci` plus post-target package existence command.
   - Pass: Aggregate checks, independently truth-preserving root pytest, Pi relinking, typecheck, complete Pi Vitest, and all package checks exit 0.
6. [ ] Guidance permits optional durable main-thread lists without requiring tasks for ordinary plans.
   - Verify: `rg -n "main-thread|mixed|durable|poll" pi/README.md pi/AGENTS.md pi/PI-INSTRUCTIONS.md`
   - Pass: All surfaces agree on optional durable use and no-poll discipline.

## Validation Contract

`/do-it` must satisfy this contract before reporting completion or archiving.

### Automation completeness

- Required: yes.
- Run dependency setup and existence verification once before focused validation.
- All agent-runnable validation uses documented commands and existing wrappers.
- No credentials are required. Missing globally installed runtime packages are an unavailable prerequisite and must fail preflight explicitly.
- Rollback is target-scoped inverse editing because shared files have unrelated changes.

### Required automated validation

1. [ ] Run dependency setup and verify all five runtime package paths.
   - Command: use exact Dependency setup and Dependency existence commands from Automation Plan.
   - Pass: linker exits 0 and all paths exist.
   - Fail: stop before implementation validation; do not treat linker's silent skip as success.
2. [ ] Run every task-specific command.
   - Command: focused registry, integration, typecheck, Biome, and diff commands above.
   - Pass: all acceptance criteria pass.
   - Fail: add one focused fix task and rerun affected gates.
3. [ ] Run strongest repo-wide validation.
   - Command: use the exact F2 command, including post-target package existence checks.
   - Pass: `make check`, independently truth-preserving `make test-ci`, frozen install, runtime relinking, typecheck, complete Pi tests, and all package checks exit 0 with no task-boundary errors or warnings.
   - Fail: do not archive; record failing command and next fix.

### Manual validation

- Required: no.
- Justification: Automated validation is sufficient for reversible local repository work.
- Steps:
  1. None.

### Deployment validation

- Required: no.
- Procedure: None.

### Telemetry & Evidence Contract

Use existing plan and runtime evidence surfaces; do not create plan-specific telemetry scripts.

- `episode_id`: active execution/session identifier when emitted; otherwise `not emitted`.
- `phase_id`: `wave-0`, `wave-1`, `wave-2`, `wave-3`, or `final-gates`.
- `task_id`: exact checklist ID `T0` through `T4`, `V0` through `V3`, or `F1` through `F5`.
- `validation_command`: exact acceptance or gate command.
- `status`: `pending`, `in_progress`, `passed`, `failed`, `blocked`, or `skipped` with reason.
- `archive_status`: `active`, then `ready`, then `archived` only after relocation.
- `started_at` and `completed_at`: record when existing execution status supports them; do not add a writer solely for these fields.
- Non-secret evidence: this plan, review artifacts, normal diffs, and test output referenced by execution report.
- Task output artifacts, prompts, worker transcripts, credentials, provider tokens, and unredacted output are not copied into plan/review/archive evidence.
- New action tests must prove prompts, notes, timestamps, usage, execution prompts, worker output, and unbounded errors do not enter model-visible content.

### Archive rule

After F5 passes, `/do-it` marks F5 checked with evidence in the active plan. Only then may the post-checklist archive operation begin.

1. Preconditions: run Checklist ledger verification against the active plan, then `rg -n '^status: complete$' .specs/pi-task-dag-runner/plan.md && rg -n '^- \*\*archive_status:\*\* ready$' .specs/pi-task-dag-runner/plan.md && test -f .specs/pi-task-dag-runner/review-1/synthesis.md && test -f .specs/pi-task-dag-runner/review-1/standalone-readiness.md && rg -n '^Result: STANDALONE READY$' .specs/pi-task-dag-runner/review-1/standalone-readiness.md && test ! -e .specs/archive/pi-task-dag-runner && test ! -e .specs/archive/.pi-task-dag-runner.tmp`.
2. Copy and compare: `mkdir -p .specs/archive && cp -R .specs/pi-task-dag-runner .specs/archive/.pi-task-dag-runner.tmp && diff -qr .specs/pi-task-dag-runner .specs/archive/.pi-task-dag-runner.tmp`.
3. Update only `.specs/archive/.pi-task-dag-runner.tmp/plan.md` to `archive_status: archived`, then publish: `test ! -e .specs/archive/pi-task-dag-runner && mv .specs/archive/.pi-task-dag-runner.tmp .specs/archive/pi-task-dag-runner`.
4. Final archive checks: run Checklist ledger verification against the archived plan, then `test -f .specs/archive/pi-task-dag-runner/plan.md && test -f .specs/archive/pi-task-dag-runner/review-1/synthesis.md && test -f .specs/archive/pi-task-dag-runner/review-1/standalone-readiness.md && rg -n '^Result: STANDALONE READY$' .specs/archive/pi-task-dag-runner/review-1/standalone-readiness.md && rg -n '^status: complete$' .specs/archive/pi-task-dag-runner/plan.md && rg -n '^- \*\*archive_status:\*\* archived$' .specs/archive/pi-task-dag-runner/plan.md`.
5. Only after step 4 passes: `rm -rf -- .specs/pi-task-dag-runner && test ! -e .specs/pi-task-dag-runner`.

This relocation is the `/do-it` post-checklist archive state, not another checklist item. Recovery is target-scoped: (a) active plus a temporary copy and no final target - run `diff -qr` against active; if identical, remove only `.specs/archive/.pi-task-dag-runner.tmp` and restart step 1; if the temp already says archived, run ledger, readiness, complete-status, and archived-status checks against the temp and publish it only when all pass; (b) active plus a published final target - run step-4 checks and, if they pass, continue only step 5; otherwise preserve both and report the exact failed predicate; (c) verified final target plus partially remaining active path - continue only the exact step-5 removal; (d) mismatched or unprovable temp/final content - preserve all paths and stop. Never overwrite an archive target or remove an unverified copy.

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Checked means verified complete; unchecked means pending, in progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes verification and before starting dependent work. `/review-it` preserves checked state and never marks implementation or validation work complete.

### Wave 0

- [x] T0: Prepare and verify Pi runtime dependencies
  - Status: complete
  - Evidence: 2026-07-15T21:44:57Z wave-0 - repository/operation/tool/linker-target preflight passed; `.tmp/pi-task-dag-baseline.patch` captured; frozen pnpm install, runtime linker, and all five package existence checks passed.
- [x] V0: Validate execution preflight
  - Status: complete
  - Evidence: 2026-07-15 wave-0 gate - dependency existence recheck passed; `pi/package.json`, `pi/pnpm-lock.yaml`, linker, Makefile, baseline patch, and T0 evidence are present.

### Wave 1

- [x] T1: Add prospective mixed-DAG batch creation
  - Status: complete
  - Evidence: 2026-07-15 wave-1 - registry batch API and focused validation/recovery tests added in the three scoped files; parent rerun passed 2 files and 34 tests; focused diff and `git diff --check` inspected.
- [x] T2: Correct durable task guidance for main-thread use
  - Status: complete
  - Evidence: 2026-07-15 wave-1 - only task-use paragraphs changed in `pi/AGENTS.md` and `pi/PI-INSTRUCTIONS.md`; `.tmp/pi-task-dag-after-t2.patch` captured; baseline comparison, rg guidance check, and diff check passed.
- [x] V1: Validate registry graph creation, public contract, and guidance
  - Status: complete
  - Evidence: 2026-07-15 wave-1 gate - initial Biome failure repaired; full rerun passed 3 files/54 tests, targeted Biome with no diagnostics, guidance rg, focused diff inspection, and diff check.

### Wave 2

- [x] T3: Implement bounded fan-out, wait, workspace, renderer, and canonical validation contracts
  - Status: complete
  - Evidence: 2026-07-15 wave-2 - execute_many/await, ownership/workspace/abort/budget/renderer/friction/Makefile contracts implemented; transient broad failures passed on rerun; final focused run passed 5 files/101 tests, typecheck, targeted Biome, diff check, Makefile order, and `make check-pi-extensions` with 93 files/1312 passed/1 skipped.
- [x] V2: Validate coordinator and public tool integration
  - Status: complete
  - Evidence: 2026-07-15 wave-2 gate - exact seven-suite run passed 7 files/135 tests after isolating workflow-friction storage; typecheck, targeted Biome, signal/workspace/abort handler inspection, content-budget tests, and diff check passed.

### Wave 3

- [x] T4: Prove the exact mixed manual and subagent workflow
  - Status: complete
  - Evidence: 2026-07-15 wave-3 - exact public mixed-DAG test added with lifecycle-correct manual updates; task-tools passed 26 tests and combined task-tools/execution passed 34 tests; docs rg, Biome, diff check, refreshed `.tmp/pi-task-dag-after-t4.patch`, README, and append-only changelog passed.
- [x] V3: Validate the complete MVP workflow and documentation
  - Status: complete
  - Evidence: 2026-07-15 wave-3 gate - all seven focused suites passed 136 tests; typecheck, targeted Biome, aggregate diff check, lifecycle regression coverage, and documentation consistency rg passed.

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: complete
  - Evidence: 2026-07-15 final gate - exact F1 command passed 6 files/101 tests and TypeScript typecheck after final source edits.
- [x] F2: Repo-wide validation complete
  - Status: complete
  - Evidence: 2026-07-15 final gate - `make check && make test-ci` exited 0: repository checks passed, Pi 93 files passed, root pytest 1203 passed/11 skipped, and all five linked runtime package checks passed.
- [x] F3: Manual validation not required or completed
  - Status: complete
  - Evidence: 2026-07-15 final gate - manual validation not required; automated mixed-DAG, workspace, abort/cancellation, lifecycle, type, lint, focused, and full-suite evidence passed for local reversible changes.
- [x] F4: Deployment validation complete or not required
  - Status: complete
  - Evidence: 2026-07-15 final gate - deployment not applicable; no external runtime or production mutation occurred.
- [x] F5: Archive preflight complete
  - Status: complete
  - Evidence: 2026-07-15 final gate - diff verification and all active-plan/review/readiness/complete/ready/no-collision predicates passed; archive publication prerequisites are satisfied.

## Handoff Notes

- Existing context compaction and lifecycle work is committed in `3139088` and `ef76ab6`; extend rather than replace it.
- `TaskRecordV1.execution` is optional. Do not add a second manual-task type.
- `execute_many` is bounded fan-out, not a scheduler. Do not add claims, leases, or autonomous advancement.
- `await` is a same-coordinator event-driven join. It classifies external running work rather than polling.
- Registry `startTask` already checks unmet blockers; preserve that source of truth.
- Forward `blockedBy` is authoritative for readiness; reverse `blocks` is derived inspection data.
- First failing source mutation or focused test blocks later waves until repaired and revalidated.
- Preserve unrelated edits currently present in `.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`, `pi/AGENTS.md`, `pi/README.md`, `pi/extensions/agents-context.ts`, `pi/extensions/aws-bedrock-env.ts`, `pi/extensions/bedrock-refresh.ts`, `pi/extensions/quality-gates.ts`, `pi/skills/workflow/plan-it.md`, `pi/skills/workflow/review-it.md`, `pi/tests/agents-context.test.ts`, `pi/tests/bedrock-refresh.test.ts`, `pi/tests/quality-gates.test.ts`, `pi/tests/workflow-prompts.test.ts`, and untracked `pi/lib/bedrock-auth.ts`.

## Execution Status

- **status:** complete
- **classification:** completed-and-archived
- **current_wave:** final-gates
- **last_completed_id:** F5
- **last_completed_gate:** archive preflight
- **next_id:** none
- **next_ready_gate:** none
- **archive_status:** archived
- **started_at:** 2026-07-15T21:44:57Z
- **completed_at:** 2026-07-15T23:07:12Z
- **completed_work:** Waves 0-3 and final gates F1-F4 are complete; implementation, focused validation, repo-wide validation, manual decision, and deployment decision passed.
- **commands_results:** Focused suites passed 136 tests; F1 passed 101 tests plus typecheck; `make check && make test-ci` passed with Pi 93 files and root pytest 1,203 passed/11 skipped; all linked package checks passed.
- **blockers:** none
- **remaining_checks:** none.
- **exact_user_actions:** none
- **resume_appropriate:** No after successful archive.

## Workflow Eval Record

- **schema_version:** 1
- **episode_id:** 2026-07-15T21-44-57Z-do-it-pi-task-dag-runner
- **command:** do-it
- **artifact_path:** `.specs/pi-task-dag-runner/plan.md`
- **repo_root:** `C:/Users/mglenn/.dotfiles`
- **started_at:** 2026-07-15T21:44:57Z
- **completed_at:** 2026-07-15T23:07:12Z
- **status:** completed
- **classification:** completed-and-archived
- **archive_status:** archived
- **redaction_status:** no_sensitive_output
- **phase_id:** final-gates
- **phase_type:** validation
- **task_id:** F5
- **phase_status:** passed
- **depends_on:** F1-F4
- **validation_command:** checklist ledger, diff, readiness, status, and archive preflight commands from the plan
- **validation_result:** passed
- **evidence:** Focused and repository-wide validation passed; archived plan and required review artifacts are present at `.specs/archive/pi-task-dag-runner/`; active plan path is absent.
- **manual_required:** false
- **risk_level:** medium
- **blast_radius:** personal-repo
- **rollback:** known
- **manual_decision:** not_required
- **manual_decision_reason:** The blocker is an automated plan-readiness prerequisite, not a manual runtime validation gate.
- **deployment_decision:** not_required
- **checklist_completion:** 14 of 14 items complete
- **blocker_reason:** none
- **friction_tags:** stale-readiness-artifact-overrode-repaired-plan, lifecycle-fixture-plan-contradiction, transient-cross-suite-isolation, hidden-panel-launch-failed
- **missing_evidence:** Hidden evaluator panel produced no findings because all three launches exited with code 1; deterministic completion consistency checks passed and no factual archive inconsistency was established.
- **improvement_candidates:** Treat applied review repairs as authoritative; require lifecycle-valid manual task fixtures in plan review; isolate workflow-friction storage in tests.
- **eval_confidence:** high - focused, integration, type, lint, canonical Pi, and root repository gates passed.
- **execution_outcome:** `{"classification":"completed-and-archived","completed":true,"blocked_by_plan_gap":false,"validation_failures_after_review":3,"manual_gate_ambiguity":false,"archive_issue":false,"missed_by_review":["manual fixture required invalid pending-to-completed transition"]}`
- **panel_quality_label:** `{"sizing":"under_sized","reason":"Review repaired three contract defects but missed the manual lifecycle contradiction; execution repaired it and all gates passed.","confidence":"high"}`
- **hidden_panel:** `evidence-auditor`, `workflow-friction-analyst`, and `regression-test-hunter` were launched after archive; each exited with code 1 without findings. Deterministic archive and ledger checks remain authoritative.
