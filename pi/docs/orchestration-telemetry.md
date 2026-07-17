# Orchestration Telemetry

Orchestration telemetry records bounded, metadata-only measurements for delegated
work. It uses the existing metrics JSONL stream and has two event names:
`orchestration_run` and `orchestration_interaction`.

## Storage, privacy, and retention

Events are appended best-effort to `~/.pi/agent/logs/metrics-YYYY-MM-DD.jsonl`
when daily rotation is enabled, or `~/.pi/agent/logs/metrics.jsonl` for the
legacy stream. `PI_METRICS_DIR` changes that root. Set `metrics.enabled` to
`false` to opt out of all metrics writes.

The metrics writer has no retention or purge job. The caller owns retention.
Do not set `PI_METRICS_DIR` to a shared or synced directory. Treat local metrics
as sensitive operational metadata even though these event schemas reject content
fields. They retain identifiers, worker identity, model metadata, status,
durations, byte counts, token counts, and cost metadata. They do not retain
prompts, child output, terminal output, tool arguments, or response content.

For a bounded purge, first stop writers for the target directory and make a
backup of one identified metrics file. Then remove only JSONL records whose
`event` is `orchestration_run` or `orchestration_interaction`, verify the backup
and retained record count, and replace only that identified file. Do not purge a
shared metrics root. For a dedicated scratch `PI_METRICS_DIR`, remove the whole
scratch directory only after confirming it contains no other records.

## Event envelope

Every stored record uses the metrics envelope below. The event payload is in
`data`.

| Field | Meaning |
|---|---|
| `schemaVersion` | Metrics envelope schema version; currently `1`. |
| `id` | Unique envelope record ID. |
| `ts` | Event timestamp in ISO-8601 form. |
| `event` | `orchestration_run` or `orchestration_interaction`. |
| `session` | Optional session identifier. |
| `data` | Event-specific payload. |

## `orchestration_run`

A run describes one delegated orchestration invocation. `schemaVersion` in this
payload is always `1`.

| Field | Required | Meaning |
|---|---:|---|
| `schemaVersion` | yes | Orchestration payload schema version. |
| `orchestrationId` | yes | Invocation identity. |
| `parentSessionId` | no | Parent session identity when available. |
| `interactionId` | no | Parent interaction identity for correlation. |
| `mode` | yes | `single`, `parallel`, `chain`, `team`, or `task-execute`. |
| `fanOut` | no | Worker count requested by the invocation. |
| `status` | yes | Run status. |
| `durationMs` | no | Wall duration from invocation start to settlement. |
| `childWorkMs` | no | Sum of worker duration, not elapsed wall time. |
| `childTextBytes` | no | Total child text byte count. |
| `parentVisibleBytes` | no | Child text bytes returned to the parent. |
| `artifactBytes` | no | Child output bytes stored as artifacts. |
| `chainTransferBytes` | no | Bytes forwarded between chain steps. |
| `inlineBytesNotReturned` | yes | Derived `max(0, childTextBytes - parentVisibleBytes)`. |
| `workers` | yes | Zero to 32 worker records. |

Run and worker `status` values are `pending`, `running`, `completed`, `failed`,
`cancelled`, `stopped`, `failed_to_stop`, `orphaned`, or `rejected`.

### Worker record

| Field | Required | Meaning |
|---|---:|---|
| `runId` | yes | One worker execution identity. |
| `taskId` | no | Durable task identity when this worker has one. |
| `agent` | yes | Sanitized worker identity. |
| `resolvedModel` | no | Sanitized resolved model identity. |
| `experimentId` | no | Fixed routing experiment identity for sampled policy dispatches. |
| `experimentArm` | no | `terra-baseline`, `luna-high`, or `sol-low`. |
| `experimentTaskClass` | no | Dispatch origin such as `subagent-single` or `task-execute-modelSize`. |
| `validationOutcome` | no | `passed`, `failed`, or `unavailable` when the run is sampled. |
| `status` | yes | Worker status. |
| `exitCode` | no | Nonnegative process exit code. |
| `durationMs` | no | Worker wall duration. |
| `outputMode` | no | `inline`, `artifact`, or `none`. |
| `childTextBytes` | no | Worker-produced text byte count. |
| `parentVisibleBytes` | no | Worker text byte count visible to the parent. |
| `artifactBytes` | no | Worker output byte count written to an artifact. |
| `chainTransferBytes` | no | Worker text byte count forwarded to a chain step. |
| `usage` | no | Normalized worker usage record. |
| `turns` | no | Worker turn count. |

The normalized `usage` record has these fields: `inputTokens`, `outputTokens`,
`totalTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`,
`processedTokens`, `contextPeakTokens`, `turns`, `costUsd`, and `costSource`.
`costSource` is `pi-usage` or `unavailable`. A `costUsd` value is nonnegative
when `costSource` is `pi-usage`; it is `null` when `costSource` is
`unavailable`.

`totalTokens` is retained only for schema version 1 compatibility. New analysis
must use `processedTokens`, which includes input, output, cache creation, and
cache read tokens.

### Routing outcome sampling

