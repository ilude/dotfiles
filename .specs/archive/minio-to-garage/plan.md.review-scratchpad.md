---
created: 2026-02-20T16:18:00.746781+00:00
plan_file: .specs/minio-to-garage/plan.md
mode: review-then-apply
status: in-progress
---

# Review Scratchpad

## Root Cause Registry
- RC-001: Migration cutover ordering ambiguity (how `migrate-s3.yml` runs Garage alongside legacy MinIO after compose replacement in T1).
- RC-002: Missing execution mechanism for dual-storage startup during migration window.
- RC-003: Migration credential source/propagation unspecified between Garage key creation and production `.env` update.
- RC-004: Deployment sequence updates `.env` to S3-only before migration, conflicting with legacy MinIO-dependent stack during migration window.
- RC-005: Zero-data-loss objective lacks write-consistency strategy during migration window.

## Issue Queue
- I1 (RC-001) - resolved - User selected Option 1 (explicit pre-deploy migration sequencing).
- I2 (RC-002) - resolved - User selected Option 1 (migration-specific compose override).
- I3 (RC-003) - resolved - User selected Option 1 (predefined Garage app credentials used by migration).
- I4 (RC-004) - resolved - User selected Option 1 (cut over env only at deploy).
- I5 (RC-005) - resolved - User selected Option 3 (offline migration with app stopped).

## Decisions
- I1: Option 1 selected - migration runs before deploy that applies T1 compose changes.
- I2: Option 1 selected - add migration-only compose override for dual-storage window.
- Context note: User confirmed MinIO will be fully removed after migration completes.
- I3: Option 1 selected - predefine `S3_ACCESS_KEY` and `S3_SECRET_KEY`; migration provisions/uses those exact credentials.
- I4: Option 1 selected - keep `MINIO_*` during migration and switch to `S3_*` only at cutover deploy.
- I5: Option 3 selected - stop menos-api, perform full offline migration + verification, then deploy Garage-based stack.

## Background Tasks

## Failures

## Final Reanalysis Notes
- Verified accepted decisions are reflected in `.specs/minio-to-garage/plan.md`:
  - I1: T5 now states migration runs before cutover deploy.
  - I2: T5 files now include `menos/infra/ansible/files/menos/docker-compose.migration.yml`.
  - I3: T5 now specifies predefined `S3_ACCESS_KEY`/`S3_SECRET_KEY` provisioning.
  - I4: Deployment sequence now delays `MINIO_*` -> `S3_*` rename until cutover step.
  - I5: Migration sequence now enforces offline migration by stopping `menos-api`.
