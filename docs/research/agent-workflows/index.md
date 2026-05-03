# Agent Workflow Research Index

## Core question

What concrete implementation ideas can we borrow from recent agent tooling while keeping our Pi workflow simple, local, and maintainable?

## Strongest signals

1. [[projects/browser-use-browser-harness]] shows a minimal, editable browser harness where agents can add helpers and domain skills as they learn.
2. [[projects/manaflow-cmux]] shows a terminal UX optimized around many coding agents needing attention asynchronously.
3. [[projects/openclaw]] appears directly related to Pi and validates Markdown-first skills/memory as a practical agent substrate.
4. [[projects/convex-agent-plugins]] packages platform expertise as rules, skills, subagents, hooks, and MCP access.
5. [[projects/daytona]] provides the sandbox/runtime layer for safer long-running agent execution.

## Patterns

- [[patterns/self-healing-harnesses]]
- [[patterns/agent-terminal-workspaces]]
- [[patterns/markdown-skills-memory]]
- [[patterns/agent-friendly-platforms]]
- [[patterns/sandboxed-agent-runtimes]]
- [[patterns/pi-observability-timing]]

## Specs synthesis

- [[specs-workflow-trajectory]] — where active and archived specs show the workflow has been heading.
- [[workflow-ideas/specs-derived-roadmap]] — concrete roadmap ideas from specs + ecosystem research.
- [[workflow-ideas/pipelines-and-policies]] — run ledgers, first-class artifacts, resumability, and policy-as-code gates.
- [[workflow-ideas/code-intelligence]] — Graphify/SCIP/code-intel ideas for semantic navigation and architecture orientation.
- [[workflow-ideas/backlog]] — candidate next slices.

## KISS recommendations

See [[workflow-ideas/kiss-pi-workflow-ideas]]. In short:

- Prefer small Pi skills over large frameworks.
- Let successful runs generate/update domain notes.
- Keep helper scripts tiny and auditable.
- Add notification/status affordances before adding orchestration complexity.
- Use sandboxes for risky or long-running tasks only.
