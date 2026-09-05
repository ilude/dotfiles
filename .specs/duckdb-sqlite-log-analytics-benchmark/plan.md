---
created: 2026-09-05
status: draft
---

# Benchmark DuckDB and SQLite log-analytics pipelines

## Objective

Build and run a reproducible, correctness-gated comparison of the current DuckDB JSONL analytics pipeline and one explicitly specified experimental Node JSONL-to-`node:sqlite` pipeline, treating measurements as end-to-end adapter-pipeline results rather than isolated database-engine performance and leaving production analytics unchanged.

## Completion Evidence

- Evidence: Deterministic synthetic fixtures near 10, 100, and 400 MiB have recorded seeds, selected-source byte counts, record-shape counts, and checksums; independent oracles establish expected recent-failure, grouped-count, and nested-JSON-search results and bounded output for both adapters; every dataset/query/runtime case has ten measured randomized pairs after two warmup pairs or an explicit recorded timeout, error, incorrect result, or blocker; cancellation probes have bounded terminal outcomes; and the maintained report records source revision, runtime and engine versions, hardware, commands, medians and spread, paired sample counts, resource tradeoffs, compatibility gaps, and limitations.
- Fails when: A workload can read outside its synthetic manifest, production analytics changes, an engine result differs from its independent oracle without being retained as incorrect, a planned case is silently omitted, generated data is tracked, failed samples are folded into successful latency summaries, or the report claims an SQLite advantage unsupported by a predeclared metric rule and complete correct pairs.

## Boundaries

- In scope: Benchmark-only DuckDB and `node:sqlite` adapters, shared workload definitions and independent oracles, deterministic synthetic JSONL generation, process-isolated paired measurements, focused correctness and runner tests, pnpm scripts, ignored generated artifacts, one maintained benchmark report, and the root changelog entry.
- Out of scope: Activating SQLite in `log_analytics`; changing `pi/extensions/log-analytics-tool.ts` or production files under `pi/lib/log-analytics/`; optimizing either engine; persistent databases, indexes, or caches; querying private Pi logs; declaring a drop-in replacement or overall winner; pushing; and production migration design.
- Preserve: Registered source projection meaning, 512 MiB input limit, 5 second deadline, 1,000-row and 256 KiB output defaults, DuckDB's two-thread default, current public SQL/API behavior, unrelated primary-worktree changes, and the shared validation repair allowance.
- Assumptions: The benchmark uses the worktree's pnpm-managed `pi/` package and its exact `process.execPath`; SQLite is supplied by that Node runtime's `node:sqlite` with no new database dependency; each measured invocation rebuilds and closes a fresh in-memory database except when parent-enforced termination makes in-process close impossible; and the host can provide enough disk, memory, and a quiescent window for the 400 MiB case.

## Tasks

- [ ] **T1: Define workload contracts and benchmark-only adapters**
  - Files: `pi/benchmarks/log-analytics/types.ts`, `pi/benchmarks/log-analytics/workloads.ts`, `pi/benchmarks/log-analytics/duckdb-engine.ts`, `pi/benchmarks/log-analytics/sqlite-engine.ts`, `pi/tests/log-analytics-benchmark-engines.test.ts`
  - Change: Define the three required workloads, total ordering with tie-breakers, normalized columns/rows/types/truncation/output digests, and expected results computed without either SQL implementation. Wrap `withAnalyticsSession` for DuckDB and implement the experimental Node JSONL parse/project/batched-insert/query path with `DatabaseSync(":memory:")`, prepared bindings, explicit SQLite SQL, missing-field/type coercions, malformed-line treatment, and `finally` cleanup. Resolve manifest files with `realpath`, reject symlink escapes, pass explicit `sourceRoots` and `selectedFiles` to DuckDB, and give SQLite the same closed allowlist so runtime environment roots are never consulted. Check SQLite cancellation/deadline state between import batches and result steps, but classify interruption inside a synchronous call as parent-enforced process termination rather than cooperative SQLite cancellation. Cite Node 25 SQLite/process/child-process documentation, installed `@types/node/sqlite.d.ts`, SQLite JSON1 documentation, and the current DuckDB store contract for every relied-on operation.
  - Done when: Both adapters expose one bounded invocation contract; workload SQL, normalization, independent oracles, isolation, deadline classification, and normal/error cleanup are explicit; focused tests exist for equivalent correct results, bounds, coercions, ordering, malformed/missing records, external-root sentinels, symlink escape rejection, and cleanup; and no production analytics file is modified.
  - Verify: deterministic In T5, run the focused engine test and inspect the final patch; the test must falsify result, bound, isolation, deadline-classification, or cleanup mismatches.
  - On failure: Record the first unsupported runtime or adapter invariant, stop T1 and its dependents, and do not retry before the final validation policy permits a classified repair.

