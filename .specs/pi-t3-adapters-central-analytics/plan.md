---
created: 2026-11-10
status: completed
completed: 2026-11-10
---

# Host-aware Pi workflows and central analytics application

## Authorization and fixed scope

The user approved implementation on 2026-11-10 by agreeing to both confirmations: T3-owned thread-bound scheduling inside T3, and the first logging application scope below. This is implementation authorization, not another planning-only request. Do not introduce another implementation-approval gate for equivalent technical choices.

- Preserve existing standalone Pi and Herdr behavior in one default profile. Select T3 adaptations only through the existing immediate-client resolver; generic RPC and inherited markers in native children are not T3 ownership.
- Adapt session launching, `/plans`, scheduling and Codex usage/status using supported installed Pi/T3 interfaces only. No T3 source, generated-bridge, binary, database or live configuration patches. Unsupported operations fail clearly rather than launch native substitutes.
- T3 schedules belong to the current T3 thread and may outlive its Pi process. Non-T3 timers retain existing process-local semantics.
- Central analytics indexes default-profile native sessions, Bedrock usage and Codex cache observations from committed raw archive manifests. Audit/naming logs remain archived without dedicated analytical projections in this release. Legacy is excluded.
- Provide an explicitly remote, bounded read-only query tool through authenticated Onclave. Preserve raw manifest/byte references, native lineage, unknown provenance and coverage/freshness. Separate stored occurrences from unique activity supported by evidence; do not fabricate deduplication or T3 mappings.
- Native JSONL/session persistence, local `log_analytics`, durable pending-upload inputs and existing uploader retry remain independent of remote availability. No silent local-only replacement for a cross-machine query.
- Onclave owns application code, contracts, schema/migrations, client and Pi adapter. Dotfiles keeps runtime integration and a thin Onclave loader. No dashboard, new T3 correlation producers, new proxy/OTel stack or local-analytics replacement.
- Hatchery owns the first actual ClickHouse destination deployment. No interim old-tooling deployment, infrastructure implementation, migration-pilot replacement, deployment, publication or push is authorized here. A new private site repository is selected but not created; BWS remains authoritative. Do not change homelab-infra/Hatchery or private inventory/secrets.
- Preserve production adoption policy: the current Onclave deployment retains installed images on configuration apply and adopts `latest` through the daily native updater. API/indexer lockstep and a switch to pinned rollout are not approved assumptions.

## Workspace and ownership

Paths: `P = pi/profiles/default` in dotfiles, `O = modules/onclave` as an independent repository.

- Actual coordinating checkout: `C:/Users/mglenn/.dotfiles`, branch `main`. Canonical Onclave is attached to/tracking `origin/feature/v2-broker-core`, starting at `595513785f7fb6b276bb16b124a3f55640152c31`; do not switch it.
- Preserve unrelated dirty research files: `docs/research/obsidian-vault/agent-workflows/{README.md,index.md}` and untracked `projects/clickhouse-pi-session-analytics.md`. No vault inspection is necessary for this work.
- Strategist consultation completed before implementation delegation. Use shared-checkout T3 roles with disjoint path ownership. This respects the canonical module branch and supported T3 dispatch rather than pretending delegates can select a prepared checkout or module cwd. Package-scoped commands do not change their commissioning checkout.
- Parent owns shared host helpers, service/configuration/route composition, cross-task integration, plan state and root changelog. Workers own only their named task paths. One named task per worker. No extra review chain or mandatory paid-model sweep.
- Implementation and checks are authorized. Do not stage unrelated work, force-add ignored artifacts, change module branches, rewrite history or publish. Record final repository changes and checks accurately; do not infer publication/deployment authorization from implementation approval.

## Evidence and implementation contract

Verified before starting:

