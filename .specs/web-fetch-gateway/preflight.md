# Web-fetch gateway preflight

Date: 2026-09-06. Scope: disposable experiments and read-only deployment-path
inspection, not gateway implementation or production rollout. See `plan.md` for
task status and authority. This file moves with the plan when it is archived.
Raw scripts/results referenced below were removed during the requested cleanup;
these are historical findings, not instructions to rerun experiments.

## Completed checks

### Workstation curl recovery

On Windows, a local HTTP fixture was fetched using native `curl.exe`, Bash `curl`,
and PowerShell `curl.exe`. All preserved the literal query string and produced
HTML that the existing Readability/Turndown dependencies could extract. A 404
returned curl exit 22; a 200 ms timeout returned exit 28 after approximately 239 ms.
No raw shell HTML was delivered to Pi as a tool result.

The first fixture assertion failed because Markdown escaped underscores in a
marker. The assertion was corrected to compare the decoded marker; that was a
fixture problem, not evidence of a curl transport failure. The server also checked
the received query rather than assuming shell argument handling was correct.

This was launched from the default Pi session, but it was a standalone process
fixture: no implemented Pi circuit breaker, live tool fallback, or Luna review was
tested. Prefer native argument-array execution; extra shells are not necessary.

### Linux Node/SQLite/extraction compatibility

Node `v24.20.0` imported built-in SQLite, performed a database write/read, and loaded
the locked current Readability/JSDOM/Turndown dependencies in a disposable container.
The same container performed direct/Jina retrieval and extraction probes.

Tested Node reference:

```text
docker.io/library/node@sha256:6642ef280aebc09c4541bee0b15c9f89f0f3f3c247ddee79ae1d37eddfdcbbaa
```

Image creation: 2026-08-27T17:03:39Z. This is a compatibility observation, not a
published gateway image or complete application build.

### Direct/Jina and second-solver observations

| Page | Direct / current Jina baseline | simple-cloudflare-solver |
| --- | --- | --- |
| `https://example.com/` | Useful short content, approximately 0.59 / 0.44 seconds | Same useful content, approximately 5.3 seconds |
| `https://quotes.toscrape.com/js/` | Direct shell; Jina returned an incomplete cached snapshot | Rendered quote content including the expected author, approximately 5.9 seconds |
| `https://nowsecure.nl` | Already accessible directly; not a demonstrated challenge case from this egress | Same short content, approximately 8.3–8.9 seconds across three samples |
| `https://www.scrapingcourse.com/cloudflare-challenge` | Direct 403; Jina HTTP 200 containing a challenge | Three HTTP-200 API responses containing target 403 verification pages, approximately 18.9–19.3 seconds; not successful content |

The initial short-page marker expected a title that the diagnostic extractor kept
separate from the body. The actual body was useful. The challenge heuristic also
missed the wording "Performing security verification" in the second solver's
output; the recorded target status and body make the failed acquisition clear.
Retain meaningful target status and negative content fixtures, not just HTTP 200,
text length, or one keyword regex.

The tested second-solver image's source accepts but does not use `request.maxTimeout`
or input cookies. Its browser path worked in the image despite concerns from the
current upstream Dockerfile. No source patch or new solver deployment was made.

```text
ghcr.io/nlevee/simple-cloudflare-solver@sha256:c4b93aa71d22ea2e1b5acd74c7a64993c9c7ef049f91d868fdc26a0e771108f9
```

Image creation: 2025-06-11T11:08:25Z. Browser lifecycle/timeout shortcomings remain;
one useful JavaScript result alone does not justify another deployed service.

## Trawl: tier correction and follow-up

The plan's initial `skipHttp: true, maxTier: 2` setting was wrong for an uncached
request. The tested image returned `Max tier reached without success` with empty
timings. No browser navigation occurred, so those responses prove neither solving
failure nor safe cancellation/network isolation.

Upstream orchestrator inspection explains the result: tier 2 reuses a cached
session; tier 3 performs a fresh browser request and can use the server's own egress
when no proxy is configured. Tier 3 is not inherently a paid/proxy requirement.
The corrected bounded trial uses `skipHttp: true, maxTier: 3`, no Redis or proxies,
and the same image. Existing direct/Jina baselines are not repeated.

```text
ghcr.io/germondai/trawl@sha256:9cf6668dc5e7160d739991ca1edfe308c48638696571d9413a18399696586698
```

