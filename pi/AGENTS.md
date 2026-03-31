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
