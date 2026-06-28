---
name: terraform
description: Terraform IaC, modules, and cloud infrastructure patterns. Activate when working with .tf files, variables.tf, main.tf, outputs.tf, terraform.tfvars, .tfstate, or discussing Terraform, HCL, terraform init/plan/apply, remote backends, or infrastructure as code with Terraform.
---

# Terraform Projects Workflow

Compact index for Terraform modules, state, plans, and infrastructure workflows.

## Auto-activate when

- Editing `.tf`, `.tfvars`, `terraform.lock.hcl`, module files, provider/backend config, Terraform CI, or state-related docs.
- User mentions Terraform, HCL, modules, providers, backend, state, plan/apply, import, drift, workspaces, or infrastructure as code.
- Do not use for Ansible-only configuration management or Docker-only app containers.

## Project-specific rules

- Do not reinterpret service `port` fields as host publishing when working near Onramp/Caddy Compose conventions.
- Keep reusable source separate from private values: modules, schemas, and examples can be tracked; real secrets, credentials, tenant values, and local overrides cannot.
- Never commit state files, secrets, credentials, or local override files unless the repo explicitly documents state custody and the state contents have been checked for sensitive data.
- Prefer IaC, API, or CLI changes over UI-only runbooks. Before claiming a UI-only limitation, verify the provider, API, and CLI do not support the needed operation.
- Do not run `terraform apply`, `destroy`, state surgery, or imports without explicit user approval.
- Prefer explicit variables/validation over hidden defaults for required infrastructure decisions.

## Practical steps

1. Identify module boundaries, provider versions, backend, and workspace/environment.
2. Run format/validate before evaluating a plan.
3. Treat plans as review artifacts: summarize creates/updates/destroys and risks.
4. Keep modules small with clear inputs/outputs; avoid cross-environment condition sprawl.

## Quick validation

| Purpose | Commands |
|---|---|
| Format check | `terraform fmt -check -recursive` |
| Init | `terraform init` |
| Validate | `terraform validate` |
| Plan | `terraform plan -out=tfplan` |
| Inspect plan | `terraform show tfplan` |

## Anti-patterns

- Applying plans from an unreviewed or stale workspace.
- Committing `.tfstate`, `.tfvars` secrets, or provider credentials.
- Using workspaces as a substitute for clear environment structure when the repo has another pattern.
- Broad refactors mixed with resource behavior changes.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [patterns.md](patterns.md) - Terraform pattern details.
