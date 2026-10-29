# Capability observations

Read this when deciding whether a capability has actually been tested locally or diagnosing a related failure. These dated observations are not permanent provider guarantees, account entitlements, or a mandatory smoke-test checklist.

Observed in this setup on 2026-10-29:

| Capability | Evidence | Limit |
| --- | --- | --- |
| Browserbase authentication | Project listing succeeded with the BWS-stored key. | Does not verify browser interaction or every API. |
| Browserbase public browser/screenshot | Google Images navigation succeeded; viewport PNG and full-page JPEG were saved under `.tmp/browserbase-google/`. The owned session was stopped. | Full-page PNG hit a CLI stack-size error; JPEG succeeded. Artifacts are temporary and may no longer exist. |
| Firecrawl scrape | Example Domain returned `success: true`, page status 200, the expected metadata title, and nonempty documentation-example Markdown. | Does not verify arbitrary sites or formats. |
| Firecrawl web search | A Project Zomboid player-animation query returned five web results. | Returned source contents were not independently verified; the response was not saved to a file. |
| Firecrawl Google Images screenshot scrape | Request returned `SCRAPE_ALL_ENGINES_FAILED`; no screenshot was saved. | Exact cause was not established. This does not show that Firecrawl search fails. |
| Firecrawl image search, map, crawl | Documented capability only. | Not live-tested here. |

Keep new observations capability-specific. Do not rerun paid requests merely to refresh this reference.
