---
created: 2026-07-27
status: draft
completed:
---

# Plan: menos discovery by hostname convention, plus decided cleanups

## Context & Motivation

A client must be configured with `MENOS_API_BASE` before it can reach menos. The
goal is for it to derive that URL instead.

An earlier revision of this plan specified a DNS SRV record and the tooling to
publish it. A seven-reviewer adversarial panel on 2026-07-27 rejected that
approach and it was withdrawn. The decisive finding, independently verified:
**the A record for `menos.<domain>` already exists** in the private
`values/dns-records.local.json`, and `menos_server_name` is already the deployed
convention, served by Caddy on 443. Every SRV-specific capability was unused,
since the design fixed port 443 with a single instance and hardcoded priority
and weight to zero.

Removing SRV removed roughly two thirds of the confirmed defects, including a
live-mutation hazard where declaring the record would have caused the next
routine `just apply` to push it with no DNS-specific review gate.

The full review is at `review-1/synthesis.md`. The governing PRDs are in the
onclave submodule at `docs/PRDS/2026-07-26-menos-service-discovery-PRD.md` and
`docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.

Two client-side details that a naive implementation gets wrong, both verified:

1. **The API base includes a path.** `.env.example:18` documents `.../api/v1`,
   and `list_videos.py:68-70` signs `/api/v1/content` while requesting
   `{api_base}/content`. A base without `/api/v1` fails RFC 9421 signature
   verification on every call.
2. **An explicit `:443` also breaks signing.** `signing.py:62` signs
   `@authority` from `urlparse(base).netloc`, giving `host:443`, while httpx
   strips the default port and sends `Host: host`. Verified empirically.

Alongside the client change, several decided cleanups have no blockers and are
bundled here.

## Constraints

- Platform: Windows 11, PowerShell primary, Git Bash available
- Python: use `uv run`, not bare `python`. Bare `python` resolves to the system
  interpreter, not the project venv
- ASCII punctuation only. No em dashes. No AI mentions in code or commits
- KISS, Pareto, YAGNI. This plan already had one round of speculative
  generalization removed; do not reintroduce it
- `homelab-infra` is public-safe; `scripts/public-safety-check.py` must pass
- `homelab-infra` has a path-normalization hook that rejects absolute paths in
  edit tools when the working directory is elsewhere. Work from inside the repo
- **No DNS changes.** Nothing in this plan touches `dns-records.local.json` or
  `apply-technitium-dns.py`. There is no DNS-specific dry-run gate in this repo,
  so a DNS change would go live on the next routine `just apply` for any reason
- Do not commit unless explicitly asked

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Hostname convention from a domain variable | Zero infrastructure change, the A record already exists, one small function change | Client hardcodes the `menos.` service-name prefix | **Selected** |
| DNS SRV record | Carries the port; standard mechanism | Requires new record type, service-name validator, four-field idempotency, and a dnspython dependency, for capabilities the design does not use. Also arms a live-mutation hazard | Rejected 2026-07-27 after review |
| UDP broadcast request/response | Truly zero-config | Subnet-bound; fails when the laptop leaves home | Rejected: mobility |
| Leave `MENOS_API_BASE` required | No work at all | Every machine needs a full URL configured by hand | Rejected: this is the problem |

## Objective

A client with no `MENOS_API_BASE` derives the menos URL from a domain variable
and completes a signed API call. Decided cleanups that create active confusion
are resolved.

## Project Context

- **Language**: Python and Markdown
- **Test commands**:
  - menos client: `cd tools/menos-youtube && uv run pytest` (verified working;
    20 tests currently pass; `tests/test_api_config.py` already exists)
  - `.dotfiles`: `make check`. Note it does **not** run `tools/menos-youtube`
    tests, so those must be run explicitly
  - `homelab-infra`: `just validate`
  - `onclave`: `just check`
- **Lint**: `make lint-python` from `.dotfiles` root does cover
  `tools/menos-youtube` (not excluded in root `pyproject.toml`)

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Derive the menos URL by convention | 4 | feature | sonnet | builder | - |
| T2 | Fix onclave catalog and secret-contract drift | 2 | mechanical | haiku | builder-light | - |
| T3 | Remove stale menos submodule docs from dotfiles | 2 | mechanical | haiku | builder-light | - |
| T4 | Reconcile onramp-vNext docs with decided ownership | 5 | feature | sonnet | builder | - |
| T5 | Stop backup-archive growth in the private values repo | 2 | mechanical | haiku | builder-light | - |
| V1 | Validate wave 1 | - | validation | sonnet | validator-heavy | T1, T2, T3, T4, T5 |

## Execution Waves

### Pre-flight

Record the current HEAD of each repository so the validation gate can prove
nothing was committed. `git status --short` cannot do this: a clean tree after a
commit is indistinguishable from no commit at all.

```bash
for r in /c/Users/mglenn/.dotfiles /c/Users/mglenn/.dotfiles/onclave \
         /c/Projects/Personal/homelab-infra /c/Projects/Personal/onramp-vNext; do
  echo "$r $(git -C "$r" rev-parse HEAD)"
