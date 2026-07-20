---
created: 2026-07-20
status: draft
completed:
---

# Plan: Complete the Pi /yt Consumer Migration

## Context and Motivation

Menos now lives in `onclave/services/menos/`, but Pi `/yt` still runs most clients from `~/.claude/commands/`. Only the channel client reached `pi/skills/workflow/yt/`. Pi therefore depends on another client's files and retains a legacy API default.

## Objective

Make Pi `/yt` self-contained under `pi/skills/workflow/yt/`, preserve existing behavior, remove Claude paths and the legacy endpoint default, and verify the command against Onclave-owned Menos.

## Boundaries

- In scope: Pi `/yt` scripts, tests, uv files, prompt paths, and one live smoke.
- Out of scope: Onclave changes/deployment, data migration, deleting Claude scripts, and a shared SDK.
- Preserve: subcommands, output fields, RFC 9421 signing, cache layout, connection/5xx fallback, and no 4xx fallback.
- Platform and shell: Windows Git Bash/MSYS2; Python uses uv and Pi TypeScript uses pnpm.
- Assumptions: live validation already has private `MENOS_API_BASE` and signing credentials. Never inspect, print, or modify them.

## MVP and Deferrals

- **MVP:** every Pi `/yt` branch uses tested Pi-owned scripts and one approved live ingest/transcript check passes without fallback.
- **Explicit deferrals:** Claude cleanup, a shared SDK, unused administration scripts, and a new status-hint mechanism.

## Risk and Gate Decision

- **Risk level:** medium
- **Blast radius:** local Pi files and at most one Menos record during smoke validation
- **Rollback:** reverse local edits; ask before deleting any newly created failed smoke record
- **Manual approval before action:** only before live ingest
- **Manual validation after action:** required for the visible result
- **Deployment:** not required
- **Reason:** implementation is local, but exact validation signs a network request and may create content.

## Approach Decisions

| Decision | Selected | Rejected |
| --- | --- | --- |
| Ownership | Port command-used clients to `pi/skills/workflow/yt/` | Keep Claude paths: preserves incorrect coupling |
| Claude files | Leave unchanged | Cross-client cleanup: unnecessary for Pi completion |
| Endpoint | Require `MENOS_API_BASE` | Legacy default or new hardcoded private endpoint |
| Status hint | Remove Claude status-file reference | Add unwritten Pi state |
| Live check | One approved video | Batch ingest |

## Project Evidence

- **Owners:** `pi/prompts/yt.md`, `pi/skills/workflow/yt/`, `pi/tests/workflow-prompts.test.ts`
- **References:** `claude/commands/yt/`, `claude/commands/yt-local/`, `onclave/services/menos/menos/routers/`
- **Focused validation:** uv pytest/Ruff and `cd pi && pnpm test workflow-prompts.test.ts`
- **Repository validation:** `make check`
- **Credentials/external systems:** existing private Menos endpoint and signing key, used only for smoke validation
- **Evidence:** bounded non-secret summaries in this plan's checklist and Execution Status

## Automation Plan

| Operation | Command/boundary | Credentials | Evidence |
| --- | --- | --- | --- |
| Preflight | verify owner/reference files plus `uv` and `pnpm` | none | Execution Status |
| Port clients | edit `pi/skills/workflow/yt/**` | none | T1 |
| Cut prompt | edit prompt and one contract test | none | T2 |
| Validate | focused checks, then `make check` | none | V1 |
| Smoke | `/yt` then `/yt transcript` for one video | existing private config/key | T3/V2 |
| Roll back | reverse local edits; separately approve remote deletion | key only if deletion approved | Execution Status |

## Task Breakdown

| ID | Deliverable | Files | Depends on | Capability | Verification |
| --- | --- | --- | --- | --- | --- |
| T1 | Pi-owned clients and tests | `pi/skills/workflow/yt/**` | none | Python/uv | focused pytest and Ruff |
| T2 | Prompt uses only Pi scripts | prompt plus contract test | T1 | Pi/Vitest | focused Vitest and path scan |
| V1 | Automated completion gate | repository | T2 | repo validation | focused checks and `make check` |
| T3 | Approved live ingest | no source files | V1 | network/signing | exact `/yt` command |
| V2 | Persisted transcript check | no source files | T3 | Menos read | exact `/yt transcript` command |

## Execution Waves

### Wave 1: Local Migration

**T1: Port clients and tests**

- Files: `pi/skills/workflow/yt/**`
- Mutation boundary: that directory only.
- Work: port `ingest_video.py`, `job_utils.py`, `list_videos.py`, `search.py`, `find_content.py`, `get_content.py`, local transcript/metadata fetchers, relevant tests, `pyproject.toml`, and `uv.lock`; reconcile existing Pi config/signing/channel files.
- Acceptance: scripts use only Pi siblings or declared dependencies; output/signing/fallback/cache behavior is preserved; missing `MENOS_API_BASE` fails explicitly; tests use synthetic environment, key, network, and home fixtures.
- Verify: `uv run --project pi/skills/workflow/yt --frozen pytest pi/skills/workflow/yt/tests -q && uv run ruff check pi/skills/workflow/yt`
- Pass: exits 0 without live network or protected-file access.
- Fail: repair the failing client/test only; do not start T2.
- Evidence: test count and Ruff result in T1 checklist item.

**T2: Cut over the Pi prompt**

