---
created: 2026-07-10
status: completed
completed: 2026-07-11
---

# Plan: Pi Orchestration Telemetry (follow-up #9)

## Context & Motivation

`.specs/pi-orchestration-follow-ups/note.md` item 9 asks Pi to "record parent model,
worker models, fan-out, inline versus artifact bytes, tokens, latency, and cost" so
operators can establish a descriptive baseline for whether delegation appears to
reduce Fable/Opus API spend and Sol context without worse latency or quality.
Causal savings claims require the deferred matched-corpus evaluation.

A design was drafted and then adversarially reviewed by a 4-reviewer panel plus
synthesis (artifacts in `.tmp/orchestration-telemetry-review/`; synthesis verdict:
PLAN COHERENT WITH REVISIONS). The reviewed conclusion, which this plan implements:

- Emit two normalized event families into the existing metrics stream
  (`pi/lib/metrics.ts` -> `~/.pi/agent/logs/metrics-YYYY-MM-DD.jsonl`). No new
  runtime store.
- `orchestration_run` is the authoritative per-delegation event (one per `subagent`
  tool invocation and per background `task` execute envelope).
- `orchestration_interaction` is a thin per-interaction projection emitted from the
  existing workflow-friction interaction lifecycle (NOT a new collector extension),
  for both direct and delegated interactions, carrying the canonical friction
  `interactionId`, registered `orchestrationIds`, and parent usage grouped by actual
  model. Worker rollups are derived at report time by joining run events.
- A new `/orchestration-stats [days]` command aggregates deterministically.

Three real usage defects in `pi/extensions/subagent/index.ts` were confirmed with
line evidence and must be fixed as part of this work:

1. Cache read/write tokens and cost are accumulated in `currentResult.usage`
   (`:833-838`) but the persisted task usage keeps only
   `{inputTokens, outputTokens, totalTokens}` (`:897-903`, used at `:905/:919/:928`).
2. `usage.contextTokens = usage.totalTokens || 0` (`:838`) records the last message's
   context, and persisted `totalTokens` prefers `contextTokens || input+output`
   (`:900-902`), so persisted totals can undercount cumulative usage (verified in
   real records under `~/.pi/agent/operator/tasks/`).
3. `usage.cost` initializes to 0 (`:711-719`), so unavailable cost is
   indistinguishable from a genuinely free call.

One friction defect must also be fixed: `pi/lib/workflow-friction.ts` metadata
counting matches tool name `"task_execute"` while the real tool is `"task"` with
`args.action === "execute"`; the existing `isTaskExecutionTrace()` helper recognizes
the correct shape but is not used for counting (`workflow-friction.ts:122-136,
138-185, 276-279`).

## Constraints

- Platform: Windows 11, Git Bash/MSYS2 + PowerShell available
- Shell: bash for git/pnpm; Pi TypeScript is pnpm-only (`cd pi && pnpm ...`); never bun/npm
- ASCII punctuation and LF line endings in all file content
- No AI mentions in code or docs
- Metrics JSONL stays append-only and best-effort; do not add fallback wrappers
  around `recordEvent` (its silent-failure contract is owned by `pi/lib/metrics.ts`)
- No prompts, worker output, stderr, command lines, paths, or failure text may be
  persisted in orchestration events; a closed validated event builder is the only
  path to `recordEvent`
- Backward compatibility: existing task records (schemaVersion 1) must read
  unchanged; `totalTokens` keeps its legacy meaning as a deprecated field; new
  analytics use new fields
- `pi/tests/runtime-smoke.test.ts` structural rules: no same-basename module in both
  `pi/lib/` and `pi/extensions/`; every top-level extension exports a default
  function
- `/orchestration-stats` is a slash command only; registering no model-callable tool
  keeps `pi/tests/tool-search.test.ts` untouched
- Tests and smoke runs must set `PI_METRICS_DIR`, `PI_OPERATOR_DIR`, and the new
  `PI_WORKFLOW_FRICTION_DIR` before Pi or production modules initialize; all three
  roots must point into one scratch directory, and report readers must use the
  same resolved roots rather than hardcoded home paths
- The live smoke uses one bounded model/worker call and existing Pi provider auth;
  never read, print, copy, or pass API keys on the command line
- Uncommitted unrelated work may exist in the worktree; do not commit anything

## Risk & Manual Gate Decision

- **Risk level:** medium
- **Blast radius:** personal-local-repo plus one bounded existing-provider API call
- **Rollback:** easy for code; `git revert` does not erase already-written metrics,
  so use the documented purge procedure for scratch or unwanted telemetry
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** code and telemetry paths are local and reversible. The exact
  smoke uses one bounded call through already-configured Pi auth; invoking `/do-it`
  authorizes that validation call. If auth is unavailable, the exact smoke is
  blocked and the plan must remain unarchived rather than substituting mocks.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Normalized events in existing metrics JSONL + friction-lifecycle integration | Small additive design, deterministic joins, one store, reuses proven interaction lifecycle | Requires instrumentation at three boundaries | **Selected** |
| Offline joins over existing logs (no runtime change) | Zero runtime work | Timestamps/agent-name joins are nondeterministic; transcript tracing optional; inline bytes absent; cost incomplete | Rejected: correlation unreliable for routing decisions |
| Transcript/OTel traces as authoritative store | Richest tracing model | Default-off collection, far more data than needed, heavy schema/retention burden | Rejected: overbuilt for #9 |
| New standalone collector extension for interaction events | Clean separation | Duplicates the friction `before_agent_start -> agent_settled` lifecycle; divergent interaction boundaries; non-joinable IDs (review finding, 03-collector) | Rejected: reuse friction lifecycle |

Trend-bias note: every task converges on "append JSONL events + deterministic
reader." That pattern fits low-frequency local telemetry. The opposite pattern (a
queryable store such as DuckDB/SQLite) fits only if event volume or join complexity
grows materially; JSONL remains source of truth per existing repo policy.

## Objective

Pi records, for every delegation and every settled top-level interaction, enough
normalized data (models, fan-out, bytes, tokens, latency, cost, and existing
friction quality classification) to describe direct versus delegated observations,
and exposes them through a deterministic `/orchestration-stats` report -- without
persisting content and without breaking existing task-record, friction, metrics, or
test contracts. The MVP does not claim delegation caused savings.

## MVP Boundary

The full descriptive pipeline for new data: usage-defect fixes,
`orchestration_run` + `orchestration_interaction` emission, and a working
`/orchestration-stats [days]` report over metrics JSONL with a
friction-classification join. It reports observed spend/context/latency/quality
without a causal savings verdict. This is one focused implementation slice with
clear seams (canonical usage -> closed events -> emitters -> report).

## Explicit Deferrals

