---
status: research-note
date: 2026-09-06
source: local controlled SearXNG experiments and managed rollout
---

# SearXNG search reliability

## Why this matters

Empty Pi search responses were mostly a backend investigation problem, not a
reason to immediately add proxies or browsers. Updating scraper engines restored
useful search with much less infrastructure. These are dated observations, not
availability guarantees or a roadmap.

## Evidence and method

- Sampled 54 legacy Pi sessions from September 1–5: 70 search outputs, 61 empty,
  nine with results, none marked errors. Legacy ignored `unresponsive_engines`;
  this does **not** prove all 61 empty responses were backend failures.
- Compared July and September SearXNG on the same host, using disposable rootless
  Podman containers, pinned images, fresh settings/cache, and no production
  volumes. Private listeners, strict SSH host checking, bounded experiments.
- Queries covered ordinary research, `"prompt injection" defenses`,
  `prompt injection site:owasp.org`, and Mozilla Readability documentation.
- Checked actual upstream response bodies, error arrays, relevance, and domain
  matches—not just HTTP status or a nonzero result count.
- All experimental containers were removed. Downloaded images remain cached.
  Detailed public-query traces are ignored local artifacts under the
  infrastructure module's `.tmp/`; this note preserves the durable conclusions.

## Findings

| Engine / path | Observed behavior | Interpretation |
| --- | --- | --- |
| July Google | HTTP 200 JavaScript/redirect shell with `enablejs`; no results | An HTTP success was not usable search |
| September Google | `/wml/search`, ten relevant results per comparison query | Engine update fixed the sampled failures |
| DuckDuckGo HTML | HTTP 202, “select all squares containing a duck” CAPTCHA | Not a Cloudflare challenge |
| DuckDuckGo Web | July refinements received JavaScript instead of JSON; September often received HTTP 202 `{}` / parsing errors | Temporary Pi default was not reliable |
| Bing | Nonempty but unrelated exact-phrase results; site filter admitted other domains | Upstream relevance/filter behavior, not Pi formatting |
| September Brave / Startpage | Useful ordinary, exact-phrase, and site-restricted results | Suitable direct alternatives in this sample |
| GitHub | Useful repository discovery, not a general documentation search | Choose repository-shaped queries explicitly |
| Qwant / Mojeek | CAPTCHA; Mojeek sometimes silently parsed HTTP 200 CAPTCHA HTML as empty | Error arrays alone cannot establish health |
| Wikipedia | Summary-endpoint 404 for sampled query strings | Not evidence that every Wikipedia lookup fails |

The August 29 build isolated an important difference: Google already worked,
but Brave returned rate limits and Startpage CAPTCHA. Google's Nokia-UA fix
landed August 22; the September 4 network migration to `curl_cffi` is a plausible
contributor to later improvements, not a fully isolated causal proof.

## Proxy and solver results

**Webshare:** same-host comparison verified a different outbound IP, but did not
improve Google/DDG failures and made working requests slower. This does not prove
all proxy pools are ineffective; it does reject deploying the tested route as
an evidenced fix.

**Trawl:** one browser, no Redis/Webshare/paid solver, private listener, 2 GiB
container limit and 512 MiB shared-memory limit. Readiness took about 11 seconds;
sampled memory was 303–315 MB, **not** peak browser-solve usage.

- HTTPS initially failed certificate validation. The SearXNG image's
  `SSL_CERT_FILE` overrode `outgoing.verify`; a disposable bundle combining
  system roots with Trawl's CA fixed this. TLS verification stayed enabled and
  no workstation/host trust store was changed.
- One DDG HTML request returned ten relevant site-filtered results in 0.92s.
  It did not repeat: traced requests returned CAPTCHA with zero observed
  challenge-escalation/solver-tier log entries. Do not call that first success
  a demonstrated browser solve.
- DDG Web remained broken. Direct HTTP/1.1 controls also failed, so disabling
  HTTP/2 alone was not the explanation. Browser-forced API integration and
  Trawl + Webshare were not tested.

## Managed rollout outcome

