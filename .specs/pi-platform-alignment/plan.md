---
created: 2026-03-31
status: draft
completed:
---

# Plan: Pi Platform Alignment with Claude Code Tooling Patterns

## Related Plans

This plan covers structural/contract alignment. Two adjacent plans own related territory:

- `.specs/pi-operator-layer-mvp/plan.md` -- **Canonical owner of the durable task registry (`pi/lib/task-registry.ts`) and permission decision registry (`pi/lib/permission-registry.ts`).** This plan's task-lifecycle work (T11/T12) consumes that registry rather than defining a parallel `task-tracker.ts`. Operator-layer-mvp also owns the status bar, `/doctor`, `/tasks`, `/permissions` surfaces.
- `.specs/pi-tool-reduction/plan.md` -- Phase 1 shipped 2026-04-22. Phase 2 deferred. No dependency.

## Codebase Reality (as of 2026-04-27)

Several Phase tasks were originally framed as greenfield. The codebase has moved on; this plan is now scoped against the actual state:

- `pi/lib/` already contains `expertise-snapshot.ts`, `transcript.ts`, `repo-id.ts`, `model-routing.ts`, `extension-utils.ts`, `yaml-mini.ts`, `yaml-helpers.ts` (~2.3 KLOC). New modules from this plan must coexist; reuse `extension-utils.ts` for path/settings helpers and `yaml-mini.ts` for YAML parsing.
- `pi/settings.json` exists; settings are currently read ad hoc by extensions via `pi.getConfig()`. T3 (settings cascade) is therefore a **centralization refactor**, not a greenfield build.
- `pi/skills/` has skill files with frontmatter. `pi/extensions/workflow-commands.ts` (~31 KB) hardcodes skill loading. T7/T8 (skill auto-discovery) is therefore a **refactor that replaces hardcoded loading**, not a greenfield build.
- `pi/agents/` has 24 agent definitions with `tools`, `domain`, `expertise`, `skills`. T9 adds `isolation`, `memory`, `effort`, `maxTurns` **additively**.
- `pi/extensions/damage-control.ts`, `session-hooks.ts`, `tool-reduction.ts`, etc. already implement hardcoded hook logic that is stable and tested. **Phase 2 (hook engine) is deferred** -- see Phase 2 section below.
- `pi/prompt-routing/` (Python) ships a LightGBM classifier in production with daily audit. Out of scope for this plan but worth noting as established platform reality.

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
| T3 | Settings cascade loader | **Centralize existing ad-hoc settings reads behind a loader.** Today extensions call `pi.getConfig()` directly against a single `pi/settings.json`. The new loader cascades 3 sources: user (`~/.pi/agent/settings.json`) -> project (`.pi/settings.json`) -> local (`.pi/settings.local.json`). Array-append for hooks/permissions, last-writer-wins for scalars. Falls back gracefully when sources missing. As part of T3, identify ad-hoc settings call sites in existing extensions and migrate them to the loader -- otherwise the cascade has no consumers. Reuse `pi/lib/extension-utils.ts` helpers where applicable. | `pi/lib/settings-loader.ts`, call-site migrations across `pi/extensions/*.ts` | refactor | T1 |
| V1 | Validate phase 1 | Unit-test the schema parser, permission rule matcher, and settings cascade with edge cases. Verify backwards-compatibility with existing `damage-control-rules.yaml` patterns. | — | validation | T1, T2, T3 |

### Phase 2: Hook Engine (config-driven hooks) -- **DEFERRED**

**Status: deferred** (decision recorded 2026-04-27).

**Rationale:** Pi already has hardcoded hook logic in `damage-control.ts`, `session-hooks.ts`, `tool-reduction.ts`, `quality-gates.ts`, and others. These hooks are stable, tested, and shipping. A parallel config-driven hook engine adds a second hook path that risks double-firing, priority conflicts between hardcoded and config hooks, and additional maintenance with no concrete user-driven need today.

**Revisit when** any of these are true:
- 5+ users want to customize hook behavior without writing TypeScript
- A pi-third-party extension ecosystem emerges and needs declarative hooks
- The hardcoded hook path becomes a bottleneck for new hook types

**Out of scope for this plan:** T4 hook-engine, T5 hook-loader, T6 damage-control hybrid mode, V2 validation gate. Phase 1 V1 now feeds Phase 3 directly.

**Permission rules note:** T2 (permission rule syntax in `pi/lib/permission-rules.ts`) still ships in Phase 1; damage-control can adopt the parser without needing the broader hook engine.

### Phase 3: Skill Auto-Discovery & Agent Alignment