- [ ] **T2: Generate deterministic workload-scaled fixtures**
  - Files: `pi/benchmarks/log-analytics/fixtures.ts`, `pi/benchmarks/log-analytics/manifest.ts`, `pi/tests/log-analytics-benchmark-fixtures.test.ts`
  - Change: Generate only synthetic registered-layout JSONL beneath `pi/.tmp/log-analytics-benchmark/` from fixed seeds. Define each scale by bytes in the manifest-selected files read by each workload, targeting 10, 100, and 400 MiB below the preserved input cap. Scale primarily by record count while preserving declared proportions of nested tool results, metric events, missing fields, malformed lines, successes/errors, groups, search matches, and a fixed payload-size distribution. Emit actual selected bytes, per-shape counts, seeds, and SHA-256 checksums. Use independent small fixture trees in tests rather than committing large data.
  - Done when: The generator covers all required record shapes and deterministically produces each scale within its documented tolerance in the ignored path, with enough manifest detail to reproduce workload expectations.
  - Verify: deterministic In T5, generate two small trees from one manifest and assert byte identity, checksums, shape counts, selected-source bytes, containment, and size tolerance.
  - On failure: Record the first determinism, containment, or scaling contradiction, stop T2 and its dependents, and do not retry before the final validation policy permits a classified repair.
  - Depends on: T1

- [ ] **T3: Implement paired process measurement and case accounting**
  - Files: `pi/benchmarks/log-analytics/worker.ts`, `pi/benchmarks/log-analytics/run.ts`, `pi/benchmarks/log-analytics/statistics.ts`, `pi/tests/log-analytics-benchmark-runner.test.ts`
  - Change: Run complete discover/create/import-project/query/consume/serialize/cleanup invocations in directly spawned workers. Separate cold-process from warm-runtime conditions while rebuilding the database per invocation; seed randomized engine order per pair; perform two warmup and ten measured pairs per dataset/query/runtime condition; and compare every measured result with its oracle. Record parent wall time from acknowledged case start through settlement, worker `process.cpuUsage(start)` deltas, phase timings, serialized bytes, and fixed-interval heartbeat delay. For cold workers record documented process-lifetime `maxRSS`; for warm workers record baseline/end RSS and worker-lifetime high-water RSS, explicitly marking per-invocation peak unavailable unless a documented cross-platform sampler is implemented. Forced termination records censored heartbeat delay and unavailable terminal worker metrics rather than inventing values. Aggregate only complete correct pairs, reporting count, median paired ratio, a deterministic Q1/Q3 method, and separate timeout/error/incorrect/unavailable counts. Parent-owned raw JSONL writes remain in the ignored directory. Parent timeout/cancellation begins at `case-start`, terminates only the recorded worker PID, waits a documented close bound, and records cleanup/PID-settlement status.
  - Done when: The finite case matrix, seeded order, sample counts, fresh-database invariant, oracle gate, phase boundaries, metric availability, failure retention, statistics, raw schema, and worker cleanup are explicit and covered by controlled runner tests.
  - Verify: deterministic In T5, controlled workers must falsify ordering, exact accounting, oracle gating, timeout/error retention, metric labels, raw ownership, aggregation, or bounded cleanup defects.
  - On failure: Record the first lifecycle, accounting, or measurement-contract contradiction, stop T3 and its dependents, and do not retry before the final validation policy permits a classified repair.
  - Depends on: T1, T2