On September 6, the operator approved a **24-hour SearXNG-only image hold**;
other OCI targets retain 168 hours. Removed the updater's July-2-only tag rule.
The eligible image selected by the managed updater differed from the initial
September 5 experiment, so it was tested separately before deployment.

| Exact September 6 image, Google + Brave, SafeSearch 1 | Results | Backend seconds | Errors |
| --- | ---: | ---: | --- |
| prompt injection OWASP | 22 | 0.50 | none |
| "prompt injection" defenses | 24 | 0.54 | none |
| prompt injection site:owasp.org | 23 | 0.57 | none |
| Mozilla Readability documentation | 23 | 0.67 | none |

All 23 site-filtered URLs passed the OWASP domain check. Timings exclude Luna.

- Backed up the standalone service using managed service-state tooling, then
  deployed only its public Ansible playbook. Verified the exact image digest,
  HTTP 200, and unchanged secret against the backup. The separate Onclave
  dependency remained on `2026.7.19+6da6eee26` and HTTP 200.
- General defaults are exactly Google + Brave; other upstream engines remain
  available, not removed. Startpage works explicitly. GitHub is available but a
  general prose query can still produce irrelevant repository results.
- Pi now inherits server defaults while preserving explicit `engines`, endpoint
  engine overrides, backend-error reporting, private/local fetching, automatic
  public Jina fallback, and fail-open Luna annotation.
- Four real Pi search → fetch → Luna cases passed: ordinary, exact-phrase,
  site-restricted, and official documentation. Each final search and fetched
  page was screened. An initial exact-phrase check failed its OWASP-only
  top-five expectation; the retained test accepts relevant primary Microsoft,
  OpenAI, or defense-repository sources too and reports returned URLs on failure.
  Ranking is variable; success is not an OWASP rank guarantee.

An existing `just` recipe bug dropped service selectors and briefly changed
unrelated **desired pins**, not deployed services. Those pin changes were
reverted and read back; the recipe gained positional-argument forwarding and a
real CLI regression test. A subsequent scoped update touched no other family.
Lesson: test the public wrapper's argument flow, not just the Python selector.

## Reproduction anchors

- Initially deployed standalone: `2026.7.2+67973783d`.
- September 5 experiment: `2026.9.5+c7f3080aa`,
  `ghcr.io/searxng/searxng@sha256:55e1fa15a63ff04e79e213e6aa2837549877b0c6d60757cdb633ae9111cb5fea`.
- August 29 control: `2026.8.29+d226b78bc`,
  `docker.io/searxng/searxng@sha256:b36af7984b87191b595bc5301418ed6432c047668a4547ab531a7439b816fac3`.
- Deployed after managed update: `2026.9.6+eaf1fcb34`,
  `docker.io/searxng/searxng:2026.9.6-eaf1fcb34@sha256:36941a0b934fcfb61308018641b35ce7dd2967c59f3c43862f01f2ac6e9921d4`.
- Trawl experiment:
  `ghcr.io/germondai/trawl@sha256:9cf6668dc5e7160d739991ca1edfe308c48638696571d9413a18399696586698`.
- Owners: `modules/homelab-infra/scripts/update.py` and its
  `searxng_onramp` Ansible role; Pi's `pi/profiles/default/extensions/web-tools/`.
  Operational inventory, credentials, backups, and private addresses stay out
  of this vault.

## Sources and related notes

- [SearXNG Google Nokia-UA fix](https://github.com/searxng/searxng/commit/a4cb7df053ea)
- [SearXNG curl_cffi migration](https://github.com/searxng/searxng/commit/be836e614a2f)
- [SearXNG engine settings](https://docs.searxng.org/admin/settings/settings_engines.html)
- [Trawl](https://github.com/germondai/trawl)
- [Future search and content-access experiments](../workflow-ideas/web-research-acquisition.md)
- [Historical FlareSolverr acquisition](../workflow-ideas/flaresolverr-content-acquisition.md)

## KISS recommendation

Keep current engines and direct fetching as the baseline. Reproduce a specific
failure before adding a solver, proxy, retry layer, or daemon. Use a few relevant
queries and actual source fetches as smoke tests; preserve counterexamples and
separate HTTP success, relevant results, extraction, and screening quality.
