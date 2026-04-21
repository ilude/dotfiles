---
created: 2026-04-20
updated: 2026-04-20
status: mvp-implemented
completed:
  - P0 design freeze: adapter, attempt, lock, recovery, and classification contracts
  - P1 extension-first core MVP
  - P2 EISA adapter
  - P3 validation of adapter/status/debug/targets/run/canary/lock/recovery flows
  - Make-driven suite driver with durable drive-state persistence and resume semantics
  - Infrastructure incident capture for persistent suite fragility
  - Manual infra research command/tool with persisted markdown reports
  - Optional off-by-default auto-research trigger from persistent infra incidents
in_progress:
  - Use the orchestrator to drive real Playwright spec triage in EISA
remaining:
  - Reassess whether a custom Pi SDK runtime adds value beyond the extension-first core
  - Additional hardening/generalization after real-world usage
source_repo: C:/Projects/Work/Gitlab/eisa-playwright-e2e
moved_from: C:/Projects/Work/Gitlab/eisa-playwright-e2e/.specs/pi-playwright-orchestrator/plan.md
---

# Plan: Pi Test Orchestrator Core + Project Adapters

## Implementation Status

### Completed
- **Core extension-first MVP is implemented** in the dotfiles-canonical extension source:
  - `~/.dotfiles/pi/extensions/test-orchestrator.ts`
- **User Pi extension path is active** and resolves to the same implementation in this environment:
  - `~/.pi/agent/extensions/test-orchestrator.ts`
- **Repo-local EISA adapter is implemented** at:
  - `docs/workflows/test-orchestrator.config.json`
- **Runtime state persistence is active** under:
  - `.specs/pi-test-orchestrator-runtime/attempts/`
  - `.specs/pi-test-orchestrator-runtime/state/`
  - `.specs/pi-test-orchestrator-runtime/recoveries.jsonl`

### Implemented command surface
- `/test-adapter-validate`
- `/test-status`
- `/test-debug`
- `/test-targets`
- `/test-run <target>`
- `/test-canary`
- `/test-recover <action>`
- `/test-lock-clear`
- `/test-infra-research [incident-path]`

### Implemented make / driver surface
- `make test-e2e-drive`
- `make test-e2e-resume`
- `make test-e2e-drive-status`
- `make test-e2e-drive-reset`
- `make test-e2e-infra-research`
- `scripts/test-orchestrator-drive.mjs`
- `scripts/test-orchestrator-infra-research.mjs`

### Implemented tool surface
- `test_status`
- `test_debug`
- `test_targets`
- `test_run`
- `test_canary`
- `test_recover`
- `test_lock_clear`
- `test_infra_research`

### Verified behaviors
- adapter discovery and validation
- Playwright target discovery
- inter-process lock acquisition/blocking
- stale-lock awareness + explicit lock clearing
- persisted attempt records
- latest-state persistence
- cache-cleared canary execution
- guarded recovery execution with JSONL logging
- recovery post-check canary with retry window
- direct tool registration and invocation through the Pi session runtime
- durable suite-drive state persisted to `drive-state.json`
- bounded drive/pause/resume behavior through `make` entrypoints
- persistent infrastructure incident capture with `docker compose ps` and service log tails when suite fragility persists
- manual infra research report generation from captured incidents

### Not yet completed
- broader generalization beyond the EISA adapter
- richer classification logic beyond the coarse MVP contract
- UI polish beyond command/status usage
- decision and/or implementation of a custom SDK runtime layer
- default-on automated research or recommendation application (auto-research exists but is opt-in only)

### Current recommended use
The framework is ready to use for real Playwright debugging in EISA now. The preferred operator entrypoint is the make-driven suite driver, with the slash commands and tools used for focused intervention and manual triage.

## Goal

Build a reusable Pi-based test orchestration framework in `~/.dotfiles` that provides safe single-job execution, attempt persistence, recovery workflows, and status/debugging for fragile test environments.

