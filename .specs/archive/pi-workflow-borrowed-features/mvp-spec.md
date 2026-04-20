# Pi Workflow Operator Layer — MVP Spec

## Goal

Define the smallest testable implementation of the operator-layer features discussed in this spec set:
1. status bar + `/doctor`
2. first-class task registry + `/tasks`
3. `/permissions` inspect/reset/retry UX

This MVP is meant to be **built, used, and revised quickly**. It prioritizes operational clarity over breadth.

## Why this MVP exists

The current Pi setup in this repo is powerful but fragmented:
- live state is spread across multiple extensions and commands
- long-running work is visible in the moment but not managed as durable task objects
- permission behavior is safe but not yet fully inspectable as a user workflow

This MVP creates a thin, coherent operator layer without redesigning Pi itself.

---

# Product Principles

The MVP must be:
- **ambient** for healthy normal state
- **explicit** when attention is required
- **safe by default**
- **durable enough to inspect after the fact**
- **small enough to implement without a broad framework rewrite**

The MVP must **not** try to solve every future orchestration problem.

---

# MVP Scope Summary

## Included

### Feature 1
- minimal status bar enhancements
- `/doctor`
- `/doctor --verbose`
- `/doctor --json`

### Feature 2
- first-class task registry
- task registration for in-scope long-running work
- `/tasks` compact list view
- `/tasks` detail view
- cancel/retry when supported

### Feature 3
- `/permissions` summary view
- session approval visibility
- recent allow/deny decision visibility
- session approval reset/revoke
- retry denied action when replay is safe and data is still available

## Excluded
- plugin marketplace / package manager UX
- detached remote planning/review mode
- enterprise policy management
- broad scheduler redesign
- batch task operations
- full interactive repair automation in `/doctor`
- fully automatic permission escalation modes

---

# Feature 1 — Status Bar + `/doctor`

## MVP Intent

Make current Pi state legible at a glance, while keeping detailed diagnosis in `/doctor`.

## Status Bar MVP

### Healthy default bar
The healthy default status bar should remain compact and identity-focused.

### Required healthy-state fields
- compact repo/path
- current branch when in a git repo
- active model/provider label
- router/effort state if meaningful
- active Pi version number

### Healthy-state example
```text
~/dotfiles [main] | GPT-5.4 [high] | v0.x.y
```

### Fields explicitly excluded from healthy default
Do **not** show these in the default healthy bar:
- `git status --short` counters
- task counts
- permission mode labels
- explicit `OK`
- extension counts
- cost/token stats

### Conditional indicators
The status bar may append a short extra token only when needed:
- `task` — if relevant work is running / blocked / failed
- `elevated` — if permissions are currently non-default
- `! <reason>` — if degraded or warning state exists

### Conditional examples
```text
~/dotfiles [main] | GPT-5.4 [high] | v0.x.y | task
~/dotfiles [main] | GPT-5.4 [high] | v0.x.y | elevated
~/dotfiles [main] | GPT-5.4 [high] | v0.x.y | ! validator
```

### Status bar rules
- keep layout stable
- default healthy state should fit comfortably on one line
- warning tokens should be concise and human-readable
- do not expose implementation detail unless the user needs to act on it

## `/doctor` MVP

### Purpose
Provide a single troubleshooting command that answers:
- what is healthy?
- what is degraded?
- what is broken?
- what should I do next?

### Required checks
The first MVP version of `/doctor` must check at least:
- Pi version and basic runtime availability
- active model resolution / model registry availability where possible
- current repo/cwd context sanity
- extension loading state for this repo-local Pi setup
- prompt router prerequisites (`pi/prompt-routing` assets if required)
- task registry storage availability
- permissions storage / session approval state availability

### Output requirements
Default `/doctor` should:
- group findings by severity
- be readable in one pass
- provide actionable next steps

### Severity model
- `healthy`
- `warning`
- `error`

### Verbose mode
`/doctor --verbose` should include:
- failing file paths
- component names
- underlying error text where useful
- skipped checks if applicable

### JSON mode
`/doctor --json` should emit structured objects with at least:
- `component`
- `severity`
- `summary`
- `details?`
- `remediation?`

### MVP acceptance criteria for Feature 1
- a user can identify current model/repo/version from the healthy status bar
- a user can notice abnormal state from the status bar without invoking a command
- `/doctor` gives a clear next debugging step for warnings/errors
- `/doctor --json` is usable for future scripting

---

# Feature 2 — First-Class Task Registry + `/tasks`

## MVP Intent

Represent background and long-running Pi work as durable task objects and give users one place to inspect and manage them.

## MVP architecture decision

The MVP uses a **first-class task registry** as the source of truth.

UI surfaces like the status bar and `/tasks` must read from the registry rather than deriving state only from transcript history.

## V1 task boundary

### Included in MVP registry
- subagent runs that execute in parallel, chain, or detached modes
- `/team` delegated jobs and other explicit multi-agent work units
- long-running extension-managed jobs
- detached interactive shell / monitor / dispatch jobs
- review/planning/research workflows that continue beyond a single immediate response cycle

### Excluded from MVP registry
- ordinary single-turn foreground prompts
- small one-shot tool calls
- passive status checks
- transcript events that were never registered as tasks

## MVP task lifecycle

