# Plan: Rootless Podman Failure Hardening

## Goal

Replace the active rootless `podman-compose` systemd wrappers with Podman Quadlet supervision for the enabled Menos, Onclave, and SearXNG deployments in `.repos/homelab-infra`. Recover Menos first, then migrate the other enabled services one at a time.

## Boundaries

- Change deployment ownership and restart behavior only. Do not redesign backups, monitoring, networking, DNS, secrets, images, application APIs, or OpenTofu resources.
- `.repos/homelab-infra` owns the implementation. `.repos/onclave` is read-only input for the pinned Menos and Onclave container contracts.
- Use one Quadlet `.container` per existing Compose service and one role-specific `.network`. Multi-container roles may use one ordinary systemd `.target` for grouped operations. Do not create Podman pods.
- Every in-scope container gets systemd `Restart=on-failure` with a bounded restart delay and start limit. Add health-triggered restart only where the current enabled deployment already has a verified health command: Menos PostgreSQL/API and Onclave RabbitMQ/core. Do not invent probes for MinIO, Ollama, Docling, or SearXNG in this change.
- Preserve current image pins, environment, mounts, aliases, published ports, dependency order, secret handling, and Caddy routing. Use `Notify=healthy` only for existing health-gated dependencies: Menos API after PostgreSQL and Onclave core after RabbitMQ.
- Do not remove the shared `podman-compose` package or rewrite historical migration tooling in this change. It is sufficient that no enabled in-scope service unit invokes Compose after rollout.
- Infisical remains disabled and is not a validation or rollout target. Touch its role only if an in-scope change modifies a shared deployment interface it consumes, and then make only the compatibility edit required to preserve its current behavior.
- Existing backup tooling may receive only the unit-name compatibility changes required by the migration. Before a live stateful mutation, verify an existing current backup and restore command or take a one-time pre-change snapshot outside tracked implementation. If that safety precondition is unavailable, stop before live mutation rather than building backup tooling.
- The ignored `.repos/homelab-infra/settings.local.json` is absent. Before live apply, reconstruct its exact service list from private Git history, private state, and target-host managed units. Validate it with `scripts/python.sh scripts/settings.py validate`; stop if the sources disagree or if reconstruction would enable or disable a service.
- Roll out one independent service at a time. The first failed live mutation stops later rollout work until the affected service is recovered and its original endpoint/state checks pass.

## Execution plan

- [ ] **1. Convert the three enabled onramp roles to a small, consistent Quadlet pattern.**  
  **Targets:** `.repos/homelab-infra/infra/ansible/roles/{menos_onramp,onclave_onramp,searxng_onramp}`, `infra/ansible/vars/service-state.yml`, and focused existing tests under `tests/`; update `docs/onramp-host-runbook.md` only where an operator command would otherwise invoke the removed active wrapper. Include `infisical_onramp` only if a changed shared interface requires a compatibility edit.  
  **Action:** Render `.container` and `.network` files into the deploy user's Quadlet directory and multi-container `.target` files into the user systemd directory. Use direct `podman exec` where role tasks currently require Compose only for container discovery or commands. Set `Restart=on-failure`, `RestartSec=15s`, `StartLimitIntervalSec=300`, and `StartLimitBurst=5` for each container. Preserve existing health commands and timing; add `HealthOnFailure=kill` to those verified checks so systemd performs the restart. Preserve existing health-gated dependency semantics with `Notify=healthy`. During each role apply, render to a temporary directory, run the target's installed Quadlet generator in dry-run mode, then install units only if generation succeeds. Stop/disable/remove that role's legacy wrapper and label/name-matched legacy containers only after generated-unit validation passes; never remove bind-mounted data. Update only the existing service-state catalog's `user_services` names so restore operations stop/start the new role targets.  
  **Acceptance:** The three role playbooks syntax-check; focused tests pass; enabled-role generator dry-runs name the expected units; every in-scope container has systemd crash restart; only the four existing Menos and Onclave health checks gain health-triggered restart; Menos and Onclave retain health-gated startup dependencies; no enabled in-scope `*-onramp.service` invokes `podman-compose`.  
  **Verification:** From `.repos/homelab-infra`, run `scripts/python.sh -m unittest tests.test_ansible_safety tests.test_settings tests.test_apply_ansible_services`, then run syntax checks for `infra/ansible/playbooks/{menos,onclave,searxng}-onramp.yml` through `scripts/run-infra.sh`. Use the role's staged target-host invocation of `QUADLET_UNIT_DIRS=<staging-directory> /usr/lib/systemd/system-generators/podman-system-generator --user --dryrun` during enabled-service applies. Do not run `just validate` yet.

- [ ] **2. Recover Menos as the canary and verify automatic restart.**  
  **Depends on:** Task 1.  
  **Target:** Menos only on the existing onramp VM.  
  **Action:** Complete the settings preflight and live-state safety precondition without adding backup code. Apply only `scripts/apply-service.sh menos_onramp`. The role replaces the exited legacy Menos pod/containers with the generated network and six container units while preserving existing PostgreSQL, MinIO, and Ollama bind directories.  
  **Acceptance:** `menos-{postgres,minio,ollama,searxng,docling,api}.service` and `menos-onramp.target` are active; existing health checks report healthy; `/health`, `/ready`, and external HTTPS return 200; persisted content remains present; a real `/yt` list or ingest succeeds; killing the Menos API process causes systemd to start a replacement and restore health within 120 seconds; stopping and starting `menos-onramp.target` does not reproduce the stale pod/cgroup failure.  
  **Verification:** Capture user-systemd unit status, container health, direct `/health` and `/ready`, external HTTPS, and the `/yt` result. Compare the API container start timestamp before and after one controlled process kill.  
  **Rollback:** Stop the new target, restore the previous role revision and wrapper, remove only replacement Quadlet resources, and use the verified pre-change restore path only if state changed. Because Menos was already down, the minimum rollback boundary is its original deployment state with pre-change data preserved. Do not continue to another service until Menos passes.

- [ ] **3. Migrate SearXNG and Onclave sequentially and run the final gate.**  
  **Depends on:** Task 2.  
  **Targets:** SearXNG first, then Onclave.  
  **Action:** Before each live mutation, satisfy the existing backup/restore precondition without changing backup implementation. Apply `scripts/apply-service.sh searxng_onramp`, verify its endpoint and one process-crash restart, and finish its rollback check before touching Onclave. Then apply `scripts/apply-service.sh onclave_onramp` and verify RabbitMQ persistence, core broker/topology health, agent registration, and one correlated request/reply.  
  **Acceptance:** `searxng-onramp-app.service`, `onclave-rabbitmq.service`, and `onclave-core.service` cold-start cleanly and recover from a killed main process within 120 seconds; SearXNG behavior and Onclave state remain intact; Onclave discovers agents and completes a correlated request/reply; no migrated enabled service retains an active Compose wrapper/pod; `just validate` passes.  
  **Verification:** Run the targeted service apply and endpoint checks for SearXNG, then repeat for Onclave and check `/health`, `onclave_agents`, and one `onclave_send` exchange. Finish with `just validate` exactly once.  
  **Rollback and stop condition:** Roll back only the service currently being migrated using its previous role revision and verified restore path, then rerun its original endpoint/state checks. Any failed live mutation blocks later rollouts.
