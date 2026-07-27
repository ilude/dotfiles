---
created: 2026-07-27
status: draft
completed:
---

# Plan: menos service discovery via DNS SRV, plus decided cleanups

## Context & Motivation

A Pi instance must be configured with `MENOS_API_BASE` before it can reach
menos. The goal is for it to find menos without being told where it is.

The original idea was a UDP broadcast where the client asks and menos answers.
That was rejected: broadcast is subnet-bound by construction and the client runs
on a laptop that leaves the subnet. DNS was chosen instead, and web research
confirmed it works with the existing setup.

Two PRDs were written and committed as `dcfe63c` in the onclave submodule:

- `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md` (parent)
- `onclave/docs/PRDS/2026-07-26-menos-service-discovery-PRD.md` (child)

Key findings from that work that this plan depends on:

1. **Technitium Forwarder zones serve locally declared records.** A request is
   forwarded to the FWD target only when no matching record exists in the zone.
   The repo already proves this by adding A and CNAME records into Forwarder
   zones in production.
2. **Technitium's API supports SRV** via `/api/zones/records/add` with
   `priority`, `weight`, `port`, `target`.
3. **The repo's DNS sync tool does not.** `apply-technitium-dns.py` handles
   `FWD`, `A`, and `CNAME` only.
4. **The API base includes a path.** `MENOS_API_BASE` is documented as
   `https://menos.example.net/api/v1`, and `list_videos.py` signs
   `/api/v1/content` while requesting `{api_base}/content`. A discovered base
   without `/api/v1` resolves fine and then fails RFC 9421 signature
   verification on every call.
5. **The workstation's DNS suffix search list contains two employer domains
   before the homelab domain.** A bare `_menos._tcp` lookup would query an
   internal service name against employer DNS first.

Alongside the discovery work, several decided cleanups have no blockers and are
included here.

## Constraints

- Platform: Windows 11, PowerShell primary, Git Bash available
- Python: use `python`, not `python3`. `uv run` over manual venv activation
- ASCII punctuation only. No em dashes. No AI mentions in code, comments, or
  commits
- KISS, Pareto, YAGNI: ship the smallest thing that delivers the value. No
  speculative generalization, no abstractions with one implementation, no config
  knobs for values that do not vary
- `homelab-infra` is public-safe. `scripts/public-safety-check.py` must pass. No
  private domains, hostnames, or IP addresses in tracked files
- `homelab-infra` has a path-normalization hook that rejects absolute paths in
  edit tools. Work from inside the repo with relative paths
- Live DNS mutation is gated behind the operator's reviewed `just plan` /
  `just apply` workflow. No task in this plan applies to live infrastructure
- Do not commit unless explicitly asked

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| DNS SRV record | Works from any network reachable to the resolver, survives future VLAN segmentation, uses infrastructure already running | Needs the sync tool extended | **Selected** |
| UDP broadcast request/response | Truly zero-config, pattern already present in joyride | Subnet-bound; fails the moment the laptop leaves home; unauthenticated; a new protocol to maintain | Rejected: mobility |
| Hand-place the SRV record in the Technitium UI | Minutes of work, no code | Record exists nowhere in git; will not survive rebuild or review | Rejected: breaks infra-as-code |
| More specific Primary zone for `_menos._tcp.<domain>` | Would sidestep forwarder-zone precedence | Wrong: a Primary zone is authoritative and answers NXDOMAIN instead of falling through. Technitium guidance is one conditional forwarder zone per domain | Rejected: incorrect |
| joyride emits SRV from Docker labels | Generalizes to any service | Requires record lifecycle work (tombstones, reaping on node failure); one static record covers the current need | Deferred, not now |

## Objective

A client with no menos configuration resolves menos via DNS SRV and completes a
signed API call. The record is declared in version control, not placed by hand.
Decided cleanups that create active confusion are resolved.

## Project Context

- **Languages**: Python (`homelab-infra` scripts, menos client), Go
  (`onramp-vNext`, docs only here), Markdown