Policy-resolved `modelSize` dispatches are assigned deterministically to the
`codex-routing-outcomes-v1` experiment at a default rate of 10 percent. The
three data-defined arms are Terra at medium effort, Luna at high effort, and Sol
at low effort. Explicit model or effort overrides and continued sessions are
never sampled. Set `PI_ROUTING_OUTCOME_SAMPLE_RATE=0` to disable sampling; values
from 0 through 1 are accepted. At zero, model resolution and telemetry remain on
the unsampled path.

The assignment hash uses the run or task identity, so retries of one identity
stay in one arm. Sampled worker rows use the existing status, exit code,
duration, turns, usage, and cost fields alongside the experiment tags. A result
without a structured validation contract records `validationOutcome` as
`unavailable` rather than inferring quality from process success.

## `orchestration_interaction`

An interaction describes one parent interaction, whether it delegated work or
not. `schemaVersion` in this payload is always `1`.

| Field | Required | Meaning |
|---|---:|---|
| `schemaVersion` | yes | Orchestration payload schema version. |
| `interactionId` | yes | Parent interaction identity. |
| `orchestrationIds` | yes | Zero to 64 correlated orchestration invocation identities. |
| `parentUsageByModel` | yes | Zero to 8 parent usage records grouped by provider and model. |
| `durationMs` | no | Parent interaction wall duration. |
| `direct` | yes | `true` when `orchestrationIds` is empty. |

Each `parentUsageByModel` record contains `provider`, `model`, `inputTokens`,
`outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `contextPeakTokens`,
`costUsd`, and `costSource`. `provider`, `model`, and `costSource` are required;
the token and cost fields are optional. `costSource` is `pi-usage` or
`unavailable`, with the same `costUsd` rule as worker usage.

## IDs and joins

- `id` is the metrics-envelope record ID. It deduplicates stored records.
- `orchestrationId` identifies one delegation invocation and joins a run to the
  matching member of `orchestrationIds`.
- `runId` identifies one worker execution inside a run.
- `taskId` identifies a durable task when a worker comes from task execution. It
  is not an orchestration invocation ID.
- `interactionId` identifies the parent interaction. It joins run
  `interactionId` values to interaction records and joins interaction records to
  workflow-friction records by their explicit interaction ID.

Use `orchestrationId` for run-to-interaction membership, `runId` for worker
identity, and `taskId` only for task-registry correlation. Do not infer a join
from timestamps, agent names, or model names.

## Validation workflow

Use the Node runner instead of shell-specific path conversion. It passes native absolute paths to Pi with argument arrays, isolates metrics, operator, friction, and legacy task roots, bounds captured output, and rejects files that escape the scratch root.

Run deterministic checks before using a provider:

```bash
cd pi
pnpm test pi-smoke-runner.test.ts workflow-friction.test.ts orchestration-stats.test.ts secret-scan.test.ts
pnpm run typecheck
cd ..
node pi/scripts/run-isolated-pi-smoke.mjs
```

The default smoke starts the real Pi CLI in RPC mode without a model request. It also leaves a legacy task sentinel at the project default and points `PI_LEGACY_TODO_SOURCE_DIR` at an empty scratch source, proving isolated startup does not import unrelated task state.

After focused checks and the full Pi suite pass, run the live gate once:

```bash
node pi/scripts/run-isolated-pi-smoke.mjs orchestration-telemetry --live
```

The live scenario performs one delegated interaction, then starts a no-tools Pi process with the same native scratch roots and invokes `/orchestration-stats`. It passes only when the report shows one delegated interaction and one referenced run ID. A failed deterministic gate blocks the live gate. Repeat the live gate only after changing the failed code path or producing new evidence that the prior cause was repaired.

Run `make check` from the repository root after the live gate. Archive preflight must execute its documented verifier-to-capture pipeline, use the shared secret scanner, and pass `git diff --check` before moving a plan.

## Reader semantics

`readOrchestrationEvents({ dir, days, now })` reads the legacy
`metrics.jsonl` file and UTC daily files in the requested time window. It
accepts only the two orchestration event names, validates their closed schemas,
filters by envelope timestamp, deduplicates by envelope `id`, and returns a
stable sort by `ts` then `id`.

The reader is bounded: at most 367 files, 8 MiB per line, 256 MiB total input,
and 10,000 malformed lines. It skips malformed, oversized, duplicate, and
unsupported records and reports counts in `diagnostics`. A bounded read sets
`truncated` and `truncationReason`; consumers must report that condition rather
than treating the result as complete.

## Report terms and limits

- **Worker output not returned inline** means `inlineBytesNotReturned`. It is a
  byte difference, not a claim that output was lost.
- **Wall duration** means elapsed time for `durationMs` on a run or interaction.
- **Child-work duration** means `childWorkMs`, the sum of worker durations. It
  can exceed wall duration when workers overlap.
- **Known cost** includes only `costUsd` values with `costSource: "pi-usage"`.
  Unavailable cost is not zero.
- **Observational only**: these records describe measured topology, usage,
  output handling, cost, and latency. They do not establish causal savings.
  Causal savings claims require matched cohorts outside this schema.
