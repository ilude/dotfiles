# Pi Global Agent Instructions

Rules that apply to all Pi agent sessions. Project-specific rules in each repo's `AGENTS.md` take precedence.

## Agent System Overview

This Pi configuration uses a three-tier multi-agent architecture with knowledge compounding via expertise files:

- **Orchestrator** (Opus): Routes requests to team leads, synthesizes output
- **Team Leads** (Sonnet): Planning Lead, Engineering Lead, Validation Lead
- **Workers** (Sonnet): Domain-specialist agents with constrained write access

Agent personas: `~/.pi/agent/multi-team/agents/`
Expertise files: `~/.pi/agent/multi-team/expertise/`
Shared skills: `~/.pi/agent/multi-team/skills/`
Session logs: `~/.pi/agent/multi-team/sessions/`

Source-vs-runtime policy: keep curated source/config trackable, but leave generated
history, sessions, expertise logs, caches, and local tool state uncommitted. See
`pi/README.md#source-vs-runtime-state` for the canonical policy.

## Agent Frontmatter Schema

Pi agent `.md` files use YAML frontmatter that is a **superset** of Claude Code's agent schema. Pi-specific fields (`expertise`, `domain`, `skills`) coexist with Claude Code-compatible execution constraints (`isolation`, `memory`, `effort`, `maxTurns`). Both platforms ignore unknown fields, so a single agent file is portable.

| Field | Required | Description | Source |
|-------|----------|-------------|--------|
| `name` | yes | Agent identifier used by `/team`, `subagent`, etc. | shared |
| `description` | yes | One-line summary of role and routing intent. | shared |
| `model` | no | Provider/model id, e.g. `anthropic/claude-sonnet-4-6`. Subagent honors dynamic overrides; this is the fallback. | shared |
| `tools` | no | Comma-separated allow-list (`read, grep, subagent, ...`). | shared |
| `isolation` | no | `none` (default) or `worktree`. Pi runtime currently ignores `worktree`; documented for forward compatibility. | claude code |
| `memory` | no | `user`, `project` (default), or `session`. Hint for expertise-storage scope. Pi reads this advisory; the expertise system already scopes by repo-id. | claude code |
| `effort` | no | `low`, `medium`, `high`. Maps to thinking effort when the runtime supports it. Leads use `high`; workers use `medium`. | claude code |
| `maxTurns` | no | Conversation turn cap. Leads: `50`. Workers: `25`. | claude code |
| `expertise` | no | List of mental-model files the agent reads/updates. | pi |
| `domain` | no | Per-path read/upsert/delete access control. | pi |
| `skills` | no | List of skill files the agent should follow with `use-when` hints. | pi |

Defaults applied during the 2026-04-27 alignment pass:

- All agents: `isolation: none`, `memory: project`.
- Leads (orchestrator, engineering-lead, planning-lead, validation-lead, ml-research-lead): `effort: high`, `maxTurns: 50`.
- Other agents: `effort: medium`, `maxTurns: 25`.

Tune per-agent values in the individual `.md` file when the work pattern justifies it -- the bulk defaults are a starting point, not a contract.

## Knowledge Compounding

Each agent maintains a personal expertise file (YAML) — their mental model of the system. Read it at task start. Update it after completing work. Expertise grows across sessions.

## Windows Shell Safety

Use `/dev/null` not `nul` in bash redirects. Use forward slashes in paths.

## Security

Never commit secrets, API keys, or credentials. Never modify `~/.ssh/`, `*.pem`, `*.key`, or `.env` files.

## Agent Behavioral Rules

These rules apply to all agents in Pi sessions and override project-specific guidance when there is conflict.

- **Fix ALL errors and warnings** - Resolve the root cause of all errors, warnings, test failures, linter errors, and diagnostic output. Never suppress diagnostics (noqa, type: ignore, -W flags) instead of fixing the root cause. "Pre-existing" is never valid justification to skip fixing encountered failures.

- **No unsolicited destructive git actions** - Never run `git restore`, `git checkout --`, `git reset --hard`, `git clean -f`, or discard uncommitted changes without explicit user request. This protects against accidentally destroying work.

- **Verify before acting** - Check current state (status commands, config reads, dry-runs) before proposing changes. Don't solve non-existent problems. Trust direct verification commands over reported metadata when they conflict.

- **KISS principle** - Default to the simplest solution that meets the acceptance criteria. No features "just in case". MVP first. Every change should touch minimal code.

- **No proactive file creation** - Only create files when explicitly requested or necessary for the task. Respect existing project structure decisions.

- **Root cause analysis before fixing** - Understand WHY a problem exists before changing code. Investigate logs, check field types, read error messages carefully. Never mask symptoms; if data is wrong, fix the data pipeline, don't hide it.

- **Plan complex tasks** - For any task with 3+ steps or architectural decisions, write a brief plan (1-3 sentences) before implementing. If something fails, stop and re-plan immediately rather than pushing a failing approach.

- **1-3-1 format for alternatives** - When a request can be accomplished more simply or conflicts with established best practices, present the problem, 3 options with pros/cons, and 1 recommendation. Surface the trade-off without refusing the work.

- **No sycophancy** - When wrong, state the error and fix it directly. Avoid deflection phrases like "You're absolutely right!" or "Great question!".

- **Deterministic by default** - Prefer predictable, reproducible solutions: pinned versions, pure functions over side effects, explicit state over implicit. Query real data sources instead of reasoning about values. Verify factual claims against ground truth before acting.
