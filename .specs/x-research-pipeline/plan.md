---
created: 2026-04-30
status: draft
completed:
---

# Plan: X.com research + graph-network pipeline (twscrape + Webshare + menos)

## Context & Motivation

Goal: give Claude Code and `pi` programmatic access to X.com (Twitter) so they can pull tweets, profiles, and follow-graphs to build "expert-on-topic" knowledge networks (e.g. AI-coding influencers) for deep research.

Research findings from the conversation that triggered this plan:

- The official X API is no longer viable for graph-scale work. As of Feb 2026 X killed Free/Basic/Pro signup tiers; new devs only get Pay-Per-Use ($0.005/read, capped at 2M reads/mo) or Enterprise ($42k+/mo). Graph crawling is read-heavy and blows past the cap fast.
- Paid REST alternatives (SocialData.tools at $0.20/1k tweets, Apify Tweet Scraper V2 at $0.40/1k) work but live in a gray zone -- providers can be taken down.
- OSS scrapers exist and are actively maintained: `vladkens/twscrape` is the de facto standard (account pool, internal GraphQL API, async Python, has the exact endpoints needed for graph crawling: `followers`, `following`, `user_tweets`, `tweet_replies`, `retweeters`, `search`). `d60/twikit` is similar but more single-account focused. Both require burner X accounts.
- User has a Webshare proxy subscription. Critical anti-ban requirement: each X account must be pinned to ONE proxy IP/sticky-session, NOT rotated randomly (X flags "one account, many IPs" harder than "one IP, many accounts"). Webshare supports this via static residential lists or sticky-session usernames (`username-session-<id>`).
- menos (the existing self-hosted content vault submodule, FastAPI + SurrealDB + Ollama) is the right home for the graph data. Content items + annotations already exist; users become content items, follows/mentions/replies become edges.
- Both Claude (via MCP) and `pi` (direct Python) need to share one backend so we don't fork the integration. A small FastAPI service in front of twscrape with a stable REST contract is the cleanest seam.

Decisions locked in by the conversation:
- **Primary scraper:** twscrape. Fallback abstraction so SocialData.tools or official Pay-Per-Use can drop in later.
- **Proxy strategy:** Webshare residential, sticky session per account.
- **Storage:** menos (no new database).
- **Surface:** one HTTP service consumed by an MCP server (for Claude) and a Python client (for `pi`).
- **Secrets:** Infisical (separate companion plan: `.specs/infisical-secrets/plan.md`). This plan assumes Infisical is reachable; if it's not deployed yet, run that plan first.

## Constraints

- Platform: Windows 11 primary dev, Linux (Docker host `192.168.16.241` per CLAUDE.md) for the always-on service.
- Shell: bash (Git Bash/WSL) and PowerShell both must work for any dev-side scripts.
- Python: `uv`-managed in the `pi/` workspace; menos is Python 3.12+.
- No AI mentions in code/comments. ASCII punctuation only (no em/en-dashes).
- KISS: do NOT build a new database layer; reuse menos. Do NOT add a queue (Redis/RQ) until twscrape's built-in pool stops being enough.
- Provider abstraction is required from day one (the OSS scraping ecosystem is volatile).
- Webshare credentials, X burner-account credentials, and any fallback-API keys MUST come from Infisical at runtime, never from `.env` files in the repo.
- Each X account must be pinned to one Webshare sticky session for its lifetime.
- Account-pool ops are part of scope: a health-check / suspension-detection script is required, not optional.
- Out of scope for this plan: posting tweets, DMs, write actions of any kind. Read-only.
- Out of scope: full UI for browsing the graph. Querying via menos's existing API + ad-hoc SurrealDB queries is enough for v1.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Official X Pay-Per-Use API + X's own MCP | Sanctioned, stable, won't disappear, xAI credit rebate | $0.005/read kills graph crawling economically; 2M-read cap; profile lookups $0.01 each | Rejected as primary; kept as a fallback provider for high-trust low-volume calls |
| SocialData.tools REST + community MCP | Cheapest paid option ($0.20/1k), clean REST, webhook monitoring | Gray-zone provider, reportedly taken down once in 2025, recurring bill | Rejected as primary; kept as fallback provider in the abstraction |
| Apify Tweet Scraper V2 (actor) | No-code-friendly, managed proxies, scheduling included | 2x SocialData price, opaque combined billing, depends on actor maintainer | Rejected -- worse $/tweet than SocialData with no compensating advantage |
| Self-hosted Nitter fork | Free, private | Designed for HTML browsing not graph APIs; same account-pool burden as twscrape with worse ergonomics | Rejected -- wrong tool for graph work |
| Playwright + GraphQL interception (DIY) | Total control, free of third-party APIs | Months of scraper-infra maintenance (CAPTCHA, query-ID drift, residential proxies) | Rejected -- maintenance burden far exceeds twscrape's |
| **twscrape + Webshare residential + menos storage** | **Free code, exact endpoints needed, active 2026 maintenance, per-account proxy binding supported, fits existing infra** | **Burner-account suspensions are routine ops cost; X-side changes can break it** | **Selected** |

