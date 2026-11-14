# Work repositories

Read when the target is a work repository. Apply only relevant choices.

- Preserve the project's host, organization, credential and deployment ownership.
  Reuse existing AWS profiles/SSO or the documented secret provider, not copied
  credentials or hardcoded tenant/account values in templates.
- Keep Git actions operator-directed. Several older work AGENTS files mandate
  feature-start fetch/fast-forward/push; that is not the default for new repos.
  Work/personal Git identity belongs to the existing workstation identity system,
  not a repo bootstrap's global Git configuration.
- Keep root guidance as routing and local decisions. Use the project's existing
  skill discovery location; for new projects choose the actual client's native
  location rather than maintaining duplicate policy bodies.
- Material history records outcome, intent, scope, limits and known operator
  attribution with UTC dates. Local collection is not permission to track sensitive
  evidence; use the changelog skill for specific artifact approvals.
- Keep repository setup distinct from workstation AI onboarding. The dev-setup
  onboarding scripts can install clients and change AWS/provider configuration;
  do not substitute them for a narrow project prerequisite check.

## Source patterns

Observed in the operator's work checkouts, not universal requirements:

| Source | Reused pattern |
| --- | --- |
| GCC Automation setup/changelog skill | ValidateOnly, explicit optional tool installs, preserve existing configs, outcome-oriented history |
| GitLab Helm setup | uv-managed local Python dependencies; separate local checks from service access |
| EISA and monorepo instructions | Canonical owner docs, project-specific commands, notes distinct from active instructions |
| AI Workbench | Independent uv projects, tracked safe defaults, ignored local overrides/runs, drafts separate from publishing |

Do not copy their package inventories, forced elevation, profile/registry edits,
tenant workflows, deployment commands or plaintext-secret migration debt.