- Matched-cohort or controlled-corpus causal evaluation (direct vs delegated on a
  fixed task set in isolated worktrees). The report stays observational and must say
  so.
- Backfill or reinterpretation of historical task records and metrics.
- Timing-span metadata expansion in `pi/lib/observability.ts` (duration is captured
  directly in orchestration events instead).
- Retention/purge tooling for metrics JSONL beyond documenting the existing
  soft-cap behavior.
- Any routing-policy change based on collected data.

## Project Context

- **Language**: TypeScript (Pi extensions/lib), pnpm-only
- **Test command**: `cd pi && pnpm test <file>` (focused), `cd pi && pnpm test` (full)
- **Lint command**: `cd pi && pnpm exec biome check <files>`; typecheck: `cd pi && pnpm run typecheck`
- **Repo-wide gate**: `make check` from repo root

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | from repo root, snapshot the exact pre-execution state of every plan-owned path: `baseline="$PWD/.tmp/orchestration-telemetry-baseline"; rm -rf "$baseline"; mkdir -p "$baseline/files"; : > "$baseline/paths.txt"; for f in .specs/pi-orchestration-telemetry/plan.md .specs/pi-orchestration-telemetry/execution-evidence pi/extensions/subagent/index.ts pi/lib/task-registry.ts pi/tests/subagent.test.ts pi/tests/task-registry.test.ts pi/lib/orchestration-telemetry.ts pi/tests/orchestration-telemetry.test.ts pi/extensions/tasks/execution.ts pi/tests/task-execution.test.ts pi/lib/workflow-friction.ts pi/extensions/workflow-friction-review.ts pi/tests/workflow-friction.test.ts pi/extensions/orchestration-stats.ts pi/scripts/orchestration-telemetry-verify.mjs pi/tests/orchestration-stats.test.ts pi/README.md pi/docs/orchestration-telemetry.md pi/docs/workflow-eval-telemetry.md pi/docs/workflow-eval-operations.md; do printf '%s\n' "$f" >> "$baseline/paths.txt"; if test -e "$f"; then cp -a --parents "$f" "$baseline/files"; fi; done; (cd "$baseline/files" && find . -type f -print0 | xargs -0 -r sha256sum) > "$baseline/manifest.sha256"; git status --porcelain=v1 > "$baseline/status-before.txt"`; then `mkdir -p .specs/pi-orchestration-telemetry/execution-evidence; set -o pipefail; cd pi && pnpm install --frozen-lockfile && pnpm run typecheck 2>&1 | tee ../.specs/pi-orchestration-telemetry/execution-evidence/preflight.log` | none | `paths.txt`, `manifest.sha256`, and `status-before.txt` exist and are nonempty; typecheck pipeline exits 0 |
| Focused tests | `set -o pipefail; cd pi && pnpm test orchestration-telemetry.test.ts orchestration-stats.test.ts subagent.test.ts task-execution.test.ts task-registry.test.ts task-tools.test.ts workflow-friction.test.ts observability.test.ts tasks.test.ts 2>&1 | tee ../.specs/pi-orchestration-telemetry/execution-evidence/focused-tests.log` | none | Vitest pass summary and pipeline exit 0 |
| Lint | `set -o pipefail; cd pi && pnpm exec biome check lib/orchestration-telemetry.ts extensions/orchestration-stats.ts extensions/subagent/index.ts extensions/tasks/execution.ts lib/task-registry.ts lib/workflow-friction.ts extensions/workflow-friction-review.ts 2>&1 | tee ../.specs/pi-orchestration-telemetry/execution-evidence/biome.log` | none | no diagnostics; pipeline exits 0 |
| Live smoke | from repo root: `set -o pipefail; episode_id="orchestration-telemetry-$(date -u +%Y%m%dT%H%M%SZ)-$$"; smoke="$PWD/.tmp/orchestration-telemetry-smoke/$episode_id"; rm -rf "$smoke"; mkdir -p "$smoke"/{metrics,operator,friction}; printf '%s\n' "$smoke" > .specs/pi-orchestration-telemetry/execution-evidence/smoke-dir.txt; export PI_METRICS_DIR="$smoke/metrics" PI_OPERATOR_DIR="$smoke/operator" PI_WORKFLOW_FRICTION_DIR="$smoke/friction"; pi --mode json -p --no-session --tools subagent 'Call the subagent tool once in single mode with agent reviewer and task: Return exactly telemetry-smoke-ok without tools. Then return its result.' | tee .specs/pi-orchestration-telemetry/execution-evidence/live-subagent.jsonl && pi --mode json -p --no-session --no-tools '/orchestration-stats 1' | tee .specs/pi-orchestration-telemetry/execution-evidence/live-stats.jsonl` | existing Pi provider auth through normal resolution; no key arguments | both pipelines exit 0; scratch metrics have joinable events; rendered report captured |
| Repo-wide | `set -o pipefail; make check 2>&1 | tee .specs/pi-orchestration-telemetry/execution-evidence/make-check.log` | none | pipeline exits 0 |
| Archive preflight | `set -o pipefail; smoke="$(<.specs/pi-orchestration-telemetry/execution-evidence/smoke-dir.txt)"; node pi/scripts/orchestration-telemetry-verify.mjs --plan .specs/pi-orchestration-telemetry/plan.md --evidence-dir .specs/pi-orchestration-telemetry/execution-evidence --smoke-dir "$smoke" 2>&1 | tee .specs/pi-orchestration-telemetry/execution-evidence/archive-preflight.log && git diff --check && ! rg -n '(sk-|Bearer |BEGIN .*PRIVATE KEY|api[_-]?key[" ]*[:=])' .specs/pi-orchestration-telemetry/execution-evidence "$smoke"` | none | verifier proves required execution-event fields, T1-T7/V1-V3/F1-F4 completed with non-placeholder evidence, captures nonempty, one run joined to a settled interaction, no forbidden content keys, all three roots under fresh smoke dir, and F5 still pending; remaining checks exit 0 |
| Rollback | never use `git checkout/reset` on the dirty tree. Fail-closed remove-then-restore from repo root: `set -e; repo="$PWD"; baseline="$repo/.tmp/orchestration-telemetry-baseline"; test -s "$baseline/paths.txt"; while IFS= read -r f; do test -z "$f" || rm -rf -- "$repo/$f"; done < "$baseline/paths.txt"; (cd "$baseline/files" && find . -type f -print0 | while IFS= read -r -d '' f; do mkdir -p "$repo/$(dirname "$f")"; cp -p "$f" "$repo/$f"; done); rm -rf "$repo/.tmp/orchestration-telemetry-smoke"; (cd "$repo" && sha256sum -c --quiet "$baseline/manifest.sha256"); git status --porcelain=v1 > "$baseline/status-after.txt"; cmp -s "$baseline/status-before.txt" "$baseline/status-after.txt"`; a nonzero exit means rollback is incomplete: report it, do not archive, and repair from `$baseline` before retrying. Removing every listed path first deletes files created during execution (including new evidence files); the hash check proves byte-for-byte restoration and the `cmp` proves the porcelain status matches the pre-execution snapshot. Non-scratch metrics require backup plus removal of only identified orchestration event lines | none | rollback command exits 0; `sha256sum -c` and `cmp` both pass; scratch absent; unrelated pre-existing bytes preserved |


## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task,
validation gate, and final completion gate has exactly one matching checkbox.
Checked means verified complete; unchecked means pending, in-progress, blocked, or
invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required
verification and before starting any dependent or next sequential step. `/review-it`
must preserve checked state, add unchecked items for new executable work, and never
mark implementation or validation work complete.

### Wave 1 (sequential canonical contract)

- [x] T1: Normalize worker usage persistence and fix the three subagent usage defects
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-t1-001; `cd pi && pnpm test subagent.test.ts task-registry.test.ts` passed 47 tests
- [x] T2: Create `pi/lib/orchestration-telemetry.ts` (closed schemas, event builders, multi-day reader)
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-t2-001; 13 focused tests passed
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-v1-001; 68 tests, typecheck, and Biome passed after scoped formatting repair

### Wave 2

- [x] T3: Emit `orchestration_run` from the subagent tool (single/parallel/chain/team)
  - Status: completed
  - Evidence: `execution-evidence/wave2-tests.log`; mode, failure, and isolation tests passed
- [x] T4: Emit `orchestration_run` from background task execution
  - Status: completed
  - Evidence: `execution-evidence/wave2-tests.log`; coordinator settlement and task-tool integration tests passed
- [x] T5: Friction-lifecycle integration and `orchestration_interaction` emission
  - Status: completed
  - Evidence: `execution-evidence/wave2-tests.log`; lifecycle, parent usage, and direct/delegated tests passed
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-v2-001; 88 tests passed, typecheck and Biome clean

### Wave 3

- [x] T6: `/orchestration-stats` reporting extension
  - Status: completed
  - Evidence: `execution-evidence/wave3-tests.log`; report, command, verifier, and structural tests passed
- [x] T7: Documentation (README catalog entry, schema/ops doc, ownership boundaries)
  - Status: completed
  - Evidence: docs field-name rg and ASCII checks passed
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-v3-001; 20 tests, typecheck, Biome, and docs checks passed

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: `execution-evidence/focused-tests.log`, `biome.log`, `live-subagent.jsonl`, `live-stats.jsonl`; exact smoke reported delegated 1 and referenced run IDs 1
- [x] F2: Repo-wide validation complete (`make check`)
  - Status: completed
  - Evidence: `execution-evidence/full-pi-tests.log` (1197 tests passed) and `execution-evidence/make-check.log` (all checks passed)
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-f3-001; not required because automated isolated live smoke and full suite cover local reversible behavior
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: `execution-evidence/execution-events.jsonl` evt-f4-001; not required, `deployment_required=false`
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: `execution-evidence/archive-preflight.log`; verifier passed, `git diff --check` passed, and boundary-corrected secret scan passed

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Normalize worker usage persistence; fix 3 usage defects | 4 | feature | medium | typescript-pro | -- |
| T2 | New `pi/lib/orchestration-telemetry.ts` schemas/builders/reader | 2 | feature | medium | typescript-pro | T1 |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T1, T2 |
| T3 | `orchestration_run` emission in subagent tool | 2 | feature | medium | backend-dev | V1 |
| T4 | `orchestration_run` emission for background task execution | 3 | feature | medium | backend-dev | T3 |
| T5 | Friction integration + `orchestration_interaction` | 3 | feature | medium | typescript-pro | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T3, T4, T5 |
| T6 | `/orchestration-stats` extension, evidence verifier, and tests | 3 | feature | medium | backend-dev | V2 |
| T7 | Docs: README section, `pi/docs/orchestration-telemetry.md`, boundary notes | 4 | mechanical | small | typescript-pro | V2 |
| V3 | Validate wave 3 | -- | validation | medium | qa-engineer | T6, T7 |

## Execution Waves

### Wave 1 (sequential)

**T1: Normalize worker usage persistence and fix the three subagent usage defects** [medium] -- typescript-pro
- Description: In `pi/extensions/subagent/index.ts`, change the per-worker usage
  accumulation and persistence so that: (a) input, output, cacheRead, and cacheWrite
  are cumulative sums; (b) a new `contextPeakTokens` tracks
  `Math.max(previous, message.usage.totalTokens)` instead of overwriting
  `contextTokens` with the last value; (c) cost becomes nullable -- start at `null`,
  add reported `usage.cost.total` values (a reported 0 is a valid known zero),
  remain `null` when no message reported cost; record `costSource: "pi-usage"`
  when any cost was reported (do not claim provider-reported vs pricing-estimate
  provenance). Define `NormalizedTaskUsage` and its normalizer in
  `pi/lib/task-registry.ts` as the canonical exported shape; T2 imports that exact
  type. Update every `UsageStats.cost` consumer in `subagent/index.ts`, including
  `formatUsageStats` and `aggregateUsage`, so null remains unavailable, known zero
  remains zero, and sums are null only when every contributing cost is unavailable.
  Persist the full normalized shape to the task registry in the
  `taskUsage` passed to `safeTransitionTask` on completed, failed, AND cancelled
  paths, and also persist a partial-usage snapshot on the unexpected-error path
  (`subagent/index.ts` catch around `:940-944`). In `pi/lib/task-registry.ts`, add
  optional `TaskUsage` fields: `processedTokens`, `contextPeakTokens`, `turns`,
  `costUsd?: number | null`, `costSource?: "pi-usage" | "unavailable"`. Map worker
  cacheWrite to the existing `cacheCreationInputTokens` and cacheRead to
  `cacheReadInputTokens` (keep current names; no new cache field names). Keep
  `totalTokens` written with its legacy value for compatibility and mark it
  deprecated in a comment. Compatibility rule: loading or rendering an untouched
  schemaVersion-1 record preserves its exact stored shape; the next usage-bearing
  terminal transition of any record, including a legacy record, writes the additive
  optional normalized fields. No read-time migration or schemaVersion bump occurs.
- Files: `pi/extensions/subagent/index.ts`, `pi/lib/task-registry.ts`,
  `pi/tests/subagent.test.ts` (+ `pi/tests/task-registry.test.ts` additions)
- Mutation boundary: usage accumulation, normalization, formatting/aggregation,
  and persistence code paths only; no event emission, schema-version change, or
  task-lifecycle transition change.