- **Test commands**:
  - `homelab-infra`: `just validate` (repo-wide; runs source checks, lint,
    tests, and private values wiring)
  - `.dotfiles`: `make check` (lint + test + pi extension checks)
  - `onclave`: `just check` (typecheck + unit tests)
- **Lint commands**: `ruff` for Python via each repo's runner; `shellcheck` for
  shell
- **Existing tests**: `homelab-infra/tests/test_apply_technitium_dns.py` uses
  `unittest` with classes `DnsValidationTests`, `FakeClient`, `DnsApplyTests`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | SRV support in the Technitium DNS sync tool | 3 | feature | sonnet | builder | - |
| T2 | SRV resolution in the menos client | 3 | feature | sonnet | builder | - |
| T3 | Fix onclave catalog and secret-contract drift | 2 | mechanical | haiku | builder-light | - |
| T4 | Remove stale menos submodule docs from dotfiles | 2 | mechanical | haiku | builder-light | - |
| T5 | Reconcile onramp-vNext docs with decided ownership | 3 | feature | sonnet | builder | - |
| T6 | Stop backup-archive growth in the private values repo | 1 | mechanical | haiku | builder-light | - |
| V1 | Validate wave 1 | - | validation | sonnet | validator-heavy | T1, T2, T3, T4, T5, T6 |
| T7 | Declare the menos SRV record and validate end to end | 2 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 | - | validation | sonnet | validator-heavy | T7 |

## Execution Waves

### Wave 1 (parallel)

**T1: SRV support in the Technitium DNS sync tool** [sonnet] - builder

- Description: Extend `apply-technitium-dns.py` to declare and apply SRV
  records, following the existing `A` and `CNAME` patterns exactly. Do not
  refactor the existing record paths.
- Files:
  - `homelab-infra/infra/ansible/scripts/apply-technitium-dns.py`
  - `homelab-infra/tests/test_apply_technitium_dns.py`
  - `homelab-infra/scaffold/dns-records.local.json`
- Implementation notes:
  - `TOP_LEVEL_KEYS` at line 16 is
    `{"settings", "zones", "a_records", "cname_records"}`. Add `"srv_records"`.
  - The required-keys check at line 91 is
    `{"zones", "a_records", "cname_records"} - set(config)`. Decide whether
    `srv_records` is required or optional and be consistent with the scaffold.
    Optional is preferred so existing values files stay valid.
  - **`DNS_NAME_RE` at line 15 rejects underscore labels.** Verified:
    `_menos._tcp.example.internal` fails, `menos.example.internal` passes. SRV
    names require leading underscores per RFC 2782. Add a separate
    `validate_service_name` for the `_service._proto.name` shape. **Do not
    loosen `DNS_NAME_RE`** - it guards A and CNAME records and weakening it
    would reduce validation everywhere.
  - Schema, keyed by fully qualified name to match `a_records`:
    ```json
    "srv_records": {
      "_menos._tcp.example.internal": {
        "priority": 0,
        "weight": 0,
        "port": 443,
        "target": "menos.example.internal"
      }
    }
    ```
  - The four keys map one-to-one onto the Technitium API parameters. No
    translation layer.
  - `record_matches` at line 213 compares a single field. SRV needs all four
    compared, or re-applying will churn records.
  - Reject malformed entries in validation rather than passing them to the API:
    non-integer or out-of-range priority/weight/port, missing target, target
    failing `validate_dns_name`.