- Completed Pi role backend is already integrated; do not redo it.
- `resolvePiClient(ctx.mode)` in `P/lib/herdr-host.ts` distinguishes T3, native children and generic RPC. `createHostPresentation` provides plain notices/statuses outside TUI.
- Installed Pi SDK 1.5 exposes `executeTool()` only on tool execution contexts, not command contexts. Commands must use actual supported command/CLI mechanisms or explicit user-message handoff; do not cast command contexts to tool contexts, invoke raw tool implementations or create an alternate MCP client to bypass hooks.
- Existing source-scoped MCP composition lives at `P/lib/subagents/t3/call.ts`. New generic host calls must preserve callable-set validation, native permission/error propagation and role authority; no hidden fallback.
- Installed T3 scheduling exposes `schedule_task`, `list_scheduled_tasks`, `delete_scheduled_task`, including current-thread binding. Confirm other operation schemas before using them; do not invent fork/resume/workspace fields or decode opaque IDs.
- `/plans` currently rejects T3 and its separate launch uses Herdr. Native session launch/branch opens terminal sessions. Codex status still builds terminal-colored quota status.
- `O/packages/client/src/archive.ts` defines canonical manifest v1, 1 MiB chunks and up to 8192 chunks. Current API/uploader archives raw snapshots but has no remote SQL analytics.
- Current production artifact policy is described by homelab-infra's `docs/onclave-deployment.md` and `onclave-core.container.j2`, not the Onclave local/test Compose's image tag/digest inputs.

Application approach:

- Establish a versioned structured read-only remote query contract with finite operations/limits. Do not expose arbitrary server SQL execution, table functions or remote filesystem/network access. Keep native local query behavior unchanged.
- Raw archive remains authoritative. Indexing/projection versions and occurrence identities must tolerate snapshot repetition, append/rewrite, ID-less records and copied fork history. Unknown identity remains unknown; uploader identity is not historical origin.
- Separate raw object chunks, PostgreSQL manifests/control checkpoints, derived ClickHouse data, existing Onclave runtime state and local Pi pending input.
- Use an independently supervised server indexer with bounded manifest streaming and idempotent writes/replay. Do not buffer an entire potential 8 GiB snapshot, couple upload success to indexing, or start a worker in every Pi process.
- Analytics is optional/unconfigured by default. Dependency outages degrade analytics and retry later without blocking normal API/archive/broker paths. Remote results report incomplete coverage, unsupported versions and unavailability explicitly.
- Package API/indexer/migration/parser compatibility together but tolerate independent role adoption. Establish and test the supported projection/schema overlap; do not claim an untested N/N-1 or ClickHouse range.
- Onclave owns initialization/migrations and listener-free worker readiness, distinct from liveness and backlog freshness. Preserve analytical data during ordinary updates/reapply even when replay can rebuild projections.
- Select routine implementation details from actual repository patterns. Ask only if evidence requires changing fixed behavior/scope/adoption policy. Record compatibility and bounded-memory evidence; do not invent deployment resource allocations.

## Tasks

- [x] **T1: Implement analytics wire contract and validation**
  - Owner: developer; new `O/packages/client/src/analytics.ts`, focused contract tests and exports only.
  - Define bounded operations, exact archive references, coverage/freshness/version/error envelopes, occurrence versus proven-activity semantics, scope for the three approved sources and unknown lineage/provenance.
  - Read existing archive/client/service contracts without changing raw archive identity or producers.
  - Done when exact types/validators are exported and focused contract fixtures pass; publish interfaces before dependent assignments.
  - Evidence: `O/packages/client/src/analytics.ts` plus focused tests/export implemented. API v1 operations: sessions/search/lineage/tools/usage/availability; explicit default source/time scope, max 31-day window, limit default50/max200, 20 references, 16KiB request. Runtime request/response/reference parsers and version/coverage/error distinctions. 52 focused tests passed; no server compatibility claim.

- [x] **T2: Establish the minimal shared T3 host invocation seam**
  - Owner: parent; existing host/presentation helpers and proposed small callable-bridge helper/tests as needed.
  - Preserve source/callable identity, composed error/approval behavior and positive host detection. No pretend command-context execution or second general MCP client.
  - Done when consumers have a concrete supported interface; existing role composition remains unchanged or directly affected checks demonstrate equivalent behavior.
  - Evidence: Added `P/lib/t3-host-tools.ts`: `callT3HostTool(pi, ctx, operation, args, options?, env?)`, `t3HostToolNames(pi, operations, env?)`, and error carrying the original failed result. Requires positive immediate-client detection and installed bridge source/callability; composes through native hooks. Narrowed the existing role name helper's registry parameter type only. Combined helper/role/usage check: 3 files, 26 tests passed.