- Acceptance Criteria:
  1. [ ] Multi-message worker persists cumulative input/output/cache sums,
     `contextPeakTokens` = max reported total, and `processedTokens` = sum of the
     four token dimensions
     - Verify: `cd pi && pnpm test subagent.test.ts task-registry.test.ts`
     - Pass: new assertions pass; existing exact-equality assertions
       (`task-registry.test.ts:166-179` legacy shape) still pass unchanged
     - Fail: legacy tests broke -> the new fields leaked into legacy write paths;
       make them strictly additive
  2. [ ] Missing cost persists as `costUsd: null` with `costSource: "unavailable"`;
     a reported zero persists as `0` with `costSource: "pi-usage"`
     - Verify: `cd pi && pnpm test subagent.test.ts`
     - Pass: both cases asserted and green
     - Fail: cost coerced to 0 -> initialization still numeric; keep null seed
  3. [ ] Cancelled and error paths persist the partial usage snapshot, and a
     legacy schemaVersion-1 record transitioned through completed/failed/cancelled
     receives only the documented additive usage fields
     - Verify: `cd pi && pnpm test subagent.test.ts task-registry.test.ts`
     - Pass: abort-path usage is present; exact fixtures prove untouched legacy
       reads remain shape-compatible and terminal updates are additive
     - Fail: usage lost or read-time migration occurs -> centralize the terminal
       snapshot and remove mutation from deserialization

**T2: Create `pi/lib/orchestration-telemetry.ts`** [medium] -- typescript-pro
- Blocked by: T1
- Description: New shared lib owning the closed event contract and importing T1's
  canonical normalized usage type rather than defining a second shape. Exports:
  (1) TypeScript types for `orchestration_run` and `orchestration_interaction`
  payloads (data.schemaVersion 1, distinct from the metrics envelope
  schemaVersion); (2) builder functions `buildOrchestrationRunEvent(...)` and
  `buildOrchestrationInteractionEvent(...)` that accept only documented fields,
  validate closed enums (mode: `single|parallel|chain|team|task-execute`; status;
  costSource), bound strings (agent/model/provider <= 120 chars), require retained
  identity strings to match a conservative metadata grammar after sanitization
  (letters, digits, spaces, `.`, `_`, `-`, `/`, `:`, `@`; reject control chars,
  URL userinfo, JWT/bearer/private-key/assignment-shaped credentials), and arrays
  (workers <= 32, orchestrationIds <= 64, parentUsageByModel <= 8), normalize
  numbers (finite, nonnegative, else dropped), run every retained string through
  `sanitizeTaskValue` from `pi/lib/task-security.ts`, and reject unknown keys --
  these builders are the only path to `recordEvent` for orchestration events;
  (3) a streaming multi-day reader `readOrchestrationEvents({dir, days, now})`
  that enumerates `metrics-YYYY-MM-DD.jsonl` files intersecting the UTC window
  plus legacy `metrics.jsonl`, filters by parsed event `ts`, validates envelope
  and payload versions separately, counts malformed/unsupported/over-limit lines,
  and deduplicates by envelope `id`. Bound work to at most 367 files, 8 MiB per
  line, 256 MiB total input, and 10,000 malformed lines; stop at a bound and return
  an explicit truncated diagnostic instead of hanging the slash command. `orchestration_run` worker entries carry: runId,
  taskId?, agent, resolvedModel?, status, exitCode?, durationMs, outputMode,
  childTextBytes, parentVisibleBytes, artifactBytes?, chainTransferBytes?,
  usage (normalized shape from T1), turns. Run rollup carries: orchestrationId,
  parentSessionId?, interactionId?, mode (pre-rewrite), fanOut, status,
  durationMs, childWorkMs, output byte rollup with
  `inlineBytesNotReturned = max(0, childTextBytes - parentVisibleBytes)`.
  `orchestration_interaction` carries only: interactionId, orchestrationIds,
  parentUsageByModel[] ({provider, model, inputTokens, outputTokens,
  cacheReadTokens, cacheWriteTokens, contextPeakTokens, costUsd, costSource}),
  durationMs, direct boolean. No prompts, output, stderr, commands, paths,
  outcome text, or failure reasons anywhere.
- Files: `pi/lib/orchestration-telemetry.ts` (new),
  `pi/tests/orchestration-telemetry.test.ts` (new)
- Mutation boundary: new files only; no edits to existing modules.
- Acceptance Criteria:
  1. [ ] Builders reject unknown keys and content-bearing fields, bound arrays and
     strings, and never emit non-finite numbers
     - Verify: `cd pi && pnpm test orchestration-telemetry.test.ts`
     - Pass: schema tests green, including a test that a synthetic secret-like
       string in an agent name is redacted by `sanitizeTaskValue`
     - Fail: unknown key accepted -> builder must whitelist, not blacklist
  2. [ ] Multi-day reader spans UTC day boundaries, includes legacy
     `metrics.jsonl`, filters by event `ts`, dedupes by envelope id, and reports
     malformed-line counts
     - Verify: `cd pi && pnpm test orchestration-telemetry.test.ts` (fixture files
       across 3 synthetic days written to a temp `PI_METRICS_DIR`)
     - Pass: exact expected event sets returned per window; diagnostics counted
     - Fail: current-day-only results -> reader is using `getMetricsLogPath()`;
       it must enumerate files itself
  3. [ ] Structural rule holds: no same-basename
     `pi/extensions/orchestration-telemetry.ts` sibling
     - Verify: `cd pi && pnpm test runtime-smoke.test.ts`
     - Pass: existing helper-placement collision test is green
     - Fail: basename collision -> rename or relocate
  4. [ ] Reader bounds and identifier privacy rules fail closed
     - Verify: `cd pi && pnpm test orchestration-telemetry.test.ts`
     - Pass: oversized/truncated lines and excess files produce deterministic
       diagnostics; credential/content-shaped values in every retained string
       position are rejected or redacted
     - Fail: unbounded read or credential-shaped string retained -> tighten the
       reader/builder before integration

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T1, T2
- Checks:
  1. Run all acceptance criteria for T1 and T2 as written
  2. `cd pi && pnpm test subagent.test.ts task-registry.test.ts task-tools.test.ts orchestration-telemetry.test.ts runtime-smoke.test.ts` -- all pass
  3. `cd pi && pnpm run typecheck` -- exit 0
  4. `cd pi && pnpm exec biome check lib/orchestration-telemetry.ts lib/task-registry.ts extensions/subagent/index.ts` -- no diagnostics
  5. Cross-task: T1's normalized usage type is imported by T2's worker entry type
     (one shape, not two parallel definitions)