## Objective

When complete:

1. A FastAPI service `x-research` runs on the menos Docker host, exposing read-only endpoints for tweets, users, followers, following, search, and replies, backed by twscrape with a Webshare-bound account pool.
2. The service writes harvested users/tweets/edges into menos as content items + annotations, so the existing semantic-search and graph queries see the data.
3. Claude can call the service through a small MCP server (`claude/mcp-servers/x-research/`).
4. `pi` can call the service through a thin Python client module (`pi/x_research/`).
5. All credentials (X burner accounts, Webshare proxy, fallback API keys) are pulled from Infisical at service startup and on rotation.
6. An `accounts health` CLI exists that probes every X account, flags suspensions, and prints what to rotate.
7. A documented seed-and-crawl recipe ("find AI-coding experts") runs end-to-end and produces a queryable graph in menos.

## Project Context

- **Language**: Python 3.12+ (FastAPI service, pi client, MCP server in TS or Python depending on existing convention -- detect during T1).
- **Test command**: `uv run pytest` inside each Python package; menos has its own `pytest` config under `menos/api/`.
- **Lint command**: `uv run ruff check` (Python). `biome check` if any TS lands in the MCP server.
- **Docker host**: `192.168.16.241` (user `anvil`), deployed via `menos/infra/ansible/`.
- **Existing dependencies the plan reuses**: menos FastAPI + SurrealDB + content-item/annotation schema; ed25519 HTTP-signature auth (`~/.claude/commands/yt/signing.py` pattern).
- **New runtime dependency**: Infisical (covered by companion plan).

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Provider-abstraction design + interface stub | 3-5 | feature | sonnet | builder | -- |
| T2 | Research menos schema additions for users/tweets/edges (no code) | 0 | research | haiku | Explore | -- |
| V1 | Validate wave 1 (interface + schema design) | -- | validation | haiku | validator | T1, T2 |
| T3 | twscrape backend implementation with Webshare per-account binding | 4-6 | feature | sonnet | builder | V1 |
| T4 | menos schema migration + persistence layer (users, tweets, edges) | 4-6 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 (backend + persistence) | -- | validation | sonnet | validator-heavy | T3, T4 |
| T5 | FastAPI service `x-research` exposing read-only endpoints | 5-8 | feature | sonnet | builder | V2 |
| T6 | Account-pool health-check CLI + suspension detection | 2-3 | feature | haiku | builder-light | V2 |
| V3 | Validate wave 3 (service + ops tooling) | -- | validation | sonnet | validator-heavy | T5, T6 |
| T7 | Claude MCP server (`claude/mcp-servers/x-research/`) | 3-5 | feature | sonnet | builder | V3 |
| T8 | `pi/x_research/` Python client module | 2-3 | feature | haiku | builder-light | V3 |
| T9 | Ansible deploy role + service hookup on Docker host | 4-6 | feature | sonnet | builder | V3 |
| V4 | Validate wave 4 (consumers + deployment) | -- | validation | sonnet | validator-heavy | T7, T8, T9 |
| T10 | End-to-end seed crawl: 10 AI-coding seed accounts -> 1-hop graph in menos | 1-2 | feature | sonnet | builder | V4 |
| V5 | Validate end-to-end success criteria | -- | validation | sonnet | validator-heavy | T10 |

## Execution Waves

### Wave 1 (parallel)