- Files: `pi/prompts/yt.md`, `pi/tests/workflow-prompts.test.ts`
- Depends on: T1
- Mutation boundary: those two files only.
- Work: replace Claude paths with the Pi uv project, remove the Claude status hint, preserve `$ARGUMENTS` and fallback rules, and test that no `.claude` path remains and every referenced script exists.
- Verify: `cd pi && pnpm test workflow-prompts.test.ts`
- Pass: exits 0 and the prompt references only existing Pi scripts.
- Fail: repair only the prompt/path contract.
- Evidence: Vitest result and path-scan result in T2 checklist item.

### Wave 1 Validation Gate

**V1: Automated validation**

- Depends on: T1, T2
- Run:
  - `uv run --project pi/skills/workflow/yt --frozen pytest pi/skills/workflow/yt/tests -q`
  - `uv run ruff check pi/skills/workflow/yt`
  - `cd pi && pnpm test workflow-prompts.test.ts`
  - `rg -n '~/.claude|192\.168\.16\.241|DEFAULT_API_BASE' pi/prompts/yt.md pi/skills/workflow/yt`
  - `make check`
- Pass: tests/lint/check exit 0; scan has no matches.
- Fail: do not run live smoke; repair the owning local boundary and rerun V1.
- Evidence: command summaries in V1 checklist item.

### Wave 2: Live Smoke

**T3: Approved ingest**

- Depends on: V1
- Capability: reloaded interactive Pi, network, existing endpoint and signing key.
- Mutation boundary: one video/content record.
- Work: ask for approval, then run `/yt https://www.youtube.com/watch?v=AQl5Q-0l7FQ`.
- Pass: Pi-owned scripts return title, content ID, and job ID/existing-content result without fallback.
- Fail: stop and report the configuration, signing, connectivity, HTTP, or job boundary. Do not deploy Onclave or use Claude scripts.
- Evidence: identifiers and outcome only; no endpoint, signatures, or response body.

### Wave 2 Validation Gate

**V2: Transcript retrieval**

- Depends on: T3
- Run: `/yt transcript https://www.youtube.com/watch?v=AQl5Q-0l7FQ`
- Pass: non-empty transcript for the same content ID through Pi-owned scripts.
- Fail: do not archive; report the API/client boundary and ask before deleting a newly created failed smoke record.
- Evidence: content ID and non-empty/result status only; do not store transcript text.

## Dependency Graph

```text
T1 -> T2 -> V1 -> T3 -> V2 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Validation Contract

### Task and wave checks

Run each owning check once. A failed gate blocks dependents. Never substitute Claude scripts for a failing Pi entrypoint.

### Exact workflow validation

- Entry point: `/yt https://www.youtube.com/watch?v=AQl5Q-0l7FQ`, then `/yt transcript https://www.youtube.com/watch?v=AQl5Q-0l7FQ`.
- Expected: title/content/job output and non-empty transcript through Pi-owned clients.
- Failure: stop at the failing client/API boundary; do not broaden into deployment.
- Evidence: T3/V2 checklist summaries.

### Repository completion validation

- Command: `make check`
- Pass: exits 0.
- Fail: do not archive; record failure and next repair in Execution Status.

### Manual validation

- Required: yes, for live ingest only.
- Action/signal/rollback/evidence: approve one video; require success without fallback; ask separately before deleting a new failed smoke record.

### Deployment validation

- Required: no. Service unavailability blocks completion.

## Evidence Contract

Record concise command results in checklist items and Execution Status. Never record endpoints, signatures, credentials, private configuration, or transcript contents.

## Execution Checklist

### Wave 1

- [ ] T1: Pi clients/tests ported -- Status: pending; Evidence: --
- [ ] T2: Pi prompt cut over -- Status: pending; Evidence: --
- [ ] V1: Automated validation passed -- Status: pending; Evidence: --

### Wave 2

- [ ] T3: Approved ingest passed -- Status: pending; Evidence: --
- [ ] V2: Transcript retrieval passed -- Status: pending; Evidence: --

### Final Gates

- [ ] F1: All task/wave checks passed -- Status: pending; Evidence: --
- [ ] F2: Exact workflow passed -- Status: pending; Evidence: --
- [ ] F3: `make check` passed -- Status: pending; Evidence: --
- [ ] F4: Manual approval completed; deployment N/A -- Status: pending; Evidence: --
- [ ] F5: Evidence is non-secret and archive-ready -- Status: pending; Evidence: --

## Success Criteria

1. `rg -n '~/.claude' pi/prompts/yt.md pi/skills/workflow/yt` has no matches.
2. Focused uv and Vitest checks pass.
3. Legacy endpoint scan has no matches and missing endpoint configuration fails explicitly in tests.
4. Approved ingest and transcript retrieval pass without fallback.
5. `make check` exits 0.

## Archive Rule

Archive to `.specs/archive/pi-yt-onclave-consumer-migration/plan.md` only when T1-V2 and F1-F5 pass and Execution Status has no blocker.

## Execution Status

- **State:** planned, not started
- **Current blocker:** none for local work; live smoke needs existing private configuration and approval
- **Last completed wave/gate:** none
- **Next ready wave/gate:** T1
- **Completed work:** planning only
- **Commands/results:** read-only evidence confirmed current paths, API ownership, and validation entrypoints
- **Remaining checks:** all checklist items
- **Exact user action:** approve T3 when requested
- **Resume:** `/do-it .specs/pi-yt-onclave-consumer-migration/plan.md`
