---
status: superseded-research
source: docs/agent-routing.md
---

# Agent routing research (superseded)

> This note preserves an older routing guide for historical context. The old catalog names below are absent from the current catalog and are not current routing instructions. The current replacement is root agent -> Team Lead -> subagent.

## Design intent

Lead agents were introduced as team leads, not as general-purpose workers. A lead decomposes work, delegates to workers beneath it, and synthesizes results. Leads should not be selected for ordinary file edits, coding, research, or validation unless the request needs coordination across their team.

The intended routing distinctions were:

- Use tier agents when task size, speed, or model/cost profile is the main routing factor.
- Use worker or domain agents when specialized repository or technology expertise matters.
- Use lead agents only when work needs decomposition, coordination, or validation strategy across multiple workers.

## Historical examples

The former catalog listed these project-local tier agents, whose names are absent from the current catalog:

| Agent | Model | Historical use |
| --- | --- | --- |
| `utility-mini` | `openai-codex/gpt-5.4-mini` | Fast summaries, link extraction, search-topic generation, small file inspection, and focused Q&A. |
| `coding-light` | `openai-codex/gpt-5.3-codex-spark` | Small coding tasks, narrow bug fixes, tiny refactors, helper functions, compact tests, and quick patch recommendations. |
| `coding-medium` | `openai-codex/gpt-5.3-codex` | Medium coding tasks spanning a few files, moderate debugging, test-driven fixes, and small-to-medium feature implementation. |

It also described shared worker/domain roles such as frontend, backend, Python, TypeScript, QA, security, DevOps, Terraform, UX research, and product management, plus lead roles for planning, engineering, validation, and ML research.

Examples from the former guide included:

- Summarize a Discord export and list links: `utility-mini`, not a lead.
- Fix a typo-level script bug: `coding-light`, not an engineering lead.
- Add a small feature with tests across two files: `coding-medium` or a domain worker.
- Coordinate a frontend/backend split with API contract decisions: an engineering lead.
- Diagnose TypeScript compiler errors in Pi extensions: a TypeScript specialist or `coding-medium` depending on complexity.
- Review a change for secrets or privilege escalation risk: a security reviewer; use a validation lead only when QA plus security synthesis is needed.

## Current replacement

Use the current topology rather than the absent historical catalog names: the root agent owns decomposition and coordination, assigns bounded work to a Team Lead when a team-level phase is needed, and the Team Lead assigns execution or review to the appropriate subagent. Direct small work can remain at the root when coordination would add no value.

## KISS recommendation

Treat this as an archive only. Keep current routing policy in the active agent and Pi workflow surfaces, and update those surfaces rather than reviving the old catalog.

## Related notes

- [Agent workflow research index](../index.md)
