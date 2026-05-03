# Pi Global Agent Instructions

Pi-specific architecture and conventions. Loaded by the `pi-instructions` extension on every Pi session via `before_agent_start`. Project-specific `AGENTS.md` files take precedence.

## Agent System Overview

Three-tier multi-agent architecture with knowledge compounding via expertise files:

- **Orchestrator** (Opus): routes requests to team leads, synthesizes output
- **Team Leads** (Sonnet): Planning Lead, Engineering Lead, Validation Lead
- **Workers** (Sonnet): domain-specialist agents with constrained write access

Agent personas: `~/.pi/agent/multi-team/agents/`
Expertise files: `~/.pi/agent/multi-team/expertise/`
Shared skills: `~/.pi/agent/multi-team/skills/`
Session logs: `~/.pi/agent/multi-team/sessions/`

Source-vs-runtime policy: keep curated source/config trackable, including `pi/settings.json`, but leave generated history, sessions, expertise logs, caches, and local tool state uncommitted. See `pi/README.md#source-vs-runtime-state` for the canonical policy.

Pi-first implementation policy: for future workflow/tooling work, prefer Pi-native solutions (Pi skills, Pi extensions, and TypeScript where Pi extension/runtime code is appropriate) unless the user explicitly asks for a cross-client or non-Pi implementation. Cross-client shims can wrap Pi-first behavior when needed, but Pi should be the default target going forward.

Pi `/commit` policy: Pi owns the primary commit workflow through `pi/extensions/workflow-commands.ts`, with structured commit tools in `pi/extensions/commit.ts`. Use `commit_plan`/`commit_validate_message` for non-mutating checks. Do not call `commit_stage` or `commit_create` directly outside the `/commit` slash-command flow; `/commit` is responsible for presenting the exact staged-path set and message for explicit user approval before passing confirmation tokens to the mutating tools. `scripts/commit-helper` remains a compatibility/parity reference for non-Pi consumers, not the canonical Pi implementation.

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

Each agent maintains a personal expertise file (YAML) -- their mental model of the system. Read it at task start. Update it after completing work. Expertise grows across sessions.
