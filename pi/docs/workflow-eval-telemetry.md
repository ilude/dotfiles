# Workflow Eval Telemetry -- Draft Spec

This document defines the telemetry and evidence contract for evaluating Pi
workflow commands over time. The goal is to make later audits answer concrete
questions without reconstructing everything from chat transcripts, terminal
scrollback, or archived plans. For operational usage, query examples, and the
local helper script, see `pi/docs/workflow-eval-operations.md`.

This is a design and usage document plus the contract for the initial runtime
implementation. Runtime support currently records workflow command dispatch
episodes and dispatch events. Detailed task, validation, manual-gate, repair,
and archive events are follow-up scope. `/do-it` must also run an automatic
post-run workflow eval before the final user report. This eval is part of the
existing workflow; there is no separate user-facing command to remember. Until
all events are emitted by runtime code, `/plan-it`, `/review-it`, and `/do-it`
should record the same fields in plan files, review artifacts, or explicit
evidence artifacts whenever practical.

---

## Goals

1. Reproduce a workflow episode from durable local artifacts.
2. Compare planned gates with executed gates.
3. Measure whether validation failures entered repair loops instead of stopping
   early.
4. Measure whether manual gates were required, downgraded, skipped, or passed
   with a recorded reason.
5. Measure whether completed plans were archived by default.
6. Identify prompt-contract drift across `/plan-it`, `/review-it`, and
   `/do-it`.
7. Learn whether `/review-it` can be embedded automatically into `/plan-it` and
   how many reviewers each plan profile needs.

## Non-goals

- Recording secrets, credentials, private tokens, or raw sensitive output.
- Capturing full terminal logs by default.
- Replacing tests, review artifacts, or archived plans.
- Requiring runtime telemetry before workflow prompts can be evaluated.

## Evaluation Questions

A later eval should be able to answer:

1. Did `/plan-it` create an executable plan contract?
2. Did `/review-it` produce evidence-based findings instead of review theater?
3. Did `/do-it` follow the checklist and validation contract in order?
4. Were validation failures repaired or correctly classified as blockers?
5. Were manual gates treated as exceptional and justified by risk?
6. Was the final classification correct?
7. Was the plan archived when complete?
8. Which commands took the most time or failed most often?
9. What friction or missing evidence should improve the workflow system itself?

## Episode Model

A workflow episode is one invocation of a workflow command for one primary
artifact.

Examples:

- `/plan-it <task>` creates a plan episode.
- `/review-it .specs/example/plan.md` creates a review episode.
- `/do-it .specs/example/plan.md` creates an execution episode.

Each episode has phases. Phases contain events.

```text
episode
  phase
    event
```

## Required Episode Fields

Use these fields for every episode record.

| Field | Required | Description |
|---|---:|---|
| `schema_version` | yes | Telemetry schema version. Start with `1`. |
| `episode_id` | yes | Stable unique ID for this command run. |
| `command` | yes | `plan-it`, `review-it`, `do-it`, or another workflow command. |
| `artifact_path` | yes | Primary plan, PRD, or review artifact path. |
| `repo_root` | yes | Repository root path or repo ID. |
| `started_at` | yes | ISO-8601 timestamp. |
| `completed_at` | yes, when complete | ISO-8601 timestamp. |
| `status` | yes | `completed`, `blocked`, `not_complete`, or `failed`. |
| `classification` | when applicable | Completion class such as `completed-and-archived`. |
| `archive_status` | when applicable | `not_applicable`, `archived`, `active`, `opted-out`, or `failed`. |
| `archive_path` | when archived | Final archive path. |
| `redaction_status` | yes | `redacted`, `no_sensitive_output`, or `not_recorded`. |

## Required Phase Fields

Use these fields for every major phase.

| Field | Required | Description |
|---|---:|---|
| `phase_id` | yes | Stable phase ID, for example `wave-1`, `v2`, `repo-check`. |
| `phase_type` | yes | `planning`, `review`, `implementation`, `validation`, `manual-gate`, `deployment`, `archive`, or `report`. |
| `depends_on` | no | Prior phase IDs. |
| `started_at` | yes | ISO-8601 timestamp. |
| `completed_at` | yes, when complete | ISO-8601 timestamp. |
| `status` | yes | `pending`, `in_progress`, `passed`, `failed`, `blocked`, or `skipped`. |
| `evidence` | yes | Non-secret summary or artifact path. |

## Required Event Fields

Use these fields for command runs, decisions, and gate transitions.

