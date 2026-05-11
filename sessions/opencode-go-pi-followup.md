## Findings

- Article: **“OpenCode Go + pi-coding-agent のすゝめ”** by @_kimuson on Zenn  
  - Japanese: https://zenn.dev/kimuson/articles/pi-coding-agent-with-opencode-go  
  - English locale: https://zenn.dev/kimuson/articles/pi-coding-agent-with-opencode-go?locale=en

## Key points

- **Main thesis:** open models + vendor-independent coding agents are becoming attractive because Claude/Codex subscriptions are increasingly constrained, while hosted open models are cheaper and improving quickly.
- **OpenCode Go positioning:** @_kimuson frames OpenCode Go as a very cost-effective “open model subscription” — roughly `$10/mo` after first month — with enough token budget to feel comparable to heavy `$100/mo` Claude/Codex usage, depending on model choice.
- **Why Pi specifically:** they like `pi-coding-agent` because it is minimal, provider-agnostic, and extension/skill-driven. They argue Pi’s smaller concept surface works better with non-Anthropic/open models than Claude Code’s richer, Anthropic-optimized harness.

## Usage patterns relevant to Pi / OpenCode Go

- **Model routing/fallbacks:** they built/used a Pi extension adding `--fallback-models`, e.g. primary Codex/OpenCode model plus fallback on rate limits.
- **Delegation without built-in subagents:** they treat subagents as “spawn another `pi` with a skill prompt,” e.g. `pi ... -p '/skill:quality-assure <task>'`.
- **Suggested model tiers:**
  - High: `openai-codex/gpt-5.5` with `opencode-go/kimi-k2.6` fallback.
  - Medium: `opencode-go/deepseek-v4-pro` with Codex fallbacks.
  - Low/summarization: `opencode-go/deepseek-v4-flash`.
- **Missing web tools workaround:** use Jina AI `r.jina.ai` for fetch and `s.jina.ai` or delegated Codex for search.
- **Sandboxing:** because Pi intentionally lacks permission popups, they run it under `srt` / Anthropic Sandbox Runtime with allow/deny rules.

## Outside feedback / caveats

- I found and read the Zenn article directly, but did **not** find reliable indexed X replies or discussion around the post via web search.
- The article’s token/cost tables are partly author-calculated from OpenCode docs/estimates, so treat exact equivalence claims as directional, not guaranteed.
- Some model names/prices/rate limits may change quickly; verify against current OpenCode Go docs before acting.

## Actionable follow-ups

- Consider documenting an official/example **OpenCode Go + Pi model-routing recipe**, especially fallback patterns.
- Evaluate whether Pi should ship or recommend a lightweight **fallback-model extension**.
- Add docs for **safe sandboxing patterns** since external users notice Pi’s no-permission-popup philosophy.
- Consider first-class docs/examples for **“subagents via spawned Pi + skills”** and **web fetch/search via CLI tools**.