The framework should stay general in the core, while project-specific repos provide local adapters/config for:
- runner commands
- canary commands
- recovery steps
- artifact locations
- failure classification hints
- service names and environment-specific safety rules

## Why this moved to dotfiles

The original plan was drafted inside `eisa-playwright-e2e`, but the orchestration mechanics are better treated as reusable Pi infrastructure:
- single active job locking
- persistent attempt logs
- structured status/debug commands
- guarded recovery actions
- project adapter loading

The EISA repo still provides the concrete Playwright/Keycloak/.NET adapter. The long-term framework belongs in `~/.dotfiles`.

## Non-Goals

- Rewriting test suites in application repos
- General-purpose multi-agent orchestration in v1
- Perfect failure diagnosis in v1
- Replacing existing project test commands
- Full Pi SDK custom runtime in the first MVP unless the extension-only approach proves insufficient

## Architecture Direction

### Core in dotfiles

Canonical home:
- `~/.dotfiles/.specs/pi-test-orchestrator/`

Expected implementation home later:
- `~/.pi/agent/extensions/test-orchestrator/`
- or a dotfiles-backed Pi package that loads from there

Core responsibilities:
- single active test job lock
- attempt record persistence
- named runner execution
- named canary execution
- named recovery action execution
- status/debug commands
- adapter loading and validation

### Project-local adapters

Each project provides a local config/adapter file, for example:
- `.pi/test-orchestrator.config.json`
- or `.specs/test-orchestrator/config.json`

Adapter responsibilities:
- declare allowed spec/test targets
- define runner command template
- define canary command
- define recovery sequence
- define artifact/result locations
- define classification patterns or hints
- define repo-specific service names and safety constraints

## Schema Contracts

These contracts freeze the core-vs-adapter boundary for MVP. The extension-first core owns validation and execution semantics; adapters supply project-local configuration only.

### 1. Adapter Config Schema

**Purpose:** declare how the generic orchestrator should interact with one project.

**Suggested path precedence:**
1. `.pi/test-orchestrator.config.json`
2. `.specs/test-orchestrator/config.json`
3. `docs/workflows/test-orchestrator.config.json`