- On failure: create a fix task, re-validate after fix

### Wave 2 (parallel branches: T3 and T5; T4 follows T3)

**T3: Emit `orchestration_run` from the subagent tool** [medium] -- backend-dev
- Description: In `pi/extensions/subagent/index.ts`, first extend `runSingleAgent`
  with an optional execution-attempt runId override (preserving its current default
  behavior) so T4 can propagate its durable attempt ID, then instrument tool
  `execute()` (~`:1125`):
  create one `orchestrationId` (crypto.randomUUID) per invocation; snapshot the
  original mode BEFORE team-parameter rewriting (`:1153-1160` rewrites team ->
  single) so team dispatch is not reported as single; measure wall-clock duration
  for the whole invocation and per worker (capture start/end around
  `runSingleAgent`); compute byte facts with `Buffer.byteLength(text, "utf-8")`:
  per-worker `childTextBytes` from `getFinalOutput()`, `artifactBytes` from
  `outputReference?.bytes` (never reopen files), `parentVisibleBytes` measured at
  the FINAL tool-result boundary (the exact text returned to the parent,
  including parallel framing from `aggregateParallelOutputs` at `:1458/:486-513`
  and error-path text at `:1330-1335`) -- attribute parallel framing to the run
  rollup, not to individual workers; for chain mode record `chainTransferBytes`
  for intermediate steps (forwarded at `:1274-1278,1346-1349`) and set their
  `parentVisibleBytes` to 0, with only the final step contributing
  (`:1350-1355`). Route every return/error path (including invalid parameters,
  missing agent/team, confirmation rejection, and thrown errors) through one
  shared finalization that emits exactly one `orchestration_run` via the T2
  builder, passing `session` explicitly to `recordEvent`. Register the
  orchestrationId with the T5 interaction registration API when available (import
  from `pi/lib/workflow-friction.ts`; call is a no-op if no interaction is
  active). Also pass the worker usage into the event from T1's normalized shape.
- Files: `pi/extensions/subagent/index.ts`, `pi/tests/subagent.test.ts`
- Mutation boundary: subagent extension only; no changes to task registry schema,
  metrics lib, or friction lifecycle beyond calling the registration API.
- Acceptance Criteria:
  1. [ ] Single, parallel, chain, and team invocations each emit exactly one
     `orchestration_run` with correct mode, fanOut, per-worker status/duration,
     and byte fields (fixture asserts framing bytes in rollup, chain intermediate
     `chainTransferBytes` > 0 with `parentVisibleBytes` 0)
     - Verify: `cd pi && pnpm test subagent.test.ts` with `PI_METRICS_DIR`
       redirected to a temp dir in the test setup
     - Pass: one event per invocation; team mode reported as `team`
     - Fail: two events or mode `single` for team -> finalization not shared or
       mode sampled post-rewrite
  2. [ ] Error/rejection paths emit a run event with failure status and no
     content-bearing fields
     - Verify: `cd pi && pnpm test subagent.test.ts`
     - Pass: invalid-agent test finds one event, no stderr/failure text in payload
     - Fail: missing event -> early return bypassed finalization
  3. [ ] No test writes reach the default metrics path
     - Verify: assertion in test teardown that the real
       `~/.pi/agent/logs` daily file gained no orchestration events during the run
     - Pass: teardown check green
     - Fail: env var not set before module import -> set in beforeAll like
       `observability.test.ts:17-47`

**T4: Emit `orchestration_run` for background task execution** [medium] -- backend-dev
- Blocked by: T3
- Description: In `pi/extensions/tasks/execution.ts`, the
  `TaskExecutionCoordinator` owns the `task-execute` orchestration envelope
  because `start()` returns while work continues (`:176-243`) and `runSingleAgent`
  does not know the coordinator's execution-attempt UUID (`:211-217`). Create the
  orchestrationId in `start()` and persist it, the active interactionId, and
  `startedAt` on `SubagentTaskExecution` in the same pre-launch update as the
  execution-attempt `runId`; retries create fresh run/orchestration IDs. Pass the
  attempt runId through T3's override so child `PI_SUBAGENT_RUN_ID` is the attempt,
  not the durable taskId. Expand `TaskExecutionRunResult` to preserve a closed,
  content-free telemetry result from `SingleResult`: normalized usage, turns,
  resolved model, timing, byte facts, exit/status. Fake runners return the same
  shape with explicit null/unavailable fields. Emit exactly one terminal
  `orchestration_run` (mode `task-execute`, fanOut 1) covering completed, failed,
  stopped/cancelled, or terminal stop-timeout. Use an idempotent settlement guard
  keyed by orchestrationId so timeout/shutdown and late runner completion cannot
  double-emit or overwrite terminal state. For `reconcileOrphans` (`:365-384`),
  reuse persisted IDs/start time and emit status `orphaned`; usage/model/byte fields
  unavailable after a crash are null or omitted per T2, never fabricated. Do not emit at `start()`
  acceptance; the parent's `orchestration_interaction` records the association
  via the registration API (call it in `start()` when an interaction is active).
- Files: `pi/extensions/tasks/execution.ts`, `pi/lib/task-registry.ts`,
  `pi/tests/task-execution.test.ts`
- Mutation boundary: coordinator/result contract and additive execution-attempt
  fields only; injected test runners bypass
  `runSingleAgent` (`:174` constructor injection), so telemetry emission must
  live in coordinator code, not the runner, and tests assert coordinator-level
  events with fake runners (`task-tools.test.ts:121-125,173-181` pattern).
- Acceptance Criteria:
  1. [ ] Completed, failed, and stopped executions each emit exactly one terminal
     run event with mode `task-execute`, the attempt runId, and the durable taskId
     - Verify: `cd pi && pnpm test task-execution.test.ts task-tools.test.ts`
     - Pass: one event per attempt; retry creates a second event with a new runId
     - Fail: zero events with injected runner -> emission sits in
       `runTaskSubagent` instead of the coordinator; move it
  2. [ ] Orphan reconciliation reuses persisted orchestration/run/interaction IDs,
     reports missing usage/model/bytes as unavailable, and retry uses new IDs
     - Verify: `cd pi && pnpm test task-execution.test.ts`
     - Pass: crash-shaped persisted fixture joins correctly; no fabricated zeros
     - Fail: silent/unjoinable orphan -> IDs were not persisted pre-launch
  3. [ ] Stop timeout, shutdown, and late runner completion produce one terminal
     event and one stable terminal task state
     - Verify: `cd pi && pnpm test task-execution.test.ts`
     - Pass: fake timer + late promise resolution cannot duplicate emission
     - Fail: duplicate or state overwrite -> settlement guard is not the owner
  4. [ ] Child env receives the attempt runId
     - Verify: `cd pi && pnpm test subagent.test.ts task-execution.test.ts`
     - Pass: spawn-env assertion shows `PI_SUBAGENT_RUN_ID` = attempt UUID for
       coordinator-launched work; direct subagent tool calls keep current behavior
     - Fail: taskId still passed -> runId override not plumbed through