- [x] **T3: Thread-bound T3 scheduling with native preservation**
  - Depends on: T2 callable interface.
  - Owner: developer; `P/extensions/scheduler.ts`, proposed scheduler-specific helper and focused tests.
  - Create/list/delete T3-owned jobs scoped to the current thread; use real T3 IDs and ownership, not a mirror job database. Preserve current native scheduling, session transitions, messages and outputs outside T3.
  - Done when focused native/T3/error/ownership tests pass; no real reminders or live scheduled work are created for validation.
  - Evidence: Parent completed missing T3 fixtures and typed `lib/t3-scheduler.ts`, preserving callable failures and native scheduler behavior. Confirmed actual installed server ASAR `scheduledTaskSummary` and list implementation: scheduledTaskId, nullable boundThreadId/nextRunAt, prompt; deletion result uses scheduledTaskId/deleted. Read-only live list returned zero tasks; no reminder created. Native+T3 tests: 21 passed, including unrelated/unbound jobs, cancellation, denial, malformed data, late-null nextRunAt and bounded list disclosure.

- [x] **T4: Host-aware session launch actions**
  - Depends on: T2; inspect installed thread operation schemas/CLI help.
  - Owner: developer; `P/extensions/session-launch.ts`, proposed session-specific helper and focused tests.
  - Route explicitly requested supported T3 launches through app-owned mechanisms. Native UUID resume/fork semantics must not be guessed as T3 IDs. Unsupported operations clearly refuse without terminal/process fallback or shutting down the current working session.
  - Preserve native/Herdr launch, branch and explicit terminal commands.
  - Done when supported actions and refusals pass focused host tests with no actual operator thread/process interruption.
  - Evidence: Worker supplied app-owned launch/fork helpers and command follow-up handoff/refusals. Parent corrected launch workspace defaults using actual caller/thread metadata, forwarded signal/request identity, retained the returned link, and removed availability inference from deferred name hints. Session/helper tests: 35 passed across 3 files; no actual new thread/process launched.

- [x] **T5: T3-compatible plan selection and execution**
  - Depends on: T2; consume T4's supported launch interface where necessary.
  - Owner: developer; `P/extensions/plans.ts`, proposed plans-specific helper and focused tests.
  - Replace the unsupported custom TUI path for T3 with supported selection/actions. Preserve current-workspace execution and explicit new-thread intent only where supported. Respect real workspace/exact-target closeout constraints and do not invent an existing-worktree selector.
  - Preserve native selector and Herdr behavior. Do not add a new plan state registry.
  - Done when focused actions/selection/cancellation/unsupported cases and native tests pass.
  - Evidence: standard selection/confirmation/notifications in T3, no custom terminal picker. Run-here and new-thread are explicit follow-up requests; new-thread preserves the chosen current/root workspace and passes the initial plan request. Native/Herdr retained. Fixed inherited T3-marker contamination in generic-RPC fixture and contradictory worktree handoff wording. Plans55 tests passed. Default typecheck passed after SDK JSON/result/schema fixture corrections; scheduler21 tests passed with original enum schema retained; other affected host files passed in the preceding nine-file selection (no real jobs/threads launched).

- [x] **T6: Host-aware Codex usage/status presentation**
  - Owner: developer; `P/extensions/codex-status.ts` and focused tests only.
  - Use existing host/presentation helpers for plain RPC status/reporting. Keep explicit usage reporting available; make background work appropriate to actually used presentation without changing quota/auth/source semantics or native behavior.
  - Done when focused native/T3 status/lifecycle tests pass. Do not change providers, credentials, login state or canonical accounting.
  - Evidence: Worker updated status through shared presentation. Parent retained polling for generic non-T3 RPC (only T3 skips footer polling) and added explicit host fixtures/ANSI checks. 7 usage tests passed within the combined 26-test check. No live usage request or UI claim.

- [x] **T7: Parse archive snapshots into analytical projections**
  - Depends on: T1 exact contracts.
  - Owner: developer; proposed `O/services/core/src/vault/analytics-projection.ts` and focused tests.
  - Stream approved native sources into versioned projections with exact byte provenance, native trees, occurrence identity, known activity evidence and unknown metadata references.
  - Handle append/rewrite/repeated snapshots, fork copies, ID-less records and large/incomplete records without inflating claimed unique activity or losing raw bytes.
  - Done when finite raw fixtures establish projection/reference/count/coverage semantics; no ClickHouse deployment is needed.
  - Evidence: `analytics-projection.ts` async generator yields row/skipped/summary events from verified chunk iterables. Parser native-jsonl-v1/projection archive-rows-v1, bounded 16MiB physical record and 8192-character text. Exact source/byte/tree/tool/usage provenance, no activity uniqueness invented (all currently unknown). 19 focused tests passed, including streaming/large records/forks/nested calls. Consumers must count record vs invocation rows separately and preserve skip/coverage distinctions.