| # | Task | Description | Files | Type | Depends |
|---|------|-------------|-------|------|---------|
| T7 | Skill auto-discovery | **Replace hardcoded skill loading.** Today `pi/extensions/workflow-commands.ts` (~31 KB) registers skills via hardcoded calls. Create `pi/lib/skill-discovery.ts` that scans `pi/skills/*/SKILL.md` and `~/.pi/agent/skills/*/SKILL.md`, parses frontmatter, returns skill commands compatible with `pi.registerCommand()`. Supports `paths:` for conditional activation and variable substitution (`${CLAUDE_SKILL_DIR}`, `${args}`). Reuse `pi/lib/yaml-mini.ts` for frontmatter parsing. | `pi/lib/skill-discovery.ts` | feature | — |
| T8 | Skill loader extension | Create `pi/extensions/skill-loader.ts` -- on `session_start` discovers skills via T7 and registers them as slash commands. **Migration**: remove hardcoded skill registration from `workflow-commands.ts` once skill-loader is verified at parity. Both extensions must not register the same skill twice during the transition. | `pi/extensions/skill-loader.ts`, `pi/extensions/workflow-commands.ts` | refactor | T7 |
| T9 | Agent frontmatter alignment | Pi agents already define `tools`, `domain`, `expertise`, `skills`. Add Claude Code-compatible fields **additively**: `isolation`, `memory`, `effort`, `maxTurns`. Existing fields remain. Document the merged schema (existing pi fields + new Claude Code fields) in `pi/AGENTS.md` -- this becomes the single source of truth for agent frontmatter. | `pi/agents/*.md`, `pi/AGENTS.md` | mechanical | -- |
| T10 | Agent loader reads new fields | Update `pi/extensions/agent-team.ts` and `pi/extensions/agent-chain.ts` to read and respect `effort` and `maxTurns` from agent frontmatter. `isolation` and `memory` are documented but deferred until pi runtime supports them. | `pi/extensions/agent-team.ts`, `pi/extensions/agent-chain.ts` | feature | T9 |
| V3 | Validate phase 3 | Test skill auto-discovery finds and registers skills. Test agent frontmatter parsing with new fields. Verify `/chain` and `/team` still work. | — | validation | T7, T8, T9, T10 |

### Phase 4: Task Lifecycle & Observability

| # | Task | Description | Files | Type | Depends |
|---|------|-------------|-------|------|---------|
| T11 | Consume operator-layer task registry | **Do not create a parallel task-tracker.** The canonical task registry is `pi/lib/task-registry.ts` defined by `.specs/pi-operator-layer-mvp/plan.md` T1 (`TaskRecordV1`, six-state lifecycle, durable storage in `~/.pi/agent/tasks/`). T11 in this plan is a thin import/wiring task: confirm the registry API meets `/chain` and `/team` needs, file gaps as issues against operator-layer-mvp, and add no schema of its own. **Blocks on**: operator-layer-mvp T1 shipping. | (no new files) | integration | operator-layer-mvp T1 |
| T12 | Wire chain/team into the registry | Update `agent-chain.ts` and `agent-team.ts` to create/update `TaskRecordV1` entries via the operator-layer registry as pipeline stages execute. Each stage (planner, builder, reviewer) becomes a tracked task. Use the registry already integrated in operator-layer-mvp T2 (subagent + agent-team) -- avoid duplicating the integration logic. | `pi/extensions/agent-chain.ts`, `pi/extensions/agent-team.ts` | feature | T11 |
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

- [ ] `pi/lib/` contains the shipped contracts: `hook-schema.ts`, `permission-rules.ts`, `settings-loader.ts`, `skill-discovery.ts`, `metrics.ts`
- [ ] `pi/extensions/skill-loader.ts` auto-discovers skills from `pi/skills/*/SKILL.md`; hardcoded skill registration in `workflow-commands.ts` is removed
- [ ] `damage-control.ts` reads permission rules from settings cascade via `pi/lib/permission-rules.ts` (YAML remains the fallback source until rules are migrated)
- [ ] Agent `.md` frontmatter is a documented superset of Claude Code's schema (existing fields preserved + `isolation`, `memory`, `effort`, `maxTurns` added)
- [ ] `/chain` and `/team` pipeline stages are tracked as `TaskRecordV1` entries via the operator-layer task registry (no parallel task-tracker exists)
- [ ] Structured metrics JSONL replaces ad-hoc logging across extensions
- [ ] All existing `just` recipes pass without behavior changes
- [ ] A skill `.md` file with standard frontmatter works in both Claude Code and pi
- [ ] Phase 2 (config-driven hook engine) remains deferred; no `pi/lib/hook-engine.ts` or `pi/extensions/hook-loader.ts` ships from this plan

## Dependency Graph

```
Phase 1 (foundation)          Phase 2 (DEFERRED)           Phase 3 (skills/agents)     Phase 4 (lifecycle)
T1 hook-schema ----------+
T2 permission-rules -----+
T3 settings-loader ------+    (T4/T5/T6 deferred --       T7 skill-discovery ----+
                         V1    revisit when needed)        T8 skill-loader -------+    T11 consume registry --+
                                                           T9 agent-frontmatter --+    T12 chain/team --------+
                                                           T10 agent-loader ------V3   T13 metrics -----------+
                                                                                       T14 wire-metrics ------V4

T11 blocks on operator-layer-mvp T1 (canonical task registry).
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
