---
created: 2026-03-31
status: draft
completed:
---

# Plan: Pi Platform Alignment with Claude Code Tooling Patterns

## Context & Motivation

A deep analysis of Claude Code's source (`src/`) was performed alongside a full audit of the pi/ platform. Pi already has feature parity work tracked in `.specs/pi-claude-parity/` (quality-gates, workflow commands, agents, behavioral rules). This plan addresses a different gap: **structural and tooling alignment** — making pi/ extensions, config, and developer experience follow the same contracts and patterns as Claude Code's extensibility architecture.

### What Claude Code has that pi/ lacks structurally

1. **Tool contract** — Claude Code's `buildTool()` enforces a typed contract: `inputSchema` (Zod), `checkPermissions()`, `isConcurrencySafe()`, `isReadOnly()`, `isDestructive()`. Pi extensions register tools ad hoc via `pi.registerTool()` with no shared schema, no permission metadata, no concurrency classification.

2. **Settings cascade** — Claude Code loads settings from 5 sources (user → project → local → flag → policy) with defined merge semantics (array-append for hooks/permissions, last-writer-wins for scalars). Pi has a single `settings.json` with no layering.

3. **Config-driven hooks** — Claude Code's hooks are declared in `settings.json` using a schema (event → matcher → command[]). Pi's hooks are hardcoded TypeScript logic inside extensions. You can't add a hook without writing code.

4. **Skill auto-discovery** — Claude Code scans `~/.claude/skills/`, `./.claude/skills/`, plugin dirs, and managed dirs. Conditional activation via `paths:` in frontmatter. Pi manually loads skills from `workflow-commands.ts`.

5. **Task lifecycle** — Claude Code tracks background work (agents, bash, workflows) with typed status (pending → running → completed/failed/killed), output streaming, and notifications. Pi has no task abstraction.

6. **Permission rule syntax** — Claude Code uses composable patterns like `Bash(git *)`, `Read(*.ts)`, `Write(.claude/**)` in both settings and hook matchers. Pi's `damage-control-rules.yaml` uses its own pattern format.

7. **Agent execution constraints** — Claude Code agents have `isolation: worktree`, `memory: project`, `effort: high`, `maxTurns: 5`. Pi agents have `tools`, `domain`, `expertise` but no isolation, memory scope, or execution budget.

### What pi/ has that Claude Code doesn't

- **Knowledge compounding** — `append_expertise` / `read_expertise` tools, per-agent YAML mental models, JSONL expertise logs
- **Team hierarchy** — orchestrator → leads → workers with delegation discipline
- **Domain-scoped access** — per-agent `domain:` with read/upsert/delete per path
- **Chain pipeline** — `/chain` runs planner → builder → reviewer sequentially

These are strengths to preserve, not replace.

## Objective