**T1: Provider-abstraction design + interface stub** [sonnet] -- builder
- Description: Define the `XClient` Python protocol covering the read-only endpoint surface (search, tweet_details, tweet_replies, user_by_handle, user_tweets, followers, following, retweeters). Stub three implementations: `TwscrapeBackend` (TODO body), `SocialDataBackend` (TODO body), `OfficialApiBackend` (TODO body). Include a `BackendFactory` that selects from config. Async-first. Include typed return models (pydantic) for User, Tweet, Edge.
- Files: `pi/x_research/__init__.py`, `pi/x_research/protocol.py`, `pi/x_research/models.py`, `pi/x_research/backends/__init__.py` (+ stub backends).
- Acceptance Criteria:
  1. [ ] `uv run python -c "from pi.x_research.protocol import XClient; print(XClient)"` resolves.
     - Verify: command above
     - Pass: prints the protocol class
     - Fail: ImportError -- check package layout, `__init__.py`, and `pyproject.toml` membership
  2. [ ] All three backend stubs raise `NotImplementedError` from every interface method
     - Verify: `uv run pytest pi/x_research/tests/test_protocol_stubs.py`
     - Pass: tests pass
     - Fail: stubs missing methods -- align signatures to protocol
  3. [ ] Pydantic models round-trip via `model_dump()`/`model_validate()`
     - Verify: `uv run pytest pi/x_research/tests/test_models.py`
     - Pass: green
     - Fail: missing fields -- compare to twscrape's User/Tweet shape

**T2: Research menos schema additions for users/tweets/edges** [haiku] -- Explore
- Description: Read `menos/.claude/CLAUDE.md`, `menos/api/` schema files, and existing content-item/annotation code. Produce a written design note (NOT code) at `.specs/x-research-pipeline/menos-schema-notes.md` describing: (a) whether to model X users as content items or as a new table; (b) how follows/mentions/replies map onto annotations or a new edge table; (c) which existing migrations to extend; (d) embedding strategy for tweet text via Ollama.
- Files: `.specs/x-research-pipeline/menos-schema-notes.md` only.
- Acceptance Criteria:
  1. [ ] Notes file exists with sections "User modeling", "Edge modeling", "Tweet content", "Migration plan", "Open questions"
     - Verify: `test -f .specs/x-research-pipeline/menos-schema-notes.md && grep -c '^## ' .specs/x-research-pipeline/menos-schema-notes.md`
     - Pass: count >= 5
     - Fail: re-run agent with stricter outline requirement
  2. [ ] Each design choice cites a specific menos file/line
     - Verify: `grep -E 'menos/.+:[0-9]+' .specs/x-research-pipeline/menos-schema-notes.md | wc -l`
     - Pass: >= 3 citations
     - Fail: agent didn't ground in real code; rerun

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [haiku] -- validator
- Blocked by: T1, T2
- Checks:
  1. Run all T1 acceptance criteria.
  2. Confirm T2 design note exists and references real menos paths.
  3. `uv run ruff check pi/x_research/` -- no warnings.
  4. Cross-task: `XClient` model fields are compatible with the schema choices in T2's notes (manual cross-read).
- On failure: file a fix task in the same wave; re-validate.

### Wave 2 (parallel)

**T3: twscrape backend with Webshare per-account binding** [sonnet] -- builder
- Blocked by: V1
- Description: Implement `TwscrapeBackend` against the protocol from T1. On startup, load X accounts from Infisical (path: `/x-research/accounts`); each account record contains `handle`, `password`, `email`, `email_password`, `webshare_session_id`. Build the proxy URL as `http://<webshare_user>-session-<webshare_session_id>:<webshare_pass>@<webshare_host>:<port>` from Infisical-loaded Webshare creds. Call `pool.add_account(..., proxy=...)` once per account. Implement every protocol method by delegating to twscrape and mapping results to the pydantic models. Add retry-with-backoff on rate limits. Include a `health_check(handle)` method.
- Files: `pi/x_research/backends/twscrape_backend.py`, `pi/x_research/config.py` (Infisical loader), `pi/x_research/tests/test_twscrape_backend.py` (with mocked twscrape).
- Acceptance Criteria:
  1. [ ] All `XClient` protocol methods are implemented (no `NotImplementedError`)
     - Verify: `uv run pytest pi/x_research/tests/test_twscrape_backend.py -k protocol_completeness`
     - Pass: green
     - Fail: list missing methods
  2. [ ] Account loading reads from Infisical and never from local files
     - Verify: `grep -E "open\(|\.env|os\.environ\[" pi/x_research/backends/twscrape_backend.py pi/x_research/config.py`
     - Pass: zero direct file/env reads for credentials
     - Fail: replace with Infisical SDK call
  3. [ ] Proxy URL construction produces the documented sticky-session format
     - Verify: `uv run pytest pi/x_research/tests/test_twscrape_backend.py -k proxy_url_format`
     - Pass: green; URL contains `-session-<id>` segment
     - Fail: align with Webshare username modifier docs
  4. [ ] Rate-limit retry backs off and surfaces a typed exception after N attempts
     - Verify: `uv run pytest pi/x_research/tests/test_twscrape_backend.py -k rate_limit_retry`
     - Pass: green