| Field | Required | Description |
|---|---:|---|
| `event_id` | yes | Stable unique event ID within the episode. |
| `phase_id` | yes | Parent phase. |
| `task_id` | when applicable | Checklist or task ID, for example `T4`, `V2`, `F2`. |
| `event_type` | yes | `command`, `decision`, `checklist_update`, `artifact_write`, `validation_result`, `manual_gate_decision`, `archive_move`, `post_run_eval`, `friction`, `improvement_candidate`, `missing_evidence`, or `blocker`. |
| `command_line` | for command events | Exact command after redaction. |
| `exit_code` | for command events | Process exit code. |
| `status` | yes | `passed`, `failed`, `blocked`, `skipped`, or `recorded`. |
| `duration_ms` | when available | Command or event duration. |
| `evidence` | yes | Short non-secret output summary or artifact path. |
| `failure_reason` | on failure | Sanitized failure summary. |
| `repair_attempt` | on repair | Integer repair attempt number. |
| `category` | for eval findings | Finding category such as `test-gap`, `prompt-gap`, `archive-friction`, or `runtime-telemetry-gap`. |
| `severity` | for eval findings | `critical`, `high`, `medium`, or `low`. |
| `impact` | for eval findings | Concrete effect on eval quality or workflow reliability. |
| `recommended_change` | for eval findings | Prompt, runtime, docs, or test change to consider. |
| `candidate_test` | when applicable | Regression test that would catch the issue later. |

## Manual Gate Fields

Manual gates need explicit risk context so later evals can distinguish necessary
human judgment from avoidable process friction.

| Field | Required | Description |
|---|---:|---|
| `manual_required` | yes | Boolean. |
| `manual_gate_type` | when required | `approval-before-action` or `validation-after-action`. |
| `risk_level` | yes | `low`, `medium`, or `high`. |
| `blast_radius` | yes | `local`, `personal-repo`, `home-lab`, `shared`, `work`, or `production`. |
| `rollback` | yes | `easy`, `known`, `unclear`, or `none`. |
| `decision` | yes | `not_required`, `required`, `downgraded`, `skipped`, or `passed`. |
| `decision_reason` | yes | Concrete reason, not generic confidence language. |

## Automatic Post-Run Eval

`/do-it` owns post-run eval. Users should not run another command after `/do-it`
to capture workflow quality data.

Every `/do-it` terminal state must record a compact eval record with:

- final classification
- archive status and archive path when available
- validation commands and results
- manual and deployment gate decisions
- checklist completion state
- blocker reason when blocked
- friction tags
- missing evidence
- improvement candidates
- eval confidence

A deterministic eval record is always required. Hidden evaluator subagents are
conditional. Launch them only when friction triggers exist:

- blocked or not-complete outcome
- validation failed before repair
- manual gate required, skipped, or downgraded
- archive collision, archive failure, or archive opt-out
- checklist/evidence mismatch
- missing required telemetry fields
- unexpected scope expansion
- user-visible confusion

Default hidden panel:

1. `evidence-auditor` checks whether evidence supports the outcome.
2. `workflow-friction-analyst` extracts system-improvement findings.
3. `regression-test-hunter` is added only when a prompt, runtime, or test gap is
   clear.

The post-run eval must not block a successfully archived run unless it finds a
factual completion inconsistency: failed required validation, missing archive
move, unresolved manual gate, incomplete checklist, or insufficient evidence to
verify completion.

## Review Finding Fields

Review findings should be compact and comparable across runs.

| Field | Required | Description |
|---|---:|---|
| `category` | yes | `substantive defect`, `process defect`, `duplicate`, `low-value/theater`, or `false positive`. |
| `severity` | yes | `critical`, `high`, `medium`, or `low`. |
| `severity_rationale` | yes | Why that severity matches likely impact. |
| `evidence` | yes | Plan section, file, command, or quoted text. |
| `required_fix` | yes | Concrete fix or hardening action. |
| `confidence` | yes | `high`, `medium`, or `low`. |

## Adaptive Embedded Review Data

The future goal is to remove `/review-it` as a manual step and let `/plan-it`
choose the right amount of review automatically. To learn that policy, each
plan lifecycle needs five linked record types.

### Plan profile

Captured during `/plan-it`.

