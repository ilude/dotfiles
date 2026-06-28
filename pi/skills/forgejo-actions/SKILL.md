---
name: forgejo-actions
description: "Forgejo Actions workflows and runner deployment. Use when working with .forgejo/workflows, forgejo-runner, runner labels, Actions secrets, workflow_dispatch, CI/CD, or automatic deployment from Forgejo. Not for Forgejo Git remote/repo setup; use forgejo-git."
---

# Forgejo Actions Workflow

**Auto-activate when:** editing `.forgejo/workflows/*.yml`, configuring `forgejo-runner`, runner labels, repository Actions settings/secrets, or designing CI/CD deployment from Forgejo pushes.

## Boundary

| Need | Use |
| --- | --- |
| Workflow YAML, runner labels, Actions deployment security | `forgejo-actions` |
| Forgejo remotes, repo creation, push-to-create, API tokens | `forgejo-git` |
| Forgejo service install/config via Ansible roles | `ansible` |
| Generic Git commit/push workflow | `git-workflow` |

## Core rules

- Forgejo Actions are remote code execution. Treat runners, labels, and secrets as infrastructure security boundaries.
- Prefer repository-scoped runners for deploy workflows. Avoid global runners for private infrastructure repos.
- Avoid `host` labels unless the runner is dedicated to one trusted repo and the risk is accepted; Docker/LXC labels are safer but still need careful privileges.
- Use explicit runner labels, pinned action versions/images, and narrow triggers.
- For deployments, set `concurrency.group` and usually `cancel-in-progress: false` so two applies cannot overlap.
- Never print secrets or private inventory in logs. Avoid shell tracing around deploy commands.

## Forgejo specifics

- Workflows live in `.forgejo/workflows/`.
- Common push trigger:

```yaml
on:
  push:
    branches: [main]
```

- Manual trigger:

```yaml
on:
  workflow_dispatch:
```

- Jobs select runners using `runs-on`; this must match a configured runner label.
- `actions/checkout` is available from Forgejo-compatible action mirrors such as `https://data.forgejo.org/actions/checkout` or via the instance `DEFAULT_ACTIONS_URL`.
- Repository settings must have Actions enabled, and a matching runner must be online.

## Deploy workflow checklist

1. Register a repository-scoped runner for only the private deployment repo.
2. Use a dedicated label such as `homelab-deploy` and reference it with `runs-on: homelab-deploy`.
3. Ensure the runner has only the credentials required for deployment: private values checkout, public runbook checkout, Docker access if `just` uses Compose, and SSH access to the target hosts.
4. Validate before mutation (`just validate`).
5. For automatic apply, run `just plan` then `just apply`; for safer deployment, split push validation from manual `workflow_dispatch` apply.
6. Set `concurrency` to serialize deploys.
7. Keep workflow output sanitized; do not echo env files, tfvars, inventory, plan JSON, or tokens.

## Anti-patterns

- Running deploy workflows on pull requests or arbitrary branches with secrets available.
- Global runner registration for private infrastructure deployment.
- Using `pull_request_target` with checkout or execution of untrusted code.
- Mounting broad host paths or Docker socket into untrusted workflows.
- Automatic apply without serialized concurrency or stale-plan protection.