**T5: Friction-lifecycle integration and `orchestration_interaction`** [medium] -- typescript-pro
- Description: (a) In `pi/lib/workflow-friction.ts`: fix task-execute counting by
  using `isTaskExecutionTrace()` in `interactionMetadataFromPacket` instead of the
  dead `"task_execute"` name match (`:276-279` vs `:122-136`); add a small
  lib-owned lifecycle API following the `noteWorkflowSubmission` pattern:
  `activateOrchestrationInteraction({interactionId,sessionId})`,
  `registerOrchestrationInvocation(orchestrationId)`,
  `noteParentAssistantUsage({provider,model,usage})`,
  `settleOrchestrationInteraction(interactionId)` (atomic consume+clear), and
  `resetOrchestrationInteraction(sessionId?)`. Registration is bounded at 64 and
  no-ops without the matching active owner; usage accumulates per provider+model.
  The extension activates at `before_agent_start`, settles once at `agent_settled`,
  and resets on session replacement/shutdown. Also export a
  `workflowFrictionStorageRoot()` resolver honoring `PI_WORKFLOW_FRICTION_DIR`
  before the current agent-dir fallback. (b) In
  `pi/extensions/workflow-friction-review.ts`: feed `message_end` assistant usage
  (provider/model/usage are on the message) into `noteParentAssistantUsage`
  immediately after the assistant-role check and BEFORE the text-presence guard;
  expose the active `interactionId` so the subagent
  and coordinator emitters can stamp it into run events; at `agent_settled`,
  after existing metadata persistence, emit one thin `orchestration_interaction`
  via the T2 builder for every eligible TOP-LEVEL interaction (skip child
  sessions: `process.env.PI_SUBAGENT_RUN_ID` set), with `orchestrationIds: []`
  and `direct: true` for non-delegating interactions. Do not include worker
  rollups, validation counts, or outcome labels -- those are derived at report
  time from run events and friction metadata. Module state must clear on
  `session_shutdown`/session replacement (fresh extension instances on
  /reload,/new -- verify no stale cross-session accumulation).
- Files: `pi/lib/workflow-friction.ts`, `pi/extensions/workflow-friction-review.ts`,
  `pi/tests/workflow-friction.test.ts`
- Mutation boundary: friction lib/extension only; existing friction metadata
  fields and reviews.jsonl/interactions.jsonl formats unchanged except the
  task-execute counting fix.
- Acceptance Criteria:
  1. [ ] A `task` tool trace with `action: "execute"` increments `subagentCount`;
     the old `"task_execute"` name no longer matches anything real
     - Verify: `cd pi && pnpm test workflow-friction.test.ts`
     - Pass: updated counting test green
     - Fail: count unchanged -> helper still unused in metadata path
  2. [ ] Settled top-level interactions emit exactly one
     `orchestration_interaction`: delegated ones carry registered
     orchestrationIds; direct ones carry `orchestrationIds: []` and
     `direct: true`; child sessions emit nothing
     - Verify: `cd pi && pnpm test workflow-friction.test.ts` with
       `PI_METRICS_DIR` redirected
     - Pass: all three cases asserted
     - Fail: delegated-only emission -> emit unconditionally at settlement for
       top-level interactions
  3. [ ] Two different assistant models, including a usage-bearing assistant
     message with no text, produce complete `parentUsageByModel` groups; effort is
     absent (never guessed from settlement-time state)
     - Verify: `cd pi && pnpm test workflow-friction.test.ts`
     - Pass: grouped sums include the textless/tool-call turn exactly once; no
       `effort` key present
     - Fail: missing usage -> accounting remains behind the text guard
  4. [ ] New/reload/shutdown/session-replacement and duplicate-settlement fixtures
     clear or consume the lib-owned lifecycle exactly once
     - Verify: `cd pi && pnpm test workflow-friction.test.ts`
     - Pass: no stale IDs/usage cross sessions and no duplicate interaction event
     - Fail: module state survives -> lifecycle bridge lacks a reset transition

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T3, T4, T5
- Checks:
  1. Run all acceptance criteria for T3, T4, T5 as written
  2. `cd pi && pnpm test subagent.test.ts task-execution.test.ts task-tools.test.ts tasks.test.ts workflow-friction.test.ts observability.test.ts orchestration-telemetry.test.ts` -- all pass; observability tests must filter by event type rather than assume `readRecentEvents()[0]` is a timing span (`observability.test.ts:49-61`) -- fix them if the new events break positional assumptions
  3. `cd pi && pnpm run typecheck` -- exit 0
  4. `cd pi && pnpm exec biome check extensions/subagent/index.ts extensions/tasks/execution.ts lib/workflow-friction.ts extensions/workflow-friction-review.ts` -- clean
  5. Cross-task integration: run events from T3/T4 carry the interactionId exposed
     by T5 when active; interaction events reference the same orchestrationIds,
     including after persisted background reconciliation (joinability asserted)
  6. Duplicate-lifecycle check: a retried/queued continuation settles once and
     emits one interaction event (no double emission)
- On failure: create a fix task, re-validate after fix

### Wave 3 (parallel)

