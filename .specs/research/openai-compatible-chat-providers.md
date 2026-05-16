# OpenAI-Compatible Chat Providers

Implementation research for Go clients targeting OpenAI-compatible chat completions across OpenAI, OpenRouter, and Ollama.

## Summary

- Chat streaming uses SSE `data:` frames with JSON chunks; consume `choices[].delta`, finish on `[DONE]`.
- Standard env defaults should be `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and project-level `OPENAI_MODEL` even though model env var is app convention rather than official OpenAI SDK convention.
- OpenRouter and Ollama are compatible enough for chat completions but need provider-specific defaults, headers, error parsing, and model-list tolerances.

## Sources

| Resource | URL | Notes |
|----------|-----|-------|
| OpenAI Go SDK README | https://github.com/openai/openai-go | Go SDK defaults API key to `OPENAI_API_KEY`; streaming APIs. |
| OpenAI Python SDK README | https://github.com/openai/openai-python | Documents `OPENAI_BASE_URL`; streaming uses SSE. |
| OpenAI Cookbook streaming example | https://github.com/openai/openai-cookbook/blob/main/examples/How_to_stream_completions.ipynb | Chat completions stream as data-only SSE; use `delta`. |
| OpenAI API reference | https://platform.openai.com/docs/api-reference/chat | Canonical chat completions shape. |
| OpenRouter API overview | https://openrouter.ai/docs/api-reference/overview | OpenAI-compatible `/api/v1` API, optional attribution headers. |
| OpenRouter streaming | https://openrouter.ai/docs/api-reference/streaming | SSE streaming details. |
| OpenRouter models | https://openrouter.ai/docs/api-reference/list-available-models | `/models` behavior. |
| OpenRouter errors | https://openrouter.ai/docs/api-reference/errors | Error object/status behavior. |
| Ollama OpenAI compatibility | https://docs.ollama.com/api/openai-compatibility.md | `/v1/chat/completions`, base URL, API key required but ignored. |
| Ollama streaming | https://docs.ollama.com/api/streaming.md | Native API streams NDJSON; OpenAI-compatible endpoint differs. |
| Ollama errors | https://docs.ollama.com/api/errors.md | JSON errors; mid-stream native errors keep status code. |

## Key Findings

1. **SSE parser should be generic**: Parse event-stream lines, concatenate multiline `data:`, ignore comments/empty lines, handle `[DONE]`, and decode OpenAI chat chunk JSON.
2. **Provider config should be explicit but env-friendly**: Resolve `{api_key, base_url, model}` from config, then `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, then provider defaults.
3. **Compatibility is not uniform**: OpenRouter wants `/api/v1`, may use `HTTP-Referer`/`X-Title`; Ollama wants `http://localhost:11434/v1`, API key placeholder, local model names with tags.
4. **Errors/model listing need soft failures**: Parse OpenAI-style `{error:{message,type,code}}`, OpenRouter-style metadata, and Ollama `{error:"..."}`; do not require model-list success for generation.

## Date

Last updated: 2026-05-15