- [x] **T8: ClickHouse storage/schema and bounded reads**
  - Depends on: T1 and established projection shape from T7.
  - Owner: developer; proposed ClickHouse storage/migration/read modules and focused tests only.
  - Implement private HTTP(S) adapter, application-owned schema/version checks and idempotent projection persistence, plus compiled bounded read operations, not user SQL execution.
  - Done when adapter failure/version/schema/query behavior passes isolated checks; establish an explicit tested server/client range with a finite disposable test fixture, never an interim live destination.
  - Evidence: 25 focused tests plus actual ClickHouse26.8.36.3 at digest f5443f9ffa48f0154cdd50cab39fed732201762574a27f04f1f564bbba81832d. Parent corrected usage-bearing row filtering, replaced corpus-wide version scans with validated epoch registry/empty-unversioned rejection, and sorted stable source/event/key tuples for native-time pruning. Six operations, exact refs/replay and a narrow query past1,000,001 older rows passed. Actual Node22.23.4 application-image HTTP/schema/query passed; host driver Node25.9.0. No broader version range or deployment claim.

- [x] **T9: Committed-manifest indexer and control checkpoints**
  - Depends on: T1, T7 projection and T8 store interfaces.
  - Owner: developer; proposed indexer/control modules and focused tests; parent owns existing service/config composition.
  - Consume committed manifests using existing raw object storage and PostgreSQL control state. Retry dependencies, checkpoint confirmed writes and safely replay interrupted attempts. Default-profile approved sources only; no source-producer or uploader lifecycle changes.
  - Done when catch-up, repetition, restart/outage and source-selection tests pass with bounded input processing.
  - Evidence: AnalyticsIndexRepository/initializeAnalyticsIndex, bounded AnalyticsIndexer.runOnce and verified chunk adapter delivered. Seven PGlite tests cover committed/default/private selection, late lower hashes, replay/failure/abort and conservative coverage. Actual committed-manifest -> indexer -> ClickHouse -> query integration passed. Source-only candidate backlog is separately labelled on the wire; native-time coverage remains unknown where unproven. No producer/uploader lifecycle changes.

- [x] **T10: Authenticated remote analytics service routes**
  - Depends on: T1 and T8 bounded read interface.
  - Owner: developer; proposed query service/route module and focused tests; parent owns existing route registration.
  - Enforce scopes/limits server-side, existing request authentication, version compatibility and explicit availability/coverage/freshness. Never substitute local results or return zero as an outage answer.
  - Done when existing-style route/service tests cover real envelopes and error/version/partial-index boundaries.
  - Evidence: AnalyticsQueryService/createAnalyticsHandlers enforces request and outgoing-envelope bounds, explicit disabled/unavailable/incompatible statuses and partial/unknown coverage. 24 tests passed, including signed real-router loopback requests. Parent composed the handler (disabled when no service configured), registered the deferred Pi tool, and included the wire contract in the application image; enabled backend/runtime wiring is complete in T12.

- [x] **T11: Onclave client and explicit Pi remote analytics tool**
  - Depends on: T1; consume established route contract from T10.
  - Owner: developer; separate client implementation and `O/extensions/onclave-pi` tool/tests; parent owns shared registration/export integration.
  - Register a deferred explicit remote tool through the existing adapter with typed structured results and plain content. Preserve local `log_analytics` and thin dotfiles loader.
  - Done when transport/tool tests prove bounds, raw references, coverage, unknown identity and visible remote failure without local fallback.
  - Evidence: Client queryAnalytics validates/signed POSTs `/api/v1/analytics/query` and validates response; deferred `onclave_analytics` factory/register functions consume the shared wire contract. Tool tests2 and existing client tests7 passed. Parent registered the deferred tool and added three passing signed-query transport tests: exact posted bytes signed, bounded input and response-scope validation, explicit HTTP503. Aggregate typecheck/enabled composition passed; disposable local queries validated, not deployed cross-machine access.

