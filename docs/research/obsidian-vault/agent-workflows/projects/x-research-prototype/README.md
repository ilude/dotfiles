---
status: archived-prototype
source: ../../../../../../.specs/archive/x-research-pipeline/
created: 2026-05-11
archived: 2026-08-26
---

# X research prototype

This directory preserves the local X research experiment that previously lived in the dotfiles root. It is reference material for a future read-only X/Twitter research tool, not an active dotfiles command or supported service.

## What the prototype proved

- A provider-neutral `XClient` protocol can normalize users and paginated results.
- A `twitterapi.io` adapter can map authentication, quota, rate-limit, and temporary failures into explicit domain errors.
- SQLite can retain profiles, tweets, following edges, and completed snapshots for local graph queries.
- A bounded browser-snapshot parser can provide an offline fallback format.
- Private configuration and collected data must remain outside the tracked source tree.

## Snapshot layout

- `src/x_research/` - prototype package and CLI.
- `tests/` - offline unit tests from the experiment.
- `config/x-research-recipients.txt` - empty historical age-recipient template.
- `pyproject.toml` and `uv.lock` - isolated dependency metadata for reproducing the prototype.

## Reproducing the archived tests

From this directory:

```bash
uv run --locked pytest
```

Do not treat a passing test run as proof that the external provider API or its economics remain current. Live credentials, collected data, and private configuration are not archived here.

## What should change before revival

The future design should use the provider and storage boundaries described in the [X research pipeline](../../workflow-ideas/x-research-pipeline.md), rather than promoting this local SQLite prototype unchanged. Re-evaluate provider terms, API schemas, rate limits, credential delivery, account safety, and the durable Menos storage contract first.

## KISS recommendation

Use this code only as implementation reference. Start any future Twitter tooling with one read-only provider slice and mocked fixtures, then add durable storage only after the retrieval contract is proven.
