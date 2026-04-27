---
created: 2026-04-17
status: draft
completed:
---

# Plan: Pi operator layer MVP

## Related Plans

This plan is the **canonical owner of the durable task registry and the permission decision registry**. Other plans should consume `pi/lib/task-registry.ts` and `pi/lib/permission-registry.ts` from this plan rather than defining parallel abstractions.

- `.specs/pi-platform-alignment/plan.md` -- Platform/contracts alignment (settings cascade, skill auto-discovery, agent frontmatter). Its former T11 task-tracker has been folded into this plan's T1 registry. Phase 2 (config-driven hook engine) is deferred there; this plan does not depend on it.
- `.specs/pi-tool-reduction/plan.md` -- Phase 1 shipped 2026-04-22 (deterministic reduction pipeline, scrubber, eval harness). Phase 2 (LLM codegen + classifier) is intentionally deferred. No dependency between this plan and tool-reduction.

## Codebase Reality (as of 2026-04-27)

`pi/lib/` is **not greenfield**. Existing modules to coordinate with:

- `pi/lib/expertise-snapshot.ts` -- mental-model serialization and dedupe
- `pi/lib/transcript.ts` -- session log parsing and correlation
- `pi/lib/repo-id.ts` -- deterministic git remote -> slug mapping (reuse for scoping registry storage per-repo)
- `pi/lib/model-routing.ts` -- provider/model ladder resolution
- `pi/lib/extension-utils.ts` -- shared validation/settings/path helpers
- `pi/lib/yaml-mini.ts` -- lightweight YAML parser (reuse for any registry config)
- `pi/lib/yaml-helpers.ts` -- YAML utilities

T1 must add new modules **alongside** these without naming collisions. Treat `repo-id.ts` and `extension-utils.ts` as reusable; do not duplicate their helpers.

Existing extensions that will be wired in T2: `pi/extensions/subagent/index.ts`, `pi/extensions/agent-team.ts`, `pi/extensions/damage-control.ts`. These already work via hardcoded logic; integration must be additive (do not break current subagent/team/damage-control behavior).

## Context & Motivation

This repo’s Pi setup already has strong workflow capabilities — prompt routing, subagents, team dispatch, workflow commands, damage-control, quality gates, and session hooks — but the operator experience is fragmented.

The conversation crystallized three concrete usability problems:

1. **Current runtime state is hard to read at a glance.** The user wants the primary state surface to be the status bar, not a `/status` command. The healthy state should stay quiet and identity-focused, and it should show the **active Pi version**. The current Claude Code status bar review reinforced that a compact, ambient line works best when it shows identity first and only appends warning tokens when something needs attention.
2. **Long-running work is visible in the moment but not managed as durable objects.** The conversation locked in a **first-class task registry** rather than transcript-derived task hints. Tasks should cover subagent runs, `/team` work, detached shell-style jobs, and similar durable work — not every inline action.
3. **Permission behavior is safe but not inspectable enough.** The user wants a `/permissions` surface that exposes current session approvals, recent allow/deny decisions, reset/revoke operations, and safe retry of denied actions when replay data is available.

Research across the Pi ecosystem found that pieces of all three features already exist publicly (statusline packages, task tracking and dashboards, permission control and auditing), but not as a single integrated operator layer for this repo’s Pi workflow. That makes the goal here a repo-local MVP that borrows the best patterns while staying small and testable.

## Constraints