- [ ] **T4: Add reproducible commands and the maintained report schema**
  - Files: `pi/package.json`, `pi/benchmarks/log-analytics/report.ts`, `pi/benchmarks/log-analytics/README.md`, `pi/docs/log-analytics-duckdb-sqlite-benchmark.md`, `pi/tests/log-analytics-benchmark-report.test.ts`, `CHANGELOG.md`
  - Change: Add pnpm scripts for fixture generation, deterministic correctness, the performance matrix, cancellation probes, and report rendering. Document prerequisites, exact commands, closed synthetic-input boundary, case definitions, measurement and availability semantics, generated paths, cleanup, and SQL/cancellation compatibility differences. Test report rendering from fixed raw-result fixtures before live measurement. Predeclare metric-specific conclusion rules: never report an overall winner; describe a lower observed median only for a metric with the stated minimum complete-pair count, no correctness failures, and its declared paired-ratio threshold. T4 establishes the schema and synthetic examples only; live measurements populate the report in T6 and T7.
  - Done when: Maintainers have explicit commands and contracts for reproducing the experiment, fixed-input report tests cover all required metadata and case/failure fields, generated data remains under ignored paths, and documentation does not imply SQLite is drop-in compatible.
  - Verify: deterministic In T5, render fixed raw results and assert complete metadata, case accounting, metric semantics, failures, compatibility fields, and conclusion-rule behavior; inspect scripts, docs, ignore behavior, and changelog against the boundary.
  - On failure: Record the command or report-contract contradiction, stop live work, and do not retry before the final validation policy permits a classified repair.
  - Depends on: T2, T3

- [ ] **T5: Run final deterministic validation**
  - Files: `pi/benchmarks/log-analytics/`, `pi/tests/log-analytics-benchmark-*.test.ts`, `pi/package.json`, production analytics comparison paths
  - Change: After implementation, test authoring, and integration settle, run the deterministic Validation batch once and record the worktree base SHA and results. Do not begin live measurement unless every deterministic check passes.
  - Done when: Focused correctness/runner/report tests, TypeScript checking, formatting/lint checking, generated-path ignore checks, and the base-to-worktree production boundary check all pass.
  - Verify: deterministic Run the T5 commands listed in Validation once; on failure follow the shared repair allowance and never continue into T6 or T7 with a failed correctness gate.
  - On failure: Classify the failure, permit at most the shared one focused repair batch and one targeted rerun, then stop and report if it remains.
  - Depends on: T1, T2, T3, T4

- [ ] **T6: Run the paired performance matrix and render results**
  - Files: `pi/.tmp/log-analytics-benchmark/`, `pi/docs/log-analytics-duckdb-sqlite-benchmark.md`
  - Change: Generate and checksum the full synthetic fixtures, record source/runtime/engine/hardware metadata, then run the complete performance matrix once after confirming no repository test/build/server or competing benchmark process is active and recording available memory and free disk sufficient for the declared fixture/run bounds. Retain every timeout, error, incorrect result, and unavailable metric. Render the maintained report from raw results and terminate only owned worker PIDs.
  - Done when: Every dataset/query/runtime case contains two warmups and ten measured randomized pairs or an explicit terminal failure/blocker, the report accounts for all cases without unsupported winner claims, and owned workers have settled.
  - Verify: live Observe the single performance matrix, case accounting, report render, and owned-worker cleanup in the recorded workflow worktree session.
  - Max attempts: 1
  - Session: workflow-owned `duckdb-sqlite-log-analytics-benchmark` worktree on the recorded benchmark host
  - Terminal outcomes: supported | rejected | blocked
  - Depends on: T5

- [ ] **T7: Measure DuckDB cancellation and SQLite process termination**
  - Files: `pi/.tmp/log-analytics-benchmark/`, `pi/docs/log-analytics-duckdb-sqlite-benchmark.md`
  - Change: Run one active DuckDB cancellation probe and one active SQLite deadline/cancellation probe as separately recorded cases. For SQLite, terminate the worker when synchronous execution cannot cooperate, wait the fixed cleanup bound, verify the recorded PID is absent, and report `terminationMode: process`, database-close availability, censored responsiveness, and unavailable post-exit metrics. Append both outcomes to raw results and rerender the maintained report.
  - Done when: Each probe has one supported, rejected, or blocked outcome, cleanup evidence, and an accurate report entry distinguishing cooperative interruption from process termination.
  - Verify: live Observe exactly the two declared cancellation behaviors, PID cleanup, and report update in the isolated benchmark session.
  - Max attempts: 1
  - Session: workflow-owned `duckdb-sqlite-log-analytics-benchmark` worktree on the recorded benchmark host
  - Terminal outcomes: supported | rejected | blocked
  - Depends on: T6

## Live attempt ledger

| Task | Attempt | Preconditions | Result | Cleanup | Disposition |
| --- | --- | --- | --- | --- | --- |
| T6 | 1 | T5 passed; host metadata, available memory, and free disk recorded; no repository test/build/server or competing benchmark process active | Pending | Terminate recorded owned worker PIDs, wait the fixed close bound, verify absence, retain generated artifacts only under ignored `pi/.tmp/log-analytics-benchmark/` | Pending |
| T7 | 1 | T6 settled; cancellation fixtures available; no competing benchmark process active | Pending | Terminate only recorded probe PIDs, wait the fixed close bound, verify absence, retain raw outcomes under the ignored directory | Pending |

