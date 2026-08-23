# Cache-friendly extension context

This contract covers extension-owned request context and the local cache report.

## Stable request shape

Keep stable system instructions and deterministic immediate-tool order unchanged across ordinary turns. Put changing goal, task, and nested instruction semantics in bounded trailing hidden custom context. Each owner has one replaceable message; a new semantic value supersedes the old value rather than adding another copy.

Provider-supported deferred tools may be searchable without changing the immediate tool prefix. This is an optimization, not an authority mechanism. State-gated and workflow-gated tools remain unavailable until their owner activates them, even when that creates a cache boundary. Intentional tool, authority, compaction, resume, reload, fork, cwd, and instruction changes are valid request-shape transitions.

## Metrics and reporting

The `openai-codex` request boundary records one metadata-only `prompt_cache_request` event per completed assistant response. It includes model, request-shape change flags, and normalized provider usage fields: `input`, `cacheRead`, and `cacheWrite`. A provider omission is recorded as `unavailable`, not zero. Metrics do not contain prompts, tool schemas, arguments, output, or quota attribution.

`/usage` reads a bounded recent metrics window directly and deduplicates by the existing event ID and session/message identity. It reports usage coverage, token totals, cache-read share as `cacheRead / (input + cacheRead + cacheWrite)` for complete usage records, stable/context-change/immediate-tool-change counts, and multiple models only when present. It does not scan raw transcripts, merge Codex CLI history, build an analytics database, or claim that a request caused subscription-limit changes.

## Compaction

Compaction and session reconstruction must restore current replaceable context once. They may produce a cache miss because the request shape changed; the extension must not preserve stale context merely to avoid that boundary.