```json
{"event_type":"plan_profile","plan_profile":{"domains":["prompt","typescript-test"],"files_estimated":5,"tasks":6,"waves":2,"dependency_depth":2,"validation_commands":3,"external_systems":0,"deployment_required":false,"manual_gate_required":false,"credentials_required":false,"risk_level":"low","blast_radius":"personal-repo","rollback":"easy","destructive_potential":false,"paid_or_quota_resource":false,"secret_exposure_risk":false,"shared_user_impact":false}}
```

### Review panel decision

Captured during `/review-it` now and future embedded plan review later.

```json
{"event_type":"review_panel_decision","review_panel_decision":{"review_strategy":"manual-review-it","complexity_score":4,"risk_score":1,"recommended_reviewer_count":3,"selected_reviewers":[{"base_agent":"qa-engineer","persona":"verification realism reviewer","reason":"Prompt-contract tests are the main safety mechanism.","expected_value":"Catch weak acceptance criteria and false-positive checks."}],"selection_reasons":["prompt/test workflow","local reversible changes"],"expected_high_risk_areas":["validation contract drift"]}}
```

### Review yield

Captured after review synthesis and auto-apply.

```json
{"event_type":"review_yield","review_yield":{"total_findings":8,"must_fix":1,"hardening":3,"duplicates":2,"low_value_theater":1,"false_positives":1,"applied":4,"rejected":4,"changed_execution_readiness":true,"per_reviewer":[{"persona":"verification realism reviewer","findings":3,"applied":2,"false_positives":0,"low_value_theater":0}]}}
```

### Execution outcome

Captured after `/do-it` reaches a terminal state.

```json
{"event_type":"execution_outcome","execution_outcome":{"classification":"completed-and-archived","completed":true,"blocked_by_plan_gap":false,"validation_failures_after_review":0,"manual_gate_ambiguity":false,"archive_issue":false,"missed_by_review":[]}}
```

### Panel quality label

Captured after execution outcome is known.

```json
{"event_type":"panel_quality_label","panel_quality_label":{"sizing":"right_sized","reason":"Review found one automation-readiness issue and execution completed without plan gaps.","confidence":"medium"}}
```

Together these records answer whether the panel was useful, noisy,
under-sized, or over-sized. The minimal review panel decision record alone is
not enough because it explains the prediction but not review yield or execution
outcome.

## DuckDB Analysis Store Decision

JSONL remains the source of truth. DuckDB is the analysis engine and optional
rebuildable cache, not the hot-path write store.

Research against official DuckDB docs confirmed:

- Python can read JSON with `duckdb.read_json("example.json")` and SQL can use
  `read_json_auto`.
- NDJSON/JSONL has explicit readers: `read_ndjson`, `read_ndjson_auto`, or
  `read_json(..., format = 'newline_delimited')`.
- Multiple files and recursive globs are supported, including `dir/**/*.jsonl`.
- Python installation is straightforward with the `duckdb` package and Python
  3.9+.
- In-memory connections are supported for first-pass analysis; persistent
  `.duckdb` files can be rebuildable caches later.

Recommended query shape:

```sql
SELECT *
FROM read_ndjson_auto(
  '.pi/workflow-telemetry/**/events.jsonl',
  union_by_name = true
);
```

Do not make workflow agents write directly to DuckDB during normal runs. Do not
commit `.duckdb` files. Do not require DuckDB for `/plan-it`, `/review-it`, or
`/do-it` completion.

## Suggested Artifact Layout

Runtime support writes JSONL so records can be appended safely.

```text
.pi/workflow-telemetry/
  episodes.jsonl
  {episode_id}/
    events.jsonl
    summary.json
    post-run-eval.md
    post-run-findings.jsonl
    plan-profile.json
    review-panel.json
    review-findings.jsonl
    execution-outcome.json
```

For plan-scoped artifacts, a mirror can live next to the plan:

```text
.specs/{slug}/telemetry/
  {episode_id}.jsonl
  {episode_id}-summary.json
  {episode_id}-post-run-eval.md
  {episode_id}-findings.jsonl
```

Archived plans should move their sibling telemetry directory with the plan.

## Minimal JSONL Examples

Episode record:

```json
{"schema_version":1,"episode_id":"2026-05-26T12-10-42Z-do-it-pi-workflow-hardening","command":"do-it","artifact_path":".specs/pi-workflow-hardening/plan.md","repo_root":"C:/Users/mglenn/.dotfiles","started_at":"2026-05-26T12:10:42Z","status":"completed","classification":"completed-and-archived","archive_status":"archived","archive_path":".specs/archive/pi-workflow-hardening-2026-05-26/plan.md","redaction_status":"no_sensitive_output"}
```