done
git -C /c/Projects/Personal/homelab-infra/values rev-parse HEAD
```

Capture a dirty-file baseline for `onramp-vNext`, which has 43 uncommitted
changes unrelated to this work:

```bash
git -C /c/Projects/Personal/onramp-vNext status --short > /tmp/vnext-baseline.txt
```

### Wave 1 (parallel)

**T1: Derive the menos URL by convention** [sonnet] - builder

- Description: When `MENOS_API_BASE` is unset, build the URL from a domain
  variable and the deployed hostname convention.
- Files:
  - `.dotfiles/tools/menos-youtube/api_config.py`
  - `.dotfiles/tools/menos-youtube/tests/test_api_config.py` (exists; extend it)
  - `.dotfiles/.env.example`
  - `.dotfiles/CLAUDE.md`
- Implementation notes:
  - `get_api_base()` at lines 37-45 loads `~/.dotfiles/.env`, reads
    `MENOS_API_BASE`, and raises when empty. Insert the convention path before
    the raise.
  - Resolution order: `MENOS_API_BASE` wins; otherwise
    `https://menos.{MENOS_DISCOVERY_DOMAIN}/api/v1`; otherwise raise.
  - **Append `/api/v1`.** Omitting it produces a signature mismatch that
    presents as an auth failure, not a configuration failure.
  - **Do not include a port.** An explicit `:443` produces a signed
    `@authority` of `host:443` while httpx transmits `Host: host`. Same failure
    class, different cause.
  - The error must name both `MENOS_API_BASE` and `MENOS_DISCOVERY_DOMAIN`. The
    current message at lines 42-44 names only the first.
  - No new dependency. Do not add `dnspython`; there is no DNS query here.
  - Tests go in the existing `tests/test_api_config.py`.
- Acceptance Criteria:
  1. [ ] `MENOS_API_BASE` keeps precedence.
     - Verify: `cd /c/Users/mglenn/.dotfiles/tools/menos-youtube && MENOS_API_BASE=https://wrong.example/api/v1 uv run python -c "import api_config; print(api_config.get_api_base())"`
     - Pass: prints `https://wrong.example/api/v1`
     - Fail: any other value means ordering broke in `get_api_base()`
  2. [ ] The derived URL has the path and no port.
     - Verify: `cd /c/Users/mglenn/.dotfiles/tools/menos-youtube && uv run pytest tests/test_api_config.py -q`
     - Pass: all tests pass, including a new case asserting that with
       `MENOS_DISCOVERY_DOMAIN=example.internal` and no `MENOS_API_BASE` the
       result is exactly `https://menos.example.internal/api/v1`
     - Fail: a trailing `:443` or a missing `/api/v1` both fail here; both are
       silent in production until a signed request is rejected
  3. [ ] With neither variable set, the error names both.
     - Verify: new test in `tests/test_api_config.py` asserting the raised
       message contains both variable names
     - Fail: extend the message at lines 42-44
  4. [ ] Nothing regressed and lint is clean.
     - Verify: `cd /c/Users/mglenn/.dotfiles/tools/menos-youtube && uv run pytest -q` then `cd /c/Users/mglenn/.dotfiles && make lint-python`
     - Pass: all tests pass (20 passed before this change), ruff exits 0

