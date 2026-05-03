# Agent Routing Guide

Use this guide to choose between project-local tier agents, worker/domain agents, and lead agents.

## Design Intent

The lead agents were introduced as team leads, not as general-purpose workers. A lead's job is to decompose work, delegate to the workers beneath it, and synthesize results. Leads should not be selected for ordinary file edits, coding, research, or validation tasks unless the request needs coordination across their team.

## Quick Rules

- Use **tier agents** when task size, speed, or model/cost profile is the main routing factor.
- Use **worker/domain agents** when specialized repository or technology expertise matters.
- Use **lead agents** only when the work needs decomposition, coordination, or validation strategy across multiple workers.

## Project-Local Tier Agents

| Agent | Model | Use when |
| --- | --- | --- |
| `utility-mini` | `openai-codex/gpt-5.4-mini` | Fast summaries, link extraction, search-topic generation, small file inspection, and focused Q&A. |
| `coding-light` | `openai-codex/gpt-5.3-codex-spark` | Small coding tasks: narrow bug fixes, tiny refactors, helper functions, compact tests, and quick patch recommendations. |
| `coding-medium` | `openai-codex/gpt-5.3-codex` | Medium coding tasks spanning a few files, moderate debugging, test-driven fixes, and small-to-medium feature implementation. |

## Shared Worker / Domain Agents

Use these for direct execution when the domain matters more than model tier. These are the agents that should do ordinary implementation, research, review, and validation work:

- `frontend-dev` - UI/frontend implementation.
- `backend-dev` - backend and service logic.
- `python-pro` - Python-specific work.
- `typescript-pro` - TypeScript-specific work.
- `qa-engineer` - direct test strategy, validation, and quality checks.
- `security-reviewer` - security review and risk assessment.
- `devops-pro` / `terraform-pro` - infrastructure, CI, deployment, and Terraform.
- `ux-researcher` / `product-manager` - user needs, product framing, and requirements.

## Lead Agents

Lead agents are managers for a fixed team. Do not use them as general-purpose subagents.

| Lead | Worker team | Use when |
| --- | --- | --- |
| `planning-lead` | `product-manager`, `ux-researcher` | Product planning needs both requirements/product framing and user/UX research. |
| `engineering-lead` | `frontend-dev`, `backend-dev` | Engineering work spans frontend/backend boundaries or needs architecture coordination. |
| `validation-lead` | `qa-engineer`, `security-reviewer` | Release/PR validation needs both functional QA and security/risk review. |
| `ml-research-lead` | model/eval/research specialists | Prompt-routing or ML model-selection work needs coordinated research and evaluation. |
| `orchestrator` | lead agents | A request spans planning, engineering, and validation teams. |

`planner` is a narrow planning worker: use it for a standalone implementation plan, not team orchestration.

## Examples

- Summarize a Discord export and list links: `utility-mini`, not a lead.
- Fix a typo-level script bug: `coding-light`, not `engineering-lead`.
- Add a small feature with tests across two files: `coding-medium` or a domain worker.
- Coordinate a frontend/backend feature split with API contract decisions: `engineering-lead`.
- Diagnose TypeScript compiler errors in Pi extensions: `typescript-pro` or `coding-medium` depending on complexity.
- Review a change for secrets or privilege escalation risk: `security-reviewer`; use `validation-lead` only when QA plus security synthesis is needed.
