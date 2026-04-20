# Pi Workflow Borrowed Features

## Goal

Document workflow features observed in `C:/Users/mglenn/Downloads/src` that are worth borrowing into Pi, filtered to exclude capabilities Pi already has in some form.

## Scope

This spec covers:
- candidate features to add to Pi
- why each is distinct from current Pi capabilities
- priority and rough implementation size
- research targets for the top three items

This spec does **not** propose implementation details yet beyond high-level direction.

## Sources Reviewed

### External source tree
- `C:/Users/mglenn/Downloads/src/commands.ts`
- `C:/Users/mglenn/Downloads/src/commands/status/index.ts`
- `C:/Users/mglenn/Downloads/src/commands/doctor/index.ts`
- `C:/Users/mglenn/Downloads/src/commands/tasks/index.ts`
- `C:/Users/mglenn/Downloads/src/commands/permissions/permissions.tsx`
- `C:/Users/mglenn/Downloads/src/commands/plugin/plugin.tsx`
- `C:/Users/mglenn/Downloads/src/commands/cost/cost.ts`
- `C:/Users/mglenn/Downloads/src/commands/review.ts`
- `C:/Users/mglenn/Downloads/src/commands/ultraplan.tsx`
- `C:/Users/mglenn/Downloads/src/commands/memory/index.ts`

### Current Pi surfaces
- `pi/extensions/prompt-router.ts`
- `pi/extensions/workflow-commands.ts`
- `pi/extensions/subagent/index.ts`
- `pi/extensions/agent-team.ts`
- `pi/extensions/agent-chain.ts`
- `pi/extensions/damage-control.ts`
- `pi/extensions/quality-gates.ts`
- `pi/extensions/session-hooks.ts`
- `pi/README.md`
- `.specs/pi-subagent-routing-policy/*`

## Already Present In Pi

These were intentionally excluded as net-new recommendations because Pi already has them in some form:
- prompt/model routing
- multi-agent delegation and chaining
- workflow slash commands
- safety hooks / damage control
- quality gates / validation
- expertise logs and session logging
- skill-backed command flows

## Candidate Features

### 1. Status bar + `/doctor` surface
**Priority:** P1  
**Size:** S-M

Pi currently has fragmented visibility into router status, session hooks, model routing, validators, tools, and extension state. A single consolidated operator surface would materially improve operability.

Potential scope:
- **status bar** for live at-a-glance state
- active model/provider and routing state
- active Pi version number
- loaded extensions and failures only when relevant
- lightweight git/repo context
- quality-gate / validator warning state
- auth/config sanity warning state
- `/doctor` for environment summary and actionable remediation

Why it is distinct:
- Pi has `/router-status`, but not whole-system live status in the status bar.
- Pi has hooks and validators, but not a single health dashboard + doctor workflow.

### 2. Persistent background task dashboard
**Priority:** P1  
**Size:** M

Pi already supports parallel and chained subagents, but does not expose a first-class operational dashboard for long-running or background work.

Potential scope:
- `/tasks` or `/jobs` command for viewing active/completed subagent runs
- runtime, status, token usage, and cost summaries
- cancel/retry controls for background tasks
- collapsed/expanded result history
- statusline indicator for in-flight work

Why it is distinct:
- Pi can run parallel subagents, but lacks a dedicated persistent management layer.
- The current subagent render is informative in-line, not a reusable job-control surface.

### 3. Interactive permissions management and retry UX
**Priority:** P1  
**Size:** M

Pi has strong safety controls, but they are primarily rule-driven. A dedicated user-facing permissions surface would improve transparency and reduce friction when safe exceptions are needed.

Potential scope:
- `/permissions` command to inspect active decisions and rules
- recent denied actions and blocked paths
- allow once / allow for session / allow for repo decisions
- retry a denied tool call after approval
- audit trail of permission decisions

Why it is distinct:
- Pi already blocks risky actions, but does not provide a centralized permissions UI/command workflow.

### 4. First-class cost and usage observability
**Priority:** P2  
**Size:** S-M

Pi exposes some usage data through subagent rendering and routing artifacts, but lacks a dedicated cost/usage reporting workflow.

Potential scope:
- `/cost` and `/usage`
- per-session and per-subagent totals
- cost by model tier and command type
- budget threshold warnings
- model-routing cost impact summaries

Why it is distinct:
- Current usage visibility exists, but not as a deliberate operator-facing surface.

### 5. Plugin / extension / skill management UX
**Priority:** P2  
**Size:** L

Pi supports extensions and skills, but management is currently file/config centric rather than user-facing.

Potential scope:
- browse/install/update/enable/disable flows
- trust and provenance warnings for third-party code
- reload extensions without full restart
- curated workflow packs

Why it is distinct:
- Technical extensibility exists, but package-management UX does not.

### 6. Detached remote heavy-work mode
**Priority:** P3  
**Size:** L

Pi can delegate locally but does not have an equivalent detached remote execution flow for very long-running planning or review tasks.

Potential scope:
- remote planning/review sessions
- polling and result handoff back into Pi
- optional “execute remotely” vs “return plan locally” choice
- free terminal while remote task runs

Why it is distinct:
- Pi supports local orchestration, not detached remote heavy workflows.

### 7. User-editable memory / preferences layer
**Priority:** P3  
**Size:** M

Pi has AGENTS instructions and agent expertise logs, but no clear user-facing memory/preferences surface.

Potential scope:
- personal coding preferences
- repo-specific standing instructions
- formatting/commit/planning preferences
- explicit separation from AGENTS rules and agent expertise

Why it is distinct:
- Expertise logs are agent-internal accumulated knowledge, not user-owned editable memory.

## Priority Recommendation

Recommended build order:
1. Status bar + `/doctor`
2. Persistent background task dashboard
3. Interactive permissions management and retry UX
4. Cost / usage observability
5. Plugin / extension / skill management UX
6. Detached remote heavy-work mode
7. User-editable memory / preferences layer

## Research Targets

The next phase focuses on external research for items 1-3:
1. Unified diagnostics / doctor / status UX
2. Background task dashboards / job control UX
3. Permission management / approval / retry workflows

Research should look for:
- GitHub and other code hosting repos
- awesome lists / curated collections
- blog posts and design writeups
- implementation patterns that can be borrowed without duplicating Pi’s existing surfaces

## Requirements Documents

This spec directory now includes:
- `plan.md` — candidate features, priorities, and scope
- `research-notes.md` — external and Pi-specific ecosystem findings
- `user-stories.md` — problem statements, user stories, and acceptance-oriented requirements
- `mvp-spec.md` — smallest testable implementation scope for trial and feedback
- `implementation-checklist.md` — phased build plan, likely files, and acceptance checkpoints