**T2: Fix onclave catalog and secret-contract drift** [haiku] - builder-light

- Description: Two stale SurrealDB references. menos uses PostgreSQL.
- Files:
  - `onclave/infra/services.json`
  - `onclave/scripts/onclave-bws-env.py`
- Implementation notes:
  - `infra/services.json` declares menos `stateOrder` beginning with
    `surrealdb`. The real services, from `deploy/app/menos/compose.yaml`, are
    `postgres`, `minio`, `ollama`, `searxng`, `docling-serve`, `menos-api`.
  - `onclave-bws-env.py` `STACKS` (around lines 32-60) still requires
    `SURREALDB_PASSWORD` and carries SurrealDB defaults, while
    `deploy/app/menos/env-contract.md:18-31` requires `POSTGRES_PASSWORD`. The
    env contract is authoritative.
  - Do not add a compose cross-check to `service-catalog.py`. Separate change.
- Acceptance Criteria:
  1. [ ] No SurrealDB references remain.
     - Verify: `cd /c/Users/mglenn/.dotfiles/onclave && grep -ric surrealdb infra/services.json scripts/onclave-bws-env.py`
     - Pass: `0` for both
  2. [ ] The catalog still validates.
     - Verify: `cd /c/Users/mglenn/.dotfiles/onclave && python ./scripts/service-catalog.py list`
     - Pass: lists onclave and menos without error
     - Fail: `service-catalog.py:49-55` requires a non-empty list of unique
       strings for `stateOrder`

**T3: Remove stale menos submodule docs from dotfiles** [haiku] - builder-light

- Description: Both files document a `menos/` submodule that does not exist.
  `.gitmodules` declares only `dotbot` and `onclave`.
- Files:
  - `.dotfiles/AGENTS.md`
  - `.dotfiles/CLAUDE.md`
- Implementation notes:
  - `AGENTS.md:3` lists `menos/` among submodules; `:13` describes `menos/`
    deployment scope.
  - `CLAUDE.md` has a menos section including a `menos/` deployment command and
    SurrealDB in the stack line.
  - The `/yt` tooling paths in `CLAUDE.md` already point at
    `tools/menos-youtube/` and need no change. Only the submodule claims and the
    SurrealDB stack line are stale.
  - T1 also edits `CLAUDE.md`, in a different section. Re-read before writing.
- Acceptance Criteria:
  1. [ ] No claim that `menos/` is a submodule remains.
     - Verify: `cd /c/Users/mglenn/.dotfiles && grep -n menos .gitmodules; grep -n "menos/" AGENTS.md CLAUDE.md`
     - Pass: `.gitmodules` has no menos entry, and any remaining `menos/` match
       refers to `onclave/services/menos` or `tools/menos-youtube`
  2. [ ] No stale SurrealDB stack description remains.
     - Verify: `cd /c/Users/mglenn/.dotfiles && grep -ic surrealdb AGENTS.md CLAUDE.md`
     - Pass: `0`

**T4: Reconcile onramp-vNext docs with decided ownership** [sonnet] - builder

- Description: Five documents assert positions withdrawn by the platform
  architecture PRD. Update them; do not rewrite surrounding content.
