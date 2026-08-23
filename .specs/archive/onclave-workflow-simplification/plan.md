---
created: 2026-08-14
status: complete
completed: 2026-08-23
---

# Simplify Onclave workflow ownership

Status: Complete

## Outcome

Remove three confirmed duplicate ownership paths without changing user-visible behavior: Pi background completion state, YouTube JSON request serialization, and Onclave deployment environment naming.

## Boundaries

- Preserve background subagent survival across `/reload`, `/new`, `/resume`, and `/fork`, exactly-once completion delivery, cancellation, and bounded quit termination.
- Preserve `ONCLAVE_API_BASE` and `HOST_DOMAIN` endpoint resolution, request signing, explicit `/yt-local`, and the single `onclave-youtube` command surface. Do not restore retired aliases or local fallback.
- Preserve `/menos/data`, the `menos` PostgreSQL database and user, and the `menos` S3 bucket.
- Do not access `modules/homelab-infra/values/`, deploy, migrate live secrets, commit, or add generic compatibility layers.

## Tasks

- [x] **Make the subagent run manager the only background-completion store.** In `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, and `pi/tests/subagent.test.ts`, remove the extension-local completion map and flush pending completions directly from the manager. Keep only listener scheduling and the delivery guard needed for exactly-once behavior. Acceptance: a completion produced during session replacement is delivered once by the replacement session; failed delivery remains pending; reload preserves workers; quit and cancellation behavior are unchanged. Verification: `cd pi && pnpm test subagent.test.ts subagent-run-manager.test.ts && pnpm run typecheck` passes.

- [x] **Make `OnclaveClient` own JSON request encoding.** In `tools/onclave-youtube/onclave_client.py`, add one JSON POST operation that serializes once and signs and sends those exact bytes; update only `ingest_video.py`, `post_annotation.py`, `search.py`, and their focused tests. Do not introduce a generic CLI framework or merge command modules. Acceptance: the three commands produce the same payloads, endpoints, output, and error behavior, and signed request bytes equal transmitted request bytes. Verification: `cd tools/onclave-youtube && uv run pytest tests/test_onclave_client.py tests/test_ingest_video.py tests/test_post_annotation.py tests/test_search.py && uv run ruff check . && uv run ruff format --check .` passes.

- [x] **Use canonical Onclave environment names end to end.** In `modules/onclave/deploy/app/onclave/`, `modules/onclave/scripts/onclave-bws-env.py`, its documented callers under `modules/onclave/infra/`, and the `modules/homelab-infra/infra/ansible/roles/onclave_onramp/` template and focused tests, make the host environment expose canonical `ONCLAVE_VAULT_*` names. Map those values only to dependency-specific container variables inside Compose. Remove the unused `menos` stack and `MINIO_*` alias rendering after a repository search confirms no caller. Keep the adopted storage values unchanged. Acceptance: Compose resolves from canonical names, the Onclave core receives canonical names directly, repository callers no longer request a Menos stack, and no retired runtime aliases remain. Verification: `cd modules/onclave && just check` passes; render and validate the environment through the script's `env` provider using temporary fixture values; run `docker compose config` for the Onclave stack; run the focused homelab BWS and Ansible safety tests without `values/`; and run `git diff --check` in all three repositories.

## Validation

- [x] Current source and tests confirm the run manager is the sole background-completion store.
- [x] Current source and tests confirm `OnclaveClient` owns JSON request encoding.
- [x] Current Onclave and homelab configuration uses canonical `ONCLAVE_VAULT_*` names.

## Execution Status

- State: complete
- Blocker: none
- Next: none