Align pi/'s extension model, configuration, and developer experience with Claude Code's contracts so that:
- A skill `.md` file works in both Claude Code and pi
- Agent `.md` frontmatter is a superset (pi's extra fields like `expertise` and `domain` are additive, not divergent)
- Hook behavior can be defined in config (settings.json) without writing TypeScript
- Tools have typed contracts with permission/safety metadata
- Settings cascade from multiple sources with predictable merge rules

## Constraints

- Pi runtime: `@mariozechner/pi-coding-agent` — TypeScript extensions loaded via jiti
- Pi events: `tool_call`, `tool_result`, `session_start`, `session_shutdown`, `input`, `before_agent_start`
- Platform: Windows 11, Git Bash/MSYS2
- Shell: bash (Unix syntax)
- No compile step for extensions
- Must be backwards-compatible — existing extensions continue to work
- `pi/` already has 8 extensions, 20 agents, 8 skills — migration must be incremental
- Preserve pi-unique features (expertise compounding, team hierarchy, domain scoping)
- Never use `child_process.exec()` — use `pi.exec()` for subprocess operations
- Never use `~/` in fs calls — use `path.join(os.homedir(), ...)`

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A: Port Claude Code contracts into pi extensions** — Define `buildTool()`, `HookCommandSchema`, etc. in `pi/lib/`. Refactor all 8 extensions to conform. | Direct alignment. Skills/agents interchangeable between claude/ and pi/. | Significant refactor. May fight pi's event-based runtime model. | Rejected for now — too invasive for the current extension count |
| **B: Align the config layer, keep extension code as-is** — Settings-driven hooks, permission rule syntax, agent frontmatter alignment, skill auto-discovery, task lifecycle. | Config-compatible without rewriting extensions. Incremental adoption. Pi-unique features preserved. | Two implementations of same concepts. Potential drift. | **Selected** — best value/disruption ratio |
| **C: Collapse pi/ into claude/ extensions** — Pi extensions become Claude Code hooks/skills/agents. Pi becomes a settings profile. | Single platform. No duplication. | Pi runtime may not support all Claude Code hook events. Biggest migration. Loses pi's team/expertise features. | Rejected — premature convergence |

## Task Breakdown

### Phase 1: Config Schema Alignment (foundation)

| # | Task | Description | Files | Type | Depends |
|---|------|-------------|-------|------|---------|
| T1 | Define shared hook schema | Create `pi/lib/hook-schema.ts` — TypeScript types and a YAML/JSON schema that mirrors Claude Code's `HookCommandSchema`. Supports event → matcher → command[] with `type: command|prompt`, `if:` matcher, `timeout`, `async`. Pi extensions can read this format. | `pi/lib/hook-schema.ts` | feature | — |
| T2 | Define shared permission rule syntax | Create `pi/lib/permission-rules.ts` — Parser for Claude Code's `Bash(git *)`, `Read(*.ts)` pattern syntax. Used by damage-control and hook matchers. Migrate `damage-control-rules.yaml` patterns to this syntax. | `pi/lib/permission-rules.ts`, `pi/damage-control-rules.yaml` | feature | — |
| T3 | Settings cascade loader | Create `pi/lib/settings-loader.ts` — Loads settings from 3 sources: user (`~/.pi/agent/settings.json`) → project (`.pi/settings.json`) → local (`.pi/settings.local.json`). Array-append for hooks/permissions, last-writer-wins for scalars. Falls back gracefully when sources missing. | `pi/lib/settings-loader.ts` | feature | T1 |
| V1 | Validate phase 1 | Unit-test the schema parser, permission rule matcher, and settings cascade with edge cases. Verify backwards-compatibility with existing `damage-control-rules.yaml` patterns. | — | validation | T1, T2, T3 |

### Phase 2: Hook Engine (config-driven hooks)

| # | Task | Description | Files | Type | Depends |
|---|------|-------------|-------|------|---------|
| T4 | Hook engine | Create `pi/lib/hook-engine.ts` — Reads `hooks:` from cascaded settings. On pi events (`tool_call`, `tool_result`, `session_start`, `session_shutdown`), evaluates matching hooks. Supports `type: command` (spawn process) and `type: prompt` (inject system message). Existing hardcoded extensions continue to work alongside config-driven hooks. | `pi/lib/hook-engine.ts` | feature | V1 |
| T5 | Hook loader extension | Create `pi/extensions/hook-loader.ts` — Thin extension that registers pi event handlers which delegate to the hook engine. Loaded like any other extension via `-e`. This is the bridge between pi's event system and the config-driven hook engine. | `pi/extensions/hook-loader.ts` | feature | T4 |
| T6 | Migrate damage-control to hybrid mode | Update `pi/extensions/damage-control.ts` to read permission rules from settings cascade (via `permissions:` key) in addition to `damage-control-rules.yaml`. YAML file becomes the fallback; settings.json rules take precedence. No behavior change for existing users. | `pi/extensions/damage-control.ts` | refactor | T3, T4 |
| V2 | Validate phase 2 | Test config-driven hooks fire correctly on tool events. Test damage-control reads from both YAML and settings. Verify existing extensions unaffected. | — | validation | T4, T5, T6 |

### Phase 3: Skill Auto-Discovery & Agent Alignment

| # | Task | Description | Files | Type | Depends |
|---|------|-------------|-------|------|---------|
| T7 | Skill auto-discovery | Create `pi/lib/skill-discovery.ts` — Scans `pi/skills/*/SKILL.md` and `~/.pi/agent/skills/*/SKILL.md`. Parses frontmatter. Returns skill commands compatible with `pi.registerCommand()`. Supports `paths:` for conditional activation. Variable substitution (`${CLAUDE_SKILL_DIR}`, `${args}`). | `pi/lib/skill-discovery.ts` | feature | — |
| T8 | Skill loader extension | Create `pi/extensions/skill-loader.ts` — On `session_start`, discovers skills and registers them as slash commands. Replaces manual registration in `workflow-commands.ts`. | `pi/extensions/skill-loader.ts` | feature | T7 |
| T9 | Agent frontmatter alignment | Update agent `.md` files in `pi/agents/` to include Claude Code-compatible fields: `isolation`, `memory`, `effort`, `maxTurns`. These are additive — pi's `expertise`, `domain`, and `skills` fields remain. Document the merged schema in `pi/AGENTS.md`. | `pi/agents/*.md`, `pi/AGENTS.md` | mechanical | — |
| T10 | Agent loader reads new fields | Update `pi/extensions/agent-team.ts` and `pi/extensions/agent-chain.ts` to read and respect `effort` and `maxTurns` from agent frontmatter. `isolation` and `memory` are documented but deferred until pi runtime supports them. | `pi/extensions/agent-team.ts`, `pi/extensions/agent-chain.ts` | feature | T9 |
| V3 | Validate phase 3 | Test skill auto-discovery finds and registers skills. Test agent frontmatter parsing with new fields. Verify `/chain` and `/team` still work. | — | validation | T7, T8, T9, T10 |

### Phase 4: Task Lifecycle & Observability

| # | Task | Description | Files | Type | Depends |
|---|------|-------------|-------|------|---------|
| T11 | Task lifecycle tracker | Create `pi/lib/task-tracker.ts` — Lightweight task model: `{id, type, status, description, startTime, endTime, outputFile}`. Status lifecycle: pending → running → completed/failed. Used by `/chain` and `/team` to track pipeline stages. Writes status to `~/.pi/agent/tasks/`. | `pi/lib/task-tracker.ts` | feature | — |
| T12 | Integrate task tracker into chain/team | Update `agent-chain.ts` and `agent-team.ts` to create/update tasks as pipeline stages execute. Each stage (planner, builder, reviewer) becomes a tracked task. | `pi/extensions/agent-chain.ts`, `pi/extensions/agent-team.ts` | feature | T11 |
| T13 | Structured metrics logger | Create `pi/lib/metrics.ts` — JSON-line structured event logger. Events: `tool_use`, `hook_fired`, `skill_invoked`, `task_status_change`, `routing_decision`. Writes to `~/.pi/agent/logs/metrics.jsonl`. Replaces ad-hoc logging across extensions. | `pi/lib/metrics.ts` | feature | — |
| T14 | Wire metrics into extensions | Update existing extensions to emit structured events via the metrics logger instead of ad-hoc console.log or custom JSONL. | `pi/extensions/*.ts` | refactor | T13 |
| V4 | Validate phase 4 | Test task lifecycle transitions. Verify metrics JSONL format. Confirm `/chain` creates and completes tasks correctly. | — | validation | T11, T12, T13, T14 |

## Verification Strategy

Each phase has a validation gate (V1–V4). Validation checks:

1. **Backwards compatibility** — Existing `just chain`, `just team`, `just full` recipes work identically
2. **Schema conformance** — Hook configs, permission rules, and agent frontmatter parse without error
3. **Config cascade** — Settings from user/project/local merge correctly (array-append, scalar-override)
4. **Extension isolation** — Config-driven hooks don't interfere with hardcoded extension hooks
5. **Cross-platform** — All paths use `os.homedir()`, all subprocesses use `pi.exec()`

## Acceptance Criteria

- [ ] `pi/lib/` contains shared contracts: hook-schema, permission-rules, settings-loader, skill-discovery, task-tracker, metrics
- [ ] `pi/extensions/hook-loader.ts` fires config-driven hooks on pi events
- [ ] `pi/extensions/skill-loader.ts` auto-discovers skills from `pi/skills/*/SKILL.md`
- [ ] `damage-control.ts` reads permission rules from both YAML and settings cascade
- [ ] Agent `.md` frontmatter is a documented superset of Claude Code's schema
- [ ] `/chain` and `/team` pipeline stages are tracked as tasks with lifecycle status
- [ ] Structured metrics JSONL replaces ad-hoc logging
- [ ] All existing `just` recipes pass without behavior changes
- [ ] A skill `.md` file with standard frontmatter works in both Claude Code and pi

## Dependency Graph

```
Phase 1 (foundation)          Phase 2 (hooks)              Phase 3 (skills/agents)     Phase 4 (lifecycle)
T1 hook-schema ──────────┐
T2 permission-rules ─────┤    T4 hook-engine ──┐
T3 settings-loader ──────┤    T5 hook-loader ──┤           T7 skill-discovery ──┐
                         V1   T6 dc-hybrid ────V2          T8 skill-loader ─────┤      T11 task-tracker ──┐
                                                           T9 agent-frontmatter ┤      T12 chain/team ────┤
                                                           T10 agent-loader ────V3     T13 metrics ───────┤
                                                                                       T14 wire-metrics ──V4
```

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pi runtime doesn't expose enough event context for config-driven hooks | Medium | High | T4 hook-engine falls back to extension-coded hooks when event data is insufficient. Config hooks are additive, not replacement. |
| Settings cascade introduces load-order bugs | Low | Medium | T3 settings-loader is pure and testable. Cascade order is deterministic. Unit tests cover merge edge cases. |
| Skill auto-discovery loads untrusted SKILL.md from nested dirs | Low | High | T7 respects .gitignore (blocks node_modules/.pi/skills). Only scans known roots. No shell injection from MCP-loaded skills (matching Claude Code's security model). |
| Agent frontmatter drift between Claude Code and pi | Medium | Low | T9 documents the merged schema. Additive fields in pi (expertise, domain) are namespaced. Claude Code ignores unknown fields. |
| Metrics JSONL grows unbounded | Medium | Low | T13 implements log rotation or max-size cap. Daily rotation matching prompt-routing's audit pattern. |

## Non-Goals

- Rewriting existing extensions in a new framework (Option A from analysis)
- Collapsing pi/ into claude/ (Option C from analysis)
- Porting Claude Code's Zod-based tool validation (pi runtime doesn't use Zod)
- Implementing `isolation: worktree` or `memory: project` in pi runtime (document now, implement when runtime supports it)
- Telemetry export to external systems (OpenTelemetry, BigQuery) — local JSONL is sufficient for now