Image creation: 2026-09-04T01:27:47Z. **This image does not yet meet the normal
168-hour deployment hold.** Under the existing policy it becomes age-eligible on
2026-09-11T01:27:47Z. A research trial is not an exception for production; do not
silently extend SearXNG's separately approved 24-hour exception to Trawl.

### Corrected tier-3 results

- Static example: useful content in 4.25 seconds.
- Public JavaScript example: useful quote content on all three attempts, in
  3.54 / 14.05 / 4.90 seconds. This adds coverage over the tested direct/current
  Jina responses. The slow middle sample included browser acquisition delay.
- Cloudflare example: first request hit the 25-second client timeout; the next two
  returned the site's explicit successful-challenge page in 17.65 / 17.69 seconds.
  This is two useful outcomes out of three, not a general CAPTCHA guarantee.
- `nowsecure.nl`: browser request hit the 25-second client timeout despite useful
  direct output. Browser rendering is not universally better or faster.
- Isolated JS fixture: rendered the expected marker and executed its private
  subrequest. Direct access and a redirect also returned the private fixture bytes.
  **The raw API did not enforce the proposed public-only network boundary.** No
  real private service or metadata endpoint was queried; these were owned fixtures.
- The private fixture omitted a content type, so Trawl reported octet-stream and
  populated its raw-body field instead of HTML. An HTML-only diagnostic extractor
  showed zero characters; byte-level marker verification established that the
  request did reach the fixture. Empty extracted text is not proof of network denial.
- A requested 1,000 ms server timeout took 3.33 seconds to return. The browser slot
  was available afterward, and the following JS request succeeded.
- After a 250 ms client abort, Trawl still reported its browser busy. The following
  JS request took 8.06 seconds, including about 5.4 seconds before its 2.63-second
  browser attempt. The slot was available afterward. **Client cancellation is not
  backend cancellation, and `maxTimeout` is not a strict end-to-end deadline.**
- Active-browser cgroup peak was 1,134,112,768 bytes (about 1.06 GiB), substantially
  above the initial approximately 312 MiB startup/idle peak. The trial used a 2 GiB
  limit and one browser. One browser restart was observed across the trial; no
  claim that every deadline failure caused it is made.
- The image's `timings` objects included HTML, raw response bytes, cookies, and
  headers, not merely timing metadata. Gateway receipts must whitelist intended
  metadata fields instead of forwarding these objects or logging them verbatim.

**Disposition:** Prefer Trawl alone as the browser candidate; the second solver
showed no unique useful coverage in this corpus and retains deadline shortcomings.
Start sequential rather than enabling hedging on these findings. Before production
browser exposure, settle and verify container-scoped egress isolation and bounded
browser cleanup/lease accounting. The existing APIs alone do not establish them.
No additional solver search or broad benchmark is justified by these results.

## Deployment-path inspection

- The infrastructure repository has no checked-in image build/publish workflow.
  The existing private values workflow also has no container build/push steps.
  `tools/Dockerfile` packages controller tooling, not this new application.
- Both `pp` launchers inherit environment but have no BWS/gateway credential
  integration. No existing scoped gateway credential delivery path was found.
- The installed BWS CLI supports `run` with project-wide injection; its help does
  not expose per-secret filtering. `bws secret get <SECRET_ID>` does support one
  record. A scoped environment bootstrap can use that capability, but none is wired
  into Pi yet. Do not inject the entire infrastructure secret project into Pi merely
  to obtain one gateway token.
- Existing BWS snapshot/runtime tooling is available for infrastructure. No BWS
  record was created, changed, or copied into the plan during inspection.

Before production implementation, select a concrete image publication mechanism
and a scoped, single-token environment bootstrap (or another explicitly selected
access design). These are missing implementation seams, not evidence that registry
or credential functionality already exists. Do not invent credentials or quietly
change the existing launchers.

## Evidence and cleanup

Private/raw evidence is under module `.tmp/`:

- `web-fetch-preflight-results.jsonl` — initial runtime/direct/Jina/second-solver trial.
- `web-fetch-preflight-tier3-results.jsonl` — corrected Trawl trial (contains raw
  upstream payloads, including possible cookies; do not publish or print wholesale).
- `web-fetch-preflight-tier3-summary.json` — selected metadata without payload fields.
- `web-fetch-curl-probe-results.jsonl` — workstation transport fixture.
- Matching scripts/logs record the experiment; these are not production service code.

Both trials removed their owned pods/containers and verified that both existing
SearXNG containers retained their image and start timestamp, with no trial-container
leftovers. Downloaded candidate images remain cached. No production service or BWS
configuration changed, and no gateway or client breaker was implemented.
