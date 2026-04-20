# Pi Workflow Borrowed Features — User Stories and Problem Statements

## Purpose

This document translates the researched feature opportunities into product requirements language:
- what user problem each feature solves
- who the user is
- how success should feel in practice
- what stories the implementation must satisfy
- what is explicitly out of scope

This is intended to give future implementation work a stable target.

## Product Principles

These requirements assume Pi should remain:
- terminal-first
- composable and extension-friendly
- minimally surprising
- safe by default
- inspectable rather than magical
- progressive in disclosure rather than noisy by default

## Primary Personas

### 1. Solo power user
Works mainly in the terminal, runs Pi for long sessions, values speed and low friction, but still wants visibility and safety.

### 2. Workflow tinkerer
Installs and combines Pi extensions, skills, and project-local tooling. Needs debuggability when customizations interact badly.

### 3. High-autonomy operator
Uses subagents, long-running workflows, and automation-heavy sessions. Needs auditability, task visibility, and permission control.

### 4. Maintainer/debugger
Needs to diagnose why a Pi setup is malfunctioning, gather reproducible state, and guide fixes without guesswork.

---

# Feature 1: Status bar + `/doctor`

## Problem Statement

Pi exposes important state across multiple surfaces: router status, extension loading, tool availability, validators, session hooks, model configuration, and repo context. Today, users must reconstruct overall system health manually.

This creates three problems:
1. users do not know whether Pi is healthy or degraded
2. troubleshooting is slow and inconsistent
3. support/debug conversations lack a shared diagnostic artifact

## Intended Outcome

A user should not need to type a command to know the current state of Pi.

- the **status bar** should answer: **what is active right now?**
- `/doctor` should answer: **what is broken or risky, and how do I fix it?**
- if a command exists for status details, it should be a secondary drill-down surface rather than the primary way to learn current state
- the default healthy status bar should remain quiet and identity-focused rather than operationally noisy

## User Goals

- understand the current runtime state continuously without invoking a command
- quickly detect missing or degraded capabilities
- distinguish configuration issues from model/tool issues
- produce diagnostic output useful for issue reports or debugging

## User Stories

### Status overview
1. **As a solo power user**, I want a compact status bar summary so I can confirm the current model, repo, and active Pi version at a glance without interrupting flow.
2. **As a workflow tinkerer**, I want the status bar to show only the most important extension/package state changes when relevant so I can tell whether my custom setup loaded as expected without constant noise.
3. **As a high-autonomy operator**, I want the status bar to surface background work or elevated permission state only when active so I can decide whether to continue or intervene.
4. **As a maintainer/debugger**, I want the status bar to surface degraded-but-not-fatal conditions so I can identify likely root causes before changing anything.
5. **As a user**, I want drill-down detail only when I ask for it so normal operation stays quiet and glanceable.
6. **As a user**, I want the default healthy status bar to avoid verbose git/task/permission counters so it stays readable during continuous use.

### Doctor / diagnostics
5. **As a maintainer/debugger**, I want `/doctor` to validate core runtime prerequisites so I can separate environment failures from Pi logic failures.
6. **As a workflow tinkerer**, I want `/doctor` to validate installed extensions, skills, prompts, and packages so I can catch broken references and failed loads.
7. **As a solo power user**, I want `/doctor` to provide explicit remediation suggestions so I know exactly what to fix next.
8. **As a maintainer/debugger**, I want `/doctor --verbose` to include diagnostic detail that is useful in bug reports and issue triage.
9. **As a tooling integrator**, I want `/doctor --json` so external scripts or future automation can consume Pi health programmatically.

## Functional Requirements

### Status bar must
- show current model/provider
- show current working directory or repo context in a compact form
- show the active Pi version number for the currently running installation
- show prompt router state if present when that state is user-meaningful
- surface warning/error state visually when Pi is degraded
- be concise enough to parse at a glance during normal work
- avoid noisy operational counters in the default healthy state

### Default healthy status bar should prioritize
- repo/path
- branch
- model/provider
- router or effort state if meaningful
- active Pi version number

### Default healthy status bar should not include
- verbose `git status --short` counters
- task counts
- permission mode labels
- explicit `OK` text

### Conditional indicators may appear only when relevant
- task indicator when work is running, blocked, failed, or needs attention
- permission indicator when permissions are elevated or non-default
- health indicator when degraded or warning state exists
- extension/package warning indicators when load or runtime issues exist

### Optional drill-down surface may
- provide expanded status detail on demand
- be a command, overlay, or inspector
- reuse the same terminology and severity model as the status bar

### `/doctor` must
- run a deeper health check than `/status`
- validate configuration and runtime prerequisites
- validate extension/package loading where possible
- detect missing files or invalid references where possible
- report status using clear severity levels
- provide actionable remediation text