Validation event:

```json
{"event_id":"evt-v2-001","phase_id":"V2","task_id":"V2","event_type":"command","command_line":"cd pi/tests && pnpm test workflow-dispatch.test.ts workflow-prompts.test.ts --reporter=dot","exit_code":0,"status":"passed","duration_ms":1090,"evidence":"2 files, 12 tests passed"}
```

Manual gate decision:

```json
{"event_id":"evt-f3-001","phase_id":"F3","task_id":"F3","event_type":"decision","status":"recorded","manual_required":false,"risk_level":"low","blast_radius":"personal-repo","rollback":"easy","decision":"not_required","decision_reason":"Local prompt/test changes covered by automated validation; no deployment or external mutation."}
```

Archive event:

```json
{"event_id":"evt-f5-001","phase_id":"F5","task_id":"F5","event_type":"archive_move","status":"passed","archive_status":"archived","archive_path":".specs/archive/pi-workflow-hardening-2026-05-26/plan.md","evidence":"Archive preflight passed; collision-safe archive path used."}
```

Post-run eval finding:

```json
{"event_id":"evt-eval-001","phase_id":"post-run-eval","event_type":"improvement_candidate","status":"recorded","category":"runtime-telemetry-gap","severity":"medium","evidence":"Dispatch event exists, but detailed validation events are prompt-recorded only.","impact":"Future evals must reconstruct detailed execution from archived plan text.","recommended_change":"Add a hidden append helper for task, validation, manual-gate, repair, and archive events.","candidate_test":"Assert /do-it plan execution records validation_result events."}
```

## How To Use This For Later Evals

1. Collect the archived plan and any review directories.
2. Collect `.pi/workflow-telemetry/episodes.jsonl` and the matching
   `{episode_id}/events.jsonl` files, if runtime telemetry exists.
3. If runtime telemetry does not exist, extract equivalent fields from:
   - `## Execution Checklist`
   - `## Execution Status`
   - review artifacts under `review-*`
   - final report text, when available
4. Score each episode against the evaluation questions above.
5. Compare failures against the prompt-contract tests in
   `pi/tests/workflow-prompts.test.ts`.
6. Query JSONL with DuckDB for aggregate analysis of reviewer yield, false
   positives, review panel sizing, and missed execution issues.
7. Add regression tests for any prompt-contract drift that allowed a bad episode.

## Eval Scoring Rubric

| Area | Pass Signal | Fail Signal |
|---|---|---|
| Plan executability | Exact commands, gates, and checklist mapping exist | Hidden context or vague validation |
| Review quality | Findings have category, evidence, fix, severity rationale, confidence | Generic findings or review theater |
| Execution ordering | Checklist updates follow dependency order | Later gate runs before dependency evidence |
| Repair loop | Validation failures record evidence and repair attempts | Failure reported without safe investigation |
| Manual gates | Risk-based decision with reason | Manual gate required for ordinary confidence |
| Archive behavior | Completed plan archived or explicit opt-out | Completed plan left active without reason |
| Evidence hygiene | Non-secret summaries and artifact paths | Secrets, raw sensitive logs, or missing evidence |

## Implementation Plan Sketch

1. Done: add a small workflow telemetry helper in `pi/lib`.
2. Done: emit episode and dispatch event JSONL from TypeScript-backed workflow
   command dispatch.
3. Done at prompt-contract level: make automatic post-run eval part of `/do-it`
   with no separate user-facing command.
4. Next: provide a hidden tool or helper that appends detailed task,
   validation, manual-gate, repair, archive, friction, and improvement records
   from the executing session.
5. Next: add tests that validate detailed event schema shape, redaction
   behavior, and archive moves.
6. Next: add an eval summarizer that reads archived plans plus telemetry JSONL
   and reports pass/fail counts by rubric area.

## Open Questions

1. Should telemetry live only under `.pi/` as local runtime state, or should
   plan-scoped telemetry under `.specs/` be trackable for selected eval runs?
2. Should command output evidence store only summaries, or also bounded sanitized
   excerpts?
3. Should episode IDs be generated by runtime code only, or may prompt-only
   sessions mint deterministic IDs from timestamp, command, and slug?
4. Which eval reports should be committed: raw telemetry, derived summaries, or
   neither by default?
5. Should clean successful runs always write plan-scoped post-run eval artifacts,
   or only runtime-local telemetry plus a compact final-report line?
