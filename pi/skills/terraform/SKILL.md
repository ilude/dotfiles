---
name: terraform
description: "Terraform: .tf, variables.tf, main.tf, outputs.tf, terraform.tfvars, .tfstate, HCL, init/plan/apply, or remote backends."
---

# Terraform Projects Workflow

Compact index for Terraform modules, state, plans, and infrastructure workflows.

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
4. Classify every replacement or delete as stateful or stateless and name the rollback boundary.
5. For stateful resources, verify a current backup and restore path, then plan and apply one independent service at a time until the canary is healthy.
6. Keep modules small with clear inputs/outputs; avoid cross-environment condition sprawl.

## Stateful rollout gate

Before applying a stateful replacement, require all of:

- saved plan reviewed with exact creates, updates, replacements, and deletes
- current backup evidence and a tested or documented restore command
- one independent service in the rollout unless a deliberate batch override is explicitly recorded
- post-apply endpoint and state checks

If apply fails, stop broad planning/apply cycles and enter incident mode. Recover the affected service directly before creating another rollout plan.

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
- Replacing multiple independent stateful services before the first replacement is healthy.
- Treating `apply` completion or a delegated summary as service-health evidence.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [patterns.md](patterns.md) - Terraform pattern details.