### `/doctor --verbose` should
- include error details, file paths, and failing component names
- include enough detail to paste into an issue

### `/doctor --json` should
- emit machine-readable structured output
- include component name, severity, summary, and remediation fields

## Acceptance Criteria

- A user can understand the current Pi identity and runtime context from the status bar during normal work without invoking a command.
- The active Pi version is visible in the normal healthy status bar.
- The healthy status bar remains compact and does not show unnecessary operational counters.
- Warning and degraded states are visible in the status bar when present.
- A user can identify the next debugging step from `/doctor` without opening source files first.
- Doctor output distinguishes healthy, degraded, and broken states.
- Doctor output is stable enough to be useful in bug reports.

## Non-goals

- replacing all logs or debug traces
- interactive repair automation in the first version
- full enterprise policy/compliance reporting

---

# Feature 2: Persistent background task dashboard

## Product Decision

Feature 2 is built around a **first-class task registry**.

Pi should treat background and long-running work as explicit task objects with lifecycle state, not as transient UI hints layered only on top of transcript rendering.

## Problem Statement

Pi can already run parallel subagents and long-running work, but operational visibility is fragmented. Background progress is easy to lose inside transcript scrollback, and there is no clear durable control surface for managing work across time.

This creates four problems:
1. users lose awareness of what is still running
2. users cannot easily inspect or revisit task state
3. users have limited control over retries/cancellation
4. long-running work becomes harder to trust

## Intended Outcome

A user should be able to treat Pi work as explicit task objects rather than as ephemeral transcript events.

The first-class task registry should answer:
- what tasks exist right now?
- what is running?
- what is blocked or waiting?
- what failed?
- what finished?
- what did it cost, and what should I do next?

## User Goals

- keep track of long-running or parallel work without scanning scrollback
- reopen details for a task after the moment has passed
- cancel or retry tasks intentionally
- see which work needs human attention
- understand runtime/cost/value of agent work

## V1 Task Boundary

### A task in v1 is
A **durable unit of background or long-running work** that:
- can outlive the immediate transcript moment in which it started
- benefits from lifecycle tracking
- may need inspection, cancellation, retry, or follow-up attention
- should be visible from a shared registry rather than inferred from chat history

### Included in v1
- subagent runs that execute in parallel, chain, or detached modes
- `/team` delegated jobs and other explicit multi-agent work units
- long-running extension-managed jobs
- detached interactive shell / monitor / dispatch jobs
- review, planning, or research workflows that continue beyond a single immediate response cycle
- tasks created by future Pi-native orchestration surfaces that explicitly register work in the task registry

### Excluded from v1
- ordinary single-turn foreground prompts that complete inline
- small one-shot tool calls such as a single `read`, `grep`, or fast `bash` command
- passive status checks that do not create durable work
- purely historical transcript items that were never registered as tasks
- generic every-turn model responses

### Decision rule for ambiguous cases
If work needs any of the following, it should probably be a task:
- status beyond the current turn
- cancellation
- retry
- attention-needed state
- durable result inspection

If it completes immediately and does not benefit from lifecycle management, it should remain normal transcript activity rather than a task.

## V1 Task Lifecycle

