---
status: research-note
source: git commit 2fd7d38fc14dafc9049e7142c2ac9efc91469ca1
---

# FlareSolverr content acquisition

## Why this matters

The dotfiles history contains a working FlareSolverr MCP prototype that could inform a content-acquisition stage in a larger research system. It solved Cloudflare challenges, extracted article text, and paginated large responses before handing content to an agent.

This is historical evidence and a reusable design reference, not a proposal to restore the old implementation unchanged.

## Historical implementation

Commit `2fd7d38fc14dafc9049e7142c2ac9efc91469ca1` added the prototype under:

```text
.claude/tools/flaresolverr-mcp/
```

Important files in that commit:

- `server.py` - MCP wrapper around the FlareSolverr HTTP API.
- `README.md` - setup, tool schema, extraction, and pagination examples.
- `SESSION_SNAPSHOT.md` - design history and intended upstream contribution.
- `LESSONS.md` and `PR_PREP.md` - test findings and packaging notes.
- `docker-compose.yml` and `test_flaresolverr.py` - local service and connectivity test.

The tracked source was removed in commit `7b590b2964ef5b9d0c8012ea295070b9eb4d1d1d`. Auto-configuration survived temporarily and was removed in `7a0d244f8a5d74a9024ea0927d9f47251dd2262a`.

Inspect a historical file without restoring it:

```bash
git show 2fd7d38fc14dafc9049e7142c2ac9efc91469ca1:.claude/tools/flaresolverr-mcp/README.md
```

## Useful signals

The prototype exposed a `fetch_url` tool with:

- Cloudflare challenge handling through a local FlareSolverr container.
- Main-content extraction through Mozilla Readability and BeautifulSoup.
- Removal of scripts, styles, navigation, headers, and footers.
- Output modes for extracted text, full HTML, and metadata.
- Token-aware truncation and pagination with continuation tokens.
- A short-lived per-session cache and cookie reuse.
- Explicit session creation and destruction.

The documentation repeatedly used `https://archive.ph/17bPN` as a large-article pagination test. No Medium-specific adapter, URL rewriting, or explicit paywall-bypass feature was found. Later vault sources contain Medium links, but they are ordinary research references rather than part of this implementation.

## Possible larger-system fit

Treat FlareSolverr as one optional acquisition adapter rather than the whole content pipeline:

```text
URL intake
  -> source policy and access check
  -> cheapest suitable fetcher
  -> optional browser or FlareSolverr fallback
  -> content extraction and normalization
  -> provenance and retrieval receipt
  -> deduplication, storage, search, and synthesis
```

A useful normalized result would preserve:

- Requested URL and final URL.
- Retrieval timestamp and adapter used.
- HTTP or FlareSolverr status.
- Page title and extracted text.
- Content hash and pagination state.
- Archive URL when the input was already an archive.
- Failure reason instead of silently substituting unrelated content.

This could feed [Menos](../projects/menos.md) as a durable content and search backend while Pi remains the operator-facing workflow layer.

## Boundaries and risks

- Cloudflare challenge handling is not the same as defeating a subscription paywall. Do not describe the prototype as a general paywall bypass.
- Retrieval must respect authorization, applicable terms, robots policy where relevant, copyright, and source-specific access constraints.
- FlareSolverr adds a browser container, latency, resource use, and maintenance surface.
- Readability extraction can omit interactive, tabular, or dynamically loaded content.
- The historical token estimate was a rough character-count heuristic.
- Cached cookies and fetched content need explicit retention and secret-handling rules.
- Archive services have separate provenance and freshness concerns and should not silently replace the canonical source.

## KISS recommendation

Keep this as a fallback design reference. If content gathering becomes a repeated need, first define one normalized retrieval receipt and test a thin fetch sequence against a small set of permitted public pages. Add FlareSolverr only for sources where ordinary HTTP and the existing browser tooling demonstrably fail.

## Related notes

- [Browser-use browser harness](../projects/browser-use-browser-harness.md)
- [Menos](../projects/menos.md)
- [Menos research storage](../projects/menos-research-storage.md)
- [X research pipeline](x-research-pipeline.md)
- [Pipelines and policies](pipelines-and-policies.md)
