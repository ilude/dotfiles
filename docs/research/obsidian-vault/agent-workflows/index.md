# Agent Workflow Research Index

This is one topic folder inside the broader [Research Obsidian Vault](../index.md).

## Core question

What concrete implementation ideas can we borrow from recent agent tooling while keeping our Pi workflow simple, local, and maintainable?

## Vault operating model

- [AGENTS](AGENTS.md) - purpose, KISS rules, promotion filter, and maintenance guidance.
- [_templates/research-note](_templates/research-note.md) - default template for new notes.

This vault is a context pool, not a build mandate. Promote ideas only when they solve repeated workflow friction with a small reversible slice.

## Source captures

- [claude_prompts](claude_prompts.md) - source-based extraction of Claude Code system-prompt text and prompt-selection rules.
- [source-control-and-agentic-dev-services](projects/source-control-and-agentic-dev-services.md) - GitHub-alternative and agentic developer-tool services discussed positively in the GitHub alternatives video.
- [agent-skills-ecosystem](projects/agent-skills-ecosystem.md) - skill standards, repositories, validators, and meta-skill patterns.
- [Claude Code worktrees](projects/claude-code-worktrees.md) - built-in worktree behavior, isolation, cleanup, and known failure modes.
- [Pi damage-control gap analysis](projects/pi-damage-control-gap-analysis.md) - security coverage compared with demonstrated coding-agent attack paths.
- [Cloudflare and Astro issue triage](projects/cloudflare-astro-issue-triage.md) - production case study in staged triage, artifact handoffs, visible state, and external verification.
- [MCP 2026 stateless protocol](projects/mcp-2026-stateless-protocol.md) - request-scoped MCP, multi-round input, gateway identity, caching, authorization, and protocol lifecycle.
- [Pi Coding Agent deep dive](projects/pi-coding-agent-deep-dive.md) - transcript-reviewed Pi architecture source, evidence cautions, and workflow implications.
- [Menos research storage](projects/menos-research-storage.md) - superseded research-ingestion proposal retained as historical context.
- [X research prototype](projects/x-research-prototype/README.md) - archived local SQLite and provider-adapter experiment retained for future Twitter tooling.

## Strongest signals

1. [projects/browser-use-browser-harness](projects/browser-use-browser-harness.md) shows a minimal, editable browser harness where agents can add helpers and domain skills as they learn.
2. [projects/manaflow-cmux](projects/manaflow-cmux.md) shows a terminal UX optimized around many coding agents needing attention asynchronously.
3. [projects/openclaw](projects/openclaw.md) appears directly related to Pi and validates Markdown-first skills/memory as a practical agent substrate.
4. [projects/convex-agent-plugins](projects/convex-agent-plugins.md) packages platform expertise as rules, skills, subagents, hooks, and MCP access.
5. [projects/daytona](projects/daytona.md) provides the sandbox/runtime layer for safer long-running agent execution.
6. [projects/menos](projects/menos.md) is the local durable memory/search backend that can support compiled session memory, graph research, and pipeline receipts.
7. [projects/windmill-automation](projects/windmill-automation.md) points local scheduled automation toward Windmill when agents need API/UI-managed jobs with Infisical-backed secrets.

## Patterns

- [patterns/self-healing-harnesses](patterns/self-healing-harnesses.md)
- [patterns/agent-terminal-workspaces](patterns/agent-terminal-workspaces.md)
- [patterns/markdown-skills-memory](patterns/markdown-skills-memory.md)
- [patterns/agent-friendly-platforms](patterns/agent-friendly-platforms.md)
- [patterns/sandboxed-agent-runtimes](patterns/sandboxed-agent-runtimes.md)
- [patterns/pi-observability-timing](patterns/pi-observability-timing.md)
- [patterns/deterministic-agent-rules-and-guardrails](patterns/deterministic-agent-rules-and-guardrails.md)
- [patterns/evidence-based-code-review](patterns/evidence-based-code-review.md)
- [patterns/eliminating-failure-categories](patterns/eliminating-failure-categories.md)
- [patterns/openai-compatible-chat-providers](patterns/openai-compatible-chat-providers.md)