### V1 task states
The minimal task state machine for v1 is:
- `pending`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`

### State meanings
- `pending` — task exists but has not started yet
- `running` — task is actively executing
- `blocked` — task cannot currently proceed without an external condition, dependency, approval, or intervention
- `completed` — task finished successfully
- `failed` — task finished unsuccessfully and may be retryable
- `cancelled` — task was intentionally stopped before successful completion

### State model decisions
- v1 does **not** require a separate `queued` state
- v1 does **not** require a separate `retrying` state
- v1 does **not** require a separate `awaiting_input` state; those cases should be represented as `blocked` with richer detail metadata

### Allowed lifecycle transitions
Typical transitions should include:
- `pending` → `running`
- `pending` → `blocked`
- `running` → `completed`
- `running` → `failed`
- `running` → `blocked`
- `pending` → `cancelled`
- `running` → `cancelled`
- `blocked` → `running`
- `blocked` → `cancelled`
- `failed` → `pending` when retried

### Lifecycle requirements
- every task must always have exactly one lifecycle state
- state changes should be recorded durably enough for later inspection
- blocked and failed tasks should preserve enough metadata to explain why they are not progressing
- retry should create a clear, inspectable transition rather than silently mutating history

## V1 Task Schema

### Required fields
Every v1 task must include:
- `id` — unique task identifier
- `title` — short human-readable summary
- `origin` — where the task came from
- `state` — one of the v1 lifecycle states
- `created_at` — when the task record was created
- `summary` — compact current summary of what the task is doing or what happened

### Required origin metadata
`origin` must be structured enough to answer what created the task. At minimum it should include:
- `kind` — e.g. `subagent`, `team`, `extension`, `interactive_shell`, `workflow`
- `source_name` — the command, extension, or workflow name responsible for creation

### Conditionally required fields
These fields are required when applicable:
- `started_at` — required once the task first enters `running`
- `ended_at` — required once the task reaches a terminal state (`completed`, `failed`, `cancelled`)
- `error` — required when state is `failed`
- `block_reason` — required when state is `blocked`

### Strongly recommended v1 fields
These should be included in v1 unless implementation constraints force deferral:
- `updated_at` — last state or metadata update time
- `retry_count` — number of retry attempts so far
- `cancel_supported` — whether cancel is currently supported
- `retry_supported` — whether retry is currently supported
- `attention_required` — whether the task currently needs user intervention
- `last_output_preview` — short preview of recent meaningful output

### Usage and timing fields
Usage metadata should be attached when available:
- `usage.input_tokens?`
- `usage.output_tokens?`
- `usage.cache_read_tokens?`
- `usage.cache_write_tokens?`
- `usage.cost?`
- `duration_ms?`

These are optional at the schema level, but the registry should support them from v1.

### Suggested v1 TypeScript shape
```ts
interface TaskRecordV1 {
  id: string;
  title: string;
  origin: {
    kind: "subagent" | "team" | "extension" | "interactive_shell" | "workflow" | "other";
    source_name: string;
  };
  state: "pending" | "running" | "blocked" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at?: string;
  started_at?: string;
  ended_at?: string;
  summary: string;
  last_output_preview?: string;
  error?: {
    message: string;
    code?: string;
  };
  block_reason?: {
    message: string;
    kind?: string;
  };
  retry_count?: number;
  cancel_supported?: boolean;
  retry_supported?: boolean;
  attention_required?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
    cost?: number;
  };
  duration_ms?: number;
}
```

### Schema rules
- `title` should be stable enough to recognize the task across updates
- `summary` may change over time as the task progresses
- `last_output_preview` should remain short and scan-friendly
- `error` and `block_reason` should explain the problem in user-readable terms
- fields should support later drill-down views without forcing transcript parsing

## User Stories

### Visibility
1. **As a high-autonomy operator**, I want a `/tasks` or `/jobs` view so I can see all active and recent work in one place.
2. **As a solo power user**, I want running work to remain visible after new conversation turns so I do not lose track of it.
3. **As a workflow tinkerer**, I want to inspect details of a task after completion so I can debug what happened without replaying the full transcript mentally.
4. **As a maintainer/debugger**, I want task records to include error states and timing so I can diagnose hangs, stalls, and repeated failures.

### Control
5. **As a high-autonomy operator**, I want to cancel a running task so I can stop wasted time or cost.
6. **As a solo power user**, I want to retry a failed task so I can recover without restating everything manually.
7. **As a workflow tinkerer**, I want to reopen a task’s final output, tool usage, and error summary so I can compare attempts.
8. **As a high-autonomy operator**, I want blocked or attention-needed tasks to be visually distinct so I can intervene quickly.

### Cost and usage awareness
9. **As a high-autonomy operator**, I want per-task runtime and token/cost information so I can decide which workflows are worth repeating.
10. **As a maintainer/debugger**, I want task metadata to show origin (command, agent, team, or extension) so I can trace where work came from.

## Functional Requirements

### Task registry must
- be the source of truth for background and long-running Pi work
- store explicit task objects rather than deriving task state only from transcript history
- support updates over the lifetime of a task
- allow other Pi surfaces such as the status bar and `/tasks` to read from the same registry
- only register work that falls inside the v1 task boundary
- enforce the v1 lifecycle states consistently across task-producing surfaces

### Task model must include
- task id
- source/origin (command, agent, team, extension)
- start time and end time if finished
- current status
- summary/title
- recent output preview
- error summary if failed
- usage metadata where available

### Dashboard must
- list pending, running, blocked, completed, failed, and cancelled tasks from the registry
- support revisiting completed work after the transcript moves on
- support cancellation for cancellable tasks
- support retry for retryable tasks
- support expanded detail view
- keep default view compact and scan-friendly

### Detail view should show
- task origin
- major steps or tool calls
- final output summary
- usage/cost/runtime
- error details or retry context

## Acceptance Criteria

- A user can answer “what is Pi doing right now?” without reading conversation history.
- Background and long-running work inside the v1 boundary is represented as explicit task objects in a first-class registry.
- Ordinary one-shot inline activity is not unnecessarily promoted into tasks.
- A user can distinguish running, failed, blocked, and completed work visually.
- A user can cancel or retry a task from the task surface when supported.
- A user can revisit completed task details after many later turns.

## Non-goals

- full workflow engine redesign in v1
- distributed multi-machine scheduling in v1
- replacing transcript history with task history
- implementing task state only as ad hoc statusline badges or transcript parsing without a shared registry

---

# Feature 3: Interactive permissions management and retry UX

## Problem Statement

Pi already has rule-based safety and blocking behavior, but permission state is not yet presented as a first-class user workflow. Users can be blocked without clearly understanding the current effective policy, approval provenance, or the easiest way to proceed safely.

This creates four problems:
1. safety decisions feel opaque
2. users cannot easily inspect current effective access
3. repeated prompts create fatigue without clarity
4. denied actions are awkward to recover from

## Intended Outcome

A user should be able to understand:
- what Pi can do right now
- why a given action was allowed or denied
- what level of trust is currently active
- how to safely retry a blocked action

## User Goals

- inspect effective permission state without reading raw config
- approve safe work at the right scope
- keep dangerous actions visible and intentional
- reduce repetitive permission friction without losing control
- preserve auditability of how access was granted

## User Stories

### Inspection and clarity
1. **As a solo power user**, I want a `/permissions` view so I can understand Pi’s current effective access.
2. **As a workflow tinkerer**, I want to inspect both static rules and session-granted approvals so I can debug confusing behavior.
3. **As a high-autonomy operator**, I want recent allow/deny decisions visible so I can understand where friction is coming from.
4. **As a maintainer/debugger**, I want the approval provenance recorded so I can tell whether access came from a rule, a session approval, or a one-time manual approval.

### Approval workflows
5. **As a solo power user**, I want to approve an action once so I can proceed without broadening trust unnecessarily.
6. **As a high-autonomy operator**, I want to approve safe recurring actions for the session so I can reduce prompt fatigue.
7. **As a workflow tinkerer**, I want repo-scoped approval options for predictable local workflows so I do not have to repeatedly grant the same safe action.
8. **As a cautious user**, I want obvious safe-mode or read-only indicators so I can know when Pi is constrained.

### Recovery and replay
9. **As a solo power user**, I want to retry a denied action after approval so I do not have to restate or reconstruct the exact request.
10. **As a maintainer/debugger**, I want denied actions to remain inspectable after the fact so I can tune permission rules intelligently.
11. **As a high-autonomy operator**, I want to revoke session-scoped approvals so I can tighten control again without restarting everything.

## Functional Requirements

### `/permissions` must
- present current effective access in a user-readable way
- surface static rules and dynamic session approvals separately if both exist
- show recent allow/deny decisions
- show approval provenance where known
- support reset/revoke of session-level approvals

### Approval model should support
- one-time approval
- session-scoped approval
- optional repo-scoped approval where safe and supported
- hard deny paths or commands remaining explicit

### Retry UX should
- allow a user to revisit a denied action
- allow approval at a chosen scope
- replay the exact blocked action when safe to do so
- preserve visibility that a replay happened

## Acceptance Criteria

- A user can answer “why was this blocked?” from Pi’s UI/commands.
- A user can see the difference between permanent rules and temporary approvals.
- A user can retry a blocked action without retyping the entire request.
- Session-scoped approvals can be revoked or reset.

## Non-goals

- silently bypassing dangerous operations
- hidden auto-escalation of privileges
- enterprise-grade centralized policy management in v1

---

# Cross-feature Requirements

## Consistency Requirements

These features should feel like one coherent operator layer, not unrelated commands.

### Shared expectations
- status, tasks, and permissions should use compatible terminology for state and severity
- each feature should prefer concise default output with optional drill-down
- each should be safe to invoke frequently during normal workflows
- each should support future structured output or machine-readable integration

## Global Acceptance Criteria

The combined feature set succeeds when:
1. users can inspect Pi state without reading implementation files
2. long-running work is visible and manageable without cluttering the default status bar
3. permission behavior is understandable and recoverable
4. debugging Pi becomes materially faster and less guess-based

---

# Suggested Delivery Phases

## Phase 1 — Visibility foundation
- status bar foundation
- task registry foundation
- permission provenance logging foundation

## Phase 2 — Operator workflows
- `/doctor`
- `/tasks`
- `/permissions`

## Phase 3 — Refinement
- verbose/json outputs
- richer retry/replay flows
- better task detail views
- stronger drill-down and cross-linking between surfaces

---

# Open Questions

1. Should the status drill-down be a command, overlay, inspector, or no extra surface at all beyond the status bar and `/doctor`?
2. Should `/tasks` unify only Pi-native background jobs, or also external companion workflows?
3. What is the safe boundary for repo-scoped permission approvals?
4. Should permission provenance be persisted per session, per project, or both?
5. How much of this should reuse public Pi packages versus be implemented repo-locally?
