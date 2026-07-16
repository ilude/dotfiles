# Proposed Pi worker roster

Status: awaiting explicit approval

## Decision criteria

A file survives only when its role, tool boundary, or required skill set differs from every other survivor. Default runtime selection is a hint, not the role identity. Organization-chart metadata and model-size variants do not justify separate files.

The deterministic skill-review protocol currently dispatches three exact worker names from `pi/lib/skill-review.ts`. Those files remain separate in this slice because merging them would change that user-facing review protocol rather than merely consolidating the general roster.

## Surviving roster

| Name | Distinct role, tool, or boundary rationale |
| --- | --- |
| `backend-dev` | Backend/API/database implementation with API and database skills. |
| `builder` | General implementation worker; absorbs generic coding and utility variants. |
| `code-reviewer` | Read-only branch/diff review with the code-review skill. |
| `csharp-pro` | C#/.NET implementation with PowerShell and C# skill access. |
| `devops-pro` | Infrastructure, CI, container, cluster, and Terraform implementation. |
| `frontend-dev` | UI/client implementation with TypeScript and UI design skills. |
| `orchestrator` | Read-only coordination worker whose only mutation capability is delegation. |
| `planner` | Read-only requirements and acceptance-criteria planning. |
| `python-pro` | Python implementation with Python-specific project and test guidance. |
| `qa-engineer` | Test implementation and regression work; unlike validators, may edit tests. |
| `reviewer` | Constrained artifact review using the review artifact writer. |
| `rust-pro` | Rust implementation with Rust-specific guidance. |
| `security-reviewer` | Read-only security review with constrained artifact output. |
| `skill-review-fable-high` | Exact high-policy target required by deterministic skill-review dispatch. |
| `skill-review-fable-medium` | Exact medium-policy target required by deterministic skill-review dispatch. |
| `skill-review-gpt` | Exact primary target required by deterministic skill-review dispatch. |
| `typescript-pro` | General TypeScript/JavaScript implementation with TypeScript guidance. |
| `validator` | Read-only test, lint, typecheck, and acceptance verification. |

## Old-name mapping

| Old name | New name | Decision |
| --- | --- | --- |
| `backend-dev` | `backend-dev` | keep |
| `builder` | `builder` | keep and broaden from plan-only implementation to general implementation |
| `code-reviewer` | `code-reviewer` | keep |
| `coding-heavy` | `builder` | merge; differs only by fixed runtime selection and complexity wording |
| `coding-light` | `builder` | merge; differs only by fixed runtime selection and scope wording |
| `coding-medium` | `builder` | merge; differs only by fixed runtime selection and scope wording |
| `csharp-pro` | `csharp-pro` | keep |
| `data-engineer` | `python-pro` | merge; prompt-router data work is a task, not a durable role boundary |
| `devops-pro` | `devops-pro` | keep |
| `engineering-lead` | `orchestrator` | merge; same coordination-only tool boundary |
| `eval-engineer` | `python-pro` | merge; prompt-router evaluation is a task using Python and analysis guidance |
| `frontend-dev` | `frontend-dev` | keep |
| `ml-research-lead` | `orchestrator` | merge; same coordination-only tool boundary |
| `model-engineer` | `python-pro` | merge; prompt-router training is a Python task, not a durable role boundary |
| `orchestrator` | `orchestrator` | keep and remove organization-chart language |
| `planner` | `planner` | keep |
| `planning-lead` | `orchestrator` | merge; same coordination-only tool boundary |
| `product-manager` | `builder` | merge; writable specification work uses general implementation with planning guidance requested per task |
| `python-pro` | `python-pro` | keep |
| `qa-engineer` | `qa-engineer` | keep |
| `reviewer` | `reviewer` | keep |
| `rust-pro` | `rust-pro` | keep |
| `security-reviewer` | `security-reviewer` | keep |
| `skill-review-fable-high` | `skill-review-fable-high` | keep for deterministic protocol compatibility |
| `skill-review-fable-medium` | `skill-review-fable-medium` | keep for deterministic protocol compatibility |
| `skill-review-gpt` | `skill-review-gpt` | keep for deterministic protocol compatibility |
| `terraform-pro` | `devops-pro` | merge; the surviving role already carries Terraform guidance |
| `typescript-pro` | `typescript-pro` | keep |
| `utility-mini` | `builder` | merge; differs only by fixed runtime selection and utility wording |
| `ux-researcher` | `planner` | merge; user research and accessibility requirements are planning inputs |
| `validation-lead` | `orchestrator` | merge; same coordination-only tool boundary |
| `validator-heavy` | `validator` | merge; differs only by fixed runtime selection and complexity wording |
| `validator` | `validator` | keep |

## Approved-slice changes

After approval, T4 will make one validated slice that:

1. Deletes the 15 merged files listed above.
2. Removes `roleType`, `reportsTo`, `leads`, and `routingUse` from every surviving file.
3. Removes `roleType` parsing and types from `pi/extensions/subagent/agents.ts`.
4. Broadens `builder`, `orchestrator`, and `validator` descriptions only as needed to cover their mapped names.
5. Updates active references to removed names in Pi skills, docs, runtime code, and tests while leaving historical archived evidence unchanged.
6. Replaces organization-chart tests with parse-to-launch behavior tests for consumed fields: tools, runtime hint, effort, and skills.
7. Updates the T4 ledger rows with executed decisions and evidence.

## Approval boundary

Approval authorizes deletion of the 15 merged `pi/agents/*.md` files and the same-slice reference/test/parser updates above. It does not authorize changing public slash command names, the subagent tool schema, security/permission behavior, or the deterministic skill-review protocol.