## Specs synthesis

- [workflow-ideas/specs-workflow-trajectory](workflow-ideas/specs-workflow-trajectory.md) - where active and archived specs show the workflow has been heading.
- [workflow-ideas/specs-derived-roadmap](workflow-ideas/specs-derived-roadmap.md) - concrete roadmap ideas from specs + ecosystem research.
- [workflow-ideas/pipelines-and-policies](workflow-ideas/pipelines-and-policies.md) - run ledgers, first-class artifacts, resumability, and policy-as-code gates.
- [workflow-ideas/code-intelligence](workflow-ideas/code-intelligence.md) - Graphify/SCIP/code-intel ideas for semantic navigation and architecture orientation.
- [workflow-ideas/duckdb-for-pi-usage-analytics](workflow-ideas/duckdb-for-pi-usage-analytics.md) - optional DuckDB backend idea for Pi usage/session analytics.
- [workflow-ideas/agent-workflow-benchmark-loops](workflow-ideas/agent-workflow-benchmark-loops.md) - controlled hard-task fixtures for testing routing, prompt, tool, and review changes without building a benchmark platform.
- [workflow-ideas/adaptive-plan-review-telemetry](workflow-ideas/adaptive-plan-review-telemetry.md) -- data model for learning when `/review-it` can be embedded into `/plan-it` with adaptive reviewer counts.
- [workflow-ideas/goal-closeout-handoff](workflow-ideas/goal-closeout-handoff.md) -- automatic `/goal` completion closeout so goal endings preserve outcome, validation, state, and next steps.
- [workflow-ideas/durable-task-dependency-systems](workflow-ideas/durable-task-dependency-systems.md) -- session evidence, academic and workflow-system sources, and incremental designs for durable task DAGs with Pi subagents.
- [workflow-ideas/menos-knowledge-compiler](workflow-ideas/menos-knowledge-compiler.md) - persona-scoped session capture, concept compilation, previews, lint, and digests on menos.
- [workflow-ideas/multipass-yolo-sandboxes](workflow-ideas/multipass-yolo-sandboxes.md) - Multipass + Infisical design for safer YOLO/bypass-permissions agent runs.
- [workflow-ideas/x-research-pipeline](workflow-ideas/x-research-pipeline.md) - X.com read-only research graph pipeline using twscrape/Webshare/menos.
- [workflow-ideas/flaresolverr-content-acquisition](workflow-ideas/flaresolverr-content-acquisition.md) - historical FlareSolverr MCP design and its bounded role as a content-acquisition fallback.
- [workflow-ideas/agents-md-init-command](workflow-ideas/agents-md-init-command.md) - conservative generation and updating of repository `AGENTS.md` guidance.
- [workflow-ideas/damage-control-temp-cleanup](workflow-ideas/damage-control-temp-cleanup.md) - deterministic provenance checks for low-noise temporary-file cleanup.
- [projects/zellij-windows-cockpit](projects/zellij-windows-cockpit.md) - Windows-native terminal cockpit for one project, one Pi pane, and repo-managed Zellij layout.
- [projects/menos](projects/menos.md) - self-hosted content vault, semantic search, graph, and unified pipeline backend.
- [projects/windmill-automation](projects/windmill-automation.md) - Windmill as the preferred local automation control plane for scheduled agent-manageable jobs.
- [projects/pi-mono-fork-sync-automation](projects/pi-mono-fork-sync-automation.md) - concrete plan for syncing `ilude/pi-mono` from `badlogic/pi-mono` without dirtying fork `main`.
- [workflow-ideas/backlog](workflow-ideas/backlog.md) - candidate next slices.

## KISS recommendations

See [workflow-ideas/kiss-pi-workflow-ideas](workflow-ideas/kiss-pi-workflow-ideas.md). In short:

- Prefer small Pi skills over large frameworks.
- Let successful runs generate/update domain notes.
- Keep helper scripts tiny and auditable.
- Add notification/status affordances before adding orchestration complexity.
- Use sandboxes for risky or long-running tasks only.
