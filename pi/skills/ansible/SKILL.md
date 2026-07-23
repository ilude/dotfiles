---
name: ansible
description: Ansible automation, playbooks, and configuration management. Activate when working with Ansible YAML files, playbooks, inventory files, roles, handlers, or discussing Ansible patterns, ansible-playbook, ansible-lint, molecule testing, or Ansible Galaxy.
---

# Ansible Workflow

Compact index for Ansible playbooks, roles, inventories, and tests.

## Project-specific rules

- Scripts and automation in this repo must be idempotent.
- Do not commit secrets; use vault or environment-specific secret stores.
- Fail explicitly for missing required vars instead of silently defaulting unsafe values.
- Keep host-specific/local generated files out of tracked source.
- For risky service or runtime file mutations, capture preflight state, verify ownership and mode, create backups, gate targets, roll out serially, define rollback, then check restart status and logs.
- Prefer OpenSSL for certificate inspection. Use CA tooling only when issuing, renewing, revoking, or changing trust-chain state.

## Practical steps

1. Identify inventory, role, and variable precedence before editing.
2. Capture current service state, file metadata, relevant config snippets, and logs before changing runtime-critical files.
3. Prefer modules over shell/command tasks; if shell is required, make `changed_when`/`creates`/`removes` explicit.
4. Notify handlers only from tasks that actually change state.
5. Validate syntax/lint and, for role changes, Molecule or a focused dry run/check mode.
6. Converge one stateful or failed service independently before running broad orchestration; verify its direct endpoint and persisted state, not only playbook exit status.

## Containerized lint performance

- On Windows hosts, do not run `ansible-lint` repeatedly against a Docker bind mount by default. It launches syntax-check subprocesses that amplify bind-mount filesystem latency.
- Copy the complete lint inputs to a temporary directory on the container filesystem, run `ansible-lint` from that project root, and set `ANSIBLE_CONFIG` to the copied `ansible.cfg` so roles and relative paths do not resolve back to the bind mount.
- Include untracked working-tree inputs needed by linting; do not use `git archive` when validation must cover current changes.
- Preserve the same lint targets, configuration, rules, environment variables, and exit status. This is a filesystem optimization, not permission to skip syntax checks or reduce coverage.
- Clean up the container-local temporary directory with a trap. On native Linux, macOS, or non-bind-mounted workspaces, measure first and avoid the copy when it does not improve runtime.

## Recovery mode

After a live playbook or infrastructure mutation fails:

- stop parallel service waves and unrelated role changes
- target one affected service through its normal direct inventory endpoint
- preserve logs and already-healthy services
- rerun only after a concrete repair or hypothesis
- return to broad orchestration only after direct endpoint and state checks pass

## Quick validation

| Purpose | Commands |
|---|---|
| Lint | `ansible-lint` |
| Syntax | `ansible-playbook --syntax-check <playbook.yml>` |
| Check mode | `ansible-playbook --check <playbook.yml>` |
| Molecule | `molecule test` or `molecule converge` |

## Anti-patterns

- Shelling out where an idempotent module exists.
- Hiding variable-precedence problems with broad defaults.
- Handlers that restart services on every run.
- Committing vault passwords, host secrets, or generated inventory output.
- Continuing a parallel service wave after one service fails.
- Treating an idempotent playbook result as proof that the application endpoint or persisted state is healthy.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