- [x] **T12: Wire application runtime, worker readiness and service contract**
  - Depends on: T7-T11 interfaces.
  - Owner: parent; existing Onclave service/config/route/adapter composition, package scripts/artifact paths and app-owned contract documentation.
  - Implement optional API support and separately supervised indexer entrypoint, actual process/termination semantics, migrations and listener-free readiness observation. Keep raw/local operations independent and current adoption policy unchanged.
  - Record implemented commands, logical settings, validated compatibility and resource/persistence evidence; distinguish those from unselected site layout/secret values/live allocation.
  - Done when real composition/worker entrypoints and finite outage/readiness checks pass without deploying a destination or changing infrastructure repositories.
  - Evidence: Optional no-IO API construction, shared raw storage adapter and minimal archive-only worker configuration; analytics-main.ts supports separate worker/--ready/--help. Five runtime tests and actual Node22.23.4 image validate missing-config exit2, dependency retry, degraded readiness exit1, read-only compatible schema probe and SIGTERM exit0. Control heartbeats are distinct from backlog. docs/pi-analytics.md records actual commands, epochs, permissions/CA, state domains, initial single-worker topology and unchanged latest/daily adoption. No live bindings selected.

- [x] **T13: Integrated checks, documentation and delivery state**
  - Depends on: all implementation tasks.
  - Owner: parent; root changelog, relevant default-profile docs, Onclave app docs and this plan.
  - Run one finite integration pass: default-profile typecheck and affected scheduler/session/plans/usage/host tests; Onclave typecheck and directly affected client/archive/analytics/adapter/service tests; bounded isolated ClickHouse compatibility/memory/projection checks tied to implemented behavior.
  - Preserve opt-in live checks and report actual skips/limits. No production ingestion claim, rendered-T3 UI claim, mandatory paid-model sweep or infrastructure gate. Fix demonstrated task-related defects; rerun only affected checks after changes.
  - Evidence: Both package typechecks pass. Default affected selection: 9 files/148 tests passed. Onclave affected20-file selection initially272 passed/2 stale registration expectations failed/1 existing opt-in skipped; fixed only those expectations and reran affected extension20 tests successfully, giving274 distinct passed/1 skipped across the selection. No full-suite claim. Disposable store/index composition and Node22 runtime fixtures passed. Streamed256MiB/262,144 records under128MiB old-space: maxRSS122,404,864bytes, heap23,699,768bytes. Engine growth sample1,000,001 older rows:11,770,144bytes on disk, sampled311.7MiB engine memory under2GiB/2CPU test limits, not production sizing. Fixtures remove exact owned containers/anonymous volumes; initial12 volumes were identified through owned-container Docker mount events and removed without force/prune. Cached test/build layers remain normal cache. Documentation/changelog updated; all runtime/visual/live limits stated.
  - Report repository changes, exact checks, remaining authorization boundaries and any blocker accurately. Git publication and live deployment remain unapproved. Follow owning-repository/module-before-parent rules for any subsequently authorized commits/pins; do not commit unrelated research or module contents into the parent.

## Current handoff

- Status: approved implementation complete and locally validated; no implementation blocker.
- Work mode: shared canonical checkout with disjoint ownership, preserving existing module branch and unrelated research changes. No top-level threads or substitute module checkouts.
- Next: no remaining implementation assignments. Changes are uncommitted in dotfiles main and canonical Onclave feature/v2-broker-core. Publication, parent pin/commit, first live deployment/private site setup and real backfill remain separately authorized operations, not implementation acceptance gates. Reload/restart idle affected default Pi runtimes to load on-disk adapters; no current process was restarted.
- Open consequential decisions: none within the approved first-release scope. Do not turn discoverable compatibility/entrypoint/resource evidence into operator questions.
- External boundary: first actual destination deployment remains with Hatchery and requires separate explicit authorization; it does not block application implementation and isolated tests.
- Final checks: default typecheck +9 files/148 host tests; Onclave typecheck +274 distinct affected tests/1 existing opt-in skip, with only the changed registration file rerun after its fixture correction. Exact server/client/image, resource and lifecycle evidence is in O/docs/pi-analytics.md. No rendered T3 UI, paid-model sweep, production ingestion, live cross-machine access or deployment claim. Unrelated research, Hatchery/homelab work and other worktrees preserved.
