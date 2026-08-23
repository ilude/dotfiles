---
created: 2026-08-23
status: ready
completed:
---

# Plan: Stage Podman supervision with a SearXNG Quadlet canary

## Objective

Improve rootless Podman restart behavior without redesigning the Onclave deployment. First record current behavior with existing commands, then convert only SearXNG from its Compose wrapper to a source-controlled Quadlet unit, and finally prove crash recovery, reboot recovery, persistence, and rollback. Onclave remains Compose-managed throughout this plan.

## Completion Evidence

- Evidence: Current SearXNG and Onclave restart, boot, health, and ownership behavior is recorded without mutation; the SearXNG Quadlet source and Ansible role pass focused validation; a current backup and known restore path exist before live work; SearXNG recovers from a controlled process kill and host reboot; its loopback and HTTPS endpoints and persistent data remain intact; rollback to the prior Compose wrapper succeeds; and Onclave remains healthy and unchanged after every live step.
- Fails when: Existing commands cannot establish current state, a required backup or restore path is unavailable, the SearXNG unit changes identity, mounts, port exposure, Caddy routing, or persistent data, any live check fails, rollback fails, or Onclave state or health changes.

## Boundaries

- `modules/homelab-infra/` owns all implementation and live operations. The dotfiles repository owns only this plan and the final submodule reference. `modules/onclave/` is read-only input.
- Use existing repository commands, Ansible roles, systemd, Podman, health endpoints, and service-state backup and restore workflows. Do not add custom probe programs, sanitizing protocols, watchdogs, backup frameworks, or schedulers.
- Do not inspect `modules/homelab-infra/values/**`. Use the existing BWS-backed repository workflows.
- Onclave remains the Compose project `onclave`, managed by `onclave-onramp.service`. Preserve its backup and restore contract and `scripts/onclave-core-rollout.sh` behavior.
- SearXNG is the only Quadlet canary. Use a maintained `.container` template. Do not use `podman generate systemd`, Podman pods, or generated units as source.
- Preserve the `searxng-onramp` service and container identity, image, environment, settings and data mounts, loopback-only port, Caddy route, and service-state catalog entry.
- Perform one live mutation at a time. The first failed mutation enters incident mode: stop, restore SearXNG with the documented rollback, verify Onclave and SearXNG, and do not continue to the reboot gate.
- Before replacing SearXNG, require a current SearXNG backup, a verified restore command, the exact prior Git revision, and a clean owned-file boundary. Before rebooting the shared host, also require current backups and restore paths for affected stateful Onclave services.
- Do not commit or push module or parent changes until the canary and rollback evidence passes.

## Tasks

- [ ] **T1: Record current supervision and rollback state without mutation**
  - Files: Read-only inspection of `modules/homelab-infra/infra/ansible/roles/searxng_onramp/**`, `infra/ansible/roles/onclave_onramp/**`, `infra/ansible/vars/service-state.yml`, `scripts/service-state.sh`, `scripts/onclave-core-rollout.sh`, and current host state through existing repository commands.
  - Change: Use the existing BWS-backed settings command to identify enabled services. Record the current SearXNG and Onclave user units, enabled state, user lingering, container names, container restart policies, health, loopback listeners, HTTPS endpoints, and current Git revision. Record the existing SearXNG backup and restore commands and the exact Compose wrapper files needed for rollback. Do not write target state or change a service.
  - Done when: The record identifies the current Compose ownership, service and container identities, restart policies, boot behavior, endpoints, persistent paths, backup command, restore command, and rollback revision for SearXNG; it also records Onclave health and its existing core-only rollout boundary. Any disagreement between tracked source and live state blocks T2.
  - Verify: Run only existing read-only settings, `systemctl --user`, `loginctl`, `podman inspect`, and endpoint commands through the repository's approved BWS-backed runner. `git diff --check` passes and no service, unit, container, BWS record, or tracked file changes.

- [ ] **T2: Implement and validate the SearXNG Quadlet source**
  - Depends on: T1
  - Files: `modules/homelab-infra/infra/ansible/roles/searxng_onramp/**`, its focused tests, and operator documentation only where commands change. Do not edit `onclave_onramp/**`.
  - Change: Replace the SearXNG Compose wrapper with a source-controlled rootless Quadlet `.container` template installed by the existing Ansible role. Preserve its identity, image, environment, mounts, loopback port, Caddy route, and persistent data. Configure `Restart=on-failure`, a bounded restart delay, and boot through the existing rootless user target. Keep an explicit Ansible rollback path that removes only the SearXNG Quadlet source and restores the prior tracked Compose wrapper without deleting data.
  - Done when: Focused tests prove the role is idempotent, the generated service is `searxng-onramp.service`, no source unit invokes `podman-compose`, the port remains loopback-only, data and settings mounts are unchanged, intentional stop does not restart the service, abnormal exit does restart it, and rollback touches only SearXNG supervision files and its container.
  - Verify: Run the existing homelab Python tests that cover Ansible safety, service activation, and service-state behavior; add one focused SearXNG Quadlet test. Run Ansible syntax check and check mode for the SearXNG playbook through the existing BWS-backed runner. Run `ansible-lint`, applicable shell checks, and `git diff --check`. Do not perform a live replacement in T2.

- [ ] **T3: Run the SearXNG canary, rollback, and reboot gates serially**
  - Depends on: T2
  - Files: No new implementation files beyond the reviewed T2 change. Store only a concise, public-safe result in this plan's Execution Status.
  - Change: Confirm the owned module paths are clean and record the exact pre-canary revision. Create and verify a current SearXNG backup through `scripts/service-state.sh`; stop if the restore command is not known and usable. Apply only the SearXNG role through the existing BWS-backed runner. Verify the Quadlet-owned unit, container identity, loopback health, external HTTPS behavior, Caddy route, and persistent data. Kill the SearXNG container process once and require recovery within 120 seconds. Roll back to the recorded Compose wrapper, verify the same endpoints and data, then reapply the reviewed Quadlet change and repeat the health checks.

    Before the shared-host reboot, verify current backup and restore paths for affected stateful Onclave services and record healthy SearXNG and Onclave baselines. Reboot the host once through the existing infrastructure workflow. Require rootless user lingering, automatic SearXNG startup, healthy loopback and HTTPS endpoints, preserved SearXNG data, healthy Onclave dependencies and core, and no unrelated service changes.
  - Done when: Apply, controlled crash recovery, Compose rollback, Quadlet reapply, and one host reboot all pass; SearXNG data and routing are preserved; Onclave remains healthy and Compose-managed; and the result records the revision, backup evidence, checks, and rollback outcome without secrets or private inventory.
  - Verify: Run the focused homelab tests again, then the repository's normal validation command once. Run `git diff --check`. Commit and push the homelab module first, then update and push the parent submodule reference. A failed live check stops completion and requires recovery before any commit or broader work.

## Validation

- [ ] T1 read-only audit records current source and live state using existing commands only.
- [ ] T2 focused tests, Ansible syntax and check mode, lint, and diff checks pass without live mutation.
- [ ] T3 backup, apply, crash, rollback, reapply, reboot, endpoint, persistence, and Onclave no-collateral checks pass.
- [ ] The homelab module is committed and pushed before the parent submodule reference.

## Retention

Keep incomplete work at `.specs/podman-supervision-hybrid/plan.md`. After every task and validation item passes, archive the complete directory to `.specs/archive/podman-supervision-hybrid/`.

## Execution Status

- State: ready
- Completed: none
- Blocker: none
- Next task: T1
- Resume: `/do-it .specs/podman-supervision-hybrid/plan.md`