- Platform: Windows (MSYS2/Git Bash userland on `MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Repo preference: healthy status bar must stay **quiet**; do not clutter it with task counts, permission labels, explicit `OK`, or `git status --short` counters
- Healthy status bar must include: compact repo/path, branch when available, active model/provider, router/effort if meaningful, and **active Pi version number**
- Feature 2 is explicitly constrained to a **first-class task registry**
- Task lifecycle is fixed for MVP: `pending`, `running`, `blocked`, `completed`, `failed`, `cancelled`
- Feature 3 must remain **safe by default**; no hidden auto-escalation or broad permission bypass
- MVP should avoid broad framework rewrites; prefer thin shared state modules plus small integrations
- Existing repo validation should remain usable via Makefile targets and Python tooling

- Platform: Windows/MSYS2 Git Bash
- Shell: bash
- Use existing repo validation commands where possible (`make test-pytest`, `make lint-python`, `make check`)
- Respect current spec work under `.specs/pi-workflow-borrowed-features/`

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Status command as primary state surface | Easy to implement, explicit | User rejected it; requires active polling of state; worse UX than ambient status | Rejected: the status bar should be primary |
| Transcript-derived task hints only | Minimal code changes, cheaper short-term | Not durable, hard to inspect/retry, weak source of truth | Rejected: conversation explicitly chose first-class task registry |
| Full operator control plane / broad scheduler redesign | Powerful, future-friendly | Too large for MVP, high coupling, scope creep | Rejected: MVP must stay thin |
| Shared registries + small repo-local operator surfaces | Durable state, incremental integration, aligns with repo constraints | Requires several coordinated files and careful state ownership | **Selected** |

## Objective

Implement a testable repo-local Pi operator layer MVP that:
- adds a minimal ambient status bar with Pi version and conditional warning tokens
- introduces a durable task registry for in-scope long-running work plus a `/tasks` surface
- introduces a durable permission decision/session-approval registry plus a `/permissions` surface
- adds a `/doctor` command with default, verbose, and JSON output for troubleshooting the repo’s Pi setup

## Project Context

- **Language**: TypeScript + Python + shell in a dotfiles repo
- **Test command**: `make test-pytest`
- **Lint command**: `make lint-python`

## Task Breakdown

| # | Task | Files | Type | Model | Depends On |
|---|------|-------|------|-------|------------|
| T1 | Build shared operator registries | 3-4 | architecture | opus | — |
| V1 | Validate wave 1 | — | validation | sonnet | T1 |
| T2 | Integrate task and permission producers | 3-5 | feature | sonnet | V1 |
| V2 | Validate wave 2 | — | validation | sonnet | T2 |
| T3 | Implement minimal status bar and `/doctor` | 2-4 | feature | sonnet | V2 |
| T4 | Implement `/tasks` using the task registry | 1-3 | feature | sonnet | V2 |
| T5 | Implement `/permissions` using the permission registry | 1-3 | feature | sonnet | V2 |
| V3 | Validate wave 3 | — | validation | sonnet | T3, T4, T5 |
| T6 | Update docs and usage guidance | 1-2 | mechanical | haiku | V3 |
| V4 | Validate wave 4 | — | validation | sonnet | T6 |

## Execution Waves

### Wave 1

**T1: Add shared operator registries to pi/lib/** [opus]
- Description: Add the durable state layer for the MVP **alongside the existing modules in `pi/lib/`** (see "Codebase Reality" above). Introduce `task-registry.ts` and `permission-registry.ts`. The task registry must define `TaskRecordV1`, the six-state lifecycle (`pending`, `running`, `blocked`, `completed`, `failed`, `cancelled`), state transitions, timestamps, preview metadata, and durable persistence. The permission registry must record recent decisions, session approvals, provenance, and replayable-denial references when safe.
  - **This plan owns the canonical `TaskRecordV1` schema.** Any other plan needing task tracking (notably the former `pi-platform-alignment` T11 task-tracker) must consume this registry, not define a parallel one.
  - **Reuse existing pi/lib/ helpers**: use `repo-id.ts` for per-repo storage scoping, `extension-utils.ts` for path/settings helpers, `yaml-mini.ts` if a config file is added. Do not duplicate these.
  - **Storage location**: write to `~/.pi/agent/tasks/` and `~/.pi/agent/permissions/` (aligns with the existing `~/.pi/agent/` convention used by expertise/logs).
- Files:
  - `pi/lib/task-registry.ts` *(new)*
  - `pi/lib/permission-registry.ts` *(new)*
  - `pi/lib/operator-state.ts` *(new; shared constants and storage-path helpers)*
- Acceptance Criteria:
  1. [ ] Task registry can create, update, transition, and list tasks with the agreed six-state lifecycle.
     - Verify: `rg -n "TaskRecordV1|pending|blocked|cancelled" pi/lib/task-registry.ts && make lint-python`
     - Pass: registry file defines the expected lifecycle/state shape and Python lint still passes for the repo
     - Fail: missing lifecycle definitions or unrelated repo breakage; inspect the registry module and repo lint output
  2. [ ] Permission registry can record decisions, list recent decisions, list session approvals, and reset session approvals.
     - Verify: `rg -n "recordDecision|listRecentDecisions|listSessionApprovals|resetSessionApprovals" pi/lib/permission-registry.ts`
     - Pass: all required helper entry points exist
     - Fail: one or more helpers missing; add them before integrating surfaces
  3. [ ] Durable storage does not rely on transcript parsing.
     - Verify: `rg -n "sessions|transcript|buildSessionContext" pi/lib/task-registry.ts pi/lib/permission-registry.ts`
     - Pass: registries use dedicated state files/helpers rather than transcript-derived state
     - Fail: implementation depends on transcript parsing; replace with dedicated durable state storage

### Wave 1 — Validation Gate

**V1: Validate wave 1** [sonnet]
- Blocked by: T1
- Checks:
  1. Run acceptance criteria for T1
  2. `make test-pytest` — existing repo Python tests still pass
  3. `make lint-python` — no Python lint regressions introduced elsewhere
  4. Cross-task integration: confirm both registries can coexist under the chosen operator-state location and do not conflict in storage layout
- On failure: create a fix task, re-validate after fix

### Wave 2

**T2: Integrate task and permission producers** [sonnet]
- Blocked by: V1
- Description: Wire the shared registries into the existing task and permission-producing surfaces in this repo’s Pi setup. Subagent executions are the highest-value task producer and must register task creation and lifecycle changes. `/team` delegated work should register tasks when it creates durable work. Damage-control should record allow/deny/provenance events without broadening existing permission behavior.
- Files:
  - `pi/extensions/subagent/index.ts`
  - `pi/extensions/agent-team.ts`
  - `pi/extensions/damage-control.ts`
  - `pi/extensions/ask-user.ts` *(only if needed for approval provenance capture)*
- Acceptance Criteria:
  1. [ ] In-scope subagent runs create durable task records and transition them through the agreed lifecycle.
     - Verify: `rg -n "createTask|transitionTask|updateTask" pi/extensions/subagent/index.ts`
     - Pass: subagent extension clearly writes lifecycle updates to the registry
     - Fail: no registry integration or only partial creation without transitions
  2. [ ] Damage-control records recent permission decisions with provenance categories where known.
     - Verify: `rg -n "recordDecision|manual_once|session|rule|unknown" pi/extensions/damage-control.ts pi/extensions/ask-user.ts`
     - Pass: decision recording hooks exist with provenance mapping
     - Fail: deny/allow paths are not captured or provenance is silently dropped
  3. [ ] One-shot inline work is not promoted into tasks.
     - Verify: manual code review of integration points plus `rg -n "createTask" pi/extensions`
     - Pass: task creation only appears in durable-work producers
     - Fail: ordinary inline tool paths create registry entries; tighten boundaries

### Wave 2 — Validation Gate

**V2: Validate wave 2** [sonnet]
- Blocked by: T2
- Checks:
  1. Run acceptance criteria for T2
  2. `make test-pytest` — all tests pass
  3. `make lint-python` — no new lint regressions
  4. Cross-task integration: run a real parallel subagent invocation and confirm task records and permission decisions are both durably recorded without transcript parsing
- On failure: create a fix task, re-validate after fix

### Wave 3 (parallel)

**T3: Implement minimal status bar and `/doctor`** [sonnet]
- Blocked by: V2
- Description: Add the operator status surface. The healthy status bar must stay quiet and identity-focused, showing repo/path, branch, model/provider, router/effort if meaningful, and active Pi version. Only append `task`, `elevated`, or `! <reason>` when relevant. Add `/doctor`, `/doctor --verbose`, and `/doctor --json` to check runtime availability, model resolution, repo/cwd sanity, extension loading, prompt router prerequisites, and both registries.
- Files:
  - `pi/extensions/operator-status.ts` *(new)*
  - `pi/extensions/prompt-router.ts` *(only if router state must be exposed to shared status code)*
  - `pi/README.md` *(later documented in T6, but may need interim notes if command registration is centralized)*
- Acceptance Criteria:
  1. [ ] Healthy status bar shows compact repo/path, branch when available, model/provider, router/effort if meaningful, and active Pi version number.
     - Verify: manual check in Pi session; supporting code via `rg -n "version|task|elevated|validator|doctor" pi/extensions/operator-status.ts`
     - Pass: healthy default bar is quiet and contains Pi version
     - Fail: healthy bar includes noisy counters or omits version
  2. [ ] Status bar only appends warning tokens when relevant.
     - Verify: manual checks in healthy and degraded states
     - Pass: no `OK`, task counts, or permission labels in healthy default; warning tokens appear only when triggered
     - Fail: persistent noisy suffixes in healthy state
  3. [ ] `/doctor`, `/doctor --verbose`, and `/doctor --json` exist and cover the required MVP checks.
     - Verify: `rg -n "doctor" pi/extensions/operator-status.ts`
     - Pass: all command variants are implemented and structured output paths exist
     - Fail: only one variant exists or required checks are missing

**T4: Implement `/tasks` using the task registry** [sonnet]
- Blocked by: V2
- Description: Build a compact `/tasks` operator surface on top of the task registry. The default view must group by urgency (`blocked`, `failed`, `running`, `pending`, `completed`, `cancelled`), show compact row summaries, and support detail view plus cancel/retry when supported.
- Files:
  - `pi/extensions/tasks.ts`
  - `pi/lib/task-registry.ts` *(if minor API adjustments are needed)*
- Acceptance Criteria:
  1. [ ] `/tasks` shows grouped tasks ordered by urgency and excludes ordinary one-shot inline work.
     - Verify: manual Pi session with real subagent/team work
     - Pass: blocked/failed/running tasks are surfaced first and registry noise stays low
     - Fail: ordering is wrong or trivial tasks clutter the list
  2. [ ] Task detail view exposes id, origin, state, timestamps, summary, error/block reasons, and usage/runtime when available.
     - Verify: manual detail inspection of at least one completed and one failed/blocked task
     - Pass: required fields are visible without transcript hunting
     - Fail: details require transcript context or omit critical state data
  3. [ ] Retry and cancel behave according to the MVP rules.
     - Verify: manually retry a failed task and cancel a running task where supported
     - Pass: retry increments retry count and preserves prior failure context; cancel preserves final summary
     - Fail: retry silently rewrites history or cancel erases useful state

**T5: Implement `/permissions` using the permission registry** [sonnet]
- Blocked by: V2
- Description: Build a `/permissions` operator surface that shows current effective approval state, session approvals, recent allow decisions, recent deny decisions, provenance categories, reset/revoke session approvals, and safe retry of denied actions when replay data is still available.
- Files:
  - `pi/extensions/permissions.ts`
  - `pi/lib/permission-registry.ts` *(if minor API adjustments are needed)*
- Acceptance Criteria:
  1. [ ] `/permissions` clearly distinguishes session approvals from rule-based/static behavior.
     - Verify: manual Pi session after triggering both rule-based and interactive approval paths
     - Pass: the summary surface makes the distinction obvious
     - Fail: users cannot tell why something was allowed or denied
  2. [ ] Recent decisions show action summary, outcome, provenance, and recency information.
     - Verify: manual inspection after several allow/deny events
     - Pass: recent history is useful for understanding permission behavior
     - Fail: missing provenance or unclear action summaries
  3. [ ] Supported denied actions can be retried safely and visibly.
     - Verify: trigger a blocked action, inspect it in `/permissions`, choose retry, and re-run through the safe approval path
     - Pass: replay is explicit, visible as a new action/decision, and uses stored payload only when available
     - Fail: hidden replay, unsafe replay, or inability to explain why replay is unavailable

### Wave 3 — Validation Gate

**V3: Validate wave 3** [sonnet]
- Blocked by: T3, T4, T5
- Checks:
  1. Run acceptance criteria for T3, T4, and T5
  2. `make test-pytest` — all tests pass
  3. `make lint-python` — no new lint regressions
  4. Cross-task integration:
     - status bar shows `task` when relevant tasks exist
     - status bar shows `elevated` when non-default permission state exists
     - `/doctor` reports registry availability and extension/router issues correctly
     - `/tasks` and `/permissions` operate on durable shared state rather than transient conversation context
- On failure: create a fix task, re-validate after fix

### Wave 4

**T6: Update docs and usage guidance** [haiku]
- Blocked by: V3
- Description: Document the new operator layer surfaces for this repo’s Pi setup. Update repo docs so a future user/agent can discover the status bar behavior, `/doctor`, `/tasks`, and `/permissions` without reading code.
- Files:
  - `pi/README.md`
  - optionally `.specs/pi-workflow-borrowed-features/implementation-checklist.md` or nearby notes if implementation details materially changed during build
- Acceptance Criteria:
  1. [ ] README documents the new status bar behavior and operator commands.
     - Verify: `rg -n "/doctor|/tasks|/permissions|status bar|Pi version" pi/README.md`
     - Pass: all new surfaces are described succinctly
     - Fail: docs omit commands or describe outdated behavior
  2. [ ] Documentation matches shipped MVP behavior.
     - Verify: manual comparison between README and implementation
     - Pass: docs reflect the actual command names, outputs, and constraints
     - Fail: mismatch between documented and real behavior

### Wave 4 — Validation Gate

**V4: Validate wave 4** [sonnet]
- Blocked by: T6
- Checks:
  1. Run acceptance criteria for T6
  2. `make test-pytest` — all tests still pass
  3. `make lint-python` — no new lint regressions
  4. Cross-task integration: README accurately reflects status bar behavior, task registry boundaries, and permission retry constraints
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1 → V1
Wave 2: T2 → V2
Wave 3: T3, T4, T5 (parallel) → V3
Wave 4: T6 → V4
```

## Success Criteria

The plan succeeds when the repo’s Pi setup has a usable operator layer that is quiet in the healthy case and durable when work or approvals need attention.

1. [ ] Healthy status bar exposes repo/model/version without noisy counters
   - Verify: manual Pi session in a healthy repo state
   - Pass: one-line status shows compact repo/path, branch when available, model/provider, router/effort if meaningful, and Pi version
2. [ ] Long-running work is durably inspectable and manageable
   - Verify: run a real parallel subagent workflow, then use `/tasks`
   - Pass: tasks are registered, grouped by urgency, and can be inspected/cancelled/retried where supported
3. [ ] Permission behavior is inspectable and recoverable
   - Verify: trigger at least one allow and one deny decision, then use `/permissions`
   - Pass: provenance/recency is visible, session approvals can be reset, and replay works only when safely supported
4. [ ] Troubleshooting the setup no longer requires code spelunking first
   - Verify: run `/doctor`, `/doctor --verbose`, and `/doctor --json`
   - Pass: warnings/errors include actionable remediation and JSON output is machine-readable

## Handoff Notes

- The conversation already produced supporting specs in `.specs/pi-workflow-borrowed-features/`: `research-notes.md`, `user-stories.md`, `mvp-spec.md`, and `implementation-checklist.md`. This plan is the execution wrapper around those artifacts.
- Use the MVP boundaries as hard scope limits. Do not add plugin marketplace UX, broad scheduler redesign, extra task states like `queued`, or full permission auto-escalation to this plan.
- This repo’s dominant validation commands are Python-oriented (`make test-pytest`, `make lint-python`), even though the implementation work is primarily in TypeScript. If TypeScript-specific validation is added during implementation, document it and include it in the relevant validation gates rather than replacing the existing repo commands.
- None.