- Files:
  - `onramp-vNext/docs/prd/onramp-vnext-mvp-scope.md`
  - `onramp-vNext/docs/prd/onramp-vnext-architecture-decisions.md`
  - `onramp-vNext/docs/prd/onramp-vnext-current-snapshot.md`
  - `onramp-vNext/docs/prd/onramp-personal-paas-redesign-prd.md`
  - `onramp-vNext/docs/prd/onramp-generated-service-secrets-prd.md`
- Implementation notes:
  - **The last two files were missing from an earlier revision of this task and
    caused its own verification to fail.** They carry the same withdrawn claims.
  - **Provisioning withdrawn.** `homelab-infra` owns all Proxmox guest
    provisioning; onramp-vNext targets hosts that already exist. Affected:
    `mvp-scope.md:126` and `:114-116`, `architecture-decisions.md:136,545`,
    `current-snapshot.md:98`, `onramp-personal-paas-redesign-prd.md:56`. No CLI
    command implements this today, so nothing built is discarded.
  - **Infisical demoted.** It is no longer the secret source of truth; Bitwarden
    Secrets Manager is. Affected: `mvp-scope.md:69`, `current-snapshot.md:101`,
    `onramp-personal-paas-redesign-prd.md:62`,
    `onramp-generated-service-secrets-prd.md:331`. Record that reworking `init`,
    which is largely an Infisical bootstrap, is explicitly deferred. Do not
    attempt that rework.
  - Reference the governing PRD by repository and path, not a URL. The onclave
    PRD is on branch `feature/v2-broker-core`, not `main`.
  - This repo has 43 unrelated uncommitted changes. Touch only these five files.
- Acceptance Criteria:
  1. [ ] Proxmox provisioning no longer reads as in-scope anywhere in
     `docs/prd/`.
     - Verify: `cd /c/Projects/Personal/onramp-vNext && grep -rn "provision proxmox\|Proxmox/bare-metal\|Proxmox provisioning supported" docs/prd/`
     - Pass: every remaining match is explicitly marked withdrawn or
       out-of-scope
  2. [ ] Infisical is no longer described as the secret source of truth.
     - Verify: `cd /c/Projects/Personal/onramp-vNext && grep -rn -i "source of truth" docs/prd/ | grep -i infisical`
     - Pass: no match, or every match is marked withdrawn
     - Note: this grep scans the whole directory. Every file it can hit is now
       in this task's scope, which was not true in the previous revision
  3. [ ] Only the five intended files changed.
     - Verify: `cd /c/Projects/Personal/onramp-vNext && git status --short docs/prd/`
     - Pass: exactly the five listed files appear as modified
     - Fail: compare against `/tmp/vnext-baseline.txt` from pre-flight

**T5: Stop backup-archive growth in the private values repo** [haiku] - builder-light

- Description: The private `values/` repo carries roughly 2.42 GiB of backup
  tarballs in git history. Decision: stop the growth, leave the packfile.
  **No history rewrite.**
- Files:
  - `homelab-infra/values/.gitignore` (nested private repo)
  - `homelab-infra/docs/service-state-backup.md`
- Implementation notes:
  - Ignore and untrack **`service-backups/`, `hermes-backups/`, and
    `backups/`**. Verified tracked counts: 66, 2, and 11 respectively.
  - **Do not include `migration-staging/`.** It has zero tracked files and is
    already in `values/.gitignore`. Including it makes `git rm` abort with
    `fatal: pathspec ... did not match any files` and **nothing is untracked at
    all** - verified by dry run.
  - `.gitignore` alone does not untrack. Use
    `git -C values rm -r --cached service-backups hermes-backups backups`.
  - **Do not** use `git filter-branch`, `git filter-repo`, or any history
    rewrite, and do not delete anything from disk.
  - `docs/service-state-backup.md:81` currently tells the operator to commit and
    push `values/` after a backup for off-site storage. Once these directories
    are ignored that instruction silently no-ops. Update that paragraph to state
    the archives are no longer git-tracked and off-site durability needs a
    separate mechanism.
  - This is a nested private repository. Never commit it from the parent.