**Schema v1:**

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "eisa-playwright-e2e",
    "name": "EISA Playwright E2E",
    "root": ".",
    "platform": "windows-bash"
  },
  "discovery": {
    "targetKind": "spec",
    "include": [
      "eisa-ng/e2e/playwright/tests/**/*.spec.ts"
    ],
    "exclude": []
  },
  "runner": {
    "command": "make test-e2e-file FILE={{target}}",
    "shell": "bash",
    "cwd": ".",
    "resultPaths": [
      "eisa-ng/e2e/playwright/test-results"
    ],
    "env": {}
  },
  "canary": {
    "target": "auth-smoke.spec.ts",
    "clearPathsBeforeRun": [
      "eisa-ng/e2e/playwright/.auth/*.json"
    ]
  },
  "recoveryActions": {
    "auth-stack-recover": {
      "description": "Restart Keycloak, wait for health, restart .NET services, clear auth cache",
      "requiresConfirmation": true,
      "steps": [
        {
          "kind": "command",
          "shell": "bash",
          "command": "COMPOSE_PROJECT_NAME=eisa docker compose restart keycloak"
        },
        {
          "kind": "command",
          "shell": "bash",
          "command": "bash scripts/wait-for-keycloak.sh"
        },
        {
          "kind": "command",
          "shell": "bash",
          "command": "COMPOSE_PROJECT_NAME=eisa docker compose restart eisa.mvcweb eisa.cert.mvcweb eisa.advisory.api eisa.reporting.api eisa.helpsupport.api"
        },
        {
          "kind": "delete_glob",
          "paths": [
            "eisa-ng/e2e/playwright/.auth/*.json"
          ]
        }
      ]
    }
  },
  "classificationHints": {
    "infraPatterns": [
      "blank page",
      "timeout waiting for #username",
      "500: An error occurred",
      "session token expired",
      "client_not_found"
    ],
    "testPatterns": [
      "Expected",
      "locator",
      "toHaveURL",
      "toBeVisible"
    ]
  },
  "artifacts": {
    "attemptRoot": ".specs/pi-test-orchestrator-runtime/attempts",
    "stateRoot": ".specs/pi-test-orchestrator-runtime/state",
    "recoveryLog": ".specs/pi-test-orchestrator-runtime/recoveries.jsonl"
  }
}
```

**Validation rules:**
- `schemaVersion` is required and must be an integer.
- `project.id` must be stable and filesystem-safe.
- `discovery.include` must resolve to at least one file before the adapter is considered valid.
- `runner.command` must contain `{{target}}` when `targetKind` is `spec`.
- recovery action names must be unique.
- adapter paths are always resolved relative to repo root unless absolute.
- the core must reject adapters that reference missing required scripts/paths at load time when they are declared mandatory.

### 2. Attempt Record Schema

**Purpose:** durable per-run history independent of chat/session memory.

**Suggested path:**
- `<attemptRoot>/<target-slug>/<timestamp>.json`

**Schema v1:**

```json
{
  "schemaVersion": 1,
  "id": "2026-04-20T21-15-03.123Z__auth-smoke-spec-ts",
  "projectId": "eisa-playwright-e2e",
  "target": {
    "kind": "spec",
    "name": "auth-smoke.spec.ts",
    "path": "eisa-ng/e2e/playwright/tests/auth-smoke.spec.ts",
    "slug": "auth-smoke-spec-ts"
  },
  "run": {
    "command": "make test-e2e-file FILE=auth-smoke.spec.ts",
    "shell": "bash",
    "cwd": ".",
    "startedAt": "2026-04-20T21:15:03.123Z",
    "endedAt": "2026-04-20T21:17:10.456Z",
    "durationMs": 127333,
    "exitCode": 0
  },
  "classification": {
    "status": "pass",
    "reason": "playwright exit code 0",
    "evidence": [
      "canary passed",
      "results file present"
    ]
  },
  "artifacts": {
    "resultPaths": [
      "eisa-ng/e2e/playwright/test-results/last.json"
    ],
    "screenshots": [],
    "traces": [],
    "logs": []
  },
  "related": {
    "lockId": "lock_eisa-playwright-e2e",
    "recoveryRunIds": [],
    "canaryAttemptId": null
  },
  "summary": "2/2 passed after cache-cleared auth run"
}
```

**Allowed `classification.status` values in MVP:**
- `pass`
- `test_failure`
- `infra_failure`
- `blocked`
- `recovery_run`

**Validation rules:**
- `endedAt` and `durationMs` are required once a run completes.
- `summary` must be human-readable and short.
- `classification.reason` must cite deterministic evidence, not freeform speculation.
- artifact paths may be empty arrays but must always be present.

### 3. Lock State Schema

**Purpose:** enforce one active test job across Pi sessions/processes.

**Suggested path:**
- `<stateRoot>/active-run.json`

**Schema v1:**

```json
{
  "schemaVersion": 1,
  "lockId": "lock_eisa-playwright-e2e",
  "projectId": "eisa-playwright-e2e",
  "owner": {
    "pid": 48216,
    "hostname": "workstation-01",
    "sessionId": "pi-session-uuid-or-null"
  },
  "target": {
    "kind": "spec",
    "name": "auth-smoke.spec.ts",
    "slug": "auth-smoke-spec-ts"
  },
  "run": {
    "command": "make test-e2e-file FILE=auth-smoke.spec.ts",
    "startedAt": "2026-04-20T21:15:03.123Z",
    "heartbeatAt": "2026-04-20T21:16:00.000Z",
    "status": "running"
  },
  "stale": {
    "timeoutMs": 1800000,
    "manualClearRequired": true
  }
}
```

**Validation and behavior rules:**
- only one `active-run.json` per project.
- lock acquisition must be atomic.
- the core must refresh `heartbeatAt` during long runs.
- if the owning process is dead and `heartbeatAt` exceeds `timeoutMs`, the lock is stale.
- stale locks must not be auto-cleared silently; expose an explicit clear command.
- `status` allowed values: `running`, `recovery`, `clearing`, `stale`.

### 4. Recovery Log Schema

**Purpose:** persist auditable records of guarded recovery actions.

**Suggested path:**
- `<recoveryLog>` as JSONL

**Schema v1 (one line per entry):**

```json
{
  "schemaVersion": 1,
  "id": "2026-04-20T21-30-00.000Z__auth-stack-recover",
  "projectId": "eisa-playwright-e2e",
  "action": "auth-stack-recover",
  "startedAt": "2026-04-20T21:30:00.000Z",
  "endedAt": "2026-04-20T21:33:30.000Z",
  "status": "success",
  "trigger": {
    "reason": "canary failed with blank page",
    "confirmedByUser": true
  },
  "steps": [
    {
      "name": "restart-keycloak",
      "status": "success"
    },
    {
      "name": "wait-for-keycloak",
      "status": "success"
    },
    {
      "name": "restart-dotnet-services",
      "status": "success"
    },
    {
      "name": "clear-auth-cache",
      "status": "success"
    }
  ],
  "postChecks": [
    "auth canary passed"
  ],
  "summary": "Auth stack recovered after Keycloak restart and cache clear"
}
```

**Allowed `status` values:**
- `success`
- `partial_failure`
- `failed`
- `cancelled`

**Validation and behavior rules:**
- every recovery action must create a log entry, even on cancellation.
- every step must record status.
- partial recovery must never be reported as success.
- optional post-checks must be explicitly listed when run.

### 5. MVP Classification Contract

To avoid false precision, MVP classification must use conservative rules in this order:

1. if the command was not started because of lock/precondition failure → `blocked`
2. if a named recovery action was executed → `recovery_run`
3. if the target exited 0 and expected result artifacts exist → `pass`
4. if the target failed and a cache-cleared canary also failed in the same diagnostic window → `infra_failure`
5. otherwise → `test_failure`

The core may record richer evidence strings, but must not invent extra top-level statuses in MVP.

## Recommended MVP

### MVP shape

Use an **extension-first** implementation, not a full custom SDK runtime yet.

The MVP should do only these things reliably:
1. run exactly one test job at a time
2. persist attempt history to disk
3. classify failures coarsely but deterministically
4. run known recovery sequences safely
5. expose status/debug via commands

### MVP core capabilities

#### 1. Single-job runner
A generic command/tool that:
- validates the requested target against adapter-declared allowed targets
- acquires an inter-process lock
- runs the adapter-declared command
- records exit code, timing, and artifact paths

#### 2. Inter-process lock
Persist lock state on disk with:
- target name
- PID/session id
- start time
- status
- stale-lock recovery rules

#### 3. Attempt records
Write one record per run with:
- target
- command
- exit code
- duration
- artifact paths
- classification
- summary
- whether recovery/canary was run

#### 4. Conservative classification
Use simple initial states:
- `pass`
- `test_failure`
- `infra_failure`
- `blocked`
- `recovery_run`

#### 5. Recovery actions
Run adapter-declared named recovery flows with:
- confirmation
- precondition checks
- health checks
- persistent logs

#### 6. Status/debug commands
Expose:
- `/test-status`
- `/test-debug`

No custom TUI widget/footer in MVP.

## EISA Project Adapter (first adopter)

The first concrete adapter is this repo:
- `C:/Projects/Work/Gitlab/eisa-playwright-e2e`

Expected local adapter concerns:
- Playwright spec discovery under `eisa-ng/e2e/playwright/tests`
- runner command based on `make test-e2e-file FILE=<spec>`
- canary using `auth-smoke.spec.ts`
- recovery sequence:
  1. restart keycloak
  2. wait for keycloak
  3. restart .NET services
  4. clear `.auth/*.json`
  5. rerun canary optionally
- artifact directories under `eisa-ng/e2e/playwright/test-results`
- infra classification hints for Keycloak/auth/cert mismatch failure modes

## Success Criteria

### Core framework
1. The core can load a valid project adapter and reject an invalid one.
2. The core enforces exactly one active test job at a time across Pi sessions/processes.
3. Every run produces a persisted attempt record.
4. Recovery actions are explicit, logged, and guarded by preconditions.
5. Status/debug commands work without relying on prior chat context.

### EISA adapter
6. The EISA adapter can run a single spec safely.
7. The EISA adapter can run a cache-cleared auth canary.
8. The EISA adapter can execute the documented auth recovery sequence.
9. The EISA adapter can persist and summarize attempt/recovery history.

## Phase Plan

| Phase | Outcome | Scope | Status |
|---|---|---|---|
| P0 | Freeze core-vs-adapter boundary | dotfiles spec + adapter contract | Done |
| P1 | Implement extension-first core MVP | locking, runner, attempts, recovery, status/debug | Done |
| P2 | Add EISA adapter | Playwright runner, canary, recovery wiring | Done |
| P3 | Validate against real EISA failures | single-spec, canary, recovery, restart cases | Done |
| P4 | Decide whether SDK runtime is still needed | only after MVP limits are proven | Deferred |

## Detailed Work Breakdown

### P0: Design freeze
1. Define the adapter schema.
2. Define attempt record schema.
3. Define lock state schema.
4. Define recovery log schema.
5. Decide the canonical extension/package location in dotfiles.

### P1: Extension-first core
1. Build a repo-agnostic Pi extension/package.
2. Add target validation against adapter config.
3. Add inter-process locking.
4. Add attempt persistence.
5. Add named recovery execution.
6. Add `/test-status` and `/test-debug`.

### P2: EISA adapter
1. Add local config in the EISA repo.
2. Wire Playwright spec discovery.
3. Wire canary command.
4. Wire recovery sequence.
5. Wire artifact paths and classification hints.

### P3: Validation
1. Prove one active run is enforced across sessions.
2. Prove stale-lock cleanup works.
3. Prove canary logging works.
4. Prove recovery sequence logs correctly.
5. Prove state survives Pi restart/crash.

### P4: Runtime decision
Only after MVP is proven, decide whether a custom Pi SDK runtime adds value beyond the extension-first core.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Generalizing too early creates framework churn | delays value | keep core minimal; first adopter is EISA only |
| Adapter format becomes too weak or too specific | weak reuse | freeze schema carefully in P0 |
| Locking is only in-memory or session-local | concurrency bugs | require inter-process disk lock |
| Recovery flows worsen broken stacks | misleading automation | enforce health/precondition checks |
| Status/debug grows into UI work too early | scope bloat | keep commands-only in MVP |

## Decision Summary

### Problem
The EISA Playwright workflow needs orchestration help now, but the orchestration mechanics are reusable across repos.

### Options
1. **Project-specific only**
   - fastest, but poor reuse
2. **General core + project adapter**
   - reusable without over-generalizing repo-specific logic
3. **Fully generic framework from day one**
   - highest reuse ambition, highest over-engineering risk

### Recommendation
Choose **general core + project adapter**, with a very small extension-first core in dotfiles and the EISA repo as the first adapter.

## Next Action

Use the implemented orchestrator to drive real EISA Playwright triage:
1. run `/test-status`
2. run `/test-canary`
3. run `/test-run <spec>.spec.ts` one file at a time
4. use `/test-recover auth-stack-recover` only when canary/infra state requires it
5. defer further framework changes until real debugging exposes a concrete gap