## Execution Strategy

The implementation workflow must create and own `.worktrees/duckdb-sqlite-log-analytics-benchmark` before modifying files. Implement T1-T4 and their tests without development checks, then keep T5-T7 root-owned. T5 runs one final deterministic batch; T6 and T7 start only after it passes. A started live task is never rerun under the deterministic repair allowance; further live execution requires user direction. The two warmups and ten measured pairs are predefined samples within T6, not repair retries. The untracked primary file `pi/browser-profiles.json` predates this plan and must remain untouched and uncommitted.

## Validation

- [ ] T5 deterministic: Record `BASE_SHA=$(git rev-parse HEAD)` before implementation, then after integration run `cd pi && pnpm test log-analytics-benchmark-engines.test.ts log-analytics-benchmark-fixtures.test.ts log-analytics-benchmark-runner.test.ts log-analytics-benchmark-report.test.ts log-analytics-store.test.ts` and require all focused adapter, fixture, runner, report, and preserved-store checks to pass.
- [ ] T5 deterministic: Run `cd pi && pnpm run typecheck` and require no TypeScript errors for the integrated benchmark code.
- [ ] T5 deterministic: Run `cd pi && pnpm exec biome check benchmarks/log-analytics tests/log-analytics-benchmark-engines.test.ts tests/log-analytics-benchmark-fixtures.test.ts tests/log-analytics-benchmark-runner.test.ts tests/log-analytics-benchmark-report.test.ts` and require no diagnostics or file mutation.
- [ ] T5 deterministic: Run `git ls-files -- pi/.tmp/log-analytics-benchmark` and require no output; run `git check-ignore -q pi/.tmp/log-analytics-benchmark` and require success; require the report path not to be ignored; and run `git diff --exit-code "$BASE_SHA" -- pi/extensions/log-analytics-tool.ts pi/lib/log-analytics` with no production analytics difference.
- [ ] T6 live: Run the documented paired-performance command once. Max attempts: 1. Session: the workflow-owned benchmark worktree on the recorded host. Terminal outcomes: supported when every matrix case and required metadata is represented and cleanup succeeds; rejected when correctness or accounting contradicts the objective; blocked when host capacity or quiescence preconditions prevent the run. Cleanup: terminate recorded owned workers, wait the documented bound, verify their PIDs are absent, and retain only ignored raw/generated artifacts plus the maintained report.
- [ ] T7 live: Run the documented cancellation-probe command once. Max attempts: 1. Session: the same isolated worktree and host. Terminal outcomes: supported when both engine-specific outcomes and cleanup evidence are recorded accurately; rejected when observed behavior contradicts the report; blocked when the probes cannot safely start. Cleanup: terminate recorded probe PIDs, wait the documented bound, verify absence, and rerender the report from retained raw outcomes.
- [ ] Closeout deterministic: Require `git ls-files --error-unmatch pi/docs/log-analytics-duckdb-sqlite-benchmark.md` after commit and inspect the base-to-commit patch for complete case accounting, ignored generated data, and no production analytics changes.
- Timing: T5 runs after implementation, test authoring, and integration settle. T6 and T7 run only after T5 passes and their preconditions hold.
- On failure: Classify first. Before live execution, allow at most one focused repair batch and one targeted rerun for the whole outcome. Predefined benchmark samples are not retries. A started T6 or T7 is never rerun under that allowance; if it rejects or cleanup fails, stop and report. If a deterministic rerun still fails, stop patching, reassess the mechanism, assumptions, and harness, and require user direction before further execution.

## Retention

Keep incomplete work at `.specs/duckdb-sqlite-log-analytics-benchmark/plan.md`. After completion, the implementation workflow archives this directory to `.specs/archive/duckdb-sqlite-log-analytics-benchmark/`, commits the workflow branch, merges it with `--no-ff` into the clean primary branch, verifies merged HEAD, and removes only its owned worktree and branch.

## Execution Status

- State: Draft; implementation has not started.
- Blocker: None.
- Next: T1.
- Current frontier: T1; authored adapter and oracle work precedes fixture and runner tasks; final validation and live measurements remain pending.
- Validation progress: No checks run; one shared deterministic repair batch and targeted rerun remain; live attempts remain one each for T6 and T7.
- Resume: `/do-it .specs/duckdb-sqlite-log-analytics-benchmark/plan.md`