**T6: `/orchestration-stats` reporting extension** [medium] -- backend-dev
- Description: New `pi/extensions/orchestration-stats.ts` (default extension
  factory; slash command only, NO model-callable tool). `/orchestration-stats
  [days]` (default 7, cap 365) uses the T2 multi-day reader honoring
  `PI_METRICS_DIR` and reports: collection status (metrics enabled/disabled via
  `getMetricsConfig()`, files scanned, window, malformed counts); interactions
  (direct vs delegated counts from interaction events); cost (known parent cost,
  known worker cost, `knownCostUsd` totals, count of runs/models with
  unavailable cost -- never sum null as zero); context (worker output bytes,
  returned inline bytes, `inlineBytesNotReturned` -- label it "worker output not
  returned inline", parent input/cacheRead token sums by model); latency
  (interaction and run-wall p50/p95 plus child-work duration; do not present a
  synthetic concurrency-overlap savings metric in the MVP); quality (run status
  distribution incl. orphaned/pending, worker failure count, friction
  classification join by interactionId over
  `workflowFrictionStorageRoot()/reviews.jsonl` reporting productive/mixed/
  churn/uncertain/failed/pending/unreviewed/unmatched); tables by parent model
  and by worker model. Pending runs = orchestrationIds referenced by
  interactions with no terminal run event -- report as pending, never as zero
  cost/duration. Deterministic output: stable sort keys, defined percentile
  method (nearest-rank), UTC window, explicit zero-denominator handling.
  Render with `pi.sendMessage({customType, content, display: true},
  {triggerTurn: false})` following `router-stats.ts`. The report is
  observational; print one line stating causal savings claims require matched
  cohorts (deferred). Add `pi/scripts/orchestration-telemetry-verify.mjs`, a
  deterministic no-network archive verifier with explicit `--plan`,
  `--evidence-dir`, and `--smoke-dir` arguments. It validates JSONL structure and
  required fields, checklist status/evidence for T1-T7/V1-V3/F1-F4, fresh-smoke
  directory containment, exact run-to-interaction join/count, nonempty command
  captures, and forbidden content-bearing event keys; it expects F5 pending so its
  own success can become F5 evidence.
- Files: `pi/extensions/orchestration-stats.ts` (new),
  `pi/scripts/orchestration-telemetry-verify.mjs` (new),
  `pi/tests/orchestration-stats.test.ts` (new)
- Mutation boundary: new files only.
- Acceptance Criteria:
  1. [ ] Synthetic fixture (3 days of events: single/parallel/chain/team/
     task-execute runs, direct + delegated interactions, one pending run, one
     unavailable-cost run, one malformed line, one orphaned run) renders the full
     report with exact expected numbers and stable ordering across two runs
     - Verify: `cd pi && pnpm test orchestration-stats.test.ts`
     - Pass: snapshot/exact-string assertions green twice
     - Fail: ordering unstable -> add explicit sort tie-breakers
  2. [ ] Unavailable cost never becomes zero; pending runs excluded from latency
     percentiles and cost sums but counted in the pending line
     - Verify: `cd pi && pnpm test orchestration-stats.test.ts`
     - Pass: totals match hand-computed fixture values
     - Fail: totals off by pending/unavailable entries -> filter before aggregate
  3. [ ] Evidence verifier fails for missing fields, placeholder checklist
     evidence, stale/multiple smoke runs, unmatched IDs, roots outside smoke,
     forbidden content keys, and malformed JSONL; passes a complete fixture with
     F5 pending
     - Verify: `cd pi && pnpm test orchestration-stats.test.ts`
     - Pass: subprocess fixtures assert nonzero for each defect and zero for the
       complete fixture
     - Fail: malformed/incomplete evidence passes -> tighten verifier before use
  4. [ ] Registered slash-command path parses `1`, calls the reader, and sends the
     deterministic report with `triggerTurn: false`; no model-callable tool exists
     - Verify: `cd pi && pnpm test orchestration-stats.test.ts tool-search.test.ts runtime-smoke.test.ts`
     - Pass: mock ExtensionAPI invokes the registered handler and asserts exact
       `sendMessage`; tool-search/runtime-smoke remain unchanged and green
     - Fail: helper-only coverage or tool count changed -> exercise
       `registerCommand` and remove any `registerTool` usage

**T7: Documentation** [small] -- typescript-pro
- Description: (a) `pi/README.md`: add a `### orchestration-stats.ts` extension
  catalog entry and extend the workflow-friction section to mention interaction
  telemetry emission; document storage location, `metrics.enabled` opt-out,
  best-effort/no-retention semantics, the no-content privacy rule,
  `PI_WORKFLOW_FRICTION_DIR`, a warning against shared/synced metrics directories,
  and a bounded purge procedure that backs up then removes only identified
  orchestration lines (or deletes a dedicated scratch metrics directory).
  (b) New `pi/docs/orchestration-telemetry.md`: event schemas (field tables for
  both events), ID vocabulary (orchestrationId vs taskId vs runId vs
  interactionId vs envelope id), join keys, reader semantics, report term
  definitions ("worker output not returned inline", wall duration, child-work
  duration, and the observational-only caveat), plus the legacy `totalTokens`
  deprecation policy.
  (c) One-paragraph ownership boundary added to
  `pi/docs/workflow-eval-telemetry.md` and `pi/docs/workflow-eval-operations.md`:
  workflow telemetry owns command-lifecycle episodes; orchestration telemetry
  owns delegation topology/usage/cost; correlation is by explicit IDs. ASCII
  punctuation, LF, no AI mentions.
- Files: `pi/README.md`, `pi/docs/orchestration-telemetry.md` (new),
  `pi/docs/workflow-eval-telemetry.md`, `pi/docs/workflow-eval-operations.md`
- Mutation boundary: documentation only; no code.
- Acceptance Criteria:
  1. [ ] Docs exist, match implemented field names exactly (spot-check against
     `pi/lib/orchestration-telemetry.ts` exports), and contain no non-ASCII
     punctuation
     - Verify: `rg -n "orchestration_run|orchestration_interaction" pi/docs/orchestration-telemetry.md pi/README.md` and `python -c "open('pi/docs/orchestration-telemetry.md',encoding='ascii').read()"`
     - Pass: rg finds both event names in both files; ascii read raises nothing
     - Fail: encoding error -> replace smart punctuation with ASCII

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- qa-engineer
- Blocked by: T6, T7
- Checks:
  1. Run all acceptance criteria for T6 and T7 as written
  2. `cd pi && pnpm test orchestration-stats.test.ts tool-search.test.ts runtime-smoke.test.ts` -- pass
  3. `cd pi && pnpm run typecheck && pnpm exec biome check extensions/orchestration-stats.ts` -- clean
  4. Docs cross-check: every field name in `pi/docs/orchestration-telemetry.md`
     exists in the lib types (no drift)
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```
Wave 1: T1 -> T2 -> V1
Wave 2: (T3 || T5), then T3 -> T4; T3, T4, T5 -> V2
Wave 3: T6, T7 (parallel, blocked by V2) -> V3
Final:  F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] Live end-to-end smoke: run the exact two Pi commands in Automation Plan
   after setting all three scratch roots before process initialization
   - Verify: both commands exit 0; inspect `$smoke/metrics/metrics-*.jsonl`,
     `execution-evidence/live-subagent.jsonl`, and `live-stats.jsonl`
   - Pass: exactly one `orchestration_run` and at least its corresponding settled
     `orchestration_interaction` have matching IDs; report shows the delegated
     observation with non-zero worker tokens/bytes; no prompt/output text appears
     in orchestration event payloads; every metrics/operator/friction file created
     by the smoke is under `$smoke`
   - Fail: auth unavailable, command nonzero, missing settlement, or real-home write
     -> exact workflow is blocked; do not substitute mock evidence or archive
2. [ ] Legacy compatibility holds: existing task records under
   `~/.pi/agent/operator/tasks/` still list/render via `/tasks` unchanged
   - Verify: `cd pi && pnpm test tasks.test.ts task-registry.test.ts` using exact
     legacy JSON fixtures and the real `/tasks` command handler mock
   - Pass: no schema errors; untouched records retain their exact shape; updated
     legacy records gain only documented additive usage fields
3. [ ] Full suite and repo gate green
   - Verify: `cd pi && pnpm test` then `make check` from repo root
   - Pass: both exit 0 with no new warnings

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- All validation steps run through documented pnpm/make/Pi commands; run with
  `set -o pipefail` and capture logs under `execution-evidence/`.
- Credentials: the live smoke uses existing Pi provider auth through normal
  credential resolution. Never inspect/copy secrets and never use `--api-key`.
- Manual-only steps: none.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command set for this project.
   - Command: `make check` (after `cd pi && pnpm test` and `cd pi && pnpm run typecheck`)
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

### Manual validation

- Required: no
- Justification: Automated validation is sufficient. Local reversible telemetry
  code in a personal repo; the live smoke is agent-runnable.
- Steps:
  1. None.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all required automated validation,
task-specific verification, the exact live smoke, repo-wide validation, and the
Automation Plan archive-preflight command pass; every checklist item must contain a
non-secret evidence path and execution status. Auth failure or missing exact-workflow
evidence blocks archive. Manual and deployment gates are not required.

## Telemetry & Evidence Contract

Runtime does not yet emit all workflow-eval fields, so `/do-it` must append one JSON
object per phase to
`.specs/pi-orchestration-telemetry/execution-evidence/execution-events.jsonl` and
update the matching checklist Evidence line immediately after verification. Each
object records episode ID (`episode_id`), phase ID (`phase_id`), task ID (`task_id`),
validation command (`validation_command`), `status`, `archive_status`, `started_at`,
`completed_at`, and non-secret evidence paths. Logs, scratch metrics path, report
capture, and archive-preflight result live under the same evidence root.

Adaptive review fields for this plan:

- `plan_profile`: domains [pi-extension, typescript, telemetry]; files_estimated 12;
  tasks 7; waves 3; dependency_depth 3; validation_commands 5; external_systems 0;
  deployment_required false; manual_gate_required false; credentials_required true
  (existing Pi auth only); risk_level medium; blast_radius personal-repo plus one
  bounded provider call; rollback easy for code but telemetry purge is separate;
  destructive_potential false; paid_or_quota_resource true (bounded smoke);
  secret_exposure_risk false;
  shared_user_impact false.
- `review_panel_decision`: complexity_score 6; risk_score 2; recommended_reviewer_count 6
  (3 standard + domain personas: TypeScript runtime reviewer on subagent/friction
  hot paths, data/reporting reviewer on schema+aggregation determinism, QA reviewer
  on test isolation and legacy compatibility). Expected high-risk areas: legacy
  TaskUsage compatibility, friction lifecycle regression (double emission, stale
  module state), `PI_METRICS_DIR` test isolation leaks, privacy builder
  completeness, chain/team byte-accounting correctness. Note: the design itself was
  already panel-reviewed pre-plan (artifacts in
  `.tmp/orchestration-telemetry-review/`); reviewers should focus on this plan's
  task decomposition and contracts rather than re-litigating the design choice.

## Handoff Notes

- The pre-plan review artifacts in `.tmp/orchestration-telemetry-review/`
  (especially `synthesis.md`) contain file:line evidence for every defect and
  constraint cited here; consult them if a line number has drifted.
- `pi/extensions/subagent/index.ts` is hot and large (~1.9k lines); T1 and T3 both
  touch it but in different regions (usage accumulation vs execute()/finalization).
  T3 runs in a later wave to avoid merge conflicts.
- `@earendil-works/*` deps are linked from pnpm-global; if imports fail after
  `pnpm install`, run `scripts/pi-deps-link-setup`.
- Friction module state uses module-level singletons; tests must reset via the
  exported reset/consume helpers rather than re-importing.
- Metrics event envelope `session` is NOT auto-populated -- emitters must pass it
  explicitly (`pi/lib/metrics.ts:93-100`).
- The worktree contains unrelated uncommitted changes; never commit, and keep
  `git status` diffs scoped to the files listed per task.

## Execution Status

- Overall: completed
- Classification: completed-and-archived
- Date: 2026-07-11
- Last completed wave/gate: F5 archive preflight
- Next ready wave/gate: none
- Completed work: T1-T7, V1-V3, focused validation, full Pi suite, exact live smoke, `make check`, manual/deployment decisions, and archive preflight
- Commands/results: focused suite 116 passed; full Pi suite 1197 passed; `make check` passed; live report showed delegated 1 and referenced run IDs 1; archive verifier passed
- Repairs: scoped Biome formatting; test metrics isolation; process-global friction lifecycle bridge; run interactionId stamping; archive verifier self-capture handling; Git Bash path conversion for live smoke
- Blocker: none
- Remaining checks: none
- Exact user actions: none
- Rerun `/do-it`: not appropriate after archive
- Evidence root: `.specs/pi-orchestration-telemetry/execution-evidence/`
- Archive status: archived at `.specs/archive/pi-orchestration-telemetry/`

## Workflow Eval Record

- Episode ID: `do-it-orchestration-telemetry-20260710T210500Z`
- Execution outcome: `completed-and-archived`; all checklist and validation gates passed
- Archive status: archived at `.specs/archive/pi-orchestration-telemetry/` after collision-safe preflight
- Validation failures before repair: Biome formatting, live Git Bash path conversion, missing live run-to-interaction registration, missing run interactionId, verifier self-capture, and over-broad secret-scan token; each was repaired and revalidated
- Manual gate: not required; local reversible behavior covered by isolated automated validation
- Deployment gate: not required
- Checklist: T1-T7, V1-V3, F1-F5 complete with evidence
- Friction tags: `validation-repair`, `live-smoke-caught-unit-gap`, `git-bash-path-conversion`, `verifier-self-reference`
- Missing evidence: none
- Improvement candidate: keep real CLI smoke because it caught separate extension module identities that isolated tests initially missed
- Eval confidence: high; archive verifier, exact live workflow, full suite, and repo gate passed
- `execution_outcome`: completed=true, blocked_by_plan_gap=false, validation_failures_after_review=6, manual_gate_ambiguity=false, archive_issue=false, missed_by_review=[cross-jiti module identity, Git Bash argument conversion, verifier self-capture]
- `panel_quality_label`: sizing=right_sized, reason=reviewed plan was executable but live validation found runtime integration gaps, confidence=medium
- Hidden panel: launch attempted twice because repaired validation failures triggered review; evaluator agents exited before producing findings. Deterministic archive/evidence checks remain authoritative and found no completion inconsistency.