### Supported states
- `pending`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`

### Important simplifications
The MVP does **not** add separate states for:
- `queued`
- `retrying`
- `awaiting_input`

Those should be represented using existing states plus metadata.

## MVP task schema

### Required fields
- `id`
- `title`
- `origin.kind`
- `origin.source_name`
- `state`
- `created_at`
- `summary`

### Conditionally required
- `started_at` when task runs
- `ended_at` on terminal states
- `error` when failed
- `block_reason` when blocked

### Strongly recommended in MVP
- `updated_at`
- `retry_count`
- `cancel_supported`
- `retry_supported`
- `attention_required`
- `last_output_preview`
- `usage`
- `duration_ms`

## `/tasks` MVP UX

### Default view
`/tasks` should open a compact grouped list, ordered by urgency:
1. blocked
2. failed
3. running
4. pending
5. completed
6. cancelled

### Default list item fields
Each task row should show at least:
- title
- state
- origin source name or kind
- short summary or preview
- age/runtime indicator if available

### Default view should optimize for
- answering “what needs my attention?” quickly
- scanning current active work
- reopening finished work without transcript hunting

### Detail view
Selecting or expanding a task should show:
- id
- title
- origin
- state
- timestamps
- summary
- last output preview
- error or block reason if present
- usage/cost/runtime if available
- retry/cancel availability

### Control actions in MVP
The MVP should support:
- inspect/open detail
- cancel when `cancel_supported`
- retry when `retry_supported`

### Retry behavior
Retry should:
- create an inspectable transition
- increment `retry_count`
- move task back to `pending` before returning to `running`
- preserve prior failure context in task history/metadata if available

### Cancel behavior
Cancel should:
- move task to `cancelled`
- preserve final summary/last known output
- remain inspectable after cancellation

## Status bar integration for tasks
The status bar should **not** show task counts by default.

It may show a small `task` indicator only when:
- a task is running
- a task is blocked
- a task failed and needs attention

## MVP acceptance criteria for Feature 2
- long-running in-scope work is registered as explicit task objects
- `/tasks` answers what is running, blocked, failed, and finished
- users can inspect task detail after the conversation has moved on
- users can cancel or retry supported tasks
- ordinary one-shot inline work is not cluttering the registry

---

# Feature 3 — `/permissions` Inspect / Reset / Retry

## MVP Intent

Make permission behavior understandable and recoverable without weakening safety.

## `/permissions` MVP

### Required summary sections
The first version of `/permissions` must show:
- current effective mode/state summary
- session-scoped approvals currently active
- recent allow decisions
- recent deny decisions

### It must clearly distinguish
- static/rule-based behavior vs session approvals
- one-time decisions vs session-level decisions where known

### Required fields per recent decision
Each recent decision should show at least:
- action/tool summary
- outcome (`allowed` / `denied`)
- provenance if known
- timestamp or recency information

## Permission provenance model for MVP

The MVP should support these provenance categories where known:
- `rule`
- `manual_once`
- `session`
- `unknown`

Repo-scoped approval may be deferred if not safely implementable in the first pass.

## Required control actions
The MVP should support:
- reset or revoke session-scoped approvals
- inspect recent denied actions
- retry a denied action when safe replay is possible

## Retry MVP

### Retry is allowed only when
- the denied action payload is still available
- replay is explicit and intentional
- the action can be safely resubmitted via the existing tool path

### Retry flow
1. user inspects a denied action in `/permissions`
2. user selects retry
3. user approves at the supported scope
4. Pi replays the stored blocked action
5. replay is visible as a new decision/action, not hidden

### If replay is not possible
Pi should explain why the denied action cannot be retried automatically and what the user should do instead.

## MVP acceptance criteria for Feature 3
- users can see what session-level permission state is active
- users can inspect recent allow/deny decisions
- users can reset/revoke session approvals
- users can retry supported denied actions without manually reconstructing them
- the system remains explicit and safe by default

---

# Cross-Feature Integration

## Shared language
All three features should use compatible state language:
- warning/error terminology in `/doctor`
- lifecycle terminology in `/tasks`
- approval provenance terminology in `/permissions`

## Shared durability principle
- status bar is ambient and minimal
- `/doctor`, `/tasks`, and `/permissions` are operator surfaces built on durable state

## Shared non-goal
The MVP should **not** try to become a full control plane for every possible Pi extension in the ecosystem.

---

# MVP Build Order

## Phase 1
1. task registry foundation
2. permission decision storage foundation
3. status bar minimal version + version field

## Phase 2
4. `/tasks` list + detail + cancel/retry wiring
5. `/permissions` summary + reset/retry wiring
6. `/doctor` default output

## Phase 3
7. `/doctor --verbose`
8. `/doctor --json`
9. polish warning tokens in status bar

---

# Evaluation Checklist

Use this checklist after trying the MVP.

## Status bar
- Can I identify repo, model, and Pi version instantly?
- Does the healthy bar stay quiet?
- Do warning/attention tokens feel helpful rather than noisy?

## Tasks
- Does `/tasks` make active work easier to follow?
- Are tasks durable enough to inspect later?
- Do cancel/retry actions behave how I expect?
- Is anything showing up as a task that should not?

## Permissions
- Does `/permissions` explain current approval state clearly?
- Can I tell why something was allowed or denied?
- Does retry feel safe and useful?
- What approval info do I still wish I had?

---

# Open Questions for Trial Feedback

1. Is the healthy status bar still too busy or not informative enough?
2. Are the task boundaries correct, or are important work units missing?
3. Do the six task lifecycle states feel sufficient?
4. Is `/tasks` ordering right, or should running work be shown first?
5. Is `/permissions` surfacing the right amount of provenance?
6. What feels missing from `/doctor` after real use?
