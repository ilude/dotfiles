---
created: 2026-09-13
status: in progress
completed: null
---

# Consolidate Onclave assets into SeaweedFS and complete the `/yt` workflow

## Goal and scope

- Move the existing Onclave/Menos object corpus from MinIO to the already deployed SeaweedFS service, expose the S3 API at the operator-selected internal HTTPS hostname stored in BWS, switch Onclave and Pi to it, verify parity, and remove MinIO from the Onclave Compose deployment.
- Complete the `/yt` work begun in pushed Onclave commit `2418511`: automatic terminal-job wake-ups, local transcript-file retrieval, coherent tool output, deployment, and recovery of the failed video `T9d6lrvzM9o`.
- Remove the arbitrary transcript/download gates added during the current session. Do not replace them with new limits, deadlines, retries, threat-model controls, or availability policies without evidence and operator agreement.
- Preserve unrelated work in the dotfiles parent and all existing task-owned changes in `modules/onclave/` and root `CHANGELOG.md`.
- Non-goals: Internet exposure, MinIO browser console, a new Onclave download endpoint, RustFS or Garage evaluation, storage clustering, credential rotation, or unrelated object-schema redesign.
- Authorization: this document authorizes planning only. Push, live DNS/BWS mutation, deployment, data migration, and MinIO removal require an explicit execution request. Stateful cutover must retain MinIO data as the rollback source until post-cutover verification passes.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles` unless a repository root is named. Read root `AGENTS.md`, `modules/onclave/AGENTS.md`, `modules/homelab-infra/AGENTS.md`, and `modules/homelab-infra/values/AGENTS.md` before acting.

- Owning repositories:
  - `modules/onclave/`: product code, shared client, Pi adapter, tool contracts, and core service behavior. Keep it on `feature/v2-broker-core`.
  - `modules/homelab-infra/`: SeaweedFS/Onclave deployment, Caddy, internal DNS, BWS configuration families, migration orchestration, and service validation.
  - Dotfiles parent: coordinating spec, root changelog, Pi loader wiring, and final submodule pointers.
  - `modules/homelab-infra/values/`: private artifacts only. Never copy live inventory, endpoints, or secrets into tracked public files or chat.
- Verified starting behavior:
  - Onclave uses only S3 `putObject`, `getObject`, `removeObject`, and `bucketExists`.
  - MinIO stores the Onclave/Menos assets. Recorded corpus size is about 3,969 objects and 28.94 MB.
  - SeaweedFS 4.x is already deployed for encrypted OpenTofu state with an HTTPS S3 route, persistent storage, versioning, and tested SigV4 access.
  - MinIO Community source remains AGPLv3 but its official repository was archived/read-only in April 2026; maintained AIStor is proprietary.
  - The operator-selected S3 hostname is intended for internal-network API access, not Internet exposure or a browser console. Keep its live value in BWS, not this tracked plan.
  - The existing failed video has `content_id=c89b708d680f43f28f0ad40df6ab0d14`, `job_id=b437385f720147a490d2eb6eb1ee5947`, and a stored 41,220-byte transcript at `youtube/T9d6lrvzM9o/transcript.txt`.
- Onclave commit `2418511` (`Add vault job notifications and downloads`) is already pushed at `origin/feature/v2-broker-core`; the parent gitlink already points to it. Reconcile its arbitrary limits and transcript operation in a new Onclave commit rather than rewriting pushed history.
- Existing unrelated parent changes, including `CHANGELOG.md`, agent-process/context work, and Pi command/session files, are outside this plan. Never stage, commit, modify, or remove them. Add this task's eventual changelog entry only through a narrowly coordinated edit that preserves those changes.
- The historical `modules/homelab-infra/.specs/bws-seaweedfs-state/plan.md` is marked completed and is evidence for the deployed state backend, not an active plan for this work.
- Planning profile: Pi default profile, 2026-09-13. Execution profile: Pi default, started 2026-09-13. Live migration and deployment remain unauthorized by the plan.
- Recorded worktrees and integration targets:
  - Onclave: `C:/Users/mglenn/.dotfiles/.worktrees/onclave-seaweedfs-onclave`, branch `task/onclave-seaweedfs-consolidation`, integrate into canonical `modules/onclave/` branch `feature/v2-broker-core` at starting commit `2418511`.
  - Homelab: `C:/Users/mglenn/.dotfiles/.worktrees/onclave-seaweedfs-homelab`, branch `task/onclave-seaweedfs-consolidation`, integrate into canonical detached submodule target corresponding to `main` at starting commit `3c52df2`; attach/merge to local `main` before updating the parent gitlink.
  - Parent: canonical `C:/Users/mglenn/.dotfiles`, branch `main` at starting commit `1120d45`; preserve all unrelated dirt.

## Decisions and implementation contract

- Use the existing SeaweedFS process with a separate `menos` bucket and separate Onclave credentials. Do not create a second SeaweedFS instance unless deployment evidence shows the existing process cannot isolate bucket credentials or workload configuration.
- The BWS-owned internal S3 hostname is routed by the existing Caddy deployment to SeaweedFS's loopback S3 listener. Do not publish SeaweedFS directly on a non-loopback host interface.
- Keep the OpenTofu state bucket, Onclave bucket, credentials, lifecycle rules, and application configuration separate even though they share one SeaweedFS process.
- Preserve existing object keys during migration. PostgreSQL `content.file_path` remains authoritative during this work; object-key redesign and transcript-version integration are out of scope.
- The Onclave Pi extension owns lazy BWS retrieval because it already owns the BWS bootstrap and direct-object client. Extend that product contract to retrieve `ONCLAVE_VAULT_S3_WORKSTATION_ENDPOINT`, `ONCLAVE_VAULT_S3_BUCKET`, `ONCLAVE_VAULT_S3_REGION`, `ONCLAVE_VAULT_S3_ACCESS_KEY`, and `ONCLAVE_VAULT_S3_SECRET_KEY` from the same configured BWS project. Homelab-infra owns creating/populating those BWS values; dotfiles requires no credential wiring. The workstation endpoint uses the operator-selected internal HTTPS hostname, while the server keeps its Compose-internal endpoint. Secret values remain in memory and must not appear in tool definitions, logs, test fixtures, errors, session messages, or chat.
- The transcript workflow has one behavior: `onclave_vault_content operation=transcript` downloads the complete object to an extension-owned temporary file and returns only `local_path`, `content_id`, and `bytes`. Remove the redundant `download` operation unless compatibility evidence requires a temporary alias.
- No transcript bytes are returned in model-facing tool output. Remove the local 100,000-character transcript-output gate, generic 24,000-character serialized-result rejection, 50 MiB file limit, and added whole-stream deadline. Existing server pagination remains the control for list/search operations. Explicit Pi/user cancellation remains supported.
- Temporary files use generated names and are removed when a transfer actually fails or is cancelled. Do not add caller destination paths, automatic expiry, background cleanup services, or speculative attacker controls.
- Accepted asynchronous `/yt` ingestion requires the active Pi notification identity so every accepted job has a return path. This is a workflow invariant established by the original failure, not a general security gate. If identity is unavailable, fail before submitting the job with a direct connection-state error.
- Completed, failed, and cancelled terminal job events use the existing Onclave broker and reach Pi through `pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true })`. Generic informational messages remain inert.
- Use one explicit migration rollback boundary: do not remove MinIO or its persistent data until object parity and post-cutover Onclave read/write checks pass. After acceptance, remove MinIO from the managed Compose configuration; retain only the one current verified migration backup required by homelab guidance.

## Execution guidance

Onclave starts clean at pushed commit `2418511`; create a new task commit on `feature/v2-broker-core` without amending or rebasing that pushed commit. For new homelab implementation, create a dedicated task worktree from the current homelab integration target and record its path and branch. Do not switch `modules/onclave/` away from `feature/v2-broker-core`.

Implement and validate each owning repository independently. Commit and push Onclave first, homelab-infra second, and update parent gitlinks last. Continue independent implementation around external blockers, but do not cut over or remove MinIO when parity or live service checks fail. Ask before changing the settled endpoint, shared-process decision, credential boundary, object-key contract, or acceptance checks.

## Tasks

- [ ] **T1: Reconcile the Onclave `/yt` and transcript implementation**
  - Depends on: none.
  - Files: `modules/onclave/extensions/onclave-pi/src/lib/vault-tools.ts`, `modules/onclave/extensions/onclave-pi/src/onclave-pi.ts`, `modules/onclave/packages/client/src/index.ts`, `modules/onclave/services/core/src/{service.ts,vault/}`, related tests, and root `CHANGELOG.md`.
  - Change:
    - Preserve automatic `notify_agent_id`, terminal wake-up, acknowledgement, and stale-session fixes.
    - Extend reprocessing so the Pi jobs tool automatically supplies and the core authorizes/persists the active notification identity, including late/duplicate subscription behavior, so explicit reprocess jobs also produce terminal wake-ups.
    - Make `operation=transcript` produce a local file result and remove the redundant download operation unless compatibility requires an alias.
    - Remove `MAX_OUTPUT`, transcript-output length rejection, `MAX_DOWNLOAD_BYTES`, and the added body-stream deadline.
    - Keep cancellation and incomplete-file cleanup.
    - Extend the existing Onclave-owned lazy BWS loader with the exact workstation S3 contract recorded above and add an authenticated direct-S3 client. Discovery must perform no BWS, network, or file work.
    - Use content metadata only to resolve the server-owned object key. Terminal/video metadata may expose the one canonical `<internal-s3-base>/<bucket>/<object>` URL resolved from BWS, but must not also expose the raw object key through the Pi tool. The transcript result remains only `local_path`, `content_id`, and `bytes`.
  - Verify: from `modules/onclave/`, run focused client/adapter tests and `just check`.
  - Done when: an object larger than all observed transcripts downloads without entering model context or hitting an arbitrary local size/time gate; result contains exactly `local_path`, `content_id`, and `bytes`; terminal-event tests remain green; secrets and transcript content are absent from results and errors.
  - If blocked: retain the existing signed Onclave API path as the temporary implementation and record the exact missing SeaweedFS/BWS contract. Do not invent an endpoint or credential.
  - Evidence: implemented in Onclave commits `d1ca91b` and `f3e44d6`, locally fast-forwarded into `feature/v2-broker-core`. `just check` passed with 267 tests and 1 skipped. Live Pi reload and retrieval remain T4/T5 work, so T1 remains unchecked.

- [ ] **T2: Extend the existing SeaweedFS deployment for Onclave assets and internal S3 access**
  - Depends on: none; contract must complete before T3/T4.
  - Files: `modules/homelab-infra/infra/ansible/roles/seaweedfs_onramp/`, relevant playbooks/tests, `config/bws-routing.json`, BWS families, and internal DNS inputs.
  - Change:
    - Add an independently configured `menos` bucket and Onclave-scoped S3 identity to the existing SeaweedFS service.
    - Add the operator-selected internal S3 hostname through the existing BWS-owned DNS workflow. Its live value exists only in BWS/rendered runtime configuration; tracked templates and routing manifests use generic variable names and public-safe placeholders.
    - Add a variable-driven Caddy S3 vhost that renders from BWS in the live environment, proxies the SeaweedFS S3 API listener, and preserves SigV4 request semantics.
    - Keep SeaweedFS administrative/internal ports unexposed and keep the current OpenTofu state configuration unchanged.
    - Update tracked examples with public-safe placeholders only; place live names and credentials in BWS.
  - Verify: focused homelab tests, Ansible syntax/lint for affected playbooks, Caddy configuration validation, DNS rendering validation, and SeaweedFS bucket/credential tests using redacted output.
  - Done when: the internal hostname resolves from the workstation, HTTPS validates, unauthenticated S3 access is denied, Onclave-scoped credentials can perform the exact required CRUD operations in `menos`, and state-bucket behavior remains unchanged.
  - If blocked: stop before data copy and report the failing DNS, TLS, credential, or bucket contract. Do not expose a raw host port or substitute Internet access.
  - Evidence: local deployment/configuration implementation is in homelab commits `a8cd6d0` and `4480218`, fast-forwarded into local `main`. Focused tests passed. Live BWS/DNS/Caddy/SeaweedFS checks are unauthorized and unperformed, so T2 remains unchecked.

- [ ] **T3: Copy and verify the MinIO corpus in SeaweedFS**
  - Depends on: T2.
  - Files: proposed migration helper/tests under `modules/homelab-infra/scripts/` and private run artifacts under `modules/homelab-infra/values/`.
  - Change:
    - Perform an initial resumable/idempotent copy of the existing `menos` bucket from MinIO to SeaweedFS without changing object keys, content types, or source data.
    - Before final parity, quiesce Onclave writes for a bounded maintenance window, take a fresh source inventory, copy the final delta, and keep writes quiesced through endpoint cutover and validation. Do not compare a live-moving source.
    - Produce a redacted private parity artifact containing source/destination object counts, total bytes, and deterministic per-object or aggregate digest evidence.
    - Keep MinIO and its volume unchanged throughout this task.
  - Verify: expected baseline is approximately 3,969 objects and 28.94 MB, but live source inventory is authoritative. Require exact source/destination keyset, byte count, and content digest parity.
  - Done when: every source object has an identical verified destination object and rerunning the migration produces no data changes.
  - If blocked: preserve both stores, record mismatched keys/digests privately, and resume only the failed copies. Do not proceed to cutover.
  - Evidence: resumable migration/parity helper and quiescence gates are implemented and tested locally in `a8cd6d0`/`4480218`. Live copy and exact corpus parity are unauthorized and unperformed, so T3 remains unchecked.

- [ ] **T4: Cut Onclave and Pi over to SeaweedFS**
  - Depends on: T1, T2, T3.
  - Files: Onclave deployment variables/BWS families and `modules/homelab-infra/infra/ansible/roles/onclave_onramp/`; no application object-key changes.
  - Change:
    - While Onclave writes remain quiesced from T3, point the core at the SeaweedFS internal S3 endpoint and `menos` credentials. Reopen writes only after existing-object reads and one disposable write/read/delete pass. If validation fails, remove any disposable SeaweedFS writes and restore the MinIO endpoint before reopening; do not allow user writes to split across stores.
    - Point Pi's direct transcript retrieval at the BWS-resolved internal S3 endpoint using its Onclave credentials.
    - Deploy through the existing targeted Onclave/SeaweedFS playbooks and reload the Pi extension.
  - Verify:
    - Onclave readiness passes S3 bucket access.
    - Read the known failed video's stored transcript through both Onclave metadata and the Pi local-file operation; expect 41,220 bytes before reprocessing changes content.
    - Create, read, and delete one disposable application object through the same client contract, then confirm no test residue remains.
    - Existing OpenTofu remote-state read, version, and lock checks still pass.
  - Done when: new Onclave writes and existing object reads use SeaweedFS, Pi returns a local transcript path without transcript bytes in context, and no service references MinIO as its active endpoint.
  - If blocked: restore the previous Onclave endpoint while preserving SeaweedFS's copied bucket and MinIO source. Record the exact failed check and owner.
  - Evidence: opt-in cutover configuration and safe-default gates are implemented locally in `a8cd6d0`/`4480218`. Deployment, Pi reload, and live CRUD are unauthorized and unperformed, so T4 remains unchecked.

- [ ] **T5: Verify `/yt` recovery and decommission MinIO**
  - Depends on: T4.
  - Files: `modules/homelab-infra/infra/ansible/roles/onclave_onramp/`, Compose templates/tests, private backup artifact, and job/content records through supported APIs.
  - Change:
    - Explicitly reprocess `content_id=c89b708d680f43f28f0ad40df6ab0d14`.
    - Do not poll for orchestration; verify the terminal broker event wakes the originating Pi session and produces the requested report.
    - Confirm the transcript downloads locally. Use bounded local checks that report only byte count, digest, or match status; do not emit the complete transcript through `read`, `grep`, or tool output.
    - Create and restore-test one current SeaweedFS application-object backup containing the final authoritative corpus.
    - Remove the MinIO service, dependency, environment wiring, readiness assumptions, and managed volume declaration from the Onclave deployment. Delete live MinIO data only after the final SeaweedFS backup restores with exact parity and all prior checks pass; that verified final-authoritative backup replaces MinIO as the rollback artifact.
  - Verify: focused Onclave deployment tests, live `/ready`, end-to-end `/yt` completion/failure notification test, exact transcript byte check, backup restore check, and absence of active MinIO containers/config references.
  - Done when: the failed video has a terminal reprocessing result delivered by event, Onclave assets operate from SeaweedFS, and MinIO is absent from the managed Onclave stack.
  - If blocked: leave MinIO stopped but recoverable only when SeaweedFS is active and parity remains proven; otherwise restore MinIO service and endpoint. Do not claim decommissioning complete while MinIO remains an active dependency.
  - Evidence: backup/restore helper, explicit decommission gate, and MinIO-free target configuration are implemented locally in `a8cd6d0`/`4480218`. Live backup, reprocessing, and decommission are unauthorized and unperformed, so T5 remains unchecked.

- [ ] **T6: Validate, integrate, and close out across repositories**
  - Depends on: T1-T5.
  - Change:
    - Run `just check` once in `modules/onclave` after its final changes.
    - Run targeted homelab checks during work and `just validate` exactly once after all homelab implementation/live work is complete.
    - Commit/push Onclave first, then homelab-infra, then update the parent submodule pointers and root changelog without including unrelated parent work.
    - Archive this entire spec only after implementation, live cutover, decommissioning, and agent-owned checks are complete.
  - Done when: owning repositories contain focused commits, authorized pushes succeeded, parent gitlinks point to them, validation passes, the archived plan records exact evidence, and no task worktree cleanup remains.
  - If blocked: retain clean task worktrees and report the repository, commit, blocker, next action, and action owner. Do not stage unrelated parent changes.
  - Evidence: not started.

## Agreed validation and current handoff

- Onclave: focused Vitest for vault tools/client/communication/session lifecycle, then `just check`.
- Homelab: focused role/script tests while implementing, affected Ansible/Caddy/DNS validation, live S3 CRUD/parity/cutover checks, then one final `just validate`.
- End-to-end: accepted ingest records a subscriber; terminal completed/failed/cancelled event triggers exactly one Pi follow-up; transcript operation returns a readable local file; known video recovery completes without polling.
- Storage: exact source/destination object keyset, byte total, and digest parity; one verified backup restore; OpenTofu state checks unchanged.
- Status: in progress; local implementation and module integration complete, live execution blocked on authorization and environment.
- Completed work and evidence: Onclave commits `d1ca91b`/`f3e44d6` and homelab commits `a8cd6d0`/`4480218`/`59f9c60`/`8460007` are locally integrated. Onclave `just check` passed with 267 tests and 1 skipped. Homelab `just validate` passed after the task-related ownership assertion and lint findings were corrected; its unit suite ran 435 tests with 1 skipped.
- Next: after authorization, push owning repositories, perform BWS/DNS/SeaweedFS deployment, migrate with quiesced parity, cut over, restore-test backup, reprocess the known video, and decommission live MinIO.
- Blockers/open decisions:
  - User must explicitly authorize pushes and live BWS mutation, deployment, migration, and MinIO decommission because this plan records that requirement and the execution invocation does not add authorization.
  - No architectural decision remains open. The shared SeaweedFS process with separate bucket credentials remains selected.
- Verification limits: no live DNS, BWS, SeaweedFS bucket, migration, deployment, Pi reload, video reprocessing, backup restore, or decommission was performed.

## Closeout

After implementation and agreed checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/onclave-seaweedfs-consolidation/` does not already contain a plan, move this entire spec there, and repair affected links. Commit implementation and archived spec in their owning repositories, then merge into the recorded targets without stashing, discarding, or committing unrelated target changes.

Push and deployment require explicit authorization. Operator manual testing is non-blocking after agent-owned live checks. If integration is blocked, retain the worktree and report implementation separately from delivery. Mark the archived plan `status: completed` with the completion date only after the target repositories contain the changes and cleanup succeeds.

### Final response

Use one explicit outcome:

- 🟢 **COMPLETED** when implementation, checks, integration, completion metadata, and cleanup are done.
- 🔴 **NOT COMPLETE: MERGE BLOCKED** when implementation is committed but cannot integrate.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED** when a consequential decision or prerequisite blocks completion.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED** only for an explicit no-merge request.
- 🟡 **CLEANUP PENDING** when delivery is integrated but worktree cleanup remains.

For non-complete outcomes, state the reason and exact action needed before listing passed checks.
