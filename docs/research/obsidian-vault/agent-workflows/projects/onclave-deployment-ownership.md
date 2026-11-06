---
status: implemented-reference
source: ../../../../../modules/homelab-infra/docs/onclave-deployment.md
updated: 2026-11-05
---

# Onclave deployment ownership and automatic image updates

## Why this matters

Onclave and homelab-infra remain separate repositories, but production deployment
no longer depends on downloading Onclave deployment files at a pinned source
commit. The application image is the release boundary. This note records the
implemented decision and observed behavior, not approval for further changes.

## Ownership and hosting

| Owner | Responsibility |
| --- | --- |
| Onclave | Application code, database migration logic, image builds, configuration requirements, and local development/test assets |
| homelab-infra | Production Quadlets, configuration, BWS integration, registry authentication, storage, networking, backup/restore orchestration, and update scheduling |
| Dotfiles | Workstation setup, Pi integration, and module references |

- The canonical Onclave Git repository is private Forgejo `mike/onclave`, with
  only `feature/v2-broker-core` imported and tracked. Its ancestor history is
  retained; other branch refs were not copied.
- GitHub `traefikturkey/onclave` remains **unarchived**, following the operator's
  correction. Do not infer archival permission from the Forgejo migration.
- Images belong to the private Forgejo `onclave` organization, under
  `<forgejo-host>/onclave/onclave-core`. Forgejo package access follows its owning
  user or organization, not the linked repository. Linking an image owned by a
  public account to a private repository does not make that image private.
- CI publishing credentials and read-only deployment credentials remain
  separate and BWS-owned. This vault is not a source of live inventory or secrets.

## Release and deployment behavior

1. Onclave CI runs checks, builds an image with its source revision embedded as
   `GIT_SHA`, publishes the source-SHA tag, then advances `latest` only after the
   SHA-tagged publication succeeds. `/health` reports the embedded revision.
2. First installation through homelab-infra pulls `latest`. Production Quadlets
   are authoritative; the role does not download or parse product Compose files.
3. Normal configuration applies preserve the installed core image, including
   restarts required by configuration changes. They do not select a new release.
4. Podman's rootless `podman-auto-update.timer` uses its default daily schedule.
   Only core opts in with `AutoUpdate=registry`; dependency images remain pinned.
5. The updater uses the persistent read-only registry auth file identified by
   `io.containers.autoupdate.authfile`. The application service's environment
   alone does not configure the separate updater process.

`Pull=missing` alone would not preserve the installed version if the local
`latest` tag pointed at a different image. The role prepares the local tag from
an installed container's image ID before configuration changes, and the Quadlet
uses `Pull=never`. For a stopped installation, the existing Quadlet's local
image reference is used instead of fetching a newer image. No manual source-SHA
or digest update is needed for routine application releases.

The old commit-based core rollout, raw-file URLs, download checksums, source API
input, and core tag/digest inputs were removed. PostgreSQL backup/restore helpers
now live in homelab-infra. The product's temporary direct Ansible deployment path
and production values initializer were retired; local/test Compose, smoke tests,
and application schema/configuration documentation remain in Onclave.

## Verified behavior and limits

Observed on Podman **5.4.2**, 2026-11-05:

- Forgejo CI run **55** succeeded for Onclave `5955137`.
- Configuration migration restarted core while retaining its previous image ID.
- A one-time native auto-update adopted the new private image; `/health` reported
  its embedded source revision, and health, liveness, and readiness returned 200.
- A subsequent normal apply preserved both the new image ID and start time.
- Only core was eligible for auto-update, and the daily timer was enabled.
- Anonymous manifest requests were denied with 401; authenticated update worked.
- Signed archive upload/read/search returned **168,001 unchanged bytes** in the
  checked snapshot. This is not evidence of complete historical archive backfill.
- Final infrastructure validation ran **482 tests with one skipped** and passed
  Ansible lint. It then stopped at the missing excluded `values/` checkout, so the
  complete `just validate` command did not pass.

The first future unattended daily timer event had not been observed at closeout.
Podman's native failed-update image rollback does not roll back database changes.
Releases requiring new configuration, volumes, dependencies, or incompatible data
transitions still require coordination before advancing `latest`.

## Follow-up: fresh Pi registration failure

A same-day follow-up exposed a filesystem-ownership bug in the existing role.
Normal applies reset the RabbitMQ bind-mount root to the host deploy user, which
maps to UID 0 inside the rootless container. RabbitMQ runs as UID 999 and could
not create new queue files (`eacces`). BWS bootstrap and API health checks worked,
but fresh agent registration returned HTTP 500.

Infrastructure fix `04df318` initializes the RabbitMQ directory when missing and
preserves its existing ownership and mode. Live recovery repaired only that directory's
ownership and restarted RabbitMQ and core to recover failed queues. No queues or
database data were deleted, and the core image stayed unchanged. A subsequent
normal apply retained writable ownership. Fresh signed registration, heartbeat,
and delivery polling passed; a new native Pi 1.5.0 process, without a profile
override, reported connected and registered, then shut down cleanly.

The 12 focused role tests and role Ansible lint passed. Follow-up `just validate`
stopped at a public-safety finding on `NOPASSWD` in the separately committed
Hatchery Alchemy script, before later validation stages ran. That unrelated file
was left unchanged. Passing health checks alone had not established fresh Pi
connectivity; the registration check is the direct evidence for this repair.

## KISS recommendation

Keep image publishing in Onclave and production deployment in homelab-infra.
Use the native updater rather than another controller. Do not reintroduce
per-release Git pins or duplicate production Compose and Quadlet definitions.
Consult the maintained runbook for operations; this is a dated context note.

## Sources and related notes

- [Production deployment runbook](../../../../../modules/homelab-infra/docs/onclave-deployment.md)
- [Onclave product README](../../../../../modules/onclave/README.md)
- [Local/test app documentation](../../../../../modules/onclave/deploy/app/onclave/README.md)
- [Infrastructure README](../../../../../modules/homelab-infra/README.md)
- [Podman auto-update documentation](https://docs.podman.io/en/latest/markdown/podman-auto-update.1.html)
- [Forgejo package access restrictions](https://forgejo.org/docs/latest/user/packages/#access-restrictions)
- [Agent workflow research index](../index.md)

Implementation references: Onclave `5955137`, homelab-infra `0f982f4` and
`9d6e78f`, dotfiles `eda82bba`. These identify the recorded implementation, not
standing deployment pins.