**T4: menos schema migration + persistence layer** [sonnet] -- builder
- Blocked by: V1
- Description: Implement what T2 designed. Add a migration in `menos/api/migrations/` that introduces user / tweet / edge representations (whether as content-item subclasses or new tables, per T2's decision). Add a Python module `menos/api/x_research/persistence.py` that takes the pydantic models from T1 and upserts them into menos. Idempotent: re-running on the same input must not duplicate edges. Include a small SQL/SurrealQL helper for "neighbors of handle X within depth N".
- Files: `menos/api/migrations/<n>_x_research.surql` (or whatever menos's migration extension is), `menos/api/x_research/persistence.py`, `menos/api/x_research/queries.py`, `menos/api/tests/test_x_research_persistence.py`.
- Acceptance Criteria:
  1. [ ] Migration applies cleanly on a fresh menos test DB
     - Verify: menos's existing migration test command (detect under `menos/api/`)
     - Pass: green
     - Fail: align with menos migration conventions in `menos/.claude/CLAUDE.md`
  2. [ ] Upserting the same User/Tweet/Edge twice produces no duplicates
     - Verify: `uv run pytest menos/api/tests/test_x_research_persistence.py -k idempotent`
     - Pass: green
  3. [ ] Neighbor query returns expected handles for a synthetic 3-node graph
     - Verify: `uv run pytest menos/api/tests/test_x_research_persistence.py -k neighbors`
     - Pass: green

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T3, T4
- Checks:
  1. Run all T3 and T4 acceptance criteria.
  2. `uv run ruff check pi/x_research/ menos/api/x_research/` -- clean.
  3. `uv run pytest pi/x_research/ menos/api/x_research/` -- all green.
  4. Cross-task integration: a unit test wires `TwscrapeBackend` (mocked) -> persistence layer -> neighbor query and confirms data flows. Add this test as part of the validation if missing.
  5. Confirm no credential strings appear in test fixtures or code (grep for `webshare`, `password=`, `proxy=http`).
- On failure: file a fix task; re-validate.

### Wave 3 (parallel)

**T5: FastAPI service `x-research`** [sonnet] -- builder
- Blocked by: V2
- Description: Build a FastAPI app exposing read-only endpoints matching the `XClient` protocol: `/users/{handle}`, `/users/{handle}/tweets`, `/users/{handle}/followers`, `/users/{handle}/following`, `/tweets/{id}`, `/tweets/{id}/replies`, `/search?q=...`. Each endpoint calls the twscrape backend AND persists results into menos in the same request. Auth: HTTP signatures (ed25519, reuse the menos pattern). Health endpoint: `/health` returns service git SHA + per-account health summary. Pin pydantic / FastAPI versions in a dedicated `services/x-research/pyproject.toml`.
- Files: `services/x-research/pyproject.toml`, `services/x-research/app/main.py`, `services/x-research/app/routes.py`, `services/x-research/app/auth.py`, `services/x-research/Dockerfile`, `services/x-research/tests/test_routes.py`.
- Acceptance Criteria:
  1. [ ] All documented endpoints respond 200 against a mocked backend
     - Verify: `uv run pytest services/x-research/tests/test_routes.py`
     - Pass: green
  2. [ ] Unsigned requests get 401
     - Verify: `uv run pytest services/x-research/tests/test_routes.py -k auth`
     - Pass: green
  3. [ ] `/health` returns the running git SHA
     - Verify: `uv run pytest services/x-research/tests/test_routes.py -k health`
     - Pass: green
  4. [ ] `docker build services/x-research` succeeds
     - Verify: `docker build -t x-research:test services/x-research`
     - Pass: image builds
     - Fail: inspect Dockerfile vs. menos's Dockerfile pattern

**T6: Account-pool health-check CLI** [haiku] -- builder-light
- Blocked by: V2
- Description: A `pi x-research accounts health` subcommand (or stand-alone CLI under `pi/x_research/cli.py`) that loops every account in the pool, calls `health_check()`, and prints a table: handle, status (active/limited/suspended/login-failed), last-success timestamp, proxy session ID. Exit non-zero if any account is suspended.
- Files: `pi/x_research/cli.py`, registration in `pi/`'s existing CLI entrypoint, `pi/x_research/tests/test_cli_health.py`.
- Acceptance Criteria:
  1. [ ] CLI runs against a mocked pool with mixed statuses
     - Verify: `uv run pytest pi/x_research/tests/test_cli_health.py`
     - Pass: green; output contains all four status strings
  2. [ ] Exit code is non-zero when any account is suspended
     - Verify: `uv run pytest pi/x_research/tests/test_cli_health.py -k exit_code`
     - Pass: green

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [sonnet] -- validator-heavy
- Blocked by: T5, T6
- Checks:
  1. Run all T5 and T6 acceptance criteria.
  2. `uv run ruff check services/x-research/ pi/x_research/cli.py` -- clean.
  3. Spin up the FastAPI service locally with a mocked backend; hit `/health`; confirm `200` and JSON shape.
  4. Confirm no creds in image: `docker run --rm x-research:test env | grep -iE 'pass|secret|token'` returns empty.
- On failure: file fix task; re-validate.

### Wave 4 (parallel)

**T7: Claude MCP server** [sonnet] -- builder
- Blocked by: V3
- Description: Implement an MCP server at `claude/mcp-servers/x-research/` that calls the FastAPI service. Tools: `x_search`, `x_user`, `x_user_tweets`, `x_followers`, `x_following`, `x_tweet`, `x_tweet_replies`. The MCP server signs requests with the user's ed25519 key. Add an entry under `claude/settings.json` (do not modify yet -- just document in the README so the user wires it after deploy).
- Files: pick TS or Python to match existing MCP convention in this repo (T7's first action is to detect this); `claude/mcp-servers/x-research/{src,package.json or pyproject.toml,README.md}`, `claude/mcp-servers/x-research/tests/`.
- Acceptance Criteria:
  1. [ ] MCP server lists all 7 tools
     - Verify: language-appropriate test runner
     - Pass: 7 tools enumerated
  2. [ ] Each tool round-trips against the FastAPI service running locally
     - Verify: integration test with the service spun up
     - Pass: green
  3. [ ] README documents the exact `settings.json` block to add

**T8: `pi/x_research/` client module** [haiku] -- builder-light
- Blocked by: V3
- Description: A thin async HTTP client mirroring the `XClient` protocol but talking to the FastAPI service over HTTP (signed requests). Importable from `pi` so other pi commands can do graph queries.
- Files: `pi/x_research/client.py`, `pi/x_research/tests/test_client.py`.
- Acceptance Criteria:
  1. [ ] Client implements every `XClient` method
     - Verify: `uv run pytest pi/x_research/tests/test_client.py -k protocol_completeness`
     - Pass: green
  2. [ ] Signature header is present on every request
     - Verify: `uv run pytest pi/x_research/tests/test_client.py -k signing`
     - Pass: green

**T9: Ansible deploy role + service hookup** [sonnet] -- builder
- Blocked by: V3
- Description: Add an Ansible role `menos/infra/ansible/roles/x_research/` that deploys the FastAPI service container to `192.168.16.241`, wires it into the existing docker compose, exposes `/health` to menos's health monitor, and pulls the Infisical service token from the Ansible vault (NOT from the repo). Verify post-deploy by hitting `/health` and confirming the running git SHA matches the deployed branch.
- Files: `menos/infra/ansible/roles/x_research/**`, updates to `menos/infra/ansible/playbooks/deploy.yml`, `menos/infra/ansible/inventory/hosts.yml` if needed.
- Acceptance Criteria:
  1. [ ] Playbook runs in `--check --diff` mode without errors against the live host
     - Verify: `cd menos/infra/ansible && docker compose run --rm ansible ansible-playbook -i inventory/hosts.yml playbooks/deploy.yml --check --diff`
     - Pass: zero failures, only expected diffs
  2. [ ] Real deploy succeeds and `/health` returns the deployed SHA
     - Verify: `curl -fsS https://<host>/x-research/health | jq .git_sha` (or signed equivalent)
     - Pass: SHA matches `git rev-parse HEAD`

### Wave 4 -- Validation Gate

**V4: Validate wave 4** [sonnet] -- validator-heavy
- Blocked by: T7, T8, T9
- Checks:
  1. Run all T7, T8, T9 acceptance criteria.
  2. End-to-end smoke: from Claude, call the MCP `x_user` tool against a known public account; confirm response.
  3. End-to-end smoke: from `pi`, call `pi x-research user <handle>`; confirm response.
  4. Confirm Infisical service token is NOT in the deployed image or repo: `docker exec x-research env | grep -i infisical_token` should be empty (token is mounted as a runtime secret, not env-baked).
- On failure: file fix task; re-validate.

### Wave 5

**T10: End-to-end seed crawl** [sonnet] -- builder
- Blocked by: V4
- Description: Author a small driver script (`scripts/x_research_seed_crawl.py`) that takes a curated list of 10 AI-coding seed handles, pulls their profiles, recent 200 tweets each, and 1-hop following lists, persists everything into menos, and prints a summary: nodes added, edges added, tweets stored, tokens used, accounts touched. Document the seed list in `.specs/x-research-pipeline/seed-list-ai-coding.md`.
- Files: `scripts/x_research_seed_crawl.py`, `.specs/x-research-pipeline/seed-list-ai-coding.md`.
- Acceptance Criteria:
  1. [ ] Script completes for the 10 seed handles
     - Verify: `uv run python scripts/x_research_seed_crawl.py --seed-file .specs/x-research-pipeline/seed-list-ai-coding.md`
     - Pass: exit 0; summary printed
     - Fail: capture which account failed and why; rotate or fix
  2. [ ] menos contains >= 10 user nodes and >= 100 edges after the run
     - Verify: a SurrealQL count query (documented in T4)
     - Pass: thresholds met
  3. [ ] No account in the pool got suspended during the run
     - Verify: `pi x-research accounts health`
     - Pass: all active

### Wave 5 -- Validation Gate

**V5: Validate end-to-end** [sonnet] -- validator-heavy
- Blocked by: T10
- Checks:
  1. Run all T10 acceptance criteria.
  2. From Claude, ask: "Who are the top 5 AI-coding experts in our graph by 1-hop follower overlap with our seeds?" -- the MCP tool chain must be able to answer using only menos data.
  3. Confirm the run is reproducible: re-run the seed-crawl script; idempotency holds (no duplicate edges).

## Dependency Graph

```
Wave 1:  T1, T2 (parallel) -> V1
Wave 2:  T3, T4 (parallel) -> V2
Wave 3:  T5, T6 (parallel) -> V3
Wave 4:  T7, T8, T9 (parallel) -> V4
Wave 5:  T10 -> V5
```

## Success Criteria

1. [ ] Claude can answer expert-discovery questions about AI coding using only the deployed pipeline (no live web search)
   - Verify: ask the question above in a Claude session with the MCP server enabled
   - Pass: structured answer cites menos-stored handles and edges
2. [ ] `pi x-research user <handle>` and `pi x-research accounts health` both work end-to-end against the deployed service
   - Verify: run both
   - Pass: exit 0, structured output
3. [ ] No credential of any kind exists in the repo (X accounts, Webshare, fallback API keys)
   - Verify: `grep -rIE 'webshare|x_account|socialdata' --include='*.py' --include='*.yaml' --include='*.json' . | grep -iE 'pass|secret|token|key' | grep -v -E '(test|fixture|mock)'`
   - Pass: zero matches
4. [ ] The seed-crawl script is reproducible and idempotent
   - Verify: run it twice, diff edge count
   - Pass: second run adds zero edges

## Handoff Notes

- Companion plan `.specs/infisical-secrets/plan.md` MUST be executed first (or in parallel through its own V-gate) so T3 has a working Infisical to read from. If Infisical is delayed, T3 can stub a `LocalEnvLoader` for dev only -- but the deploy in T9 must reject `LocalEnvLoader` in production mode.
- Existing `.specs/serapis-env-vault/` is a parallel design for a custom secret vault. The Infisical plan deliberately picks the off-the-shelf path; if the user later wants Serapis, the secrets-loader interface T3 builds is the swap point.
- Burner X accounts are a recurring ops cost. Plan to maintain at least 5 active accounts; expect ~30% attrition month-over-month based on community reports.
- Webshare residential proxies are billed by bandwidth, not request count. Tweet detail pages can be 50-200 KB each. Set Webshare bandwidth alerts before T10's full crawl.
- The "is this still working" risk for twscrape is real -- X's frontend changes can break query IDs. Subscribe to the twscrape repo for updates and pin a known-good version in `pyproject.toml` rather than tracking `main`.
- Read-only by design. Do not extend to write actions without an explicit follow-up plan with security review.
