# Web tools

The default profile owns `extensions/web-tools/`, independently of legacy.
Run `pnpm install --ignore-workspace --frozen-lockfile` in that directory when setting up another
workstation, then `/reload` in Pi. Extraction dependencies are local to this
extension; no legacy imports or global `~/.env` loading are used.

- `web_search`: SearXNG titles, URLs, snippets, and dates. Supports `query`,
  `exact_phrases`, `exclude_terms`, `site`, `num_results` (1-20; default 5),
  and optional `engines` (SearXNG engine names). Uses `SEARXNG_URL` from the
  process environment, otherwise `https://searxng.ilude.com/search`.
  Inherits the server's general-search defaults (Google + Brave on the managed
  endpoint), replacing the temporary DuckDuckGo-only workaround. Engine choice
  belongs to the service, not the client. An `engines` query parameter already present in
  `SEARXNG_URL` is preserved; the tool's `engines` argument overrides it. Pass
  `engines: []` to use the server defaults or, for example, `["github"]` for
  repository searches. There are no automatic engine retries or failover loops.
  Backend failures are shown alongside partial results; zero results with engine
  failures raises an error rather than claiming there were no matches.
- `web_fetch`: HTTP(S) to readable Markdown, with direct handling for plain
  text, Markdown, CSV, JSON, and XML. Supports `url` and `max_chars` (1-50000;
  default 8000), plus optional `backend`: `auto`, `direct`, `trawl`, or `jina`.
  Explicit selection never silently substitutes another backend. Short readable
  pages and redirected sources are preserved. Acquisition has a shared 60-second
  budget; Luna retains its separate 15-second review deadline.

Automatic Jina Reader fallback remains enabled for public URLs after direct
extraction fails. This sends the original URL, including its query string, to
`r.jina.ai`. Private/local URLs remain directly accessible and are not sent to
Jina. Metadata checks also cover IPv4-mapped IPv6. Local Node fetching remains
an inherited check-before-fetch path, not a complete DNS-pinning boundary. There are no domain allowlists or
approval prompts. Search requests time out after 10 seconds. Pi cancellation
propagates into requests, extraction, and review; process failures are errors.

Returned source content is bounded to 45000 bytes/1800 lines before review;
fetch also applies its character limit. Truncation is marked. Full fetched
pages are not saved to disk. Refine the query, choose a narrower page, or
increase `max_chars` to obtain more relevant content.

## Adaptive gateway and outage recovery

The default profile uses `https://fetch.ilude.com` and lazily reads the exact
`WEB_FETCH_GATEWAY_CLIENT` record from BWS on the first public fetch. The existing
`BITWARDEN_ACCESS_KEY` environment setting and `uv` provide access; the bearer token
stays in Pi process memory and is cached for the session. No separate launcher,
project-wide export or persistent credential file is used. Explicit
`WEB_FETCH_GATEWAY_URL` and `WEB_FETCH_GATEWAY_TOKEN` values override these defaults.

If BWS or the gateway is unavailable, automatic mode reports local recovery.
Explicit Trawl/Jina requests fail clearly. The deployed direct and Trawl paths were
verified through default Pi without gateway environment overrides.

Public requests can use the gateway's direct, Trawl-browser, and Jina routes.
Private/local requests bypass it. Receipts retain source URL, backend, quality,
timing and attempt outcomes. Raw backend cookies/headers/debug payloads are not
forwarded. Partial content is labeled rather than presented as a complete article.

For `auto`, the first gateway availability failure immediately permits local
recovery. Three consecutive failures open an extension-local circuit for 30 seconds;
then one request probes while concurrent requests use local recovery. Site errors,
authentication errors and user cancellation do not count as service outages. State
resets on reload or endpoint/credential change. Explicit backend selection remains
strict and never silently recovers through another backend.

Local recovery uses Node first. A Node transport failure can try native `curl.exe`
on Windows or `curl` elsewhere, without a PowerShell/Bash wrapper or shell URL
interpolation. HTTP/extraction failures do not trigger a duplicate curl fetch.
Curl is optional, keeps TLS verification, pins validated addresses, handles redirects
through the same checks, and enforces body/time bounds. Public Jina fallback remains
available afterward. All recovery shares the remaining acquisition budget and
feeds the same extractor and one final Luna review. It does not repair a missing
Node runtime or broken Pi loader.

## Basic prompt-injection screening

Before source content enters the conversation, a separate, tool-free
`openai-codex/gpt-5.6-luna` call at low reasoning checks the bounded content.
Empty search results need no review; tool-generated query headers are excluded
from review input. It gets only a fixed review prompt and the source content, not conversation
history, filesystem tools, or credential contents. Normal provider
authentication still uses the active profile. Content therefore goes to the
configured Luna provider even when fetched from a private/local URL.

The review returns a structured verdict with up to three exact suspicious
excerpts. It looks for attempts to control the consuming assistant, not general
subject-matter safety. Ordinary documentation and quoted attack examples are
not inherently injections. The tool preserves source text and adds a screening
annotation; it never automatically redacts, refuses, or asks for approval.
Reviewer prose is not passed through as instructions. Nested usage is returned
to Pi for accounting.

Review has a 15-second deadline. An unavailable model, timeout, or malformed
verdict produces an explicit "Not screened" annotation and the original
content. User cancellation is different: it cancels the tool instead of
returning content. No fallback reviewer or retry loop is added.

This is best-effort defense, not a security boundary: Luna can miss attacks or
be influenced by them, and flagged source text still enters the main context.
Detection quality needs further research and evaluation against realistic
attacks and benign documentation. This initial port does not claim measured
injection resistance.

## Validation

Use the existing pnpm/Vitest tooling without installing another test stack:

```bash
cd pi/profiles/default
pnpm test web-tools
pnpm exec tsc -p tests/tsconfig.web-tools.json
```

The focused suite covers screening annotations, timeout/failure behavior,
cancellation, gateway circuit states and transport deadlines, strict/private routing,
receipt handling, and actual Node/curl subprocess extraction against local HTTP
fixtures. Linux gateway package checks run in its owning infrastructure repository. Set `PI_WEB_LIVE=1` for an additional real SearXNG/Luna smoke test
(network and configured profile authentication required; consumes model usage).
The live tests cover ordinary, exact-phrase, site-restricted, and official-documentation
queries, fetch a relevant returned URL, and check that both outputs receive
Luna screening. A flagged result is still usable and passes the transport check. An initial live probe falsely flagged a tool-generated search
header; headers were removed from review input and empty results now bypass
review. This is one integration check, not a detection-quality benchmark.