- Acceptance Criteria:
  1. [ ] Exactly 79 paths were untracked and none remain tracked.
     - Verify: `cd /c/Projects/Personal/homelab-infra && git -C values diff --cached --name-only --diff-filter=D | wc -l; git -C values ls-files service-backups hermes-backups backups | wc -l`
     - Pass: `79` then `0`
     - Fail: `0` staged deletions means `git rm` aborted, most likely because an
       untracked path was included
  2. [ ] Files remain on disk and history is unchanged.
     - Verify: `cd /c/Projects/Personal/homelab-infra && ls values/service-backups | head -3; git -C values count-objects -vH | grep size-pack`
     - Pass: files listed, `size-pack` still roughly 2.42 GiB
     - Fail: a smaller packfile means history was rewritten. Stop and restore
  3. [ ] The backup doc no longer promises git-based off-site storage.
     - Verify: `cd /c/Projects/Personal/homelab-infra && sed -n '75,90p' docs/service-state-backup.md`
     - Pass: the paragraph states these archives are not git-tracked

### Wave 1 - Validation Gate

**V1: Validate wave 1** [sonnet] - validator-heavy

- Blocked by: T1, T2, T3, T4, T5
- Checks:
  1. Run every acceptance criterion for T1 through T5 exactly as written
  2. `cd /c/Users/mglenn/.dotfiles && make check` - passes
  3. `cd /c/Users/mglenn/.dotfiles/tools/menos-youtube && uv run pytest -q` -
     passes. `make check` does not cover this directory
  4. `cd /c/Users/mglenn/.dotfiles/onclave && just check` - passes
  5. `cd /c/Users/mglenn/.dotfiles/onclave && python ./scripts/public-safety.py` -
     passes
  6. `cd /c/Projects/Personal/homelab-infra && just validate` - passes
  7. **Nothing was committed.** Compare each repo's current
     `git rev-parse HEAD` against the pre-flight values, including the nested
     `values/` repo. `git status --short` cannot detect this
  8. `CLAUDE.md` was edited by both T1 and T3; confirm both changes are present
     and neither overwrote the other
- On failure: create a fix task scoped to the failing criterion, re-run it plus
  the repo-wide command for the affected repo

## Dependency Graph

```
Pre-flight: capture HEADs and the onramp-vNext dirty baseline
Wave 1: T1, T2, T3, T4, T5 (parallel) -> V1
Manual: confirm end-to-end discovery (see Validation Contract)
```

## Success Criteria

1. [ ] A client with no `MENOS_API_BASE` completes a signed API call.
   - Verify: see Manual validation
2. [ ] No stale SurrealDB or menos-submodule claims remain.
   - Verify: `cd /c/Users/mglenn/.dotfiles && grep -ric surrealdb AGENTS.md CLAUDE.md onclave/infra/services.json onclave/scripts/onclave-bws-env.py`
   - Pass: `0` for every file
3. [ ] onramp-vNext docs no longer claim Proxmox provisioning or Infisical as
   source of truth.
   - Verify: `cd /c/Projects/Personal/onramp-vNext && grep -rn -i "source of truth" docs/prd/ | grep -i infisical`
   - Pass: no unmarked match
4. [ ] The values repo stopped accumulating archives without losing history.
   - Verify: `cd /c/Projects/Personal/homelab-infra && git -C values ls-files service-backups hermes-backups backups | wc -l`
   - Pass: `0`, with files still on disk
5. [ ] No DNS record or DNS tooling was changed.
   - Verify: `cd /c/Projects/Personal/homelab-infra && git status --short infra/ansible/scripts/ values/dns-records.local.json`
   - Pass: empty output

## Validation Contract

### Required automated validation

