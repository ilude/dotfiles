---
status: research-note
date: 2026-09-06
source: SearXNG investigation and candidate upstream projects
---

# Web research: search, CAPTCHA, and paywall access

## Why this matters

Search discovery and retrieving a known page are different problems. A working
search engine does not guarantee article access, and a browser solver does not
provide search ranking or subscription rights. Preserve these possible avenues
without turning them into a required pipeline or implementation backlog.

See the [SearXNG investigation](../projects/searxng-search-reliability.md) for what
was actually tested and deployed. The ideas below are **not deployed or proven**
unless explicitly identified there.

## Small reliability improvements to consider

- Keep the four query classes as an opt-in smoke test. Record engine/version,
  result count, relevance, site-filter compliance, errors, and latency. A few
  spaced samples are more informative than rapid retries that trigger limits.
- Detect challenge HTML or JSON shells masquerading as successful empty results.
  Prefer an upstream engine fix or a clear diagnostic over inventing matches.
- If daily builds repeatedly leave the newest image inside the 24-hour hold,
  investigate selecting the newest **eligible** older image. The current updater
  checks the newest matching tag and holds it; the exception does not yet add
  fallback discovery or unattended deployments.
- After upgrades, inspect merged server engine defaults: upstream can introduce
  a newly enabled general engine. Keep selection server-owned and explicit
  alternatives usable rather than hardcoding a client fallback list.
- Benchmark a small search-result cache or an official search API only if
  recurring failures justify it. Compare cost, privacy, coverage, and latency
  against the now-working direct Google + Brave baseline.
- Evaluate Luna on labeled benign documentation, quoted attacks, and real
  injection attempts. Transport smoke tests do not measure detection accuracy.
  Preserve annotation-only/fail-open behavior; do not turn research into gates.

## CAPTCHA and browser candidates

| Candidate | Why investigate | Evidence / next discriminating test |
| --- | --- | --- |
| [Trawl](https://github.com/germondai/trawl) | HTTP/HTTPS forward proxy plus browser/API paths and reported challenge handling | Default proxy trial did not visibly escalate DDG challenges. Test a forced scraping path, inspect returned tier/timings, and distinguish HTTP-tier success from a browser solve |
| [Byparr](https://github.com/ThePhaseless/Byparr) | Alternative anti-bot browser/cookie service | Verify current API/client compatibility on one failing public page; not deployed or live-tested here |
| [simple-cloudflare-solver](https://github.com/nlevee/simple-cloudflare-solver) | Smaller Cloudflare-focused API candidate | Check maintenance, supported challenge type, and actual page retrieval rather than just obtaining a cookie |
| [CloudProxy](https://github.com/NoahCardoza/CloudProxy) | Historical browser-backed proxy reference | Inspect maintenance and modern compatibility before investing in a trial |
| [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) | Existing historical acquisition implementation to learn from | Reuse findings, not the old stack wholesale; see the [historical note](flaresolverr-content-acquisition.md) |
| [Browser harness](../projects/browser-use-browser-harness.md) | Thin CDP/session route for pages that actually need a browser | Compare a single isolated browser fetch with the HTTP/Jina result; avoid importing the operator's entire browser profile |

Trawl's current documentation exposes `/scrape`, FlareSolverr-compatible `/v1`,
MCP tools, and `MITM_ALWAYS_SCRAPE`. The latter skips the proxy's direct probe;
it is **not proof that a browser tier ran**. A follow-up should record the tier,
challenge type, final source, result validity, and repeatability. Its broad
“bypasses any CAPTCHA” wording is a project claim, not our finding.

For a bounded trial, distinguish Cloudflare interstitials/Turnstile from DDG's
own image challenge, JavaScript execution requirements, IP reputation, cookie
binding, and TLS/browser fingerprints. Clearance cookies may be bound to IP,
user agent, or connection fingerprint and fail when replayed through another
client. Test browser retrieval and cookie handoff separately.

Webshare did not help the tested standalone requests. Do not assume more proxy
rotation fixes parser breakage or undetected challenges. If a browser first
proves useful, only then compare direct and proxy egress with the same query,
image, and session strategy. No paid solver or residential route was deployed.

Keep any solver listener private. For HTTPS interception, trust its CA only in
the disposable client, retain system roots, and verify `SSL_CERT_FILE`
precedence. Do not disable TLS verification or install a broad workstation CA
for a narrow experiment. Never log proxy credentials or reusable cookies.

## Paywall / reader-access avenues

No general paywall-bypass feature was implemented or demonstrated. Classify the
failure first; a subscription wall and a CAPTCHA require different treatment.

- **Extraction-only failure / soft presentation wall:** compare original HTML,
  embedded article metadata, Readability, an isolated rendered browser, and the
  existing public-URL Jina fallback. Determine whether the article was actually
  delivered or only an abstract/teaser. Reader extraction cannot recover text
  that the server never sent.
- **Alternate public source:** check publisher canonical/print/reader views,
  author reposts, preprints, institutional repositories, RSS, and publisher
  share/gift links. For papers, investigate DOI-based open-access discovery such
  as [Unpaywall](https://unpaywall.org/). Verify completeness and version rather
  than treating a similarly titled page as equivalent.
- **Archive route:** evaluate an existing public archive capture when appropriate,
  keeping archive URL, canonical URL, capture date, and missing sections visible.
  Archive challenge handling is separate from the publisher's subscription
  mechanism; do not silently substitute stale or incomplete text.
- **Authorized subscriber route:** test a deliberately scoped, user-authorized
  browser session or export when a subscription/institutional entitlement exists.
  Keep session cookies out of logs and do not forward private session material
  or subscriber URLs to public relay services by default.
- **Server-enforced access wall:** if only the teaser is delivered and no
  authorized/public copy is available, report that limit. Do not describe
  search snippets or a generated summary as the full retrieved article.

For all routes, distinguish technical accessibility from permission to access,
store, or redistribute the source. Apply the source's access/copyright constraints
without adding blanket tool approval prompts or new domain policies.

## Possible Pi fit

The smallest optional retrieval receipt would retain requested/final URL,
fetcher, timestamp, title, truncation, and a concrete failure reason. Preserve
canonical-versus-archive provenance. A small explicit browser fallback is easier
to evaluate than mandatory browser/proxy infrastructure for every request.

Keep existing local/private direct access and automatic public Jina fallback.
Private page content already reaches the configured Luna provider for review;
that should remain documented, not mistaken for local-only screening.

## Risks / reasons not to build yet

Browser containers cost startup time, memory, upkeep, and session management.
Retries and extra proxy tiers can worsen rate limits and obscure the original
failure. Paid services add cost and external disclosure. The direct search fix
already works for the tested queries, and no repeated page-specific need has
yet justified a new always-on solver.

## Related notes

- [SearXNG search reliability](../projects/searxng-search-reliability.md)
- [Historical FlareSolverr content acquisition](flaresolverr-content-acquisition.md)
- [Browser-use browser harness](../projects/browser-use-browser-harness.md)
- [X research pipeline](x-research-pipeline.md)

## KISS recommendation

On the next concrete failure, capture one reproducible URL/query and identify
which layer failed. Try the cheapest relevant alternative, validate actual
content, and keep only an improvement that repeats. No daemon, proxy fleet,
solver subscription, or generalized acquisition platform is proposed now.
