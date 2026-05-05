---
created: 2026-04-30
status: research-note
source: .specs/x-research-pipeline/
---

# X Research Pipeline

## Core idea

Give Claude Code and Pi programmatic read-only access to X.com data for topic research and expert-network mapping. The target use case is building graph-shaped research corpora, such as AI-coding influencer networks, and storing users, tweets, and edges in [[../projects/menos]].

## Selected architecture

- **Primary scraper**: `vladkens/twscrape`
- **Proxy strategy**: Webshare residential proxies with one sticky session per X account
- **Storage**: menos, reusing content items/annotations or minimal schema extensions
- **Service seam**: one FastAPI `x-research` service
- **Client surfaces**: Claude MCP server and Pi Python client share the same backend
- **Secrets**: Infisical at runtime, never repo `.env` files
- **Scope**: read-only; posting, DMs, and write actions are out of scope

## Why not official X API first

Graph-scale X research is read-heavy and economically hostile through official API tiers. Paid scraping APIs are simpler but depend on gray-zone providers. `twscrape` is operationally riskier but has the needed graph endpoints and can be abstracted behind a provider interface.

## Provider abstraction

Define an async `XClient` protocol with methods for search, tweet details, replies, user lookup, user tweets, followers, following, and retweeters.

Backends can include:

- `TwscrapeBackend`
- `SocialDataBackend`
- `OfficialApiBackend`

The abstraction is important because scraper ecosystems break and provider economics change.

## Account and proxy operations

Each X burner account must be pinned to exactly one Webshare sticky session for its lifetime. Random proxy rotation is riskier because X flags one account appearing from many IPs.

A v1 system needs account-pool operations:

- health check every account
- detect suspended, limited, and login-failed states
- show last successful use
- identify proxy session per account
- exit non-zero when accounts need operator attention

## menos storage model

Harvested data should be visible to existing menos search and graph queries:

- X users become content items or a small dedicated representation.
- Tweets become content items with embedded text.
- Follows, mentions, replies, retweets, and quotes become annotations/edges.
- Upserts must be idempotent.
- Neighbor queries should support depth-limited graph exploration.

## Service and clients

The FastAPI service exposes read-only endpoints for users, tweets, followers/following, replies, and search. Each endpoint fetches from the provider and persists results into menos. Auth should reuse the repo's ed25519 HTTP-signature pattern.

Client surfaces:

- Claude: small MCP server
- Pi: thin Python client module or command wrapper
- Deployment: Ansible/Docker on the menos host

## Safety and policy notes

- Credentials come from Infisical at startup/rotation time.
- No local `.env` secrets in git.
- No write actions against X.
- Test fixtures must avoid real Webshare/account credentials.
- Fallback providers are implementation details behind the same contract.

## KISS recommendation

Prototype the provider protocol, mocked service, and menos persistence before live scraping. Treat account health and proxy binding as first-class v1 requirements, because scraper reliability is mostly operational rather than architectural.