1. [ ] Run repo-wide validation for every repo touched.
   - Commands:
     - `cd /c/Users/mglenn/.dotfiles && make check`
     - `cd /c/Users/mglenn/.dotfiles/tools/menos-youtube && uv run pytest -q`
     - `cd /c/Users/mglenn/.dotfiles/onclave && just check`
     - `cd /c/Users/mglenn/.dotfiles/onclave && python ./scripts/public-safety.py`
     - `cd /c/Projects/Personal/homelab-infra && just validate`
     - `cd /c/Projects/Personal/homelab-infra && python scripts/public-safety-check.py`
   - Pass: every command exits 0
   - Fail: do not archive; record the failing command in `## Execution Status`

2. [ ] Run task-specific verification from every acceptance criterion.
   - Pass: every criterion passes exactly as written

### Manual validation

- Required: **yes**
- Steps:
  1. Set `MENOS_DISCOVERY_DOMAIN` in `~/.dotfiles/.env`.
  2. Unset `MENOS_API_BASE` in the environment and confirm it is absent from
     **both** `~/.dotfiles/.env` and `~/.dotfiles/.secrets`.
     `api_config.py:15-21` falls back to `.secrets`, so clearing only `.env`
     would pass without exercising the new path.
  3. Run the `/yt` listing command. Expect a successful listing. This exercises
     RFC 9421 signing, so a wrong path or a stray port fails here.

If manual validation is not confirmed passed, classify as
`implemented-awaiting-manual-validation`, update `## Execution Status`, and do
not archive.

### Deployment validation

- Required: **no.** This plan makes no infrastructure change. No `just apply`,
  no DNS record, no live mutation.

### Archive rule

Archive only after all automated validation, task-specific verification, and
manual validation pass.

## Handoff Notes

**Commit the values change promptly.** T5 leaves a staged `git rm --cached` in
the nested `values/` repo under the do-not-commit rule. A later
`git reset --hard`, `git stash`, or `git clean` inside that repo would silently
revert it. No data loss, but the work would be undone without warning.

**Repo states at planning time.** `.dotfiles` had 7 uncommitted changes,
`onramp-vNext` had 43 unrelated ones, `homelab-infra` and `onclave` were clean.
Capture fresh baselines at pre-flight rather than trusting these.

**Deliberately excluded, with reasons:**

- Any DNS record or DNS tooling change. The A record already exists, and there
  is no DNS-specific review gate, so a record change would go live on the next
  routine `just apply` for any unrelated reason.
- DNS SRV. Withdrawn 2026-07-27; the research is preserved in the child PRD in
  case a service ever needs a non-default port or weighted instances.
- App workload eviction from `homelab-infra`. Blocked on `onramp-vNext` being
  able to receive workloads.
- The catalog `secrets:` and image-digest fields, and pin automation in
  `update.py`. Blocked on the catalog schema stabilizing.
- Telemetry transport. Open question; the onclave `inform` option was proposed
  and withdrawn because menos and RabbitMQ share a host.
- Porting the roughly 280 Traefik-labeled services in `onramp` to Caddy.
- Tailscale and tailnet configuration.
- `onclave/infra/ansible/files/onclave/docker-compose.yml` appears dead, since
  the active playbook copies the canonical definition at
  `playbooks/deploy.yml:166-170`. Confirm before removing.

**Sequencing gotchas:**

- `homelab-infra`'s path-normalization hook blocks absolute paths in edit tools
  from an outside working directory. Work from inside that repo.
- `onclave` is a submodule of `.dotfiles`. Never force-push it, never amend an
  already-pushed submodule commit, and pull inside it before updating the parent
  pin.
- A second, stale onclave checkout exists at `C:\Projects\Personal\onclave` on
  the same branch. Do not edit onclave there.
- The private `values/` repo is a plain nested repo, not a submodule, and is
  gitignored by the parent. It must never be committed from the parent.
- T1 and T3 both edit `.dotfiles/CLAUDE.md` in different sections. Re-read
  before writing if they run in parallel.