- Acceptance Criteria:
  1. [ ] `_menos._tcp.<zone>` passes service-name validation while
     `DNS_NAME_RE` is unchanged.
     - Verify: `cd /c/Projects/Personal/homelab-infra && git diff infra/ansible/scripts/apply-technitium-dns.py | grep -c "DNS_NAME_RE = "`
     - Pass: `0` (the constant's definition is untouched)
     - Fail: non-zero means the shared validator was modified; revert and add a
       separate service-name validator instead
  2. [ ] SRV records parse, validate, and apply idempotently.
     - Verify: `cd /c/Projects/Personal/homelab-infra && python -m unittest tests.test_apply_technitium_dns -v`
     - Pass: all tests pass, including new SRV cases for a valid record, a
       malformed record, and a second apply producing no change
     - Fail: read the assertion; if idempotency fails, `record_matches` is
       likely still comparing one field
  3. [ ] The scaffold carries a public-safe example and stays public-safe.
     - Verify: `cd /c/Projects/Personal/homelab-infra && python scripts/public-safety-check.py`
     - Pass: `Public safety checks passed.`
     - Fail: a private domain or IP leaked into the scaffold; use
       `example.internal` style placeholders

**T2: SRV resolution in the menos client** [sonnet] - builder

- Description: Teach `get_api_base()` to discover menos by SRV when
  `MENOS_API_BASE` is unset, preserving the override and existing behavior.
- Files:
  - `.dotfiles/tools/menos-youtube/api_config.py`
  - `.dotfiles/tools/menos-youtube/pyproject.toml`
  - `.dotfiles/.env.example`
- Implementation notes:
  - Current `get_api_base()` at lines 37-45 loads `~/.dotfiles/.env`, reads
    `MENOS_API_BASE`, and raises when empty. Replace the raise with the SRV
    path; keep the raise as the final fallback.
  - Resolution order: `MENOS_API_BASE` wins; otherwise SRV; otherwise error.
  - **Append `/api/v1` to the discovered base.** `.env.example:18` documents the
    base as including it, and `list_videos.py:68-70` signs `/api/v1/content`
    while requesting `{api_base}/content`. Omitting it produces a signature
    mismatch on every call, which looks like an auth bug rather than a
    discovery bug.
  - **Query the fully qualified name.** Do not rely on the system search
    suffix: the workstation's list puts two employer domains ahead of the
    homelab domain, so a bare lookup leaks an internal service name to employer
    DNS. Read the domain from `MENOS_DISCOVERY_DOMAIN` and document it in
    `.env.example`.
  - Add `dnspython` to `pyproject.toml`. The stdlib cannot do SRV;
    `socket.getaddrinfo` resolves A and AAAA only. Shelling out to
    `nslookup`/`dig` was rejected because output format and availability differ
    across the platforms this repo supports.
  - The error must name both the query attempted and `MENOS_API_BASE`. The
    current message at lines 42-44 names only the variable.
  - Unit tests must mock the resolver. Do not write tests that require live DNS.
- Acceptance Criteria:
  1. [ ] `MENOS_API_BASE` still takes precedence over discovery.
     - Verify: `cd /c/Users/mglenn/.dotfiles/tools/menos-youtube && MENOS_API_BASE=https://wrong.example/api/v1 python -c "import api_config; print(api_config.get_api_base())"`
     - Pass: prints `https://wrong.example/api/v1`
     - Fail: any other value means override precedence broke; check ordering in
       `get_api_base()`
  2. [ ] A discovered base ends with `/api/v1`.
     - Verify: unit test with a mocked SRV answer of
       `0 0 443 menos.example.internal`
     - Pass: result is `https://menos.example.internal:443/api/v1`
     - Fail: a missing suffix will pass DNS and fail signing later; this is the
       single most likely defect in this task
  3. [ ] Discovery failure names the query and the override variable.
     - Verify: unit test with the resolver raising NXDOMAIN
     - Pass: the raised message contains both `_menos._tcp` and
       `MENOS_API_BASE`
     - Fail: extend the message; the old text names only the variable
  4. [ ] Repo checks pass.
     - Verify: `cd /c/Users/mglenn/.dotfiles && make lint-python`
     - Pass: exits 0
     - Fail: read ruff output

**T3: Fix onclave catalog and secret-contract drift** [haiku] - builder-light

- Description: Two stale references to SurrealDB, which menos no longer uses.
- Files:
  - `onclave/infra/services.json`
  - `onclave/scripts/onclave-bws-env.py`
- Implementation notes:
  - `infra/services.json` declares menos `stateOrder` beginning with
    `surrealdb`. The actual services are in `deploy/app/menos/compose.yaml`:
    `postgres`, `minio`, `ollama`, `searxng`, `docling-serve`, `menos-api`.
    Correct the list to match the compose file.
  - `onclave-bws-env.py` `STACKS` (around lines 32-60) still requires
    `SURREALDB_PASSWORD` and carries SurrealDB defaults, while
    `deploy/app/menos/env-contract.md:18-31` requires `POSTGRES_PASSWORD`.
    Reconcile the script to the env contract, which is authoritative.
  - Do not add a compose cross-check to `service-catalog.py` in this task. It is
    a good idea and belongs in its own change.
- Acceptance Criteria:
  1. [ ] No SurrealDB references remain in either file.
     - Verify: `cd /c/Users/mglenn/.dotfiles/onclave && grep -ric surrealdb infra/services.json scripts/onclave-bws-env.py`
     - Pass: `0` for both files
     - Fail: grep shows the remaining occurrence
  2. [ ] The catalog still validates.
     - Verify: `cd /c/Users/mglenn/.dotfiles/onclave && python ./scripts/service-catalog.py list`
     - Pass: lists onclave and menos without error
     - Fail: `stateOrder` shape validation at `service-catalog.py:49-55`
       requires a non-empty list of unique strings

**T4: Remove stale menos submodule docs from dotfiles** [haiku] - builder-light

- Description: Both files document a `menos/` submodule that does not exist.
  `.gitmodules` declares only `dotbot` and `onclave`. menos now lives at
  `onclave/services/menos` and uses PostgreSQL, not SurrealDB.
- Files:
  - `.dotfiles/AGENTS.md`
  - `.dotfiles/CLAUDE.md`
- Implementation notes:
  - `AGENTS.md:3` lists `menos/` among submodules; `:13` describes `menos/`
    deployment scope.
  - `CLAUDE.md` has a menos section around lines 54-79 including a `menos/`
    deployment command and SurrealDB in the stack description.
  - Do not delete the `/yt` command documentation. That tooling is live; it
    moved to `.dotfiles/tools/menos-youtube/`. Update paths rather than removing
    content.
- Acceptance Criteria:
  1. [ ] No claim that `menos/` is a submodule of this repo remains.
     - Verify: `cd /c/Users/mglenn/.dotfiles && grep -n "menos" .gitmodules; grep -nc "menos/" AGENTS.md CLAUDE.md`
     - Pass: `.gitmodules` has no menos entry, and remaining `menos/` matches in
       the docs refer to `onclave/services/menos` or `tools/menos-youtube`
     - Fail: a bare `menos/` submodule reference survives
  2. [ ] No stale SurrealDB stack description remains.
     - Verify: `cd /c/Users/mglenn/.dotfiles && grep -ic surrealdb AGENTS.md CLAUDE.md`
     - Pass: `0`
     - Fail: update the stack line to PostgreSQL, MinIO, Ollama

**T5: Reconcile onramp-vNext docs with decided ownership** [sonnet] - builder

- Description: Three documents still assert positions withdrawn by the platform
  architecture PRD. Update them to match; do not rewrite surrounding content.
- Files:
  - `onramp-vNext/docs/prd/onramp-vnext-mvp-scope.md`
  - `onramp-vNext/docs/prd/onramp-vnext-architecture-decisions.md`
  - `onramp-vNext/docs/prd/onramp-vnext-current-snapshot.md`
- Implementation notes:
  - **Provisioning withdrawn.** `homelab-infra` owns all Proxmox guest
    provisioning; onramp-vNext targets hosts that already exist. Affected:
    `mvp-scope.md:126` (`onramp host provision proxmox` in the MVP command
    surface), `mvp-scope.md:114-116` ("Proxmox/bare-metal bootstrap" in the
    Public MVP milestone), `architecture-decisions.md:136,545` (OnRamp owns
    provisioning for supported providers), `current-snapshot.md:98` (Proxmox
    provisioning described as supported). No CLI command implements this today,
    so nothing built is being discarded.
  - **Infisical demoted.** It is no longer the secret source of truth; Bitwarden
    Secrets Manager is. Affected: `mvp-scope.md:69` (Infisical under "convention
    over configuration"). Record that reworking `init`, which is largely an
    Infisical bootstrap, is explicitly deferred until the stack stabilizes. Do
    not attempt that rework here.
  - Reference the governing PRD by repository and path rather than a URL. The
    onclave PRD is on branch `feature/v2-broker-core`, not `main`, so a GitHub
    `main` link would 404.
- Acceptance Criteria:
  1. [ ] Proxmox provisioning no longer appears as in-scope in any of the three
     documents.
     - Verify: `cd /c/Projects/Personal/onramp-vNext && grep -rn "provision proxmox\|Proxmox/bare-metal" docs/prd/`
     - Pass: remaining matches are explicitly marked as withdrawn or
       out-of-scope
     - Fail: a match still reads as planned scope
  2. [ ] Infisical is no longer described as the secret source of truth.
     - Verify: `cd /c/Projects/Personal/onramp-vNext && grep -rn -i "source of truth" docs/prd/ | grep -i infisical`
     - Pass: no match, or matches marked as withdrawn
     - Fail: update the remaining assertion

**T6: Stop backup-archive growth in the private values repo** [haiku] - builder-light

- Description: The private `values/` repo carries roughly 2.42 GiB of backup
  tarballs in git history across 101 tracked files, largest a 1.1 GB Forgejo
  state archive. Decision taken: stop the growth, leave the existing packfile.
  **No history rewrite.**
- Files:
  - `homelab-infra/values/.gitignore` (nested private repo)
- Implementation notes:
  - Ignore `service-backups/`, `hermes-backups/`, and `migration-staging/`.
  - `.gitignore` alone does not untrack already-tracked files. Use
    `git -C values rm --cached -r <dir>` to untrack while leaving files on disk.
  - **Do not** use `git filter-branch`, `git filter-repo`, or any history
    rewrite. Do not delete the files from disk.
  - This is a nested private repository. Do not commit it from the parent.
- Acceptance Criteria:
  1. [ ] The archive directories are ignored and no longer tracked.
     - Verify: `cd /c/Projects/Personal/homelab-infra && git -C values ls-files service-backups hermes-backups migration-staging | wc -l`
     - Pass: `0`
     - Fail: non-zero means `rm --cached` was not run or missed a path
  2. [ ] The files still exist on disk and history is unchanged.
     - Verify: `cd /c/Projects/Personal/homelab-infra && ls values/service-backups | head -3; git -C values count-objects -vH | grep size-pack`
     - Pass: files listed, and `size-pack` is still roughly 2.42 GiB
     - Fail: a smaller packfile means history was rewritten; stop and restore

### Wave 1 - Validation Gate

**V1: Validate wave 1** [sonnet] - validator-heavy

- Blocked by: T1, T2, T3, T4, T5, T6
- Checks:
  1. Run every acceptance criterion for T1 through T6 exactly as written
  2. `cd /c/Projects/Personal/homelab-infra && just validate` - passes
  3. `cd /c/Users/mglenn/.dotfiles && make check` - passes
  4. `cd /c/Users/mglenn/.dotfiles/onclave && just check` - passes
  5. `cd /c/Users/mglenn/.dotfiles/onclave && python ./scripts/public-safety.py` - passes
  6. Cross-task integration: confirm the `srv_records` schema T1 implemented
     matches what T2's client expects to resolve, specifically that the port and
     target in the schema produce the URL shape T2 builds
  7. Confirm no task committed anything. `git status --short` in all four repos
     should show modifications, not new commits
- On failure: create a fix task scoped to the failing criterion, re-run that
  criterion plus the repo-wide command for the affected repo

### Wave 2

**T7: Declare the menos SRV record and validate end to end** [sonnet] - builder

- Blocked by: V1
- Description: Declare the real SRV record in private values and confirm the
  full path works. Stops short of live mutation.
- Files:
  - `homelab-infra/values/dns-records.local.json` (nested private repo)
  - `.dotfiles/.env` (local, gitignored; for the discovery domain)
- Implementation notes:
  - Add the `srv_records` entry for `_menos._tcp.<domain>` pointing at the menos
    hostname on port 443.
  - Set `MENOS_DISCOVERY_DOMAIN` in the local `.env`.
  - **Do not run `just apply`.** Live DNS mutation goes through the operator's
    reviewed `just plan` then `just apply` workflow and requires explicit
    approval. This task stops at `just validate` and a reviewed `just plan`
    diff.
  - The end-to-end client check is manual and happens after the operator
    applies. See Manual validation below.
- Acceptance Criteria:
  1. [ ] The record declaration validates against the extended tooling.
     - Verify: `cd /c/Projects/Personal/homelab-infra && just validate`
     - Pass: exits 0, including private values wiring checks
     - Fail: read the validation error; a rejected name usually means the
       service-name validator from T1 is not being applied to `srv_records`
  2. [ ] A plan can be produced and shows only the intended DNS addition.
     - Verify: `cd /c/Projects/Personal/homelab-infra && just plan`
     - Pass: the diff contains the SRV record addition and no unrelated
       infrastructure changes
     - Fail: if unrelated changes appear, stop and report rather than applying

### Wave 2 - Validation Gate

**V2: Validate wave 2** [sonnet] - validator-heavy

- Blocked by: T7
- Checks:
  1. Run T7 acceptance criteria as written
  2. `cd /c/Projects/Personal/homelab-infra && just validate` - passes
  3. Confirm `just apply` was NOT run and no live infrastructure was mutated
  4. Confirm the private `values/` repo was not committed or pushed
  5. Report the `just plan` diff verbatim for operator review
- On failure: do not proceed to apply. Report the failure and stop

## Dependency Graph

```
Wave 1: T1, T2, T3, T4, T5, T6 (parallel) -> V1
Wave 2: T7 -> V2
Manual: operator reviews plan, runs just apply, then confirms client discovery
```

## Success Criteria

1. [ ] The DNS sync tool can declare and apply SRV records idempotently, with
   underscore service names accepted and `DNS_NAME_RE` unweakened.
   - Verify: `cd /c/Projects/Personal/homelab-infra && python -m unittest tests.test_apply_technitium_dns -v`
   - Pass: all tests pass
2. [ ] The menos SRV record is declared in version control, not placed by hand.
   - Verify: `cd /c/Projects/Personal/homelab-infra && grep -c srv_records values/dns-records.local.json`
   - Pass: at least `1`
3. [ ] No stale SurrealDB or menos-submodule claims remain across the repos.
   - Verify: `cd /c/Users/mglenn/.dotfiles && grep -ric surrealdb AGENTS.md CLAUDE.md onclave/infra/services.json onclave/scripts/onclave-bws-env.py`
   - Pass: `0` for every file
4. [ ] onramp-vNext docs no longer claim Proxmox provisioning or Infisical as
   source of truth.
   - Verify: `cd /c/Projects/Personal/onramp-vNext && grep -rn "provision proxmox" docs/prd/`
   - Pass: no match reads as planned scope
5. [ ] The private values repo stopped accumulating archives without losing
   history.
   - Verify: `cd /c/Projects/Personal/homelab-infra && git -C values ls-files service-backups | wc -l`
   - Pass: `0`, with files still present on disk

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or
archiving it.

### Required automated validation

1. [ ] Run the strongest repo-wide validation for every repo touched.
   - Commands:
     - `cd /c/Projects/Personal/homelab-infra && just validate`
     - `cd /c/Users/mglenn/.dotfiles && make check`
     - `cd /c/Users/mglenn/.dotfiles/onclave && just check`
     - `cd /c/Users/mglenn/.dotfiles/onclave && python ./scripts/public-safety.py`
     - `cd /c/Projects/Personal/homelab-infra && python scripts/public-safety-check.py`
   - Pass: every command exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command
     and the next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` line
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create a fix task, re-run affected checks, then re-run repo-wide
     validation

### Manual validation

- Required: **yes**
- Steps:
  1. Confirm Technitium serves the record:
     `dig SRV _menos._tcp.<domain> @<technitium-address>`
     Expected: an answer section containing priority, weight, port 443, and the
     menos target.
  2. Operator reviews the `just plan` diff and runs `just apply`. This is
     explicitly the operator's action, not an agent's.
  3. Confirm end-to-end discovery: unset `MENOS_API_BASE` in the environment and
     verify it is absent from **both** `~/.dotfiles/.env` and
     `~/.dotfiles/.secrets`, then run `/yt list`.
     Expected: a successful listing. `api_config.py:15-21` falls back to
     `.secrets` when `.env` is missing, so clearing only `.env` would pass
     without exercising discovery at all.

If manual validation is required and not confirmed passed, `/do-it` must
classify the result as `implemented-awaiting-manual-validation`, update
`## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: **yes**, and it is operator-gated
- Procedure: `just plan`, operator review, explicit approval, then `just apply`
  in `homelab-infra`. No agent runs `just apply`.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not
archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation,
task-specific verification, manual validation, deployment validation, and
repo-wide validation pass.

## Handoff Notes

**Deliberately excluded, and why.** These were discussed and are not blocked on
this plan, but do not belong in it:

- App workload eviction: moving `onclave_onramp`, `menos_onramp`, and
  `searxng_onramp` out of `homelab-infra` and deleting those roles. Blocked on
  `onramp-vNext` being able to receive workloads.
- The catalog `secrets:` and image-digest fields, and automating the hand-
  maintained pins in `update.py`. Blocked on the catalog schema stabilizing.
- Telemetry transport. Open question. One option was proposed and withdrawn:
  onclave `inform` envelopes, weakened because menos and RabbitMQ share a host
  and do not fail independently.
- Porting the roughly 280 Traefik-labeled services in `onramp` to Caddy.
  Deferred until the catalog schema stabilizes.
- joyride emitting SRV from Docker labels, and the record-lifecycle work it
  needs. One static record covers the current need.
- Tailscale and tailnet configuration. The operator runs a separate instance
  outside this work.
- `onclave/infra/ansible/files/onclave/docker-compose.yml` appears dead, since
  the active playbook copies the canonical app definition at
  `playbooks/deploy.yml:166-170`. Confirm before removing; not worth a task yet.

**Sequencing gotchas.**

- `homelab-infra` has a path-normalization hook that blocks absolute paths in
  edit tools when the working directory is elsewhere. Agents must work from
  inside that repo with relative paths.
- `onclave` is a git submodule of `.dotfiles`. Never force-push it, never amend
  an already-pushed submodule commit, and pull inside the submodule before
  updating the parent pin.
- There is a second, stale onclave checkout at `C:\Projects\Personal\onclave`
  on the same branch. It does not have the PRDs. Do not edit onclave there.
- `.dotfiles` currently has roughly 68 uncommitted changes from an unrelated
  in-flight migration of `claude/commands/yt/` to `tools/menos-youtube/`. Do not
  stage or commit them.
- The private `values/` repo is nested inside `homelab-infra` and is a separate
  git repository. It must never be committed from the parent.

**Reference.** The governing PRDs are in the onclave submodule at
`docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md` and
`docs/PRDS/2026-07-26-menos-service-discovery-PRD.md`, committed as `dcfe63c` on
branch `feature/v2-broker-core`. Both carry sources tables with file and line
citations for every factual claim.
